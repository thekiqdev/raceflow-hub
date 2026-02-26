# Suporte: Edição de inscrição e alteração de valor

Documento para a equipe de suporte: quando o admin edita categoria/kit/modalidade/lote da inscrição e o valor muda, o que o sistema faz e como orientar o usuário.

---

## 1. Quando é criada uma 2ª cobrança (diferença a pagar)

- **Situação**: Admin alterou a inscrição (categoria, kit, modalidade ou lote) e o **novo total ficou maior** que o valor já pago.
- **O que o sistema faz**:
  - Se a inscrição **já tinha cobrança pendente** (PIX não pago): essa cobrança é **cancelada** no Asaas e é criada uma **nova cobrança** com o valor da diferença (novo total − já pago), incluindo a taxa de atualização quando houver.
  - Se a inscrição **já estava paga** (primeira cobrança paga): é criada uma **segunda cobrança** apenas com o valor da **diferença** (novo total − já pago), com descrição "Complemento - Alteração da inscrição".
- **Onde o corredor paga**: Em **Minhas Inscrições** ou na página **Visualizar Inscrição** aparece o botão **"Pagar diferença"**. Ao clicar, é exibido o QR Code PIX da cobrança pendente.
- **Taxa de atualização**: Configurável em **Configurações (admin) > Taxas**. Só é aplicada quando o valor da inscrição **muda** na edição (se trocar por opção de mesmo preço, não cobra taxa).

**O que informar ao usuário**:  
"A alteração da sua inscrição gerou um valor adicional de R$ X. Acesse **Minhas Inscrições**, abra sua inscrição e use o botão **Pagar diferença** para gerar o PIX e quitar o valor."

---

## 2. Quando a cobrança antiga é cancelada e uma nova é criada

- **Situação**: Inscrição com **pagamento ainda pendente** (corredor não pagou o PIX original). Admin edita e o valor muda (pode subir ou descer).
- **O que o sistema faz**:
  - A cobrança **pendente no Asaas é cancelada** (o PIX antigo deixa de valer).
  - É criada uma **nova cobrança** com o **novo total** (já incluindo taxa de atualização, se o valor tiver mudado).
- **Efeito**: O corredor deve usar o **novo** PIX (em Minhas Inscrições ou ao reabrir a inscrição). O PIX antigo não deve mais ser pago.

**O que informar ao usuário**:  
"O valor da sua inscrição foi atualizado. O PIX anterior não é mais válido. Acesse **Minhas Inscrições**, abra sua inscrição e utilize o novo QR Code PIX para pagar o valor atualizado."

---

## 3. Reembolso manual (valor diminuiu)

- **Situação**: Admin alterou a inscrição e o **novo total ficou menor** que o valor já pago (ex.: trocou para categoria mais barata).
- **O que o sistema faz**:
  - O **total da inscrição é atualizado** no sistema para o novo valor.
  - É registrado um ajuste do tipo **"reembolso manual pendente"** (tabela `registration_amount_adjustments`), para controle.
  - **Não** é gerado estorno automático pelo sistema: o reembolso deve ser feito **fora da plataforma** (transferência, dinheiro, etc.), conforme política do evento.
- **Quem faz o reembolso**: Organizador ou admin, pelos canais combinados com o corredor.

**O que informar ao usuário**:  
"Sua inscrição foi alterada e o novo valor é R$ X, menor que o já pago. O reembolso da diferença de R$ Y será feito conforme a política do evento (transferência, etc.). Entre em contato com o organizador se não receber em até [prazo definido pelo evento]."

---

## 4. Admin confirma que recebeu o pagamento da diferença (manual)

- **Situação**: Corredor pagou a diferença **em dinheiro ou transferência** (fora do PIX) e o admin quer marcar como recebido.
- **Onde**: Apenas **admin** (organizador **não** tem essa opção). Em **Admin > Inscrições**, abrir a inscrição. Se houver **"Pagamento da diferença pendente"**, aparece o botão **"Confirmar pagamento recebido"**.
- **O que o sistema faz**:
  - Marca a cobrança pendente como **paga manualmente** no banco.
  - **Invalida o PIX** da diferença no Asaas (para o corredor não pagar de novo pelo app).
  - Atualiza o status da inscrição para **pago** se a soma dos pagamentos já atingir o total.
- **Importante**: Só confirmar após **realmente** ter recebido o valor. A confirmação invalida o PIX da diferença.

**O que informar ao organizador**:  
"Se o atleta pagou a diferença diretamente a você (dinheiro/transferência), peça a um administrador para abrir a inscrição em Admin > Inscrições e clicar em **Confirmar pagamento recebido** no bloco 'Pagamento da diferença pendente'."

---

## 5. Resumo rápido

| Cenário | Ação do sistema | O que dizer ao usuário |
|--------|------------------|-------------------------|
| Edição aumenta o valor e inscrição **já paga** | Cria 2ª cobrança (diferença) | Pagar a diferença em Minhas Inscrições > "Pagar diferença" |
| Edição aumenta o valor e inscrição **pendente** | Cancela PIX antigo, cria nova cobrança com novo total | Usar o novo PIX em Minhas Inscrições |
| Edição **reduz** o valor | Atualiza total e registra "reembolso manual pendente" | Reembolso será feito manualmente pelo evento |
| Corredor pagou diferença em dinheiro/transferência | Admin confirma em Admin > Inscrições > "Confirmar pagamento recebido" | — |

---

*Documento alinhado ao plano em `PLANO_EDITAR_INSCRICAO_ALTERAR_VALOR_PAGAMENTO_DIFERENCA.md`.*
