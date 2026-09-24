import { Book } from '@koinsight/common/types';
import { CoverLookupService } from './cover-lookup-service';

const book = { id: 1, md5: 'abc', title: 'Dune', authors: 'Frank Herbert' } as Book;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

describe('CoverLookupService.findCover', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the Open Library cover of the first exact match', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        docs: [
          { title: 'Dune Messiah', author_name: ['Frank Herbert'], cover_i: 1 },
          { title: 'Dune', author_name: ['Frank Herbert'] }, // no cover
          { title: 'Dune', author_name: ['Brian Herbert'], cover_i: 2 },
          { title: 'Dune', author_name: ['Frank Herbert'], cover_i: 3 },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const cover = await CoverLookupService.findCover(book, undefined);

    expect(cover).toEqual({
      source: 'Open Library',
      imageUrl: 'https://covers.openlibrary.org/b/id/3-L.jpg?default=false',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('matches Open Library alternative author names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          docs: [
            {
              title: 'Мастер и Маргарита',
              author_name: ['Михаил Афанасьевич Булгаков'],
              author_alternative_name: ['Михаил Булгаков'],
              cover_i: 7,
            },
          ],
        })
      )
    );

    const cover = await CoverLookupService.findCover(
      { ...book, title: 'Мастер и Маргарита', authors: 'Михаил Булгаков' },
      undefined
    );

    expect(cover?.imageUrl).toContain('/7-L.jpg');
  });

  it('falls back to Google Books when configured', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ docs: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'vol1',
              volumeInfo: {
                title: 'Dune',
                authors: ['Frank Herbert'],
                imageLinks: { thumbnail: 'http://books.google.com/thumb&edge=curl' },
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'vol1',
          volumeInfo: { imageLinks: { large: 'http://books.google.com/large&edge=curl' } },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const cover = await CoverLookupService.findCover(book, 'key');

    expect(cover).toEqual({ source: 'Google Books', imageUrl: 'https://books.google.com/large' });
  });

  it('returns null without querying when the book has no known author', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const cover = await CoverLookupService.findCover({ ...book, authors: 'N/A' }, 'key');

    expect(cover).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when searches fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await CoverLookupService.findCover(book, 'key')).toBeNull();
  });
});
