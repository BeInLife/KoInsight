import express from 'express';
import request from 'supertest';
import { BooksRepository } from '../books/books-repository';
import { booksRouter } from '../books/books-router';
import { createBook } from '../db/factories/book-factory';
import { db } from '../knex';
import { BookNotesRepository } from './book-notes-repository';

describe('book-notes-router', () => {
  const app = express();
  app.use(express.json());
  app.use('/books', booksRouter);

  it('adds, lists, edits and deletes notes', async () => {
    const book = await createBook(db);

    const created = await request(app)
      .post(`/books/${book.id}/notes`)
      .send({ text: '  Great ending  ' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual(
      expect.objectContaining({ book_md5: book.md5, text: 'Great ending' })
    );

    const list = await request(app).get(`/books/${book.id}/notes`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const edited = await request(app)
      .patch(`/books/${book.id}/notes/${created.body.id}`)
      .send({ text: 'Actually, a weak ending' });
    expect(edited.status).toBe(200);
    expect(edited.body.text).toBe('Actually, a weak ending');

    const deleted = await request(app).delete(`/books/${book.id}/notes/${created.body.id}`);
    expect(deleted.status).toBe(200);
    expect(await BookNotesRepository.getByBookMd5(book.md5)).toHaveLength(0);
  });

  it('lists notes newest first', async () => {
    const book = await createBook(db);
    await request(app).post(`/books/${book.id}/notes`).send({ text: 'first' });
    await request(app).post(`/books/${book.id}/notes`).send({ text: 'second' });

    const list = await request(app).get(`/books/${book.id}/notes`);
    expect(list.body.map((n: { text: string }) => n.text)).toEqual(['second', 'first']);
  });

  it('rejects empty text', async () => {
    const book = await createBook(db);

    const response = await request(app).post(`/books/${book.id}/notes`).send({ text: '   ' });
    expect(response.status).toBe(400);
  });

  it('returns 404 for a note that belongs to another book', async () => {
    const book = await createBook(db);
    const otherBook = await createBook(db);
    const note = await BookNotesRepository.insert(otherBook.md5, 'not yours');

    const response = await request(app)
      .patch(`/books/${book.id}/notes/${note.id}`)
      .send({ text: 'x' });
    expect(response.status).toBe(404);

    const deleteResponse = await request(app).delete(`/books/${book.id}/notes/${note.id}`);
    expect(deleteResponse.status).toBe(404);
  });

  it('returns 404 for an unknown book', async () => {
    const response = await request(app).get('/books/9999/notes');
    expect(response.status).toBe(404);
  });

  it('removes notes when the book is deleted', async () => {
    const book = await createBook(db);
    await BookNotesRepository.insert(book.md5, 'gone with the book');

    await BooksRepository.delete(book);

    expect(await BookNotesRepository.getByBookMd5(book.md5)).toHaveLength(0);
  });
});
