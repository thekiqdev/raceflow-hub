# Cenários de teste: Premiação e Cronograma

Checklist para QA / testes manuais das abas **Premiação** e **Cronograma** no cadastro de eventos e da **exibição na página de inscrição** (corredor).

Referência: [PLANO_EVENTO_ABAS_PREMIACAO_CRONOGRAMA.md](./PLANO_EVENTO_ABAS_PREMIACAO_CRONOGRAMA.md) (Etapas 3–6).

---

## Pré-requisitos

- Usuário **organizador** ou **admin** para cadastro/edição de evento.
- Navegador para acessar a **página pública do evento** (corredor) e conferir exibição.

---

## 1. Premiação (cadastro e exibição)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 1.1 | Abrir cadastro/edição de evento (organizador ou admin). Aba **Premiação**. | Aba visível; editor TipTap com placeholder. |
| 1.2 | Deixar premiação em branco e salvar evento. | Evento salvo sem erro. Campo opcional. |
| 1.3 | Preencher premiação com texto formatado (negrito, lista, etc.) e salvar. | Conteúdo salvo. |
| 1.4 | Reabrir o evento para edição. | Conteúdo da premiação carregado no editor. |
| 1.5 | Abrir a **página do evento** (visão corredor). | Seção **Premiação** exibida com o HTML **sanitizado** (sem script; formatação visível). |
| 1.6 | Evento sem premiação: abrir página do evento. | Seção Premiação **não** aparece. Página não quebra. |

---

## 2. Cronograma – itens (timeline)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 2.1 | Aba **Cronograma**. Clicar em **Adicionar horário**. | Novo item com horário (ex.: 07:00), título e descrição opcional. |
| 2.2 | Preencher horário (HH:mm), título (obrigatório, máx. 120) e salvar. | Itens salvos; ao reabrir, lista e ordem mantidas. |
| 2.3 | Reordenar itens (mover para cima/baixo) e salvar. | Ordem persistida (`display_order`). |
| 2.4 | Remover um item e salvar. | Item removido; demais intactos. |
| 2.5 | Inserir dois itens com o **mesmo horário** (ex.: 07:00) e salvar. | **Alerta** de horários duplicados exibido; **save permitido** (não bloqueia). |
| 2.6 | Na página do evento (corredor): evento com itens. | Seção **Cronograma** em formato **timeline** (horário + título; descrição se houver). Ordem correta. Título e descrição como **texto** (sem HTML). |
| 2.7 | Evento com **zero** itens de cronograma e sem texto livre: página do evento. | Seção Cronograma **não** aparece. |

---

## 3. Cronograma – texto livre

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 3.1 | Aba Cronograma. Preencher **Observações / informações adicionais** (TipTap) e salvar. | Texto salvo. |
| 3.2 | Reabrir evento. | Texto livre carregado no editor. |
| 3.3 | Página do evento: evento com texto livre (e opcionalmente itens). | Bloco de texto exibido **após sanitização**; abaixo ou junto da timeline se houver itens. |

---

## 4. Timeline – cenários de quantidade (0, 1, 10, 50 itens)

| # | Cenário | Passo | Resultado esperado |
|---|---------|--------|---------------------|
| 4.1 | **0 itens** | Evento sem itens; sem texto livre de cronograma. Abrir página do evento. | Seção Cronograma **não** exibida. |
| 4.2 | **1 item** | Cadastrar 1 item (ex.: 08:00 Largada). Salvar. Página do evento. | Seção Cronograma com uma linha; layout correto. |
| 4.3 | **10 itens** | Cadastrar 10 itens, ordenar, salvar. Página do evento. | Timeline com 10 linhas; ordem correta; scroll/leitura ok. |
| 4.4 | **50 itens** (limite) | Cadastrar 50 itens (ou importar). Salvar. Página do evento. | Todos exibidos; ordem correta. Botão "Adicionar horário" **desabilitado** ao atingir 50. |
| 4.5 | **> 50 itens** | Tentar enviar mais de 50 itens (ex.: via API ou front se houver brecha). | API ou front rejeita; mensagem de limite. |

---

## 5. Eventos antigos (compatibilidade)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 5.1 | Abrir evento criado **antes** da implementação (sem premiação/cronograma). | Abas Premiação e Cronograma acessíveis; campos vazios. Salvar não altera outros dados. |
| 5.2 | Abrir **página do evento** (corredor) para evento antigo. | Nenhuma seção Premiação ou Cronograma; página carrega normalmente. |

---

## 6. Admin (EventViewEditDialog)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 6.1 | Admin abre evento. Abas **Premiação** e **Cronograma**. | Conteúdo carregado; em modo **visualização** (view), editor e itens somente leitura. |
| 6.2 | Modo **edição**: alterar premiação e itens; salvar. | Alterações persistidas; iguais ao fluxo do organizador. |

---

## 7. Validações rápidas

| Regra | Como testar |
|-------|-------------|
| Título do item obrigatório | Deixar título vazio em um item e salvar: erro ou validação no front. |
| Título máx. 120 caracteres | Inserir título com 121 caracteres: validação impede ou backend retorna erro. |
| Horário HH:mm | Inserir "25:00" ou "7h": validação/erro. "07:00" e "07:30" aceitos. |
| Trim no título | Inserir "  Largada 5km  " e salvar: no GET ou na exibição, exibido sem espaços extras. |

---

## 8. Resumo dos critérios (Etapa 6)

- [ ] Validações aplicadas (time HH:mm, title máx. 120, trim no backend, display_order único, normalização 1..n); warning de horários duplicados no front (sem bloquear).
- [ ] Testes cobrindo premiação, cronograma (itens + texto) e exibição; timeline testada com 0, 1, 10 e 50 itens.
- [ ] Documentação da API atualizada (ver [API_EVENTOS_PREMIACAO_CRONOGRAMA.md](./API_EVENTOS_PREMIACAO_CRONOGRAMA.md)).
