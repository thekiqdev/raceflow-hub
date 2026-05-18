import { apiClient } from './client.js';

export interface SystemSettings {
  id: string;
  platform_name: string;
  platform_logo_url?: string;
  platform_favicon_url?: string;
  contact_email?: string;
  contact_phone?: string;
  support_email?: string;
  support_phone?: string;
  company_address?: string;
  company_city?: string;
  company_state?: string;
  company_zip?: string;
  company_country: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  smtp_secure: boolean;
  payment_gateway: string;
  payment_test_mode: boolean;
  payment_public_key?: string;
  payment_secret_key?: string;
  enabled_modules: Record<string, boolean>;
  transfer_fee?: number;
  platform_fee?: number;
  platform_fee_type?: 'fixed' | 'percentage';
  platform_fee_min?: number;
  registration_edit_fee?: number;
  withdrawal_fee?: number;
  withdrawal_fee_type?: 'fixed' | 'percentage';
  leader_commission_percentage?: number;
  maintenance_mode: boolean;
  maintenance_message?: string;
  timezone: string;
  date_format: string;
  time_format: string;
  currency: string;
  language: string;
  old_results_url?: string;
  old_platform_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateSystemSettingsData {
  platform_name?: string;
  platform_logo_url?: string | null;
  platform_favicon_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  company_address?: string | null;
  company_city?: string | null;
  company_state?: string | null;
  company_zip?: string | null;
  company_country?: string;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
  smtp_from_email?: string | null;
  smtp_from_name?: string | null;
  smtp_secure?: boolean;
  payment_gateway?: string;
  payment_test_mode?: boolean;
  payment_public_key?: string | null;
  payment_secret_key?: string | null;
  enabled_modules?: Record<string, boolean>;
  transfer_fee?: number;
  platform_fee?: number;
  platform_fee_type?: 'fixed' | 'percentage';
  platform_fee_min?: number;
  registration_edit_fee?: number;
  withdrawal_fee?: number;
  leader_commission_percentage?: number;
  maintenance_mode?: boolean;
  maintenance_message?: string | null;
  timezone?: string;
  date_format?: string;
  time_format?: string;
  currency?: string;
  language?: string;
  old_results_url?: string | null;
  old_platform_url?: string | null;
}

/** Dados públicos de branding (nome, logo e links opcionais da home) */
export interface PublicBranding {
  platform_name: string;
  platform_logo_url: string | null;
  old_results_url?: string | null;
  old_platform_url?: string | null;
  /** Quando true, login público aceita apenas CPF (não e-mail). */
  login_cpf_only?: boolean;
}

/**
 * Get public branding (logo, nome e links opcionais old_results_url / old_platform_url).
 * Endpoint público — header, footer e home (sem chamar /admin/settings).
 */
export const getPublicBranding = async (): Promise<{
  success: boolean;
  data?: PublicBranding;
  error?: string;
}> => {
  return apiClient.get<PublicBranding>('/settings/branding');
};

/**
 * Get system settings (admin only)
 */
export const getSystemSettings = async (): Promise<{
  success: boolean;
  data?: SystemSettings;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<SystemSettings>('/admin/settings');
};

/**
 * Get enabled modules and transfer fee (for runners)
 */
export const getEnabledModules = async (): Promise<{
  success: boolean;
  data?: {
    enabled_modules: Record<string, boolean>;
    transfer_fee: number;
    platform_fee?: number;
    platform_fee_type?: 'fixed' | 'percentage';
    platform_fee_min?: number;
    withdrawal_fee?: number;
    withdrawal_fee_type?: 'fixed' | 'percentage';
    old_platform_url?: string | null;
  };
  error?: string;
  message?: string;
}> => {
  return apiClient.get<{
    enabled_modules: Record<string, boolean>;
    transfer_fee: number;
    platform_fee?: number;
    platform_fee_type?: 'fixed' | 'percentage';
    platform_fee_min?: number;
    withdrawal_fee?: number;
    withdrawal_fee_type?: 'fixed' | 'percentage';
    old_platform_url?: string | null;
  }>('/registrations/settings/modules');
};

/**
 * Update system settings
 */
export const updateSystemSettings = async (data: UpdateSystemSettingsData): Promise<{
  success: boolean;
  data?: SystemSettings;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<SystemSettings>('/admin/settings', data);
};

/**
 * Test email sending with current SMTP configuration
 */
export const testEmail = async (email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post<{ message: string }>('/admin/settings/test-email', { email });
};

/**
 * Execute fix-organizer-registrations script
 * Returns a ReadableStream for Server-Sent Events
 */
export const executeFixOrganizerRegistrationsScript = async (
  onLog: (message: string) => void,
  onComplete: (data: { success: boolean; summary?: any; logFile?: string; message?: string }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Não autenticado');
    }

    // Get API URL using same logic as client.ts
    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      
      if (envUrl && !envUrl.includes('localhost')) {
        return envUrl;
      }
      
      if (import.meta.env.PROD) {
        return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      }
      
      return 'http://localhost:3001/api';
    };

    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/admin/scripts/fix-organizer-registrations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar script');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('Resposta do servidor não contém stream de dados');
    }

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'log') {
              onLog(data.message);
            } else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                logFile: data.logFile,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    // Processar buffer restante
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            logFile: data.logFile,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar script');
  }
};

/**
 * Executa o script para desabilitar notificações de faturas no Asaas (clientes antigos).
 * Envia PUT notificationDisabled=true para cada cliente na tabela asaas_customers.
 */
export const executeDisableAsaasNotificationsScript = async (
  onLog: (message: string) => void,
  onComplete: (data: { success: boolean; summary?: { updated?: number; errors?: number; total?: number }; logFile?: string; message?: string }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Não autenticado');
    }

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) {
        return envUrl;
      }
      if (import.meta.env.PROD) {
        return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      }
      return 'http://localhost:3001/api';
    };

    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/admin/scripts/disable-asaas-notifications`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar script');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) {
      throw new Error('Resposta do servidor não contém stream de dados');
    }

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                logFile: data.logFile,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            logFile: data.logFile,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar script');
  }
};

/**
 * OK Etapa 6: Executa o backfill de platform_fee_amount em inscrições antigas.
 * Preenche a taxa da plataforma (inscrição) usando a configuração atual.
 */
export const executeBackfillPlatformFeeAmountScript = async (
  onLog: (message: string) => void,
  onComplete: (data: { success: boolean; summary?: { updated?: number; total?: number; errors?: number }; logFile?: string; message?: string }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Não autenticado');

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) return envUrl;
      if (import.meta.env.PROD) return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      return 'http://localhost:3001/api';
    };

    const response = await fetch(`${getApiUrl()}/admin/scripts/backfill-platform-fee-amount`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar script');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('Resposta do servidor não contém stream de dados');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                logFile: data.logFile,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            logFile: data.logFile,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar script');
  }
};

export interface EventRegistrationsIntegrityDiagnosis {
  event: { id: string; name: string };
  metrics: {
    total: number;
    with_kit?: number;
    visible: number;
    hidden: number;
    hidden_difference: number;
    without_kit: number;
    kits_soft_deleted: number;
    registrations_with_soft_deleted_kit?: number;
  };
  sample_hidden: Array<{
    id: string;
    runner_id: string | null;
    kit_id: string | null;
    category_id: string | null;
  }>;
  fk_rules: Array<{
    constraint_name: string;
    delete_rule: string;
  }>;
  status: 'OK' | 'INSCRICOES_OCULTAS' | 'POSSIVEL_DELECAO' | 'SOFT_DELETE_PROBLEMA';
  conclusion: string;
}

/**
 * Executa diagnóstico read-only de integridade de inscrições por evento.
 */
export const executeInvestigateEventRegistrationsIntegrityScript = async (
  params: { eventId?: string } | undefined,
  onLog: (message: string) => void,
  onComplete: (data: {
    success: boolean;
    summary?: EventRegistrationsIntegrityDiagnosis;
    message?: string;
  }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Não autenticado');

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) return envUrl;
      if (import.meta.env.PROD) return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      return 'http://localhost:3001/api';
    };

    const response = await fetch(`${getApiUrl()}/admin/scripts/investigate-event-registrations-integrity`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: params?.eventId || undefined }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar diagnóstico');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('Resposta do servidor não contém stream de dados');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar diagnóstico');
  }
};

export interface ForensicEventRegistrationsInvestigation {
  event: { id: string; name: string; created_at: string | null };
  registrations_found: number;
  global_distribution: Array<{ event_id: string; event_name?: string; total: number }>;
  runner_history: Array<{ runner_id: string | null; total: number }>;
  registrations_by_day: Array<{ date: string; total: number }>;
  possible_soft_deleted: number;
  related_data: {
    leader_invitations: number;
    transfers: number;
    registration_payments?: number;
    registration_history?: number;
    audit_signals: Array<{
      table: string;
      count: number;
      sample: Array<Record<string, unknown>>;
    }>;
  };
  fk_rules: Array<{
    constraint_name: string;
    delete_rule: string;
  }>;
  event_comparison: Array<{ id: string; name: string; registrations_count: number }>;
  anomaly_detected: boolean;
  conclusion: string;
}

/**
 * Executa investigação forense read-only de possíveis inscrições desaparecidas.
 */
export const executeForensicEventRegistrationsInvestigationScript = async (
  params: { eventId?: string } | undefined,
  onLog: (message: string) => void,
  onComplete: (data: {
    success: boolean;
    summary?: ForensicEventRegistrationsInvestigation;
    message?: string;
  }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Não autenticado');

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) return envUrl;
      if (import.meta.env.PROD) return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      return 'http://localhost:3001/api';
    };

    const response = await fetch(`${getApiUrl()}/admin/scripts/forensic-event-registrations-investigation`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: params?.eventId || undefined }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar investigação forense');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('Resposta do servidor não contém stream de dados');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar investigação forense');
  }
};

export interface RestoreRegistrationsFromBackupResult {
  eventId: string;
  mode: 'preview' | 'restore';
  backup_found: number;
  current_found: number;
  missing_count: number;
  eligible_count: number;
  skipped_count: number;
  requested_limit: number;
  batch_size: number;
  restored_count: number;
  restored_with_normal_kit: number;
  restored_with_null_kit: number;
  custom_field_values_restored: number;
  kit_null_applied: number;
  null_kit_promoted_count: number;
  skipped_real_dependency_count: number;
  failed_count: number;
  sample: Array<Record<string, unknown>>;
  missing_sample: Array<Record<string, unknown>>;
  skipped_sample: Array<{
    registration_id: string;
    reason: string;
    missing_dependencies: string[];
  }>;
  restored_ids: string[];
  failed_batches: Array<{
    batch_index: number;
    registration_ids: string[];
    error: string;
  }>;
  legacy_kit_snapshots: Array<{
    registration_id: string;
    original_kit_id: string;
    legacy_kit_name: string | null;
    persisted_in_registration: boolean;
  }>;
  post_restore_validation: {
    organizer_registrations_check: number;
    admin_registrations_check: number;
    event_detailed_report_base_check: number;
    checkin_search_base_check: number;
    transfer_references_check: number;
    custom_field_values_check: number;
  } | null;
  safety: {
    backup_database_url_present: boolean;
    event_exists_in_current: boolean;
    confirm_required: boolean;
    inserted_only_missing_by_id: boolean;
    kit_id_null_when_missing: boolean;
    limited_restore: boolean;
    batch_rollback: boolean;
    overwrites_existing_records: false;
    deletes_current_records: false;
  };
  logs: string[];
}

/**
 * Preview/restauração incremental de inscrições a partir de BACKUP_DATABASE_URL.
 */
export const executeRestoreRegistrationsFromBackupScript = async (
  params: { eventId: string; confirm?: boolean; mode?: 'preview' | 'restore'; limit?: number; batchSize?: number },
  onLog: (message: string) => void,
  onComplete: (data: {
    success: boolean;
    summary?: RestoreRegistrationsFromBackupResult;
    message?: string;
  }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Não autenticado');

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) return envUrl;
      if (import.meta.env.PROD) return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      return 'http://localhost:3001/api';
    };

    const endpoint = params.mode === 'restore'
      ? '/admin/scripts/restore-missing-registrations'
      : '/admin/scripts/restore-registrations-from-backup';

    const response = await fetch(`${getApiUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: params.eventId,
        confirm: params.confirm === true,
        mode: params.mode ?? 'preview',
        limit: params.limit,
        batchSize: params.batchSize,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar recuperação do backup');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('Resposta do servidor não contém stream de dados');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar recuperação do backup');
  }
};

export interface DeepForensicRegistrationsInvestigation {
  event: { id: string; name: string; created_at: string | null };
  findings: {
    registrations: Array<{
      table: string;
      exists: boolean;
      total_rows: number;
      event_id_matches?: number;
      registration_id_matches_current_event?: number;
      orphan_registration_id_count?: number;
      soft_delete: {
        columns_present: string[];
        deleted_at_count?: number;
        is_deleted_count?: number;
        inactive_count?: number;
        status_counts?: Array<{ status: string; total: number }>;
      };
      sample?: Array<Record<string, unknown>>;
    }>;
    orphan_records: Array<{
      table: string;
      orphan_count: number;
      sample: Array<Record<string, unknown>>;
    }>;
    financial_records: Array<{
      table: string;
      exists: boolean;
      event_id_matches?: number;
      registration_id_matches_current_event?: number;
      orphan_registration_id_count?: number;
      sample?: Array<Record<string, unknown>>;
    }>;
    triggers: Array<{
      trigger_schema: string;
      trigger_name: string;
      event_manipulation: string;
      event_object_table: string;
      action_timing: string;
      action_statement: string;
    }>;
    foreign_keys: Array<{
      constraint_name: string;
      source_table: string;
      source_column: string;
      target_table: string;
      target_column: string;
      delete_rule: string;
      update_rule: string;
    }>;
    hidden_tables: Array<{
      table: string;
      total_rows: number;
      columns: string[];
    }>;
    kits: {
      table: string | null;
      current_total: number;
      current_soft_deleted: number;
      backup_total?: number;
      backup_missing_in_current?: number;
      backup_missing_ids_sample?: string[];
    };
  };
  probable_cause:
    | 'DELECAO_REAL'
    | 'SOFT_DELETE'
    | 'CASCADE_DELETE'
    | 'DADOS_ORFAOS'
    | 'INCONSISTENCIA_ESTRUTURAL'
    | 'EVENTO_RECRIADO'
    | 'SEM_ANOMALIA_FORTE';
  recovery_recommendation: string;
}

/**
 * Executa investigação forense profunda read-only nas tabelas relacionadas às inscrições.
 */
export const executeDeepForensicRegistrationsInvestigationScript = async (
  params: { eventId?: string } | undefined,
  onLog: (message: string) => void,
  onComplete: (data: {
    success: boolean;
    summary?: DeepForensicRegistrationsInvestigation;
    message?: string;
  }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Não autenticado');

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) return envUrl;
      if (import.meta.env.PROD) return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      return 'http://localhost:3001/api';
    };

    const response = await fetch(`${getApiUrl()}/admin/scripts/deep-forensic-registrations-investigation`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: params?.eventId || undefined }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar investigação profunda');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('Resposta do servidor não contém stream de dados');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar investigação profunda');
  }
};

export type BackupRegistrationDependencyClassification =
  | 'RESTORABLE_SAFE'
  | 'RESTORABLE_WITH_NULL_KIT'
  | 'RESTORABLE_WITH_NULL_REGISTERED_BY'
  | 'RESTORABLE_WITH_NULL_TRANSFER_REFS'
  | 'BLOCKED_RUNNER_MISSING'
  | 'BLOCKED_CRITICAL_DEPENDENCY'
  | 'ALREADY_EXISTS';

export interface AnalyzeBackupRegistrationDependenciesResult {
  eventId: string;
  mode: 'analyze';
  totals: {
    backup: number;
    current: number;
    missing: number;
  };
  classification_counts: Record<BackupRegistrationDependencyClassification, number>;
  dependencies_checked: Array<{
    column: string;
    target_table: string;
    target_column: string;
    source: 'fk' | 'known';
    requiredForClassification: boolean;
  }>;
  dependency_matrix: Array<{
    dependency: string;
    target_table: string;
    missing_count: number;
    kind: 'CRITICAL' | 'FLEXIBLE' | 'POSSIBLY_FLEXIBLE';
    restorable_with_fallback: boolean;
    suggested_strategy: string;
    examples: Array<{
      registration_id: string;
      runner_id: string | null;
      runner_name: string | null;
      missing_value: string;
      can_restore_with_fallback: boolean;
    }>;
  }>;
  problematic_sample: Array<{
    registration_id: string;
    runner_id: string | null;
    runner_name: string | null;
    classification: BackupRegistrationDependencyClassification;
    missing_dependencies: Array<{
      column: string;
      value: string;
      target_table: string;
      target_column: string;
    }>;
    snapshots: {
      kit?: { id: string; table: string; name: string | null; attributes: Record<string, unknown> };
      category?: { id: string; table: string; name: string | null; attributes: Record<string, unknown> };
      modality?: { id: string; table: string; name: string | null; attributes: Record<string, unknown> };
    };
    suggested_action: string;
    can_restore_with_fallback: boolean;
  }>;
  summary_lines: string[];
  restore_plan: {
    immediate_full_restore_count: number;
    null_kit_restore_count: number;
    null_registered_by_restore_count: number;
    null_transfer_refs_restore_count: number;
    blocked_runner_missing_count: number;
    blocked_critical_dependency_count: number;
    requires_category_strategy_count: number;
    requires_modality_strategy_count: number;
    requires_manual_review_count: number;
    recommendation: string;
  };
  safety: {
    read_only: true;
    inserts: false;
    updates: false;
    deletes: false;
    alters: false;
    restore_executed: false;
  };
  logs: string[];
}

/**
 * Analyzer read-only de dependências das inscrições faltantes no backup.
 */
export const executeAnalyzeBackupRegistrationDependenciesScript = async (
  params: { eventId: string },
  onLog: (message: string) => void,
  onComplete: (data: {
    success: boolean;
    summary?: AnalyzeBackupRegistrationDependenciesResult;
    message?: string;
  }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Não autenticado');

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) return envUrl;
      if (import.meta.env.PROD) return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      return 'http://localhost:3001/api';
    };

    const response = await fetch(`${getApiUrl()}/admin/scripts/analyze-backup-registration-dependencies`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: params.eventId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar analyzer do backup');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('Resposta do servidor não contém stream de dados');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar analyzer do backup');
  }
};

export interface AnalyzeNullKitCompatibilityResult {
  generated_at: string;
  scope: {
    roots_scanned: string[];
    files_scanned: number;
  };
  totals: Record<'ALTO' | 'MÉDIO' | 'BAIXO', number>;
  findings: Array<{
    file: string;
    line: number;
    type: 'INNER_JOIN' | 'NULL_FILTER' | 'REQUIRED_RENDER' | 'POSSIBLE_HIDE';
    risk: 'ALTO' | 'MÉDIO' | 'BAIXO';
    impact: string;
    suggestion: string;
    excerpt: string;
  }>;
  safe_areas: string[];
  areas_needing_adjustment: string[];
  recommendation: string[];
  safety: {
    read_only: true;
    inserts: false;
    updates: false;
    deletes: false;
    alters: false;
    restore_executed: false;
  };
}

/**
 * Analyzer read-only de compatibilidade com registrations.kit_id NULL.
 */
export const executeAnalyzeNullKitCompatibilityScript = async (
  onLog: (message: string) => void,
  onComplete: (data: {
    success: boolean;
    summary?: AnalyzeNullKitCompatibilityResult;
    message?: string;
  }) => void,
  onError: (error: string) => void
): Promise<void> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Não autenticado');

    const getApiUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes('localhost')) return envUrl;
      if (import.meta.env.PROD) return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
      return 'http://localhost:3001/api';
    };

    const response = await fetch(`${getApiUrl()}/admin/scripts/analyze-null-kit-compatibility`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(errorData.error || errorData.message || 'Erro ao executar análise kit NULL');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error('Resposta do servidor não contém stream de dados');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') onLog(data.message);
            else if (data.type === 'complete') {
              onComplete({
                success: data.success,
                summary: data.summary,
                message: data.message,
              });
            } else if (data.type === 'error') {
              onError(data.message || 'Erro desconhecido');
            }
          } catch (e) {
            console.error('Erro ao processar linha SSE:', e);
          }
        }
      }
    }

    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'complete') {
          onComplete({
            success: data.success,
            summary: data.summary,
            message: data.message,
          });
        }
      } catch (e) {
        console.error('Erro ao processar buffer final:', e);
      }
    }
  } catch (error: any) {
    onError(error.message || 'Erro ao executar análise kit NULL');
  }
};




