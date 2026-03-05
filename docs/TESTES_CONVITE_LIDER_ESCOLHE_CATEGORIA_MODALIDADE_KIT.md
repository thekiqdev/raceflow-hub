# Testes: Convite do líder – escolher categoria, modalidade e kit (ou deixar o corredor escolher)

Documento de testes manuais e checklist para validar a funcionalidade implementada no plano **Convite do líder com opção de escolher categoria, modalidade e kit**.

---

## 1. Cenários de teste

### 1.1 Líder envia convite com categoria, modalidade e kit selecionados

**Objetivo:** Garantir que, quando o líder desmarca "Deixar o corredor escolher" e preenche categoria, modalidade, kit (e variante se houver), o corredor vê a inscrição já preenchida.

**Pré-requisitos:**
- Evento com categorias, modalidades e kits (pelo menos um kit com produto variável, ex.: tamanho).
- Líder com convite disponível (bônus de comissão).
- Corredor cadastrado (CPF válido) ou dados para pré-cadastro.

**Passos:**
1. Líder acessa o painel (LeaderDashboard) e abre "Enviar Convite" para um convite disponível.
2. Desmarca o checkbox **"Deixar o corredor escolher categoria, modalidade e kit"**.
3. Preenche **Categoria** (obrigatório), **Modalidade** e **Kit**.
4. Se o kit tiver produto com variação (ex.: camiseta), seleciona **Tamanho/variante**.
5. Informa o CPF do corredor e clica em Buscar (ou preenche dados de pré-cadastro se não encontrado).
6. Clica em **Enviar Convite**.

**Resultado esperado:**
- Convite é enviado com sucesso.
- Corredor, ao acessar "Minhas Inscrições", vê a inscrição com status "Convite", já com **categoria**, **modalidade** e **kit** (e variante) preenchidos.
- Se ainda faltar algum atributo (ex.: outro produto variável), o corredor pode usar o fluxo **"Selecionar Atributos Pendentes"** apenas para o que faltar.

**Checklist:**
- [ ] Líder consegue desmarcar a opção e ver os selects de categoria, modalidade e kit.
- [ ] Categoria é obrigatória; sem ela o botão "Enviar Convite" permanece desabilitado.
- [ ] Se o kit tiver produto variável, a variante é obrigatória; sem ela o envio é bloqueado (frontend e/ou backend).
- [ ] Corredor vê a inscrição já com categoria, modalidade e kit preenchidos.
- [ ] Não aparece para o corredor o botão "Completar convite" nessa inscrição (pois o líder já definiu).

---

### 1.2 Líder envia convite com "Deixar o corredor escolher"

**Objetivo:** Garantir que, quando o líder deixa marcado "Deixar o corredor escolher categoria, modalidade e kit", o corredor acessa o fluxo para definir categoria, modalidade, kit e tamanho.

**Pré-requisitos:**
- Mesmo que 1.1 (evento com categorias, modalidades, kits).

**Passos:**
1. Líder abre "Enviar Convite" e **mantém marcado** o checkbox "Deixar o corredor escolher categoria, modalidade e kit".
2. Não preenche categoria, modalidade nem kit (os campos não devem aparecer).
3. Informa o CPF do corredor e envia o convite.

**Resultado esperado:**
- Convite é enviado.
- Corredor, em "Minhas Inscrições", vê a inscrição com status "Convite" e o botão **"Completar convite (escolher categoria, modalidade e kit)"**.
4. Corredor clica no botão e abre o modal **"Completar convite"**.
5. Corredor seleciona **Categoria** (obrigatório), **Modalidade**, **Kit** e, se o kit tiver produto variável, **Tamanho/variante**.
6. Clica em **Concluir**.

**Resultado esperado:**
- Inscrição é atualizada com categoria, modalidade, kit e variante.
- O botão "Completar convite" some; a inscrição passa a exibir categoria, modalidade e kit normalmente.
- Se ainda houver atributos pendentes (ex.: outro produto variável), o fluxo "Selecionar Atributos Pendentes" continua disponível.

**Checklist:**
- [ ] Com a opção marcada, o líder não vê os campos de categoria/modalidade/kit e o envio não envia esses IDs.
- [ ] Corredor vê o botão "Completar convite" na inscrição.
- [ ] Modal "Completar convite" carrega categorias, modalidades e kits do evento.
- [ ] Corredor consegue escolher categoria, modalidade, kit e variante (quando aplicável) e concluir.
- [ ] Após concluir, a inscrição reflete os dados escolhidos e o botão "Completar convite" não aparece mais.

---

### 1.3 Validações de backend (envio com kit variável)

**Objetivo:** Garantir que o backend exige variante quando o líder envia um kit com produto variável.

**Passos:**
1. Via API ou frontend: enviar convite com `runner_chooses_category_modality_kit: false`, `category_id`, `kit_id` de um kit que tem produto com variação, **sem** `product_selections` (ou sem variante para esse produto).

**Resultado esperado:**
- Resposta `400` com mensagem indicando que é necessário selecionar a variante para o(s) produto(s) variável(eis).

**Checklist:**
- [ ] Backend retorna erro claro quando kit tem produto variável e product_selections está ausente ou incompleto.

---

### 1.4 Convites e inscrições antigas

**Objetivo:** Garantir que convites já enviados e inscrições antigas continuam funcionando.

**Passos:**
1. Inscrições com `payment_status = 'convidado'` que não tenham `invitation_runner_chooses_category_modality_kit` (null/legado) devem continuar visíveis e utilizáveis.
2. Corredor com convite antigo (sem flag) que ainda não tem categoria/kit pode ver "Completar convite" (inferido por `!category_id` ou flag null).

**Checklist:**
- [ ] Listagem de inscrições do corredor não quebra para convites antigos.
- [ ] Fluxo de atributos pendentes (tamanho) continua funcionando quando o kit já está definido e só falta variante.

---

## 2. Resumo da documentação de API

- **Envio de convite:** `POST /group-leaders/me/invitations/send`  
  Body pode incluir `runner_chooses_category_modality_kit`, `category_id`, `modality_id`, `kit_id`, `product_selections`.  
  Ver `backend/API_DOCUMENTATION.md` (seção "Líderes de grupo – Convites").

- **Completar convite (corredor):** `POST /registrations/:id/complete-invitation`  
  Body: `category_id` (obrigatório), `modality_id`, `kit_id`, `product_selections`.  
  Ver `backend/API_DOCUMENTATION.md` (seção "Inscrições").

---

## 3. Checklist final (conforme plano)

- [ ] Backend aceita e valida `category_id`, `modality_id`, `kit_id`, `product_selections` e `runner_chooses_category_modality_kit` no envio do convite.
- [ ] Inscrição bônus é atualizada com categoria, modalidade, kit e product_selections quando o líder envia com esses dados.
- [ ] No LeaderDashboard, o dialog "Enviar Convite" contém a opção "Deixar o corredor escolher categoria, modalidade e kit".
- [ ] Com a opção desmarcada, o líder vê e preenche Categoria, Modalidade e Kit (e variante quando o kit tiver produto variável).
- [ ] Envio com opção desmarcada envia os IDs e product_selections; com opção marcada, não envia (comportamento atual).
- [ ] Corredor que recebe convite com "corredor escolhe" tem fluxo para definir categoria, modalidade e kit (e tamanho quando aplicável).
- [ ] Corredor que recebe convite com dados preenchidos pelo líder vê a inscrição já com categoria, modalidade e kit (e completa apenas o que faltar, ex.: tamanho).
- [ ] Convites e inscrições antigas continuam funcionando; não há quebra de compatibilidade.
- [ ] Documentação e testes cobrem os dois modos (líder escolhe x corredor escolhe).
