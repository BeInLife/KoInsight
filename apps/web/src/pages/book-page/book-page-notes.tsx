import { Book, BookNote } from '@koinsight/common/types';
import { ActionIcon, Button, Group, Paper, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { format } from 'date-fns';
import { JSX, useState } from 'react';
import { addBookNote, deleteBookNote, updateBookNote, useBookNotes } from '../../api/book-notes';

type BookPageNotesProps = {
  book: Book;
};

function showError(title: string) {
  notifications.show({ title, message: '', color: 'red', position: 'top-center' });
}

export function BookPageNotes({ book }: BookPageNotesProps): JSX.Element {
  const { data: notes, mutate } = useBookNotes(book.id);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const onAdd = async () => {
    try {
      setSaving(true);
      await addBookNote(book.id, draft);
      setDraft('');
      await mutate();
    } catch (error) {
      showError('Failed to add note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Textarea
          placeholder="Write a note about this book…"
          autosize
          minRows={3}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.trim()) onAdd();
          }}
        />
        <Group justify="flex-end">
          <Button onClick={onAdd} loading={saving} disabled={!draft.trim()}>
            Add note
          </Button>
        </Group>
      </Stack>

      {notes.length === 0 ? (
        <Text c="dimmed" size="sm" ta="center">
          No notes yet. Notes you add here stay on this server and are not changed by KOReader
          syncs.
        </Text>
      ) : (
        notes.map((note) => (
          <BookNoteCard key={note.id} bookId={book.id} note={note} onChange={() => mutate()} />
        ))
      )}
    </Stack>
  );
}

type BookNoteCardProps = {
  bookId: Book['id'];
  note: BookNote;
  onChange: () => void;
};

function BookNoteCard({ bookId, note, onChange }: BookNoteCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    try {
      setSaving(true);
      await updateBookNote(bookId, note.id, text);
      setEditing(false);
      onChange();
    } catch (error) {
      showError('Failed to update note');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this note?')) return;

    try {
      await deleteBookNote(bookId, note.id);
      onChange();
    } catch (error) {
      showError('Failed to delete note');
    }
  };

  // SQLite stores UTC timestamps as "YYYY-MM-DD HH:MM:SS" without a zone marker
  const formatTimestamp = (timestamp: string) =>
    format(new Date(`${timestamp.replace(' ', 'T')}Z`), 'dd MMM yyyy, HH:mm');

  const edited = note.updated_at !== note.created_at;

  return (
    <Paper withBorder p="md" radius="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {formatTimestamp(note.created_at)}
            {edited && ` · edited ${formatTimestamp(note.updated_at)}`}
          </Text>
          {!editing && (
            <Group gap={4}>
              <Tooltip label="Edit">
                <ActionIcon variant="subtle" color="gray" onClick={() => setEditing(true)}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Delete">
                <ActionIcon variant="subtle" color="red" onClick={onDelete}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>

        {editing ? (
          <>
            <Textarea
              autosize
              minRows={3}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => {
                  setText(note.text);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={onSave} loading={saving} disabled={!text.trim()}>
                Save
              </Button>
            </Group>
          </>
        ) : (
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {note.text}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
