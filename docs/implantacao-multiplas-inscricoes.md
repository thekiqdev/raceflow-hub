# Implantação de múltiplas inscrições — etapas e acompanhamento

Início: 01/10/2026. Especificação: [plano-compra-multiplas-inscricoes.md](plano-compra-multiplas-inscricoes.md).

## Ordem das entregas

1. **Preço e lote confiáveis.** Calcular valores no servidor, validar lote/cupom, alinhar resumo e impedir cobrança de valor diferente sem revisão. Implementada localmente nesta entrega.
2. **Gravação e estoque consistentes.** Gravar inscrição, escolhas e reservas com transação; proteger última unidade, consumo do cupom e duplicidades concorrentes. Implementada localmente; migração 118 validada em banco descartável, pendente no banco da aplicação.
3. **Participantes com ou sem conta.** Serviços, migração, contrato de API e formulário de identificação implementados localmente. Integração ao checkout depende das etapas 4–6; migração 119 pendente no banco da aplicação.
4. **Pedido com várias inscrições.** API de rascunho, revisão, fotografia de preços e reserva conjunta implementada localmente. Migração 120 pendente; ativação desabilitada por padrão.
5. **Pagamento único e confirmação.** Núcleo implementado localmente: cobrança, tentativas persistentes, conciliação, alocação financeira e estornos por ingresso. Migração 121 pendente; integração real ao Asaas ainda exige homologação.
6. **Nova tela desktop/mobile.** Implementada localmente, integrada por flag ao fluxo do evento. Participantes, escolhas individuais, cópia seletiva, revisão, pagamento e retomada validados em navegador com APIs simuladas.
7. **Ingressos, notificações e cadastro posterior.** Implementada localmente: fila de entrega, mensagens por destinatário, vínculo por CPF/nascimento validados, comissões, acesso e PDFs, retirada e devolução de kits. Migração 122 e ativação do envio pendentes no ambiente real.
8. **Homologação e publicação gradual.** Validar operação completa, compatibilidade, migrações e monitoramento antes de ampliar aos eventos. Pendente.

O padrão público dos novos corredores foi preparado anteriormente. A migração 117 para perfis existentes está criada e registrada, mas ainda não foi executada no banco nesta sessão.

## Etapa 1 — preço e lote confiáveis

### Implementado localmente

- O checkout público recalcula o valor com base em categoria, lote, kit, desconto por idade, cupom e taxa da plataforma.
- O total informado pelo navegador serve apenas para conferir o valor que o comprador revisou. Não define quanto será gravado ou cobrado.
- Havendo diferença, a API responde com conflito de preço antes de criar inscrição/pagamento. A interface volta à revisão com os componentes atualizados e exige nova confirmação.
- Lote enviado deve pertencer à categoria e estar vigente. Se houver lote vigente, não é permitido omiti-lo para comprar pelo preço base.
- Lote sem preço positivo pode ser gratuito: valor zero não é substituído pelo preço da categoria.
- O lote escolhido é enviado nos caminhos Pix e cartão e salvo em `registrations.category_batch_id`, coluna da migração 083 já existente.
- Cupom inválido bloqueia o checkout público, inclusive quando a inscrição resultaria gratuita. A segunda validação na criação também não pode remover silenciosamente um cupom inválido mantendo o desconto.
- Cupom percentual na interface passa a incidir após desconto por idade, alinhado ao calculador do servidor. Valores e taxas são arredondados em centavos.
- O recálculo administrativo mantém a possibilidade de usar lote histórico; a exigência de vigência é aplicada ao checkout público.

### Verificação

- `npm run test:registration-pricing` no backend: 15 testes aprovados, com leituras de banco simuladas e sem comunicação com Asaas.
- `npm run type-check` no backend: aprovado.
- `npm run build` no frontend: aprovado; avisos de tamanho de pacote e dependências do build não impedem a compilação.
- Testes cobrem alteração de valor, lote gratuito, lote omitido/inválido, categoria/kit de outro evento, cupons inválidos, combinação de descontos, taxa mínima e arredondamento.

### Limites desta entrega

- Não foi realizada compra real, homologação visual completa ou migração no banco. Publicação exige backend e frontend compatíveis: clientes antigos não enviam o lote.
- Validação concorrente de estoque e cupom, transação integral e preço protegido contra alterações durante o fechamento pertencem à etapa 2.
- A primeira etapa usa a regra já existente no calculador do servidor para acumular desconto por idade e cupom. A política comercial do pedido em grupo ainda precisa ser consolidada.
- Nenhuma interface de múltiplos participantes está habilitada nesta entrega.

## Etapa 2 — gravação e estoque consistentes

- [x] Definir uma transação para inscrição, produtos/variantes, campos personalizados e consumo de cupom.
- [x] Validar todos os produtos exigidos pelo kit e resolver variante canônica antes da gravação.
- [x] Reutilizar a política de consumo por estado e garantir que confirmação não faça uma segunda baixa.
- [x] Verificar escopo do estoque da variante e alinhar caminhos público, staff, líder, convite e edição.
- [x] Proteger capacidade e última unidade com bloqueio/controle concorrente consistente.
- [x] Rejeitar criação duplicada de atleta/evento, inclusive em reenvios concorrentes; preservar bônus não atribuídos e transferência split. Recuperação idempotente do pedido/pagamento permanece nas etapas 4–5.
- [x] Revalidar preços e limites dentro do fechamento protegido; impedir uso concorrente acima do limite do cupom.
- [x] Validar rollback em falha de escolha, campos personalizados e concorrência de duas compras.

Aceite: falha não deixa inscrição parcial; duas compras não consomem a mesma última unidade; confirmar/cancelar repetidamente não duplica baixa/devolução.

### Implementado localmente

- Criação da inscrição usa uma única conexão/transação, incluindo cupom, escolhas e campos personalizados. Erros deixam o conjunto sem alterações parciais. A tentativa de notificação de convite e as comissões ficam depois do fechamento.
- A admissão serializa inscrições por evento; preços de catálogo são relidos sob bloqueio e o cupom é bloqueado também quando utilizado em eventos diferentes do mesmo organizador.
- O resolvedor de escolhas confere evento, kit, produto e variante; resolve combinações completas de atributos e rejeita escolhas contraditórias ou produtos obrigatórios ausentes. Sempre grava a referência da variante para a contagem de estoque.
- Completar atributos, completar convite, enviar convite com escolhas e editar kit passam a preservar dados antigos em caso de falha. Público, staff e criação por líder reutilizam o serviço central de criação.
- A migração `118_registration_inventory_guards.sql` adiciona verificações diferidas ao final da transação. Elas também protegem gravações SQL de estoque, capacidade e duplicidade. Slots `free_bonus` ainda não atribuídos podem coexistir com a inscrição do líder; convites atribuídos não podem duplicar o corredor no evento.
- Estoque permanece derivado por inscrição, e não por quantidade de atributos: pendente, confirmada, reembolso solicitado e transferência legada consomem; cancelada, reembolsada e origem de transferência split não consomem. Confirmar não desconta novamente. Quantidade `NULL` continua ilimitada.
- O formulário público agora mantém uma escolha por produto. Pix, cartão, resumo e PDF incluem todos os produtos escolhidos. Mudar um atributo limpa a combinação anterior até que a nova esteja completa.

### Verificação

- `npm run test:registration-integrity`: **18 testes aprovados** em PostgreSQL 17 descartável, com fixture mínima e a migração 118 real. Sem uso do banco da aplicação, dados reais, e-mails ou Asaas.
- Cenários: última unidade concorrente, concorrência por último uso de cupom entre eventos, duplicidade de atleta, atribuição concorrente de convites, rollback de inscrição/cupom/seleções, rollback do envio de convite, revisão de preço, múltiplos produtos, edição rejeitada, capacidade, confirmação/cancelamento repetidos e transferência split.
- Os testes de escritores SQL sincronizam as duas transações antes do COMMIT para verificar conflito real, sem depender de execução sequencial acidental.
- Regressão: 15 testes de preços, 5 de CPF dos convites e 3 de concessão de bônus aprovados.
- TypeScript do backend e build do frontend aprovados. O build mantém avisos de tamanho de pacote e dependências já presentes.

### Execução dos testes de integração

Criar um PostgreSQL descartável e vazio, acessível em `127.0.0.1`, com banco chamado `cronoteam_stage2_test`. Definir `REGISTRATION_TEST_DATABASE_URL` com a conexão desse contêiner e executar `npm run test:registration-integrity` no backend. A suíte rejeita outro nome/host, recusa uma instalação existente de `registrations`, cria a fixture e remove seu schema ao terminar. Nunca apontar para banco da aplicação.

### Publicação e limites

- As migrações **117 e 118 não foram aplicadas ao banco da aplicação**. A proteção de gravações SQL diretas depende da 118; publicar junto com o backend compatível.
- Antes de aplicá-la, auditar duplicidades, seleções sem variante ou pertencentes a outro kit e estoque/capacidade já excedidos. A migração não repara o histórico automaticamente; inconsistências antigas podem impedir atualizações até serem corrigidas.
- Bônus continuam fora da cota paga de categoria/modalidade, preservando a exceção operacional. A política comercial de capacidade total do evento deve ser revisada antes dos pedidos em grupo.
- Os testes usam schema mínimo, não uma cópia integral do ambiente. Homologação visual, compra real, falhas do gateway, entrega de e-mail, auditoria histórica e carga permanecem na etapa 8.
- Ainda não há reserva conjunta de pedido, expiração automática nova, chave idempotente de pagamento nem fila de notificações. Essas entregas continuam nas etapas 4, 5 e 7.

## Etapa 3 — identificação dos participantes

- [x] Introduzir rascunho de participante sem conta, sem usar dados do comprador como titular nem criar e-mail fictício.
- [x] Consultar existência por CPF retornando somente existência; usar referência opaca do participante na identificação.
- [x] Resolver CPF cadastrado internamente para a conta existente, sem retornar o ID do perfil. O pedido consumirá essa resolução na etapa 4.
- [x] Para CPF sem conta, conferir nascimento e preencher dados pela API; tratar entrada manual e falha técnica separadamente.
- [x] Preparar formulário com e-mail opcional e “Usar minha conta para acompanhar este ingresso”, para integração ao novo fluxo.
- [x] Tratar CPF repetido e conta criada durante o fluxo sem duplicação.

Aceite: participantes com e sem conta avançam; ausência de e-mail é aceita; dados de contas existentes não são expostos pela consulta.

### Implementado localmente

- Migração `119_checkout_participants.sql`: rascunhos privados por comprador/evento/CPF, separados de usuários e inscrições. Não cria login, senha, e-mail fictício, cobrança nem reserva. O CPF não pode se repetir no mesmo escopo.
- Identificação válida por 24 horas; referências expiradas exigem nova identificação. A expiração invalida o uso, mas a rotina de eliminação física/retenção de rascunhos ainda deve ser definida antes da publicação.
- `POST /api/checkout-participants/check-cpf`: aceita CPF e retorna somente `{ registered }`, inclusive para conta privada.
- `POST /api/checkout-participants`: recebe `event_id`, CPF e, para quem não tem conta, nascimento. Retorna referência do participante; campos de conta existente nunca são retornados. Para novos participantes, dados do provedor só são retornados após conferir CPF/nascimento.
- `GET /api/checkout-participants/:id` e `PATCH /api/checkout-participants/:id`: acesso exclusivo do comprador autenticado. O PATCH completa nome/sexo declarados quando permitidos e escolhe acompanhamento pelo comprador ou e-mail. Não aceita troca de CPF, nascimento, conta ou evento.
- Falha técnica do provedor retorna indisponibilidade; somente `EXTERNAL_NOT_FOUND` permite cadastro manual no fluxo de participantes. Essa regra atende a decisão deste plano e não altera a flag do cadastro tradicional.
- Nome e sexo conferidos na API não podem ser substituídos pelo navegador; sexo ausente pode ser declarado. Nome completo, nascimento válido e sexo são necessários para concluir um participante novo.
- `POST /api/checkout-participants/:id/eligibility`: confere requisitos da categoria internamente e retorna apenas elegibilidade/mensagem genérica. Não revela sexo, idade ou nascimento de contas existentes. A referência temporal continua sendo a idade atual; mudança da regra comercial para idade na data do evento exige alinhamento com o fluxo legado.
- O resolvedor interno para o futuro pedido reconsulta contas, evento e inscrição ativa. Conta criada durante a consulta ou antes do fechamento é reutilizada; contatos existentes não são sobrescritos. O resolvedor do grupo rejeita participantes repetidos e mantém a ordem recebida.
- `ParticipantIdentityForm.tsx` e `src/lib/api/checkoutParticipants.ts`: formulário e cliente preparados, com tratamento de respostas atrasadas após troca de CPF, opção de acompanhamento pelo comprador, e-mail e complemento manual.
- As rotas exigem autenticação, usam o limitador de consulta de CPF e respostas sem cache. Ajustados os temporizadores de limpeza do limitador para não manterem processos de testes abertos após finalizar.

### Verificação e limites

- **18 testes de integração aprovados**, com migração 119 em PostgreSQL 17 descartável e provedor de CPF simulado. Incluem HTTP autenticado, resposta mínima de conta privada, isolamento entre compradores, dados bloqueados, nascimento divergente/impossível, e-mail opcional, erro técnico, expiração e concorrência.
- Verificação de tipos do backend aprovada; regressões de CPF: 2 testes de validação e 6 de fallback manual aprovados.
- Para executar: definir `PARTICIPANTS_TEST_DATABASE_URL` apontando para PostgreSQL local descartável, vazio, com banco `cronoteam_stage3_test`, e rodar `npm run test:checkout-participants` no backend. A suíte cria e remove apenas seu schema nesse banco e recusa instalação existente de usuários.
- Build do frontend e verificação isolada de tipos do novo formulário aprovados. A verificação completa `tsc -p tsconfig.app.json` encontrou erros fora dos novos arquivos, incluindo telas administrativas; não foi considerada aprovada.
- O formulário está pronto para integração, **ainda não está montado no checkout atual**. Substituir a identificação antiga depende do pedido aceitar participantes sem `runner_id`, na etapa 4, e da integração da tela na etapa 6.
- Ainda não cria ingresso para participante sem conta, não envia e-mail e não vincula ingresso ao login posterior: etapas 4, 5 e 7. O e-mail guardado é contato de entrega, nunca prova de identidade para vincular uma conta.
- A migração 119 não foi aplicada ao banco da aplicação. Não houve consulta real de CPF nem publicação nesta entrega.

## Etapa 4 — pedido e inscrições individuais

- [x] Criar modelo de pedido, itens, comprador, vínculo de participante e fotografia de escolhas/preços.
- [x] Preservar uma inscrição/código por atleta, com consulta autenticada do comprador ao conjunto.
- [x] Implementar rascunho, revisão, inclusão/edição/remoção e validade de reserva na API.
- [x] Validar demanda total de vagas e variantes no grupo.
- [x] Aplicar taxas/cupons por item, preservando a regra de inscrição individual, e somar o total em centavos.

Aceite: pedido de vários participantes fecha integralmente ou retorna erros localizados, sem subconjunto cobrável involuntário.

### Implementado localmente

- Migração `120_checkout_orders.sql`: tabelas `checkout_orders` e `checkout_order_items`, referência do pedido e CPF do participante na inscrição. `runner_id` pode ser nulo somente quando a inscrição está vinculada a pedido e possui CPF; os dados do atleta ficam na fotografia interna do item, sem criar conta fictícia.
- Um evento por pedido, até 20 participantes. O comprador não precisa ser atleta. A consulta do pedido só permite acesso ao comprador e não retorna nome, nascimento, sexo, e-mail ou ID de perfil de contas existentes.
- Criação por `request_key` UUID é idempotente no escopo do comprador. Edições e revisão usam `version`; uma versão antiga não sobrescreve outra. Inclusão/remoção/edição salva a lista e invalida valores anteriormente revisados.
- Revisão de 15 minutos: confere participantes, elegibilidade, período do evento, categoria/modalidade, lote, kit visível e vinculado à categoria, variantes e campos personalizados. Grava fotografia interna da identidade, escolhas, nomes de categoria/modalidade/kit/lote/produtos/variantes e componentes de preço.
- Categoria, perfil, catálogo e cupom são relidos sob bloqueio. Alteração de preço, dados ou escolhas entre revisão e reserva exige nova revisão.
- Taxa e desconto por idade são calculados por inscrição; participante sem conta também usa seu nascimento conferido/declarado. Cupom informado em vários itens consome um uso por item. Limites são conferidos pela demanda agregada, e o total do pedido é somado em centavos.
- Reserva de 20 minutos: cria todas as inscrições pendentes, códigos individuais, escolhas, campos personalizados e consumo de cupons em uma única transação. Nenhuma chamada ao gateway ou envio de mensagem ocorre nessa transação.
- O estoque continua derivado dessas inscrições pendentes; não existe uma segunda contagem de reserva em paralelo. Cancelar ou expirar cancela o conjunto e devolve usos de cupom uma única vez.
- Repetir a reserva com a versão aceita retorna as mesmas inscrições e não renova o prazo. CPF é protegido entre pedidos de compradores diferentes e contra concorrência com inscrição pelo fluxo legado, mesmo quando ainda não existe conta.
- As rotas individuais antigas recusam acesso/mutação de uma inscrição do grupo. Triggers também impedem alteração isolada da inscrição, escolhas e campos personalizados fora da transação do pedido.
- O expirador antigo ignora inscrições de pedidos. A rotina própria trata somente `reserved`, sem cobrança, no intervalo já usado pelo servidor; também roda ao consultar um pedido expirado. A limpeza continua com novas compras desativadas. O pagamento da próxima etapa deve usar estados próprios e conciliação antes de liberar estoque.

### Contrato disponível

- `POST /api/checkout-orders`: `{ event_id, request_key }`.
- `GET /api/checkout-orders/:id`: retorna estado, versão, total em centavos, validade e itens com dados permitidos.
- `PUT /api/checkout-orders/:id/items`: `{ version, items: [{ participant_id, choices }] }`; permite lista vazia no rascunho.
- `POST /api/checkout-orders/:id/review` e `/reserve`: `{ version }`.
- `POST /api/checkout-orders/:id/cancel`: `{}`; ainda não cancela estados de pagamento/confirmação.
- Cliente tipado preparado em `src/lib/api/checkoutOrders.ts`.

### Verificação

- `npm run test:checkout-orders`: **18 testes de integração aprovados** em PostgreSQL 17 descartável, aplicando migrações 118–120 sobre fixture mínima. Inclui convidados e contas existentes, rollback injetado no segundo INSERT, última unidade concorrente, CPF entre compradores, disputa com legado, privacidade, versões, expiração e isolamento dos fluxos antigos.
- `npm run test:registration-pricing`: 15 testes de regressão aprovados.
- TypeScript do backend e verificação isolada do novo cliente de API aprovados. Build do frontend aprovado; permanecem os avisos anteriores. Os erros globais de tipos do frontend registrados na etapa 3 não foram tratados nesta entrega.
- Para reproduzir: banco descartável local e vazio `cronoteam_stage4_test`, variável `ORDERS_TEST_DATABASE_URL` com conexão em `127.0.0.1`, seguido de `npm run test:checkout-orders` no backend. A suíte recusa uma instalação existente de usuários e remove seu schema ao terminar. Nenhum CPF real, gateway ou e-mail é utilizado.

### Publicação e limites

- **Migração 120 não aplicada ao banco da aplicação.** As migrações 117–120 continuam pendentes nesse banco.
- Rotas de pedido retornam indisponibilidade enquanto `MULTI_REGISTRATION_CHECKOUT_ENABLED` não for `true`. Manter desativado até integrar pagamento, tela, entrega e homologação. Nenhuma flag foi alterada no `.env`.
- A tela de compra em grupo ainda não está montada. Uma reserva não é confirmação de pagamento nem ingresso liberado: mesmo itens gratuitos permanecem pendentes nesta etapa; a política de confirmação do pedido inteiro pertence à etapa 5.
- Consultas e relatórios antigos que dependem de `JOIN profiles` não representam integralmente atletas sem conta. Painéis, comprovantes, downloads, notificações e vínculo posterior serão integrados na etapa 7 antes da ativação.
- A revisão vence em 15 minutos e a reserva em 20 minutos nesta versão. A liberação automática pode ocorrer na próxima execução do verificador, limitado a 100 pedidos por passagem; conciliação e prazo do gateway precisam ser alinhados na etapa 5.
- Testes usam schema mínimo, não cópia integral de produção. Homologação completa de migração, carga e operação permanece na etapa 8.

## Etapa 5 — pagamento e conciliação

- [x] Cobrança única vinculada ao pedido e responsável pelo pagamento.
- [x] Tentativas recuperáveis, inclusive timeout após cobrança criada, sem repetir POST incerto.
- [x] Alocar valores às inscrições para relatório, comissão e estorno sem multiplicar a receita.
- [x] Unificar confirmação por webhook, consulta e rotina de expiração.
- [x] Deduplicar eventos e tratar ordem de chegada, pagamento tardio e consulta indisponível.
- [x] Preservar cobranças antigas, bloquear ajustes individuais legados no grupo e implementar estorno individual administrativo. Cobrança complementar após edição do grupo continua fora do contrato desta versão.

Aceite: um pagamento confirma os itens devidos uma vez; repetição não duplica cobrança, estoque, comissão ou confirmação.

### Implementado localmente

- Migração `121_checkout_order_payments.sql`: tentativas, alocações por inscrição, eventos de webhook, solicitações de estorno e eventos persistentes para os efeitos da confirmação/estorno. Novos estados `needs_review` e `refunded` no pedido.
- A cobrança usa o comprador como cliente do Asaas, o total reservado no servidor e a referência `ORDER-<tentativa>`. Não recebe preço, cliente do gateway, CPF de pagamento ou dados de cartão do navegador. Pix e cartão usam a fatura hospedada no Asaas nesta versão; não há parcelamento nem boleto no contrato novo.
- Chave UUID por tentativa e bloqueio entre processos por pedido impedem dois POSTs simultâneos. Uma tentativa aberta impede criar outra, inclusive com uma chave diferente. Uma rejeição explícita HTTP 400 permite outra tentativa; timeout/crash após início do envio leva à busca por referência, sem reenvio automático.
- Se a cobrança não for encontrada após um resultado incerto, a reserva permanece retida para conciliação. Ausência na listagem e erro de consulta não comprovam que não houve cobrança. Duplicidade de cobranças, valor/cliente/método divergente, contestação e estorno externo parcial exigem revisão.
- Confirmação verifica referência, ID, cliente, método e valor. Cartão confirma em `CONFIRMED`/`RECEIVED`; Pix aguarda `RECEIVED`, pois `CONFIRMED` pode representar análise cautelar. Eventos fora de ordem provocam consulta atual ao provedor, e não atualização cega pelo payload.
- A confirmação altera todas as inscrições e liquida as alocações na mesma transação. Não faz nova baixa de kit. Pedido totalmente gratuito confirma sem gateway; itens gratuitos de pedido misto aguardam o pagamento do total.
- Uma alocação guarda valor bruto, taxa da plataforma, valor estornado e liquidação por ingresso. Os auxiliares `getTotalPaidForRegistration`, `getTotalPaidForRegistrationIds` e `getAmountPaidForOrganizer` incluem essas alocações, preservando pagamentos antigos. A cobrança do grupo não é duplicada em `asaas_payments` para cada participante.
- Cancelamento/expiração de cobrança consulta o gateway e só devolve vagas, estoque e cupom após confirmar remoção de cobrança não paga. Em análise ou indisponibilidade, mantém a reserva. Pagamento recebido antes dessa remoção confirma; pagamento tardio após liberação vai para revisão, sem reativar ingressos automaticamente.
- Conciliação no início do servidor e no intervalo já existente, até 100 pedidos por execução, com prioridade às consultas mais antigas e proteção contra sobreposição no mesmo processo. Continua funcionando com novas compras desabilitadas. Consultar e cancelar pedidos existentes também permanece disponível com a flag desligada.
- Estorno administrativo devolve o valor integral alocado de um ingresso, incluindo sua taxa, sem alterar os demais. A devolução parcial da cobrança só é contabilizada quando o respectivo estorno retorna `DONE`; `PENDING`/timeout mantêm o ingresso reservado e bloqueiam outro estorno incerto. `CANCELLED` permite nova tentativa. Estorno integral confirmado fecha o conjunto, com devolução única de cupom/estoque.
- Efeitos `confirmed` e `refunded` são persistidos uma vez por inscrição para consumo na etapa 7. Ainda não enviam mensagens nem executam comissões/bônus. Essa separação impede perder a confirmação quando a futura entrega falhar; a idempotência dos consumidores ainda será validada na etapa 7.

### Contrato adicional

- `POST /api/checkout-orders/:id/payment`: `{ request_key, method: "PIX" | "CREDIT_CARD" }`, somente comprador autenticado e novas compras habilitadas.
- `GET /api/checkout-orders/:id/payment`: concilia e retorna estado, valor em centavos, validade, orientação e link de fatura quando pagável. Somente comprador.
- `POST /api/checkout-orders/:id/cancel`: mantém o contrato, agora conciliando cobranças. Resultado pode continuar aguardando pagamento quando a remoção não foi comprovada.
- `POST /api/checkout-orders/:id/refund`: `{ request_key, registration_id }`, exclusivamente administrador; registra quem solicitou. Interface administrativa de estorno ainda não montada.
- Webhook Asaas autenticado encaminha pagamentos de pedido ao conciliador próprio antes do processamento legado. Eventos persistidos não carregam o payload completo com dados pessoais.

### Verificação e limites

- `npm run test:checkout-payments`: **29 testes de integração aprovados**, PostgreSQL 17 descartável com migrações reais 118–121 e gateway simulado. Cobrem cobrança única/concorrência, timeout, confirmação atômica com falha injetada, ordem/repetição de webhook, gratuidade/misto, expiração, pagamento tardio, cobrança restaurada, isolamento/autorização, valores financeiros, estornos parcial/integral/incerto/cancelado e compatibilidade financeira legada.
- Regressão de pedidos: **18 testes aprovados**. TypeScript do backend e verificação isolada do cliente frontend aprovados. A verificação global do frontend continua com as limitações registradas na etapa 3.
- Para reproduzir: PostgreSQL local descartável e vazio chamado `cronoteam_stage5_test`, `PAYMENTS_TEST_DATABASE_URL` com host `127.0.0.1`, e `npm run test:checkout-payments` no backend. A suíte recusa banco existente e remove apenas seu schema descartável ao terminar.
- **Migração 121 não aplicada ao banco da aplicação.** As migrações 117–121 permanecem pendentes. `.env` e a flag de ativação não foram alterados. Nenhuma cobrança, consulta de CPF ou devolução real foi executada.
- Não ativar o grupo antes das etapas 6–8: faltam tela, ingressos/entrega, consumidores de comissões/bônus, painéis/relatórios completos para convidados e homologação do gateway real. Relatórios que consultam diretamente `asaas_payments` ainda precisam incluir o modelo do pedido na etapa 7.
- Pagamentos/estornos incertos sem prova definitiva não são refeitos nem liberados por prazo. A operação de revisão e sua interface, alertas e retenção dos registros devem ser homologados na etapa 8. Não alterar manualmente para `reserved` ou repetir um POST sem conferir o provedor.
- Nesta versão, estorno parcial significa devolver um ingresso completo. Ajuste arbitrário do valor de um ingresso, parcelamento, transferência e cobrança complementar após editar uma inscrição do grupo permanecem bloqueados no fluxo legado e precisam de contrato próprio antes de serem oferecidos.
- Taxas do gateway não são distribuídas como receita adicional nem restituídas automaticamente pela plataforma; a alocação registra o bruto/taxa da plataforma. Política de custos do estorno e apresentação financeira completa devem ser homologadas antes da ativação.

### Referências do gateway conferidas

- [Criar cobrança](https://docs.asaas.com/reference/criar-nova-cobranca), [localizar por referência](https://docs.asaas.com/reference/listar-cobrancas), [excluir cobrança](https://docs.asaas.com/reference/delete-payment), [estornar cobrança](https://docs.asaas.com/reference/estornar-cobranca) e [interpretar estornos](https://docs.asaas.com/docs/estornos). A referência identifica a tentativa, mas não é tratada como garantia de idempotência do POST no provedor.

## Etapa 6 — interface responsiva

- [x] Compra com progresso e lista de participantes.
- [x] Preenchimento individual e aplicação seletiva de escolhas a outros participantes, com prévia das incompatibilidades.
- [x] Resumo lateral no desktop e recolhível no celular; edição preservada durante falhas de gravação.
- [x] Retomada, mensagens de erro por participante e tratamento de atualização de preço/estoque.
- [x] Rótulos associados, navegação por controles nativos, estado de expansão, foco de erro, campo CPF numérico e formulários adaptáveis. Validação em dispositivo físico/leitor de tela e rede móvel real permanece na homologação.

Aceite: concluir compra individual ou em grupo em desktop/mobile, editar participantes e retomar sem duplicação.

### Implementado localmente — 02/10/2026

- `GroupRegistrationFlow` integra o modal do evento em três passos: participantes, revisão e pagamento. Até 20 participantes; comprador não precisa estar inscrito. Login/cadastro inline anterior é preservado para visitantes, e o novo fluxo abre após autenticação quando habilitado.
- Identificação por CPF reutiliza o formulário da etapa 3: conta existente só exibe condição de cadastro e CPF mascarado; sem conta permite conferir nascimento, complementar dados e escolher e-mail ou acompanhamento pelo comprador. O ingresso continua em nome de quem corre.
- Categoria, modalidade, lote, kit, todas as variantes exigidas e campos personalizados são editados por participante. Lote vencido oferece atualização explícita para o preço atual. Renovar a identificação do mesmo participante preserva suas escolhas; trocar a pessoa limpa as escolhas anteriores.
- “Copiar escolhas” consulta elegibilidade de cada destino e mostra os incompatíveis antes de aplicar. Permite selecionar todos os compatíveis ou apenas alguns. Copia categoria/modalidade/lote/kit/variantes/cupom; nunca copia identificação, contato ou respostas pessoais. Ao trocar categoria, limpa campos personalizados da categoria anterior. A revisão do servidor continua responsável por preço e disponibilidade agregada.
- Rascunho salvo automaticamente após 900 ms sem alteração, com ação de salvar manualmente e indicação de alterações pendentes. Falhas preservam os dados locais; recarregar uma versão do servidor pede confirmação quando há alterações não salvas. Fechar durante operação é bloqueado, e sair da página com alterações pendentes aciona aviso do navegador.
- Retomada usa `sessionStorage`, por comprador/evento, guardando somente referências e chaves de criação/pagamento. Identidades, e-mails e escolhas não são persistidos nesse armazenamento pelo novo fluxo; são carregados do servidor. Referências de identidade expiradas pedem nova identificação. A retomada nesta versão cobre recarregamento na mesma aba/sessão, não troca de dispositivo ou restauração após encerrar a sessão do navegador.
- Revisão apresenta os itens, destinatário/acompanhamento, categoria/kit, descontos, taxa e total por participante. Valores vêm do servidor. Prazo vencido exige revisar novamente; reserva só ocorre após o comprador conferir o resumo.
- Pagamento mostra os métodos disponíveis no evento, prazo da reserva, link da fatura hospedada e consulta de situação. Reutiliza a chave de tentativa após erro/recarregamento; consulta ao retornar da fatura e por botão, sem gerar nova cobrança. Estados gratuito, confirmação, revisão financeira, cancelamento e expiração têm mensagens próprias.
- Layout com resumo lateral no desktop e recolhível no celular; rolagem interna do modal, controles nativos rotulados, aviso acessível de erros e foco ao mudar de etapa. A confirmação mostra a referência do pedido; downloads e entrega dos ingressos são a etapa 7.
- `POST /checkout-participants` aceita `excluded_participant_ids` (até 20 referências do pedido). Antes de chamar o provedor/alterar o rascunho, rejeita CPF já incluído para preservar contato, nome e prontidão existentes. A lista não substitui as proteções de duplicidade na reserva.
- O limitador específico de CPF permanece em `/check-cpf` e na identificação por CPF. Ler/completar referências privadas e verificar elegibilidade não consomem esse orçamento, evitando bloquear a compra de 20 participantes só pela quantidade de passos.

### Verificação e ativação

- **22 verificações em navegador headless Edge**, em 1365×900 e 390×844, com interceptação de todas as APIs e bloqueio de conexões externas. Cobrem participante cadastrado/convidado, e-mail opcional, CPF repetido, cópia seletiva/incompatibilidade, escolhas individuais, falha de salvamento, retomada, preço alterado, reserva, pagamento e confirmação, sem duplicar cobrança. Capturas desktop/mobile foram inspecionadas visualmente.
- **19 testes de integração de participantes aprovados** em PostgreSQL 17 descartável, incluindo a nova proteção contra sobrescrever participante repetido, com provedor de CPF simulado.
- **6 testes das regras da interface aprovados**: cópia sem respostas pessoais, troca de categoria, variantes/estoque, vínculo de kits, lotes e métodos de pagamento.
- Verificação estrita de tipos dos componentes novos e TypeScript do backend aprovados. Build do frontend aprovado, com o aviso de tamanho de pacote já existente. Erros globais antigos de tipos do frontend não foram incluídos como resolvidos.
- Testes: `npm run test:group-checkout-model` e `npm run test:checkout-participants` no backend (este exige o banco descartável `cronoteam_stage3_test`). Para navegador, iniciar Vite local em `127.0.0.1:5186`, apontar `PLAYWRIGHT_MODULE_PATH` para Playwright instalado e executar `npm run test:group-checkout-browser`. O harness em `backend/tests/fixtures/groupCheckout.html` não faz parte do build da aplicação.
- **Não ativado em produção.** O frontend exige `VITE_MULTI_REGISTRATION_CHECKOUT_ENABLED=true` no build e o backend exige `MULTI_REGISTRATION_CHECKOUT_ENABLED=true` para novas compras. Sem a flag de frontend, o fluxo anterior continua selecionado. Nenhuma configuração `.env`, migração real ou publicação foi executada nesta etapa.
- Não habilitar as flags antes de integrar a etapa 7 e homologar a etapa 8. Ainda faltam entrega efetiva, vínculo posterior da conta, comissões/bônus, painéis completos e testes reais de gateway/dispositivo. O fluxo visual validado usa APIs simuladas; não equivale a uma compra real homologada.

## Etapa 7 — entrega, mensagens e vínculo posterior

- [x] Confirmação consolidada para comprador e mensagem individual para atleta com contato.
- [x] Para atleta sem conta e com e-mail: enviar inscrição confirmada com botão “Completar cadastro”; cadastro não condiciona validade do ingresso.
- [x] Sem e-mail: disponibilizar ingresso na conta do comprador com dados de quem corre.
- [x] Vínculo futuro por identidade verificada, preservando ingresso, kit, pagamento e acesso ao pedido.
- [x] Fila persistente, retentativas, reenvio e deduplicação de mensagens.
- [x] Consumir `checkout_payment_effects` com idempotência para notificações, comissões/bônus e reversões; incluir atletas sem conta e impedir entrega de pedidos em revisão.
- [x] “Minhas compras”, “Minhas inscrições”, downloads individuais/conjuntos e painel do organizador.

Aceite: cada destinatário recebe os dados corretos e atleta que completa cadastro encontra o ingresso existente sem nova cobrança ou consumo de estoque.

### Implementação e comportamento

- Migração **122**: fila `checkout_delivery_jobs`, auditoria `checkout_identity_links`, comissão com atleta ainda sem conta, identificação do efeito financeiro e registro de retirada/devolução de kit. Alterar CPF/nascimento invalida a comprovação anterior do perfil; a atualização de perfil aceita somente campos públicos editáveis, impedindo forjar os metadados de validação.
- Mensagens incluem evento, data/local, atleta, CPF mascarado, categoria/modalidade/lote, kit, produtos/variantes, respostas com seus rótulos, valores/descontos/taxa, código e link do ingresso. Dados dinâmicos são escapados. Os rótulos e produtos fixos do kit passam a integrar a fotografia do pedido.
- Comprador recebe o resumo; conta existente recebe no seu e-mail; convidado recebe no contato escolhido. Contato igual ao e-mail do comprador é incluído no resumo, com botão de cadastro quando aplicável. Sem contato, o ingresso continua acessível ao comprador.
- `/minhas-compras` e a seção de inscrições do corredor mostram os ingressos do novo fluxo. O painel do evento tem consulta por participante/código, PDFs e retirada de kit. As linhas da lista legada direcionam a compra em grupo ao novo painel; exportação/listagem legada também recebe os dados da fotografia do atleta sem conta. As ações antigas de alteração direta continuam bloqueadas para pedidos.
- `/ingresso` atende acesso autenticado e link assinado recebido por e-mail. O token fica no fragmento da URL e é enviado ao endpoint de consulta por POST. Permite somente consultar aquele ingresso, sem autenticar uma conta. Código/QR e PDF só são liberados com pedido confirmado e inscrição paga; a consulta verifica o estado atual, inclusive em novo download. PDFs já baixados continuam sujeitos à conferência de validade pela organização.
- Retirada exige organizador do evento ou administrador, com data/operador e sem segunda baixa de estoque. Após reembolso, kit já entregue permanece consumindo estoque até a confirmação de devolução física. A migração 122 adiciona proteção de estoque no banco; a política de vaga na corrida permanece separada. Confirmar devolução pressupõe que o kit recebido pode voltar ao estoque.
- Cadastro/login e consulta das compras tentam vincular pelo CPF normalizado **e nascimento**, com comprovação `cpf_brasil_api` no perfil e sem ambiguidade entre contas. O e-mail informado pelo comprador não comprova titularidade. O vínculo altera somente o corredor da inscrição existente e a referência da comissão, mantendo código, escolhas, cobrança, estoque e acesso do comprador.
- Perfil criado por preenchimento manual ou sem comprovação **não recebe vínculo automático**. O ingresso permanece válido no link do e-mail e na conta do comprador. Homologar o atendimento/revalidação dessas exceções antes de liberar produção.
- Comissão financeira é materializada na mesma transação do efeito e da fila, inclusive com corredor nulo; estorno cancela o lançamento e ajusta ganhos uma vez. Bônus delega ao domínio canônico existente, com fila de recuperação e serialização por líder/evento entre os trabalhadores de entrega. A política existente de revogação atinge convites disponíveis; situações com bônus já utilizado exigem tratamento operacional.

### Operação e limites de entrega

- `CHECKOUT_DELIVERY_ENABLED=true` habilita o trabalhador no backend, na inicialização e a cada minuto. É independente das flags de novas compras: ao suspender novas vendas, manter conciliação e entrega dos pedidos já iniciados. Nenhuma flag ou configuração `.env` foi alterada nesta etapa.
- Efeitos e mensagens têm chaves únicas; trabalhadores concorrentes usam travas por mensagem/pedido. Pedidos em revisão não geram entrega válida. Falha transacional mantém o efeito pendente, sem comissão ou mensagem parcial.
- Falha anterior ao envio e indisponibilidade de configuração mantêm a mensagem pendente, com espera progressiva. Erro após iniciar SMTP ou processamento de e-mail interrompido fica `unknown`: não há reenvio automático porque o provedor pode já ter aceitado a mensagem. `Message-ID` é estável, mas não equivale a uma garantia de entrega única do SMTP.
- Comprador/corredor podem solicitar reenvio para o e-mail da própria conta, com chave de idempotência. Administradores consultam pendências em `GET /api/checkout-delivery/messages` e retomam em `POST /api/checkout-delivery/messages/:id/retry`; para resultado incerto, conferir o provedor e informar `accept_possible_duplicate: true`. Não há painel visual administrativo dessa fila nesta etapa.
- Mensagens contêm link para visualizar/baixar o ingresso; PDFs são gerados na interface, sem anexo automático no e-mail. O link contém acesso ao ingresso e deve ser tratado como tal.

### Verificações locais

- **25 testes de integração de entrega** em PostgreSQL 17 descartável, com gateway, SMTP e execução de bônus simulados. Cobrem destinatários, convite, escape de HTML, cadastro posterior, identidade inválida/ambígua, autorização, token, concorrência, estornos, comissões, recuperação de falhas, retirada e devolução física com proteção contra revenda.
- **29 testes de regressão de pagamentos** e **18 de integridade/estoque** aprovados, incluindo compatibilidade antes da migração 122.
- **28 verificações em navegador** em 1365×900 e 390×844: consulta, filtro, download conjunto com duas páginas de PDF, reenvio, acesso público/autenticado, bloqueio após reembolso, retirada e devolução de kit. Capturas desktop/mobile inspecionadas. **22 verificações do fluxo de compra da etapa 6** também aprovadas após a integração do acesso aos ingressos.
- Tipos do backend e verificação estrita dos novos componentes aprovados; build do frontend aprovado com avisos de pacote já existentes. Não foi declarada correção dos erros globais antigos de tipos do frontend.
- Comandos no backend: `npm run test:checkout-delivery`, com `DELIVERY_TEST_DATABASE_URL` apontando exclusivamente para banco local descartável `cronoteam_stage7_test`; `npm run test:checkout-delivery-browser`, com Vite em `127.0.0.1:5186` e `PLAYWRIGHT_MODULE_PATH` configurado. Os harnesses em `backend/tests/fixtures` não integram o build da aplicação.
- **Sem publicação, migração real, cobrança ou envio de e-mail real.** As migrações 117–122 continuam pendentes no ambiente da aplicação. SMTP/Asaas reais, operadores, exceções de identidade e carga de produção ficam para a etapa 8.

## Etapa 8 — homologação e publicação

### Revisão de UX e compatibilidade — plano de 02/10/2026

Antes da publicação, executar o [plano de evolução da compra e dos ingressos](plano-evolucao-ux-checkout-ingressos.md): página dedicada, inscrição do comprador em primeiro plano, escolhas responsivas por participante, revisão/pagamento e unificação da tela existente de ingressos. O documento registra o reaproveitamento dos componentes atuais e os cuidados com transferências, histórico, autorizações, estoque e links emitidos. Os registros de entregas anteriores abaixo e nas etapas 1–7 permanecem como histórico, não como aceite da nova experiência solicitada.

#### Evolução de UX — etapa A entregue em 02/10/2026

- [Contratos e mapa de consumidores/ações](contratos-ux-checkout-ingressos.md) definidos: consulta pessoal unificada proposta, privacidade, valores, permissões, retomada e estados de preenchimento.
- Transferências legadas mapeadas, incluindo consulta ao provedor, conclusão administrativa, webhook e split. Desenho de pedidos preserva inscrição/alocação com histórico de titularidade; sua implementação e a definição de autoridade do comprador após vínculo ficam para a etapa E.
- Fixture sintética de inscrições legadas e seis novos testes em `checkoutDelivery.test.ts`: coexistência, comprador/atleta sem duplicação, guard por rota/corpo, privacidade, escopo administrativo e retomada sem reinclusão.
- **31 testes de entrega e 6 de escolhas aprovados**, com banco PostgreSQL 17 descartável e provedores simulados. A preparação do teste de identidade respeita a invalidação automática da prova após troca de CPF.
- Sem modificação do comportamento da aplicação, configuração, migrações ou dados reais. A página dedicada e o novo layout continuam pendentes, começando pela etapa B. Testes dos controllers legados completos, nova consulta e nova transferência não foram declarados cobertos pelos testes de caracterização do guard.

#### Evolução de UX — etapa B implementada localmente em 03/10/2026

- Página dedicada em `/evento/:slug/inscricao` e `/events/:id/inscricao`, com retorno após autenticação e os mesmos serviços de compra. Os botões do evento usam a página quando a flag do novo checkout está ativa.
- Dados próprios no início, participação inicial do comprador na criação nova, compra apenas para terceiros, inclusão explícita e renovação da própria identidade preservando escolhas. Rascunhos anteriores e remoções não causam reinclusão automática.
- Inclusão inicial atômica por chave idempotente, sem migração; `POST /checkout-orders/:id/buyer` exige proprietário e versão. Dados de outras contas continuam restritos.
- `RouterProvider` mantém a lista de rotas existente e permite `useBlocker`; navegação interna/histórico e recarga protegem alterações pendentes.
- 33 verificações da página (1366/390/320 px), 22 regressões do fluxo com pagamento simulado, 6 testes das escolhas e 1 teste de retorno seguro aprovados; build e tipos do backend aprovados. Capturas desktop/mobile inspecionadas. Tipos globais do frontend ainda têm erros antigos; a dependência de autenticação `useCpfBrasilLookup.ts` também impede afirmar que todo o login está livre de erros de tipos.
- Sete novos testes de integração de pedidos preparados. Execução em PostgreSQL **pendente**, pois o Docker Desktop não iniciou (erro no gerenciador de inferência/socket). Não usar dados da aplicação para contornar essa limitação. Reexecutar `test:checkout-orders` e `test:checkout-delivery` em bancos descartáveis antes do aceite de integração.
- Comandos adicionais no backend: `test:checkout-page-browser`, `test:checkout-return-path`. O teste de navegador requer Vite em `127.0.0.1:5186` e `PLAYWRIGHT_MODULE_PATH` configurado. Verificação estrita da página/fluxo: `npx tsc -p backend/tests/fixtures/checkoutPage.tsconfig.json` na raiz.
- Sem alteração de flags, banco real, pagamentos ou notificações. Na entrega B, etapas C–F ainda pendentes; atualização da etapa C abaixo.

### Evolução UX — E3: lista pessoal única e reaproveitamento do card (04/10/2026)

- Extraído `RegistrationCard` do card antigo e substituída a dupla consulta/listagem de `MyRegistrations` por `/tickets/mine`, com busca, contagens, paginação e filtros de estados. Foto, dados permitidos do participante e identificação de quem comprou ficam no mesmo card. Sem recriar inscrições ou duplicar alocações.
- API reaproveita os agregadores existentes de valores pagos/diferenças. O adaptador legado contém só os campos exigidos pelas ações; códigos, CPF completo e respostas pessoais não entram na lista. Convites expirados são excluídos como na listagem anterior. Solicitação de transferência só é retomável por seu solicitante.
- Preservados modais/ações legados de convite, atributos, diferenças, confirmação de pagamento, Pix, transferência e cancelamento. PDF legado e de pedido usam o mesmo gerador, consultando a validade atual antes de baixar. Total desconhecido não vira zero na apresentação.
- Pedidos usam detalhe, PDF individual/conjunto, reenvio e transferência com APIs próprias. Formulário preserva chave após resposta incerta, permite corrigir erro confirmado de entrada e só exibe conclusão quando o backend confirma a troca. Cobrança incerta não ganha um segundo botão de criar taxa.
- `/minhas-compras` redireciona para `/corredor/minhas-inscricoes`; compradores com perfil administrativo/organizador também acessam seus próprios ingressos. As demais rotas de corredor mantêm sua restrição. Retomada de pagamento usa pedido explícito e confere o evento antes de renderizar a compra.
- Sem nova migração nesta etapa, publicação ou mudança no banco da aplicação. Transferências de pedidos dependem das migrações 123/124 da E2 antes de uso real. APIs financeiras/mensagens foram simuladas nos testes.
- Validação E3: **74 testes de integração** em PostgreSQL 17 descartável; **90 verificações da lista pessoal** em 1366, 390 e 320 px; **33 da página de compra/autenticação/retomada** e **28 de ingresso/PDF/operação de kit** aprovados. Tipos do backend, tipos estritos do escopo de checkout/lista e build aprovados. Build mantém os avisos existentes de chunks grandes e Browserslist antiga. Capturas inspecionadas em `backend/tmp/ux-stage-e3/`; logs `ux-e3-integration.log`, `ux-e3-browser.log`, `ux-e3-checkout-page.log`, `ux-e3-delivery-browser.log` e `ux-e3-build.log`. Novo script `test:my-tickets-browser` usa `PLAYWRIGHT_MODULE_PATH` e Vite local na porta 5186, com todas as APIs interceptadas.
- Próxima E4: revisar os consumidores restantes e links antigos, incluindo `/registrations/:id/receipt` (controller ainda sem resposta; não usado pelo novo download), antes da homologação F.

### Evolução UX — integração da E2: solicitação e taxa de transferência (04/10/2026)

- Backend de solicitação/cobrança conectado ao núcleo, por rotas autenticadas em `/api/checkout-transfers`. Consulta, pagamento e aprovação administrativa existentes também delegam solicitações de pedidos ao fluxo adequado. O webhook mantém autenticação e consulta o provedor antes de aceitar confirmação; nenhuma mutação legada é aplicada aos ingressos de pedidos.
- Migração aditiva **124_checkout_transfer_payments.sql**, registrada no runner: chave idempotente da solicitação e lançamento exclusivo da taxa. Nenhuma conversão de inscrição antiga. Migrações 123/124 executadas somente na base descartável de testes.
- Preservadas taxa configurada, autorização do titular/responsável/administrador e aprovação administrativa sem exigir taxa paga. Taxa zero conclui diretamente quando o destinatário está pronto. Destino sem cadastro aguarda conclusão de perfil antes de cobrar. Categoria e duplicidade de inscrição são verificadas antes do pagamento.
- Serialização por solicitação protege cobrança, conciliação e decisão administrativa. Estado persistido antes do POST impede repetir taxa após timeout; consulta por referência recupera a cobrança. Confirmação repete as validações de titularidade e elegibilidade no núcleo, sob o bloqueio compartilhado com o financeiro.
- Worker periódico recupera pendências sem depender do retorno do comprador. Dinheiro recebido permanece registrado mesmo quando a transferência não puder concluir; divergências ficam em revisão, sem débito/estorno automático. Cancelar/rejeitar uma solicitação com cobrança iniciada requer tratamento financeiro prévio.
- Resposta histórica da solicitação não entrega o código atual do ingresso. Repetir uma criação bem-sucedida permite recuperar o resultado mesmo se o solicitante já perdeu o papel de titular; isso não devolve acesso ao ingresso.
- Validação: **71 testes de entrega/consulta/transferência**, **25 de pedidos**, **29 de pagamentos** e **2 de identidade** aprovados, com tipos do backend aprovados. Após o ajuste final para reconhecer estorno total de uma taxa em revisão, os **4 cenários financeiros afetados** foram executados novamente e aprovados. PostgreSQL 17 descartável, gateway/mensagens simulados; bancos de pedidos/pagamentos mantêm schemas anteriores às novas migrações. Logs: `backend/tmp/ux-e2-workflow.log`, `ux-e2-refund-review.log`, `ux-e2-orders.log`, `ux-e2-payments.log`.
- A tela não foi alterada nesta entrega. **Próxima etapa E3:** conectar as ações ao card existente, consumir a consulta única e retirar a listagem duplicada somente após paridade. Homologação do provedor real continua na F; nenhum pagamento/e-mail real, deploy ou alteração do banco da aplicação.

### Evolução UX — núcleo da E2: transferência e identidade atual (04/10/2026)

- Migração aditiva **123_checkout_ticket_transfers.sql**: identidade atual e versão do ingresso em `registrations`, versão capturada na solicitação e histórico próprio por transferência. Adicionada ao runner de migrações; validada somente em PostgreSQL descartável, não aplicada ao banco da aplicação.
- `finalizeCheckoutTransfer` é um núcleo interno sem rota pública: recebe a solicitação persistida/versionada, verifica titular/responsável/administrador, módulo/evento/prazo, taxa paga ou aprovação administrativa, categoria, identidade e reembolso. Solicitações não versionadas não são aceitas. Nenhum valor financeiro fornecido por cliente autoriza conclusão.
- Transação e trava compartilhada com pagamento/entrega preservam inscrição, pedido, fotografia original, alocação e estoque. A mesma solicitação retorna seu resultado anterior; outra solicitação criada para a versão antiga não troca novamente o titular. O código é rotacionado apenas no ingresso transferido.
- Consultas de ingressos/pedidos/organizador e mensagens passam a usar identidade atual quando houver; sem migração ou sem transferência, usam a fotografia existente. Tokens antigos sem versão continuam válidos somente na versão zero. Atleta anterior perde autorização como titular; comprador conserva seu acesso. Respostas pessoais originais não são apresentadas como respostas do novo titular no ingresso.
- Mensagens antigas por atleta são canceladas e têm verificação de versão antes do envio; novas mensagens usam chaves idempotentes. Titular anterior recebe aviso sem acesso ao ingresso atual. Não há envio real de e-mail nos testes.
- **48 testes de entrega/consulta/transferência**, **25 de pedidos**, **29 de pagamentos** e **2 de identidade** aprovados. Pedidos e pagamentos foram executados também em schemas anteriores à migração 123. Tipos do backend aprovados. Logs locais: `backend/tmp/ux-e2-transfers.log`, `ux-e2-orders.log`, `ux-e2-payments.log`.
- Docker inicialmente falhou em `dockerInference`; após reinício pelo usuário, bancos descartáveis responderam e os testes puderam ser executados. Nenhum reset ou alteração do banco real.
- **Limite desta entrega:** o núcleo não cria solicitação nem gera a cobrança da taxa. A conexão dos controllers, consulta, webhook e aprovação administrativa, com seus testes HTTP/gateway, é a parte restante da E2. A transferência de pedidos continua bloqueada na entrada legada; não há botão habilitado antecipadamente nem alteração da transferência de inscrições antigas. E3 ainda fará a lista única e o reaproveitamento do card.

### Evolução UX — etapa E1: consulta única e investigação de transferência (03/10/2026)

- Implementado `GET /api/tickets/mine`, autenticado e sem cache, e cliente tipado em `src/lib/api/myTickets.ts`. Não recebe identificador de outro usuário. Dados derivam de `registrations`, com junções de pedido/seleções/alocações; uma linha por inscrição, inclusive quando comprador e atleta coincidem.
- Autorização, busca, relações, estados, contagem e paginação são resolvidos na mesma consulta SQL. Preserva histórico transferido legado e titular atual, diferencia reembolso e pedido em conferência e não amplia lista pessoal por papel de organizador/administrador.
- Lista traz evento/imagem, identificação autorizada e mascarada, rótulos, valores individuais em centavos e retirada/devolução conhecida. Não expõe código de ingresso, CPF completo, nascimento, contato ou respostas personalizadas. Não executa vínculo de identidade, conciliação, reserva ou mutação ao listar.
- **39 testes de entrega/consulta aprovados** em PostgreSQL 17 descartável: oito novos cenários E1 e 31 regressões. Novos testes cobrem lista mista, paginação/contagens, privacidade também na busca, HTTP/autenticação/validação/no-store, papéis, dupla relação, transferência legada, valor por ingresso/reembolso, imagem e pedido em conferência. Tipos do backend e verificação estrita do cliente aprovados. Evidência em `backend/tmp/ux-stage-e-read.log`.
- Investigação de transferência confirma titular/responsável/administrador, módulo/evento/prazo e taxa de `system_settings.transfer_fee`, cobrada separadamente via Pix. Consulta, webhook e aprovação administrativa são caminhos de conclusão. Usuário confirmou preservar a regra atual; não haverá nova exigência de aceite. Diferenças entre interface/controller e caso sem taxa estão documentados no contrato para os testes de E2.
- **E1 não substitui a tela:** variantes/ações/liberação legadas ainda aguardam adaptador; indicadores desconhecidos retornam `null`. A lista atual, cards e operações permanecem ativos. A consulta depende do schema existente das migrações 120/121; nenhuma migração nova foi criada ou executada no banco da aplicação.
- Próximas partes da E: E2 compatibilidade de ações e transferência; E3 card antigo/lista única; E4 consumidores e regressões. Sem cobrança, e-mail, publicação ou alteração de dados reais.

### Evolução UX — etapa D (03/10/2026)

- Revisão com edição direta por participante, valores individuais preservados e total único destacado junto da ação. No celular, resumo expansível antes do conteúdo, navegação em três etapas e rodapé sem sobrepor opções.
- Pagamento extraído em `CheckoutPaymentPanel`, reaproveitando o hook, APIs e backend existentes. Seleção por cartões grandes de Pix/cartão, teclado nativo, disponibilidade/prazos respeitados e escolha automática do cartão quando Pix indisponível. Ação exibe o valor; pedido gratuito possui confirmação própria.
- Orientações para preparação, resultado incerto, espera, rejeição, expiração, cancelamento em andamento, conferência, confirmação e reembolso. Link externo somente para tentativa pendente permitida. Atualização ao retornar o foco/visibilidade da página, sem criar outra cobrança. Dados de cartão continuam no Asaas.
- Correções de retomada: consultar a tentativa também ao abrir um pedido reservado; retirar a falha antiga do estado ao iniciar nova tentativa, para não renovar novamente a chave se a resposta dessa tentativa se perder. “Retomar tentativa” mantém chave e meio escolhido. Falha definitiva continua permitindo nova chave e escolha de meio.
- **29 testes de integração de pagamentos aprovados**, em PostgreSQL 17 descartável, gateway simulado. Cobrem concorrência, idempotência, resultado incerto e conciliação. Sem alteração de serviço financeiro, estoque ou schema nesta etapa.
- Navegador: **75 verificações de revisão/pagamento** em 1366, 390 e 320 px; **33 da página/autenticação/retomada** e **34 do fluxo de grupo**, com APIs simuladas. Cobertura inclui preços do servidor, edição direta, revisão vencida, método indisponível, duplo clique, recarga, retorno por foco/visibilidade, perda de resposta com reutilização de chave, estados financeiros e confirmação gratuita. Capturas em `backend/tmp/ux-stage-d/` inspecionadas; adicionada verificação contra sobreposição da ação às opções.
- Verificação estrita dos componentes da página e build aprovados. O build mantém os avisos de chunks grandes e base Browserslist antiga; os erros globais anteriores de tipos do frontend não foram tratados nesta etapa.
- Novo script `test:checkout-payment-browser`, com o mesmo Vite local/Playwright dos demais testes. Sem migração, publicação, dados reais, cobrança ou e-mail. A etapa E será a compatibilidade das ações e a unificação dos ingressos; homologação real do provedor continua na F.

### Evolução UX — etapa C (03/10/2026)

- PostgreSQL disponível novamente: 25 testes de pedidos e 31 de entrega aprovados em bancos descartáveis. Resolvida a pendência de integração da etapa B. Corrigida a leitura do sexo em perfis antigos para inclusão automática do comprador, sem regravar cadastros.
- Seleções em cartões grandes, busca para listas maiores, controles nativos de teclado e apresentação adaptada a desktop e celular. Confirmação antes de trocar categoria/kit com descarte de escolhas dependentes.
- Resumo, progresso e pendências por participante. Conclusão individual verifica elegibilidade, salva e direciona ao próximo; erro de salvamento preserva os dados. Seleção completa não equivale a ingresso confirmado.
- Cópia pelo destino ou em grupo, com elegibilidade individual, confirmação de substituição e cupom opcional. Respostas pessoais e identidade não são copiadas. Comparação estável de JSONB evita falso estado de alteração pendente.
- 8 testes de regras, 33 verificações da página, 34 do fluxo com até 20 participantes e 21 dos controles de escolha aprovados. APIs do navegador simuladas. Tipos estritos da página, tipos do backend e build aprovados; permanecem os erros globais anteriores de tipos do frontend e o aviso de chunks grandes.
- Scripts: `test:group-checkout-model`, `test:group-checkout-browser`, `test:checkout-page-browser`, `test:participant-choices-browser`. Testes de navegador exigem Vite local em `127.0.0.1:5186` e Playwright instalado; `PLAYWRIGHT_MODULE_PATH` permite apontar para o runtime existente. Evidências locais em `backend/tmp/ux-stage-c/`.
- Sem nova migração, publicação, cobrança, envio de e-mail ou alteração do banco da aplicação. Próxima etapa: D, revisão/pagamento; unificação dos ingressos continua na etapa E.

### Ajuste de ativação local — 02/10/2026

- O frontend local estava habilitado, mas a API devolvia `CHECKOUT_DISABLED`: faltava `MULTI_REGISTRATION_CHECKOUT_ENABLED=true` no ambiente do backend. A chave foi adicionada ao `backend/.env` local; o servidor em modo watch recarregou e passou a confirmar a ativação.
- Carregamento de ambiente centralizado antes da criação do pool e da importação dos serviços. Prioridade: variáveis do processo, `backend/.env`, `.env` da raiz; caminhos independentes da pasta de execução. A chave de frontend não autoriza o backend. Flags aceitam `true` com espaços/maiúsculas, mantendo ausência/`false` desabilitadas.
- Diagnóstico sem credenciais: `GET /api/health/checkout` informa `checkout_enabled` e `delivery_enabled`, sem cache. Após editar `.env`, reiniciar o backend; se houver variável exportada no terminal, ela tem prioridade sobre o arquivo.
- Verificação local: API saudável, `checkout_enabled=true`, ausência do bloqueio 503 (requisição sem sessão agora retorna 401), presença das nove tabelas principais e das colunas de pedido/CPF/retirada/devolução. Somente consultas de estrutura foram realizadas; nenhuma migração foi executada por este ajuste.
- Dois testes de configuração e tipos do backend aprovados (`npm run test:checkout-environment`). Pagamentos e envios reais não foram usados para validar a ativação. `delivery_enabled=false` permanece no ambiente local; envio de mensagens precisa de ativação própria na homologação.

- [ ] Revisar migrações pendentes, compatibilidade e dados existentes antes da execução.
- [ ] Homologar compras completas, estoque concorrente, falha de pagamento/e-mail e vínculo posterior.
- [ ] Verificar totais financeiros, comissões, cancelamentos, transferências e retirada de kit.
- [ ] Liberar para eventos selecionados e monitorar divergências e erros.
- [ ] Preparar reversão que desabilite novas compras mantendo conciliação dos pedidos já iniciados.

Aceite: cenários críticos da especificação aprovados e operação acompanhada antes de ampliar a disponibilidade.


### Atualização E4a — links antigos e comprovantes (04/10/2026)

- Links de inscrição em grupo pela rota legada retornam `ORDER_REGISTRATION_REQUIRED`; as páginas antigas encaminham ao detalhe protegido `/ingresso?id=...`. O guard continua bloqueando leituras/mutações legadas de pedidos.
- O comprovante legado agora responde, verifica titular atual/admin/organizador do evento e validade antes de liberar seus dados. A lista e a página de QR reutilizam o gerador PDF com consulta nova a cada download. Antigo titular, inscrição substituída, cancelada ou sem pagamento confirmado não recebe um novo ingresso.
- A validação pública legada informa `ticket_available` para distinguir transferência ativa de inscrição substituída; seu conjunto de dados públicos não foi ampliado com dados de pedidos.
- Validação local: 75 testes de integração, teste adicional de validade pública, 147 verificações de navegador e checagens de tipos aprovados. Banco da aplicação e serviços externos não utilizados.
- E4 permanece em andamento: falta revisão operacional completa de organizador/admin e regressões de convites, atributos e diferenças.
