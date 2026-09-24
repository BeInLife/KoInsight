import { Book } from '@koinsight/common/types';
import { existsSync, mkdirSync, promises } from 'fs';
import path from 'path';
import { appConfig } from '../../config';
import { BooksRepository } from '../books-repository';
import { isExactMatch, isSearchable, splitAuthors } from './cover-match';

type CoverCandidate = { source: string; imageUrl: string };

const USER_AGENT = 'KoInsight cover lookup (https://github.com/BeInLife/KoInsight)';
const REQUEST_TIMEOUT_MS = 15_000;
const DELAY_BETWEEN_BOOKS_MS = 1_000;
// Books without a match are retried after this long (per server process)
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json() as Promise<T>;
}

type OpenLibraryDoc = {
  title?: string;
  subtitle?: string;
  author_name?: string[];
  // Other recorded names of the same authors, e.g. without patronymic
  author_alternative_name?: string[];
  cover_i?: number;
};

async function findOnOpenLibrary(book: Book): Promise<CoverCandidate | null> {
  const params = new URLSearchParams({
    title: book.title,
    author: splitAuthors(book.authors)[0],
    fields: 'title,subtitle,author_name,author_alternative_name,cover_i',
    limit: '20',
  });
  const result = await getJson<{ docs?: OpenLibraryDoc[] }>(
    `https://openlibrary.org/search.json?${params}`
  );

  const match = (result.docs ?? []).find(
    (doc) =>
      doc.cover_i &&
      doc.title &&
      isExactMatch(book, {
        titles: [doc.title, doc.subtitle ? `${doc.title}: ${doc.subtitle}` : ''],
        authors: [...(doc.author_name ?? []), ...(doc.author_alternative_name ?? [])],
      })
  );

  return match
    ? {
        source: 'Open Library',
        imageUrl: `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg?default=false`,
      }
    : null;
}

type GoogleImageLinks = Partial<
  Record<'extraLarge' | 'large' | 'medium' | 'small' | 'thumbnail', string>
>;
type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    imageLinks?: GoogleImageLinks;
  };
};

function bestGoogleImage(links: GoogleImageLinks | undefined) {
  const url =
    links?.extraLarge ?? links?.large ?? links?.medium ?? links?.small ?? links?.thumbnail;
  return url?.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

async function findOnGoogleBooks(book: Book, apiKey: string): Promise<CoverCandidate | null> {
  const params = new URLSearchParams({
    q: `intitle:"${book.title}" inauthor:"${splitAuthors(book.authors)[0]}"`,
    maxResults: '20',
    key: apiKey,
  });
  const result = await getJson<{ items?: GoogleVolume[] }>(
    `https://www.googleapis.com/books/v1/volumes?${params}`
  );

  const match = (result.items ?? []).find(
    ({ volumeInfo: info }) =>
      info?.imageLinks &&
      info.title &&
      isExactMatch(book, {
        titles: [info.title, info.subtitle ? `${info.title}: ${info.subtitle}` : ''],
        authors: info.authors ?? [],
      })
  );
  if (!match) {
    return null;
  }

  // Search results only include thumbnails; the volume itself has larger images
  const volume = await getJson<GoogleVolume>(
    `https://www.googleapis.com/books/v1/volumes/${match.id}?key=${encodeURIComponent(apiKey)}`
  ).catch(() => match);
  const imageUrl =
    bestGoogleImage(volume.volumeInfo?.imageLinks) ??
    bestGoogleImage(match.volumeInfo?.imageLinks);

  return imageUrl ? { source: 'Google Books', imageUrl } : null;
}

async function downloadImage(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.startsWith('image/')) {
    return null;
  }

  const data = Buffer.from(await response.arrayBuffer());
  // Skip tiny placeholder images
  if (data.length < 1024) {
    return null;
  }

  const extension = contentType.includes('png') ? '.png' : '.jpg';
  return { data, extension };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CoverLookupService {
  private static lastChecked = new Map<string, number>();
  private static running = false;
  private static rerunRequested = false;

  /** Finds a cover for a book whose title and authors match exactly, or null. */
  static async findCover(
    book: Book,
    googleBooksApiKey = appConfig.coverLookup.googleBooksApiKey
  ): Promise<CoverCandidate | null> {
    if (!isSearchable(book)) {
      return null;
    }

    const sources = [() => findOnOpenLibrary(book)];
    if (googleBooksApiKey) {
      sources.push(() => findOnGoogleBooks(book, googleBooksApiKey));
    }

    for (const source of sources) {
      try {
        const candidate = await source();
        if (candidate) {
          return candidate;
        }
      } catch (error) {
        console.warn(`[cover lookup] Search failed for "${book.title}":`, error);
      }
    }

    return null;
  }

  /**
   * Looks up covers for all books without one, in the background. Safe to call often:
   * concurrent calls are coalesced and recently checked books are skipped.
   */
  static lookupMissing() {
    if (!appConfig.coverLookup.enabled) {
      return;
    }
    if (this.running) {
      this.rerunRequested = true;
      return;
    }

    this.running = true;
    this.processMissing()
      .catch((error) => console.error('[cover lookup] Failed:', error))
      .finally(() => {
        this.running = false;
        if (this.rerunRequested) {
          this.rerunRequested = false;
          this.lookupMissing();
        }
      });
  }

  private static async processMissing() {
    if (!existsSync(appConfig.coversPath)) {
      mkdirSync(appConfig.coversPath, { recursive: true });
    }

    const existingCovers = new Set(
      (await promises.readdir(appConfig.coversPath)).map((file) => path.parse(file).name)
    );
    const now = Date.now();
    const books = (await BooksRepository.getAll()).filter(
      (book) =>
        !existingCovers.has(book.md5) &&
        isSearchable(book) &&
        now - (this.lastChecked.get(book.md5) ?? 0) > RETRY_AFTER_MS
    );

    if (books.length > 0) {
      console.info(`[cover lookup] Looking up covers for ${books.length} books`);
    }

    for (const book of books) {
      this.lastChecked.set(book.md5, Date.now());

      const candidate = await this.findCover(book);
      const image = candidate ? await downloadImage(candidate.imageUrl).catch(() => null) : null;

      // A cover may have been uploaded manually in the meantime
      const hasCoverNow = (await promises.readdir(appConfig.coversPath)).some(
        (file) => path.parse(file).name === book.md5
      );

      if (candidate && image && !hasCoverNow) {
        await promises.writeFile(
          path.join(appConfig.coversPath, `${book.md5}${image.extension}`),
          image.data
        );
        console.info(`[cover lookup] Saved cover for "${book.title}" from ${candidate.source}`);
      } else if (!hasCoverNow) {
        console.info(`[cover lookup] No exact match for "${book.title}"`);
      }

      await sleep(DELAY_BETWEEN_BOOKS_MS);
    }
  }
}
