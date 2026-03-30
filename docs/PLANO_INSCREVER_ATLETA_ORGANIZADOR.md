# Plano de implantação: Inscrever Atleta (Organizador) – fluxo por etapas com CPF

**Contexto:** Melhorar a função "Inscrever Atleta" no painel do organizador (`organizador/inscricoes`), substituindo o fluxo atual (inscrição por email) por um fluxo em etapas que inicia com CPF e permite cadastrar atleta quando não houver usuário na plataforma.

**Regras de negócio:**
- Primeiro passo: solicitar **CPF** (em vez de email).
- Se o CPF **já tiver cadastro**: preencher automaticamente os dados do atleta e seguir para a etapa de inscrição (modalidade, categoria, kit, variantes).
- Se o CPF **não tiver cadastro**: exibir formulário para o organizador preencher dados do atleta; em seguida, etapa de inscrição.
- A inscrição continua entrando como **convite** (mesmo tratamento atual: `payment_status: 'convidado'`, `payment_method: 'free_bonus'`).

---

## Situação atual (resumo)

| Aspecto | Atual |
|--------|--------|
| Entrada | Email do atleta (obrigatório) |
| Backend | `POST /registrations/organizer/register-athlete` com `email`, `event_id`, `category_id`, `kit_id`, `product_selections` |
| Busca atleta | `findUserByEmail(email)` – se não achar, retorna 404 |
| Resultado | Inscrição criada com `status: 'confirmed'`, `payment_status: 'convidado'`, `payment_method: 'free_bonus'` |

---

## Fluxo desejado (visão geral)

1. **Etapa 1 – CPF**
   - Organizador informa apenas o CPF (com máscara e validação).
   - Ao sair do campo (ou botão “Buscar”): chamada à API de busca por CPF.
   - **Se encontrou:** preencher automaticamente nome, data de nascimento, cidade, sexo, equipe, email, telefone (somente leitura ou editáveis conforme definição) e exibir botão “Próximo: Inscrição”.
   - **Se não encontrou:** exibir formulário para preenchimento (Etapa 2a).

2. **Etapa 2a – Dados do atleta (somente quando não tem cadastro)**
   - Campos: Nome, Data de nascimento, Cidade, Sexo (M/F – clicável entre duas opções), Equipe, Email (opcional), Telefone (opcional).
   - Validação mínima (nome, nascimento, cidade, sexo obrigatórios; equipe/contatos opcionais).
   - Botão “Próximo: Inscrição”.

3. **Etapa 3 – Inscrição (sempre)**
   - Seleção: Evento, Modalidade, Categoria, Kit (opcional), variantes de produto (se houver).
   - Reaproveitar a lógica atual de evento/modalidade/categoria/kit/variantes do dialog “Inscrever Atleta”.
   - Botão “Confirmar inscrição”.
   - Ao confirmar: criar/atualizar atleta (se veio do formulário) e criar inscrição como convite.

---

## Etapas de implementação

### Etapa 1 – Backend: busca por CPF e contrato do endpoint

**Objetivo:** API aceitar identificação por CPF; se não houver usuário, aceitar dados do atleta e criar usuário/perfil antes de criar a inscrição.

**Tarefas:**

1. **Ajustar contrato do endpoint**  
   - Manter compatibilidade com `email` (opcional) ou migrar para “CPF obrigatório”.  
   - Opção recomendada: aceitar **`cpf`** (obrigatório) e **`runner_data`** (opcional).  
   - Se `runner_data` vier preenchido, usar para criar usuário + perfil quando não existir usuário com esse CPF.

2. **Regras no controller**  
   - Validar e normalizar CPF (apenas dígitos).  
   - Buscar atleta por CPF (`findUserByCpf` já existe em `registrationsService`).  
   - **Se encontrou:** usar `runner_id` do atleta; ignorar `runner_data`; validar evento, categoria, kit, modalidade, product_selections; criar inscrição como hoje (convite).  
   - **Se não encontrou:**  
     - Exigir `runner_data` com: `full_name`, `birth_date`, `city`, `gender`, `team`; opcionais: `email`, `phone`.  
     - Criar usuário + perfil (serviço novo ou estendido, ex.: “createRunnerByOrganizer”): usuário com email temporário ou email informado; senha temporária/aleatória; perfil com CPF e demais campos.  
     - Associar ao evento/organizador e criar inscrição com `runner_id` do novo usuário, mesmo fluxo de convite.

3. **Serviço de criação de atleta pelo organizador**  
   - Função que: recebe CPF + `runner_data`; verifica se CPF já existe; se não, cria em `users` (ex.: email único se informado, senão `cpf+id@temp.cronoteam` ou similar) e em `profiles` (full_name, cpf, birth_date, city, gender, team, email, phone, etc.).  
   - Definir role (runner) e qualquer flag de “conta criada pelo organizador” se for necessário para fluxos futuros (ex.: primeiro login).

4. **Respostas de erro claras**  
   - 400: CPF inválido ou `runner_data` incompleto quando atleta não existe.  
   - 404: só se fizer sentido (ex.: evento/categoria não encontrados); para “CPF não encontrado” pode-se retornar 200 com `{ found: false, runner: null }` para o front decidir exibir o formulário.

**Entregáveis:**  
- Endpoint atualizado (ou novo) documentado; testes manuais/automáticos para “CPF encontrado” e “CPF não encontrado + runner_data”.

---

### Etapa 2 – Frontend: busca por CPF e estado “atleta encontrado / não encontrado”

**Objetivo:** Dialog “Inscrever Atleta” em steps; primeiro step = CPF com busca e definição se o atleta existe ou não.

**Tarefas:**

1. **Estado do dialog**  
   - Step atual (1 = CPF, 2 = Dados atleta, 3 = Inscrição).  
   - CPF digitado (normalizado).  
   - Resultado da busca: `athleteFound: boolean | null`; se `true`, objeto com dados do atleta (nome, nascimento, cidade, sexo, equipe, email, telefone).  
   - Se `false`, estado para preencher formulário (Etapa 2a).

2. **Chamada à API de perfil por CPF**  
   - Usar `getPublicProfileByCpf(cpf)` (já existe em `profiles.ts`) ao sair do campo CPF ou ao clicar em “Buscar”.  
   - Tratar: encontrou → preencher dados e permitir ir para “Próximo: Inscrição”; não encontrou → mostrar step “Dados do atleta”.

3. **UI do Step 1**  
   - Campo CPF com máscara (xxx.xxx.xxx-xx).  
   - Botão “Buscar” ou busca on blur (com debounce).  
   - Loading durante a busca.  
   - Mensagens: “Atleta encontrado. Dados preenchidos abaixo.” / “CPF não cadastrado. Preencha os dados abaixo.”

**Entregáveis:**  
- Step 1 funcional: digitação de CPF, busca, e decisão entre “atleta encontrado” (ir para step 3) ou “não encontrado” (ir para step 2).

---

### Etapa 3 – Frontend: formulário de dados do atleta (Step 2a)

**Objetivo:** Formulário completo quando CPF não tem cadastro, com os campos solicitados.

**Tarefas:**

1. **Campos do formulário**  
   - **Nome** (obrigatório).  
   - **Data de nascimento** (obrigatório).  
   - **Cidade** (obrigatório).  
   - **Sexo** (obrigatório): dois botões/opções clicáveis (ex.: “Masculino” / “Feminino”), valor M/F.  
   - **Equipe** (opcional).  
   - **Contatos (opcional):** Email, Telefone.

2. **Validação**  
   - Nome, data de nascimento, cidade e sexo obrigatórios; demais opcionais.  
   - Formato de data e, se aplicável, email/telefone.

3. **Navegação**  
   - “Voltar” → volta ao step 1 (CPF).  
   - “Próximo: Inscrição” → salva os dados no estado (ou envia para backend só no step 3, conforme decisão da Etapa 1).  
   - Não criar inscrição ainda; apenas preparar `runner_data` para o próximo step.

**Entregáveis:**  
- Step 2a exibido apenas quando “CPF não encontrado”; formulário validado e dados disponíveis para o step de inscrição.

---

### Etapa 4 – Frontend: step de inscrição (modalidade, categoria, kit, variantes)

**Objetivo:** Reaproveitar a lógica atual de seleção de evento, modalidade, categoria, kit e variantes em um único “Step 3 – Inscrição”.

**Tarefas:**

1. **Reutilizar componentes e estado**  
   - Manter selects de Evento, Modalidade, Categoria, Kit e a lógica de produtos/variantes já existente no dialog atual.  
   - Garantir que esse bloco seja exibido como Step 3 (após CPF ou após Dados do atleta).

2. **Fluxo e botões**  
   - “Voltar” → volta ao step 2 (dados do atleta) ou ao step 1 (se não passou pelo formulário).  
   - “Confirmar inscrição” → montar payload: CPF + (se novo atleta) `runner_data` + event_id, category_id, modality_id, kit_id, product_selections; chamar `createRegistrationByOrganizer` (ou novo endpoint definido na Etapa 1).

3. **Tratamento de sucesso/erro**  
   - Sucesso: toast, fechar dialog, recarregar lista de inscrições.  
   - Erro: exibir mensagem (ex.: “CPF já inscrito neste evento”, “Categoria esgotada”).

**Entregáveis:**  
- Step 3 funcional; inscrição criada como convite tanto para atleta existente (por CPF) quanto para atleta novo (criado a partir de `runner_data`).

---

### Etapa 5 – Ajustes finais e testes

**Objetivo:** Consistência de UX, acessibilidade e testes do fluxo completo.

**Tarefas:**

1. **Exibição dos dados do atleta quando encontrado por CPF**  
   - No step 3, mostrar resumo: “Inscrição para: [Nome], CPF xxx.xxx.xxx-xx, Nasc. dd/mm/aaaa, Cidade, Sexo, Equipe (se houver).”  
   - Se a API permitir edição limitada (ex.: só equipe/contato), refletir no UI.

2. **Máscara e validação de CPF**  
   - Máscara no input; validação de 11 dígitos e dígitos verificadores (opcional mas recomendado).

3. **Sexo clicável**  
   - Dois botões ou cards selecionáveis (Masculino / Feminino), acessíveis por teclado e leitores de tela.

4. **Testes manuais**  
   - Cenário A: CPF com cadastro → preenchimento automático → escolher evento/categoria/kit → confirmar → inscrição convite.  
   - Cenário B: CPF sem cadastro → preencher nome, nascimento, cidade, sexo, equipe, email/telefone → próximo → escolher evento/categoria/kit → confirmar → novo usuário criado e inscrição convite.  
   - Cenário C: CPF já inscrito no mesmo evento → mensagem clara de erro.

5. **Documentação**  
   - Atualizar este plano com qualquer desvio (ex.: nome do endpoint, campos opcionais adicionais).  
   - Uma linha no README ou em docs de admin/organizador sobre “Inscrever Atleta por CPF”.

**Entregáveis:**  
- Fluxo completo testado; máscara e validação de CPF; sexo acessível; documentação atualizada.

---

## Ordem sugerida de desenvolvimento

| Ordem | Etapa | Dependência |
|-------|--------|-------------|
| 1 | Etapa 1 – Backend (CPF + runner_data, criar atleta) | Nenhuma |
| 2 | Etapa 2 – Frontend (Step CPF + busca) | Etapa 1 (contrato da API) |
| 3 | Etapa 3 – Frontend (Formulário dados atleta) | Etapa 2 |
| 4 | Etapa 4 – Frontend (Step inscrição integrado) | Etapas 2 e 3 |
| 5 | Etapa 5 – Ajustes e testes | Etapas 1–4 |

---

## Campos do formulário – resumo

| Campo | Obrigatório | Observação |
|-------|-------------|------------|
| Nome | Sim | - |
| Data de nascimento | Sim | - |
| Cidade | Sim | - |
| Sexo | Sim | M/F, seleção clicável entre duas opções |
| Equipe | Não | - |
| Email | Não | Contato |
| Telefone | Não | Contato |

---

## Convite (comportamento mantido)

- Inscrição criada pelo organizador continua com:  
  `payment_method: 'free_bonus'`, `payment_status: 'convidado'`, `status: 'confirmed'`, `total_amount: 0`.  
- Nenhuma alteração na regra de convite; apenas a forma de identificar/criar o atleta muda (CPF + formulário quando não cadastrado).

---

## Observações para implementação

1. **Privacidade e LGPD:** Criar atleta sem consentimento explícito de cadastro pode exigir aviso no formulário (ex.: “Os dados serão utilizados para inscrição no evento e criação de cadastro na plataforma”).  
2. **Email temporário:** Se o organizador não informar email, definir política (ex.: email único por CPF temporário ou campo “sem email” e tratamento no backend).  
3. **Primeiro acesso:** Se for necessário “primeiro login” do atleta depois, considerar envio de email de redefinição de senha ou link de ativação (pode ficar para uma fase posterior).  
4. **Duplicidade:** Garantir que, ao criar usuário por CPF, não exista outro usuário com mesmo CPF (já coberto pela busca antes de criar).

Quando estiver de acordo com este plano, basta confirmar no chat para seguir com a implementação nas etapas acima.

---

## Implementação concluída (atualizações)

- **Endpoint:** `POST /api/registrations/organizer/register-athlete`  
  **Body:** `cpf` (obrigatório), `runner_data` (opcional: full_name, birth_date, city, gender, team?, email?, phone?), `event_id`, `category_id`, `kit_id?`, `modality_id?`, `product_selections?`.  
  Inscrição criada como convite (`payment_status: 'convidado'`, `payment_method: 'free_bonus'`).

- **Busca por CPF (step 1):** `GET /api/profiles/search-by-cpf?cpf=xxx` — retorna perfil quando **is_public = true**. Se não encontrado ou não público, o fluxo exibe o formulário de dados do atleta (step 2).

- **Criação de atleta (backend):** Serviço `createRunnerByOrganizer(cpf, runner_data)`: email único (informado ou temporário `org-runner-{cpf}-{timestamp}@temp.cronoteam`), senha aleatória, perfil + role runner.

- **Frontend:** Dialog em 3 steps (CPF → Dados do atleta [se não cadastrado] → Inscrição). Validação de CPF com dígitos verificadores; máscara no input; sexo com RadioGroup (M/F) acessível.

- **Testes manuais sugeridos:** (A) CPF com cadastro → próximo → evento/categoria/kit → confirmar; (B) CPF sem cadastro → preencher dados → próximo → evento/categoria/kit → confirmar; (C) CPF já inscrito no evento → mensagem de erro.
