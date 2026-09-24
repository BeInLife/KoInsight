import { Book, BookNote } from '@koinsight/common/types';
import useSWR from 'swr';
import { fetchFromAPI } from './api';

export function useBookNotes(bookId: Book['id']) {
  return useSWR(`books/${bookId}/notes`, () => fetchFromAPI<BookNote[]>(`books/${bookId}/notes`), {
    fallbackData: [],
  });
}

export async function addBookNote(bookId: Book['id'], text: string) {
  return fetchFromAPI<BookNote>(`books/${bookId}/notes`, 'POST', { text });
}

export async function updateBookNote(bookId: Book['id'], noteId: BookNote['id'], text: string) {
  return fetchFromAPI<BookNote>(`books/${bookId}/notes/${noteId}`, 'PATCH', { text });
}

export async function deleteBookNote(bookId: Book['id'], noteId: BookNote['id']) {
  return fetchFromAPI<{ message: string }>(`books/${bookId}/notes/${noteId}`, 'DELETE');
}
