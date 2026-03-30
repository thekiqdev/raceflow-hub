# Fase 5 — Compatibilidade e usuários existentes

**Objetivo:** dar visibilidade operacional às contas criadas antes da validação obrigatória via API CPF Brasil (ou sem integração ativa), sem obrigar migração imediata de dados.

## O que é “conta legada” neste contexto

- No modelo, perfis passaram a ter `profiles.cpf_validated_at` e `profiles.cpf_lookup_source` (migração 107).
- **Legado (sem validação na fonte oficial):** `cpf_validated_at IS NULL`.
- **Validado via integração:** `cpf_lookup_source = 'cpf_brasil_api'` e `cpf_validated_at` preenchido (fluxo pós–Fase 3 com API habilitada).

## Comportamento do produto

| Situação | Comportamento |
|----------|----------------|
| Usuário legado faz **login** | Normal. Login com e-mail ou CPF + senha (Fase 4) não depende desses metadados. |
| Novo **cadastro** com CPF Brasil **habilitado** | Exige consulta válida + prova JWT (Fases 2–3). |
| Ambiente **sem** `CPF_BRASIL_*` / integração desligada | Cadastro pode seguir regras antigas no backend (sem prova), conforme `registerRequiresCpfLookupProof()`. |
| **Recuperação de senha** | Continua por **e-mail** (identificador estável para envio de link). |

## Ferramentas para suporte e operação

1. **Dashboard admin (métricas)**  
   No dashboard geral do admin, o cartão **“Validação CPF (fonte oficial)”** mostra:
   - quantidade de perfis sem confirmação na fonte oficial;
   - percentual sobre o total de perfis;
   - totais de perfis com validação e com origem `cpf_brasil_api`.

2. **API (admin autenticado)**  
   `GET /api/admin/reports/cpf-validation-overview`  
   Retorno: `total_profiles`, `validated_count`, `legacy_without_validation`, `validated_via_cpf_brasil`, `legacy_pct`.

3. **Consulta SQL (opcional, suporte técnico)**  
   Listar perfis legados (uso restrito, LGPD):
   ```sql
   SELECT id, full_name, cpf, cpf_validated_at, cpf_lookup_source
   FROM profiles
   WHERE cpf_validated_at IS NULL
   ORDER BY id
   LIMIT 100;
   ```

## Comunicação sugerida (canal interno / FAQ)

- Contas antigas **continuam válidas** para login e inscrições; a validação na API aplica-se de forma **estrita a novos cadastros** quando a integração está ativa.
- Não é necessário mensagem alarmista ao usuário final apenas por `cpf_validated_at` nulo; use mensagens específicas apenas se houver **política de produto** futura (ex.: revalidação em etapa única).

## Próximos passos possíveis (fora do escopo mínimo da Fase 5)

- Fluxo opcional “confirmar CPF” para legados (nova consulta + atualização de metadados).
- Relatório exportável CSV no admin.

---

*Documento alinhado ao plano `PLANO_IMPLANTACAO_AUTH_CPF_BRASIL.md` (v2).*
