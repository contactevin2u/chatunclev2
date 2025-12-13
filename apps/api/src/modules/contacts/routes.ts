import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, accountAccessMiddleware } from '../../middleware/auth.js';
import { userHasAccountAccess } from '../accounts/access.js';
import {
  getContacts,
  getContactById,
  updateContact,
  getContactNotes,
  createNote,
  updateNote,
  deleteNote,
  getNoteById,
  getLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  getLabelById,
  addLabelToContact,
  removeLabelFromContact,
} from './service.js';

const router = Router();

router.use(authMiddleware);

// ============================================
// CONTACTS ROUTES
// ============================================

const contactsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  search: z.string().optional(),
  labelId: z.string().uuid().optional(),
});

const updateContactSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

/**
 * GET /api/accounts/:accountId/contacts
 * List contacts for an account
 */
router.get('/accounts/:accountId/contacts', accountAccessMiddleware(), async (req, res) => {
  try {
    const query = contactsQuerySchema.parse(req.query);
    const result = await getContacts(req.params.accountId, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      labelId: query.labelId,
    });

    res.json({
      contacts: result.contacts,
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(result.total / query.limit),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Contacts] List error:', error);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

/**
 * GET /api/contacts/:contactId
 * Get a single contact
 */
router.get('/contacts/:contactId', async (req, res) => {
  try {
    const contact = await getContactById(req.params.contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Check access
    const hasAccess = await userHasAccountAccess(req.user!.userId, contact.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ contact });
  } catch (error) {
    console.error('[Contacts] Get error:', error);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

/**
 * PATCH /api/contacts/:contactId
 * Update a contact
 */
router.patch('/contacts/:contactId', async (req, res) => {
  try {
    const data = updateContactSchema.parse(req.body);
    const contact = await getContactById(req.params.contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, contact.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await updateContact(req.params.contactId, data);
    if (!success) {
      return res.status(500).json({ error: 'Failed to update contact' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Contacts] Update error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// ============================================
// NOTES ROUTES
// ============================================

const createNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

const updateNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

/**
 * GET /api/contacts/:contactId/notes
 * Get notes for a contact
 */
router.get('/contacts/:contactId/notes', async (req, res) => {
  try {
    const contact = await getContactById(req.params.contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, contact.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const notes = await getContactNotes(req.params.contactId);
    res.json({ notes });
  } catch (error) {
    console.error('[Notes] List error:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

/**
 * POST /api/contacts/:contactId/notes
 * Create a note for a contact
 */
router.post('/contacts/:contactId/notes', async (req, res) => {
  try {
    const data = createNoteSchema.parse(req.body);
    const contact = await getContactById(req.params.contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, contact.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const note = await createNote(req.params.contactId, req.user!.userId, data.content);
    if (!note) {
      return res.status(500).json({ error: 'Failed to create note' });
    }

    res.status(201).json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Notes] Create error:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

/**
 * PATCH /api/notes/:noteId
 * Update a note
 */
router.patch('/notes/:noteId', async (req, res) => {
  try {
    const data = updateNoteSchema.parse(req.body);
    const note = await getNoteById(req.params.noteId);

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only the note author can edit
    if (note.agentId !== req.user!.userId) {
      return res.status(403).json({ error: 'Only the author can edit this note' });
    }

    const success = await updateNote(req.params.noteId, data.content);
    if (!success) {
      return res.status(500).json({ error: 'Failed to update note' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Notes] Update error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

/**
 * DELETE /api/notes/:noteId
 * Delete a note
 */
router.delete('/notes/:noteId', async (req, res) => {
  try {
    const note = await getNoteById(req.params.noteId);

    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only the note author can delete
    if (note.agentId !== req.user!.userId) {
      return res.status(403).json({ error: 'Only the author can delete this note' });
    }

    const success = await deleteNote(req.params.noteId);
    if (!success) {
      return res.status(500).json({ error: 'Failed to delete note' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Notes] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ============================================
// LABELS ROUTES
// ============================================

const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#3B82F6'),
});

const updateLabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

/**
 * GET /api/accounts/:accountId/labels
 * Get labels for an account
 */
router.get('/accounts/:accountId/labels', accountAccessMiddleware(), async (req, res) => {
  try {
    const labels = await getLabels(req.params.accountId);
    res.json({ labels });
  } catch (error) {
    console.error('[Labels] List error:', error);
    res.status(500).json({ error: 'Failed to get labels' });
  }
});

/**
 * POST /api/accounts/:accountId/labels
 * Create a label
 */
router.post('/accounts/:accountId/labels', accountAccessMiddleware(), async (req, res) => {
  try {
    const data = createLabelSchema.parse(req.body);
    const label = await createLabel(req.params.accountId, data.name, data.color);

    if (!label) {
      return res.status(500).json({ error: 'Failed to create label' });
    }

    res.status(201).json({ label });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Labels] Create error:', error);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

/**
 * PATCH /api/labels/:labelId
 * Update a label
 */
router.patch('/labels/:labelId', async (req, res) => {
  try {
    const data = updateLabelSchema.parse(req.body);
    const label = await getLabelById(req.params.labelId);

    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, label.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await updateLabel(req.params.labelId, data);
    if (!success) {
      return res.status(500).json({ error: 'Failed to update label' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Labels] Update error:', error);
    res.status(500).json({ error: 'Failed to update label' });
  }
});

/**
 * DELETE /api/labels/:labelId
 * Delete a label
 */
router.delete('/labels/:labelId', async (req, res) => {
  try {
    const label = await getLabelById(req.params.labelId);

    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, label.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await deleteLabel(req.params.labelId);
    if (!success) {
      return res.status(500).json({ error: 'Failed to delete label' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Labels] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

// ============================================
// CONTACT-LABEL ROUTES
// ============================================

/**
 * POST /api/contacts/:contactId/labels/:labelId
 * Add a label to a contact
 */
router.post('/contacts/:contactId/labels/:labelId', async (req, res) => {
  try {
    const contact = await getContactById(req.params.contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, contact.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const label = await getLabelById(req.params.labelId);
    if (!label || label.accountId !== contact.accountId) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const success = await addLabelToContact(req.params.contactId, req.params.labelId);
    if (!success) {
      return res.status(500).json({ error: 'Failed to add label' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[ContactLabels] Add error:', error);
    res.status(500).json({ error: 'Failed to add label' });
  }
});

/**
 * DELETE /api/contacts/:contactId/labels/:labelId
 * Remove a label from a contact
 */
router.delete('/contacts/:contactId/labels/:labelId', async (req, res) => {
  try {
    const contact = await getContactById(req.params.contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const hasAccess = await userHasAccountAccess(req.user!.userId, contact.accountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const success = await removeLabelFromContact(req.params.contactId, req.params.labelId);
    if (!success) {
      return res.status(500).json({ error: 'Failed to remove label' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[ContactLabels] Remove error:', error);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

export default router;
