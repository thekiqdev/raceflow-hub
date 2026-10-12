# Plano de compra de múltiplas inscrições

Criado em 30/09/2026. Atualizado em 01/10/2026.
Status: implementação iniciada por etapas. Acompanhar entregas e validações em [implantacao-multiplas-inscricoes.md](implantacao-multiplas-inscricoes.md).

## 1. Objetivo e limites

Permitir que um comprador inscreva várias pessoas no mesmo evento, com um pagamento, mantendo uma inscrição e um ingresso individual para cada atleta. Tornar a compra simples no desktop e no celular e corrigir as fragilidades de gravação, estoque e notificações identificadas na investigação.

Este arquivo documenta a proposta funcional, as decisões pendentes e os critérios de aceite. As bases de preço/lote, transações/estoque, identificação de participantes, pedido com reserva conjunta, núcleo do pagamento único e interface desktop/mobile foram implementadas localmente. Os três caminhos de criação de corredores foram ajustados para perfil público. As migrações 117–121 estão registradas, mas não foram aplicadas ao banco da aplicação nesta sessão. A compra em grupo permanece desabilitada por padrão; entrega de ingressos, vínculo posterior e consumidores de notificações/comissões continuam nas próximas etapas. A nova tela foi testada em navegador com APIs simuladas; pagamento e estorno foram validados com gateway simulado, sem operação financeira real. Entrega de e-mails, configurações efetivas e comportamento em produção não foram verificados.

## 2. Direção acordada e recomendações

Direção solicitada:

- Adicionar participantes ao fluxo e preencher a inscrição de cada um.
- Oferecer uma opção de aplicar escolhas a vários participantes.
- Melhorar a tela de inscrição para desktop e mobile.
- Garantir gravação correta, consumo correto de kits e notificações coerentes.
- Criar novos corredores com perfil público por padrão e tornar públicos os perfis existentes com papel `runner` por migração pontual.
- Ao digitar CPF de outro participante, mostrar apenas se possui cadastro, sem retornar dados pessoais do perfil.
- Se não possui cadastro, solicitar data de nascimento para conferir a consulta de CPF e então preencher os demais dados disponíveis. O e-mail é opcional.
- Oferecer a opção “Usar minha conta para acompanhar este ingresso” ao comprador. Essa opção define onde acompanhar a compra; o titular do ingresso continua sendo o atleta identificado pelo CPF.
- Se houver e-mail, enviar a inscrição confirmada com botão “Completar cadastro”. Sem e-mail, manter a inscrição na conta do comprador para consulta e download.
- Usar a API de CPF existente como fonte de nome, sexo e nascimento. Quando não encontrar os dados, permitir informar manualmente o sexo; ausência de nascimento continua exigindo complemento quando a categoria depender de idade.

Recomendações para a primeira versão, ainda sujeitas à definição de produto:

- Um evento por pedido; participantes identificados antes do pagamento.
- Comprador não precisa participar do evento.
- Um participante segue a mesma estrutura, com apresentação simplificada.
- Uma conta autenticada para o comprador; não exigir criação de senha para cada atleta.
- Manter a regra atual de uma inscrição ativa por atleta/evento, considerando explicitamente as exceções de convites e transferências existentes.
- Não incluir inicialmente compra de vagas sem titular, carrinho entre eventos, importação de planilhas ou divisão do pagamento entre pessoas.
- Não oferecer ao comprador poderes irrestritos sobre contas e perfis dos atletas.

## 3. Base atual e pontos de atenção

### Fluxo e identificação

O componente público `src/components/event/RegistrationFlow.tsx` conduz identificação, modalidade, categoria, kit, revisão, pagamento e confirmação. A opção atual de inscrever outra pessoa usa busca por CPF de perfil público existente e preenche dados pessoais. Cada envio cria uma inscrição. Essa busca deverá ser substituída no novo fluxo por uma consulta mínima de existência; tornar um perfil público não autoriza retornar seus dados nessa nova consulta.

A migração 017 define `profiles.is_public` com default `FALSE`. Antes desta revisão, cadastro comum, criação por organizador e cadastro manual de corredor omitiam a coluna. Esses três caminhos passam a enviar `TRUE` explicitamente; o default global permanece privado para outros tipos de perfil. A migração 117 atualiza valores `FALSE` ou `NULL` de perfis com papel `runner`, inclusive usuários com múltiplos papéis. Não força novamente o valor após uma alteração posterior de visibilidade. A consulta futura de existência deve distinguir conta existente de participante ainda sem conta, independentemente da visibilidade, sem expor o perfil.

`runner_id` representa o atleta e `registered_by` identifica quem realizou a inscrição. O controller público usa os dados do atleta para o cliente da cobrança Asaas. O novo pedido deve identificar explicitamente o comprador e o responsável pela cobrança.

A listagem comum do corredor não representa todas as compras que ele fez para terceiros. Será necessário separar acompanhamento de compras e participação nos eventos.

### Valores e persistência

Na investigação inicial, o payload público enviava `total_amount`, o backend usava esse valor e o lote selecionado não aparecia no payload. A primeira entrega agora recalcula o total no servidor, exige lote vigente quando aplicável, recebe e persiste `category_batch_id` e pede nova revisão se o total divergir. O armazenamento de uma fotografia completa dos componentes do preço será incluído na estrutura de itens do pedido.

A investigação identificou gravações separadas e limpeza compensatória. A etapa 2 substituiu esse caminho por transação de inscrição, escolhas, campos personalizados e cupom, com validação centralizada de variantes. A reserva conjunta do futuro pedido continuará exigindo uma transação para todos os seus itens.

### Estoque

`getVariantRemainingStock` calcula o saldo a partir de `available_quantity` menos inscrições distintas vinculadas à variante. A política em `variantStockPolicyService.ts` inclui inscrições pendentes, confirmadas, com reembolso solicitado e determinadas transferências legadas. Canceladas, reembolsadas e a origem de transferência com split não consomem nessa política.

Consequência: confirmar pagamento não deve descontar novamente um item que a inscrição pendente já reservou. Várias linhas de atributos da mesma variante também não podem multiplicar o consumo.

A etapa 2 confirmou o vínculo exclusivo variante → produto → kit → evento. A migração 118 protege a contagem final e gravações concorrentes; foi validada em banco descartável e ainda depende de aplicação e auditoria dos dados existentes.

### Notificações e pagamento

Os disparos examinados enviam e-mails ao atleta e ao organizador; não incluem separadamente o comprador. Os templates padrão não recebem o detalhamento completo de modalidade, categoria, kit e variantes.

O webhook trabalha por inscrição. Nos eventos de confirmação/recebimento, o trecho examinado envia confirmação sem condicionar o disparo à transição efetiva para quitação completa. Não foi encontrada deduplicação por identificador externo de evento nesse caminho nem fila persistente de retentativas no serviço de notificações.

A expiração automática trabalha por inscrição. O servidor usa, por padrão configurável, 20 minutos de validade e execução a cada cinco minutos. Validade do pedido, reserva e cobrança devem ter uma regra consistente, incluindo pagamento confirmado perto do vencimento.

## 4. Experiência proposta

### Etapa 1 — Participantes

- Identificar o comprador uma vez e oferecer “Eu vou participar” e “Adicionar participante”.
- Não adicionar o comprador automaticamente como atleta sem indicação clara.
- Mostrar lista com rótulo “Participante 1”, CPF mascarado e situação. Para quem já possui conta, não preencher dados a partir da consulta de existência. Para quem não possui, permitir preenchimento a partir da API de CPF após conferir a data de nascimento informada.
- Consultar somente após CPF completo e válido, com controle de requisições e descarte de respostas de um CPF anterior. Mostrar apenas “Possui cadastro” ou “Não possui cadastro”; falha na consulta é um terceiro estado técnico, nunca equivalente a ausência de cadastro.
- A resposta de existência não deve incluir nome, e-mail, telefone, nascimento ou identificador público do perfil. Vínculos internos devem ser resolvidos pelo backend; ocultar campos apenas na tela não atende a regra.
- Para pessoa cadastrada, usar o vínculo interno e validar elegibilidade no servidor sem expor os dados usados na decisão.
- Para pessoa sem cadastro, solicitar CPF e data de nascimento; após conferência bem-sucedida, preencher nome, sexo e demais dados disponíveis na API. Caso a API não encontre dados, oferecer entrada manual dos campos indispensáveis. Exibir e-mail opcional e a escolha “Usar minha conta para acompanhar este ingresso”. Explicar que, com e-mail, a inscrição será enviada após confirmação com botão para completar cadastro; sem e-mail, o comprador poderá acompanhá-la em sua conta.
- Não exigir cadastro completo nem senha do novo participante antes da compra. Identificação e titularidade devem ser preservadas por um registro de participante pendente, separado da conta autenticável.
- Para quem já possui conta, validar elegibilidade internamente sem revelar dados existentes ao comprador. Para quem não possui, conferir nascimento informado antes de usar os dados da API para preencher o formulário; validar categoria/idade no backend. Quando faltarem dados, solicitar somente o necessário conforme a seção 14.1.
- Não sobrescrever contatos de conta existente nem criar conta duplicada para contornar perfil privado ou conflito de e-mail/CPF.
- Detectar CPF duplicado no pedido e inscrição ativa no evento antes de chegar ao pagamento.
- Preservar participantes já preenchidos quando outro apresentar erro.

### Etapa 2 — Escolhas de cada participante

- Trabalhar com um participante expandido por vez, permitindo retornar a qualquer outro.
- Exibir modalidade, categorias elegíveis, lote, kit, todos os produtos exigidos e suas variantes.
- Explicar indisponibilidade por idade, categoria, período ou estoque de forma próxima ao campo.
- Mostrar campos personalizados somente quando aplicáveis à categoria escolhida.
- Oferecer “Salvar e próximo participante” e “Aplicar escolhas a outros”.
- Resumir escolhas e preço de cada pessoa na lista, sem exigir abrir todo o formulário.
- Revalidar escolhas dependentes ao trocar modalidade, categoria ou kit; avisar quais precisam ser refeitas.

### Aplicar escolhas a vários participantes

O usuário escolhe o participante de origem, os destinatários e os campos que deseja copiar. A ação deve apresentar o resultado antes de sobrescrever escolhas existentes.

- Permitir copiar modalidade, categoria quando elegível, kit e opções de produtos compatíveis.
- Tamanhos e demais atributos pessoais não vêm selecionados para cópia por padrão; podem ser incluídos explicitamente.
- Nunca copiar nome, CPF, nascimento, contatos, consentimentos ou respostas pessoais dos campos personalizados.
- Revalidar idade, gênero, vínculo modalidade/categoria, disponibilidade de lote, kit e variantes para cada destinatário.
- Verificar a quantidade agregada necessária no grupo. Exemplo: aplicar camiseta M para três pessoas exige três unidades disponíveis.
- Mostrar resultados concretos: “Aplicável a 3 participantes; 1 precisa escolher outra categoria”.
- Manter os participantes incompatíveis pendentes, sem escolher substitutos silenciosamente.
- Permitir aplicar apenas aos compatíveis mediante ação explícita e desfazer a aplicação antes de pagar.
- A cópia não reserva estoque por si só; a disponibilidade definitiva é verificada ao fechar o pedido.

### Etapa 3 — Revisão

- Mostrar quantidade de participantes, rótulo/CPF mascarado (e nome quando informado manualmente ou preenchido após conferência da data de nascimento), modalidade/categoria, lote, kit e variantes de cada inscrição.
- Exibir preço por participante, descontos, taxas, total e responsável pelo pagamento.
- Permitir editar e remover participantes sem perder o restante.
- Para pessoa sem cadastro, mostrar se a inscrição será enviada ao e-mail opcional ou acompanhada somente na conta do comprador; permitir editar essa escolha. Para pessoa já cadastrada, indicar “Enviaremos ao contato cadastrado”, sem revelar o contato existente ao comprador.
- Exibir erros por participante e levar ao campo correspondente.
- Validar o conjunto no servidor antes de gerar a cobrança. Mudança de preço, lote ou estoque exige revisão explícita do usuário.
- Informar termos aplicáveis à compra e à participação; registrar versão, responsável e momento do aceite conforme o fluxo definido.

### Etapa 4 — Pagamento e resultado

- Uma cobrança para o valor integral do pedido, via métodos habilitados para o evento.
- Para Pix, oferecer QR Code, copia e cola, prazo de validade e atualização automática do estado.
- Para cartão, permitir recuperação de recusa/erro sem criar novamente as inscrições.
- Diferenciar “Aguardando pagamento”, “Pagamento em verificação”, “Confirmado” e “Expirado”.
- Não mostrar confirmação final baseada apenas no retorno visual do navegador.
- Na conclusão, listar cada ingresso e oferecer “Baixar todos”, download individual e acesso a “Minhas compras”.
- Não confundir QR Code de pagamento com QR Code individual do ingresso.
- Permitir retomar pedido pendente após recarregar a página, respeitando validade e autenticação.

## 5. Desktop, mobile e acessibilidade

Recomendação: fluxo dedicado com espaço adequado, evitando concentrar todo o grupo em um modal longo. O formato visual final deve ser validado antes de implementar.

- Desktop: formulário principal e resumo lateral persistente; lista de participantes com edição direta.
- Mobile: uma coluna, participante expandido por vez, resumo recolhível e ação principal acessível no rodapé sem cobrir campos ou teclado.
- Indicador de progresso com nomes de etapas e identificação do participante atual.
- Rótulos persistentes, mensagens de erro próximas aos campos e foco no primeiro problema ao avançar.
- Navegação por teclado, foco previsível, leitores de tela e estados que não dependam só de cor.
- Máscaras e teclados adequados para CPF, telefone e e-mail, sem impedir colagem e preenchimento automático.
- Não perder dados ao voltar, expandir o resumo ou alternar participantes.
- Salvar rascunho com escopo por comprador/evento, validade e limpeza definidos. Não persistir dados de cartão nem deixar dados pessoais de terceiros em armazenamento local sem necessidade.
- Validar telas estreitas, zoom, teclado virtual, conexão lenta e retorno após interrupção.

## 6. Modelo funcional e responsabilidades

Separar os conceitos abaixo, mantendo compatibilidade com as inscrições individuais existentes:

- Pedido: comprador, evento, referência, situação, validade e totais.
- Item do pedido: participante, escolhas, preços e descontos congelados, vínculo com a inscrição individual.
- Inscrição: titular, regras esportivas, kit, campos personalizados, situação e código individual.
- Pagamento/tentativa: cobrança externa, responsável, valor, situação e histórico de reconciliação.
- Alocação financeira: parcela do pagamento atribuída a cada inscrição, necessária para relatórios, comissões, ajustes e estornos individuais.
- Reserva: capacidade de vagas e itens comprometidos enquanto o pedido aguarda pagamento, seguindo uma única fonte de consumo.
- Evento/notificação: evento recebido, transição realizada, destinatário, tentativas e resultado do envio.

A etapa 4 introduziu `checkout_orders`, `checkout_order_items` e vínculo `registrations.order_id`, com uma inscrição pendente por atleta. Atleta sem conta usa CPF e fotografia interna no item, mantendo `runner_id` nulo até vínculo verificado. O modelo de cobrança será tratado na etapa 5. Não reutilizar a mesma cobrança integral como se tivesse sido paga integralmente para cada inscrição: isso duplicaria receita nos relatórios.

Comprador pode consultar e administrar o pedido dentro das permissões definidas; atleta consulta sua inscrição; organizador acessa os pedidos e participantes de seus eventos. Toda autorização deve existir no backend, inclusive para downloads e links enviados.

## 7. Garantias de gravação, preço e pagamento

- Calcular no servidor categoria/lote, kit, descontos, taxas e total, usando precisão monetária consistente.
- Persistir identificação do lote e uma fotografia das escolhas e valores aceitos para que alterações futuras no catálogo não mudem compras concluídas.
- Definir regra de cupom e taxa por pedido ou participante; validar limites e consumo de cupom de maneira concorrente.
- Validar todos os itens antes de concluir o pedido. Uma falha deve retornar os participantes afetados sem criar um subconjunto cobrável involuntariamente.
- Gravar pedido, inscrições, seleções completas e reservas numa transação local consistente.
- Impedir duplicação por duplo clique, reenvio ou concorrência, com chave de idempotência vinculada ao comprador e conteúdo da operação.
- A chamada ao Asaas acontece fora da transação longa do banco, com estado intermediário persistido e recuperação. Transação local não desfaz cobrança externa.
- Em timeout de criação de cobrança, reconciliar a tentativa antes de emitir outra. Definir troca de método e cancelamento da tentativa anterior para evitar duas cobranças utilizáveis sem controle.
- Centralizar a confirmação para que webhook, consulta de pagamento, rotina de expiração e operação administrativa usem regras compatíveis.
- Processar eventos repetidos ou fora de ordem sem repetir confirmações, estoque, comissões ou notificações.
- Confirmar inscrições pagas somente quando o valor devido estiver quitado, com política explícita para itens gratuitos em pedidos mistos.
- Não converter falha de consulta ao provedor em prova de que o pagamento não ocorreu.
- Pagamento tardio após liberação da reserva exige reconciliação e tratamento explícito; não confirmar automaticamente se já não houver disponibilidade.

## 8. Estoque, capacidade e kit

### Fonte única de consumo

Primeiro consolidar a política existente de saldo derivado. Caso reservas sejam representadas por estrutura nova, garantir que ela substitua ou complemente a contagem sem contar novamente as mesmas inscrições.

- Considerar limites do evento, modalidade, categoria/lote e estoques realmente configurados de kit, produto e variante.
- Definir o escopo de estoque por evento ou compartilhado antes de implementar bloqueios e contagens.
- Resolver atributos em variantes canônicas no servidor, validando que produto pertence ao kit e variante pertence ao produto.
- Gravar todos os produtos exigidos pelo kit, não apenas uma seleção encontrada.
- Exigir escolhas completas independentemente de permissividade histórica do fluxo público; tratar legados e convites com compatibilidade explícita.
- Contar unidades por item/produto, sem multiplicar consumo pelo número de atributos gravados.
- Validar demanda agregada do pedido dentro de uma operação protegida contra concorrência. Definir bloqueios em ordem consistente para reduzir impasses.
- Reservar ao fechar o pedido, com prazo explícito. O formulário em rascunho não deve ocupar estoque indefinidamente.
- Pagamento converte reserva em consumo confirmado sem nova baixa.
- Expiração/cancelamento libera uma única vez; solicitação de reembolso mantém a política definida até sua conclusão.
- Reembolso após entrega física do kit não deve repor estoque automaticamente sem regra operacional. Conciliar reserva comercial e retirada física.
- Edição de kit troca a reserva/consumo antigo pelo novo atomicamente; transferência não duplica o consumo.
- Mapear também criação por staff, líder, convites, complementação e transferências para que nenhum caminho burle a mesma política.

## 9. Informações e notificações

### Conteúdo e destinatários

- Comprador: referência do pedido, evento, participantes, inscrições, escolhas, valores individuais, descontos, taxas, total, situação e acesso a todos os ingressos.
- Atleta: sua inscrição, modalidade/categoria, kit e variantes, dados operacionais do evento e acesso ao seu ingresso.
- Organizador: resumo do pedido e participantes, situação real de confirmação e acesso ao detalhe autorizado no painel.
- Participante sem cadastro: com e-mail, enviar inscrição confirmada e botão para completar cadastro; sem e-mail, disponibilizar inscrição e ingresso ao comprador. Em ambos os casos, manter o CPF do atleta como titular e permitir vínculo futuro à conta dele após verificação. Não inventar e-mails nem substituir contato de perfil existente pelo do comprador.
- Quando comprador e atleta coincidirem, consolidar a mensagem para evitar duplicação.

O detalhe autorizado da inscrição deve conter todos os dados aplicáveis, incluindo respostas personalizadas e histórico relevante. O e-mail traz o resumo operacional; CPF completo e respostas sensíveis não devem ser expostos em mensagens coletivas ou links públicos.

### Eventos de envio

- Pedido criado/pendente: ao comprador, com retomada e vencimento; não chamar de inscrição confirmada.
- Pedido quitado: confirmação consolidada ao comprador e individual aos participantes com contato disponível. Para pessoa sem cadastro que informou e-mail, a mensagem individual inclui o botão “Completar cadastro”; o envio da inscrição não depende de clicar nesse botão.
- Organizador: preferir resumo por pedido confirmado; notificações de pedidos pendentes, se desejadas, devem ser claramente distintas.
- Falha, expiração ou cancelamento: ao comprador, com situação e ação adequada, sem afirmar cancelamento enquanto houver conciliação pendente.
- Alteração relevante, transferência ou estorno: comunicar apenas destinatários afetados e refletir o estado atualizado.

### Confiabilidade

- Registrar a intenção de envio junto à transição de negócio, com processamento posterior, retentativas e histórico.
- Evitar duplicação por evento, destinatário e versão da confirmação; reenvio manual deve ser identificado.
- Falha de e-mail não desfaz pagamento ou inscrição e deve permitir reprocessamento.
- Diferenciar mensagem enfileirada, aceita pelo servidor de e-mail e entrega efetivamente comprovada quando houver suporte do provedor.
- Templates usam uma fonte consistente de dados, compartilhada com revisão, painel e comprovante.
- Ingresso/QR Code válido somente para inscrição elegível; downloads e links respeitam permissões e situação atual.
- Priorizar e-mail e consulta no painel. WhatsApp automático, SMS e push ficam fora da primeira versão, salvo decisão posterior.

## 10. Acompanhamento e compatibilidade

- “Minhas compras”: pedidos do comprador, participantes, pagamentos pendentes, situação dos envios e downloads.
- “Minhas inscrições”: participações do atleta, inclusive quando adquiridas por outra pessoa.
- Painel do organizador: localizar pedido ou inscrição, distinguir comprador de atleta e visualizar valores alocados.
- Preservar códigos e histórico das inscrições existentes; não recriar cobranças antigas nem reenviar confirmações por efeito da migração.
- Auditar inconsistências legadas antes de corrigir dados; não deduzir silenciosamente variantes ou tamanhos ausentes.
- Manter compatibilidade com comissões, convites, diferenças de pagamento, transferência e retirada de kits.
- Definir estorno parcial por inscrição mesmo quando a cobrança original é conjunta; confirmar suporte e limitações do provedor antes de oferecer essa ação na interface.

## 11. Fases gerais e acompanhamento da execução

As fases abaixo descrevem o escopo geral. O desdobramento em entregas menores, com situação real e evidências de validação, está em [implantacao-multiplas-inscricoes.md](implantacao-multiplas-inscricoes.md). A autorização para começar foi recebida em 01/10/2026; marcar uma entrega como implementada localmente não significa publicação em produção.

### Fase 0 — Fechar regras e validar o desenho

- [ ] Decidir os itens da seção 13.
- [ ] Mapear fluxos público, staff, líder, convite, edição, transferência, pagamento e retirada.
- [ ] Validar escopo de estoque, templates ativos e integrações em ambiente autorizado.
- [ ] Desenhar telas de um participante e de grupo, no desktop e mobile, incluindo erros e retomada.
- [ ] Revisar a arquitetura de pedido, pagamento, reserva e identidade de participantes.

Entrega: especificação fechada, protótipo de navegação e critérios de aceite aprovados. Este plano não cria o protótipo.

### Fase 1 — Consistência de dados e regras compartilhadas

- [ ] Consolidar precificação no servidor e identificação do lote.
- [ ] Garantir seleções completas e transações locais consistentes.
- [ ] Proteger capacidade/estoque e duplicidade contra concorrência.
- [ ] Planejar migrações compatíveis e auditoria de legados.

Entrega: base validada para inscrições individuais e de grupo, preservando os fluxos operacionais existentes.

### Fase 2 — Pedido e pagamento único

- [ ] Introduzir pedido, itens, tentativas e alocação financeira.
- [ ] Implementar fechamento atômico local, reserva e idempotência.
- [ ] Adaptar cobrança, reconciliação, webhook e expiração.
- [ ] Tratar falhas externas, pagamento tardio, cancelamento e estorno.

Entrega: compra de grupo funcional em ambiente de teste, sem dependência da nova interface para verificar as regras.

### Fase 3 — Nova experiência responsiva

- [ ] Construir participantes, edição individual e aplicação de escolhas.
- [ ] Implementar revisão, pagamento, retomada e conclusão.
- [ ] Criar acompanhamento de compras e preservar inscrições individuais.
- [ ] Validar acessibilidade e cenários reais de desktop/mobile.

### Fase 4 — Comunicação e operação

- [ ] Unificar dados de confirmação e comprovante.
- [ ] Implementar envio persistente, deduplicação, retentativas e reenvio operacional.
- [ ] Atualizar templates e destinatários.
- [ ] Adaptar painéis, relatórios, comissões e controles de kit.

### Fase 5 — Homologação e liberação gradual

- [ ] Executar os cenários da seção 12 em ambiente de testes.
- [ ] Comparar totais, alocações, estoque e inscrições após cada cenário crítico.
- [ ] Liberar inicialmente para eventos selecionados, com monitoramento.
- [ ] Definir reversão que desabilite novas compras no fluxo sem interromper pagamentos e pedidos já iniciados.
- [ ] Ampliar somente após conciliação e operação estáveis.

## 12. Critérios de aceite e cenários obrigatórios

### Compra e experiência

- [ ] Um comprador conclui compra para si ou somente para terceiros, pagando uma vez.
- [ ] Participantes podem escolher categorias, kits e tamanhos diferentes.
- [ ] Aplicar escolhas identifica incompatibilidades e nunca sobrescreve dados pessoais.
- [ ] CPF repetido, atleta já inscrito e campos obrigatórios incompletos impedem fechamento com erro localizado.
- [ ] Remover/editar participante atualiza valores sem perder os demais.
- [ ] Recarregar, voltar e retomar não duplica pedido, inscrição ou cobrança.
- [ ] Fluxo funciona com teclado, tela estreita, zoom, teclado virtual e conexão lenta.

### Integridade e estoque

- [ ] Duas compras simultâneas disputando a última unidade não confirmam consumo acima da capacidade.
- [ ] Três participantes escolhendo a mesma variante consomem três unidades, independentemente do número de atributos.
- [ ] Kit com múltiplos produtos obrigatórios persiste todas as escolhas.
- [ ] Falha na última seleção não deixa inscrições órfãs nem reservas parciais involuntárias.
- [ ] Confirmar pagamento não provoca segunda baixa; expirar duas vezes não devolve duas vezes.
- [ ] Edição, transferência, reembolso e retirada física mantêm a política de estoque definida.
- [ ] Uso de variantes compartilhadas entre eventos respeita o escopo escolhido.

### Pagamento e comunicação

- [ ] Valor adulterado no navegador não altera o preço calculado no servidor.
- [ ] Cupom, lote encerrado e estoque mudando durante a revisão provocam revalidação clara.
- [ ] Timeout após cobrança criada é reconciliado antes de tentar nova cobrança.
- [ ] Webhook repetido/fora de ordem não duplica ingresso, comissão ou e-mail.
- [ ] Pagamento parcial não produz confirmação de quitação integral.
- [ ] Pagamento perto ou depois do vencimento é conciliado sem cancelamento indevido ou confirmação sem estoque.
- [ ] Indisponibilidade do Asaas não é interpretada como ausência de pagamento.
- [ ] Falha de SMTP permite retentativa sem desfazer a compra.
- [ ] Comprador recebe resumo completo; cada atleta recebe somente suas informações; organizador vê estado correto.
- [ ] Soma dos valores alocados corresponde ao pedido, incluindo arredondamentos, taxas, descontos e estornos.
- [ ] Usuário sem permissão não acessa pedido, dados de outro atleta ou ingresso por alteração da URL.
- [ ] Inscrições antigas e fluxos de staff/líder/convite continuam válidos.

Monitorar após liberação: conversão por etapa/dispositivo, abandono, tempo de conclusão, erros por participante, divergência de estoque, pedidos pagos sem confirmação, cobranças duplicadas, atraso e falha de notificações. Definir metas após medir a linha de base; não inventar percentuais nesta etapa.

## 13. Decisões pendentes e sugestões

1. **Limite de participantes:** definir um teto configurável por pedido após avaliar operação, risco e desempenho; não fixar quantidade arbitrária no código.
2. **Aplicação coletiva:** recomendar campos e destinatários selecionáveis, com prévia de compatibilidade e tamanhos desmarcados inicialmente.
3. **Conta do atleta:** direção definida: consulta de existência por CPF sem dados pessoais; se ausente, conferência de nascimento, preenchimento pela API e e-mail opcional. Com e-mail, a confirmação inclui botão para completar cadastro; sem ele, a compra permanece acessível ao comprador. Definir prova de identidade para vincular futuramente o ingresso à conta do atleta, sem contas fictícias ou duplicadas.
4. **Taxas e cupons:** esclarecer cobrança por inscrição ou pedido, limites de uso, descontos individuais e arredondamento. Um pagamento único não implica automaticamente uma taxa única.
5. **Prazo de reserva:** definir duração coerente com preenchimento, método de pagamento e prazo aceito pelo provedor; iniciar após revisão/fechamento, não na primeira digitação.
6. **Itens gratuitos:** definir se são confirmados junto ao grupo ou têm confirmação independente; comunicar a regra ao comprador.
7. **Cancelamento individual:** definir quem pode solicitar, como alocar estorno e quando devolver disponibilidade, especialmente após retirada do kit.
8. **Edição por terceiros:** definir dados que o comprador pode corrigir e operações que exigem participação/autorização do atleta.
9. **Menores e termos:** definir responsáveis, campos e aceites aplicáveis antes de habilitar esse cenário.
10. **Organizador:** recomendar resumo por pedido confirmado, evitando um e-mail por etapa e participante.
11. **Formato visual:** recomendar página dedicada responsiva, com resumo lateral no desktop e recolhível no mobile.

Sugestões para evolução posterior: participantes recorrentes mediante autorização, importação de grupos e compra de vagas a distribuir. O convite pós-confirmação para concluir cadastro já faz parte da primeira entrega planejada.

## 14. Convite após confirmação e ingresso vinculado à conta

### Contrato funcional

1. Comprador informa CPF válido. A plataforma responde somente se existe conta cadastrada para o atleta.
2. Se existe, o backend associa internamente o participante à conta correta, sem expor os dados do perfil na consulta.
3. Se não existe, comprador informa a data de nascimento. Após conferi-la com a consulta externa, a plataforma preenche os dados disponíveis no formulário. O e-mail é opcional; a plataforma guarda participante pendente, CPF normalizado, dados da inscrição e, quando informado, o destino da mensagem junto ao pedido. Não cria senha provisória nem trata esse registro como uma conta já cadastrada.
4. Pagamento pendente, recusado ou expirado não dispara convite. O gatilho é a transição real da inscrição para confirmada, incluindo a regra definida para inscrições gratuitas, e não apenas o recebimento de um webhook.
5. Na confirmação, sempre disponibilizar a inscrição no pedido do comprador. Se houver e-mail do atleta, enviar a inscrição confirmada para ele com botão “Completar cadastro”. Se não houver, manter o acesso pela conta do comprador e permitir adicionar e-mail ou compartilhar por mecanismo autorizado depois. A escolha “Usar minha conta para acompanhar este ingresso” deixa esse acompanhamento explícito; não transfere a titularidade esportiva ao comprador.
6. O botão conduz ao cadastro/ativação ou login caso uma conta compatível tenha sido criada nesse intervalo. Validar token, contato e identidade do CPF antes de associar a inscrição. E-mail sozinho, ou CPF digitado sem verificação, não autoriza apropriação do ingresso.
7. Concluir vínculo em transação idempotente, mantendo a mesma inscrição, código, kit, valor e histórico de pagamento. Atribuir a titularidade ao atleta correto sem alterar o comprador e sem criar outra cobrança/baixa de estoque.
8. Após concluir cadastro ou entrar na conta verificada, exibir o ingresso em “Minhas inscrições”. O vínculo deve persistir no servidor e funcionar também se a conta for criada pela página normal, sem uso do link, após verificação de identidade compatível.

### Dependências de dados e recuperação

- A inscrição atual exige `runner_id` referenciando perfil. Será necessária modelagem futura de participante pendente e vínculo posterior; não basta enviar um e-mail no controller atual. A migração 117 trata somente visibilidade e não resolve esse requisito.
- Definir se o ingresso pré-cadastro referencia um participante independente ou uma inscrição com titularidade pendente; manter invariantes de identidade e adaptar leitura, emissão e relatórios antes de liberar.
- Quando há e-mail, o botão usa token de uso único, com expiração, armazenado de forma protegida e associado ao participante/inscrição. Expiração do link não cancela a inscrição paga; permitir reenvio controlado.
- Uma pessoa pode ter ingressos de vários eventos antes de cadastrar. Após verificação de identidade, vincular todas as inscrições elegíveis correspondentes sem duplicar convite por reentrega do mesmo evento.
- Se a conta surgir entre consulta, pagamento e cadastro pelo convite, reavaliar a associação no servidor. Conflitos de CPF/e-mail precisam de recuperação clara, sem sobrescrever conta existente.
- Um e-mail pode receber convites de pessoas diferentes, mas não representa por si só a identidade de todos. Definir a experiência para famílias/responsáveis e contas com e-mail único; conflito não pode resultar em vinculação ao atleta errado.
- Adicionar ou corrigir e-mail opcional com autorização e histórico, invalidando links anteriores quando aplicável; não permitir alteração irrestrita após a reivindicação do ingresso.
- Proteger a consulta de existência com autenticação, limite de tentativas e registro operacional sem gravar dados pessoais desnecessários. Reutilizar os controles de CPF existentes quando adequados.
- A regra de não expor dados vale também para respostas auxiliares do novo fluxo: elegibilidade, resumo e erros não devem reintroduzir nome, nascimento ou contato vindos do perfil.

### Inclusão nas fases de execução

- Fase 0: validar a política de complemento manual descrita na seção 14.1, verificação de identidade, conflitos de e-mail e regra para menores.
- Fases 1 e 2: modelar participante pendente, associação à inscrição e deduplicação por CPF/evento, inclusive sob concorrência com cadastro normal.
- Fase 3: consulta mínima por CPF, conferência de nascimento, preenchimento pela API para não cadastrados, e-mail opcional e opção de acompanhamento na conta do comprador.
- Fase 4: inscrição confirmada por e-mail com botão para completar cadastro, ativação/login, vínculo verificado e recuperação/reenvio.
- Fase 5: validar os cenários adicionais abaixo antes de liberar.

### Critérios de aceite adicionais

- [ ] Cadastros comum, manual e por organizador criam corredor com `is_public = TRUE`.
- [ ] Migração 117 torna públicos perfis `runner` privados/nulos, preserva demais perfis e pode ser reaplicada sem alterar quem já está público. Publicação e execução no ambiente alvo ainda precisam acontecer.
- [ ] CPF cadastrado retorna somente existência, sem dados pessoais no payload; consultas inválidas ou com erro não abrem caminho de falso cadastro novo.
- [ ] CPF sem cadastro solicita nascimento, preenche dados disponíveis após conferência e permite continuar sem e-mail.
- [ ] Sem e-mail, inscrição e ingresso ficam acessíveis na conta do comprador, com titularidade do atleta preservada.
- [ ] Com e-mail, inscrição confirmada é enviada com botão “Completar cadastro”; o ingresso é válido mesmo sem conclusão do cadastro.
- [ ] Pedido pendente/recusado/expirado não gera convite de cadastro.
- [ ] Confirmação repetida não repete convite; falha de entrega permite retentativa.
- [ ] Cadastro pelo convite e cadastro pelo caminho normal, com identidade verificada, mostram o ingresso já pago ao entrar.
- [ ] Atleta já cadastrado recebe inscrição na conta existente sem convite desnecessário de novo cadastro.
- [ ] Conta criada durante a compra é reconciliada sem duplicar perfil, inscrição ou cobrança.
- [ ] CPF divergente, token reutilizado/expirado e e-mail em conflito não permitem tomar ingresso de outra pessoa.
- [ ] Vincular conta não altera QR Code/código, kit, estoque, pagamento, comissão ou acesso do comprador ao pedido.
- [ ] Inclusão posterior, reenvio e correção de e-mail não cancelam ingresso pago e mantêm trilha de auditoria.

### Aplicação da migração de visibilidade

A migração `117_make_runner_profiles_public.sql` está registrada em `backend/scripts/run-migrations.ts`. Antes de executar no ambiente alvo, conferir migrações pendentes e registrar os valores anteriores de `is_public` dos perfis afetados para permitir reversão fiel. Não reverter tornando todos privados: havia perfis públicos antes da mudança. Executar pelo processo de deploy/migração do projeto e verificar que não restam perfis com papel `runner` e visibilidade diferente de `TRUE` naquele momento. Esta etapa de edição não executa o runner nem faz deploy.

### 14.1. API de CPF como fonte de dados e complemento manual

Direção atualizada em 01/10/2026: reaproveitar a integração de CPF já existente para obter nome, sexo e nascimento e evitar pedir ao comprador informações que a plataforma pode consultar internamente. A consulta de existência na plataforma e a consulta à base externa têm finalidades distintas: pessoa sem conta pode ser encontrada na API externa, e falha nessa API não significa que não existe conta.

O código atual de `cpfLookupService.ts` já retorna nome, nascimento e sexo normalizado. Também diferencia CPF não encontrado de falhas técnicas e permite entrada manual quando a configuração correspondente está habilitada. Essa configuração efetiva não foi verificada no ambiente. O reaproveitamento será do serviço e suas validações; o endpoint de cadastro atual devolve dados pessoais e não deve ser usado diretamente pela nova interface de compra para terceiros.

Regras propostas:

- Consultar CPF completo e válido no backend; preservar a resposta de existência mínima para quem possui cadastro. Para pessoa sem conta, pedir nascimento e conferir com a API antes de preencher nome, sexo e demais dados disponíveis. A resposta de existência e a resposta de preenchimento têm contratos separados.
- Utilizar nascimento para calcular idade conforme a regra do evento; normalizar sexo para os valores reconhecidos pelo domínio. Valores desconhecidos não devem ser convertidos silenciosamente para uma categoria permissiva.
- Guardar origem dos campos e momento da consulta. Campos declarados manualmente não devem ser marcados como verificados pela API.
- Quando faltar apenas sexo, solicitar esse campo e aceitar o valor declarado para a regra de categoria por sexo. Manter o nascimento retornado pela API para validar idade.
- Quando a API não encontrar o CPF, liberar complemento manual conforme a política aprovada. A data de nascimento já solicitada pode ser usada para validar categoria etária como dado declarado; sexo também pode ser declarado. Registrar a origem manual de ambos.
- Se houver restrição de idade, exigir nascimento declarado quando ausente na fonte automática e aplicar a validação normalmente. Não inferir idade pelo sexo, não ignorar limite etário e não conceder benefício por idade sem a validação definida para esse benefício.
- Nome ou outros campos indispensáveis à identificação/emissão do ingresso, quando ausentes, precisam de preenchimento manual mínimo ou de tratamento explícito de titular pendente; “confiar no sexo” não dispensa dados obrigatórios de outras partes do fluxo.
- Timeout, indisponibilidade ou erro de autenticação do provedor não equivalem a CPF não encontrado. Manter tentativa novamente/retomada; eventual modo manual para indisponibilidade requer política própria, sem ampliar silenciosamente o fallback atual.
- Não sobrescrever automaticamente os dados de uma conta existente em caso de divergência com a API ou com a declaração do comprador. Registrar a divergência e aplicar o procedimento de resolução antes de validar uma categoria afetada.
- A resposta da API comprova a origem dos dados, não que o comprador ou destinatário do convite seja titular do CPF. Preservar a verificação de identidade ao reivindicar o ingresso.
- Para pessoa cadastrada, usar referência opaca vinculada à sessão/pedido e manter dados pessoais no servidor. Para pessoa sem cadastro, liberar somente os dados necessários ao preenchimento após conferência de nascimento. O comprovante JWT atual contém nome, nascimento e sexo legíveis no payload; não usá-lo como resposta da consulta simples de existência.
- Persistir os dados necessários no participante pendente para confirmação, convite e vínculo posterior. Não exigir nova compra ou nova baixa de estoque ao completar cadastro.

Critérios adicionais para homologação futura:

- [ ] Para CPF com conta, consulta de existência não expõe dados pessoais. Para CPF sem conta, dados da API preenchem formulário somente após conferência de nascimento.
- [ ] Sexo ausente/desconhecido: declaração manual é aceita sem perder nascimento disponível.
- [ ] CPF não encontrado: complemento manual funciona e mantém origem declarada dos campos.
- [ ] Somente sexo disponível: categoria sem regra etária pode ser validada; categoria com limite etário exige nascimento antes de confirmar elegibilidade.
- [ ] API indisponível e conta inexistente são estados distintos, sem criar vínculo ou cadastro duplicado.
- [ ] Divergência com conta existente não permite sobrescrever perfil de terceiros.
- [ ] Convite continua sendo enviado somente após confirmação, e cadastro verificado mantém o ingresso já adquirido.

## 15. Fontes para a futura implementação

- `src/components/event/RegistrationFlow.tsx`: fluxo público e payload de inscrição.
- `src/components/runner/MyRegistrations.tsx`: acompanhamento atual.
- `src/pages/RegistrationQRCode.tsx`: comprovante e QR Code.
- `backend/src/controllers/registrationsController.ts`: criação, cobrança e disparos.
- `backend/src/services/registrationsService.ts`: validações, seleções, estoque e transferências.
- `backend/src/services/variantStockPolicyService.ts`: situações que consomem estoque.
- `backend/src/services/kitSelectionPolicyService.ts`: validações estritas de kit.
- `backend/src/services/asaasService.ts`: cobrança e conciliação por inscrição.
- `backend/src/controllers/asaasWebhookController.ts`: recebimento e processamento de pagamentos.
- `backend/src/services/expiredRegistrationsService.ts` e `backend/src/server.ts`: expiração e agendamento.
- `backend/src/services/notificationService.ts` e `notificationTemplatesService.ts`: envio e templates.
- `backend/src/services/cpfLookupService.ts`, `cpfLookupProof.ts` e `backend/src/controllers/cpfLookupController.ts`: consulta externa, normalização, fallback manual e comprovantes de consulta.
- `docs/investigations/fluxos-criacao-inscricao-kit-selecoes.md`: investigação prévia de persistência de escolhas.
- [Asaas — cobranças](https://docs.asaas.com/docs/guia-de-cobrancas): referência externa da cobrança.
- [Asaas — idempotência de webhooks](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks): eventos repetidos.

Antes de cada entrega, conferir se essas fontes mudaram e validar as configurações efetivas em ambiente autorizado. Consultar o acompanhamento de implementação para distinguir o que já foi alterado do que ainda está planejado.
