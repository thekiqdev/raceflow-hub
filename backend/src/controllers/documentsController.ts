import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getRunnerDocuments,
  getDocumentById,
  createDocument,
  updateDocumentStatus,
  deleteDocument,
  getPendingDocuments,
  getAllDocuments,
  CreateDocumentData,
  UpdateDocumentStatusData,
} from '../services/documentsService.js';
import { getDocumentTypeByCode } from '../services/documentTypesService.js';
import { hasRole } from '../services/userRolesService.js';
import { getFileUrl } from '../middleware/upload.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { sendNotificationSafely, getUserEmail, getUserName } from '../services/notificationService.js';
import { getAdminEmail } from '../services/notificationService.js';

// Validation schemas
// Document type is now a string (code from document_types table)
const documentTypeSchema = z.string().min(1, 'Tipo de documento é obrigatório');

// Helper function to validate and normalize expiry_date
const normalizeExpiryDate = (value: any): string | null => {
  if (!value || value === '' || value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str === '' ? null : str;
};

const createDocumentSchema = z.object({
  document_type: documentTypeSchema,
  expiry_date: z.preprocess(
    normalizeExpiryDate,
    z.union([
      z.string().date(),
      z.null(),
    ]).optional().nullable()
  ),
}).refine(
  (data) => {
    // If expiry_date is provided and not empty, it should be in the future
    if (data.expiry_date && data.expiry_date !== '' && data.expiry_date !== null) {
      try {
        const expiryDate = new Date(data.expiry_date);
        // Check if date is valid
        if (isNaN(expiryDate.getTime())) {
          return false; // Invalid date
        }
        const now = new Date();
        // Allow dates up to 100 years in the future (reasonable limit)
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 100);
        
        if (expiryDate < now) {
          return false; // Past date
        }
        if (expiryDate > maxDate) {
          return false; // Too far in the future
        }
      } catch (error) {
        return false; // Error parsing date
      }
    }
    return true;
  },
  {
    message: 'Data de validade deve ser uma data futura válida',
    path: ['expiry_date'],
  }
);

const updateDocumentStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejection_reason: z.string().min(1, 'Motivo da rejeição é obrigatório').max(1000, 'Motivo da rejeição deve ter no máximo 1000 caracteres').optional(),
}).refine(
  (data) => {
    // Se status é 'rejected', rejection_reason é obrigatório
    if (data.status === 'rejected' && (!data.rejection_reason || data.rejection_reason.trim() === '')) {
      return false;
    }
    return true;
  },
  {
    message: 'Motivo da rejeição é obrigatório quando o status é "rejected"',
    path: ['rejection_reason'],
  }
);

// Document type labels for notifications
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  militar: 'Militar',
  estudante: 'Estudante',
  pcd: 'PCD',
  rg: 'RG',
  cpf: 'CPF',
  atestado_medico: 'Atestado Médico',
  comprovante_residencia: 'Comprovante de Residência',
  outro: 'Outro',
};

/**
 * GET /api/runner/documents
 * List documents for the authenticated runner
 */
export const getRunnerDocumentsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const documents = await getRunnerDocuments(req.user.id);

    res.json({
      success: true,
      data: documents,
    });
  }
);

/**
 * GET /api/runner/documents/:id
 * Get a specific document by ID (only if it belongs to the authenticated runner)
 */
export const getRunnerDocumentByIdController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID do documento é obrigatório',
      });
      return;
    }

    const document = await getDocumentById(id);

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Documento não encontrado',
      });
      return;
    }

    // Verificar se o documento pertence ao runner autenticado
    if (document.runner_id !== req.user.id) {
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você não tem permissão para visualizar este documento',
        });
        return;
      }
    }

    res.json({
      success: true,
      data: document,
    });
  }
);

/**
 * POST /api/runner/documents
 * Upload a new document
 */
export const uploadRunnerDocumentController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    // Verificar se o usuário tem permissão (runner, organizer ou admin)
    const isRunner = await hasRole(req.user.id, 'runner');
    const isOrganizer = await hasRole(req.user.id, 'organizer');
    const isAdmin = await hasRole(req.user.id, 'admin');

    if (!isRunner && !isOrganizer && !isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas corredores, organizadores e administradores podem enviar documentos',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Nenhum arquivo foi enviado',
      });
      return;
    }

    // Additional file validation (double check)
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    if (!allowedMimes.includes(req.file.mimetype)) {
      // Delete file if invalid
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: 'Tipo de arquivo não permitido. Use PDF, JPG ou PNG.',
      });
      return;
    }
    
    if (!allowedExtensions.includes(fileExt)) {
      // Delete file if invalid
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(400).json({
        success: false,
        error: 'Invalid file extension',
        message: 'Extensão de arquivo não permitida. Use PDF, JPG ou PNG.',
      });
      return;
    }
    
    // Validate file size (double check - max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      // Delete file if too large
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'Arquivo muito grande. Tamanho máximo: 10MB.',
      });
      return;
    }

    // Validar body (document_type e expiry_date)
    // Parse body - FormData sends strings, so we need to handle empty strings
    let expiryDateValue: string | null = null;
    if (req.body.expiry_date) {
      const trimmed = String(req.body.expiry_date).trim();
      expiryDateValue = trimmed !== '' ? trimmed : null;
    }

    const bodyData = {
      document_type: req.body.document_type,
      expiry_date: expiryDateValue,
    };

    console.log('📋 Dados recebidos para validação:', {
      document_type: bodyData.document_type,
      expiry_date: bodyData.expiry_date,
      raw_body: req.body,
    });

    const bodyValidation = createDocumentSchema.safeParse(bodyData);
    if (!bodyValidation.success) {
      // Deletar arquivo se a validação falhar
      if (req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (error) {
          console.error('❌ Erro ao deletar arquivo após validação falhar:', error);
        }
      }
      console.error('❌ Erro de validação:', bodyValidation.error.errors);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: bodyValidation.error.errors[0]?.message || 'Erro de validação',
        details: bodyValidation.error.errors,
      });
      return;
    }

    const { document_type, expiry_date } = bodyValidation.data;

    // Validate document type exists and is active
    const docType = await getDocumentTypeByCode(document_type);
    if (!docType) {
      // Delete file if document type not found
      if (req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (error) {
          console.error('❌ Erro ao deletar arquivo:', error);
        }
      }
      res.status(400).json({
        success: false,
        error: 'Invalid document type',
        message: 'Tipo de documento não encontrado ou não está ativo',
      });
      return;
    }

    if (!docType.is_active) {
      // Delete file if document type is not active
      if (req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (error) {
          console.error('❌ Erro ao deletar arquivo:', error);
        }
      }
      res.status(400).json({
        success: false,
        error: 'Invalid document type',
        message: 'Este tipo de documento não está disponível',
      });
      return;
    }

    // Validate expiry date is required if document type requires it
    if (docType.requires_expiry_date && (!expiry_date || expiry_date === '' || expiry_date === null)) {
      // Delete file if expiry date is required but not provided
      if (req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (error) {
          console.error('❌ Erro ao deletar arquivo:', error);
        }
      }
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Data de validade é obrigatória para este tipo de documento',
        path: ['expiry_date'],
      });
      return;
    }

    // Verificar se o arquivo existe
    if (!fs.existsSync(req.file.path)) {
      res.status(500).json({
        success: false,
        error: 'File save error',
        message: 'O arquivo foi enviado, mas não foi encontrado no servidor após o salvamento.',
      });
      return;
    }

    // Gerar URL do arquivo
    const fileUrl = getFileUrl(req.file.path);

    // Sanitize filename for storage
    const sanitizedFileName = req.file.originalname
      .replace(/[\/\\?%*:|"<>]/g, '') // Remove dangerous characters
      .replace(/\.\./g, '') // Remove parent directory references
      .trim() || 'document';

    // Criar documento no banco de dados
    const documentData: CreateDocumentData = {
      runner_id: req.user.id,
      document_type: document_type as DocumentType,
      file_name: sanitizedFileName,
      file_path: req.file.path,
      file_url: fileUrl || '',
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      expiry_date: expiry_date ? new Date(expiry_date) : null,
    };

    try {
      console.log('📤 Criando documento no banco de dados:', {
        runner_id: documentData.runner_id,
        document_type: documentData.document_type,
        file_name: documentData.file_name,
        file_size: documentData.file_size,
        expiry_date: documentData.expiry_date,
      });

      const document = await createDocument(documentData);

      console.log('✅ Documento criado com sucesso:', document.id);

      // Rename file to include document_id for better organization
      // Format: {document_id}_{timestamp}.{ext}
      if (req.file.path && document.id) {
        const oldPath = req.file.path;
        const ext = path.extname(oldPath);
        const runnerDir = path.dirname(oldPath);
        const newFilename = `${document.id}_${Date.now()}${ext}`;
        const newPath = path.join(runnerDir, newFilename);
        
        try {
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
            // Update document path and URL in database
            const fileUrl = getFileUrl(newPath);
            const { query } = await import('../config/database.js');
            await query(
              'UPDATE runner_documents SET file_path = $1, file_url = $2 WHERE id = $3',
              [newPath, fileUrl, document.id]
            );
            // Update document object for response
            document.file_path = newPath;
            document.file_url = fileUrl || '';
            console.log(`✅ Arquivo renomeado: ${oldPath} -> ${newPath}`);
          } else {
            console.warn(`⚠️ Arquivo não encontrado para renomear: ${oldPath}`);
          }
        } catch (renameError: any) {
          // Don't fail if rename fails, file is already saved
          console.warn('⚠️ Erro ao renomear arquivo (continuando com nome original):', renameError);
        }
      }

      // Send notification to admin about new document (optional)
      try {
        const runnerEmail = await getUserEmail(req.user.id);
        const runnerName = await getUserName(req.user.id);
        const adminEmail = await getAdminEmail();
        
        if (adminEmail && runnerEmail && runnerName) {
          // Get runner CPF from profile
          const { query } = await import('../config/database.js');
          const profileResult = await query(
            'SELECT cpf FROM profiles WHERE id = $1',
            [req.user.id]
          );
          const runnerCpf = profileResult.rows[0]?.cpf || 'N/A';

          await sendNotificationSafely({
            templateKey: 'new_document_uploaded',
            recipient: {
              email: adminEmail,
            },
            variables: {
              runnerName: runnerName,
              runnerCpf: runnerCpf,
              runnerEmail: runnerEmail,
              documentType: DOCUMENT_TYPE_LABELS[document_type] || document_type,
              fileName: req.file.originalname,
            },
          });
        }
      } catch (notificationError: any) {
        // Don't fail the upload if notification fails
        console.error('❌ Erro ao enviar notificação de novo documento:', notificationError);
      }

      res.status(201).json({
        success: true,
        data: document,
        message: 'Documento enviado com sucesso',
      });
    } catch (error: any) {
      console.error('❌ Erro ao criar documento:', {
        error: error.message,
        stack: error.stack,
        runner_id: req.user?.id,
        file_path: req.file?.path,
      });
      
      // Deletar arquivo se houver erro ao salvar no banco
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
          console.log('✅ Arquivo deletado após erro:', req.file.path);
        } catch (deleteError: any) {
          console.error('❌ Erro ao deletar arquivo após erro:', deleteError);
        }
      }
      
      // Re-throw para o errorHandler processar
      throw error;
    }
  }
);

/**
 * DELETE /api/runner/documents/:id
 * Delete a document (only if it belongs to the authenticated runner)
 */
export const deleteRunnerDocumentController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID do documento é obrigatório',
      });
      return;
    }

    // Buscar documento para verificar se existe e obter o caminho do arquivo
    const document = await getDocumentById(id);

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Documento não encontrado',
      });
      return;
    }

    // Verificar se o documento pertence ao runner autenticado
    if (document.runner_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você só pode deletar seus próprios documentos',
      });
      return;
    }

    // Verificar se o documento pode ser deletado (apenas pendentes ou rejeitados)
    if (document.status === 'approved') {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Não é possível deletar um documento aprovado',
      });
      return;
    }

    // Additional security: Verify document still exists and ownership before deletion
    const currentDocument = await getDocumentById(id);
    if (!currentDocument) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Documento não encontrado',
      });
      return;
    }

    // Double check ownership (prevent race conditions)
    if (currentDocument.runner_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não tem permissão para deletar este documento',
      });
      return;
    }

    // Deletar documento
    const deleted = await deleteDocument(id, req.user.id);

    if (!deleted) {
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Erro ao deletar documento',
      });
      return;
    }

    // Deletar arquivo físico
    if (document.file_path && fs.existsSync(document.file_path)) {
      try {
        fs.unlinkSync(document.file_path);
      } catch (error) {
        console.error('❌ Erro ao deletar arquivo físico:', error);
        // Não falhar a requisição se o arquivo não for encontrado
      }
    }

    res.json({
      success: true,
      message: 'Documento deletado com sucesso',
    });
  }
);

/**
 * GET /api/admin/documents
 * Get all documents with filters (admin only)
 */
export const getAllDocumentsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    // Verificar se é admin
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem visualizar todos os documentos',
      });
      return;
    }

    const filters: any = {};

    if (req.query.runner_id) {
      filters.runner_id = req.query.runner_id as string;
    }

    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    if (req.query.document_type) {
      filters.document_type = req.query.document_type as string;
    }

    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    const documents = await getAllDocuments(filters);

    res.json({
      success: true,
      data: documents,
    });
  }
);

/**
 * GET /api/admin/documents/pending
 * Get all pending documents (admin only)
 */
export const getPendingDocumentsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    // Verificar se é admin
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem visualizar documentos pendentes',
      });
      return;
    }

    const documents = await getPendingDocuments();

    res.json({
      success: true,
      data: documents,
    });
  }
);

/**
 * PUT /api/admin/documents/:id/status
 * Update document status (approve or reject) - admin only
 */
export const updateDocumentStatusController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    // Verificar se é admin
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem aprovar ou rejeitar documentos',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID do documento é obrigatório',
      });
      return;
    }

    // Validar body
    const validation = updateDocumentStatusSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    // Verificar se o documento existe
    const document = await getDocumentById(id);
    if (!document) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Documento não encontrado',
      });
      return;
    }

    // Validate that document is not already in the target status
    if (document.status === validation.data.status) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: `Documento já está com status "${validation.data.status === 'approved' ? 'aprovado' : 'rejeitado'}"`,
      });
      return;
    }

    // Sanitize rejection reason to prevent XSS
    let sanitizedRejectionReason: string | undefined = undefined;
    if (validation.data.rejection_reason) {
      // Remove HTML tags and dangerous characters
      sanitizedRejectionReason = validation.data.rejection_reason
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>]/g, '') // Remove remaining angle brackets
        .trim()
        .substring(0, 1000); // Limit length
    }

    // Atualizar status
    const updateData: UpdateDocumentStatusData = {
      status: validation.data.status,
      reviewed_by: req.user.id,
      rejection_reason: sanitizedRejectionReason,
    };

    const updatedDocument = await updateDocumentStatus(id, updateData);

    // Send notification to runner
    try {
      const runnerEmail = await getUserEmail(document.runner_id);
      const runnerName = await getUserName(document.runner_id);

      if (runnerEmail && runnerName) {
        const documentTypeLabel = DOCUMENT_TYPE_LABELS[document.document_type] || document.document_type;
        
        if (validation.data.status === 'approved') {
          // Notification for approval
          const expiryDateFormatted = document.expiry_date 
            ? `<p><strong>Validade:</strong> ${new Date(document.expiry_date).toLocaleDateString('pt-BR')}</p>`
            : '';

          await sendNotificationSafely({
            templateKey: 'document_approved',
            recipient: {
              email: runnerEmail,
              name: runnerName,
            },
            variables: {
              userName: runnerName,
              documentType: documentTypeLabel,
              fileName: document.file_name,
              expiryDate: expiryDateFormatted,
            },
          });
          console.log('✅ Notificação de aprovação enviada para runner');
        } else {
          // Notification for rejection
          await sendNotificationSafely({
            templateKey: 'document_rejected',
            recipient: {
              email: runnerEmail,
              name: runnerName,
            },
            variables: {
              userName: runnerName,
              documentType: documentTypeLabel,
              fileName: document.file_name,
              rejectionReason: validation.data.rejection_reason || 'Motivo não informado',
            },
          });
          console.log('✅ Notificação de rejeição enviada para runner');
        }
      }
    } catch (notificationError: any) {
      // Don't fail the status update if notification fails
      console.error('❌ Erro ao enviar notificação de status do documento:', notificationError);
    }

    res.json({
      success: true,
      data: updatedDocument,
      message: validation.data.status === 'approved' 
        ? 'Documento aprovado com sucesso' 
        : 'Documento rejeitado com sucesso',
    });
  }
);
