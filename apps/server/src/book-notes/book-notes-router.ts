import { NextFunction, Request, Response, Router } from 'express';
import { getBookById } from '../books/get-book-by-id-middleware';
import { BookNotesRepository } from './book-notes-repository';

const router = Router({ mergeParams: true });

function parseText(body: Request['body']): string | null {
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  return text.length > 0 ? text : null;
}

/**
 * Loads the note from :noteId and checks it belongs to the book
 */
async function getNoteForBook(req: Request, res: Response, next: NextFunction) {
  const note = await BookNotesRepository.getById(Number(req.params.noteId));

  if (!note || note.book_md5 !== req.book!.md5) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  res.locals.note = note;
  next();
}

/**
 * Get all notes for a book, newest first
 */
router.get('/', getBookById, async (req: Request, res: Response) => {
  const notes = await BookNotesRepository.getByBookMd5(req.book!.md5);
  res.status(200).json(notes);
});

/**
 * Add a note to a book
 */
router.post('/', getBookById, async (req: Request, res: Response) => {
  const text = parseText(req.body);

  if (!text) {
    res.status(400).json({ error: 'Note text is required' });
    return;
  }

  try {
    const note = await BookNotesRepository.insert(req.book!.md5, text);
    res.status(201).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

/**
 * Edit a note's text
 */
router.patch('/:noteId', getBookById, getNoteForBook, async (req: Request, res: Response) => {
  const text = parseText(req.body);

  if (!text) {
    res.status(400).json({ error: 'Note text is required' });
    return;
  }

  try {
    const note = await BookNotesRepository.update(res.locals.note.id, text);
    res.status(200).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

/**
 * Delete a note
 */
router.delete('/:noteId', getBookById, getNoteForBook, async (req: Request, res: Response) => {
  try {
    await BookNotesRepository.delete(res.locals.note.id);
    res.status(200).json({ message: 'Note deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

export { router as bookNotesRouter };
