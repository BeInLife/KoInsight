import { Book, BookNote } from '@koinsight/common/types';
import { db } from '../knex';

export class BookNotesRepository {
  static async getByBookMd5(md5: Book['md5']): Promise<BookNote[]> {
    return db<BookNote>('book_note')
      .where({ book_md5: md5 })
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  }

  static async getById(id: BookNote['id']): Promise<BookNote | undefined> {
    return db<BookNote>('book_note').where({ id }).first();
  }

  static async insert(md5: Book['md5'], text: string): Promise<BookNote> {
    const [note] = await db<BookNote>('book_note').insert({ book_md5: md5, text }).returning('*');
    return note;
  }

  static async update(id: BookNote['id'], text: string): Promise<BookNote> {
    const [note] = await db<BookNote>('book_note')
      .where({ id })
      .update({ text, updated_at: db.fn.now() as unknown as string })
      .returning('*');
    return note;
  }

  static async delete(id: BookNote['id']): Promise<number> {
    return db('book_note').where({ id }).delete();
  }
}
