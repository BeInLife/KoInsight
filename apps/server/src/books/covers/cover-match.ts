// Strict title + author matching for automatic cover lookup.
// Only case, accents, punctuation and whitespace are ignored; author name order is ignored
// ("Bulgakov, Mikhail" matches "Mikhail Bulgakov"). Everything else must match exactly.

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normalizeTitle(title: string) {
  return normalize(title);
}

export function normalizeAuthor(author: string) {
  return normalize(author).split(' ').filter(Boolean).sort().join(' ');
}

/** KOReader stores multiple authors separated by newlines, "N/A" when unknown. */
export function splitAuthors(authors: string | null | undefined): string[] {
  return (authors ?? '')
    .split(/\n|;/)
    .map((author) => author.trim())
    .filter((author) => author && author.toUpperCase() !== 'N/A');
}

export function isSearchable(book: { title: string; authors: string }) {
  return normalizeTitle(book.title ?? '') !== '' && splitAuthors(book.authors).length > 0;
}

/**
 * A candidate matches when one of its titles equals the book title and every book author
 * appears among the candidate's authors (extra candidate authors, e.g. translators, are allowed).
 */
export function isExactMatch(
  book: { title: string; authors: string },
  candidate: { titles: string[]; authors: string[] }
) {
  if (!isSearchable(book)) {
    return false;
  }

  const title = normalizeTitle(book.title);
  if (!candidate.titles.some((candidateTitle) => normalizeTitle(candidateTitle) === title)) {
    return false;
  }

  const candidateAuthors = new Set(candidate.authors.map(normalizeAuthor).filter(Boolean));
  return splitAuthors(book.authors).every((author) =>
    candidateAuthors.has(normalizeAuthor(author))
  );
}
