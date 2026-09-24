import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('book_note', (table) => {
    table.increments('id').primary();
    table.string('book_md5', 32).notNullable();
    table.text('text').notNullable();
    table.timestamps(true, true); // created_at, updated_at

    // Web-only notes: never written by KoReader sync
    table.foreign('book_md5').references('book.md5').onDelete('CASCADE');
    table.index('book_md5');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('book_note');
}
