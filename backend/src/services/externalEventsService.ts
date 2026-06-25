import { query } from '../config/database.js';
import { EventStatus } from '../types/index.js';
import { generateSlug } from '../utils/slug.js';

const EXTERNAL_LOCATION = 'Evento externo';
const EXTERNAL_CITY = 'Externo';
const EXTERNAL_STATE = 'EX';

export type EventType = 'NORMAL' | 'EXTERNAL';

export interface CreateExternalEventData {
  organizer_id: string;
  title: string;
  event_date: string;
  banner_url: string;
  external_url: string;
  status?: EventStatus;
}

export interface UpdateExternalEventData {
  organizer_id?: string;
  title?: string;
  event_date?: string;
  banner_url?: string;
  external_url?: string;
  status?: EventStatus;
}

async function checkSlugColumnExists(): Promise<boolean> {
  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'slug'
  `);
  return result.rows.length > 0;
}

async function slugExists(slug: string, excludeEventId?: string): Promise<boolean> {
  let queryText = 'SELECT COUNT(*)::int AS count FROM events WHERE slug = $1';
  const params: string[] = [slug];
  if (excludeEventId) {
    queryText += ' AND id != $2';
    params.push(excludeEventId);
  }
  const result = await query(queryText, params);
  return (result.rows[0]?.count ?? 0) > 0;
}

async function ensureUniqueSlug(baseSlug: string, excludeEventId?: string): Promise<string> {
  if (!(await slugExists(baseSlug, excludeEventId))) {
    return baseSlug;
  }
  for (let counter = 1; counter < 1000; counter++) {
    const candidate = `${baseSlug}-${counter}`;
    if (!(await slugExists(candidate, excludeEventId))) {
      return candidate;
    }
  }
  return `${baseSlug}-${Date.now()}`;
}

async function assertOrganizerExists(organizerId: string): Promise<void> {
  const result = await query(
    `SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'organizer' LIMIT 1`,
    [organizerId]
  );
  if (result.rows.length === 0) {
    throw new Error('ORGANIZER_NOT_FOUND');
  }
}

export async function getEventTypeById(eventId: string): Promise<EventType | null> {
  const result = await query('SELECT event_type FROM events WHERE id = $1', [eventId]);
  if (result.rows.length === 0) return null;
  return (result.rows[0].event_type as EventType) ?? 'NORMAL';
}

export async function createExternalEvent(data: CreateExternalEventData) {
  await assertOrganizerExists(data.organizer_id);

  const hasSlugColumn = await checkSlugColumnExists();
  const slug = hasSlugColumn ? await ensureUniqueSlug(generateSlug(data.title)) : undefined;

  const fields = [
    'organizer_id',
    'title',
    ...(hasSlugColumn ? ['slug'] : []),
    'description',
    'event_date',
    'location',
    'city',
    'state',
    'banner_url',
    'status',
    'event_type',
    'external_url',
    'registration_status',
    'registration_auto_mode',
    'pix_enabled',
    'credit_card_enabled',
    'transfers_enabled',
  ];

  const values = [
    data.organizer_id,
    data.title,
    ...(hasSlugColumn ? [slug] : []),
    null,
    data.event_date,
    EXTERNAL_LOCATION,
    EXTERNAL_CITY,
    EXTERNAL_STATE,
    data.banner_url,
    data.status ?? 'published',
    'EXTERNAL',
    data.external_url,
    null,
    false,
    false,
    false,
    false,
  ];

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const result = await query(
    `INSERT INTO events (${fields.join(', ')})
     VALUES (${placeholders})
     RETURNING *`,
    values
  );

  return result.rows[0];
}

export async function updateExternalEvent(eventId: string, data: UpdateExternalEventData) {
  const existing = await query('SELECT id, event_type FROM events WHERE id = $1', [eventId]);
  if (existing.rows.length === 0) {
    throw new Error('EVENT_NOT_FOUND');
  }
  if (existing.rows[0].event_type !== 'EXTERNAL') {
    throw new Error('NOT_EXTERNAL_EVENT');
  }

  if (data.organizer_id) {
    await assertOrganizerExists(data.organizer_id);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const allowed: Array<keyof UpdateExternalEventData> = [
    'organizer_id',
    'title',
    'event_date',
    'banner_url',
    'external_url',
    'status',
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(data[key]);
      paramIndex++;
    }
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  fields.push('updated_at = NOW()');
  values.push(eventId);

  const result = await query(
    `UPDATE events SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
}
