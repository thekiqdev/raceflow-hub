# Fase 6 — Rollout gradual e monitoramento

## Objetivo

Dar visibilidade operacional à integração CPF Brasil (cadastro), permitir desligar ou relaxar requisitos por ambiente e alertar falhas de integração sem expor segredos ao navegador.

## Migração

- `108_cpf_lookup_metrics_daily.sql` — tabela `cpf_lookup_metrics_daily` (contadores por dia, UTC/data do servidor PostgreSQL).

Execute as migrações habituais (`run-migrations` / pipeline).

## Variáveis de ambiente (backend)

| Variável | Função |
|----------|--------|
| `CPF_BRASIL_API_BASE_URL` | URL base do provedor (já existente). |
| `CPF_BRASIL_API_KEY` | Chave (já existente). |
| `CPF_BRASIL_ENABLED` | `false` desliga chamadas à API (já existente). |
| `CPF_REGISTER_REQUIRES_LOOKUP_PROOF` | `false` força **não** exigir JWT de lookup no `register` mesmo com base+chave (útil para rollback de emergência). |
| `CPF_BRASIL_FAILURE_WEBHOOK_URL` | **Opcional (Fase 6).** URL que recebe POST JSON em falhas de lookup **não** locais (ex.: timeout, 5xx, auth do provedor). Sem PII — apenas `request_id`. |

## Endpoints

| Método | Rota | Público | Descrição |
|--------|------|---------|-----------|
| GET | `/api/auth/cpf-registration-config` | Sim | Flags: `registration_requires_lookup_proof`, `cpf_brasil_integration_configured`, `cpf_brasil_enabled`. |
| GET | `/api/admin/reports/cpf-lookup-metrics?days=30` | Admin | Série diária + totais e taxa de falha no período. |
| GET | `/api/auth/cpf-brasil-health` | Sim | Health do provedor (já existente). |

## Comportamento

1. **Contadores:** cada `POST /auth/lookup-cpf` concluído incrementa sucesso ou falha no dia corrente.
2. **Webhook:** disparado quando a falha **não** é apenas `LOCAL_INVALID_FORMAT` (formato inválido no servidor), desde que `CPF_BRASIL_FAILURE_WEBHOOK_URL` esteja definido.
3. **Logs:** falhas de integração são logadas com `[cpf-lookup][integration]` em nível **error** (útil para alertas em agregadores de log).
4. **Dashboard admin:** cartão “Consultas CPF (cadastro)” com taxa de falha dos últimos 14 dias e aviso visual se taxa ≥ 30% e volume ≥ 6 consultas.

## Frontend

- `getCpfRegistrationConfig()` em `src/lib/api/auth.ts` — pode ser usado para exibir mensagens de indisponibilidade (opcional).
- Dashboard admin consome `getCpfLookupMetrics`.

## Rollout sugerido

1. Subir migração 108 em staging.
2. Habilitar CPF Brasil com credenciais de sandbox.
3. Monitorar cartão de métricas e logs; configurar webhook opcional para Slack/Teams.
4. Produção: mesmo fluxo; manter `CPF_REGISTER_REQUIRES_LOOKUP_PROOF` como padrão (omitido = exige prova quando integração configurada).

---

*Alinhado ao `PLANO_IMPLANTACAO_AUTH_CPF_BRASIL.md` (v2).*
