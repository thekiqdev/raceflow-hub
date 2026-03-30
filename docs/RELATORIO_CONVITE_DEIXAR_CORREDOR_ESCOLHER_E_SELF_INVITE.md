# Relatório: "Deixar o corredor escolher" não exibe opção + Permitir convite para si mesmo

## 1. Problema 1: Opção de escolha não aparece para o corredor

### Sintoma
Ao enviar o convite com a opção **"Deixar o corredor escolher categoria, modalidade e kit"** marcada, o corredor não vê a tela de escolha; a inscrição já aparece preenchida (categoria/kit selecionados automaticamente).

### Investigação

| Etapa | O que foi verificado | Resultado |
|-------|----------------------|-----------|
| Frontend (LeaderDashboard) | Payload quando checkbox "deixar corredor escolher" está marcado | ✅ Correto: envia apenas `runner_chooses_category_modality_kit: true`, sem `category_id`, `modality_id`, `kit_id` nem `product_selections`. |
| Backend (sendInvitationByCpf) | Quando `runner_chooses_category_modality_kit === true`, atualiza inscrição? | ✅ Não entra em `hasLeaderChoices`, então não sobrescreve categoria/kit. |
| Criação da inscrição bônus | Com que dados a inscrição grátis do convite é criada? | ❌ **Causa raiz:** em `leaderBonusService.ts` a inscrição é criada com `category_id: defaultCategory.id` (categoria padrão do evento). Não envia `kit_id` nem `modality_id` (ficam null). |
| Condição no painel do corredor | Quando exibir "Completar convite"? | `needsCompleteInvitation(reg) = payment_status === 'convidado' && !reg.category_id`. Como a inscrição bônus já tem `category_id` preenchido, a condição é **false** e o botão não aparece. |

### Causa raiz
- A **inscrição bônus** é criada com **categoria padrão** do evento ao conceder o convite ao líder (`leaderBonusService.checkAndGrantInvitationBonus` / `checkInvitationBonusForCommission`).
- Ao enviar o convite com "deixar o corredor escolher", o backend **não altera** essa inscrição (não entra em `hasLeaderChoices`), então ela continua com `category_id` (e possivelmente `modality_id`/`kit_id`) já preenchidos.
- No painel do corredor, "Completar convite" só aparece quando `!reg.category_id`. Como `category_id` já existe, a opção de escolha nunca é exibida.

### Correção aplicada (backend)
Em `sendInvitationByCpf`, quando **o líder escolheu "deixar o corredor escolher"** (`runner_chooses_category_modality_kit === true`):
- **Limpar** a inscrição bônus para o corredor poder escolher depois:
  - `UPDATE registrations SET category_id = NULL, modality_id = NULL, kit_id = NULL WHERE id = bonus_registration_id`
  - `DELETE FROM registration_product_selections WHERE registration_id = bonus_registration_id`
- Assim a inscrição fica sem categoria/kit/modalidade e o corredor passa a ver "Completar convite" e o fluxo de escolha.

---

## 2. Problema 2: Líder não pode enviar convite para si mesmo

### Sintoma
Ao buscar o próprio CPF no envio do convite, o sistema retorna erro do tipo "Este runner já possui uma inscrição para este evento".

### Investigação
- A **inscrição bônus** é criada com `runner_id = leader.user_id` (o próprio líder) em `leaderBonusService`.
- Ao "enviar" o convite, o backend transfere a inscrição para o runner informado (`UPDATE registrations SET runner_id = $1 ...`).
- Antes disso, há a checagem: existe alguma inscrição do evento com `runner_id = runner.id`?
- Se o líder envia para si mesmo, `runner.id === leader.user_id` e a única inscrição encontrada é a **própria inscrição bônus** que será "transferida" para ele. O código interpreta como "runner já tem inscrição" e bloqueia.

### Correção aplicada (backend)
- Na checagem de "runner já possui inscrição para este evento":
  - Se a única inscrição encontrada for a **inscrição bônus do convite** (`id === invitation.bonus_registration_id`), **permitir** (caso de autoconvite).
  - Caso contrário, manter o erro "Este runner já possui uma inscrição para este evento".

### Proteção de conta pública
- Não foi encontrado bloqueio específico de "conta pública" para envio de convite. A única restrição era a regra "já possui inscrição", ajustada acima para permitir o autoconvite quando a única inscrição é a do bônus.

---

## 3. Resumo das alterações

| Arquivo | Alteração |
|---------|-----------|
| `backend/src/services/leaderInvitationsService.ts` | 1) Quando `runner_chooses_category_modality_kit === true`, zerar `category_id`, `modality_id`, `kit_id` e remover `registration_product_selections` da inscrição bônus. 2) Na checagem de inscrição existente, permitir quando a única inscrição do evento para o runner é a `bonus_registration_id` do convite (self-invite). |

---

## 4. Critérios de teste

- **Deixar corredor escolher:** Líder marca "Deixar o corredor escolher...", envia convite. Corredor acessa "Minhas Inscrições" e vê o botão "Completar convite"; ao completar, escolhe categoria/modalidade/kit e a inscrição é atualizada.
- **Self-invite:** Líder busca o próprio CPF no envio do convite e envia; a operação conclui com sucesso e o líder (como corredor) vê a inscrição no painel; se for "deixar corredor escolher", vê "Completar convite" e consegue escolher categoria/modalidade/kit.
