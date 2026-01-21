import { query } from '../config/database.js';
import { Modality, CreateModalityData, UpdateModalityData } from '../types/index.js';
import { getEventById } from './eventsService.js';

/**
 * Helper function to convert event slug or UUID to UUID
 */
async function getEventIdFromSlugOrId(eventIdOrSlug: string): Promise<string | null> {
  // Check if it's already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(eventIdOrSlug)) {
    return eventIdOrSlug;
  }
  
  // If it's a slug, get the event to find the UUID
  const event = await getEventById(eventIdOrSlug);
  return event?.id || null;
}

/**
 * Create a new modality
 */
export const createModality = async (
  data: CreateModalityData
): Promise<Modality> => {
  // Se display_order não foi fornecido, calcular como próximo valor
  let displayOrder = data.display_order;
  if (displayOrder === undefined) {
    const maxResult = await query(
      `SELECT COALESCE(MAX(display_order), 0) as max_order 
       FROM modalities WHERE event_id = $1`,
      [data.event_id]
    );
    displayOrder = (maxResult.rows[0]?.max_order || 0) + 1;
  }

  const maxParticipants = (data.max_participants === undefined || data.max_participants === null)
    ? null
    : (typeof data.max_participants === 'number' && !isNaN(data.max_participants) && data.max_participants > 0)
      ? data.max_participants
      : null;
  
  console.log('🔍 createModality service - SQL params:', {
    event_id: data.event_id,
    name: data.name,
    distance: data.distance,
    display_order: displayOrder,
    max_participants_input: data.max_participants,
    max_participants_processed: maxParticipants,
    type: typeof data.max_participants
  });
  
  const result = await query(
    `INSERT INTO modalities (event_id, name, distance, display_order, max_participants, route_image_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.event_id, data.name, data.distance, displayOrder, maxParticipants, data.route_image_url || null]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create modality');
  }

  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    name: result.rows[0].name,
    distance: result.rows[0].distance,
    display_order: result.rows[0].display_order,
    max_participants: result.rows[0].max_participants ? parseInt(result.rows[0].max_participants) : null,
    route_image_url: result.rows[0].route_image_url || null,
    created_at: result.rows[0].created_at,
    updated_at: result.rows[0].updated_at,
  };
};

/**
 * Get all modalities for an event
 */
export const getModalitiesByEvent = async (eventIdOrSlug: string): Promise<Modality[]> => {
  // Convert slug to UUID if necessary
  const eventId = await getEventIdFromSlugOrId(eventIdOrSlug);
  if (!eventId) {
    return [];
  }
  
  const result = await query(
    `SELECT * FROM modalities
     WHERE event_id = $1
     ORDER BY display_order ASC`,
    [eventId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    distance: row.distance,
    display_order: row.display_order,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    route_image_url: row.route_image_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Get a modality by ID
 */
export const getModalityById = async (modalityId: string): Promise<Modality | null> => {
  const result = await query(
    `SELECT * FROM modalities WHERE id = $1`,
    [modalityId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  // Ensure all required Modality fields are included, including display_order
  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    distance: row.distance,
    display_order: row.display_order,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    route_image_url: row.route_image_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Update a modality
 */
export const updateModality = async (
  modalityId: string,
  data: UpdateModalityData
): Promise<Modality | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }

  if (data.distance !== undefined) {
    fields.push(`distance = $${paramIndex}`);
    values.push(data.distance);
    paramIndex++;
  }

  if (data.display_order !== undefined) {
    fields.push(`display_order = $${paramIndex}`);
    values.push(data.display_order);
    paramIndex++;
  }

  if (data.max_participants !== undefined) {
    const maxParticipants = (data.max_participants === null || data.max_participants === undefined)
      ? null
      : (typeof data.max_participants === 'number' && !isNaN(data.max_participants) && data.max_participants > 0)
        ? data.max_participants
        : null;
    
    console.log('🔍 updateModality service - max_participants:', {
      input: data.max_participants,
      processed: maxParticipants,
      type: typeof data.max_participants
    });
    
    fields.push(`max_participants = $${paramIndex}`);
    values.push(maxParticipants);
    paramIndex++;
  }

  if (data.route_image_url !== undefined) {
    fields.push(`route_image_url = $${paramIndex}`);
    values.push(data.route_image_url || null);
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(modalityId);

  const result = await query(
    `UPDATE modalities 
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    distance: row.distance,
    display_order: row.display_order,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    route_image_url: row.route_image_url || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Reorder modalities for an event
 * @param eventId Event ID
 * @param modalityOrders Array of { id, display_order } pairs
 */
export const reorderModalities = async (
  eventId: string,
  modalityOrders: Array<{ id: string; display_order: number }>
): Promise<void> => {
  // Validar que todos os IDs pertencem ao evento
  const ids = modalityOrders.map(m => m.id);
  const checkResult = await query(
    `SELECT id FROM modalities WHERE id = ANY($1::UUID[]) AND event_id = $2`,
    [ids, eventId]
  );
  
  if (checkResult.rows.length !== ids.length) {
    throw new Error('One or more modalities not found or belong to different event');
  }

  // Atualizar display_order em uma transação
  for (const { id, display_order } of modalityOrders) {
    await query(
      `UPDATE modalities SET display_order = $1, updated_at = NOW() WHERE id = $2`,
      [display_order, id]
    );
  }
};

/**
 * Delete a modality
 */
export const deleteModality = async (modalityId: string): Promise<boolean> => {
  // Verificar se há categorias associadas
  const categoriesCheck = await query(
    `SELECT COUNT(*) as count FROM category_modalities WHERE modality_id = $1`,
    [modalityId]
  );

  const categoryCount = parseInt(categoriesCheck.rows[0].count);
  if (categoryCount > 0) {
    throw new Error(
      `Não é possível excluir a modalidade pois existem ${categoryCount} categoria(s) associada(s). Remova as associações primeiro.`
    );
  }

  const result = await query(
    `DELETE FROM modalities WHERE id = $1`,
    [modalityId]
  );

  return result.rowCount !== null && result.rowCount > 0;
};

