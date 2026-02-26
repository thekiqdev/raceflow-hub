import { query } from '../config/database.js';

export interface DocumentType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requires_expiry_date: boolean;
  is_active: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDocumentTypeData {
  code: string;
  name: string;
  description?: string | null;
  requires_expiry_date?: boolean;
  is_active?: boolean;
  display_order?: number;
}

export interface UpdateDocumentTypeData {
  name?: string;
  description?: string | null;
  requires_expiry_date?: boolean;
  is_active?: boolean;
  display_order?: number;
}

/**
 * Get all document types (active and inactive)
 */
export const getAllDocumentTypes = async (): Promise<DocumentType[]> => {
  const result = await query(
    `SELECT * FROM document_types
     ORDER BY display_order ASC, name ASC`,
    []
  );
  return result.rows.map(mapRowToDocumentType);
};

/**
 * Get only active document types
 */
export const getActiveDocumentTypes = async (): Promise<DocumentType[]> => {
  const result = await query(
    `SELECT * FROM document_types
     WHERE is_active = true
     ORDER BY display_order ASC, name ASC`,
    []
  );
  return result.rows.map(mapRowToDocumentType);
};

/**
 * Get a document type by ID
 */
export const getDocumentTypeById = async (id: string): Promise<DocumentType | null> => {
  const result = await query(
    `SELECT * FROM document_types WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0 ? mapRowToDocumentType(result.rows[0]) : null;
};

/**
 * Get a document type by code
 */
export const getDocumentTypeByCode = async (code: string): Promise<DocumentType | null> => {
  const result = await query(
    `SELECT * FROM document_types WHERE code = $1`,
    [code]
  );
  return result.rows.length > 0 ? mapRowToDocumentType(result.rows[0]) : null;
};

/**
 * Create a new document type
 */
export const createDocumentType = async (data: CreateDocumentTypeData): Promise<DocumentType> => {
  // Check if code already exists
  const existing = await getDocumentTypeByCode(data.code);
  if (existing) {
    throw new Error('Já existe um tipo de documento com este código');
  }

  const result = await query(
    `INSERT INTO document_types (
      code, name, description, requires_expiry_date, is_active, display_order
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      data.code,
      data.name,
      data.description || null,
      data.requires_expiry_date ?? false,
      data.is_active ?? true,
      data.display_order ?? 0,
    ]
  );
  return mapRowToDocumentType(result.rows[0]);
};

/**
 * Update a document type
 */
export const updateDocumentType = async (
  id: string,
  data: UpdateDocumentTypeData
): Promise<DocumentType | null> => {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }

  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    values.push(data.description);
    paramIndex++;
  }

  if (data.requires_expiry_date !== undefined) {
    updates.push(`requires_expiry_date = $${paramIndex}`);
    values.push(data.requires_expiry_date);
    paramIndex++;
  }

  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    values.push(data.is_active);
    paramIndex++;
  }

  if (data.display_order !== undefined) {
    updates.push(`display_order = $${paramIndex}`);
    values.push(data.display_order);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getDocumentTypeById(id);
  }

  values.push(id);
  const result = await query(
    `UPDATE document_types
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );
  return result.rows.length > 0 ? mapRowToDocumentType(result.rows[0]) : null;
};

/**
 * Delete a document type
 * Note: This will fail if there are documents using this type (foreign key constraint)
 */
export const deleteDocumentType = async (id: string): Promise<boolean> => {
  const result = await query(
    `DELETE FROM document_types WHERE id = $1`,
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
};

// Helper to map database row to DocumentType interface
const mapRowToDocumentType = (row: any): DocumentType => {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    requires_expiry_date: row.requires_expiry_date,
    is_active: row.is_active,
    display_order: row.display_order,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
};
