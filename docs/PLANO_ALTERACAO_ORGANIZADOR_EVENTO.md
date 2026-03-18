# Plano técnico: Alteração de Organizador de Evento

**Objetivo:** Permitir alterar o organizador de um evento existente, garantindo que todos os dados relacionados continuem funcionando corretamente.

**Status:** Análise e planejamento — **NÃO IMPLEMENTAR** até aprovação.

**Exemplo:** Evento pertence ao Organizador A → migrar para Organizador B.

---

## ETAPA 1 — Análise do sistema atual

### 1.1 Como o organizador está relacionado ao evento

- **Campo principal:** `events.organizer_id` (UUID, NOT NULL, FK para `profiles(id)` ON DELETE CASCADE).
- **Fonte:** `backend/migrations/001_initial_schema.sql` (events table).
- **Não existe** outra tabela que defina “dono” do evento; a única referência de propriedade é `events.organizer_id`.

### 1.2 Tabelas que dependem do evento e/ou do organizador

Todas as tabelas relevantes mapeadas a partir do código e das migrações:

| Tabela | Relação com evento | Relação com organizador | Impacto na migração |
|--------|--------------------|-------------------------|----------------------|
| **events** | — (tabela principal) | `organizer_id` FK → profiles(id) | **Alvo da alteração:** trocar `organizer_id` de A para B. |
| **categories** | `event_id` FK → events(id) CASCADE | Via evento | Nenhum. Permanecem ligadas ao mesmo evento. |
| **modalities** | `event_id` FK → events(id) CASCADE | Via evento | Nenhum. |
| **event_kits** | `event_id` FK → events(id) CASCADE | Via evento | Nenhum. |
| **kit_pickup_locations** | `event_id` FK → events(id) CASCADE | Via evento | Nenhum. |
| **registrations** | `event_id` FK → events(id) CASCADE | Via evento (JOIN events) | Nenhum. Após migração, listagens por organizador (e.organizer_id) passam a mostrar o evento sob o novo organizador. |
| **refund_requests** | `event_id` FK → events(id) CASCADE | Via evento | Nenhum. |
| **coupons** | Opcional: `event_id` (legado); vínculo principal em **coupon_events** | **`organizer_id` FK** → users(id) | **Crítico.** Validação usa `getCouponByCode(code, event.organizer_id)`. Se só mudarmos o evento, cupons do A deixam de ser encontrados para o evento (agora de B). É necessário tratar cupons (ver Etapa 2). |
| **coupon_events** | `event_id` FK → events(id) CASCADE | — | Liga cupom ao evento. Pode ser usado para identificar quais cupons “pertencem” ao evento migrado. |
| **leader_event_commissions** | `event_id` FK → events(id) CASCADE | Via evento | Nenhum. Comissões continuam ligadas ao mesmo evento. |
| **leader_invitations** | `event_id` FK → events(id) CASCADE; `leader_id` FK → group_leaders | Via evento e líder | **Crítico para convites disponíveis.** Convites com status available/sent devem ter leader_id atualizado para o líder equivalente em B (reassociação); convites used/expired não alterar (histórico). Ver Etapa 3ter. |
| **transfer_requests** | Via `registration_id` → registrations → event_id | Via evento | Nenhum. |
| **asaas_payments** | Via `registration_id` → registrations → event_id | Via evento | Nenhum. |
| **contact_messages** | `event_id` FK (SET NULL), `organizer_id` FK (SET NULL) | `organizer_id` | Mensagens ligadas ao evento/organizador: continuam com o mesmo evento; `organizer_id` pode ficar como “antigo dono” (histórico) ou ser atualizado conforme regra de negócio. |
| **withdraw_requests** | — | **`organizer_id`** FK → profiles(id) | **Não alterar.** São saques do organizador; não são “do evento”. O novo organizador (B) passará a receber receita do evento via relatórios que usam e.organizer_id. |
| **organizer_group_leaders** | — | `organizer_id` FK → profiles(id) | Liga líderes ao organizador. O evento em si não tem FK aqui; após migração, B pode usar seus próprios líderes. Líderes de A continuam em A. |
| **cronograma_items** | `event_id` FK → events(id) CASCADE | Via evento | Nenhum. |
| **user_referrals** | `event_id` FK (opcional) | — | Nenhum. |
| **category_custom_fields** | Via categories → event_id | Via evento | Nenhum. |
| **registration_custom_field_values** | Via registrations → event_id | Via evento | Nenhum. |
| **Views (organizer_*, reports)** | — | Usam `e.organizer_id` em JOINs/WHERE | Após trocar `events.organizer_id`, as views passam a refletir o novo organizador para aquele evento. |

Resumo de impacto direto na migração:

- **Alterar:** `events.organizer_id`.
- **Avaliar e possivelmente alterar/duplicar:** `coupons` (e opcionalmente `contact_messages.organizer_id`).
- **Não alterar:** demais tabelas; a relação é por `event_id` ou via evento.

---

## ETAPA 2 — Análise de cupons (crítico)

### 2.1 A quem o cupom “pertence”

- **Organizador:** sim. `coupons.organizer_id` (NOT NULL) — “dono” do cupom.
- **Evento:** opcional. Vínculo por:
  - `coupons.event_id` (legado, pode ser NULL);
  - **coupon_events** (N:N): um cupom pode estar ligado a 0, 1 ou N eventos.

Ou seja: cupom pertence a um **organizador**; pode estar associado a **vários eventos** (ou a nenhum = “todos os eventos do organizador”).

### 2.2 Estrutura relevante

- **coupons:** `id`, `organizer_id`, `code`, `event_id` (legado), …; UNIQUE (`code`, `organizer_id`).
- **coupon_events:** `coupon_id`, `event_id`; UNIQUE (`coupon_id`, `event_id`).

### 2.3 Regras atuais de validação

- **Arquivo:** `backend/src/services/couponsService.ts`.
- **validateCoupon(code, organizerId, eventId?):**
  1. Busca cupom com **getCouponByCode(code, organizerId)** → `SELECT * FROM coupons WHERE code = $1 AND organizer_id = $2`.
  2. Se não achar cupom → “Cupom não encontrado”.
  3. Valida ativo, expiração, max_uses.
  4. Se `eventId` for passado: **getCouponEventIds(coupon.id)**; se o cupom tiver eventos restritos e o evento não estiver na lista → “Cupom não é válido para este evento”.

Uso na inscrição/validação:

- `event.organizer_id` é obtido do evento e passado como `organizerId` para `validateCoupon(code, event.organizer_id, event_id)` (ex.: `registrationsController`, `couponsController`, `registrationTotalService`, `registrationsService`).

Conclusão: **a validação exige que o cupom tenha `organizer_id` igual ao organizador do evento.** Se apenas alterarmos `events.organizer_id` para B, os cupons continuam com `organizer_id = A`; na validação será usado `event.organizer_id = B` → cupom não é encontrado → **cupom “para” de funcionar para esse evento.**

### 2.4 Risco

- **Risco real:** após trocar apenas o evento para o organizador B, todo cupom que era do organizador A e estava ligado a esse evento deixa de ser aceito (validação por `organizer_id`).

---

## ETAPA 3 — Regras de negócio

### 3.1 O que DEVE acontecer ao trocar organizador

- O **evento** passa a pertencer ao novo organizador (B): `events.organizer_id = B`.
- **Inscrições** permanecem (registrations continuam com o mesmo `event_id`).
- **Histórico** preservado: não apagar nem alterar dados de inscrições, pagamentos, cupons usados (registrations.coupon_code), comissões, convites, etc.
- **Cupons** que eram válidos para esse evento devem **continuar válidos** após a migração (ex.: inscrições com cupom ainda em aberto; futuras inscrições no mesmo evento com mesmo cupom, se regra de negócio permitir).
- Relatórios, financeiro e dashboards passam a considerar o evento como sendo do organizador B (já garantido por `e.organizer_id`).

### 3.2 O que NÃO pode acontecer

- **Perda de inscrições** ou vínculo inscrição–evento.
- **Cupom inválido** para o evento migrado quando deveria ser válido (ex.: cupom só daquele evento).
- **Quebra de pagamento:** asaas_payments e fluxos continuam via registration → event; não há FK direta em asaas_payments para organizador.
- **Perda de dados:** categorias, modalidades, kits, cronograma, premiação, líderes de evento, comissões, convites, transferências, reembolsos devem permanecer consistentes.

---

## ETAPA 3bis — Regras de negócio para cupons (OBRIGATÓRIAS)

Ao migrar um evento do organizador A para o organizador B, as regras abaixo são **obrigatórias**.

### 1. Cupons EXCLUSIVOS do evento

- **Critério:** cupom ligado **somente** a este evento (ex.: exatamente um registro em `coupon_events` para este `event_id` e este cupom não está ligado a outro evento).
- **Ação:** atualizar `coupons.organizer_id` do cupom para o novo organizador (B).
- **Objetivo:** manter o mesmo cupom funcionando normalmente no evento; B passa a ser o dono do cupom.

### 2. Cupons COMPARTILHADOS (multi-evento)

- **Critério:** cupom ligado a **este evento e a outros eventos** (ex.: mais de um registro em `coupon_events` para o mesmo `coupon_id`).
- **Ação:**
  - **DUPLICAR** o cupom para o organizador B: novo registro em `coupons` com mesmas regras (code, tipo, valor, datas, max_uses, etc.), vinculado **apenas** ao evento migrado em `coupon_events`.
  - No cupom **original** (organizador A): **REMOVER** o vínculo com o evento migrado em `coupon_events` (DELETE do par `coupon_id`, `event_id`).
- **Objetivo:** preservar funcionamento do cupom no evento migrado (B tem um cupom equivalente só para esse evento); manter cupom original de A funcionando nos outros eventos.

### 3. Preservação de histórico (CRÍTICO)

- **NÃO alterar:**
  - tabela `registrations` (nenhum campo);
  - `registrations.coupon_code` já utilizado (permanece como string histórica);
  - tabelas de pagamentos (ex.: `asaas_payments`).
- **Objetivo:** consistência histórica total; relatórios e auditoria continuam corretos.

---

### 4. Controle de conflito de código (ao duplicar cupom compartilhado)

Antes de duplicar um cupom para o organizador B (caso compartilhado), é obrigatório verificar se B **já possui** um cupom com o mesmo `code`.

**Estratégia definida: gerar novo código em caso de conflito.**

- **Verificação:** `SELECT id FROM coupons WHERE code = $1 AND organizer_id = $B`.
- Se **não existir** cupom de B com esse code → criar novo cupom com o **mesmo** `code` (UNIQUE(code, organizer_id) permite).
- Se **existir** cupom de B com esse code → **gerar novo código** para o cupom duplicado, preservando os demais atributos. Ex.: sufixo `_EV{event_id_curto}` ou `_MIGRADO` (ex.: `PROMO10` → `PROMO10_MIGRADO` ou `PROMO10_EVabc12`). O nome do cupom pode ser mantido ou ajustado (ex.: "PROMO10 (evento migrado)").
- **Não reutilizar** o cupom existente de B: o cupom de B pode ter regras/eventos diferentes; reutilizar poderia vincular o evento migrado a um cupom que já tem outros eventos ou limites diferentes.
- **Não bloquear** a operação: a migração deve seguir; apenas o code do cupom duplicado é alterado para evitar UNIQUE violation e ambiguidade.

**Decisão:** Evita falha da migração por conflito e mantém rastreabilidade (cupom “novo” para o evento migrado, com código distinto quando necessário).

---

### 5. Cupons sem vínculo com evento (globais)

Cupons do organizador A que **não** possuem nenhum registro em `coupon_events` (e opcionalmente `coupons.event_id` NULL) são considerados **globais** para A (aplicáveis a todos os eventos de A pela regra atual de validação).

**Decisão: IGNORAR na migração.**

- **Não duplicar** esses cupons para B nem criar vínculo em `coupon_events` para o evento migrado.
- **Motivo:** Cupom global de A nunca foi “exclusivo” do evento; era um cupom de uso amplo. Após a migração, o evento pertence a B e a validação usa `event.organizer_id = B` → cupons de A (incluindo globais) não são encontrados para esse evento, o que é consistente com “evento agora é de B”. Se B quiser um cupom equivalente para esse evento, B pode criar manualmente.
- **Critério técnico:** Na migração, considerar apenas cupons que tenham **pelo menos um** registro em `coupon_events` com `event_id = evento_migrado`. Cupons sem nenhum registro em `coupon_events` para este evento são ignorados.

---

### 6. current_uses (uso do cupom) na duplicação

Ao **duplicar** um cupom compartilhado para o organizador B:

**Decisão: o novo cupom (de B) terá `current_uses = 0`.**

- **Motivo:** O cupom duplicado é um **novo** registro; usos já realizados estão nas inscrições antigas (que mantêm `coupon_code` e continuam ligadas ao cupom **original** de A para fins históricos). O limite `max_uses` do cupom duplicado passa a valer a partir da migração apenas para o evento migrado.
- **Impacto na regra de negócio:** Inscrições já feitas no evento com aquele cupom continuam válidas (não mexe em registrations). Novas inscrições no evento (agora de B) usarão o cupom de B; o contador `current_uses` do cupom de B reflete apenas usos **após** a migração. Isso evita migrar “parcialmente” usos (que exigiria contar registrations por evento e cupom) e mantém a semântica simples: cupom novo = contador zerado.
- **Cupom exclusivo (só transferência de organizer_id):** Não duplicamos registro; o mesmo cupom apenas muda de dono. O `current_uses` **não** é zerado (preserva histórico de uso).

---

### 7. Preservação do líder (leader_id) em cupons — OBRIGATÓRIO

Se o cupom possui `leader_id`, o relacionamento **não pode ser removido**; deve ser mantido no novo organizador com um líder equivalente.

- **Regra:** Ao migrar (exclusivo) ou duplicar (compartilhado) cupom, o `leader_id` do cupom de B deve referenciar um líder **do organizador B** que corresponda ao líder original (de A). Nunca deixar `leader_id` em NULL quando o cupom original tinha líder, exceto se decisão de negócio explicitar.
- **Restrições:** Não remover nem alterar o líder do organizador A. Não compartilhar o mesmo registro de líder entre organizadores; cada organizador possui sua própria lista de líderes (ex.: via `organizer_group_leaders` ou líderes próprios por organizador).

---

### 8. Migração de líderes (processo integrado aos cupons)

Para cada cupom com `leader_id` que será migrado ou duplicado para B:

**Etapa 1 — Identificar líder original**

- Buscar: `leader_id` (id em `group_leaders`), organizador atual (A).
- Obter dados do líder: nome, email, telefone e demais campos relevantes (ex.: via `group_leaders` JOIN `users` JOIN `profiles`).

**Etapa 2 — Verificar existência no organizador B**

- Verificar se já existe líder **equivalente** no organizador B (líder vinculado a B cujos dados coincidem).
- **Chave de comparação definida:** **email** (preferencial). Se email não estiver disponível ou não for único, usar **telefone** como fallback. Comparação case-insensitive e trim; normalizar espaços.
- Critério: mesmo usuário (email/telefone) já vinculado a B como líder (ex.: existe em `organizer_group_leaders` com `organizer_id = B` e o líder associado tem esse email/telefone no perfil).

**Etapa 3 — Se NÃO existir**

- Criar **novo** líder no organizador B com base nos dados do líder original: nome, email, telefone, demais campos relevantes.
- Nota de implementação: no modelo atual, `group_leaders` possui `user_id` (FK para users); cada organizador pode ter sua lista via `organizer_group_leaders`. A criação de “novo líder” para B pode exigir: (a) novo registro em `group_leaders` (e eventualmente novo user/profile com os mesmos dados de contato, se o sistema não permitir um mesmo user como líder de dois organizadores), ou (b) uso de tabela/orquestração que associe líder a organizador. Documentar na implementação a opção escolhida de forma a não compartilhar o mesmo registro de líder entre A e B.

**Etapa 4 — Atualizar referência no cupom**

- Ao migrar (exclusivo): `UPDATE coupons SET organizer_id = B, leader_id = $novo_leader_id_b WHERE id = $id` (substituir `leader_id` pelo ID do líder no organizador B).
- Ao duplicar (compartilhado): no INSERT do novo cupom para B, usar `leader_id = $novo_leader_id_b` (nunca NULL se o cupom original tinha `leader_id`).

**Ordem no fluxo geral:** a criação/verificação de líderes em B e o mapeamento (leader_id antigo → leader_id novo) devem ocorrer **antes** da criação ou atualização dos cupons (exclusivos e compartilhados).

---

### 9. Performance e estratégia em lote (líderes)

- Evitar N queries por cupom: primeiro **mapear** todos os `leader_id` distintos dos cupons que serão migrados/duplicados; depois **carregar em lote** os dados dos líderes originais (uma ou poucas queries por conjunto de ids).
- Em seguida, para cada líder original, **verificar/criar** líder equivalente em B (por email/telefone); construir um mapa `leader_id_original → leader_id_em_B`.
- Por fim, ao atualizar ou inserir cupons, usar esse mapa para preencher `leader_id` correto. Assim não se faz uma busca ou criação de líder por cupom, e sim por líder distinto.

---

### 10. Consistência pós-migração

Garantir após a migração:

1. **O evento só aceita cupons do novo organizador (B).**  
   Validação usa `getCouponByCode(code, event.organizer_id)` com `event.organizer_id = B`; portanto apenas cupons com `organizer_id = B` são encontrados. Cupons transferidos (exclusivos) ou duplicados (compartilhados) para B cumprem isso.

2. **Nenhum cupom do organizador antigo (A) funciona para este evento.**  
   Cupons que permanecem de A (ex.: compartilhados que tiveram apenas o vínculo removido em `coupon_events`) não têm mais esse evento na lista; e mesmo que tivessem, a validação exige `organizer_id = event.organizer_id`, então A não seria aceito. Cupons exclusivos que foram transferidos para B deixam de ser de A.

3. **Verificação recomendada (teste automatizado):** Após migração, chamar `validateCoupon(code_cupom_A, B, event_id)` deve falhar (“Cupom não encontrado” ou “não válido para este evento”); `validateCoupon(code_cupom_B, B, event_id)` deve passar quando o cupom de B for o transferido ou o duplicado para esse evento.

---

## ETAPA 3ter — Migração de convites (leader_invitations)

**Objetivo:** Garantir que convites (invitations) vinculados ao evento migrado **não se percam**, **não fiquem inválidos** e continuem **utilizáveis** no novo organizador (B), sem afetar histórico (convites já utilizados ou expirados).

**Contexto do modelo atual:** A tabela `leader_invitations` não possui `coupon_id`; possui `event_id`, `leader_id`, `bonus_registration_id`, `commission_id` e `status` (available, sent, used, expired). O vínculo com cupom é indireto (líder tem cupons; convite é gerado a partir de bônus do líder no evento). O risco pós-migração é: o evento passa a ser de B, mas o convite continua com `leader_id` do organizador A; se a aplicação exige que o líder do convite pertença ao organizador do evento, o convite pode falhar no checkout ou ficar "invisível". Reassociar o `leader_id` do convite para o líder equivalente em B resolve a consistência.

### 1. Mapeamento de convites afetados

**Critério:** Convites cujo `event_id` = evento migrado.

**Separação por status:**

- **available / sent** (não utilizados, ainda podem ser usados) → **migrar** (reassociar leader_id para o líder em B).
- **used / expired** → **não migrar**; manter exatamente como estão (preservação de histórico e rastreabilidade).

**Query para listar convites a reassociar:**

```sql
SELECT id, leader_id, event_id, bonus_registration_id, status
FROM leader_invitations
WHERE event_id = $event_id
  AND status IN ('available', 'sent');
```

- Qualquer convite com `leader_id` que ainda não estiver no mapa old_leader_id → new_leader_id (construído a partir dos cupons) deve ter esse líder incluído na etapa de resolução de líderes: garantir que todos os líderes referenciados por esses convites tenham equivalente em B e estejam no mapa.

### 2. Estratégia de migração dos convites

- **Não duplicar** convites (cada convite é um registro; apenas atualizamos o `leader_id`).
- **Não alterar** convites com status `used` ou `expired`.
- Para cada convite com status `available` ou `sent` e `event_id` = evento migrado:
  - Obter `new_leader_id` do mapa (leader_id_original → leader_id_em_B). O mapa já deve conter todos os leader_ids dos cupons; se o convite referenciar um líder que não estava em nenhum cupom do evento, **incluir esse líder** na fase de resolução de líderes (carregar dados, verificar/criar em B, adicionar ao mapa).
  - Executar: `UPDATE leader_invitations SET leader_id = $new_leader_id, updated_at = NOW() WHERE id = $invitation_id`.
- **Garantir vínculo correto:** Após a migração, o convite continua com o mesmo `event_id` (evento já migrado para B), mesmo `bonus_registration_id` e `commission_id`; apenas o `leader_id` passa a referenciar o líder no organizador B. Assim o convite continua utilizável e a comissão futura (quando o convite for usado) ficará associada ao líder de B.

### 3. Integridade com líder e organizador B

- Todo `leader_id` presente em convites disponíveis (available/sent) do evento deve existir no mapa como chave; o valor no mapa deve ser um líder **vinculado ao organizador B** (ex.: existir em `organizer_group_leaders` com organizer_id = B).
- Se um convite referenciar um líder que ainda não foi resolvido para B (porque esse líder não tinha cupom no evento), aplicar a **mesma** lógica: verificar se existe equivalente em B por email/telefone; se não, criar novo líder em B e registrar em `organizer_group_leaders`; adicionar ao mapa old_leader_id → new_leader_id. Assim nenhum convite fica com leader_id "órfão" (líder que não pertence a B).
- Garantir que a comissão futura continue funcionando: o `commission_id` do convite aponta para `leader_event_commissions`; essa tabela é por evento e líder. Após a migração, novas comissões geradas pelo uso do convite devem estar alinhadas ao líder em B; a aplicação deve usar o `leader_id` atual do convite para isso.

### 4. Regras de segurança (convites)

- **Transacional:** As atualizações em `leader_invitations` devem ocorrer **dentro da mesma transação** da migração, **depois** da resolução de líderes e **antes** do processamento de cupons e do UPDATE em events (ordem definida no passo a passo).
- **Idempotente / controle de reprocessamento:** Só atualizar convites que ainda não foram migrados: no UPDATE, incluir **AND (migration_id IS NULL)** quando a coluna existir. Assim, em retry ou reprocessamento parcial, convites já atualizados não são alterados duas vezes. A checagem geral de idempotência (evento já de B) no início também evita reexecução completa.
- **Auditável:** Registrar quantos convites foram atualizados (total_invitations_updated) no log de migração; opcionalmente persistir, por convite, migrated_from_leader_id, migrated_at e migration_id (ver estrutura de auditoria abaixo).
- **Compatível com dry_run:** No dry_run, incluir na resposta: lista de convites que seriam atualizados (id, leader_id atual → leader_id_em_B) e total_invitations_to_update.

### 5. Validações obrigatórias (convites)

Incluir na **validação pós-migração** (Etapa 5ter):

- Nenhum convite com status `available` ou `sent` e `event_id` = evento migrado pode ter `leader_id` que não esteja vinculado ao organizador B (ex.: não existe em organizer_group_leaders com organizer_id = B). Se existir, registrar inconsistência.
- Convites disponíveis (available/sent) do evento devem continuar utilizáveis: amostragem ou checagem de que todo leader_id desses convites existe em organizer_group_leaders para B.
- Convites com status `used` ou `expired` **não** devem ter sido alterados (mesmo leader_id que antes da migração).
- Não há duplicidade de convites (um mesmo bonus_registration_id não pode aparecer em mais de um convite; a tabela já tem UNIQUE(bonus_registration_id)).
- Nenhum convite fica órfão: todo convite do evento com status available/sent tem leader_id válido em B e event_id válido (o evento já está com organizer_id = B).

### 6. Estrutura de auditoria (convites)

**Opção A — Colunas na própria tabela (recomendado para rastreio fino):**

- Adicionar em `leader_invitations` (via migration):
  - `migrated_from_leader_id` UUID NULL — preenchido quando o convite foi reassociado na migração; guarda o leader_id anterior.
  - `migrated_at` TIMESTAMPTZ NULL — data/hora da reassociação.
  - `migration_id` UUID NULL — id da execução de migração (event_organizer_migration_log.id ou migration_id da API).
- Ao fazer UPDATE em leader_invitations (SET leader_id = new_leader_id), preencher também: migrated_from_leader_id = old_leader_id, migrated_at = NOW(), migration_id = $migration_id.

**Opção B — Tabela de auditoria separada:**

- Criar tabela `leader_invitation_migration_audit` (invitation_id, migrated_from_leader_id, migrated_to_leader_id, event_id, migration_id, migrated_at) e inserir um registro por convite atualizado.

**Recomendação:** Opção A para consultas simples (ver no próprio convite se foi migrado e de qual líder); Opção B se não quiser alterar a tabela leader_invitations.

### 7. Ordem no fluxo geral

A migração de convites deve ocorrer **depois** da resolução de líderes (mapa old_leader_id → new_leader_id completo, incluindo líderes que só aparecem em convites e não em cupons) e **antes** do processamento de cupons e do UPDATE em `events.organizer_id`. Assim, na mesma transação: **líderes → convites → cupons → evento**. Motivo: convites dependem do mapa de líderes; cupons também; executar convites antes de cupons evita inconsistência intermediária.

### 8. Possíveis falhas e mitigações

| Falha | Mitigação |
|-------|-----------|
| Convite disponível com leader_id que não está no mapa | Incluir na fase de resolução de líderes todos os leader_ids distintos dos convites (available/sent) do evento; construir mapa completo antes de atualizar cupons e convites. |
| Atualizar convite usado por engano | Filtrar estritamente por status IN ('available','sent'); nunca UPDATE em status used/expired. |
| Duplicar convite | Não inserir novos registros; apenas UPDATE leader_id nos existentes. |
| Convite "invisível" no checkout | Validação pós-migração garante que todo convite disponível do evento tem leader_id em B; fluxo de uso do convite deve considerar evento do organizador B. |
| Comissão futura incorreta | O leader_id do convite passa a ser o de B; a aplicação deve calcular comissão pelo leader_id atual do convite e pelo evento (já de B). |

### 9. Pseudo-SQL (reassociação de convites)

```sql
-- 1) Listar convites a reassociar (já na transação, após mapa de líderes pronto)
SELECT id, leader_id FROM leader_invitations
WHERE event_id = $event_id AND status IN ('available', 'sent');

-- 2) Para cada linha: new_leader_id = mapa[leader_id]. Se leader_id não está no mapa,
--    resolver líder para B (verificar/criar) e adicionar ao mapa antes deste passo.

-- 3) Atualizar convites (em lote ou por id); só quem ainda não foi migrado (evita reprocessamento)
UPDATE leader_invitations
SET leader_id = $new_leader_id,
    updated_at = NOW(),
    migrated_from_leader_id = leader_id,
    migrated_at = NOW(),
    migration_id = $migration_id
WHERE id = $invitation_id
  AND (migration_id IS NULL);  -- só atualizar quem ainda não foi migrado

-- 4) Verificar convites órfãos (antes de seguir): nenhum available/sent com leader não em B
-- SELECT COUNT(*) FROM leader_invitations li
-- LEFT JOIN organizer_group_leaders ogl ON ogl.leader_id = li.leader_id AND ogl.organizer_id = $organizer_b_id
-- WHERE li.event_id = $event_id AND li.status IN ('available','sent') AND ogl.leader_id IS NULL;
-- Se > 0 → ROLLBACK.
```

- Em batch: para cada (old_leader_id, new_leader_id) no mapa, executar UPDATE ... SET leader_id = new_leader_id, migrated_from_leader_id = old_leader_id, migrated_at = NOW(), migration_id = $migration_id WHERE event_id = $event_id AND status IN ('available','sent') AND leader_id = old_leader_id **AND (migration_id IS NULL)**.

---

## ETAPA 4 — Estratégia de migração

### Opção A — Apenas alterar `events.organizer_id`

- **Ação:** `UPDATE events SET organizer_id = $novo_organizer_id WHERE id = $event_id`.
- **Prós:** Simples, uma única escrita, sem duplicar dados.
- **Contras:** Cupons do organizador A que eram válidos para esse evento deixam de funcionar (validação por `event.organizer_id`). Inscrições já feitas com cupom permanecem (só guardam `coupon_code`); novas validações/novas inscrições com esse cupom falham.
- **Riscos:** Quebra de expectativa (“cupom do evento parou de funcionar”); possível impacto em integrações ou fluxos que revalidam cupom.

**Recomendação:** Não usar Opção A sozinha se for requisito que cupons continuem válidos para o evento após a troca.

---

### Opção B — Atualizar múltiplas tabelas (evento + cupons) — ESCOLHIDA

Alinhada às **regras obrigatórias** da Etapa 3bis:

- **Exclusivos:** UPDATE `coupons.organizer_id` para B; se cupom tiver `leader_id`, atualizar `leader_id` para o ID do líder equivalente no organizador B (ver migração de líderes abaixo).
- **Compartilhados:** duplicar cupom para B (novo registro, `current_uses = 0`, `leader_id` = líder equivalente em B quando aplicável), vincular só ao evento migrado em `coupon_events`; remover vínculo do cupom original de A com o evento migrado.
- **Globais (sem vínculo em coupon_events para este evento):** ignorar.
- **Histórico:** não alterar registrations, coupon_code em uso, pagamentos.
- **Líderes (leader_id):** preservar vínculo com líder no novo organizador: mapear líderes necessários → verificar/criar líderes equivalentes em B → mapear leader_id antigo → novo; aplicar **antes** de atualizar/inserir cupons. Chave de equivalência: email (preferencial) ou telefone. Não compartilhar o mesmo registro de líder entre organizadores; não alterar líderes do organizador A.

Conflito de código ao duplicar: gerar novo code (ex.: sufixo) se B já tiver cupom com o mesmo code. Consistência pós-migração: evento aceita apenas cupons de B; cupons de A não funcionam para este evento.

**B.3 — Contato (opcional)**

- **contact_messages:** decidir se mensagens ligadas ao evento devem ter `organizer_id` atualizado para B (para aparecer no painel de B) ou mantidas com A (histórico). Documentar a escolha.
- **Decisão implementada (Etapa 6):** Atualizar `contact_messages SET organizer_id = B` onde `event_id = evento` e `organizer_id = A`, na mesma transação após o UPDATE do evento. Assim as mensagens do evento passam a aparecer no painel de B; A deixa de vê-las para este evento.

**Resumo Opção B:**

- **Prós:** Cupons continuam funcionando; consistência com regra “evento de B”; regras claras e sem ambiguidade.
- **Contras:** Lógica mais complexa; duplicação de cupons no caso compartilhado; necessidade de transação e testes.
- **Riscos:** Erro em uma das atualizações; mitigado por conflito de código (gerar novo code) e execução em transação com rollback.

---

## ETAPA 5 — Transação e segurança

- **Transação:** A operação **deve** rodar em uma **única transação** (BEGIN; todas as leituras/validações e escritas; COMMIT). Nenhuma escrita fora da transação.
- **Rollback completo em erro:** Se **qualquer** passo falhar (validação, SELECT, UPDATE em events, UPDATE/INSERT/DELETE em coupons/coupon_events), fazer **ROLLBACK** e não aplicar nenhuma alteração. A base permanece no estado anterior.
- **Ordem das escritas (recomendada):** (1) **Líderes:** mapear leader_id dos cupons **e** dos convites disponíveis do evento; carregar dados em lote; verificar/criar equivalente em B; construir mapa old→new. (2) **Convites:** UPDATE leader_invitations SET leader_id = mapeado (e migrated_from_leader_id, migrated_at, migration_id) WHERE event_id = evento AND status IN ('available','sent') **AND (migration_id IS NULL)**; em seguida **verificar convites órfãos** (query de count com LEFT JOIN organizer_group_leaders para B; se > 0, ROLLBACK). (3) Cupons exclusivos: UPDATE coupons. (4) Cupons compartilhados: INSERT coupons, INSERT/DELETE coupon_events. (5) UPDATE events.organizer_id. (6) Opcional: contact_messages. Convites antes de cupons evita inconsistência intermediária (convites dependem de líder; cupom também). Qualquer exceção antes do COMMIT dispara rollback.
- **Validações antes de permitir alteração:**
  - Evento existe e está ativo (não cancelado).
  - Novo organizador (B) existe e é organizador (role).
  - **Compatibilidade do organizador B:** Verificar se B **pode receber** o evento (plano ativo?, limites de eventos?, permissões?). Se não (ex.: plano expirado, limite atingido), abortar com mensagem clara. Evita edge case em que o evento migrado ficaria inválido para B.
  - (Opcional) Bloquear se houver **inscrições pagas** e política for “não migrar evento com receita já gerada” (a definir).
  - (Opcional) Bloquear se houver **withdraw_requests** pendentes que incluam receita desse evento (complexo; pode ser deixado para fase 2).
- **Idempotência:** Antes de aplicar alterações, verificar se o evento **já** está com `organizer_id = B`. Se já estiver, considerar sucesso sem nova escrita (ou retornar "já migrado") e não executar novamente os passos de cupons/events. Opcional: persistir em log ou tabela de auditoria o par (event_id, novo_organizer_id, data) para detectar reexecução.

---

## ETAPA 5bis — Concorrência e lock

- **Objetivo:** Evitar execução simultânea da migração do **mesmo** evento e duplicação de líderes/cupons em cenários concorrentes.

**Estratégia de lock proposta:**

1. **Lock no evento:** No início da transação, após validações iniciais, executar `SELECT ... FROM events WHERE id = $event_id FOR UPDATE`. Isso bloqueia a linha do evento até o COMMIT ou ROLLBACK. Uma segunda requisição de migração para o mesmo evento ficará bloqueada até a primeira terminar.
2. **Escopo do lock:** Manter a transação enxuta (todas as leituras/escritas da migração dentro da mesma transação que segura o FOR UPDATE). Assim, não há janela em que duas execuções alterem o mesmo evento ao mesmo tempo.
3. **Evitar duplicação de líderes:** A resolução de líderes (verificar/criar equivalente em B) e o mapa old→new são feitos **dentro** da mesma transação que já segura o evento. Se duas execuções fossem para o mesmo evento, a segunda só começaria após a primeira liberar o lock; ao checar idempotência (evento já com organizer_id = B), a segunda retorna "já migrado" sem criar líderes/cupons.
4. **Evitar duplicação de cupons:** Os INSERTs em `coupons` e `coupon_events` ocorrem na mesma transação; o lock do evento serializa qualquer migração do mesmo evento. Para eventos diferentes, não há conflito (cada um tem seu conjunto de cupons).

**Recomendações:**

- Usar nível de isolamento padrão (READ COMMITTED) ou, se necessário, REPEATABLE READ para a transação de migração. FOR UPDATE no evento é suficiente para serializar por evento.
- Timeout de lock: definir um timeout (ex.: `SET lock_timeout = '30s'` na sessão) para evitar que uma migração travada segure o lock indefinidamente; em caso de timeout, retornar erro e deixar o cliente reexecutar.

---

## ETAPA 5ter — Validação automática pós-migração

Após o **COMMIT** da transação de migração, executar uma etapa de **verificação automática** (em uma nova transação ou na mesma, conforme implementação) e só então considerar a migração concluída com sucesso. Se qualquer verificação falhar, **retornar erro** e **registrar inconsistência** (ex.: em tabela de log de migração com status `inconsistent`).

**Verificações obrigatórias:**

1. **event.organizer_id:** `SELECT organizer_id FROM events WHERE id = $event_id` → deve ser igual a `$organizer_b_id`.
2. **Cupons do evento pertencem ao novo organizador:** Todos os cupons que têm vínculo com o evento em `coupon_events` (WHERE event_id = $event_id) devem ter `coupons.organizer_id = $organizer_b_id`. Query: contar cupons em coupon_events para o evento cujo organizer_id ≠ B; esperado 0.
3. **Nenhum cupom do organizador antigo vinculado ao evento:** Não deve existir em `coupon_events` nenhum par (coupon_id, event_id) onde o coupon_id pertença ao organizador A (coupons.organizer_id = A) e event_id = evento_migrado. Query: SELECT COUNT(*) WHERE ce.event_id = $event_id AND c.organizer_id = $organizer_a_id; esperado 0.
4. **Cupons com leader_id possuem líder válido em B:** Para todo cupom com leader_id não nulo que está em coupon_events para este evento, o leader_id deve referenciar um líder que esteja vinculado ao organizador B (ex.: existe em organizer_group_leaders com organizer_id = B, ou o líder pertence a B conforme regra do modelo). Caso contrário, registrar inconsistência.
5. **Quantidade de cupons antes/depois:** (Opcional mas recomendado) Antes da migração, persistir em memória ou em log o total de cupons exclusivos e compartilhados que seriam alterados/duplicados. Após commit, verificar: total de cupons de B vinculados ao evento (via coupon_events) deve bater com o esperado (ex.: exclusivos transferidos + compartilhados duplicados).
6. **coupon_events sem inconsistência:** Para o evento, todo coupon_id em coupon_events deve existir em coupons e ter organizer_id = B; e não deve haver duplicata (coupon_id, event_id) em coupon_events.
7. **Convites — validação explícita (obrigatória):** Verificar que **TODOS** os convites com status IN ('available','sent') do evento: (a) possuem `leader_id` válido no organizador B (ex.: existe em organizer_group_leaders com organizer_id = B); (b) estão vinculados ao `event_id` correto (evento migrado); (c) **não** estão vinculados a líder/cupom do organizador A. **Proteção contra convite órfão:** `SELECT COUNT(*) FROM leader_invitations li LEFT JOIN organizer_group_leaders ogl ON ogl.leader_id = li.leader_id AND ogl.organizer_id = $organizer_b_id WHERE li.event_id = $event_id AND li.status IN ('available','sent') AND ogl.leader_id IS NULL`. Esperado 0. Se > 0 → status = `inconsistent`, validation_errors += "Convites inválidos após migração" (ou "Convites órfãos: leader não vinculado a B").
8. **Convites usados/expirados inalterados:** (Opcional) Se houver auditoria (migrated_from_leader_id), convites com status `used` ou `expired` não devem ter migrated_from_leader_id preenchido; ou seja, apenas available/sent foram alterados.

**Em caso de falha:** Retornar erro ao cliente (ex.: 500 ou 409 com mensagem "Migração concluída mas verificação pós-migração falhou"); registrar na tabela de log de migração (ex.: `event_organizer_migration_log`) o event_id, organizer_to, status = 'inconsistent', lista de falhas (ex.: JSON ou texto). Alertar para análise manual; não fazer rollback automático pós-commit (ver Etapa 5sex).

---

## ETAPA 5quater — Logs detalhados de migração

**Objetivo:** Operação auditável e rastreável.

**Estrutura de log proposta (por execução de migração):**

| Campo | Tipo | Descrição |
|------|------|-----------|
| id | UUID | PK do registro de log |
| event_id | UUID | Evento migrado |
| organizer_from | UUID | Organizador A (antes) |
| organizer_to | UUID | Organizador B (depois) |
| total_cupons_exclusivos | INTEGER | Quantidade de cupons exclusivos atualizados |
| total_cupons_compartilhados | INTEGER | Quantidade de cupons compartilhados (duplicados) |
| total_cupons_duplicados | INTEGER | Igual a total_cupons_compartilhados (redundante; pode ser omitido) |
| total_lideres_criados | INTEGER | Líderes novos criados em B |
| total_lideres_reutilizados | INTEGER | Líderes já existentes em B reutilizados |
| total_invitations_updated | INTEGER | Convites (leader_invitations) reassociados (available/sent) |
| conflitos_codigo_resolvidos | INTEGER | Quantidade de cupons que receberam sufixo por conflito de code |
| dry_run | BOOLEAN | true se foi simulação (sem escrita) |
| status | TEXT | 'success', 'failed', 'inconsistent' (falha na validação pós-migração) |
| validation_errors | JSONB/TEXT | Detalhes das falhas de validação pós-migração (se status = inconsistent) |
| executed_at | TIMESTAMPTZ | Timestamp do commit (ou da execução) |
| executor_id | UUID | admin_id (quem disparou a migração) |
| created_at | TIMESTAMPTZ | Inserção do log |

**Sugestão de tabela persistente:**

```sql
CREATE TABLE event_organizer_migration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  organizer_from UUID NOT NULL REFERENCES profiles(id),
  organizer_to UUID NOT NULL REFERENCES profiles(id),
  total_cupons_exclusivos INT NOT NULL DEFAULT 0,
  total_cupons_compartilhados INT NOT NULL DEFAULT 0,
  total_lideres_criados INT NOT NULL DEFAULT 0,
  total_lideres_reutilizados INT NOT NULL DEFAULT 0,
  total_invitations_updated INT NOT NULL DEFAULT 0,
  conflitos_codigo_resolvidos INT NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'inconsistent')),
  validation_errors TEXT,
  executed_at TIMESTAMPTZ,
  executor_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_migration_log_event ON event_organizer_migration_log(event_id);
CREATE INDEX idx_migration_log_executed ON event_organizer_migration_log(executed_at);
```

- Em caso de **dry_run**, registrar uma linha com `dry_run = true` e sem `executed_at` (ou com timestamp da simulação), sem alterar evento/cupons/líderes.
- Em caso de **sucesso**, preencher todos os contadores e `status = 'success'`, `executed_at = NOW()`.
- Em caso de **falha na transação**, registrar `status = 'failed'` e opcionalmente mensagem de erro.
- Em caso de **validação pós-migração falha**, registrar `status = 'inconsistent'` e `validation_errors` com o detalhe.

**Snapshot pré-migração (opcional — nível enterprise):** Para rollback real e auditoria profunda, pode-se persistir o estado antes da mudança em uma tabela `event_organizer_migration_snapshot` (migration_id, event_id, organizer_id, payload_json com estado relevante: evento, cupons do evento, convites). Ver doc de implementação segura (seção 3b).

---

## ETAPA 5quinque — Dry run (simulação)

**Objetivo:** Permitir validação antes da execução real, sem alterar dados.

**Proposta:**

1. **Endpoint ou parâmetro:** Aceitar `dry_run=true` (query param ou body), ex.: `POST /api/admin/events/:eventId/change-organizer?dry_run=true` ou `{ "new_organizer_id": "...", "dry_run": true }`.
2. **Comportamento quando dry_run = true:**
   - Executar todas as **leituras** e **validações** (evento existe, B é organizador, idempotência, listar cupons, classificar exclusivos/compartilhados, carregar líderes, verificar equivalentes em B, conflitos de code).
   - **Não** abrir transação de escrita (ou abrir e fazer apenas ROLLBACK sem COMMIT). Não executar UPDATE/INSERT/DELETE em events, coupons, coupon_events, group_leaders, organizer_group_leaders.
   - Retornar um payload estruturado com:
     - **Cupons a atualizar (exclusivos):** lista de ids e codes (e leader_id atual → leader_id_em_B quando houver).
     - **Cupons a duplicar (compartilhados):** lista de ids, codes, e para cada um: code_final (original ou com sufixo), leader_id_em_B quando houver.
     - **Líderes a criar:** lista (leader_id_original, nome, email, telefone) que não têm equivalente em B.
     - **Líderes a reutilizar:** lista (leader_id_original → leader_id_em_B) que já existem em B.
     - **Conflitos de código:** lista de codes que receberiam sufixo (B já possui cupom com esse code).
     - **Convites a reassociar:** lista de convites (id, leader_id atual → leader_id_em_B) que seriam atualizados; total_invitations_to_update.
     - **Resumo:** totais (ex.: N exclusivos, M compartilhados, L líderes criados, K reutilizados, C conflitos, I convites a atualizar).
3. **Log:** Opcionalmente inserir em `event_organizer_migration_log` uma linha com `dry_run = true`, sem `executed_at`, e contadores preenchidos conforme o que *seria* feito.

---

## ETAPA 5sex — Rollback inteligente (pós-commit)

Além do rollback **dentro** da transação (qualquer erro antes do COMMIT → ROLLBACK), definir estratégia para **reverter após o commit**.

**Limitações e premissas:**

- Após o commit, podem ter ocorrido **novas inscrições**, **uso de cupons** e **alterações** no evento sob o organizador B. Reverter "no tempo" exige decidir o que fazer com esses dados.
- **Limites seguros do rollback:** Recomenda-se permitir rollback pós-commit apenas dentro de uma **janela de tempo** (ex.: 24h ou 48h) e/ou desde que **nenhuma** inscrição nova tenha sido criada para o evento **após** a migração. Caso contrário, o rollback pode gerar inconsistência (inscrições e pagamentos ligados a cupons que voltariam a ser de A).

**Estratégia proposta:**

1. **Pré-condições para permitir rollback pós-commit:**
   - Verificar se existem **registrations** com `event_id = evento` e `created_at > migration_executed_at` (timestamp do log de migração). Se existir, **negar** rollback automático e registrar motivo (ex.: "existem N inscrições após a migração").
   - Opcional: verificar se algum cupom de B (transferido ou duplicado) teve `current_uses` incrementado após a migração; se sim, negar ou avisar.
2. **Passos do rollback (em transação):**
   - Evento: `UPDATE events SET organizer_id = A WHERE id = event_id`.
   - Cupons exclusivos (que foram transferidos para B): `UPDATE coupons SET organizer_id = A, leader_id = leader_id_original` (precisa ter guardado o leader_id original no log ou recuperar por histórico; se não tiver, só organizer_id de volta para A e leader_id pode ficar como está ou NULL conforme política).
   - Cupons duplicados (compartilhados): DELETE de `coupon_events` onde coupon_id IN (ids dos cupons criados para B) e event_id = evento; DELETE dos cupons criados para B (ou marcar inativos em vez de deletar, se houver soft delete). Reinserir em `coupon_events` o vínculo (coupon_id_original_A, event_id) para o cupom original de A.
   - **Convites:** Reverter `leader_id` dos convites que foram reassociados na migração. Se a tabela `leader_invitations` tiver coluna `migrated_from_leader_id` e `migration_id`, executar: `UPDATE leader_invitations SET leader_id = migrated_from_leader_id, migrated_from_leader_id = NULL, migrated_at = NULL, migration_id = NULL WHERE migration_id = $migration_id`. Caso contrário, usar tabela de auditoria `leader_invitation_migration_audit` para obter (invitation_id, migrated_from_leader_id) e atualizar cada convite; em seguida limpar ou manter o registro de auditoria conforme política.
   - Líderes criados em B: decidir se serão desativados (is_active = false), removidos do vínculo com B (DELETE de organizer_group_leaders), ou deixados como estão (não compartilham com A; apenas não são mais referenciados pelos cupons revertidos).
3. **Registrar rollback:** Inserir em `event_organizer_migration_log` (ou tabela análoga) um registro de tipo "rollback" com referência à migração original (event_id, executed_at), executor e timestamp, para auditoria.

**Conflitos de dados novos:** Se já houver inscrições/cupons usados após a migração, o rollback automático não deve ser oferecido; o suporte deve avaliar manualmente (restauração de backup ou correção pontual).

---

## ETAPA 5sept — Edge cases de líderes

Cenários em que o matching ou a criação de líder pode falhar ou ser ambíguo; definir fallback e regras.

1. **Líder sem email e sem telefone:**
   - **Fallback de matching:** Não há chave para buscar equivalente em B. **Decisão:** Criar **sempre** um novo líder em B com os dados disponíveis (nome, outros campos). Se nome também estiver vazio, usar placeholder (ex.: "Líder migrado - ID {leader_id_original}") e registrar em log para revisão manual.
2. **Múltiplos líderes em B com mesmo email:**
   - **Regra:** Ao buscar equivalente por email, usar `LIMIT 1` (ex.: ordenar por created_at ASC para escolher o mais antigo). Documentar que o primeiro encontrado será reutilizado; evitar criar outro líder com mesmo email em B.
3. **Dados inconsistentes (email inválido, telefone vazio):**
   - **Email inválido (formato):** Se o email do líder original não passar em validação (ex.: regex), tratar como "sem email" e usar telefone para matching; se telefone também vazio ou inválido, criar novo líder com o valor bruto (ou NULL) e registrar em log.
   - **Telefone vazio:** Usar apenas email para matching. Se email também vazio, ver item 1.
4. **Quando criar novo líder obrigatoriamente:**
   - Quando não existir nenhum líder em B com mesmo email (e, se email ausente, mesmo telefone).
   - Quando o líder original não tiver nem email nem telefone (criar com dados disponíveis ou placeholder).
   - Quando a busca por email/telefone retornar mais de um candidato e a política for "não reutilizar em caso de ambiguidade" (opcional): criar novo líder e registrar ambiguidade em log.

---

## ETAPA 5oct — Performance em grande escala

**Cenário alvo:** Evento com 1000+ cupons e/ou 100+ líderes distintos.

**Recomendações:**

1. **Batch processing para líderes:**
   - Carregar dados de todos os líderes necessários em **uma ou poucas** queries (ex.: `WHERE gl.id = ANY($leader_ids)` com array de até 500 ids; se houver mais, paginar em batches de 200–500).
   - Para "verificar equivalente em B", evitar N queries: buscar **todos** os líderes de B com seus emails/telefones em uma query (ex.: organizer_group_leaders JOIN group_leaders JOIN users JOIN profiles WHERE organizer_id = B), carregar em memória e fazer o matching por email/telefone em código. Assim, 100 líderes originais exigem 1 query de dados originais + 1 query de líderes de B + até 100 INSERTs (apenas para os que não existirem).
2. **Limites de query:**
   - Cupons: a query que lista cupons do evento (10.3.1) já é por event_id; pode adicionar LIMIT com valor alto (ex.: 10000) para evitar resultado gigante; se ultrapassar, retornar erro "evento com muitos cupons; migração requer processamento em batch" e tratar em versão futura ou script específico.
   - Líderes: carregar em batches (ex.: 200 leader_ids por vez) para não estourar memória.
3. **Otimizações:**
   - Índices: garantir índices em `coupon_events(event_id)`, `coupons(organizer_id)`, `organizer_group_leaders(organizer_id)`, `group_leaders(id)`, `events(id)` para as queries de migração.
   - Dentro da transação, minimizar round-trips: preferir um INSERT com múltiplos valores (multi-row INSERT) para coupon_events quando duplicar vários cupons, em vez de um INSERT por cupom.
   - Se a migração for chamada por job assíncrono, considerar timeout (ex.: 2–5 minutos) e retornar "migração em andamento" ou quebrar em fases (fase 1: líderes; fase 2: cupons; fase 3: evento) só se a transação única for inviável.

---

## ETAPA 5non — Idempotência avançada

Além da verificação "evento já tem organizer_id = B" (retornar sucesso sem escrita):

1. **Impedir duplicação de cupons em reexecução parcial:**
   - Se a transação falhar **depois** de ter inserido alguns cupons duplicados (compartilhados) para B mas **antes** de atualizar o evento, na reexecução os cupons do evento ainda seriam listados (pertencem a A em coupon_events). O processo tentaria duplicar de novo e criaria cupons duplicados em B. **Mitigação:** Antes de inserir cupons compartilhados para B, verificar se já existe cupom em B com mesmo code (ou code com sufixo) vinculado ao evento em coupon_events. Se existir, considerar que aquele cupom já foi duplicado (reexecução parcial) e usar o id existente em vez de inserir de novo; ou pular esse cupom e registrar em log. Alternativa: não fazer COMMIT parcial; manter uma única transação e em falha fazer ROLLBACK completo, então não há "reexecução parcial" de escrita — apenas reexecução do fluxo inteiro após falha.
2. **Detectar execução incompleta anterior:**
   - Consultar `event_organizer_migration_log`: se existir registro com event_id e organizer_to = B com status 'failed' ou 'inconsistent' e executed_at recente (ex.: últimas 24h), exibir aviso ou bloquear nova migração até análise. Opcional: permitir "retry" que reutiliza o mesmo evento e organizador e força nova tentativa (com lock FOR UPDATE).
3. **Reprocessamento seguro:**
   - Se evento já está com organizer_id = B e não há registro de log de sucesso para essa migração, ainda assim considerar idempotente e retornar sucesso (evitar refazer). Se houver registro de log com status 'inconsistent', oferecer endpoint ou flag de "revalidar" que apenas roda as validações pós-migração novamente e atualiza o status do log, sem alterar dados.

---

## ETAPA 6 — Permissões

- **Quem pode alterar o organizador?**
  - **Recomendação:** somente **admin** (role admin). Alteração sensível; impacto em cupons, financeiro e relatórios.
  - **Organizador atual (A) pode transferir?** Pode ser permitido como política (ex.: “transferir evento para outro organizador”), mas tecnicamente deve passar por mesma validação e transação; em caso de “transferência voluntária”, A apenas solicita e admin executa, ou A executa se tiver endpoint restrito a “transferir para B” com checagem de permissão.
- **Auditoria:** Registrar quem alterou, quando e de quem para quem (log ou tabela de histórico).

---

## ETAPA 7 — Impacto no frontend

- **Telas que exibem organizador do evento:**
  - Admin: listagem/edição de eventos, relatórios, comunicação (ex.: EventManagement, EventViewEditDialog, AdvancedReports, CommunicationSupport).
  - Organizador: dashboard, eventos, relatórios, cupons, inscrições, comissões (OrganizerEvents, OrganizerDashboardOverview, CouponsManagement, OrganizerRegistrations, LeaderEventCommissions, etc.).
- **Comportamento após migração:** B passa a ver o evento em “meus eventos”; A deixa de ver. Nenhuma mudança de tela é obrigatória se o backend já retornar eventos filtrados por `organizer_id`; pode ser desejável um aviso na tela de edição do evento (admin) tipo “Organizador atual: [nome]” e “Alterar organizador” com seletor + confirmação.
- **Filtros por organizador:** Admin filtra por organizador; após migração, o evento passa a aparecer nos filtros do organizador B.
- **Dashboards:** Organizer dashboard usa `e.organizer_id`; automaticamente refletem a mudança. Nenhuma alteração obrigatória no frontend para “funcionar”; alterações são de UX (botão/ fluxo de “alterar organizador” no admin).

---

## ETAPA 8 — Testes necessários

Cenários a validar **após** a mudança de organizador:

1. **Evento sem inscrições** — Trocar organizador; evento aparece para B; sumir da lista de A; criar inscrição e pagamento como B.
2. **Evento com inscrições** — Trocar organizador; listagem de inscrições (por evento e por organizador) mostra o evento sob B; exportação CSV; detalhes da inscrição.
3. **Evento com cupons ativos (só deste evento)** — Cupons com apenas este evento em coupon_events; após migração, validar cupom na inscrição (fluxo de registro) com evento agora de B; verificar que cupom é encontrado e aplicado.
4. **Evento com cupons ativos (este + outros eventos)** — Cenário B.2a: duplicar cupom para B; remover evento de A do coupon_events; validar que em B o cupom funciona para o evento migrado; em A o cupom continua funcionando para os outros eventos.
5. **Evento com pagamentos concluídos** — Inscrições pagas; asaas_payments; após migração, relatório financeiro do B deve incluir esse evento; receita e saques consistentes.
6. **Evento com cronograma e premiação** — Campos/colunas em events e cronograma_items; após migração, edição pelo B deve mostrar e permitir alterar normalmente.
7. **Comissões e convites** — leader_event_commissions e leader_invitations ligados ao evento; após migração, líderes do B (se houver) e comissões continuam corretas por evento; convites existentes continuam válidos (referem event_id e registration).
7a. **Convites disponíveis utilizáveis após migração** — Convites com status available/sent do evento migrado devem continuar utilizáveis: listagem de convites do evento/organizador B deve mostrá-los; uso do convite no checkout (inscrição com bônus de líder) deve aceitar normalmente; leader_id do convite deve ser de líder vinculado a B.
7b. **Convites usados permanecem no histórico** — Convites com status used ou expired não devem ser alterados (mesmo leader_id); histórico de comissões e de quem indicou a inscrição permanece correto; nenhuma duplicidade de convites.
8. **Permissões** — A não acessa mais o evento (403); B acessa; admin acessa; validação de cupom no fluxo de inscrição com B como organizador do evento.

**Testes adicionais obrigatórios (cupons e consistência):**

9. **Cupom exclusivo funcionando após migração** — Cupom ligado só a este evento; após migração, validar com B no fluxo de inscrição (validateCoupon + aplicar); cupom deve ser encontrado e aplicado; `current_uses` do cupom transferido permanece inalterado.
10. **Cupom compartilhado duplicado corretamente** — Cupom de A ligado a evento migrado + outro evento; após migração: B tem novo cupom com mesmo code (ou code com sufixo se conflito), vinculado apenas ao evento migrado; A mantém cupom com vínculo apenas nos outros eventos; cupom de B tem `current_uses = 0`; novo cupom de B funciona no evento migrado.
11. **Cupom antigo (A) não funciona no evento migrado** — Após migração, chamar validação com code do cupom que era de A e event_id do evento migrado (como se fosse inscrição no evento de B); deve retornar "Cupom não encontrado" ou "não válido para este evento". Garantir que nenhum cupom de A seja aceito para este evento.
12. **Conflito de código entre organizadores** — B já possui cupom com code "PROMO10"; evento de A tem cupom compartilhado com code "PROMO10"; ao migrar, o cupom duplicado para B deve receber code distinto (ex.: PROMO10_MIGRADO); migração não falha; cupom duplicado funciona no evento migrado com o novo code.
13. **Múltiplos cupons no mesmo evento** — Evento com 2+ cupons (ex.: um exclusivo, um compartilhado); após migração, todos tratados conforme regra (exclusivo → UPDATE organizer_id; compartilhado → duplicar + remover vínculo); todos continuam válidos para o evento sob B; histórico de registrations.coupon_code inalterado.

**Testes obrigatórios — leader_id (cupons com líder):**

14. **Cupom com leader_id migrado corretamente** — Cupom exclusivo ou duplicado com `leader_id`; após migração, cupom de B deve ter `leader_id` preenchido com o ID do líder equivalente no organizador B; validação do cupom (validateCoupon) e uso na inscrição devem funcionar; líder do organizador A permanece inalterado.
15. **Líder criado automaticamente no novo organizador** — Cupom com leader_id cujo líder não existe em B (email/telefone não encontrado); após migração, novo líder deve ser criado em B com nome, email, telefone do líder original; cupom de B deve referenciar esse novo líder; nenhum registro de líder do organizador A alterado ou removido.
16. **Líder já existente sendo reutilizado** — Líder original (de A) tem mesmo email que um líder já vinculado a B; após migração, cupom de B deve usar o `leader_id` do líder já existente em B; não deve ser criado líder duplicado em B.
17. **Múltiplos cupons usando o mesmo líder** — Vários cupons (ex.: 2 exclusivos ou 2 compartilhados) com o mesmo `leader_id`; após migração, um único líder equivalente em B deve ser usado para todos; mapa old_leader_id → new_leader_id aplicado; sem duplicação desnecessária de líderes em B.
18. **Sem duplicação desnecessária de líderes** — Cenário com 3 cupons e 2 líderes distintos (2 cupons com líder X, 1 cupom com líder Y); em B devem existir no máximo 2 líderes equivalentes (X', Y'); cupons devem referenciar corretamente X' e Y'.

---

## ETAPA 9 — Riscos

| Risco | Mitigação |
|-------|------------|
| Inconsistência de dados (evento de B mas cupom ainda de A) | Usar Opção B e transação; testes de validação de cupom (Etapa 8). |
| Cupom parar de funcionar após troca | Implementar B.1 e B.2a; validar com testes 3 e 4. |
| Perda de vínculo com pagamentos | Não alterar registrations nem asaas_payments; apenas events (e cupons). Pagamentos seguem por registration → event. |
| Conflito de código de cupom (B já tem mesmo code) | Na duplicação (B.2a), verificar UNIQUE(code, organizer_id); se B já tiver o code, usar sufixo ou nomear “Cópia para evento X”. |
| Problemas de permissão (A ainda acessa ou B não acessa) | Todas as rotas que usam `event.organizer_id` ou `e.organizer_id` passarão a refletir B; testar acesso como A e B. |
| Cupom com leader_id perde vínculo ou referencia líder errado | Migração de líderes antes dos cupons; mapa leader_id_original → leader_id_em_B; testes 14–18; não alterar líderes do organizador A. |
| Execução simultânea da migração do mesmo evento | Lock no evento (SELECT FOR UPDATE); transação única; timeout de lock (Etapa 5bis). |
| Validação pós-migração falha (inconsistência após commit) | Etapa 5ter: verificação automática após commit; registro status inconsistent e detalhes; alerta para análise. |
| Convites órfãos ou inválidos (leader_id não em B, checkout falha) | Etapa 3ter: incluir leader_ids dos convites no mapeamento de líderes; atualizar apenas available/sent; validação 5ter item 7; testes 7a/7b. |
| Withdraw / financeiro do A com receita já “sacada” do evento | Se houver política de não migrar evento com saque já feito, validar antes; caso contrário, documentar que a receita futura do evento será de B. |

---

## ETAPA 10 — Plano final

### 10.1 Estratégia escolhida (obrigatória)

- **Opção B**, alinhada às regras da Etapa 3bis e decisões técnicas (conflito de código, globais, current_uses, consistência, **leader_id**):
  - **Líderes:** Para cupons com `leader_id`, preservar vínculo no novo organizador: mapear líderes necessários → verificar/criar equivalente em B (chave: email preferencial, telefone fallback) → mapa old_leader_id → new_leader_id. Executar **antes** de qualquer UPDATE/INSERT em cupons. Estratégia em lote para evitar N queries por cupom.
  - **Exclusivos:** cupons com vínculo **somente** a este evento → `UPDATE coupons SET organizer_id = B, leader_id = $leader_id_em_B` (quando cupom tiver leader_id). `current_uses` não é alterado.
  - **Compartilhados:** duplicar para B (INSERT em `coupons` com `current_uses = 0`, `leader_id = $leader_id_em_B` quando aplicável; code igual ou sufixo se conflito); INSERT em `coupon_events`; DELETE vínculo antigo em `coupon_events`.
  - **Globais:** cupons sem registro em `coupon_events` para este evento → **ignorados**.
  - **Conflito de código:** ao duplicar, se B já tiver cupom com o mesmo code → usar code com sufixo.
- **contact_messages:** Opcional: atualizar `organizer_id` para B onde `event_id = evento_migrado` (ou deixar histórico com A).

### 10.2 Passo a passo técnico

1. **Idempotência:** Ler `events.organizer_id` para o evento; se já for B, retornar sucesso (já migrado) e não executar escritas.
2. Validar: usuário é admin (ou política definida); evento existe; novo organizador existe e é organizador.
3. (Opcional) Validar: evento sem withdraw já processado que inclua esse evento; ou política de “não migrar com inscrições pagas”.
4. Iniciar transação e adquirir lock: `SELECT ... FROM events WHERE id = $event_id FOR UPDATE` (query 10.3.6). Se organizer_id já for B, ROLLBACK e retornar "já migrado".
5. Identificar cupons do evento (apenas com registro em coupon_events para este event_id; query 10.3.1). Classificar exclusivo (event_count=1) ou compartilhado (event_count>1). Globais ignorados:
   - Via `coupon_events` WHERE `event_id = $event_id`;
   - Obter para cada cupom se é “só este evento” (count eventos do cupom = 1) ou “vários eventos”.
6. **Líderes:** Mapear leader_id distintos (cupons + convites disponíveis do evento); carregar dados em lote (10.3.7); verificar/criar equivalente em B (10.3.8–9); mapa old→new.
7. **Convites:** Listar convites do evento com status available/sent (query 10.3 "Convites a reassociar"); UPDATE leader_invitations SET leader_id = mapa[leader_id], migrated_from_leader_id = leader_id, migrated_at = NOW(), migration_id = $migration_id WHERE event_id = evento AND status IN ('available','sent') AND (migration_id IS NULL). Em seguida **verificar convites órfãos:** query LEFT JOIN organizer_group_leaders para B; se count > 0, ROLLBACK.
8. Cupons exclusivos "só este evento": `UPDATE coupons SET organizer_id = B, leader_id = mapa[leader_id] WHERE id IN (...)` (leader_id quando aplicável).
9. Cupons compartilhados "este e outros": para cada um: (a) verificar conflito de code em B (query 10.3.3); (b) definir code final (original ou sufixo); (c) INSERT em `coupons` (organizer_id = B, current_uses = 0, leader_id = mapa[leader_id] quando aplicável); (d) INSERT em `coupon_events` (novo id, event_id); (e) DELETE de `coupon_events` (coupon_id original, event_id).
10. Evento: `UPDATE events SET organizer_id = B WHERE id = event_id`.
11. (Opcional) UPDATE contact_messages SET organizer_id = B WHERE event_id = event_id AND organizer_id = A.
12. Commit; em qualquer erro, rollback.
13. (Pós-commit) Executar validação automática (Etapa 5ter). Se falhar, registrar status 'inconsistent' no log e retornar erro.

### 10.3 Queries necessárias (detalhadas)

**Escopo:** Considerar apenas cupons que tenham **pelo menos um** registro em `coupon_events` com `event_id = evento_migrado`. Cupons globais (sem registro em coupon_events para este evento) são ignorados.

**1. Identificar cupons do evento (exclusivos vs compartilhados)**

```sql
SELECT c.id, c.organizer_id, c.code, c.name, c.type, c.discount_value, c.expiration_date, c.max_uses, c.current_uses, c.is_active, c.leader_id,
       (SELECT COUNT(*) FROM coupon_events ce WHERE ce.coupon_id = c.id) AS event_count
FROM coupons c
INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $event_id
WHERE c.organizer_id = $organizer_a_id;
```

- `event_count = 1` → cupom **exclusivo** (ligado só a este evento).
- `event_count > 1` → cupom **compartilhado** (ligado a este evento e a outros).

**2. Cupons exclusivos — atualizar dono (e leader_id quando houver)**

- Se cupom tiver `leader_id`, usar valor do mapa (leader_id_em_B); senão manter NULL.
```sql
UPDATE coupons SET organizer_id = $organizer_b_id, leader_id = $leader_id_em_b, updated_at = NOW() WHERE id = $id;
```
- Para lote: iterar ids exclusivos aplicando o mapa para leader_id.

**3. Conflito de código (antes de duplicar cada cupom compartilhado)**

```sql
SELECT id FROM coupons WHERE code = $code AND organizer_id = $organizer_b_id;
```

- Se retornar linha → B já tem cupom com esse code → usar code com sufixo (ex.: `code || '_MIGRADO'` ou `code || '_EV' || substring(event_id::text, 1, 8)`), garantindo unicidade.

**4. Cupons compartilhados — duplicar para B**

- Inserir novo cupom (mesmos atributos, `organizer_id = B`, `current_uses = 0`, `leader_id` = valor do mapa quando cupom original tinha leader_id; code original ou com sufixo se conflito):

```sql
INSERT INTO coupons (organizer_id, code, name, type, discount_value, expiration_date, max_uses, current_uses, is_active, leader_id, created_at, updated_at)
VALUES ($organizer_b_id, $code_final, $name, $type, $discount_value, $expiration_date, $max_uses, 0, $is_active, $leader_id_em_b, NOW(), NOW())
RETURNING id;
```

- Vincular apenas ao evento migrado:

```sql
INSERT INTO coupon_events (coupon_id, event_id) VALUES ($novo_coupon_id, $event_id);
```

- Remover vínculo do cupom original de A com o evento migrado:

```sql
DELETE FROM coupon_events WHERE coupon_id = $coupon_original_id AND event_id = $event_id;
```

**5. Atualizar evento**

```sql
UPDATE events SET organizer_id = $organizer_b_id, updated_at = NOW() WHERE id = $event_id;
```

**5b. Convites a reassociar (leader_invitations)**

- Listar convites do evento com status available/sent para atualizar leader_id (usar mapa old_leader_id → new_leader_id). Incluir os leader_id desses convites no mapeamento de líderes (passo 6) se ainda não estiverem.

```sql
SELECT id, leader_id, event_id, bonus_registration_id, status
FROM leader_invitations
WHERE event_id = $event_id AND status IN ('available', 'sent');
```

- Atualizar em batch por old_leader_id (um UPDATE por par no mapa que tenha convites no evento):

```sql
UPDATE leader_invitations
SET leader_id = $new_leader_id, updated_at = NOW()
   -- opcional: , migrated_from_leader_id = leader_id, migrated_at = NOW(), migration_id = $migration_id
WHERE event_id = $event_id AND status IN ('available', 'sent') AND leader_id = $old_leader_id;
```

**6. Idempotência e lock (início da transação)**

- Idempotência: ler organizer_id; se já for B, abortar escritas e retornar "já migrado".
- Lock para concorrência: na mesma transação que fará as escritas, bloquear o evento para evitar migração simultânea do mesmo evento:

```sql
SELECT id, organizer_id FROM events WHERE id = $event_id FOR UPDATE;
```

- Se organizer_id = $organizer_b_id, fazer ROLLBACK e retornar sucesso (já migrado). Caso contrário, prosseguir com a migração na mesma transação (sem liberar o lock até COMMIT).

**7. Líderes — carregar dados em lote (para lista de leader_ids)**

- Obter nome, email, telefone (e demais campos necessários) dos líderes a partir de `group_leaders` e do perfil do usuário (users + profiles).
```sql
SELECT gl.id AS leader_id, p.full_name, u.email, p.phone
FROM group_leaders gl
JOIN users u ON gl.user_id = u.id
JOIN profiles p ON p.id = u.id
WHERE gl.id = ANY($leader_ids);
```

**8. Líderes — verificar se existe equivalente no organizador B (por email ou telefone)**

- Chave preferencial: email. Fallback: telefone. Comparação case-insensitive, trim.
```sql
SELECT gl.id AS leader_id
FROM group_leaders gl
JOIN users u ON gl.user_id = u.id
JOIN profiles p ON p.id = u.id
JOIN organizer_group_leaders ogl ON ogl.leader_id = gl.id AND ogl.organizer_id = $organizer_b_id
WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($email))
   OR (LOWER(TRIM(p.phone)) = LOWER(TRIM($phone)) AND $phone IS NOT NULL AND p.phone IS NOT NULL)
LIMIT 1;
```

**9. Líderes — criar novo líder no organizador B**

- Inserir em `group_leaders` (e, conforme modelo, eventualmente user/profile ou vínculo em `organizer_group_leaders`) com base nos dados do líder original (nome, email, telefone). Implementação dependerá do schema: se cada organizador tem seus próprios registros de líder (sem compartilhar), criar novo registro; obter `leader_id` retornado e registrar em `organizer_group_leaders(organizer_id = B, leader_id)`. Detalhar na implementação.

### 10.4 Alterações no backend

- Novo endpoint (ex.: `POST /api/admin/events/:eventId/change-organizer`) apenas para admin; suporte a parâmetro `dry_run` (Etapa 5quinque).
- Serviço dedicado (ex.: `changeEventOrganizerService`) que implementa os passos em transação, com lock FOR UPDATE no evento (Etapa 5bis), validação pós-migração (Etapa 5ter) e escrita em `event_organizer_migration_log` (Etapa 5quater).
- Validações: evento, novo organizador, (opcional) regras de negócio (inscrições/pagamentos/saques).
- Migração: criar tabela `event_organizer_migration_log` conforme Etapa 5quater para auditoria e rastreio.

### 10.5 Alterações no frontend (se houver)

- Tela admin de edição/visualização do evento: campo “Organizador” editável (seletor) + botão “Alterar organizador” com confirmação e possível aviso (“Cupons vinculados a este evento serão transferidos ou duplicados”).
- Nenhuma alteração obrigatória em listagens/dashboards (já filtradas por backend por organizer_id).

### 10.6 Testes obrigatórios

- Executar todos os cenários da **Etapa 8** (itens 1 a 8: evento sem inscrições; com inscrições; cupons exclusivos; cupons compartilhados; pagamentos; cronograma/premiação; comissões/convites; permissões).
- Executar os **testes adicionais obrigatórios** da Etapa 8 (itens 9 a 13: cupom exclusivo; compartilhado; cupom antigo não funciona; conflito de código; múltiplos cupons). Executar os **testes de leader_id** (itens 14 a 18: cupom com leader_id migrado; líder criado automaticamente; líder existente reutilizado; múltiplos cupons mesmo líder; sem duplicação de líderes).
- Teste de **rollback:** forçar falha no meio da transação (ex.: após UPDATE de cupons exclusivos, antes de UPDATE events) e verificar que nenhuma alteração permanece (evento continua de A; cupons não alterados).
- Teste de **dry run:** chamar migração com dry_run=true; verificar que nenhum dado foi alterado e que o payload retornado lista cupons a atualizar/duplicar, líderes a criar/reutilizar e conflitos de código.
- Teste de **validação pós-migração:** após migração bem-sucedida, executar as checagens da Etapa 5ter (event.organizer_id, cupons de B, coupon_events, leader_id válidos); simular falha (ex.: alterar manualmente um organizer_id de cupom) e verificar que a validação detecta inconsistência e registra no log.

### 10.7 Plano de rollback

- **Antes da migração:** não há “backup” automático; em ambiente de produção, considerar snapshot ou backup da base.
- **Rollback lógico:** Se a migração já foi commitada e for necessário reverter:
  - Executar novamente a “migração” invertida: evento de volta para A; cupons que foram transferidos/duplicados para B precisam ser revertidos (cupons que só tinham este evento: UPDATE organizer_id e leader_id de volta para A; cupons duplicados: remover o cupom de B e recolocar evento no cupom de A em coupon_events). Fazer em transação e documentar script de rollback.
- **Prevenção:** Executar primeiro em homologação com cópia de dados; só então em produção.

---

## Resumo executivo

- **Alteração central:** `events.organizer_id` de A para B.
- **Ponto crítico:** cupons. Regras obrigatórias (Etapa 3bis): exclusivos → UPDATE organizer_id (e leader_id quando houver); compartilhados → duplicar para B (current_uses = 0, leader_id mapeado, code ou sufixo se conflito); globais → ignorados. **Líderes (leader_id):** preservar vínculo; mapear líderes → verificar/criar equivalente em B (chave: email preferencial, telefone fallback) → mapa old→new; aplicar antes dos cupons; estratégia em lote; não alterar líderes de A; não compartilhar mesmo registro de líder entre organizadores. Histórico preservado (registrations, coupon_code, pagamentos intocados).
- **Restante:** integridade mantida por FKs em evento; relatórios e permissões passam a refletir B automaticamente.
- **Implementação:** 1) Serviço transacional de troca de organizador; 2) Endpoint admin; 3) (Opcional) UI de “Alterar organizador”; 4) Testes cobrindo cupons, inscrições, pagamentos e permissões; 5) Plano de rollback documentado e testado.
- **Segurança e produção (Etapas 5bis–5non):** Concorrência e lock (FOR UPDATE no evento); validação automática pós-migração; logs detalhados (tabela event_organizer_migration_log); dry run (simulação sem escrita); rollback inteligente pós-commit (com limites seguros); edge cases de líderes; performance em grande escala (batch, limites, índices); idempotência avançada.

Documento refinado (regras de cupons, leader_id, conflito de código, globais, current_uses, consistência, queries 10.3, testes 9–18, segurança transacional, concorrência, auditoria, validação pós-migração, dry run, rollback pós-commit, edge cases líderes, performance, idempotência avançada) e pronto para aprovação antes da implementação.
