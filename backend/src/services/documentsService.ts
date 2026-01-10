import { query } from '../config/database.js';

// Document types - now using string (code from document_types table)
export type DocumentType = string; // Code from document_types table
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

// Document interface
export interface RunnerDocument {
  id: string;
  runner_id: string;
  document_type: DocumentType; // Now a string (code)
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  expiry_date: Date | null;
  status: DocumentStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields (optional)
  runner_name?: string;
  runner_cpf?: string;
  runner_email?: string;
  reviewer_name?: string;
}

// Create document data
export interface CreateDocumentData {
  runner_id: string;
  document_type: DocumentType;
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  expiry_date?: Date | null;
}

// Update document status data
export interface UpdateDocumentStatusData {
  status: 'approved' | 'rejected';
  reviewed_by: string;
  rejection_reason?: string;
}

// Filters for getting documents
export interface DocumentFilters {
  runner_id?: string;
  status?: DocumentStatus;
  document_type?: DocumentType;
  search?: string; // Search by runner name or CPF
}

/**
 * Get documents for a specific runner
 */
export const getRunnerDocuments = async (runnerId: string): Promise<RunnerDocument[]> => {
  const result = await query(
    `SELECT 
      rd.*,
      p.full_name as runner_name,
      p.cpf as runner_cpf
    FROM runner_documents rd
    LEFT JOIN profiles p ON rd.runner_id = p.id
    WHERE rd.runner_id = $1
    ORDER BY rd.created_at DESC`,
    [runnerId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    runner_id: row.runner_id,
    document_type: row.document_type,
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: row.file_url,
    file_size: parseInt(row.file_size) || 0,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
    // Include joined fields
    runner_name: row.runner_name,
    runner_cpf: row.runner_cpf,
    runner_email: row.runner_email,
    reviewer_name: row.reviewer_name,
  }));
};

/**
 * Get a document by ID
 */
export const getDocumentById = async (documentId: string): Promise<RunnerDocument | null> => {
  const result = await query(
    `SELECT 
      rd.*,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      u.email as runner_email,
      pr.full_name as reviewer_name
    FROM runner_documents rd
    LEFT JOIN profiles p ON rd.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN profiles pr ON rd.reviewed_by = pr.id
    WHERE rd.id = $1`,
    [documentId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    runner_id: row.runner_id,
    document_type: row.document_type,
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: row.file_url,
    file_size: parseInt(row.file_size) || 0,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
    // Include joined fields
    runner_name: row.runner_name,
    runner_cpf: row.runner_cpf,
    runner_email: row.runner_email,
    reviewer_name: row.reviewer_name,
  };
};

/**
 * Create a new document
 */
export const createDocument = async (data: CreateDocumentData): Promise<RunnerDocument> => {
  const result = await query(
    `INSERT INTO runner_documents (
      runner_id,
      document_type,
      file_name,
      file_path,
      file_url,
      file_size,
      mime_type,
      expiry_date,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    RETURNING *`,
    [
      data.runner_id,
      data.document_type,
      data.file_name,
      data.file_path,
      data.file_url,
      data.file_size,
      data.mime_type,
      data.expiry_date || null,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create document');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    runner_id: row.runner_id,
    document_type: row.document_type,
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: row.file_url,
    file_size: parseInt(row.file_size) || 0,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
};

/**
 * Update document status (approve or reject)
 */
export const updateDocumentStatus = async (
  documentId: string,
  data: UpdateDocumentStatusData
): Promise<RunnerDocument> => {
  const updateFields: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  updateFields.push(`status = $${paramIndex++}`);
  params.push(data.status);

  updateFields.push(`reviewed_by = $${paramIndex++}`);
  params.push(data.reviewed_by);

  updateFields.push(`reviewed_at = NOW()`);

  if (data.status === 'rejected') {
    if (!data.rejection_reason || data.rejection_reason.trim() === '') {
      throw new Error('Rejection reason is required when rejecting a document');
    }
    updateFields.push(`rejection_reason = $${paramIndex++}`);
    params.push(data.rejection_reason);
  } else {
    // Clear rejection reason when approving
    updateFields.push(`rejection_reason = NULL`);
  }

  updateFields.push(`updated_at = NOW()`);

  params.push(documentId);

  const result = await query(
    `UPDATE runner_documents 
     SET ${updateFields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error('Document not found');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    runner_id: row.runner_id,
    document_type: row.document_type,
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: row.file_url,
    file_size: parseInt(row.file_size) || 0,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
};

/**
 * Delete a document (only by the owner)
 */
export const deleteDocument = async (documentId: string, runnerId: string): Promise<boolean> => {
  // Verify document belongs to runner
  const document = await getDocumentById(documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  if (document.runner_id !== runnerId) {
    throw new Error('You can only delete your own documents');
  }

  const result = await query(
    `DELETE FROM runner_documents 
     WHERE id = $1 AND runner_id = $2`,
    [documentId, runnerId]
  );

  return result.rowCount !== null && result.rowCount > 0;
};

/**
 * Get all pending documents (for admin)
 */
export const getPendingDocuments = async (): Promise<RunnerDocument[]> => {
  const result = await query(
    `SELECT 
      rd.*,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      u.email as runner_email
    FROM runner_documents rd
    LEFT JOIN profiles p ON rd.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    WHERE rd.status = 'pending'
    ORDER BY rd.created_at ASC`,
    []
  );

  return result.rows.map((row) => ({
    id: row.id,
    runner_id: row.runner_id,
    document_type: row.document_type,
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: row.file_url,
    file_size: parseInt(row.file_size) || 0,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
    // Include joined fields
    runner_name: row.runner_name,
    runner_cpf: row.runner_cpf,
    runner_email: row.runner_email,
    reviewer_name: row.reviewer_name,
  }));
};

/**
 * Get documents by status
 */
export const getDocumentsByStatus = async (status: DocumentStatus): Promise<RunnerDocument[]> => {
  const result = await query(
    `SELECT 
      rd.*,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      u.email as runner_email,
      pr.full_name as reviewer_name
    FROM runner_documents rd
    LEFT JOIN profiles p ON rd.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN profiles pr ON rd.reviewed_by = pr.id
    WHERE rd.status = $1
    ORDER BY rd.created_at DESC`,
    [status]
  );

  return result.rows.map((row) => ({
    id: row.id,
    runner_id: row.runner_id,
    document_type: row.document_type,
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: row.file_url,
    file_size: parseInt(row.file_size) || 0,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
    // Include joined fields
    runner_name: row.runner_name,
    runner_cpf: row.runner_cpf,
    runner_email: row.runner_email,
    reviewer_name: row.reviewer_name,
  }));
};

/**
 * Get all documents with filters (for admin)
 */
export const getAllDocuments = async (filters?: DocumentFilters): Promise<RunnerDocument[]> => {
  let queryText = `
    SELECT 
      rd.*,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      u.email as runner_email,
      pr.full_name as reviewer_name
    FROM runner_documents rd
    LEFT JOIN profiles p ON rd.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN profiles pr ON rd.reviewed_by = pr.id
  `;

  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.runner_id) {
    conditions.push(`rd.runner_id = $${params.length + 1}`);
    params.push(filters.runner_id);
  }

  if (filters?.status) {
    conditions.push(`rd.status = $${params.length + 1}`);
    params.push(filters.status);
  }

  if (filters?.document_type) {
    conditions.push(`rd.document_type = $${params.length + 1}`);
    params.push(filters.document_type);
  }

  if (filters?.search) {
    conditions.push(`(
      p.full_name ILIKE $${params.length + 1} OR
      p.cpf ILIKE $${params.length + 1}
    )`);
    params.push(`%${filters.search}%`);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY rd.created_at DESC';

  const result = await query(queryText, params);

  return result.rows.map((row) => ({
    id: row.id,
    runner_id: row.runner_id,
    document_type: row.document_type,
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: row.file_url,
    file_size: parseInt(row.file_size) || 0,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date ? new Date(row.expiry_date) : null,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : new Date(),
    updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
    // Include joined fields
    runner_name: row.runner_name,
    runner_cpf: row.runner_cpf,
    runner_email: row.runner_email,
    reviewer_name: row.reviewer_name,
  }));
};
