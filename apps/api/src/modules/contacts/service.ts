import { eq, and, desc, sql } from 'drizzle-orm';
import { db, contacts, notes, labels, contactLabels } from '../../db/index.js';

// ============================================
// CONTACTS
// ============================================

export interface ContactWithLabels {
  id: string;
  accountId: string;
  channelType: string;
  channelContactId: string;
  name: string | null;
  phoneNumber: string | null;
  profilePicUrl: string | null;
  createdAt: Date;
  labels?: Array<{ id: string; name: string; color: string }>;
}

export async function getContacts(
  accountId: string,
  params?: { search?: string; labelId?: string; page?: number; limit?: number }
): Promise<{ contacts: ContactWithLabels[]; total: number }> {
  const { search, labelId, page = 1, limit = 50 } = params || {};
  const offset = (page - 1) * limit;

  // Build conditions
  const conditions = [eq(contacts.accountId, accountId)];

  if (search) {
    conditions.push(
      sql`(${contacts.name} ILIKE ${'%' + search + '%'} OR ${contacts.phoneNumber} ILIKE ${'%' + search + '%'})`
    );
  }

  // Get contacts
  let query = db.query.contacts.findMany({
    where: and(...conditions),
    orderBy: [desc(contacts.updatedAt)],
    limit,
    offset,
    with: {
      labels: {
        with: {
          label: true,
        },
      },
    },
  });

  const results = await query;

  // Filter by label if specified
  let filteredResults = results;
  if (labelId) {
    filteredResults = results.filter((c: any) =>
      c.labels?.some((cl: any) => cl.label?.id === labelId)
    );
  }

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(...conditions));

  const contactsWithLabels: ContactWithLabels[] = filteredResults.map((c: any) => ({
    id: c.id,
    accountId: c.accountId,
    channelType: c.channelType,
    channelContactId: c.channelContactId,
    name: c.name,
    phoneNumber: c.phoneNumber,
    profilePicUrl: c.profilePicUrl,
    createdAt: c.createdAt,
    labels: c.labels?.map((cl: any) => ({
      id: cl.label.id,
      name: cl.label.name,
      color: cl.label.color,
    })) || [],
  }));

  return { contacts: contactsWithLabels, total: count };
}

export async function getContactById(contactId: string): Promise<ContactWithLabels | null> {
  const result = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    with: {
      labels: {
        with: {
          label: true,
        },
      },
    },
  });

  if (!result) return null;

  return {
    id: result.id,
    accountId: result.accountId,
    channelType: result.channelType,
    channelContactId: result.channelContactId,
    name: result.name,
    phoneNumber: result.phoneNumber,
    profilePicUrl: result.profilePicUrl,
    createdAt: result.createdAt,
    labels: (result as any).labels?.map((cl: any) => ({
      id: cl.label.id,
      name: cl.label.name,
      color: cl.label.color,
    })) || [],
  };
}

export async function updateContact(
  contactId: string,
  data: { name?: string }
): Promise<boolean> {
  try {
    await db
      .update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contacts.id, contactId));
    return true;
  } catch (error) {
    console.error('[Contacts] Update error:', error);
    return false;
  }
}

// ============================================
// NOTES
// ============================================

export interface Note {
  id: string;
  contactId: string;
  agentId: string;
  agentName?: string;
  content: string;
  createdAt: Date;
}

export async function getContactNotes(contactId: string): Promise<Note[]> {
  const results = await db.query.notes.findMany({
    where: eq(notes.contactId, contactId),
    orderBy: [desc(notes.createdAt)],
    with: {
      agent: {
        columns: { id: true, name: true },
      },
    },
  });

  return results.map((n: any) => ({
    id: n.id,
    contactId: n.contactId,
    agentId: n.agentId,
    agentName: n.agent?.name,
    content: n.content,
    createdAt: n.createdAt,
  }));
}

export async function createNote(
  contactId: string,
  agentId: string,
  content: string
): Promise<Note | null> {
  try {
    const [created] = await db
      .insert(notes)
      .values({ contactId, agentId, content })
      .returning();

    return {
      id: created!.id,
      contactId: created!.contactId,
      agentId: created!.agentId,
      content: created!.content,
      createdAt: created!.createdAt,
    };
  } catch (error) {
    console.error('[Notes] Create error:', error);
    return null;
  }
}

export async function updateNote(noteId: string, content: string): Promise<boolean> {
  try {
    await db
      .update(notes)
      .set({ content })
      .where(eq(notes.id, noteId));
    return true;
  } catch (error) {
    console.error('[Notes] Update error:', error);
    return false;
  }
}

export async function deleteNote(noteId: string): Promise<boolean> {
  try {
    await db.delete(notes).where(eq(notes.id, noteId));
    return true;
  } catch (error) {
    console.error('[Notes] Delete error:', error);
    return false;
  }
}

export async function getNoteById(noteId: string): Promise<Note | null> {
  const result = await db.query.notes.findFirst({
    where: eq(notes.id, noteId),
  });

  if (!result) return null;

  return {
    id: result.id,
    contactId: result.contactId,
    agentId: result.agentId,
    content: result.content,
    createdAt: result.createdAt,
  };
}

// ============================================
// LABELS
// ============================================

export interface Label {
  id: string;
  accountId: string;
  name: string;
  color: string;
  createdAt: Date;
  contactCount?: number;
}

export async function getLabels(accountId: string): Promise<Label[]> {
  const results = await db.query.labels.findMany({
    where: eq(labels.accountId, accountId),
    orderBy: [desc(labels.createdAt)],
    with: {
      contacts: true,
    },
  });

  return results.map((l: any) => ({
    id: l.id,
    accountId: l.accountId,
    name: l.name,
    color: l.color,
    createdAt: l.createdAt,
    contactCount: l.contacts?.length || 0,
  }));
}

export async function createLabel(
  accountId: string,
  name: string,
  color: string
): Promise<Label | null> {
  try {
    const [created] = await db
      .insert(labels)
      .values({ accountId, name, color })
      .returning();

    return {
      id: created!.id,
      accountId: created!.accountId,
      name: created!.name,
      color: created!.color,
      createdAt: created!.createdAt,
    };
  } catch (error) {
    console.error('[Labels] Create error:', error);
    return null;
  }
}

export async function updateLabel(
  labelId: string,
  data: { name?: string; color?: string }
): Promise<boolean> {
  try {
    await db
      .update(labels)
      .set(data)
      .where(eq(labels.id, labelId));
    return true;
  } catch (error) {
    console.error('[Labels] Update error:', error);
    return false;
  }
}

export async function deleteLabel(labelId: string): Promise<boolean> {
  try {
    await db.delete(labels).where(eq(labels.id, labelId));
    return true;
  } catch (error) {
    console.error('[Labels] Delete error:', error);
    return false;
  }
}

export async function getLabelById(labelId: string): Promise<Label | null> {
  const result = await db.query.labels.findFirst({
    where: eq(labels.id, labelId),
  });

  if (!result) return null;

  return {
    id: result.id,
    accountId: result.accountId,
    name: result.name,
    color: result.color,
    createdAt: result.createdAt,
  };
}

// ============================================
// CONTACT-LABEL OPERATIONS
// ============================================

export async function addLabelToContact(
  contactId: string,
  labelId: string
): Promise<boolean> {
  try {
    await db
      .insert(contactLabels)
      .values({ contactId, labelId })
      .onConflictDoNothing();
    return true;
  } catch (error) {
    console.error('[ContactLabels] Add error:', error);
    return false;
  }
}

export async function removeLabelFromContact(
  contactId: string,
  labelId: string
): Promise<boolean> {
  try {
    await db
      .delete(contactLabels)
      .where(
        and(
          eq(contactLabels.contactId, contactId),
          eq(contactLabels.labelId, labelId)
        )
      );
    return true;
  } catch (error) {
    console.error('[ContactLabels] Remove error:', error);
    return false;
  }
}
