import { isExactMatch, isSearchable, normalizeAuthor, splitAuthors } from './cover-match';

describe('cover-match', () => {
  const book = { title: 'Мастер и Маргарита', authors: 'Михаил Булгаков' };

  it('matches identical title and author', () => {
    expect(
      isExactMatch(book, { titles: ['Мастер и Маргарита'], authors: ['Михаил Булгаков'] })
    ).toBe(true);
  });

  it('ignores case, punctuation, accents and author name order', () => {
    expect(
      isExactMatch(
        { title: 'Cien años de soledad', authors: 'García Márquez, Gabriel' },
        { titles: ['CIEN AÑOS DE SOLEDAD.'], authors: ['Gabriel Garcia Marquez'] }
      )
    ).toBe(true);
    expect(normalizeAuthor('J.R.R. Tolkien')).toBe(normalizeAuthor('J. R. R. Tolkien'));
  });

  it('rejects a different title', () => {
    expect(
      isExactMatch(book, { titles: ['Мастер и Маргарита (сборник)'], authors: ['Михаил Булгаков'] })
    ).toBe(false);
  });

  it('rejects a different author', () => {
    expect(
      isExactMatch(book, { titles: ['Мастер и Маргарита'], authors: ['Mikhail Bulgakov'] })
    ).toBe(false);
    expect(isExactMatch(book, { titles: ['Мастер и Маргарита'], authors: [] })).toBe(false);
  });

  it('requires every book author but allows extra candidate authors', () => {
    const twoAuthors = { title: 'Good Omens', authors: 'Terry Pratchett\nNeil Gaiman' };
    expect(
      isExactMatch(twoAuthors, {
        titles: ['Good Omens'],
        authors: ['Neil Gaiman', 'Terry Pratchett', 'Some Translator'],
      })
    ).toBe(true);
    expect(isExactMatch(twoAuthors, { titles: ['Good Omens'], authors: ['Terry Pratchett'] })).toBe(
      false
    );
  });

  it('matches any of the candidate titles, e.g. title with subtitle', () => {
    expect(
      isExactMatch(
        { title: 'Sapiens: A Brief History of Humankind', authors: 'Yuval Noah Harari' },
        {
          titles: ['Sapiens', 'Sapiens: A Brief History of Humankind'],
          authors: ['Yuval Noah Harari'],
        }
      )
    ).toBe(true);
  });

  it('never matches books with unknown author or empty title', () => {
    expect(splitAuthors('N/A')).toEqual([]);
    expect(isSearchable({ title: 'Some Book', authors: 'N/A' })).toBe(false);
    expect(isSearchable({ title: '  ', authors: 'Someone' })).toBe(false);
    expect(
      isExactMatch({ title: 'Some Book', authors: 'N/A' }, { titles: ['Some Book'], authors: [] })
    ).toBe(false);
  });
});
