# Etapa A — contratos e regressões para a evolução de UX

Data: 02/10/2026. Referência: [plano de evolução](plano-evolucao-ux-checkout-ingressos.md).

Este documento define a base das etapas B–E. As rotas e os campos identificados como propostos não estão disponíveis na API. Esta etapa acrescenta fixtures e testes de caracterização; não altera o comportamento de compra nem migra dados reais.

Atualização de 03/10/2026: as etapas B–D foram implementadas e validadas localmente; a pendência PostgreSQL da etapa B foi resolvida. `include_buyer` e `POST /api/checkout-orders/:id/buyer` preservam criação idempotente e retomada. A consulta única foi implementada parcialmente na E1, conforme seção específica abaixo; a matriz de ações e a adaptação de transferências continuam na E2. As seções originalmente propostas são o contrato alvo, não uma declaração de implementação integral.

## 1. Consumidores e limites atuais

### Entrada e edição da compra

- `EventDetails.tsx`: entradas desktop e mobile abrem `RegistrationFlow`.
- `RegistrationFlow.tsx`: escolhe fluxo legado ou grupo conforme sessão e flag. Preservar a entrada sem sessão durante a extração para página.
- `GroupRegistrationFlow.tsx`: apresentação e navegação; extrair o invólucro modal sem duplicar seu estado.
- `useGroupCheckout.ts`: criação/retomada por chave, versão, edição, salvamento, revisão, reserva e pagamento. Permanece como base do fluxo.
- `ParticipantIdentityForm.tsx` e API `/checkout-participants`: identificação do atleta; a existência de conta não autoriza revelar o perfil ao comprador.
- API `/checkout-orders`: proprietário é o comprador autenticado. Consulta de pagamento também pode conciliar estado; não tratá-la como leitura estática em cache.

### Ingressos e operação

- `MyRegistrations.tsx`: consulta inscrições do corredor, remove `order_id` e usa o card antigo. Também integra pendências de atributos, convites e diferenças financeiras.
- `CheckoutPurchases.tsx`: consulta `/checkout-delivery/mine` ou `/checkout-delivery/events/:id`; é consumidor tanto do corredor quanto do organizador.
- `CheckoutPurchasesPage.tsx`: entrada `/minhas-compras`; manter compatibilidade quando a tela principal for unificada.
- `CheckoutTicketPage.tsx`: detalhe autenticado ou acesso por token em `/ingresso`.
- `RegistrationQRCode.tsx` e `ValidateRegistration.tsx`: entradas históricas e comprovante/validação. Não remover links emitidos.
- `checkoutTicketDownload.ts`: PDF e QR novos; reutilizar com adaptação explícita de dados.
- `EventRegistrationsPanel.tsx`: consulta e ações operacionais. Não substituir por uma listagem pessoal que elimine retirada/devolução.

### Ações existentes e responsáveis

- Consultar ingresso de pedido: `authorizedTicket`; comprador, atleta atual ou administrador/organizador responsável; exige liberação atual.
- Consultar lista pessoal de pedidos: `listCheckoutTickets`; comprador OU atleta, com uma linha por inscrição. O papel administrativo, sozinho, não inclui eventos de terceiros na lista pessoal.
- Consulta operacional: `listCheckoutTickets(userId,eventId)` exige responsabilidade pelo evento ou administração.
- Reenvio: `checkoutDelivery.resend`; comprador/atleta recebe na própria conta. Permissão de gestão do evento não equivale a permissão de reenviar para o organizador.
- Retirada/devolução: `collectCheckoutKit` / `returnCheckoutKit`; somente gestão do evento, idempotência e regras de estoque próprias.
- Cancelamento do pedido: `checkoutPayments.cancel`; não equivale a reembolso individual.
- Reembolso pela rota `/checkout-orders/:id/refund`: exige administrador, mesmo que o serviço seja usado em testes com outros atores. Não inferir permissões HTTP a partir de chamada direta de serviço.
- Operações legadas: controllers em `registrations.ts`, protegidos por `orderRegistrationGuard`. O novo card não pode atravessar esse bloqueio para inscrições de pedido.

## 2. Contrato proposto da consulta única

Criar, na etapa E, `GET /api/tickets/mine`, autenticado e sem cache, fora do router legado que bloqueia pedidos. Não aceitar `user_id` para escolher outro proprietário. A consulta operacional continua em escopo próprio de evento, com permissão explícita.

Parâmetros propostos:

- `page`: inteiro a partir de 1; `page_size`: padrão 20, máximo 100.
- `relationship`: `all`, `runner` ou `buyer`; ambos os vínculos podem existir no mesmo registro.
- `status`: `all`, `active`, `pending`, `transferred`, `cancelled`, `refunded`.
- `event_id` e `order_id`: opcionais; restringem o conjunto autorizado, nunca ampliam acesso.
- `search`: texto limitado, por evento, nome autorizado ou código; não oferecer pesquisa global por CPF.

Resposta proposta: envelope existente `{success:true,data:{items,page,page_size,total,counts}}`.

Cada item deve conter:

- `registration_id`: chave estável de renderização, detalhe e ações. Nunca usar CPF ou `order_id` como chave do card.
- `source`: `legacy` ou `order`; `order_id`: identificador ou `null`.
- `relationship`: `{runner:boolean,buyer:boolean}`. Não duplicar se ambos forem verdadeiros.
- `event`: identificador, título, data, local e `banner_url` normalizada com o utilitário de arquivos existente; imagem ausente retorna `null`.
- `participant`: nome permitido e CPF mascarado, ou identificação restrita quando a regra de privacidade impedir a divulgação. Não incluir CPF completo, nascimento, contato nem respostas individuais na listagem.
- `selection`: rótulos de categoria, modalidade, lote, kit e variantes. Snapshot da compra para pedidos; adaptador legado para registros antigos.
- `state`: estado bruto da inscrição, pagamento, pedido quando houver, estado de exibição e grupo de filtro. Manter os dados originais; não gravar o estado de exibição no banco.
- `amounts`: moeda `BRL`, valor da inscrição em centavos, valores pagos/reembolsados quando conhecidos e diferença pendente quando aplicável. Valores históricos desconhecidos são `null`, não zero.
- `ticket`: `released` e disponibilidade de detalhe/download. QR e código completo pertencem ao detalhe autorizado; nunca liberá-los apenas porque o card está visível.
- `kit`: retirada/devolução quando suportadas, sem inventar timestamps para legado.
- `actions`: permissões calculadas no servidor para visualizar, baixar, transferir, cancelar, pagar, verificar, completar convite/atributos, reenviar, retirar e devolver. Cada ação informa `allowed`, `reason_code` e, quando permitida, identificador da operação conhecida pelo cliente.

As ações não serão URLs arbitrárias executadas pelo frontend. O cliente mapeia identificadores conhecidos para APIs existentes/adaptadas. Toda operação revalida permissão e estado no servidor; o card não é uma autorização persistente.

### Regras da consulta

1. Construir o conjunto autorizado a partir de `registrations`; usar junções/EXISTS que preservem uma linha por ID. Não fazer união de arrays paginados no navegador.
2. Para pedidos, considerar comprador do pedido ou atleta atual. Para legado, respeitar as regras de acesso existentes de titular e responsável pela inscrição; não ampliar acesso por parâmetro fornecido pelo cliente.
3. Resolver filtros, paginação e contagens sobre o mesmo conjunto. Ordenar por `created_at DESC, id DESC`; o desempate deve ser estável.
4. `counts` representa os grupos de estado após autorização, busca, relação e evento/pedido, antes do filtro `status`; `total` representa a lista já filtrada por estado.
5. Classificar primeiro reembolso, depois histórico transferido, cancelamento/expiração, pendências e ativo. Distinguir transferência legada em que a linha continua representando o titular atual da casca histórica que aponta para outra inscrição.
6. Compra paga em revisão não libera ingresso. `active` não deve se tornar sinônimo isolado de `payment_status=paid`; adaptar convites e estados legados conforme seus serviços.
7. Valores de `snapshot.pricing` atuais estão em reais; alocações e `order.total_cents` estão em centavos. Normalizar uma vez na fronteira da consulta e testar arredondamento. Nunca atribuir o total do pedido a cada atleta.
8. Antes de eventual vínculo de convidado, reaproveitar a comprovação de CPF/nascimento existente. Após vínculo, consultar a mesma inscrição; não criar outro ingresso ou replicar estoque.
9. Listagem pessoal não inclui ingressos de terceiros apenas porque o usuário é organizador/admin. A tela operacional exige escopo explícito.

## 3. Contrato de entrada do comprador na etapa B

Reaproveitar criação idempotente de pedido por `request_key`. A inclusão automática do comprador deve ocorrer atomicamente no caminho de criação nova, com opção explícita de inicialização da própria inscrição; uma repetição da chave apenas retorna o pedido existente.

- Não implementar inclusão automática no `GET`, na hidratação ou em efeito que rode sempre que `items.length === 0`.
- Uma chave antiga, mesmo com rascunho vazio, não dispara inclusão. Isso preserva rascunhos antigos e a remoção voluntária do comprador.
- O servidor usa exclusivamente a identidade do usuário autenticado para a opção “Sua inscrição”; não recebe outro `user_id` como se fosse o comprador.
- Reaproveitar o domínio de participantes. Perfil incompleto ou inscrição já existente gera orientação estruturada, sem impedir compra para terceiros.
- Expor ao próprio comprador somente os dados necessários à sua ficha. Não enfraquecer o contrato de consulta de CPF de terceiros para viabilizar autopreenchimento.
- Duplicidade continua validada por identidade/evento na reserva. A interface não substitui essa verificação.

Na mesma transação da criação, registrar o resultado da inicialização no pedido ou em metadado aditivo se necessário. A decisão de persistência será tomada na etapa B conforme o modelo existente; apenas `sessionStorage` não é prova suficiente de que a inicialização já aconteceu.

## 4. Estados de preenchimento para a etapa C

Separar três dimensões, sem persistir um novo “concluído” independente:

- Preenchimento: não iniciado, incompleto, escolhas completas ou precisa revisar.
- Salvamento: limpo, alterado, salvando ou falhou.
- Pedido: rascunho, revisado, reservado, aguardando pagamento, confirmado, em revisão, expirado, cancelado ou reembolsado.

Prioridade de exibição: identidade/erro do servidor que exija intervenção → escolhas ausentes/inválidas → salvamento pendente/falho → escolhas completas salvas. O indicador de confirmação de ingresso continua derivado dos estados financeiros.

`choiceProblems` é ponto de partida da validação local. Regras de idade/sexo, reservas concorrentes e revisão financeira continuam no servidor. Respostas obrigatórias só entram no indicador após confirmar suporte no catálogo e validação de backend.

## 5. Desenho de transferência de pedidos para a etapa E

### Caminhos legados identificados

- `createTransferRequestController`: proprietário/titular ou administrador, módulo, evento e prazo; cria solicitação e usa taxa configurada.
- `getTransferRequestByIdController`: consulta ao provedor pode finalizar transferência.
- `updateTransferRequestController`: conclusão administrativa também finaliza.
- `asaasWebhookController`: confirmação assíncrona de pagamento pode finalizar.
- `transferRegistration`: altera titular na mesma linha, com tratamento legado dos estados.
- `performAdminRegistrationSplitTransfer`: cria inscrição de destino, mantém original como histórico e reposiciona referências financeiras legadas.

Os quatro pontos de conclusão devem chamar uma operação de domínio idempotente que escolha explicitamente entre legado e pedido. Não duplicar o algoritmo em cada controller nem inserir um `set_config` isolado para liberar o método antigo.

### Decisão técnica proposta

Para **pedidos**, preservar `registration_id`, item e alocação financeira e registrar a troca em histórico próprio de titularidade. Evita mover uma alocação já conciliada para outra inscrição. Manter os dois comportamentos legados para inscrições sem pedido, inclusive split administrativo; não converter o histórico antigo.

Requisitos da operação de pedido:

1. Trancar pedido e inscrição em ordem consistente; revalidar pagamento, revisão/reembolso em andamento, prazo, categoria e duplicidade do novo atleta no evento.
2. Registrar chave idempotente da transferência e versão do titular, com titular anterior/novo, solicitante, motivo e confirmação financeira da taxa quando houver.
3. Manter snapshot original da compra imutável. Criar representação explícita da identidade atual para detalhe, entrega, vínculo futuro e consulta operacional; não continuar lendo `snapshot.identity` como titular atual após transferência.
4. Atualizar a identidade canônica da inscrição e verificar conflitos de CPF na mesma transação. Vínculo posterior deve usar a identidade atual, não a identidade original da compra.
5. Preservar escolhas/valores/estoque; não copiar novamente produtos. Se o novo atleta não for elegível às escolhas existentes, rejeitar com motivo. Alteração de categoria ou cobrança de diferença é outro fluxo, não efeito silencioso da transferência.
6. Preservar receita da compra e comissão já apurada; taxa de transferência tem lançamento próprio, sem se confundir com o valor do ingresso. Reembolso posterior referencia a mesma alocação original.
7. Rotacionar código/acesso apenas do ingresso transferido e revogar tokens anteriores por versão. Tokens antigos sem versão só podem continuar válidos para inscrições ainda não transferidas. Não regenerar códigos de ingressos sem mudança.
8. Publicar efeitos de entrega após confirmação da transação, usando fila idempotente. Mensagens pendentes da titularidade antiga não podem entregar um acesso atual indevido.
9. Preservar registro de retirada e devolução física. Transferência não devolve kit ao estoque nem libera segunda retirada.
10. Antigo atleta perde acesso como titular. Se também for comprador, tratar explicitamente o acesso que permanece por essa relação; não confundir histórico financeiro com papel de atleta atual.

Atualização em 04/10/2026: núcleo e workflow de transferência conectados no backend. Migrações aditivas 123/124 testadas somente em banco descartável. A E3 ainda conectará a ação no card reaproveitado; a E4 verificará os consumidores e a F homologará o provedor real.

Contrato implementado para pedidos:

- `POST /api/checkout-transfers/tickets/:id/requests`: `request_key` UUID, CPF e/ou e-mail do destino, motivo opcional. Taxa e versão vêm exclusivamente do servidor. A mesma chave e conteúdo recuperam a mesma solicitação, inclusive após o solicitante deixar de ser titular. Nova chave não cria uma segunda solicitação ativa para a mesma versão.
- `GET /api/checkout-transfers/requests/:id`: consulta e concilia. `POST .../:id/payment`, com corpo vazio, inicia ou recupera a cobrança existente. Resposta inclui solicitação e `payment` com status, valor, link do provedor e eventual pendência. Nenhum código de acesso atual é retornado nessa consulta histórica.
- `PATCH /api/checkout-transfers/requests/:id`: decisão administrativa estrita (`approved`, `rejected`, `cancelled`), observação e destinatário opcional. A aprovação mantém a exceção existente de conclusão sem taxa paga. Falha de elegibilidade reverte a decisão inteira. Cobrança iniciada exige tratamento financeiro antes de rejeitar/cancelar, para não abandonar dinheiro cobrado.
- Controllers existentes de consulta/pagamento/aprovação identificam solicitações de pedidos e delegam ao workflow. Webhook autenticado também delega antes dos efeitos legados. Criação de pedidos continua bloqueada na entrada legada: usar a rota própria acima.
- Destino inexistente pode ter solicitação pendente, mas deve completar o cadastro antes da cobrança/conclusão. Com taxa zero e destino válido, a criação conclui sem provedor. CPF/e-mail divergentes, categoria incompatível e inscrição duplicada são rejeitados antes da cobrança; validações são repetidas na conclusão.
- Taxa Pix usa lançamento próprio, sem alterar o preço do ingresso ou sua alocação. Estado `creating` é persistido antes do POST. Resposta incerta é recuperada por referência, nunca por outro POST automático. Consulta/callback confirmam ID, cliente, referência, método e valor no provedor; não confiam no status enviado pelo navegador ou webhook.
- Conciliação periódica retoma tentativas pendentes e taxas pagas cuja conclusão ficou bloqueada. Se o ingresso for reembolsado ou deixar de ser elegível antes da confirmação, o pagamento permanece registrado com pendência e não libera a transferência. Divergências e múltiplas cobranças ficam em revisão, sem novo débito nem estorno automático. Tratamento financeiro manual/homologação permanece necessário nesses casos.

### Política confirmada para transferência de pedidos — 03/10/2026

O usuário determinou preservar a regra existente, inclusive a taxa, após investigação do código. Não será acrescentado aceite do atleta nem uma nova política de autorização. A regra de `createTransferRequestController` permite titular (`runner_id`), responsável (`registered_by`) ou administrador. Para pedidos, o responsável deverá ser validado contra o comprador canônico do pedido, sem ampliar acesso por parâmetros de cliente.

Evidências da investigação:

- `backend/src/controllers/transferRequestController.ts`: módulo global habilitado e evento com transferências permitidas; prazo `transfer_until` é aplicado ao usuário comum, com exceção explícita para administrador. Taxa lida de `system_settings.transfer_fee`, não de um valor fixo no componente. O valor é gravado na solicitação.
- `generateTransferPaymentController`: somente solicitante ou administrador; taxa positiva; Pix separado no Asaas, referência `TRANSFER-<id>`, vencimento em três dias; rejeita gerar se a solicitação já possui `asaas_payment_id`. Não houve consulta ao valor configurado no banco real nem cobrança nesta investigação.
- `getTransferRequestByIdController`: ao receber `CONFIRMED`/`RECEIVED`, marca taxa paga, procura destinatário e chama `transferRegistration(..., {finalizeRunnerTransfer:true})`, depois marca a solicitação concluída. O webhook e a aprovação administrativa também são caminhos de conclusão; precisam convergir no adaptador de pedidos.
- `registrationsService.transferRegistration`: altera o titular na mesma inscrição, marca `status='transferred'` e, na finalização pública, `payment_status='transferred'`; envia notificações. Esse comportamento não pode ser aplicado literalmente a pedidos, cujo pagamento e liberação são derivados do pedido e da alocação.
- A interface legada restringe o botão a evento futuro, status confirmado e pagamento pago/convidado; essas condições não estão todas repetidas no controller de criação. A aprovação administrativa possui caminho próprio, não condicionado ali à taxa paga. Registrar essas diferenças evita confundir regra de exibição com autorização financeira.
- Taxa zero: a criação insere solicitação pendente; a mensagem do frontend sugere conclusão, mas a criação por si só não troca o titular. A adaptação deve tratar esse caso explicitamente e testar o caminho administrativo, sem declarar que a transferência gratuita já é automática.

A proteção `orderRegistrationGuard` permanece sobre mutações legadas. O backend de transferência de pedidos foi adaptado ao histórico, à preservação financeira/estoque, à revogação dos acessos antigos e à entrega idempotente. A interface E3 deve usar a rota própria, sem remover essa proteção.

### Consulta E1 implementada — 03/10/2026

`GET /api/tickets/mine` agora existe, autenticado e `Cache-Control: no-store`, com filtros estritos do contrato. Usa uma consulta SQL para autorização, classificação, filtros, paginação, contagem e ordenação estável. A lista não vincula identidades nem consulta gateway; reaproveita vínculos já persistidos. Não há união de listas no navegador.

O acesso legado reproduz a lista pessoal anterior: titular ou responsável no histórico transferido. O relacionamento `buyer` filtra esse conjunto autorizado; não libera todas as inscrições de terceiros cadastradas pelo usuário. Para pedidos, permite comprador ou atleta atual, uma vez por inscrição. Administrador/organizador não ganham acesso pessoal apenas pelo papel.

Entregues campos de origem, relação, evento/imagem, identidade restrita/mascarada, seleção, estados originais e grupo de filtro, valores individuais e retirada/devolução quando conhecidos. Busca usa somente nome visível, evento e código de registro ativo; o código não é devolvido na lista. Valores desconhecidos permanecem `null`.

**Limite original da E1:** a consulta foi entregue inicialmente sem adaptação visual, diferenças ou indicadores legados. Na E3 (04/10), a lista passou a consumi-la: indicadores de liberação são booleanos, `legacy` projeta somente identificadores/valores necessários às ações existentes e `transfer` informa pendência e referência da solicitação apenas ao solicitante. Variantes legadas e timestamps desconhecidos permanecem `null`; detalhes continuam nos endpoints existentes. A matriz geral `actions` segue como contrato alvo da revisão E4, sem substituir a autorização no servidor. Não há migração de inscrições.

### Consumo E3 implementado — 04/10/2026

- `MyRegistrations` usa apenas `/tickets/mine` para montar, contar, buscar, filtrar e paginar a lista pessoal. Não concatena uma segunda lista de pedidos. `RegistrationCard` foi extraído do card antigo; foto do evento, convites, diferenças, Pix, confirmação e cancelamento legados são preservados.
- Filtros: todas, ativas, pendentes, transferidas, canceladas e reembolsadas. `subtab=cancelled` antigo continua abrindo transferidas, preservando o link histórico; novos controles têm rótulos explícitos. Respostas fora de ordem não sobrescrevem filtros mais recentes. Erros oferecem repetição e não são exibidos como lista vazia.
- A foto pode faltar sem impedir a leitura. Participante/CPF mascarado e relação com a compra distinguem ingressos do mesmo evento. Total desconhecido aparece como “Valor não informado”. Controles principais têm área de toque de pelo menos 44 px.
- Pedidos usam APIs próprias para detalhe, PDF, reenvio e transferência; nenhuma dessas ações chama mutação legada. O download individual e conjunto consulta novamente os ingressos liberados. Detalhes do pedido ficam recolhidos dentro do card, sem outra listagem.
- Download legado reaproveita o gerador de PDF, consulta `/registrations/:id` e verifica titularidade, estado/pagamento, origem e código antes de emitir. Não usa o endpoint antigo `/receipt`, que termina sem resposta no controller atual; a revisão E4 deve tratar esse consumidor separadamente. Nenhum ingresso inválido é liberado pelo estado antigo do card.
- Transferência de pedido possui formulário recuperável por chave, consulta da taxa, Pix no provedor e distinção entre taxa paga e transferência concluída. Perda de resposta mantém a chave/dados; rejeição HTTP conhecida permite corrigir a entrada. Reabrir permite acompanhar a solicitação existente; estado `creating` apenas consulta, sem gerar outra cobrança.
- `/minhas-compras` redireciona à rota pessoal única. Essa rota aceita qualquer usuário autenticado e o backend mantém o escopo comprador/atleta. Para quem não tem papel de corredor, há retorno à conta correspondente. As demais áreas do corredor continuam exigindo seu papel.
- `?pedido=` na página de compra retoma uma referência específica, sem criar pedido novo; o hook verifica se o pedido pertence ao evento exibido. Autorização do comprador permanece no servidor.
- `CheckoutPurchases` permanece no painel operacional e nas fixtures de compatibilidade. Retirada/devolução não foram movidas para a lista pessoal. E4 ainda revisará os demais consumidores/links legados; F fará homologação de pagamentos/mensagens reais.

## 6. Base de regressão desta etapa

Fixtures sintéticas: `backend/tests/fixtures/checkoutUxLegacy.sql`, executadas somente pela suíte de entrega no PostgreSQL descartável `cronoteam_stage7_test`. Contêm inscrição paga, pendente, histórico transferido e convite gratuito, cada uma em evento separado.

Novos testes em `backend/tests/checkoutDelivery.test.ts`, identificados por `UX A`:

- Conta só com legadas e depois mista: consulta atual de pedidos não altera linhas legadas nem estoque. A separação atual é caracterizada; não está sendo validada como objetivo da futura tela única.
- Comprador também atleta: vínculo não duplica lista, código ou alocações.
- Guard legado: pedidos bloqueados por ID de rota e `registration_id` do corpo; inscrições antigas continuam passando pelo guard sem mutação.
- Privacidade: comprador não recebe nome/CPF/respostas de conta de terceiro antes da confirmação; o atleta vê os próprios dados, mas não recebe ingresso liberado antes do pagamento.
- Operador/admin: acesso por evento separado da lista pessoal.
- Retomada: repetir chave não sobrescreve escolhas nem reinclui participante removido de rascunho vazio.

A suíte existente complementa convidados com/sem e-mail, vínculo comprovado, destinatários, escopo, tokens, estornos, comissões, retirada/devolução e entrega idempotente. Os testes do guard usam um harness; não são testes completos dos controllers legados ou de transferência. O endpoint unificado, a nova transferência e a nova UX ainda precisam de seus próprios testes nas etapas correspondentes.

Execução: `npm run test:checkout-delivery`, com `DELIVERY_TEST_DATABASE_URL` apontando para o banco descartável exigido pela suíte. Ela recusa outro nome/host e exige schema vazio antes de criar fixtures. Nunca apontar para banco da aplicação.

Resultado em 02/10/2026: **31/31 testes de entrega aprovados**, incluindo os seis novos; **6/6 testes de `test:group-checkout-model` aprovados**. Execução em PostgreSQL 17 temporário, sem volumes da aplicação, com provedores simulados. Nenhuma compra, mensagem ou migração real foi executada.

## 7. Passagem para a etapa B

- Contratos de leitura, ações, dinheiro, privacidade e conclusão definidos para orientar os componentes.
- Caminhos de transferência mapeados; desenho de pedidos definido, com decisão de autoridade do comprador explícita e pendente antes de habilitá-lo.
- Nenhuma remoção de componentes, migração de ingressos, ativação de entrega ou mudança de API pública nesta etapa.
- Próxima entrega: página dedicada e prioridade da inscrição do comprador, com retomada idempotente e retorno após autenticação.


### Atualização E4a — links antigos e comprovantes (04/10/2026)

- Links de inscrição em grupo pela rota legada retornam `ORDER_REGISTRATION_REQUIRED`; as páginas antigas encaminham ao detalhe protegido `/ingresso?id=...`. O guard continua bloqueando leituras/mutações legadas de pedidos.
- O comprovante legado agora responde, verifica titular atual/admin/organizador do evento e validade antes de liberar seus dados. A lista e a página de QR reutilizam o gerador PDF com consulta nova a cada download. Antigo titular, inscrição substituída, cancelada ou sem pagamento confirmado não recebe um novo ingresso.
- A validação pública legada informa `ticket_available` para distinguir transferência ativa de inscrição substituída; seu conjunto de dados públicos não foi ampliado com dados de pedidos.
- Validação local: 75 testes de integração, teste adicional de validade pública, 147 verificações de navegador e checagens de tipos aprovados. Banco da aplicação e serviços externos não utilizados.
- E4 permanece em andamento: falta revisão operacional completa de organizador/admin e regressões de convites, atributos e diferenças.
