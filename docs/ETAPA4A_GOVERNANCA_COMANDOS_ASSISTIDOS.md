# Etapa 4A — Governança operacional dos comandos assistidos

## Objetivo

Fortalecer a execução dos comandos assistidos do domínio de convites com:

- controle de autorização explícito;
- contexto operacional obrigatório;
- trilha de auditoria persistida;
- manutenção dos logs estruturados em aplicação.

Sem alterar:

- regra canônica de cálculo;
- concessão atômica (`grantInvitationBonusSlotAtomic`);
- separação entre modos automático/operacional/assistido.

---

## Fluxos protegidos

Comandos assistidos cobertos:

- `deliver_missing_assisted`
- `reconcile_state`

Entradas principais:

- `POST /api/admin/reconcile/missing-invitation-delivery`
- `POST /api/admin/reconcile/invitation-bonus-controlled`

---

## Campos obrigatórios (contexto operacional)

Para comandos assistidos, agora são obrigatórios:

- `actor_id`
- `actor_email`
- `reason`

No payload HTTP:

- `reason` é obrigatório (mínimo 8 caracteres).
- `actor_id` e `actor_email` são derivados do usuário autenticado (`req.user`).

---

## Controle de autorização

Além do escopo de rota `/admin`, os controllers assistidos aplicam validação explícita:

- usuário autenticado;
- papel `admin` obrigatório (`hasRole(userId, 'admin')`).

Se não autorizado:

- `401` não autenticado;
- `403` sem permissão.

---

## Auditoria persistida

### Migração

- `backend/migrations/103_create_invitation_bonus_assisted_command_audit.sql`

### Tabela

- `invitation_bonus_assisted_command_audit`

### Campos mínimos persistidos

- `command_type`
- `mode`
- `actor_id`
- `actor_email`
- `reason`
- `source`
- `correlation_id`
- `leader_id`
- `event_id`
- `commission_id`
- `status` (`started`, `succeeded`, `failed`)
- `detail`
- `result` (JSONB)
- `finished_at`
- `created_at`
- `updated_at`

### Comportamento

No orquestrador:

1. inserção inicial com `status='started'`;
2. atualização para `succeeded` em sucesso;
3. atualização para `failed` em erro.

---

## Logs estruturados complementares

Mantido e estendido:

- `event=invitation_bonus_domain_command`
- fases `start`, `error`, `end`

Sem remover telemetria existente:

- `invitation_bonus_trigger`

---

## Compatibilidade

- retorno público do orquestrador mantido (`InvitationBonusDomainCommandResult`);
- sem mudanças em regra de negócio;
- sem mudança em fluxo automático;
- sem lock distribuído (fora de escopo);
- sem frontend.

---

## Riscos remanescentes

1. Deduplicação continua in-process (multi-instância ainda com risco residual cross-instance).
2. Auditoria assistida depende da migração aplicada antes do uso dos comandos assistidos em produção.
3. A governança está focada em `admin`; políticas de aprovação em duas etapas ficam para fase futura.

---

## Próxima etapa (não implementada nesta 4A)

- lock distribuído por `(leader_id,event_id)`;
- endurecimento de governança (aprovação dupla / janela operacional / feature flag de apply);
- visualização administrativa da trilha de auditoria persistida.

