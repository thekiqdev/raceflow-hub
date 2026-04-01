import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { lookupCpfForRegistration } from '../services/cpfLookupService.js';
import {
  fetchCpfBrasilHealth,
  isCpfBrasilFeatureEnabled,
  isCpfBrasilIntegrationConfigured,
} from '../services/cpfBrasilClient.js';
import { issueCpfLookupProof, registerRequiresCpfLookupProof } from '../services/cpfLookupProof.js';
import { recordCpfLookupOutcome } from '../services/cpfLookupMetricsService.js';
import { notifyCpfLookupFailureWebhook } from '../services/cpfLookupAlerts.js';
import { isCpfRegisteredInPlatform } from '../services/authService.js';
import { isValidCpfDigits, normalizeCpfDigits } from '../utils/cpf.js';

const bodySchema = z.object({
  cpf: z.string().min(1, 'cpf é obrigatório'),
});

/**
 * POST /api/auth/lookup-cpf
 * Body: { cpf: string } — aceita com ou sem máscara.
 * Resposta de sucesso inclui dados para preencher cadastro (Fase 3 usará na UI).
 */
export const lookupCpfController = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'CPF inválido',
      code: 'LOCAL_INVALID_FORMAT',
      meta: { request_id: undefined },
    });
    return;
  }

  const result = await lookupCpfForRegistration(parsed.data.cpf);

  await recordCpfLookupOutcome(result.success);

  if (!result.success) {
    if (result.code !== 'LOCAL_INVALID_FORMAT') {
      void notifyCpfLookupFailureWebhook({
        requestId: result.requestId,
        code: result.code,
      });
    }
    res.status(400).json({
      success: false,
      message: result.message,
      code: result.code,
      meta: { request_id: result.requestId },
    });
    return;
  }

  const d = result.data!;
  const proofGender = d.gender === 'M' || d.gender === 'F' ? d.gender : '__MANUAL__';
  const proof = issueCpfLookupProof({
    cpf: d.cpf,
    full_name: d.full_name,
    birth_date: d.birth_date,
    gender: proofGender,
  });

  res.json({
    success: true,
    data: d,
    proof,
    meta: { request_id: result.requestId, code: result.code },
  });
});

/**
 * GET /api/auth/cpf-brasil-health
 * Verifica conectividade com GET /health do provedor (sem PII).
 */
/**
 * GET /api/auth/cpf-registration-config
 * Sem segredos: flags para o front alinhar UX (Fase 6).
 */
export const cpfRegistrationConfigController = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      registration_requires_lookup_proof: registerRequiresCpfLookupProof(),
      cpf_brasil_integration_configured: isCpfBrasilIntegrationConfigured(),
      cpf_brasil_enabled: isCpfBrasilFeatureEnabled(),
    },
  });
});

/**
 * POST /api/auth/check-cpf-registered
 * Body: { cpf }. Resposta: { registered: boolean } — sem expor e-mail ou outros dados.
 */
export const checkCpfRegisteredController = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'CPF inválido',
      code: 'LOCAL_INVALID_FORMAT',
    });
    return;
  }
  const digits = normalizeCpfDigits(parsed.data.cpf);
  if (digits.length !== 11 || !isValidCpfDigits(digits)) {
    res.status(400).json({
      success: false,
      message: 'CPF inválido',
      code: 'LOCAL_INVALID_FORMAT',
    });
    return;
  }
  const registered = await isCpfRegisteredInPlatform(digits);
  res.json({
    success: true,
    data: { registered },
  });
});

export const cpfBrasilHealthController = asyncHandler(async (_req: Request, res: Response) => {
  const h = await fetchCpfBrasilHealth();
  if (!h.ok) {
    res.status(503).json({
      success: false,
      message: 'CPF Brasil indisponível',
      provider_status: h.status,
      internal: h.internalCode,
    });
    return;
  }
  res.json({
    success: true,
    message: 'CPF Brasil OK',
    provider_status: h.status,
  });
});
