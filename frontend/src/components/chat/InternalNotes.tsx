'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { notes } from '@/lib/api';
import { InternalNote } from '@/types';
import {
  StickyNote,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';
import BottomSheet from '@/components/ui/BottomSheet';

interface InternalNotesProps {
  conversationId: string;
  onClose: () => void;
}

export default function InternalNotes({ conversationId, onClose }: InternalNotesProps) {
  const { token } = useAuth();
  const [notesList, setNotesList] = useState<InternalNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!token || !conversationId) return;
    loadNotes();
  }, [token, conversationId]);

  const loadNotes = async () => {
    try {
      const { notes: fetchedNotes } = await notes.list(token!, conversationId);
      setNotesList(fetchedNotes || []);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newNote.trim()) return;

    try {
      await notes.create(token!, conversationId, newNote);
      setNewNote('');
      setIsAdding(false);
      loadNotes();
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;

    try {
      await notes.update(token!, id, editContent);
      setEditingId(null);
      setEditContent('');
      loadNotes();
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;

    try {
      await notes.delete(token!, id);
      loadNotes();
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const startEdit = (note: InternalNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  // Shared content for both mobile and desktop
  const notesContent = (
    <>
      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="text-center text-gray-500 py-4">Loading...</div>
        ) : notesList.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <StickyNote className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No internal notes yet</p>
          </div>
        ) : (
          notesList.map((note) => (
            <div
              key={note.id}
              className="bg-yellow-50 rounded-lg p-3 border border-yellow-200"
            >
              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full border border-gray-300 rounded p-2 text-sm resize-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded active:bg-gray-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleUpdate(note.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded active:bg-green-100"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                      <span>{note.agent_name || 'Agent'}</span>
                      <span className="mx-1">•</span>
                      <span>{format(new Date(note.created_at), 'MMM d, HH:mm')}</span>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => startEdit(note)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-yellow-100 rounded active:bg-yellow-200"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded active:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Note */}
      <div className="p-4 border-t border-gray-200 bg-white">
        {isAdding ? (
          <div className="space-y-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Write an internal note..."
              className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewNote('');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 active:bg-yellow-700"
              >
                Add Note
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center space-x-2 py-3 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-yellow-400 hover:text-yellow-600 active:bg-yellow-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm">Add Note</span>
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Bottom Sheet */}
      <BottomSheet
        isOpen={true}
        onClose={onClose}
        title="Internal Notes"
        icon={<StickyNote className="h-5 w-5 text-yellow-500" />}
        badge={notesList.length}
      >
        {notesContent}
      </BottomSheet>

      {/* Desktop Side Panel */}
      <div className="hidden md:flex w-80 bg-white border-l border-gray-200 flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <StickyNote className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold text-gray-900">Internal Notes</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {notesContent}
      </div>
    </>
  );
}
