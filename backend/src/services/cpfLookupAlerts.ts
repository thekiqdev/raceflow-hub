import axios from 'axios';

/**
 * Fase 6: opcional — POST para URL em CPF_BRASIL_FAILURE_WEBHOOK_URL quando a falha
 * não é apenas formato local (ex.: timeout, 5xx, auth do provedor). Sem PII.
 */
export async function notifyCpfLookupFailureWebhook(payload: {
  requestId: string;
  code: string;
}): Promise<void> {
  const url = process.env.CPF_BRASIL_FAILURE_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await axios.post(
      url,
      {
        source: 'cronoteam_cpf_lookup',
        event: 'lookup_failure',
        request_id: payload.requestId,
        code: payload.code,
        at: new Date().toISOString(),
      },
      { timeout: 5000, validateStatus: () => true }
    );
  } catch (e) {
    console.error('[cpf-lookup] webhook de alerta falhou', e);
  }
}
