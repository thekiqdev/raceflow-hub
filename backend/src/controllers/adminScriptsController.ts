import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { hasRole } from '../services/userRolesService.js';
import { query } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { updateCustomerNotificationDisabled } from '../services/asaasService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import investigateEventRegistrationsIntegrity from '../scripts/investigateEventRegistrationsIntegrity.js';
import forensicEventRegistrationsInvestigation from '../scripts/forensicEventRegistrationsInvestigation.js';
import restoreRegistrationsFromBackup from '../scripts/restoreRegistrationsFromBackup.js';
import deepForensicRegistrationsInvestigation from '../scripts/deepForensicRegistrationsInvestigation.js';
import analyzeBackupRegistrationDependencies from '../scripts/analyzeBackupRegistrationDependencies.js';
import analyzeNullKitCompatibility from '../scripts/analyzeNullKitCompatibility.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * POST /api/admin/scripts/fix-organizer-registrations
 * Executa o script para corrigir inscrições criadas por organizadores
 * Apenas para administradores
 */
export const fixOrganizerRegistrationsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  // Configurar headers para streaming de logs
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Desabilitar buffering do nginx

  const logs: string[] = [];
  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    res.write(`data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`);
  };

  try {
    logMessage('🔍 Verificando inscrições criadas por organizadores...\n');

    // Buscar inscrições onde o organizador criou para seu próprio evento
    const registrations = await query(
      `SELECT 
        r.id,
        r.runner_id,
        r.event_id,
        r.registered_by,
        r.total_amount,
        r.status,
        r.payment_status,
        r.payment_method,
        e.title as event_title,
        e.organizer_id,
        p.full_name as organizer_name
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      LEFT JOIN profiles p ON e.organizer_id = p.id
      WHERE r.registered_by = e.organizer_id
        AND r.registered_by != r.runner_id
        AND (r.total_amount > 0 OR r.payment_status = 'paid' OR r.payment_method != 'free_bonus')
        AND r.status != 'cancelled'
      ORDER BY r.created_at DESC`
    );

    if (registrations.rows.length === 0) {
      logMessage('✅ Nenhuma inscrição criada por organizador precisa ser corrigida.');
      res.write(`data: ${JSON.stringify({ type: 'complete', success: true, message: 'Nenhuma inscrição precisa ser corrigida' })}\n\n`);
      res.end();
      return;
    }

    logMessage(`📊 Encontradas ${registrations.rows.length} inscrições para corrigir:\n`);

    let updated = 0;
    let errors = 0;
    let totalAmountZeroed = 0;

    for (const reg of registrations.rows) {
      try {
        logMessage(`  - Corrigindo inscrição ID ${reg.id}`);
        logMessage(`    Evento: ${reg.event_title}`);
        logMessage(`    Organizador: ${reg.organizer_name || reg.organizer_id}`);
        logMessage(`    Valor atual: R$ ${parseFloat(reg.total_amount || 0).toFixed(2)}`);
        logMessage(`    Status atual: ${reg.status} / ${reg.payment_status} / ${reg.payment_method}`);
        logMessage(`    Novo status: confirmed / convidado / free_bonus`);
        logMessage(`    Novo valor: R$ 0,00`);

        await query(
          `UPDATE registrations 
           SET total_amount = 0,
               payment_method = 'free_bonus',
               payment_status = 'convidado',
               status = 'confirmed',
               updated_at = NOW()
           WHERE id = $1`,
          [reg.id]
        );

        if (parseFloat(reg.total_amount || 0) > 0) {
          totalAmountZeroed++;
        }

        logMessage(`    ✅ Corrigida com sucesso!\n`);
        updated++;
      } catch (error: any) {
        logMessage(`    ❌ Erro ao corrigir: ${error.message}\n`);
        errors++;
      }
    }

    const summary = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Resumo:
   ✅ Inscrições corrigidas: ${updated}
   💰 Valores zerados: ${totalAmountZeroed}
   ❌ Erros: ${errors}
   📦 Total processado: ${registrations.rows.length}

💡 Nota: As inscrições corrigidas não serão mais incluídas no cálculo de receita/saque
   do organizador, pois o valor já foi recebido diretamente pelo organizador.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    logMessage(summary);

    // Salvar log em arquivo .txt
    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFileName = `fix-organizer-registrations-${Date.now()}.txt`;
    const logFilePath = path.join(logDir, logFileName);
    const fullLog = logs.join('\n') + '\n\n' + summary;
    
    fs.writeFileSync(logFilePath, fullLog, 'utf-8');

    logMessage(`📄 Log salvo em: ${logFilePath}`);

    res.write(`data: ${JSON.stringify({ 
      type: 'complete', 
      success: true, 
      summary: {
        updated,
        totalAmountZeroed,
        errors,
        total: registrations.rows.length,
      },
      logFile: logFileName,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`❌ Erro ao executar script: ${error.message}`);
    
    // Salvar log de erro
    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFileName = `fix-organizer-registrations-error-${Date.now()}.txt`;
    const logFilePath = path.join(logDir, logFileName);
    const errorLog = logs.join('\n') + '\n\n❌ Erro: ' + error.message;
    
    fs.writeFileSync(logFilePath, errorLog, 'utf-8');

    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      success: false, 
      message: error.message,
      logFile: logFileName,
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/admin/scripts/disable-asaas-notifications
 * Desabilita notificações de faturas no Asaas para todos os clientes da tabela asaas_customers.
 * Apenas para administradores.
 */
export const disableAsaasNotificationsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logs: string[] = [];
  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    res.write(`data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`);
  };

  try {
    logMessage('🔍 Buscando clientes Asaas em asaas_customers...\n');

    const rows = await query(
      'SELECT user_id, asaas_customer_id FROM asaas_customers ORDER BY created_at ASC'
    );

    if (rows.rows.length === 0) {
      logMessage('✅ Nenhum cliente Asaas encontrado na base.');
      res.write(`data: ${JSON.stringify({ type: 'complete', success: true, message: 'Nenhum cliente para atualizar' })}\n\n`);
      res.end();
      return;
    }

    logMessage(`📊 Encontrados ${rows.rows.length} clientes. Enviando PUT notificationDisabled=true para cada um...\n`);

    let updated = 0;
    let errors = 0;

    for (const row of rows.rows) {
      try {
        logMessage(`  - Asaas customer ${row.asaas_customer_id} (user_id: ${row.user_id})`);
        const result = await updateCustomerNotificationDisabled(row.asaas_customer_id);
        if (result.ok) {
          logMessage(`    ✅ Notificações desabilitadas.\n`);
          updated++;
        } else {
          logMessage(`    ❌ Erro: ${result.error}\n`);
          errors++;
        }
        // Pequeno delay para respeitar rate limit da API Asaas
        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        logMessage(`    ❌ Exceção: ${err.message}\n`);
        errors++;
      }
    }

    const summary = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Resumo (Desabilitar notificações Asaas):
   ✅ Atualizados com sucesso: ${updated}
   ❌ Erros: ${errors}
   📦 Total processado: ${rows.rows.length}

💡 Os clientes não receberão mais e-mails/SMS de cobrança gerados pelo Asaas.
   O Cronoteam continua enviando as próprias notificações de inscrição/confirmação.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    logMessage(summary);

    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFileName = `disable-asaas-notifications-${Date.now()}.txt`;
    const logFilePath = path.join(logDir, logFileName);
    fs.writeFileSync(logFilePath, logs.join('\n') + '\n\n' + summary, 'utf-8');

    logMessage(`📄 Log salvo em: ${logFilePath}`);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: { updated, errors, total: rows.rows.length },
      logFile: logFileName,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`❌ Erro ao executar script: ${error.message}`);

    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFileName = `disable-asaas-notifications-error-${Date.now()}.txt`;
    const logFilePath = path.join(logDir, logFileName);
    fs.writeFileSync(logFilePath, logs.join('\n') + '\n\n❌ Erro: ' + error.message, 'utf-8');

    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
      logFile: logFileName,
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/admin/scripts/backfill-platform-fee-amount
 * OK Etapa 6: Preenche platform_fee_amount em inscrições antigas (usa taxa atual da plataforma).
 * Idempotente: só atualiza onde platform_fee_amount IS NULL ou 0 e total_amount > 0.
 */
export const backfillPlatformFeeAmountController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logs: string[] = [];
  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    res.write(`data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`);
  };

  try {
    logMessage('🔍 Backfill: Atualizar taxa da plataforma em inscrições antigas...\n');
    logMessage('   Critério: platform_fee_amount IS NULL ou 0 e total_amount > 0');
    logMessage('   Cálculo: platform_fee_amount = total_amount - calculate_value_without_platform_fee(...)\n');

    const updateResult = await query(`
      UPDATE registrations r
      SET
        platform_fee_amount = ROUND(
          r.total_amount - calculate_value_without_platform_fee(
            r.total_amount,
            get_platform_fee(),
            get_platform_fee_type()
          ),
          2
        ),
        platform_fee_backfilled = TRUE
      WHERE (r.platform_fee_amount IS NULL OR r.platform_fee_amount = 0)
        AND r.total_amount > 0
    `);

    const updated = updateResult.rowCount ?? 0;
    logMessage(`✅ Inscrições atualizadas: ${updated}\n`);

    const summary = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Resumo (OK Etapa 6):
   ✅ Inscrições com platform_fee_amount preenchido: ${updated}

💡 Essas inscrições passam a ter a taxa da plataforma (inscrição) estimada com a
   configuração atual. Relatórios de organizador e admin passam a separar valor e taxas.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    logMessage(summary);

    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFileName = `backfill-platform-fee-amount-${Date.now()}.txt`;
    const logFilePath = path.join(logDir, logFileName);
    fs.writeFileSync(logFilePath, logs.join('\n') + '\n\n' + summary, 'utf-8');
    logMessage(`📄 Log salvo em: ${logFilePath}`);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: { updated, total: updated, errors: 0 },
      logFile: logFileName,
      message: `${updated} inscrição(ões) atualizada(s)`,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`❌ Erro ao executar backfill: ${error.message}`);

    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFileName = `backfill-platform-fee-amount-error-${Date.now()}.txt`;
    const logFilePath = path.join(logDir, logFileName);
    fs.writeFileSync(logFilePath, logs.join('\n') + '\n\n❌ Erro: ' + error.message, 'utf-8');

    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
      logFile: logFileName,
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/admin/scripts/investigate-event-registrations-integrity
 * Diagnostica possíveis inscrições ocultas/inconsistentes após exclusão de kits.
 * 100% read-only.
 */
export const investigateEventRegistrationsIntegrityController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logs: string[] = [];
  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    res.write(`data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`);
  };

  try {
    const eventId = typeof req.body?.eventId === 'string' && req.body.eventId.trim()
      ? req.body.eventId.trim()
      : undefined;

    logMessage('🔍 Investigando integridade de inscrições do evento (read-only)...');
    if (eventId) {
      logMessage(`   Evento informado: ${eventId}`);
    } else {
      logMessage('   Nenhum evento informado. Usando evento mais recente.');
    }

    const diagnosis = await investigateEventRegistrationsIntegrity({ eventId });

    logMessage(`📌 Evento: ${diagnosis.event.name} (${diagnosis.event.id})`);
    logMessage(`📊 Total de inscrições: ${diagnosis.metrics.total}`);
    logMessage(`📦 Com kit: ${diagnosis.metrics.with_kit}`);
    logMessage(`📭 Sem kit: ${diagnosis.metrics.without_kit}`);
    logMessage(`👁️ Visíveis com INNER JOIN em kits: ${diagnosis.metrics.visible}`);
    logMessage(`🚨 Ocultas por kit inexistente: ${diagnosis.metrics.hidden}`);
    logMessage(`↔️ Diferença total vs INNER JOIN: ${diagnosis.metrics.hidden_difference}`);
    logMessage(`🗑️ Kits soft deletados: ${diagnosis.metrics.kits_soft_deleted}`);
    logMessage(`🧩 Inscrições com kit soft deletado: ${diagnosis.metrics.registrations_with_soft_deleted_kit}`);

    if (diagnosis.sample_hidden.length > 0) {
      logMessage('Amostra de inscrições ocultas:');
      diagnosis.sample_hidden.forEach((row) => {
        logMessage(`  - registration=${row.id}, runner=${row.runner_id ?? '-'}, kit=${row.kit_id ?? '-'}, category=${row.category_id ?? '-'}`);
      });
    }

    logMessage(`Status: ${diagnosis.status}`);
    logMessage(`Conclusão: ${diagnosis.conclusion}`);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: diagnosis,
      message: diagnosis.conclusion,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`❌ Erro ao executar diagnóstico: ${error.message}`);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/admin/scripts/forensic-event-registrations-investigation
 * Investigação forense read-only para rastrear possíveis inscrições desaparecidas.
 */
export const forensicEventRegistrationsInvestigationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logs: string[] = [];
  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    res.write(`data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`);
  };

  try {
    const eventId = typeof req.body?.eventId === 'string' && req.body.eventId.trim()
      ? req.body.eventId.trim()
      : undefined;

    logMessage('Iniciando investigação forense de inscrições (read-only)...');
    logMessage(eventId ? `Evento informado: ${eventId}` : 'Nenhum evento informado. Usando evento mais recente.');

    const investigation = await forensicEventRegistrationsInvestigation({ eventId });

    logMessage(`Evento: ${investigation.event.name} (${investigation.event.id})`);
    logMessage(`Inscrições encontradas no evento: ${investigation.registrations_found}`);
    logMessage(`Possíveis soft-deleted: ${investigation.possible_soft_deleted}`);
    logMessage(`Leader invitations relacionadas: ${investigation.related_data.leader_invitations}`);
    logMessage(`Transferências globais encontradas: ${investigation.related_data.transfers}`);
    logMessage(`Sinais em auditoria/logs: ${investigation.related_data.audit_signals.reduce((sum, signal) => sum + signal.count, 0)}`);
    logMessage(`Anomalia detectada: ${investigation.anomaly_detected ? 'sim' : 'não'}`);
    logMessage(`Conclusão: ${investigation.conclusion}`);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: investigation,
      message: investigation.conclusion,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`Erro ao executar investigação forense: ${error.message}`);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/admin/scripts/restore-registrations-from-backup
 * Preview/restauração incremental de inscrições a partir de BACKUP_DATABASE_URL.
 */
export const restoreRegistrationsFromBackupController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logs: string[] = [];
  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    res.write(`data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`);
  };

  try {
    const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : '';
    const confirm = req.body?.confirm === true;
    const mode = req.body?.mode === 'restore' ? 'restore' : 'preview';
    const limit = Number(req.body?.limit ?? 10);
    const batchSize = Number(req.body?.batchSize ?? 50);
    const applyNullKitFallback = req.body?.applyNullKitFallback !== false;
    const applyNullTransferFallback = req.body?.applyNullTransferFallback !== false;

    if (!eventId) {
      throw new Error('eventId é obrigatório para recuperar inscrições do backup');
    }

    logMessage(confirm && mode === 'restore'
      ? 'Iniciando restauração incremental de inscrições do backup...'
      : 'Iniciando preview de recuperação de inscrições do backup...');
    logMessage(`Evento: ${eventId}`);
    logMessage(confirm && mode === 'restore' ? `Modo: restore (confirm=true, limit=${limit}, batchSize=${batchSize})` : 'Modo: preview (nenhum dado será inserido)');
    logMessage(`Limit recebido: ${limit}`);
    logMessage(`Batch size recebido: ${batchSize}`);
    logMessage(`Fallbacks aprovados: kit NULL=${applyNullKitFallback}; transfer refs NULL=${applyNullTransferFallback}`);

    const result = await restoreRegistrationsFromBackup({
      eventId,
      confirm,
      mode,
      limit,
      batchSize,
      applyNullKitFallback,
      applyNullTransferFallback,
    });

    logMessage(`Inscrições no backup: ${result.backup_found}`);
    logMessage(`Inscrições atuais: ${result.current_found}`);
    logMessage(`Inscrições faltantes: ${result.missing_count}`);
    logMessage(`Limit aplicado: ${result.requested_limit}`);
    logMessage(`Batch size aplicado: ${result.batch_size}`);
    logMessage(`Batches executados: ${result.batches_executed}`);
    logMessage(`Elegíveis: ${result.eligible_count}`);
    logMessage(`Ignoradas: ${result.skipped_count}`);
    logMessage(`RESTORABLE_WITH_NULL_KIT promoted to eligible: ${result.null_kit_promoted_count}`);
    logMessage(`RESTORABLE_WITH_NULL_TRANSFER_REFS promoted to eligible: ${result.null_transfer_refs_promoted_count}`);
    logMessage(`Inscrições restauradas: ${result.restored_count}`);
    logMessage(`Restauradas com kit normal: ${result.restored_with_normal_kit}`);
    logMessage(`Restauradas com kit NULL fallback: ${result.restored_with_null_kit}`);
    logMessage(`Restauradas com transfer refs NULL fallback: ${result.restored_with_null_transfer_refs}`);
    logMessage(`kit_id NULL aplicado: ${result.kit_null_applied}`);
    logMessage(`transfer refs NULL aplicado: ${result.transfer_refs_null_applied}`);
    logMessage(`Pagamentos financeiros restaurados: ${result.financial_payments_restored}`);
    logMessage(`Ignoradas por dependência real: ${result.skipped_real_dependency_count}`);
    logMessage(`Falhas: ${result.failed_count}`);
    logMessage('Garantias: sem overwrite, sem delete, insert apenas por ID faltante.');

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: result,
      message: confirm && mode === 'restore'
        ? `${result.restored_count} inscrição(ões) restaurada(s)`
        : `Preview concluído: ${result.missing_count} inscrição(ões) faltante(s)`,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`Erro ao executar recuperação do backup: ${error.message}`);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
    })}\n\n`);
    res.end();
    return;
  }
});

export const restoreMissingRegistrationsController = restoreRegistrationsFromBackupController;

/**
 * POST /api/admin/scripts/deep-forensic-registrations-investigation
 * Investigação forense profunda read-only sobre inscrições e tabelas relacionadas.
 */
export const deepForensicRegistrationsInvestigationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logs: string[] = [];
  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    logs.push(logLine);
    res.write(`data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`);
  };

  try {
    const eventId = typeof req.body?.eventId === 'string' && req.body.eventId.trim()
      ? req.body.eventId.trim()
      : undefined;

    logMessage('Iniciando investigação forense profunda (read-only)...');
    logMessage(eventId ? `Evento informado: ${eventId}` : 'Nenhum evento informado. Usando evento mais recente.');

    const investigation = await deepForensicRegistrationsInvestigation({ eventId });
    const registrationsFinding = investigation.findings.registrations.find((item) => item.table === 'registrations');
    const orphanTotal = investigation.findings.orphan_records.reduce((sum, item) => sum + item.orphan_count, 0);
    const financialSignals = investigation.findings.financial_records.reduce(
      (sum, item) => sum + (item.event_id_matches ?? 0) + (item.orphan_registration_id_count ?? 0),
      0
    );

    logMessage(`Evento: ${investigation.event.name} (${investigation.event.id})`);
    logMessage(`Inscrições atuais do evento: ${registrationsFinding?.event_id_matches ?? 0}`);
    logMessage(`Tabelas relacionadas inspecionadas: ${investigation.findings.registrations.filter((item) => item.exists).length}`);
    logMessage(`Registros órfãos por registration_id: ${orphanTotal}`);
    logMessage(`Sinais financeiros relacionados/órfãos: ${financialSignals}`);
    logMessage(`Triggers encontradas: ${investigation.findings.triggers.length}`);
    logMessage(`FKs encontradas: ${investigation.findings.foreign_keys.length}`);
    logMessage(`Causa provável: ${investigation.probable_cause}`);
    logMessage(`Recomendação: ${investigation.recovery_recommendation}`);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: investigation,
      message: investigation.recovery_recommendation,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`Erro ao executar investigação forense profunda: ${error.message}`);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/admin/scripts/analyze-backup-registration-dependencies
 * Analyzer read-only das dependências das inscrições faltantes no backup.
 */
export const analyzeBackupRegistrationDependenciesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    res.write(`data: ${JSON.stringify({ type: 'log', message: `[${timestamp}] ${message}` })}\n\n`);
  };

  try {
    const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : '';
    if (!eventId) {
      throw new Error('eventId é obrigatório para analisar dependências do backup');
    }

    logMessage('Iniciando Restore Analyzer em modo read-only...');
    logMessage(`Evento: ${eventId}`);
    logMessage('Nenhum INSERT/UPDATE/DELETE/ALTER será executado.');

    const analysis = await analyzeBackupRegistrationDependencies({ eventId });

    for (const line of analysis.summary_lines) {
      logMessage(line);
    }
    logMessage(`Dependências verificadas: ${analysis.dependencies_checked.map((item) => item.column).join(', ')}`);
    logMessage('Matriz de dependências faltantes:');
    for (const row of analysis.dependency_matrix) {
      logMessage(
        `${row.dependency} inexistente: ${row.missing_count} | kind=${row.kind} | fallback=${row.restorable_with_fallback ? 'sim' : 'não'} | estratégia=${row.suggested_strategy}`
      );
      for (const example of row.examples.slice(0, 3)) {
        logMessage(
          `  exemplo registration=${example.registration_id}, runner=${example.runner_name ?? example.runner_id ?? '-'}, valor=${example.missing_value}`
        );
      }
    }
    logMessage(`Amostra problemática: ${analysis.problematic_sample.length} inscrição(ões)`);
    for (const item of analysis.problematic_sample.slice(0, 10)) {
      logMessage(`Registration: ${item.registration_id}`);
      logMessage(`Runner: ${item.runner_name ?? item.runner_id ?? '-'}`);
      logMessage(`Kit original: ${item.snapshots.kit?.name ?? item.snapshots.kit?.id ?? '-'}`);
      logMessage(`Categoria: ${item.snapshots.category?.name ?? item.snapshots.category?.id ?? '-'}`);
      logMessage(`Modalidade: ${item.snapshots.modality?.name ?? item.snapshots.modality?.id ?? '-'}`);
      logMessage(`Problemas: ${item.missing_dependencies.map((dep) => `${dep.column} inexistente`).join(', ') || '-'}`);
      logMessage(`Ação sugerida: ${item.suggested_action}`);
    }
    logMessage(`Plano: ${analysis.restore_plan.recommendation}`);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: analysis,
      message: analysis.restore_plan.recommendation,
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`Erro ao executar Restore Analyzer: ${error.message}`);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/admin/scripts/analyze-null-kit-compatibility
 * Analyzer read-only de compatibilidade do sistema com registrations.kit_id NULL.
 */
export const analyzeNullKitCompatibilityController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar este script',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const logMessage = (message: string) => {
    const timestamp = new Date().toISOString();
    res.write(`data: ${JSON.stringify({ type: 'log', message: `[${timestamp}] ${message}` })}\n\n`);
  };

  try {
    logMessage('Iniciando análise read-only de compatibilidade com kit_id NULL...');
    logMessage('Nenhum restore/INSERT/UPDATE/DELETE/ALTER será executado.');

    const analysis = await analyzeNullKitCompatibility();

    logMessage(`Arquivos analisados: ${analysis.scope.files_scanned}`);
    logMessage(`TOTAL DE RISCOS - ALTO: ${analysis.totals.ALTO}, MÉDIO: ${analysis.totals.MÉDIO}, BAIXO: ${analysis.totals.BAIXO}`);
    logMessage(`ÁREAS SEGURAS: ${analysis.safe_areas.join(', ') || '-'}`);
    logMessage(`ÁREAS QUE PRECISAM AJUSTE: ${analysis.areas_needing_adjustment.join(', ') || '-'}`);
    for (const finding of analysis.findings.slice(0, 30)) {
      logMessage(`${finding.risk} ${finding.type} ${finding.file}:${finding.line} - ${finding.impact}`);
      logMessage(`Sugestão: ${finding.suggestion}`);
    }

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      summary: analysis,
      message: analysis.recommendation.join(' '),
    })}\n\n`);
    res.end();
    return;
  } catch (error: any) {
    logMessage(`Erro ao executar análise de compatibilidade kit NULL: ${error.message}`);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      success: false,
      message: error.message,
    })}\n\n`);
    res.end();
    return;
  }
});
