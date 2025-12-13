'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { X, User, Phone, Mail, Tag, StickyNote, Plus, Pencil, Trash2, Check, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface Contact {
  id: string;
  name: string | null;
  phoneNumber: string | null;
  profilePicUrl: string | null;
  email?: string | null;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Note {
  id: string;
  content: string;
  agentId: string;
  agentName: string;
  createdAt: string;
  updatedAt: string;
}

interface ContactPanelProps {
  contact: Contact;
  accountId: string;
  currentUserId: string;
  onClose: () => void;
}

export function ContactPanel({ contact, accountId, currentUserId, onClose }: ContactPanelProps) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [contactLabels, setContactLabels] = useState<Label[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(true);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadLabels();
    loadNotes();
  }, [contact.id]);

  const loadLabels = async () => {
    setIsLoadingLabels(true);
    try {
      // Load all account labels
      const { labels: allLabels } = await api.getLabels(accountId);
      setLabels(allLabels);

      // Load contact's labels (from contact detail endpoint)
      const { contact: contactDetail } = await api.getContact(contact.id);
      setContactLabels(contactDetail.labels || []);
    } catch (error) {
      console.error('Failed to load labels:', error);
    } finally {
      setIsLoadingLabels(false);
    }
  };

  const loadNotes = async () => {
    setIsLoadingNotes(true);
    try {
      const { notes: contactNotes } = await api.getContactNotes(contact.id);
      setNotes(contactNotes);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const handleAddLabel = async (labelId: string) => {
    try {
      await api.addLabelToContact(contact.id, labelId);
      const label = labels.find((l) => l.id === labelId);
      if (label) {
        setContactLabels([...contactLabels, label]);
      }
      setShowAddLabel(false);
    } catch (error) {
      console.error('Failed to add label:', error);
    }
  };

  const handleRemoveLabel = async (labelId: string) => {
    try {
      await api.removeLabelFromContact(contact.id, labelId);
      setContactLabels(contactLabels.filter((l) => l.id !== labelId));
    } catch (error) {
      console.error('Failed to remove label:', error);
    }
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    setIsSaving(true);
    try {
      const { note } = await api.createNote(contact.id, newNoteContent.trim());
      setNotes([note, ...notes]);
      setNewNoteContent('');
      setShowAddNote(false);
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editingNoteContent.trim()) return;
    setIsSaving(true);
    try {
      await api.updateNote(noteId, editingNoteContent.trim());
      setNotes(
        notes.map((n) =>
          n.id === noteId
            ? { ...n, content: editingNoteContent.trim(), updatedAt: new Date().toISOString() }
            : n
        )
      );
      setEditingNoteId(null);
      setEditingNoteContent('');
    } catch (error) {
      console.error('Failed to update note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;
    try {
      await api.deleteNote(noteId);
      setNotes(notes.filter((n) => n.id !== noteId));
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const availableLabels = labels.filter(
    (l) => !contactLabels.some((cl) => cl.id === l.id)
  );

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Contact Details</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Contact Info */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          {contact.profilePicUrl ? (
            <img
              src={contact.profilePicUrl}
              alt={contact.name || 'Contact'}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="h-8 w-8 text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {contact.name || 'Unknown'}
            </p>
            {contact.phoneNumber && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {contact.phoneNumber}
              </p>
            )}
            {contact.email && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {contact.email}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Labels Section */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Labels
            </h4>
            <button
              onClick={() => setShowAddLabel(!showAddLabel)}
              className="text-primary-600 hover:text-primary-700"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {isLoadingLabels ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Current Labels */}
              <div className="flex flex-wrap gap-2">
                {contactLabels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${label.color}20`, color: label.color }}
                  >
                    {label.name}
                    <button
                      onClick={() => handleRemoveLabel(label.id)}
                      className="hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {contactLabels.length === 0 && !showAddLabel && (
                  <p className="text-sm text-gray-400">No labels</p>
                )}
              </div>

              {/* Add Label Dropdown */}
              {showAddLabel && availableLabels.length > 0 && (
                <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-2">Add label:</p>
                  <div className="flex flex-wrap gap-1">
                    {availableLabels.map((label) => (
                      <button
                        key={label.id}
                        onClick={() => handleAddLabel(label.id)}
                        className="px-2 py-1 rounded-full text-xs font-medium hover:opacity-80"
                        style={{ backgroundColor: `${label.color}20`, color: label.color }}
                      >
                        + {label.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {showAddLabel && availableLabels.length === 0 && (
                <p className="mt-2 text-xs text-gray-500">No more labels available</p>
              )}
            </>
          )}
        </div>

        {/* Notes Section */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Notes
            </h4>
            <button
              onClick={() => setShowAddNote(!showAddNote)}
              className="text-primary-600 hover:text-primary-700"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Add Note Form */}
          {showAddNote && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg">
              <textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Write a note..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                rows={3}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddNote(false);
                    setNewNoteContent('');
                  }}
                  className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={!newNoteContent.trim() || isSaving}
                  className="px-3 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {isLoadingNotes ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-gray-400">No notes yet</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                  {editingNoteId === note.id ? (
                    <>
                      <textarea
                        value={editingNoteContent}
                        onChange={(e) => setEditingNoteContent(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded resize-none"
                        rows={3}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditingNoteContent('');
                          }}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleUpdateNote(note.id)}
                          disabled={isSaving}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {note.agentName} &bull;{' '}
                          {new Date(note.createdAt).toLocaleDateString()}
                        </span>
                        {note.agentId === currentUserId && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingNoteContent(note.content);
                              }}
                              className="hover:text-gray-700"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
