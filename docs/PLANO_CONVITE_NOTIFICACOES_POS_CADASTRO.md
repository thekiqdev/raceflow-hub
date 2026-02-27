# Plano: Notificações de convite, reenviar e pós-cadastro

---

## Revisão do plano (antes de implantar por etapas)

**Objetivo desta revisão:** conferir o que já existe no código e o que falta, para executar o plano por etapas sem duplicar trabalho e sem quebrar o que já está feito.

### O que já existe

| Item | Onde | Observação |
|------|------|------------|
| Coluna `runner_preregistered` | Migration **092** (`092_add_runner_preregistered_to_leader_invitations.sql`) | Já criada. Convites antigos ficam `false`. |
| Template `invitation_received` | `notificationTemplatesService.ts` (seed) | Usado no envio atual; variáveis: userName, leaderName, eventTitle, eventDate, eventLocation. |
| Envio de email no convite | `leaderInvitationsService.sendInvitationByCpf` | Só envia se `runner_email && runner_name`; usa sempre `invitation_received`. |
| Rota GET validate token | `routes/invitations.ts` → `GET /complete-registration/validate?token=xxx` | Controller chama `validateCompletionRegistration(token)` do service. |
| Controller validate | `invitationCompletionController.ts` | Retorna `valid`, `runnerName`, `eventTitle` ou `error`. |

### O que está incompleto ou falta

| Item | Situação | Etapa do plano |
|------|----------|----------------|
| Marcar `runner_preregistered = true` ao criar runner | No `sendInvitationByCpf`, após criar runner com `createRunnerByOrganizer`, não há `UPDATE leader_invitations SET runner_preregistered = true`. | Etapa 1 |
| Incluir `runner_preregistered` no SELECT enriquecido | O `enrichedResult` em `sendInvitationByCpf` não seleciona `li.runner_preregistered`. | Etapa 1 |
| Dois templates (cadastrado vs sem cadastro) | Serviço usa só `invitation_received`. Não existe template `invitation_received_no_account` nem geração de link JWT. | Etapas 1 e 2 |
| Template `invitation_received_no_account` | Não está no seed de `notificationTemplatesService`. | Etapa 2 |
| Geração do link de completar cadastro (JWT) | Não implementada. Payload sugerido: `{ invitationId, runnerId, exp }`, assinado com `JWT_SECRET`. | Etapa 2 |
| Função `validateCompletionRegistration` | Importada pelo controller mas **não existe** no `leaderInvitationsService.ts` (apenas em build antigo/dist). Precisa ser implementada: validar JWT, conferir convite/runner e status “sent”. | Etapa 3 |
| POST definir senha por token | Rota `POST /api/auth/set-password-invitation` (ou equivalente) **não existe**. Corpo: `{ token, newPassword }`; atualizar `users.password_hash` e opcionalmente retornar token de login. | Etapa 3 |
| Reenviar email | Endpoint `POST /group-leaders/me/invitations/:id/resend-email` **não existe**. Reutilizar lógica de template (cadastrado vs sem cadastro) e envio. | Etapa 4 |
| Página frontend `/completar-cadastro` | Rota e tela **não existem**. Fluxo: validar token → formulário “Definir senha” → POST set-password → login e redirecionamento. | Etapa 5 |
| Completar itens da inscrição (variantes) | Depende do fluxo de “atributos faltantes” (ex.: `MissingAttributesModal`). Garantir que inscrições com `payment_status = 'convidado'` entrem nesse fluxo. | Etapa 6 |
| Botão “Reenviar” no painel do líder | Não implementado na lista de convites enviados. | Etapa 7 |
| Log quando email/nome ausente | Plano diz que já foi feito (Etapa 8). Confirmar em `sendInvitationByCpf`: `console.warn` quando `!runner_email || !runner_name`. | Etapa 8 |
| Líder: ver ingresso / PDF do convite | Endpoint `GET /group-leaders/me/invitations/:id/registration` **não existe**. Front: “Ver ingresso”, “Baixar PDF”, “Reenviar email” (este só se email válido). | Etapa 9 |

### Ordem sugerida para implementar (sem iniciar ainda)

1. **Etapa 1** – Backend: setar `runner_preregistered` ao criar runner; incluir no SELECT; escolher template (por enquanto só um continua; o segundo entra na Etapa 2).
2. **Etapa 2** – Backend: criar template `invitation_received_no_account` no seed; gerar JWT e `completeRegistrationLink`; no envio do convite, se `runner_preregistered` → usar novo template com link.
3. **Etapa 3** – Backend: implementar `validateCompletionRegistration` (validar JWT, convite, runner); criar `POST /api/auth/set-password-invitation` (ou em rota de invitations).
4. **Etapa 4** – Backend: `POST /group-leaders/me/invitations/:id/resend-email`.
5. **Etapa 5** – Frontend: rota `/completar-cadastro`, validar token, formulário senha, chamar set-password, login e redirecionamento.
6. **Etapa 6** – Frontend: garantir redirecionamento para fluxo de atributos faltantes (ou página “Completar inscrição”).
7. **Etapa 7** – Frontend: botão “Reenviar email” em convites enviados.
8. **Etapa 8** – Verificação: email para cadastrados, logs, docs e templates no admin.
9. **Etapa 9** – Backend: GET ingresso do convite para o líder; Frontend: “Ver ingresso”, “Baixar PDF”, “Reenviar” (condicionado a email válido).

### Pontos de atenção

- **Email temporário:** `createRunnerByOrganizer` usa `org-runner-{cpf}-{timestamp}@temp.cronoteam` quando não há email. Considerar “email válido” quando **não** for `@temp.cronoteam` (Etapa 9 e botão Reenviar).
- **JWT do link:** Usar o mesmo `JWT_SECRET` do auth; expiração sugerida 7 dias; payload mínimo: `{ invitationId, runnerId, exp }`.
- **Montagem da rota de invitations:** O arquivo `routes/invitations.ts` existe, mas o router **não está montado** em `server.ts`. É necessário adicionar `import invitationsRouter from './routes/invitations.js'` e `app.use('/api/invitations', invitationsRouter)` para o endpoint `GET /api/invitations/complete-registration/validate` (e futuros endpoints de completar cadastro) funcionarem.

Com isso, o plano está revisado e pronto para ser implantado por etapas quando você decidir iniciar.

---

## 1. Objetivo

1. **Novo template** de email para convites recebidos por **corredores que não tinham cadastro** (pré-cadastrados pelo líder), com link para completar cadastro (senha + itens faltantes da inscrição).
2. **Garantir** que o email para corredores **já cadastrados** está sendo enviado corretamente (template `invitation_received` atual).
3. **Botão "Reenviar"** no convite já enviado: disparar novamente o email de convite (mesmo conteúdo e regra: cadastrado vs sem cadastro).
4. **Fluxo ao clicar no link do email:** página de pós-cadastro onde o corredor define senha e completa o que falta na inscrição (ex.: variante de produto).
5. **Corredor sem email:** quando o corredor não possui email (ou só tem email temporário), o **líder que enviou o convite** precisa ter acesso à inscrição desse corredor para **visualizar o QR code**, **baixar em PDF** e **enviar ao corredor** por outro meio (WhatsApp, impressão, etc.). Se o corredor tiver email, o líder também pode visualizar/baixar o ingresso e, se desejar, reenviar o email de convite (que pode mencionar o ingresso ou link para acessá-lo).

---

## 2. Contexto atual

### 2.1 Notificação hoje

- **Onde:** `backend/src/services/leaderInvitationsService.ts` → após atribuir o convite ao runner, chama `sendNotificationSafely` com template `invitation_received`.
- **Condição:** só envia se `enrichedInvitation.runner_email && enrichedInvitation.runner_name`. O `enrichedResult` vem de um `SELECT` que faz `LEFT JOIN users u ON li.runner_id = u.id` e `LEFT JOIN profiles p ON u.id = p.id`, então `runner_email` e `runner_name` vêm de `users.email` e `profiles.full_name`.
- **Template atual:** `invitation_received` – texto genérico (“Sua inscrição foi confirmada… você pode visualizá-la em Minhas Inscrições”), sem link. Adequado para quem **já tem conta** e pode logar.

### 2.2 Corredor sem cadastro (pré-cadastro)

- O líder envia convite com `runner_data` → backend chama `createRunnerByOrganizer` → cria `users` (email real se informado, senão `org-runner-{cpf}-{timestamp}@temp.cronoteam`) e `profiles`, com senha aleatória (o corredor não sabe).
- O mesmo fluxo depois chama `sendNotificationSafely` com `invitation_received`. Se o email for real, o corredor recebe, mas o texto não diz que ele precisa “completar cadastro” (definir senha, preencher variantes etc.). Não há link.

### 2.3 Corredor sem email

- No pré-cadastro o líder pode não informar email, ou o sistema usa `org-runner-{cpf}-{timestamp}@temp.cronoteam`. Nesses casos o corredor **não recebe** (ou não acessa) email. O líder precisa poder **acessar a inscrição** daquele convite para repassar o ingresso ao corredor (impresso, WhatsApp, etc.).
- A inscrição vinculada ao convite é a `bonus_registration_id` em `leader_invitations`; hoje o corredor acessa via “Minhas Inscrições” e pode ver a página de QR/ingresso em `/registration/qrcode/:id`. O líder não tem hoje um fluxo para ver essa mesma inscrição.

### 2.4 O que falta

- Diferenciar **dois tipos** de convite no email: (a) runner já cadastrado → manter/ajustar `invitation_received`; (b) runner recém-criado (pré-cadastro) → novo template com **link de completar cadastro**.
- Garantir envio para cadastrados (verificar dados e logs).
- **Reenviar:** endpoint + botão no front para “reenviar email do convite”.
- **Pós-cadastro:** rota no front (ex.: `/completar-cadastro?token=xxx`), token válido (ex.: JWT), tela para definir senha e, em seguida, completar itens da inscrição (ex.: variantes de produto), reutilizando o fluxo de “atributos faltantes” onde fizer sentido.
- **Acesso do líder à inscrição do convite:** permitir ao líder visualizar o **QR code** da inscrição do convite, **baixar em PDF** e **enviar para o corredor** (com ou sem email: se tiver email, reenviar convite; se não tiver, líder baixa PDF e envia por outro canal).

---

## 3. Escopo técnico resumido

| Item | Onde | O que fazer |
|------|------|-------------|
| Template “convite sem cadastro” | Backend + migration/seed | Novo template (ex.: `invitation_received_no_account`) com variável `completeRegistrationLink`. |
| Escolher qual template usar | `leaderInvitationsService` | Saber se o runner foi pré-cadastrado (ex.: coluna `runner_preregistered` em `leader_invitations` ou inferir por email temporário). Ao enviar (e ao reenviar), se for “sem cadastro” → template novo com link; senão → `invitation_received`. |
| Garantir email cadastrado | Backend + logs | Garantir que `enrichedInvitation` tem `runner_email` e `runner_name`; log quando não tiver; opcional: teste ou script que simula envio. |
| Token de completar cadastro | Backend | Gerar token (JWT com `invitationId`, `runnerId`, `exp` 7 dias). Incluir URL no template (ex.: `{{completeRegistrationLink}}`). |
| Reenviar email | Backend + Frontend | Endpoint (ex.: `POST /group-leaders/me/invitations/:id/resend-email`). Serviço reutiliza a mesma lógica de template (cadastrado vs sem cadastro) e envia de novo. Front: botão “Reenviar” em convites com status “sent”. |
| Pós-cadastro (senha) | Backend + Frontend | Rota pública (ex.: `/completar-cadastro?token=xxx`). Backend: `GET /api/.../validate-completion-token?token=xxx` (retorna dados mínimos para a tela); `POST /api/auth/set-password-invitation` (body: token + nova senha) → atualiza senha, opcionalmente retorna token de login para já logar. Front: página que valida token, exibe formulário “Definir senha”, envia e depois redireciona. |
| Pós-cadastro (itens da inscrição) | Frontend | Após definir senha (e login), redirecionar para dashboard ou para uma página “Completar inscrição” que mostra o fluxo de atributos faltantes (ex.: modal/componente já usado em “Minhas Inscrições” para variantes de produto). |
| Acesso do líder à inscrição do convite | Backend + Frontend | Líder autenticado pode obter dados da inscrição vinculada ao convite (bonus_registration_id) para exibir QR code e gerar PDF. Endpoint ex.: `GET /group-leaders/me/invitations/:id/registration` retornando os mesmos dados que o corredor vê em “ingresso” (evento, corredor, código, etc.). Front: na lista de convites enviados, botões “Ver ingresso / QR Code”, “Baixar PDF” e “Reenviar email” (este último só se o corredor tiver email válido). PDF pode ser gerado no front (ex.: jsPDF) reutilizando o padrão de `RegistrationQRCode` / comprovante. |

---

## 4. Etapas de implementação sugeridas

### Etapa 1 – Backend: flag “runner pré-cadastrado” e escolha do template

1. **Migration:** adicionar em `leader_invitations` a coluna `runner_preregistered` (boolean, default false). Convites antigos ficam como false.
2. **sendInvitationByCpf:** quando criar o runner com `createRunnerByOrganizer`, após o `UPDATE` em `leader_invitations` que seta `runner_id`, dar um `UPDATE leader_invitations SET runner_preregistered = true WHERE id = $1`.
3. Na parte que envia o email, **escolher o template:**
   - Se `enrichedInvitation.runner_preregistered === true` → usar template `invitation_received_no_account` (ver Etapa 2) e passar variável `completeRegistrationLink`.
   - Senão → usar `invitation_received` como hoje (e, se quiser, incluir um link opcional para “Minhas Inscrições”).
4. **Garantir envio para cadastrados:** manter condição `runner_email && runner_name`; adicionar log quando um dos dois estiver vazio (ex.: “Convite enviado mas email não enviado: runner_email ou runner_name ausente”) para facilitar diagnóstico.

**Entregável:** Convite com runner existente continua enviando `invitation_received`; convite com runner recém-criado marca `runner_preregistered = true` e usa o novo template (após criar o template na Etapa 2).

---

### Etapa 2 – Backend: template e geração do link de completar cadastro

1. **Novo template** `invitation_received_no_account`:
   - **Assunto:** ex.: “Complete seu cadastro – Convite para {{eventTitle}}”.
   - **Corpo (HTML/text):** explicar que o líder enviou um convite; que o cadastro foi iniciado e que é preciso **definir uma senha e completar os dados da inscrição**. Incluir botão/link: **{{completeRegistrationLink}}** (“Completar meu cadastro” ou “Definir senha e acessar”).
   - **Variáveis:** `userName`, `leaderName`, `eventTitle`, `eventDate`, `eventLocation`, `completeRegistrationLink`.
2. **Geração do link:**
   - Usar JWT (ex.: com `jwt.sign`) contendo `{ invitationId, runnerId, exp }` (expiração ex.: 7 dias). Assinar com o mesmo segredo usado em auth (ex.: `JWT_SECRET`).
   - URL: `completeRegistrationLink = ${FRONTEND_URL}/completar-cadastro?token=${encodeURIComponent(jwt)}`.
3. No trecho que envia o email para “sem cadastro”, antes de chamar `sendNotificationSafely`, gerar o JWT e a URL e passar `completeRegistrationLink` nas variáveis do template.

**Entregável:** Template novo criado e usado quando `runner_preregistered === true`; email contém link que leva ao front com token na query.

---

### Etapa 3 – Backend: validar token e “definir senha” por token do convite

1. **GET /api/invitations/complete-registration/validate?token=xxx** (público):
   - Verificar JWT (assinatura e expiração).
   - Payload: `invitationId`, `runnerId`.
   - Verificar se o convite existe, pertence ao runner e está em status “sent”.
   - Retornar dados mínimos para a tela: ex. `{ valid: true, runnerName, eventTitle }` ou `{ valid: false, error }`.
2. **POST /api/auth/set-password-invitation** (público, body: `{ token, newPassword }`):
   - Validar JWT e relação convite/runner.
   - Atualizar `users.password_hash` do runner com hash da nova senha.
   - Opcional: invalidar tokens antigos de “completar cadastro” (se no futuro houver tabela de tokens; com JWT stateless basta não reutilizar o mesmo token para outra coisa).
   - Retornar token de login (JWT de sessão) para o front já autenticar o usuário e redirecionar para a área logada (ex.: “Minhas Inscrições” ou “Completar inscrição”).

**Entregável:** Front pode validar o token e depois enviar a nova senha e receber o token de login.

---

### Etapa 4 – Backend: reenviar email do convite

1. **POST /group-leaders/me/invitations/:id/resend-email** (autenticado, apenas líder):
   - Validar que o convite existe, pertence ao líder e está com status “sent” (só reenviar quando já foi enviado).
   - Buscar dados enriquecidos do convite (evento, líder, runner, `runner_preregistered`).
   - Se `runner_preregistered` → gerar novo JWT/link e enviar template `invitation_received_no_account` com `completeRegistrationLink`.
   - Senão → enviar template `invitation_received` (mesmas variáveis atuais).
   - Resposta: ex. `{ success: true, message: 'Email reenviado' }`.
2. Reutilizar a mesma lógica de formatação (eventDate, eventLocation, leaderName) que já existe no envio inicial.

**Entregável:** Líder pode reenviar o email do convite; backend escolhe o template certo e, no caso “sem cadastro”, gera novo link.

---

### Etapa 5 – Frontend: página “Completar cadastro” (token → senha → redirecionamento)

1. **Rota:** ex. `/completar-cadastro` com leitura de `?token=xxx`.
2. **Fluxo:**
   - Ao montar a página, chamar `GET /api/invitations/complete-registration/validate?token=xxx`.
   - Se `valid: false` → exibir mensagem de link inválido ou expirado e opção de ir para login/home.
   - Se `valid: true` → exibir formulário “Definir sua senha” (senha + confirmação, regras de senha forte se houver).
   - Ao submeter: `POST /api/auth/set-password-invitation` com `{ token, newPassword }`. Em caso de sucesso, guardar o token de login retornado (ex.: localStorage), atualizar contexto de auth e redirecionar.
3. **Redirecionamento após sucesso:** para `/corredor/minhas-inscricoes` ou para uma rota dedicada “Completar inscrição” (Etapa 6). Se já existir lógica de “atributos faltantes” no dashboard, o redirecionamento para o dashboard pode ser suficiente e o usuário vê o aviso de completar variantes.

**Entregável:** Usuário que clica no link do email consegue definir a senha e ser logado.

---

### Etapa 6 – Frontend: completar itens da inscrição (variantes etc.) após pós-cadastro

1. **Opção A (reutilizar fluxo existente):** Após login (Etapa 5), redirecionar para `/corredor/inicio` ou `/corredor/minhas-inscricoes`. O componente que já exibe “inscrições com atributos pendentes” (ex.: `MissingAttributesModal` / alerta) continua sendo exibido; o corredor abre e preenche variantes de produto.
2. **Opção B (fluxo guiado):** Após login, redirecionar para uma página ex.: `/corredor/completar-inscricao` que carrega inscrições com atributos faltantes e exibe o mesmo conteúdo do modal de “atributos faltantes” em tela cheia, com CTA “Concluir” que leva para “Minhas Inscrições”.
3. Garantir que a API de “missing attributes” e `completeRegistrationAttributes` considerem inscrições com `payment_status = 'convidado'` (já feito em outro plano). Nada extra no backend se já estiver coberto.

**Entregável:** Corredor que veio do link do convite, após definir senha, consegue completar variantes (e outros itens faltantes) da inscrição.

---

### Etapa 7 – Frontend: botão “Reenviar” no convite enviado

1. Na lista/card de **convites enviados** (status “sent”) no painel do líder, adicionar botão **“Reenviar email”** (ou ícone de “enviar novamente”).
2. Ao clicar: chamar `POST /group-leaders/me/invitations/:id/resend-email`. Em sucesso: toast “Email reenviado com sucesso”. Em erro: toast com mensagem do backend.
3. Desabilitar o botão enquanto a requisição estiver em andamento (evitar múltiplos cliques).

**Entregável:** Líder consegue reenviar o email do convite com um clique.

---

### Etapa 8 – Verificação do email para cadastrados e ajustes finais

1. **Verificação:** Em ambiente de teste/staging, enviar convite para um CPF **já cadastrado** e confirmar recebimento do email com template `invitation_received` e que o conteúdo está correto (nome, evento, líder, data, local).
2. **Logs:** Confirmar que, quando `runner_email` ou `runner_name` estiverem vazios, há log claro para suporte.
3. **Templates no admin:** Se existir tela de edição de templates, garantir que `invitation_received` e `invitation_received_no_account` estejam listados e editáveis (assunto/corpo), mantendo as variáveis necessárias.
4. **Documentação:** Atualizar `docs/PLANO_INTEGRACAO_NOTIFICACOES.md` (ou equivalente) com o novo template e os endpoints de validate-token e set-password-invitation.

**Entregável:** Certeza de que o email para cadastrados funciona; logs e docs alinhados.

**Implementação Etapa 8 (concluída):**
- **Logs:** Em `leaderInvitationsService.sendInvitationByCpf`, quando `runner_email` ou `runner_name` estão vazios, é registrado `console.warn('⚠️ [sendInvitationByCpf] Convite enviado mas email não enviado: runner_email ou runner_name ausente', { invitationId, runner_id, has_email, has_name })`.
- **Templates no admin:** Os templates `invitation_received` e `invitation_received_no_account` fazem parte do seed em `notificationTemplatesService.initializeDefaultTemplates()`. Após rodar a inicialização (ou deploy), aparecem na listagem GET `/api/notification-templates` e podem ser editados pelo admin (assunto/corpo), mantendo as variáveis necessárias.
- **Documentação:** O arquivo `docs/PLANO_INTEGRACAO_NOTIFICACOES.md` foi atualizado com: (1) convite do líder em dois templates e log de email ausente; (2) seção 3.6 com endpoints GET validate e POST set-password-invitation; (3) template `invitation_received_no_account` na lista e na tabela de variáveis; (4) resumo de destinatários.

**Checklist de verificação (manual):**
- [ ] Em staging/teste: enviar convite para CPF já cadastrado e confirmar recebimento do email com template `invitation_received` (nome, evento, líder, data, local corretos).
- [ ] Em staging: enviar convite para CPF não cadastrado (pré-cadastro) e confirmar email `invitation_received_no_account` com link de completar cadastro.
- [ ] Verificar nos logs do backend que, quando runner não tem email/nome, o aviso acima aparece.
- [ ] No admin, abrir listagem de templates e confirmar que `invitation_received` e `invitation_received_no_account` estão presentes e editáveis.

---

### Etapa 9 – Líder: visualizar QR code, baixar PDF e enviar ingresso ao corredor

1. **Backend – acesso do líder à inscrição do convite**
   - **GET /group-leaders/me/invitations/:id/registration** (autenticado, apenas líder dono do convite):
     - Validar que o convite existe, pertence ao líder e está com status “sent” (convite já enviado).
     - Obter `bonus_registration_id` do convite e carregar a inscrição com os mesmos dados usados na tela de ingresso do corredor (evento, data, local, nome do corredor, código de confirmação, categoria, kit, produtos/variações, etc.). Garantir que apenas inscrições de convites do próprio líder sejam acessíveis.
     - Retornar payload no mesmo formato (ou compatível) com o que o front usa em `RegistrationQRCode` / `getRegistrationById`, para reutilizar a exibição do QR e a geração do PDF no front.
   - Se já existir **GET /registrations/:id** usado pelo corredor, pode-se criar um endpoint específico para o líder (ex.: acima) que internamente reutiliza a mesma lógica de montagem dos dados da inscrição, garantindo autorização “só se for bonus_registration de um convite do líder”.

2. **Frontend – convites enviados: Ver ingresso, Baixar PDF, Reenviar**
   - Na lista/card de **convites enviados** (status “sent”), para cada convite:
     - **“Ver ingresso” / “QR Code”:** abre modal ou navega para uma tela que chama `GET /group-leaders/me/invitations/:id/registration` e exibe os dados da inscrição + **QR code** (código de confirmação ou o mesmo critério usado em `RegistrationQRCode`). Reutilizar componente de QR e layout da página de ingresso quando possível.
     - **“Baixar PDF”:** na mesma tela/modal ou a partir da lista, gerar e baixar o PDF do ingresso (comprovante) com os dados da inscrição e QR code, usando a mesma abordagem de `RegistrationQRCode` (handleDownloadReceipt) ou do comprovante em `RegistrationFlow` (jsPDF). O líder pode então enviar o arquivo ao corredor por WhatsApp, email, etc.
     - **“Reenviar email”:** já previsto na Etapa 7. Exibir apenas quando o corredor tiver **email válido** (não temporário); caso contrário, desabilitar ou ocultar e deixar apenas “Ver ingresso” e “Baixar PDF” para o líder enviar manualmente.
   - Texto de ajuda: quando o corredor não tem email, informar que o líder pode baixar o PDF e enviar por outro meio.

3. **Regra “corredor sem email”**
   - Considerar email “válido” quando não for do tipo `@temp.cronoteam` (ou quando o líder informou email no pré-cadastro). Assim, “Reenviar email” só aparece ou só é enviado quando fizer sentido; para os demais, o fluxo é “Ver ingresso” + “Baixar PDF” para o líder repassar ao corredor.

**Entregável:** Líder consegue, para cada convite enviado, visualizar o QR code da inscrição, baixar o ingresso em PDF e enviar ao corredor (por email, se houver, ou manualmente). Corredor sem email continua sendo atendido pelo líder via download e envio do PDF.

---

## 5. Ordem sugerida

| Ordem | Etapa | Dependências |
|-------|--------|--------------|
| 1 | Backend: flag `runner_preregistered` e escolha do template | - |
| 2 | Backend: template `invitation_received_no_account` e geração do link (JWT) | Etapa 1 |
| 3 | Backend: validar token + endpoint “definir senha” por token | Etapa 2 |
| 4 | Backend: reenviar email do convite | Etapas 1 e 2 |
| 5 | Frontend: página Completar cadastro (token → senha → login) | Etapa 3 |
| 6 | Frontend: completar itens da inscrição (variantes) | Etapa 5 + fluxo existente |
| 7 | Frontend: botão Reenviar no convite enviado | Etapa 4 |
| 8 | Verificação email cadastrados + logs + docs | Etapas 1–7 |
| 9 | Líder: visualizar QR code, baixar PDF e enviar ingresso ao corredor | Backend: endpoint da inscrição do convite; Front: convites enviados |

---

## 6. Resumo

- **Dois templates:** `invitation_received` (já cadastrado) e `invitation_received_no_account` (pré-cadastro), com link `completeRegistrationLink` (JWT na URL).
- **Backend:** coluna `runner_preregistered`; escolha do template no envio e no reenviar; endpoints de validar token e definir senha; endpoint de reenviar email; **GET /group-leaders/me/invitations/:id/registration** para o líder acessar dados da inscrição do convite (QR/PDF).
- **Frontend:** página `/completar-cadastro?token=xxx` (validar token → definir senha → login → redirecionar); uso do fluxo existente de “atributos faltantes” para variantes; botão “Reenviar” em convites enviados; **na lista de convites enviados:** “Ver ingresso / QR Code”, “Baixar PDF” e “Reenviar email” (este último apenas quando o corredor tiver email válido).
- **Corredor sem email:** o líder tem acesso à inscrição do convite para visualizar o QR code, baixar o ingresso em PDF e enviar ao corredor por outro canal (WhatsApp, impressão, etc.). O botão “Reenviar email” fica oculto ou desabilitado quando não houver email válido.
- **Garantia:** verificação de que o email para cadastrados está sendo enviado e logs quando faltar email/nome.

Com isso, convites para cadastrados e para “sem cadastro” ficam cobertos, com reenvio e pós-cadastro (senha + itens da inscrição) implementados de forma alinhada ao resto do sistema, e o líder pode sempre acessar o ingresso (QR/PDF) para repassar ao corredor, com ou sem email.
