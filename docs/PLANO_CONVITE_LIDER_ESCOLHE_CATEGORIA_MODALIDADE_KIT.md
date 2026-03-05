# Plano: Convite do líder com opção de escolher categoria, modalidade e kit (ou deixar o corredor escolher)

---

## 1. Contexto

O sistema permite que **líderes de grupo** ganhem **convites** (inscrições grátis) como bônus por comissão. Cada convite está vinculado a uma inscrição bônus (`bonus_registration_id`) em um evento. Hoje, ao **enviar** o convite, o líder informa apenas o CPF do corredor (e, se necessário, dados para pré-cadastro). A inscrição bônus foi criada no momento da concessão do convite com **categoria padrão** do evento; **modalidade** e **kit** costumam ficar em branco. O corredor que recebe o convite já faz a **seleção de tamanho** (variante do produto do kit) quando há atributos pendentes. Este plano introduz duas possibilidades: (1) o **líder** poder **definir** categoria, modalidade e kit (e, se aplicável, variante) no momento do envio do convite; (2) uma **opção explícita** para que essa decisão seja feita pelo **próprio corredor**.

---

## 2. Objetivo

- Permitir que, ao criar/enviar um convite, o líder tenha uma **opção** em que **ele mesmo seleciona** a categoria, a modalidade e o kit do convite (e, quando o kit tiver produto com variação, também a variante/tamanho).
- Oferecer uma **opção** que marque que **a decisão (categoria, modalidade e kit) pode ser feita pelo próprio corredor** (mantendo/completando o fluxo em que o corredor já escolhe o tamanho quando há atributos pendentes).
- Garantir que as funções já existentes (envio de convite, transferência da inscrição bônus para o runner, seleção de tamanho pelo corredor) continuem funcionando e que a nova lógica se integre sem quebrar convites já enviados ou em uso.

---

## 3. Estado atual

| Aspecto | Comportamento atual |
|--------|----------------------|
| **Criação do convite** | Ao conceder o bônus, o backend cria uma inscrição grátis (`createRegistration` com `payment_method: 'free_bonus'`, `category_id` = categoria padrão do evento). Não são definidos `modality_id` nem `kit_id` na criação. |
| **Envio do convite** | O líder informa CPF (e opcionalmente `runner_data` para pré-cadastro). Backend associa o runner ao convite e atualiza a inscrição bônus: `runner_id`, `registered_by`, `status`, `payment_status = 'convidado'`. Não há envio de `category_id`, `modality_id`, `kit_id` nem `product_selections`. |
| **Dados da inscrição bônus** | A inscrição permanece com categoria padrão; modalidade e kit podem ser nulos. |
| **Corredor** | Acessa “Minhas Inscrições”, vê a inscrição com status “Convite” e, quando o kit tem produto com variação, é levado ao fluxo de **atributos pendentes** para escolher **tamanho** (variante). Não há fluxo explícito hoje para o corredor escolher categoria, modalidade ou kit. |
| **LeaderDashboard** | Dialog “Enviar Convite”: passo 1 = CPF (+ Buscar), passo 2a = atleta encontrado e Enviar, passo 2b = pré-cadastro e Enviar. Não há seleção de categoria, modalidade ou kit. |

---

## 4. Arquitetura alvo

- **No envio do convite (líder):**
  - **Opção “Deixar o corredor escolher categoria, modalidade e kit”** (ex.: checkbox):
    - **Marcada:** o líder **não** informa categoria, modalidade nem kit; a inscrição bônus segue com os dados atuais (categoria padrão; modalidade/kit podem permanecer nulos). O corredor, em fluxo próprio (a ser implementado ou reutilizado), poderá definir categoria, modalidade e kit (e já escolhe tamanho no fluxo de atributos pendentes).
    - **Desmarcada:** o líder **deve** selecionar categoria, modalidade e kit (e, se o kit tiver produto com variação, também a variante/tamanho). Esses dados são enviados no payload de envio e o backend **atualiza** a inscrição bônus (`category_id`, `modality_id`, `kit_id` e, se aplicável, `registration_product_selections`) antes ou ao associar o runner ao convite.
- **Persistência:** a inscrição bônus (`registrations` + `registration_product_selections`) passa a refletir a escolha do líder quando ele não deixar para o corredor; caso contrário, permanece como hoje e o corredor completará em fluxo dedicado.
- **Corredor:** se o líder tiver preenchido categoria, modalidade e kit (e variante), o corredor não precisa escolher esses itens; apenas acessa a inscrição e, se ainda faltar algo (ex.: outro atributo), usa o fluxo de atributos pendentes. Se o líder tiver marcado “deixar o corredor escolher”, o corredor terá uma tela/fluxo para definir categoria, modalidade e kit (além do tamanho já existente).

---

## 5. Plano por etapas

### Etapa 1 – Backend: aceitar categoria, modalidade, kit e product_selections no envio do convite

- Estender o schema de `POST /group-leaders/me/invitations/send` para aceitar campos opcionais: `category_id`, `modality_id`, `kit_id`, `product_selections` (array no mesmo formato da inscrição).
- Regra: se “deixar o corredor escolher” estiver ativo no frontend, o cliente envia **sem** esses campos; caso contrário, o cliente envia com os campos preenchidos.
- No serviço de envio (`sendInvitationByCpf` ou equivalente), após validar o convite e o runner: se `category_id`, `modality_id` ou `kit_id` forem informados, atualizar a inscrição bônus (`registrations`) com esses valores; se `product_selections` for informado, persistir em `registration_product_selections` (substituindo/inserindo conforme regra atual de product_selections).
- Validar que `category_id` pertence ao evento, que `modality_id` está associada à categoria e que `kit_id` pertence ao evento (e, se houver kit, que `product_selections` seja coerente com o kit quando houver produto variável).

### Etapa 2 – Backend: flag “runner escolhe categoria/modalidade/kit”

- Incluir no payload de envio um campo booleano, por exemplo `runner_chooses_category_modality_kit` (ou armazenar no convite, conforme decisão de modelo).
- Se for armazenado no convite: adicionar coluna em `leader_invitations` (ex.: `runner_chooses_category_modality_kit BOOLEAN DEFAULT true`) e preenchê-la no envio; usar esse valor para decidir se o corredor deve ver o fluxo de escolha de categoria/modalidade/kit.
- Se for apenas derivado (líder envia ou não os IDs): não é obrigatório persistir; o backend pode inferir “corredor escolhe” quando não forem enviados `category_id`/`modality_id`/`kit_id`. Documentar a decisão no plano.

### Etapa 3 – Frontend (líder): opção “Deixar o corredor escolher” e seleção de categoria/modalidade/kit

- No dialog “Enviar Convite” do LeaderDashboard, adicionar um **checkbox** (ou toggle): “Deixar o corredor escolher categoria, modalidade e kit”.
- **Quando marcado:** não exibir campos de categoria, modalidade e kit; ao enviar, não incluir `category_id`, `modality_id`, `kit_id` nem `product_selections` no payload (comportamento equivalente ao atual).
- **Quando desmarcado:** exibir selects (ou lista) de **Categoria**, **Modalidade** e **Kit** do evento do convite (evento já fixo pelo convite selecionado). Se o kit tiver produto com variação, exibir seleção de variante (tamanho) como já existe em outros fluxos. Ao enviar, incluir no payload os IDs e `product_selections` quando houver variante.
- Carregar categorias, modalidades e kits do evento do convite (reutilizar APIs existentes de evento/categoria/modalidade/kit).

### Etapa 4 – Frontend (corredor): fluxo para escolher categoria, modalidade e kit quando “runner escolhe”

- Identificar inscrições convite (`payment_status = 'convidado'`) que tenham a flag “runner escolhe” (ou em que categoria/modalidade/kit ainda não estejam definidos e o evento permita escolha).
- Exibir para o corredor um fluxo (página ou modal) para escolher **categoria**, **modalidade** e **kit** (e, se kit com variação, **tamanho**), e persistir via endpoint de atualização de inscrição (ex.: `PATCH /registrations/:id` ou endpoint específico para “completar convite”) com `category_id`, `modality_id`, `kit_id` e `product_selections`.
- Garantir que o fluxo de atributos pendentes (tamanho) continue funcionando quando já houver kit mas faltar variante.

### Etapa 5 – Regras e validações

- Só permitir envio com categoria/modalidade/kit preenchidos se os valores forem válidos para o evento (categoria do evento, modalidade da categoria, kit do evento).
- Se o líder desmarcar “deixar o corredor escolher” e o evento tiver kit obrigatório com produto variável, exigir também a seleção da variante antes de enviar.
- Inscrições bônus já existentes (convites já enviados) não devem ser alteradas em massa; apenas novos envios ou edições explícitas passam a usar a nova lógica.

### Etapa 6 – Testes e documentação

- Testar: líder envia convite com categoria/modalidade/kit selecionados → corredor vê inscrição já preenchida (e só completa tamanho se ainda faltar).
- Testar: líder envia com “deixar o corredor escolher” → corredor acessa fluxo de escolha de categoria/modalidade/kit e tamanho.
- Atualizar documentação de API (envio de convite) e, se necessário, do fluxo do corredor.

**Entregas da Etapa 6:** `backend/API_DOCUMENTATION.md` (seção Líderes de grupo – Convites e endpoint complete-invitation em Inscrições); `docs/TESTES_CONVITE_LIDER_ESCOLHE_CATEGORIA_MODALIDADE_KIT.md` (cenários e checklist); `backend/TESTING.md` (seção 9 – referência aos testes de convites).

---

## 6. Regras de implementação

- **Compatibilidade:** Convites já enviados e inscrições bônus já existentes não devem quebrar; campos novos no envio são opcionais.
- **Fonte da verdade:** Categoria, modalidade e kit da inscrição convite ficam em `registrations` (e `registration_product_selections` para variantes); qualquer lógica de “quem escolhe” deve ser consistente com esses dados.
- **Evento fixo:** O evento do convite é sempre o do convite (inscrição bônus); não permitir troca de evento no envio.
- **Validação:** Backend deve validar que `category_id` pertence ao evento, `modality_id` à categoria e `kit_id` ao evento; e que `product_selections` corresponda ao kit quando houver produto variável.
- **Unicidade:** Um convite só pode ser enviado uma vez (status `available` → `sent`); ao preencher categoria/modalidade/kit no envio, atualizar a inscrição bônus antes ou no mesmo fluxo da associação runner/convite.

---

## 7. Entregáveis

| # | Entregável |
|---|------------|
| 1 | Schema e backend do endpoint de envio de convite estendidos com `category_id`, `modality_id`, `kit_id`, `product_selections` opcionais e, se adotado, `runner_chooses_category_modality_kit`. |
| 2 | Atualização da inscrição bônus (registrations + registration_product_selections) no envio do convite quando o líder informar categoria/modalidade/kit (e variante). |
| 3 | Checkbox/toggle “Deixar o corredor escolher categoria, modalidade e kit” no dialog “Enviar Convite” do LeaderDashboard. |
| 4 | Bloco de seleção de Categoria, Modalidade e Kit (e variante quando aplicável) no mesmo dialog, exibido quando a opção “deixar o corredor escolher” estiver desmarcada. |
| 5 | Payload de envio do convite integrado: quando líder preenche, enviar os IDs e product_selections; quando “corredor escolhe”, não enviar. |
| 6 | Fluxo do corredor para escolher categoria, modalidade e kit (e tamanho se aplicável) quando o convite estiver marcado como “runner escolhe” (ou quando esses campos ainda estiverem em aberto). |
| 7 | Documentação atualizada (API e, se necessário, fluxo do corredor) e testes manuais/automáticos cobrindo os dois modos (líder escolhe x corredor escolhe). |

---

## 8. Checklist final

- [ ] Backend aceita e valida `category_id`, `modality_id`, `kit_id`, `product_selections` (e opcionalmente `runner_chooses_category_modality_kit`) no envio do convite.
- [ ] Inscrição bônus é atualizada com categoria, modalidade, kit e product_selections quando o líder envia com esses dados.
- [ ] No LeaderDashboard, o dialog “Enviar Convite” contém a opção “Deixar o corredor escolher categoria, modalidade e kit”.
- [ ] Com a opção desmarcada, o líder vê e preenche Categoria, Modalidade e Kit (e variante quando o kit tiver produto variável).
- [ ] Envio com opção desmarcada envia os IDs e product_selections; com opção marcada, não envia (comportamento atual).
- [ ] Corredor que recebe convite com “corredor escolhe” tem fluxo para definir categoria, modalidade e kit (e tamanho quando aplicável).
- [ ] Corredor que recebe convite com dados preenchidos pelo líder vê a inscrição já com categoria, modalidade e kit (e completa apenas o que faltar, ex.: tamanho).
- [ ] Convites e inscrições antigas continuam funcionando; não há quebra de compatibilidade.
- [ ] Documentação e testes cobrem os dois modos (líder escolhe x corredor escolhe).
