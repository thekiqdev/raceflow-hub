# Cenários de teste: Edição de inscrição e alteração de valor

Checklist para QA / testes manuais do fluxo de edição de inscrição pelo admin com alteração de valor, cobrança da diferença e reembolso manual.

---

## Pré-requisitos

- Evento com categorias, kits e (opcional) lotes de preço configurados.
- Taxa de atualização configurada em **Configurações (admin) > Taxas** (ex.: R$ 10,00).
- Cupom de desconto no evento (para cenários com cupom).
- Módulo de desconto idoso ativado (para cenários com idoso 60+), se aplicável.

---

## 1. Edição com valor maior – inscrição pendente

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 1.1 | Criar inscrição com categoria/kit que totalizem R$ 100. Deixar **pendente** (não pagar o PIX). | Inscrição criada, status pendente. |
| 1.2 | Admin abre a inscrição, clica em Editar, altera para categoria/kit que totalizem R$ 150. Seleciona lote se houver. | Card "Pré-visualização" mostra novo total, taxa de atualização (se valor mudou), diferença a cobrar. |
| 1.3 | Salvar edição. | Inscrição atualizada. Cobrança antiga (R$ 100) cancelada no Asaas. Nova cobrança criada com valor do novo total (ex.: R$ 150 + taxa). |
| 1.4 | Corredor acessa Minhas Inscrições. | Botão "Pagar diferença" ou "Visualizar PIX" exibe o **novo** PIX (não o antigo). |
| 1.5 | Corredor paga o novo PIX. | Webhook atualiza pagamento; inscrição fica paga e confirmada. |

---

## 2. Edição com valor maior – inscrição já paga

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 2.1 | Inscrição já **paga** (R$ 100). Admin edita para categoria/kit que totalizem R$ 160. | Pré-visualização mostra diferença a cobrar (ex.: R$ 60 + taxa). |
| 2.2 | Salvar edição. | Inscrição continua com total atualizado (R$ 160 + taxa). **Segunda cobrança** criada apenas com o valor da diferença. Descrição "Complemento - Alteração da inscrição". |
| 2.3 | Corredor acessa Minhas Inscrições ou Visualizar Inscrição. | Botão "Pagar diferença" visível; ao clicar, exibe PIX da diferença. |
| 2.4 | Corredor paga a diferença via PIX. | Webhook confirma; soma dos pagamentos ≥ total; inscrição permanece paga. |

---

## 3. Edição com valor menor (reembolso manual)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 3.1 | Inscrição **paga** (R$ 200). Admin edita para categoria/kit que totalizem R$ 120. | Pré-visualização mostra "Diferença a reembolsar (manual)". |
| 3.2 | Salvar edição. | `total_amount` da inscrição atualizado para R$ 120 (+ taxa se aplicável). Registro em `registration_amount_adjustments` com tipo "reembolso pendente". **Nenhuma** nova cobrança criada. |
| 3.3 | Corredor acessa Minhas Inscrições. | Não deve aparecer "Pagar diferença". Inscrição segue como paga (valor pago ≥ novo total). |

---

## 4. Com lote (batch)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 4.1 | Categoria com **lotes** de preço. Admin edita inscrição e escolhe outra categoria que tem lotes. | Select "Lote" aparece; opção "Preço base da categoria" + lista de lotes com nome/preço. |
| 4.2 | Selecionar um lote e salvar. | Pré-visualização e total recalculados com o preço do lote. Após salvar, `category_batch_id` gravado e total correto. |
| 4.3 | Editar de novo e escolher "Preço base da categoria" (sem lote). | Total usa preço base da categoria. |

---

## 5. Taxa de atualização

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 5.1 | Configurar taxa de atualização R$ 10. Editar inscrição de R$ 80 para R$ 120. | Pré-visualização mostra "Taxa de atualização: R$ 10,00" e total final com taxa. |
| 5.2 | Editar inscrição trocando apenas modalidade, **sem mudar** categoria/kit (valor igual). | Taxa de atualização **não** deve aparecer (ou R$ 0); total não muda. |
| 5.3 | Taxa configurada em R$ 0. | Nenhuma taxa aplicada; totais sem acréscimo. |

---

## 6. Cupom

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 6.1 | Inscrição **com cupom** aplicado. Admin edita categoria/kit (valor muda). | Pré-visualização e recálculo **reutilizam** o mesmo cupom da inscrição. Desconto continua aplicado no novo total. |
| 6.2 | Salvar e verificar total. | Total após edição reflete desconto do cupom (e taxa de atualização se valor mudou). |

---

## 7. Desconto idoso (60+)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 7.1 | Módulo desconto idoso ativo; corredor 60+. Criar/editar inscrição. | Recálculo aplica 50% no subtotal (desconto idoso). Pré-visualização e total final consistentes. |

*(Executar apenas se o módulo estiver ativo no ambiente.)*

---

## 8. Admin confirma pagamento da diferença (manual)

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 8.1 | Inscrição com **diferença pendente** (2ª cobrança criada, não paga). Login como **admin**. | Em Admin > Inscrições, ao abrir a inscrição: bloco "Pagamento da diferença pendente" e botão "Confirmar pagamento recebido". |
| 8.2 | Clicar em "Confirmar pagamento recebido". | Modal pergunta se o corredor pagou a diferença e avisa que o PIX será invalidado. |
| 8.3 | Confirmar no modal. | Cobrança pendente marcada como paga (manual). PIX da diferença cancelado no Asaas. Inscrição atualizada para paga se soma ≥ total. |
| 8.4 | Login como **organizador** do evento. | **Não** deve aparecer o bloco "Pagamento da diferença pendente" nem o botão "Confirmar pagamento recebido". (Recurso apenas admin.) |

---

## 9. Regressão rápida

| # | Passo | Resultado esperado |
|---|--------|---------------------|
| 9.1 | Editar inscrição **sem** alterar categoria/kit/modalidade/lote (ex.: só status). | Nenhum recálculo de valor; nenhuma nova cobrança; nenhuma taxa de atualização. |
| 9.2 | Editar e alterar apenas modalidade (categoria/kit iguais, mesmo preço). | Taxa de atualização não aplicada; total inalterado. |
| 9.3 | Inscrição com diferença pendente: corredor paga pelo PIX. | Webhook confirma; inscrição fica paga. Admin não precisa "Confirmar pagamento recebido". |

---

*Documento de cenários alinhado ao plano em `PLANO_EDITAR_INSCRICAO_ALTERAR_VALOR_PAGAMENTO_DIFERENCA.md`.*
