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

/** Dados públicos de branding (nome e logo da plataforma) */
export interface PublicBranding {
  platform_name: string;
  platform_logo_url: string | null;
}

/**
 * Get public branding (logo + platform name). Endpoint público, usado no header e no footer.
 * Configurado em Admin > Configurações > Geral > Logo da Plataforma.
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




