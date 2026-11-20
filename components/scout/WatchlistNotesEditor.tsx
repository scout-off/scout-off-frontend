'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WatchlistEntry } from '@/types';

const NOTE_MAX = 1000;
const TAGS_MAX = 10;
const TAG_MAX = 32;

interface Props {
  entry: WatchlistEntry;
  onSave: (id: number, note: string, tags: string[]) => Promise<void>;
}

/**
 * Inline editor for a scout's private note and tags on a watchlist entry
 * (issue #1716). Values are rendered as plain text only, never HTML.
 */
export default function WatchlistNotesEditor({ entry, onSave }: Props) {
  const t = useTranslations('watchlist_notes');
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(entry.note);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const tag = tagInput.trim().slice(0, TAG_MAX);
    if (tag && !tags.includes(tag) && tags.length < TAGS_MAX) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const save = async (nextNote: string, nextTags: string[]) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(entry.id, nextNote, nextTags);
      setEditing(false);
    } catch {
      setError(t('save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div
        className="flex flex-col gap-2 text-sm"
        data-testid="watchlist-notes"
      >
        {entry.note ? (
          <p className="whitespace-pre-wrap break-words text-gray-300">
            {entry.note}
          </p>
        ) : (
          <p className="text-gray-500">{t('no_note')}</p>
        )}
        {entry.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-200"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => {
            setNote(entry.note);
            setTags(entry.tags);
            setEditing(true);
          }}
          className="self-start text-xs text-blue-400 hover:underline"
        >
          {t('edit')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1 text-gray-400">
        {t('note_label')}
        <textarea
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="rounded bg-gray-800 p-2 text-white"
        />
        <span className="text-xs text-gray-500">
          {t('note_counter', { count: note.length, max: NOTE_MAX })}
        </span>
      </label>
      <ul className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <li
            key={tag}
            className="flex items-center gap-1 rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-200"
          >
            {tag}
            <button
              type="button"
              aria-label={t('remove_tag', { tag })}
              onClick={() => setTags(tags.filter((x) => x !== tag))}
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
      <input
        value={tagInput}
        maxLength={TAG_MAX}
        disabled={tags.length >= TAGS_MAX}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder={t('tag_placeholder')}
        aria-label={t('tag_placeholder')}
        className="rounded bg-gray-800 p-2 text-white"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => save(note, tags)}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
        >
          {t('save')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save('', [])}
          className="rounded bg-gray-700 px-3 py-1 text-white disabled:opacity-50"
        >
          {t('clear')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setEditing(false)}
          className="px-3 py-1 text-gray-400"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
