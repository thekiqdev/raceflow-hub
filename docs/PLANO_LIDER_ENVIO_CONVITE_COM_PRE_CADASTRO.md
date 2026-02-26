# Plano: Envio de convite pelo líder com busca por CPF e pré-cadastro

## 1. Objetivo

Alinhar o fluxo de **envio de convite** pelo líder de grupo ao comportamento do **painel do organizador** ao inscrever atleta:

1. Líder informa o **CPF** e clica em **Buscar**.
2. **Se o CPF estiver cadastrado:** exibir dados do runner e o botão **Enviar convite**.
3. **Se o CPF não estiver cadastrado:** abrir formulário de **pré-cadastro** (mesmos campos do organizador); ao enviar, o backend cria o usuário e associa o convite a ele.

Assim, o líder pode enviar convite tanto para quem já está na plataforma quanto para quem ainda não tem cadastro (pré-cadastro feito pelo líder).

---

## 2. Comportamento atual

### Líder (LeaderDashboard)

- Dialog **Enviar Convite**: apenas campo **CPF** e botão **Enviar Convite**.
- Ao enviar: chama `sendInvitation({ invitation_id, runner_cpf })`.
- Backend: `sendInvitationByCpf` busca usuário por CPF; **se não encontrar, retorna erro** (“Runner não encontrado com este CPF…”).

### Organizador (OrganizerRegistrations)

- **Passo 1:** CPF + botão **Buscar** → `getPublicProfileByCpf(registerCpf)`.
  - Se encontrado: `athleteFound = true`, `athleteData` preenchido; mensagem “Atleta encontrado…”
  - Se não: `athleteFound = false`; mensagem “CPF não cadastrado. Preencha os dados no próximo passo.”
- **Passo 2 (só quando CPF não cadastrado):** Formulário com:
  - Nome completo *  
  - Data de nascimento *  
  - Cidade *  
  - Sexo * (M/F)  
  - Equipe (opcional)  
  - Email (opcional)  
  - Telefone (opcional)  
  - Validação mínima (nome, nascimento, sexo).
- **Passo 3:** Evento, modalidade, categoria, kit e confirmação; depois `createRegistrationByOrganizer({ cpf, runner_data?, event_id, category_id, ... })`.
- Backend: se usuário não existe por CPF, chama `createRunnerByOrganizer(cpf, runner_data)` e depois cria a inscrição.

---

## 3. Comportamento desejado (líder)

### Fluxo no dialog “Enviar Convite”

| Etapa | Ação | Resultado |
|-------|------|-----------|
| 1 | Líder informa CPF e clica em **Buscar** | Chamar `getPublicProfileByCpf(cpf)` (ou equivalente no backend para líder). |
| 2a | CPF **encontrado** | Mostrar resumo do runner (nome, email, etc.) e botão **Enviar convite**. Ao clicar: `sendInvitation({ invitation_id, runner_cpf })` (comportamento atual). |
| 2b | CPF **não encontrado** | Mostrar formulário de pré-cadastro (mesmos campos do organizador: nome, nascimento, cidade, sexo, equipe, email, telefone). Botão **Enviar convite**. Ao clicar: chamar novo endpoint com `invitation_id`, `runner_cpf` e `runner_data`; backend cria o usuário e envia o convite. |

Não é necessário “passo 3” de evento/categoria no caso do líder: o convite já está atrelado a um evento (e a uma inscrição bônus). Só precisamos identificar ou criar o runner e associar o convite a ele.

---

## 4. Escopo técnico

### 4.1 Frontend (LeaderDashboard)

- **Dialog “Enviar Convite”:**
  - **Passo 1:** Campo CPF + botão **Buscar** (igual organizador).
  - **Estado:** `inviteStep: 1 | 2`, `inviteCpfLookupLoading`, `inviteAthleteFound: boolean | null`, `inviteAthleteData` (perfil quando encontrado), `inviteRunnerFormData` (quando não encontrado).
  - **Passo 2a (encontrado):** Resumo do atleta (nome, email, etc.) + botão **Enviar convite** → `sendInvitation({ invitation_id, runner_cpf })`.
  - **Passo 2b (não encontrado):** Formulário (nome completo *, data nascimento *, cidade *, sexo *, equipe, email, telefone) + validação + botão **Enviar convite** → chamar API com `runner_data`.
- Reutilizar máscaras e validações (CPF, telefone) já usadas no organizador; manter mesmos campos e obrigatoriedades do formulário de “dados do atleta” do organizador.

### 4.2 API (frontend)

- **Opção A (recomendada):** Estender o payload de `sendInvitation` para aceitar `runner_data?` (opcional). Se o backend retornar erro “runner não encontrado” e o front tiver `runner_data`, o front pode chamar de novo com `runner_data`; ou o backend pode, numa única chamada, criar o usuário se não existir e `runner_data` for enviado.
- **Opção B:** Novo método `sendInvitationOrPreregister({ invitation_id, runner_cpf, runner_data? })` que envia para um novo endpoint.
- Contrato sugerido (uma chamada só):  
  `POST .../invitations/send`  
  Body: `{ invitation_id, runner_cpf, runner_data?: { full_name, birth_date, city, gender, team?, email?, phone? } }`  
  - Se usuário existe por CPF → mesmo comportamento atual (envia convite).  
  - Se usuário não existe e `runner_data` foi enviado → criar usuário (createRunnerByOrganizer) e em seguida enviar convite para esse runner.  
  - Se usuário não existe e `runner_data` não foi enviado → retornar erro pedindo pré-cadastro (ou buscar no front e mostrar formulário).

### 4.3 Backend

- **Rota existente:** `POST /group-leaders/me/invitations/send` (body: `invitation_id`, `runner_cpf`).
- **Alteração:** Passar a aceitar body com `runner_data?` (opcional), no mesmo formato usado por `createRunnerByOrganizer`:  
  `full_name`, `birth_date`, `city`, `gender`, `team?`, `email?`, `phone?`.
- **Serviço** (ex.: `leaderInvitationsService.sendInvitationByCpf`):
  1. Validar CPF (11 dígitos).
  2. Buscar runner por CPF (query em users + profiles).
  3. **Se não encontrar:**
     - Se não tiver `runner_data` ou `runner_data.full_name` → lançar erro: “CPF não cadastrado. Preencha os dados para pré-cadastro.” (ou similar).
     - Se tiver `runner_data`: chamar `createRunnerByOrganizer(cleanCpf, runner_data)` (ou função equivalente no módulo de líder, reutilizando a do registrationsService), obter `runner.id`, e seguir para o passo de envio do convite (atualizar `leader_invitations`, atualizar `registrations` com `runner_id` e `payment_status = 'convidado'`).
  4. **Se encontrar:** manter lógica atual (verificar convite disponível, evento sem inscrição do runner, atualizar convite, atualizar inscrição bônus).
- Garantir que apenas líder autenticado possa enviar e que o convite pertença a ele (já existente).
- Notificação por email ao runner (convite recebido) pode permanecer como está (enviada após associar o convite ao runner).

### 4.4 Campos do formulário de pré-cadastro (líder)

Alinhados ao organizador:

| Campo            | Obrigatório | Observação                    |
|------------------|------------|-------------------------------|
| Nome completo    | Sim        |                               |
| Data nascimento  | Sim        |                               |
| Cidade           | Sim        |                               |
| Sexo             | Sim        | M / F                         |
| Equipe           | Não        |                               |
| Email            | Não        | Se único, será o email do user|
| Telefone         | Não        | Máscara (00) 00000-0000       |

Validação mínima no front: nome, data de nascimento e sexo obrigatórios quando `athleteFound === false`.

---

## 5. Etapas de implementação sugeridas

### Etapa 1 – Backend: aceitar `runner_data` e criar runner quando CPF não cadastrado

1. Na rota `POST .../invitations/send`, permitir body com `runner_data?` (opcional).
2. No serviço de envio de convite:
   - Se runner não existe por CPF e `runner_data` está presente e válido → importar/chamar `createRunnerByOrganizer(cleanCpf, runner_data)` (registrationsService), obter `runner.id`.
   - Se runner não existe e `runner_data` ausente ou inválido → retornar erro 400 com mensagem clara para o front exibir o formulário de pré-cadastro.
3. Manter o restante da lógica (validação do convite, evento, atualização de `leader_invitations` e `registrations`) igual; apenas garantir que `runner.id` seja o do runner existente ou o recém-criado.
4. Testes: (1) CPF cadastrado + enviar convite; (2) CPF não cadastrado + body com `runner_data` → usuário criado e convite enviado; (3) CPF não cadastrado sem `runner_data` → erro.

### Etapa 2 – Frontend: dialog em etapas (busca CPF + resultado ou formulário)

1. No dialog “Enviar Convite” do LeaderDashboard:
   - Adicionar estado: `inviteStep` (1 = CPF, 2 = resultado/form), `inviteCpfLookupLoading`, `inviteAthleteFound`, `inviteAthleteData`, `inviteRunnerFormData`, `registerCpfError` (opcional).
   - **Passo 1:** Campo CPF (máscara) + botão **Buscar**. Ao clicar: chamar `getPublicProfileByCpf(cpf)` (ou endpoint público de busca por CPF, se o líder usar outro). Se sucesso → `inviteAthleteFound = true`, `inviteAthleteData = response.data`, avançar para passo 2. Se não encontrado → `inviteAthleteFound = false`, avançar para passo 2 com formulário.
2. **Passo 2 – CPF encontrado:** Exibir resumo (nome, email, etc.) e botão **Enviar convite**. Ao clicar: `sendInvitation({ invitation_id, runner_cpf })`. Comportamento atual.
3. **Passo 2 – CPF não encontrado:** Exibir formulário (nome, nascimento, cidade, sexo, equipe, email, telefone). Validação (nome, nascimento, sexo). Botão **Enviar convite** → `sendInvitation({ invitation_id, runner_cpf, runner_data: { ... } })`.
4. Ajustar cliente API: `sendInvitation` aceitar `runner_data?: { full_name, birth_date, city, gender, team?, email?, phone? }`.
5. Ao fechar o dialog, resetar todos os estados (step, athleteFound, form, etc.).

### Etapa 3 – Ajustes de UX e mensagens

1. Textos do dialog: título/descrição deixando claro que pode buscar por CPF e, se não houver cadastro, preencher os dados para pré-cadastro.
2. Mensagens de erro do backend (ex.: “CPF não cadastrado. Preencha os dados abaixo para enviar o convite.”) exibidas no front quando aplicável.
3. Botão “Voltar” no passo 2 (opcional): voltar ao passo 1 para alterar o CPF.
4. (Opcional) Se o organizador usar máscara de CPF em um formato específico, manter o mesmo no líder.

### Etapa 4 – Testes e validação

1. Líder envia convite para CPF já cadastrado → convite enviado; runner vê inscrição em “Minhas Inscrições”.
2. Líder informa CPF não cadastrado → aparece formulário; preenche e envia → usuário criado, convite associado; runner (ou mesmo líder acessando com esse CPF depois) vê a inscrição.
3. CPF não cadastrado, líder tenta enviar sem preencher formulário → validação no front e/ou erro do backend.
4. Garantir que não seja possível enviar convite para runner que já tem inscrição no mesmo evento (regra atual mantida).

---

## Conclusão Etapa 4 (validação implementada)

O comportamento dos quatro cenários já está coberto pelo código:

| # | Cenário | Onde está garantido |
|---|---------|---------------------|
| 1 | CPF cadastrado → envio → runner vê em Minhas Inscrições | Front: passo 2 com "Atleta encontrado" e envio sem `runner_data`. Backend: encontra runner por CPF, atualiza convite e inscrição. MyRegistrations lista `payment_status === 'convidado'` na aba Ativas. |
| 2 | CPF não cadastrado → formulário → preenche e envia | Front: passo 2 com formulário e envio com `runner_data`. Backend: cria usuário com `createRunnerByOrganizer`, depois atribui convite. |
| 3 | CPF não cadastrado, enviar sem preencher | Front: valida nome, nascimento, cidade, sexo; não chama API se faltar. Backend: sem `runner_data`/`full_name` devolve erro. |
| 4 | Runner já inscrito no evento | Backend: consulta inscrições e lança erro. Front: exibe em `inviteApiError` e toast. |

**Checklist para testes manuais:** (1) CPF cadastrado → Buscar → Enviar → runner vê em Minhas Inscrições. (2) CPF novo → formulário → preencher e enviar → convite atrelado. (3) Formulário em branco → Enviar → erros de validação. (4) CPF já inscrito no evento → Enviar → mensagem de erro.

---

## 6. Resumo

| Onde        | O que fazer |
|------------|-------------|
| **Backend** | Aceitar `runner_data?` em `POST .../invitations/send`; se runner não existe por CPF e `runner_data` válido, criar usuário com `createRunnerByOrganizer` e depois associar o convite ao novo runner. |
| **Frontend** | Dialog em 2 passos: (1) Buscar por CPF; (2a) Se encontrado → resumo + “Enviar convite”; (2b) Se não → formulário de pré-cadastro (mesmos campos do organizador) + “Enviar convite” com `runner_data`. |
| **API client** | Estender `sendInvitation` com parâmetro opcional `runner_data`. |

Com isso, o envio de convite pelo líder fica alinhado ao fluxo do organizador (busca por CPF + pré-cadastro quando necessário), sem duplicar regras de negócio no backend.
