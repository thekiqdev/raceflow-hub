  # Plano de implantação — Autenticação e cadastro com CPF + integração CPF Brasil

  **Versão:** 2.0 (planejamento; fases 1–6 com entregas de código referenciadas na seção G)  
  **Data de referência:** 2026-03-27  
  **Escopo:** Evolução incremental e segura de login, cadastro e integração com API externa de consulta de CPF.

  ### Resumo das alterações em relação à v1.0

  | Tema | v1.0 | v2.0 (decisões fechadas) |
  |------|------|---------------------------|
  | Momento da consulta | Debounce + botão opcional; fallback manual possível | **Automático** conforme digitação (com controles técnicos) **+** busca manual explícita; **sem** fallback manual |
  | Campos auto preenchidos | Leitura com opção “Corrigir” / edição | **Somente leitura** (nome, sexo, data de nascimento) — **não editáveis** |
  | Falha da API / consulta | Fallback manual recomendado para não bloquear negócio | **Bloqueio total** do cadastro; mensagem ao usuário: **“CPF inválido”**; não avança |
  | Quota API | Preocupação com cota | Plano com **consultas ilimitadas** (ainda assim: debounce + proteções técnicas) |
  | Mensagens de erro | Variadas conforme tipo | **Usuário:** “CPF inválido” unificada; **logs:** detalhamento interno |
  | Endpoint interno | Recomendado | **Obrigatório** — `X-API-Key` apenas no backend |

  ---

  ## A. Estado atual do sistema

  *(Inalterado em relação à v1.0 — referência para a implementação.)*

  ### A.1 Visão geral

  O sistema usa **autenticação stateless com JWT** armazenada no **frontend** (`localStorage`: `auth_token`, `auth_user`). O backend valida o token no header `Authorization: Bearer <token>`.

  ### A.2 Login

  | Aspecto | Comportamento atual |
  |--------|---------------------|
  | **Endpoint** | `POST /api/auth/login` |
  | **Identificador** | **Somente e-mail** (`email` + `password`) |
  | **Senha** | Comparada com `users.password_hash` (bcrypt) |
  | **Resposta** | Objeto `user` (id, email, profile resumido, roles) + `token` JWT |
  | **JWT** | Assinado com `JWT_SECRET`; payload inclui `userId` e `email`; expiração via `JWT_EXPIRES_IN` (ex.: `7d`) |

  **Arquivos principais**

  - `backend/src/controllers/authController.ts` — `loginUser`
  - `backend/src/services/authService.ts` — `login`, `generateToken`, `comparePassword`
  - `backend/src/routes/auth.ts` — rota `POST /login`
  - `backend/src/middleware/auth.ts` — `authenticate`: lê Bearer, verifica JWT, carrega `users` por id

  **Frontend**

  - `src/pages/Auth.tsx` — aba “Entrar”: campos e-mail e senha
  - `src/components/LoginDialog.tsx` — mesmo padrão
  - `src/contexts/AuthContext.tsx` — chama API, persiste token/usuário
  - `src/lib/api/auth.ts` — `login({ email, password })`
  - `src/lib/api/client.ts` — anexa token do `localStorage`

  **Observação:** Não existe login por **telefone** nem por **CPF** na rota pública de autenticação atual.

  ### A.3 Cadastro (registro de conta)

  | Aspecto | Comportamento atual |
  |--------|---------------------|
  | **Endpoint** | `POST /api/auth/register` |
  | **Campos obrigatórios (controller)** | `email`, `password`, `full_name`, `cpf`, `phone`, `birth_date`, `lgpd_consent` |
  | **Validação de unicidade** | E-mail em `users.email`; CPF em `profiles.cpf` (erros: “Email already registered”, “CPF already registered”) |
  | **Persistência** | `users` + `profiles` (1:1 por `profiles.id = users.id`) + `user_roles` (`runner`) |

  **Arquivos principais**

  - `backend/src/controllers/authController.ts` — `registerUser`
  - `backend/src/services/authService.ts` — `register`, `RegisterData`
  - `backend/src/routes/auth.ts` — `POST /register`

  **Frontend — ordem atual dos campos (aba “Criar Conta”)**

  - Em `src/pages/Auth.tsx`, a ordem é: **Nome completo** → depois **CPF e telefone** (mesma linha) → data de nascimento e gênero → e-mail e senha.  
  - **Não** está alinhado à regra desejada “CPF primeiro”; a implementação seguirá a **especificação da seção D.2 (v2)**.

  Outros fluxos que criam usuário/atleta (contexto, não substituem o cadastro público):

  - `createRunnerByOrganizer` em `backend/src/services/registrationsService.ts` — CPF obrigatório, e-mail real ou temporário `@temp.cronoteam`
  - Convites / completar cadastro: `POST /api/auth/set-password-invitation` com JWT de convite (`authService.setPasswordByInvitationToken`)

  ### A.4 Identificadores no modelo de dados

  | Identificador | Onde | Uso atual |
  |---------------|------|-----------|
  | **E-mail** | `users.email` UNIQUE NOT NULL | Login, recuperação de senha, comunicação |
  | **CPF** | `profiles.cpf` TEXT UNIQUE NOT NULL | Cadastro, busca de atleta (`findUserByCpf`), transferências, inscrição por organizador |
  | **Telefone** | `profiles.phone` NOT NULL no schema base | Cadastro; não usado para login |

  **Índice:** `idx_profiles_cpf` em `profiles(cpf)` (migração inicial).

  ### A.5 Recuperação de senha

  - `POST /api/auth/password-reset/request` — corpo com **e-mail**; resposta genérica para não enumerar contas (`passwordResetController.ts`)
  - Reset por token: e-mail continua sendo o elo com o usuário

  ### A.6 Sessão

  - Não há sessão server-side nem cookies httpOnly para o app principal; **JWT no cliente** + validação em cada request autenticado.

  ---

  ## B. Leitura da documentação CPF Brasil (fornecida)

  ### B.1 O que a integração permite (contrato assumido)

  | Item | Detalhe |
  |------|---------|
  | **Consulta** | `GET /cpf/{cpf}` — dados associados ao CPF |
  | **Health** | `GET /health` — disponibilidade / status |
  | **Autenticação** | Header `X-API-Key` |
  | **Campos úteis ao cadastro** | `CPF`, `NOME`, `SEXO`, `NASC`, `NOME_MAE` (sensível; uso futuro / auditoria conforme LGPD) |

  ### B.2 Fluxo obrigatório na aplicação (v2)

  1. **Somente o backend** chama a CPF Brasil; a chave **`X-API-Key` não pode ser enviada ao browser.**
  2. O frontend chama **exclusivamente** um **endpoint interno** (ex.: `POST /api/auth/lookup-cpf` ou `GET /api/auth/cpf-prefill/:digits`) que:
    - valida formato e dígitos verificadores **no servidor** (redundância à validação do cliente);
    - invoca o cliente HTTP da CPF Brasil;
    - devolve ao front apenas o necessário para preencher os campos bloqueados (e um identificador de sucesso).
  3. O `register` final deve **rejeitar** criação de conta se nome/data/sexo não tiverem origem validada nessa estratégia (detalhe de implementação: token de sessão de pré-cadastro, hash dos dados, ou revalidação server-side antes do `INSERT` — a definir na implementação, mantendo a política de **sem consulta válida = sem cadastro**).

  ### B.3 Credenciais e variáveis de ambiente

  - `CPF_BRASIL_API_BASE_URL`
  - `CPF_BRASIL_API_KEY` (servidor apenas)
  - `CPF_BRASIL_TIMEOUT_MS` (recomendado)
  - Opcional: feature flag `CPF_BRASIL_ENABLED` para rollout

  **Nota de produto:** o plano contratual prevê **consultas ilimitadas**; isso **não** elimina a necessidade de **debounce**, **cancelamento de requisições** e **rate limit defensivo** no backend (abuso, loops, scraping).

  ### B.4 Integração — tratamento de erros (política v2)

  **Mensagem ao usuário (cadastro / lookup):**

  - Em **qualquer** falha que impeça obter dados válidos da API para o CPF informado (incluindo: formato inválido **após** validação no servidor, CPF não encontrado na base externa, erro de credencial, plano/serviço, quota interna bloqueada, timeout, 5xx, rede), a UI deve exibir **uma única mensagem orientativa acordada:** **“CPF inválido”** (ou cópia final aprovada pelo produto, mas **sem** distinguir o motivo para o usuário final).

  **Diferenciação interna (obrigatória para operação e suporte):**

  | Camada | O que registrar |
  |--------|-----------------|
  | **Validação local (cliente)** | CPF incompleto ou dígitos inválidos **antes** de chamar o backend: pode mostrar “CPF inválido” **sem** request; opcionalmente texto mais específico **somente** para formato (“Informe 11 dígitos”) — decisão de copy na implementação, desde que não viole a regra de não expor estado da API. |
  | **Backend — resposta HTTP do lookup** | Corpo JSON com `code` interno **não exposto ao usuário** (ex.: `LOCAL_INVALID_FORMAT`, `EXTERNAL_NOT_FOUND`, `EXTERNAL_TIMEOUT`, `EXTERNAL_QUOTA`, `EXTERNAL_AUTH`, `EXTERNAL_UNKNOWN`). |
  | **Logs / observabilidade** | Log estruturado com: `request_id`, código interno, **CPF mascarado** (ex.: `***.***.***-**`), latência, código HTTP da API externa (se aplicável). **Nunca** logar `X-API-Key` nem payload completo de dados pessoais em log de aplicação padrão. |

  **Política de bloqueio:**

  - Se a consulta falhar ou não retornar conjunto válido para preencher nome + data + sexo: **não permitir avançar** no cadastro (botões desabilitados ou passo seguinte inacessível).

  **Sem fallback manual** nesta estratégia: não haverá preenchimento manual de nome/data/sexo quando a API não validar o fluxo.

  ### B.5 Riscos externos (atualizado)

  - **Indisponibilidade da API:** com a política v2, **cadastro de novos usuários fica bloqueado** até a API voltar ou até mudança futura de produto — risco operacional explícito.
  - **Latência:** mitigar com loading, debounce e cancelamento de requests obsoletos.
  - **Qualidade dos dados:** campos bloqueados refletem a fonte; sem edição pelo usuário.
  - **LGPD:** finalidade da consulta e transparência na política de privacidade; minimizar logs.

  ---

  ## C. Decisões técnicas recomendadas (v2 — fechadas)

  ### C.1 CPF como primeiro campo no cadastro

  - Primeiro campo (ou primeiro passo) = **CPF** (máscara + validação de dígitos no cliente; **revalidação obrigatória no servidor** no lookup e no register).

  ### C.2 Consulta automática + busca manual (obrigatório combinar os dois)

  - **Automática:** enquanto o usuário digita, após **11 dígitos** e CPF válido (algoritmo), dispara-se a consulta ao endpoint interno com **debounce** (ver C.6).
  - **Manual:** botão do tipo **“Buscar dados”** / **“Consultar CPF”** que repete a mesma ação do backend para o CPF atual (útil se o usuário colou o número, se a automática falhou por rede transitória, ou para evitar ambiguidade de timing).
  - Ambos os fluxos chamam **o mesmo endpoint interno** e aplicam as mesmas regras de erro e bloqueio.

  ### C.3 Campos preenchidos automaticamente — não editáveis

  Após **consulta bem-sucedida** ao endpoint interno:

  | Campo | Comportamento |
  |-------|----------------|
  | **Nome completo** | Preenchido e **somente leitura** (disabled ou read-only visual consistente) |
  | **Sexo** | Idem |
  | **Data de nascimento** | Idem |

  **Sem** ação “Editar” / “Corrigir” nesta estratégia. Demais campos do cadastro (e-mail, telefone, senha, LGPD, etc.) seguem editáveis conforme o layout atual, **desde que** o pré-requisito de lookup válido esteja satisfeito.

  ### C.4 Falha da consulta — bloqueio do cadastro

  - Qualquer falha que não resulte em dados válidos para os três campos acima ⇒ exibir **“CPF inválido”** (conforme B.4) e **impedir** continuação (submit desabilitado, ou não renderizar etapas seguintes).

  ### C.5 Endpoint interno de lookup (padrão obrigatório)

  - Implementação **somente** via rota backend dedicada; frontend **não** contém `X-API-Key`.
  - Proteções mínimas: rate limit por IP (e opcionalmente por fingerprint de sessão), timeout curto na chamada externa, logs internos ricos.

  ### C.6 Controle técnico de chamadas (obrigatório mesmo com consultas ilimitadas)

  | Mecanismo | Finalidade |
  |-----------|------------|
  | **Debounce** (ex.: 300–500 ms após última tecla quando já há 11 dígitos) | Reduzir disparos enquanto o usuário digita ou cola |
  | **Cancelamento** (`AbortController` ou equivalente) | Ao iniciar nova consulta para o mesmo campo, **abortar** a requisição HTTP anterior no cliente |
  | **Evitar corrida de respostas** | Ignorar respostas cujo `cpf` normalizado não seja igual ao CPF **atual** do campo; preferir correlacionar com um `requestId` ou contador monotônico |
  | **Evitar múltiplas chamadas simultâneas** | Flag `lookupInFlight` no componente: não iniciar segunda chamada até finalizar a primeira, **ou** cancelar explicitamente a anterior |
  | **Rate limit no backend** | Limite defensivo (ex.: por IP/minuto) para prevenir abuso; independente do plano “ilimitado” do provedor |
  | **Logs internos** | Erros reais da API (código/categoria) apenas em logs estruturados, nunca na mensagem única ao usuário |

  ### C.7 Login com CPF (escopo mantido; não alterado na v2 de produto)

  - CPF como **identificador alternativo ao e-mail** na mesma tela, com detecção no backend (11 dígitos ⇒ busca por `profiles.cpf`).
  - Telefone fora do escopo inicial de login.

  ### C.8 Persistência e metadados

  - Persistir `full_name`, `birth_date`, `gender` em `profiles` a partir da resposta validada.
  - Colunas aditivas opcionais: `cpf_validated_at`, `cpf_lookup_source = 'cpf_brasil'` — recomendado para auditoria; **não** usar `manual_fallback` nesta estratégia.

  ### C.9 Compatibilidade

  - Mudanças **aditivas**; login por e-mail mantido; recuperação de senha por e-mail mantida.

  ---

  ## D. Impacto técnico

  ### D.1 Backend

  | Área | Impacto |
  |------|---------|
  | **Cliente HTTP CPF Brasil** | Timeout, headers, parsing, mapeamento para códigos internos |
  | **Endpoint interno de lookup** | **Obrigatório**; rate limit; validação server-side de CPF |
  | **`register`** | Só aceitar nome/data/sexo alinhados a uma consulta válida (mecanismo na implementação) |
  | **`authService.login`** | CPF ou e-mail (fase própria) |
  | **Logs** | Mascarar CPF; nunca logar API key |

  **Arquivos previstos:** `authController.ts`, `authService.ts`, `routes/auth.ts`; **novo** `services/cpfBrasilClient.ts`; **novo** controller/rota de lookup.

  ### D.2 Frontend e UX — especificação (decisões aprovadas v2)

  | Requisito | Detalhe |
  |-----------|---------|
  | **Ordem** | CPF como **primeiro** campo do fluxo de cadastro |
  | **Busca automática** | Ao atingir CPF válido (11 dígitos + dígitos verificadores), com **debounce** e controles da seção C.6 |
  | **Busca manual** | Botão explícito que dispara a mesma operação do endpoint interno |
  | **Loading** | Estado visível durante a consulta; **não** permitir submit enquanto pendente |
  | **Concorrência** | Uma consulta relevante por vez; cancelar ou ignorar respostas obsoletas |
  | **Sucesso** | Preencher nome, sexo, data de nascimento; campos **bloqueados** para edição |
  | **Falha** | Mensagem **“CPF inválido”**; **não** avançar / **não** permitir concluir cadastro |
  | **Demais campos** | E-mail, senha, telefone, LGPD, etc., após pré-condição de sucesso no lookup |

  ### D.3 Banco de dados

  | Mudança | Observação |
  |---------|------------|
  | **`profiles.cpf`** | UNIQUE; normalizar 11 dígitos na aplicação |
  | **Colunas aditivas** | `cpf_validated_at`, `cpf_lookup_source` (recomendado) |
  | **Índice** | `idx_profiles_cpf` existente |

  ### D.4 Autenticação

  - JWT: manter payload mínimo (`userId`, `email`) salvo necessidade revisada.

  ### D.5 Segurança

  - Chave só no servidor; mensagem única ao usuário no lookup; logs internos detalhados; rate limit defensivo.

  ---

  ## E. Plano de implantação (fases incrementais — v2)

  A ordem **1 → 2 → 3 → 4 → 5 → 6** deve ser respeitada. Abaixo está **onde cada decisão de produto entra**.

  ### Fase 1 — Preparação de banco e políticas

  | Item | Detalhe |
  |------|---------|
  | **Objetivo** | Migração aditiva (metadata opcional); revisão de dados legados de CPF |
  | **Entrega desta fase** | Schema pronto para registrar origem/timestamp da validação |
  | **Lookup automático / bloqueio UX** | **Fora** desta fase |

  **Implementado (código):** migração `107_profiles_cpf_lookup_metadata.sql` — colunas `profiles.cpf_validated_at`, `profiles.cpf_lookup_source` (NULL para existentes); registro em `run-migrations.ts`; tipo `Profile` em `backend/src/types/index.ts` com campos opcionais. Política LGPD/documentação operacional permanece revisão manual da equipe.

  ### Fase 2 — Cliente CPF Brasil + endpoint interno de lookup (**obrigatório antes do front**)

  | Item | Detalhe |
  |------|---------|
  | **Objetivo** | Serviço HTTP + rota **somente backend** + rate limit + logs internos + mapeamento de erros para códigos internos |
  | **Entrega desta fase** | **Endpoint interno de lookup** utilizável pelo front; **X-API-Key** só no servidor |
  | **Bloqueio de cadastro sem sucesso** | Contrato da API de lookup definido (`success` / códigos internos); implementação completa do bloqueio no register pode amarrar na Fase 3 |
  | **Validação** | Testes manuais e testes automatizados com mocks da API externa |

  **Implementado (código):** `backend/src/services/cpfBrasilClient.ts` (GET `{base}/cpf/{cpf}`, `GET {base}/health`, header `X-API-Key` só no servidor); `backend/src/services/cpfLookupService.ts` (validação local de CPF + mapeamento NOME/NASC/SEXO); `backend/src/utils/cpf.ts` (normalizar, dígitos verificadores, máscara para logs); `backend/src/controllers/cpfLookupController.ts`; `POST /api/auth/lookup-cpf` + `GET /api/auth/cpf-brasil-health`; `cpfLookupRateLimiter` em `backend/src/middleware/rateLimiter.ts` (sempre ativo; env `CPF_LOOKUP_MAX_PER_IP`, `CPF_LOOKUP_WINDOW_MS`). Variáveis: `CPF_BRASIL_API_BASE_URL`, `CPF_BRASIL_API_KEY`, `CPF_BRASIL_TIMEOUT_MS`, `CPF_BRASIL_ENABLED`. Resposta de falha ao cliente: mensagem **CPF inválido** + `code` interno em `meta`. **Fase 3** consumirá `lookup-cpf` na UI e amarrará bloqueio no `register`.

  ### Fase 3 — Cadastro: CPF primeiro + automação + manual + campos bloqueados + bloqueio de progressão

  | Item | Detalhe |
  |------|---------|
  | **Objetivo** | `Auth.tsx` (e equivalentes): primeiro campo CPF; **busca automática** com debounce/cancelamento; **botão de busca manual**; loading; **nome, sexo, nascimento somente leitura** após sucesso; **submit bloqueado** sem lookup válido; mensagem **“CPF inválido”** nas falhas |
  | **Entrega desta fase** | **Automação na digitação**; **busca manual**; **bloqueio de edição** dos três campos; **bloqueio de avanço** sem retorno válido |
  | **Dependência** | Fase 2 concluída |
  | **Validação** | E2E: sucesso; falha de API; timeout; CPF formato inválido |

  **Implementado (código):** prova JWT no backend (`cpfLookupProof.ts`); `register` valida `cpf_lookup_proof` quando a integração CPF Brasil está habilitada; `authController` responde com mensagem **CPF inválido** nos erros de prova. Frontend: `Auth.tsx`, hook `useCpfBrasilLookup`, `MultiStepRegistration.tsx`, fluxo **Criar conta** em `RegistrationFlow.tsx`, tipos e cliente em `src/lib/api/auth.ts` / `client.ts`.

  ### Fase 4 — Login com CPF

  | Item | Detalhe |
  |------|---------|
  | **Objetivo** | Login com e-mail **ou** CPF + senha |
  | **Dependência** | Cadastro já populando CPF de forma consistente (Fase 3) |

  **Implementado (código):** `POST /auth/login` aceita no campo `email` um e-mail **ou** um CPF (11 dígitos válidos; comparação com `profiles.cpf` normalizado). Se o valor contém `@`, trata-se sempre como e-mail; caso contrário, se passar na validação de CPF, busca por CPF; senão, busca por e-mail. Mensagem de falha genérica inalterada (`Invalid email or password`). Front: `Auth.tsx`, `LoginDialog.tsx`, `RegistrationFlow.tsx` (campo “E-mail ou CPF” + `maskEmailOrCpf`); `AuthContext` envia o identificador com `trim()`.

  ### Fase 5 — Compatibilidade e usuários existentes

  | Item | Detalhe |
  |------|---------|
  | **Objetivo** | Comunicação, suporte, checagem de contas legadas |

  **Implementado (código):** relatório `GET /api/admin/reports/cpf-validation-overview` (`getCpfValidationOverview` em `reportsService.ts`); cartão no dashboard admin com totais de perfis sem validação na fonte oficial, percentual e subtotais; documentação operacional em `docs/FASE5_COMPATIBILIDADE_CONTAS_LEGADAS.md`.

  ### Fase 6 — Rollout gradual e monitoramento

  | Item | Detalhe |
  |------|---------|
  | **Objetivo** | Feature flag, alertas em erros de integração, dashboard de taxa de falha do lookup |

  **Implementado (código):** migração `108_cpf_lookup_metrics_daily.sql`; `recordCpfLookupOutcome` em `lookupCpfController`; `GET /auth/cpf-registration-config` (flags públicas); `GET /admin/reports/cpf-lookup-metrics`; webhook opcional `CPF_BRASIL_FAILURE_WEBHOOK_URL`; logs `[cpf-lookup][integration]` em nível error; `isCpfBrasilFeatureEnabled` / `isCpfBrasilIntegrationConfigured` exportados; cartão no dashboard admin; `getCpfRegistrationConfig` no cliente; documentação `docs/FASE6_ROLLOUT_MONITORAMENTO.md`.

  **Resumo — em qual fase entra cada decisão:**

  | Decisão | Fase |
  |--------|------|
  | Endpoint interno de lookup | **2** |
  | Automação da busca durante digitação + debounce/cancelamento | **3** |
  | Botão de busca manual | **3** |
  | Campos nome/sexo/nascimento não editáveis | **3** |
  | Bloqueio de progressão / cadastro sem consulta válida | **3** (com contrato da API na **2**) |
  | Login com CPF | **4** |
  | Compatibilidade / métricas contas legadas | **5** |
  | Rollout / métricas lookup / flags públicas | **6** |

  ---

  ## F. Riscos e pontos de atenção (v2)

  | Categoria | Risco | Mitigação |
  |-----------|-------|-----------|
  | **Produto** | API fora ⇒ **ninguém novo se cadastra** | Comunicação, página de status, acordo comercial com provedor; runbook |
  | **Segurança** | Enumeração no login | Mensagem genérica para credenciais inválidas (inalterado) |
  | **Abuso** | Flood no endpoint de lookup | Rate limit backend + debounce no cliente |
  | **LGPD** | Finalidade da consulta | Transparência na política de privacidade |
  | **Dados** | Dependência total da fonte externa para nome/data/sexo | Consciente na v2; sem edição pelo usuário |

  ---

  ## G. Próximo passo — arquivos previstos para alteração (implementação futura)

  ### Já entregues (Fases 1–6)

  - **Fase 1:** migração `107_profiles_cpf_lookup_metadata.sql`; `Profile` com metadados opcionais.
  - **Fase 2:** `cpfBrasilClient.ts`, `cpfLookupService.ts`, `cpfLookupController.ts`, `utils/cpf.ts`, rotas em `routes/auth.ts`, `cpfLookupRateLimiter` em `middleware/rateLimiter.ts`.
  - **Fase 3:** `cpfLookupProof.ts`; `authService.ts` (`register` + `cpf_validated_at` / `cpf_lookup_source`); `authController.ts`; UI em `Auth.tsx`, `useCpfBrasilLookup`, `MultiStepRegistration.tsx`, `RegistrationFlow.tsx` (cadastro no evento).
  - **Fase 4:** `authService.login` (e-mail ou CPF); `Auth.tsx`, `LoginDialog.tsx`, `RegistrationFlow.tsx`, `masks.ts` (`maskEmailOrCpf`), `AuthContext`.
  - **Fase 5:** `reportsService.getCpfValidationOverview`, rota admin `reports/cpf-validation-overview`, `DashboardOverview.tsx`, `docs/FASE5_COMPATIBILIDADE_CONTAS_LEGADAS.md`.
  - **Fase 6:** migração `108_cpf_lookup_metrics_daily.sql`, `cpfLookupMetricsService.ts`, `cpfLookupAlerts.ts`, rotas `cpf-registration-config` e `reports/cpf-lookup-metrics`, cartão de métricas no admin, `docs/FASE6_ROLLOUT_MONITORAMENTO.md`.

  ### Pendentes — operacional

  - `backend/.env` / documentação de envs no deploy (`CPF_BRASIL_*`, `CPF_LOOKUP_*`, opcional `CPF_BRASIL_FAILURE_WEBHOOK_URL`)

  ---

  ## H. Ambiguidades restantes (fornecedor / implementação)

  1. URL base exata e versão da API.
  2. Formato exato de `SEXO` e `NASC` para mapeamento ao schema local.
  3. Sandbox e CPFs de teste.
  4. Política de retry HTTP no cliente backend (número de tentativas para 5xx).
  5. Texto legal exibido ao usuário no momento da consulta (além de “CPF inválido” em falha).

  ---

  ## I. Changelog documental (v1.0 → v2.0)

  1. **Removido** fallback manual de nome/data/sexo quando a API falha; **introduzido** bloqueio total do cadastro com mensagem **“CPF inválido”**.
  2. **Removida** a opção de editar campos auto preenchidos; **definido** somente leitura para nome, sexo e data de nascimento após sucesso.
  3. **Definida** combinação **obrigatória**: consulta **automática** (com debounce/controles) **e** ação de **busca manual** na UI.
  4. **Especificado** endpoint interno como **obrigatório**, não apenas recomendado.
  5. **Atualizada** a política de erros: mensagem única ao usuário; códigos internos e logs detalhados no backend.
  6. **Incluída** seção **C.6** (debounce, cancelamento, corrida, rate limit, logs).
  7. **Atualizado** plano de fases com **entregas explícitas** por fase (lookup na 2; UX completa na 3).
  8. **Notado** plano **ilimitado** no provedor, mantendo proteções técnicas.
  9. **Ajustada** seção de riscos: removido foco em “fallback manual” e quota como gargalo principal.

  ---

  *Documento para planejamento interno. Implementação somente após revisão jurídica e operacional.*
