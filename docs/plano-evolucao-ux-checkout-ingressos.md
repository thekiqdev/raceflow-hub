# Plano de evolução da compra e dos ingressos

Criado em 02/10/2026. Atualizado em 04/10/2026. Status: etapas A–D, E1–E3 implementadas e validadas localmente; E4 em andamento (links antigos e comprovantes concluídos); F pendente.

Este plano complementa o [plano original](plano-compra-multiplas-inscricoes.md) e o [acompanhamento da implantação](implantacao-multiplas-inscricoes.md). A investigação inicial foi documental. Após autorização para iniciar, a etapa A acrescentou contratos, fixtures e testes de regressão, sem alteração de comportamento da aplicação. As constatações abaixo vêm da leitura do código local e dos testes indicados; não constituem homologação de uma compra real.

## 1. Diagnóstico do que foi implantado

### Compra

- `src/pages/EventDetails.tsx` ainda abre `RegistrationFlow` pelos botões de inscrição do desktop e do celular.
- `src/components/event/RegistrationFlow.tsx` seleciona o fluxo em grupo quando a flag de frontend está habilitada e existe usuário autenticado. O restante continua no fluxo legado.
- `src/components/registration/GroupRegistrationFlow.tsx` coloca participantes, revisão e pagamento dentro de um `Dialog`. Portanto, a restrição de espaço vem da estrutura atual, não apenas de estilos.
- `useGroupCheckout.ts` já centraliza criação/retomada do pedido, hidratação, salvamento, versão, revisão e pagamento. O rascunho começa vazio: o comprador não é incluído como participante inicial.
- O fluxo já tem expansão individual, indicação de escolhas preenchidas e cópia para participantes compatíveis. Não é necessário reconstruir essas funções.
- `ParticipantChoices.tsx` usa principalmente seletores convencionais. Categoria determina modalidades, lotes e kits possíveis; trocar categoria ou kit invalida escolhas dependentes.
- `groupCheckoutModel.ts` calcula problemas das escolhas. O indicador atual não equivale a uma aprovação completa do servidor nem a pagamento confirmado. A cópia preserva respostas individuais na mesma categoria, limpa essas respostas quando muda a categoria e copia o cupom da origem.
- `ParticipantIdentityForm.tsx` já separa conta existente de atleta sem cadastro e mantém a consulta de CPF de terceiros sem exposição dos dados do perfil.
- O pagamento já considera meios habilitados no evento, tentativa existente, compra gratuita e estados de confirmação. O cartão usa o fluxo do provedor. Esses serviços devem ser reaproveitados.

### Listagem e ingresso

- `src/components/runner/MyRegistrations.tsx` exclui da lista antiga as inscrições que possuem `order_id` e acrescenta `CheckoutPurchases` como outro bloco. Essa é a origem da separação percebida pelo usuário.
- O `RegistrationCard` antigo, definido dentro de `MyRegistrations`, **já suporta `event_banner_url`** e possui ações, estados e informações que precisam ser preservados. O trabalho é extraí-lo e evoluí-lo, não criar um terceiro card.
- `CheckoutPurchases.tsx` introduziu outra apresentação com pesquisa, paginação local, agrupamento por pedido, PDFs individuais/conjuntos e reenvio. Também é usado no painel do organizador para retirada/devolução de kit: sua remoção indiscriminada quebraria outro consumidor.
- `checkoutTicketsService.ts` consulta as mesmas `registrations`, associadas aos itens/pedidos novos. Há duplicação de apresentação e contratos de consulta; isso não demonstra duplicação física dos ingressos.
- O contrato novo contém dados do evento, mas não fornece a imagem que o card antigo já utiliza.
- Existem entradas antigas (`/registration/qrcode/:id`, `/registration/validate/:id`) e novas (`/ingresso`, `/minhas-compras`). Links assinados do e-mail permitem consultar um ingresso sem autenticar uma conta; não podem ser redirecionados indiscriminadamente para uma página que exige login.
- O comprovante em `RegistrationQRCode.tsx` é atualmente um arquivo de texto. O fluxo novo possui geração de PDF em `checkoutTicketDownload.ts`. Padronizar a experiência não significa presumir que todos os downloads antigos já sejam PDF.

### Proteções que precisam permanecer

- `backend/src/middleware/orderRegistrationGuard.ts` bloqueia operações legadas sobre inscrições de pedidos. A migração 120 também protege escritas no banco. Retirar o filtro da interface e apontar todos os botões para as APIs antigas causaria erros ou inconsistência.
- Há mais de um caminho de transferência legado: solicitação pelo corredor, com eventual taxa, e transferência administrativa que pode criar outra inscrição e manter a original no histórico. Não existe uma única operação visual que possa ser aplicada sem adaptar essas diferenças.
- Os pedidos mantêm valores e escolhas da compra em snapshots e alocações financeiras. Troca de titular, reembolso, estoque e comissão precisam continuar coerentes com esses registros.
- O vínculo posterior de atleta sem conta usa identidade verificada; informar um e-mail não comprova titularidade. O comprador deve continuar vendo o ingresso mesmo depois do vínculo.

## 2. Jornada proposta

### Entrada e página dedicada

1. Clicar em “Comprar ingresso” abre uma página dedicada, com evento identificado no cabeçalho. Rota proposta: `/evento/:slug/inscricao`, ajustada ao padrão real de rotas antes da implementação.
2. Se necessário, autenticar e retornar à mesma compra. Preservar a resolução atual do evento e compatibilidade de links por identificador.
3. Mostrar “Sua inscrição” primeiro, com os dados permitidos do próprio usuário, e suas escolhas da corrida. Abaixo, apresentar “Adicionar participante”.
4. Concluir as escolhas individuais, revisar participantes e valores e seguir ao pagamento único.
5. Na confirmação, oferecer “Ver meus ingressos”, levando à listagem existente em `/corredor/minhas-inscricoes`, com o contexto da compra.

Manter três etapas gerais: **Participantes → Revisão → Pagamento**. Dentro de cada participante, apresentar escolhas progressivas, evitando uma etapa global para cada campo.

### O comprador como primeira opção

- Para um pedido novo e vazio, preparar a participação do usuário autenticado com operação idempotente e identificação validada pelo servidor. Não exigir que ele procure a si mesmo pelo CPF.
- Se o perfil estiver incompleto, pedir apenas os dados necessários. Exibir os próprios dados não autoriza revelar dados de outros corredores.
- Permitir “Vou comprar apenas para outras pessoas”. A exclusão da própria participação deve persistir durante a retomada.
- Não reinserir o comprador ao recarregar, voltar uma etapa, retomar um pedido ou executar efeitos duplicados da interface. Não alterar rascunhos existentes automaticamente.
- Se o comprador já estiver inscrito, explicar a situação e permitir adicionar terceiros sem criar outra inscrição para ele. Tratar também restrição de categoria, inscrição pendente e evento encerrado com as regras do servidor.

### Participantes e preenchimento

Cada cartão terá título, identificação permitida, resumo das escolhas e estado textual, além de ícone. Estados sugeridos:

- **Não iniciado:** faltam as escolhas da corrida.
- **Em preenchimento:** há escolhas, mas faltam dados obrigatórios.
- **Escolhas completas:** validação local atendida e alterações salvas; ainda depende da revisão do servidor.
- **Precisa revisar:** identidade expirada, incompatibilidade, falta de estoque, mudança de lote ou erro devolvido pelo servidor.

Mostrar “Salvando”, “Salvo” e falha de salvamento separadamente. Nunca confundir “Escolhas completas” com “Ingresso confirmado”. O estado será derivado dos dados e das validações, não um booleano visual independente.

Ao tocar no participante, abrir suas escolhas no próprio fluxo. Ao concluir, recolher o cartão e oferecer o próximo participante incompleto ou a revisão. A lista deve continuar editável, inclusive com 20 participantes.

Para contas existentes de terceiros, manter a identificação permitida pelo contrato atual, como número do participante e CPF mascarado. Não buscar nome/foto do perfil para embelezar o cartão. Para atletas sem cadastro, manter o fluxo de CPF/nascimento, complemento, e-mail opcional e acompanhamento pelo comprador.

### Escolhas da corrida

- Substituir seletores pequenos, quando adequado, por opções grandes com título, descrição curta, preço contextual e indicação clara de seleção.
- Preservar a dependência atual: categoria → modalidade/lote aplicáveis → kit → variações → informações individuais. Não inverter a hierarquia apenas por estética.
- Se existir uma única opção válida, apresentá-la claramente como selecionada. Não transformar uma seleção automática em escolha invisível.
- Explicar indisponibilidade e incompatibilidade. Mostrar foto e composição do kit quando esses dados já existirem, sem tornar a imagem obrigatória.
- Em catálogos extensos, permitir busca ou lista recolhível para evitar páginas intermináveis de botões.
- Indicar campos obrigatórios conforme as regras reais do evento. Conferir o contrato de campos personalizados antes de ampliar o indicador de conclusão; não transformar campos opcionais em obrigatórios.
- Preservar respostas pessoais ao editar o mesmo contexto e avisar antes de mudanças que descartem respostas dependentes.

### Copiar escolhas

Oferecer no participante de destino: “Copiar escolhas de…” com participantes completos como origem. Reaproveitar a verificação de compatibilidade existente.

- Copiar apenas escolhas aplicáveis da corrida, com revisão de categoria, idade/sexo quando exigidos, kit, variantes, lote e estoque.
- Não copiar CPF, nascimento, nome, contato, referência de identidade ou respostas pessoais.
- Confirmar substituição se o destino já tiver escolhas; explicar itens incompatíveis e respostas que precisem ser refeitas.
- Recomenda-se não copiar cupom silenciosamente: oferecer aplicação explícita aos participantes elegíveis e validar individualmente no servidor.
- Revalidar antes de aplicar se o pedido mudou durante a consulta. Preenchimento em um participante não reserva estoque automaticamente para todos os outros.

### Revisão e pagamento

- Revisão com um resumo por atleta, acesso direto a “Editar”, valores individuais e total único calculado pelo servidor.
- Pagamento com cartões de seleção grandes para PIX/cartão, respeitando disponibilidade, datas-limite e tentativa já iniciada.
- Ação principal informa o valor e o próximo passo. Não gerar outra cobrança a cada clique ou retorno do provedor.
- Preservar estados de processamento, expiração, revisão, falha, confirmação, cancelamento e reembolso. Compra gratuita deve ter confirmação própria.
- Não substituir o checkout do provedor por coleta própria de cartão.

## 3. Layout desktop e celular

- Desktop: conteúdo principal amplo e resumo lateral; uma única área de rolagem principal.
- Celular: coluna única, cabeçalho compacto, progresso legível, resumo expansível e ação principal acessível no rodapé, sem cobrir campos, mensagens ou teclado.
- Áreas de toque de pelo menos 44 × 44 px, espaçamento confortável, foco visível, navegação por teclado e mensagens que não dependam apenas de cor.
- Respeitar área segura do dispositivo e zoom de texto. Evitar rolagem horizontal, modais dentro de modais e blocos fixos altos.
- Botão voltar deve ter comportamento previsível. Tratar navegação interna, recarga, falha de conexão e saída com alterações pendentes.
- Reaproveitar salvamento e retomada; hoje a referência está em `sessionStorage`, portanto não prometer retomada em outro dispositivo. Se houver referência do pedido na URL, validar proprietário no servidor e não colocar CPF/e-mail na rota.
- A experiência semelhante a aplicativo é uma orientação de interação; não exige PWA, funcionamento offline ou cache de respostas de pagamento.

## 4. Uma única experiência de ingressos

### Tela e contrato de leitura

Manter `/corredor/minhas-inscricoes` como tela principal. Extrair e evoluir o card existente com foto do evento, atleta, data/local, categoria/modalidade/kit e estados legíveis. Usar fallback quando não houver imagem.

Criar uma consulta normalizada no backend, reaproveitando serviços atuais, para inscrições legadas e de pedidos. Ela deve definir autorização, filtros, paginação, contagem e ações permitidas de forma consistente. Não resolver apenas concatenando duas listas no navegador.

- Identidade canônica do ingresso: `registration_id`. Quando comprador e atleta forem a mesma pessoa, exibir uma única vez.
- Distinguir “Meu ingresso” e “Comprei para outra pessoa”, sem separar compras novas e antigas em telas diferentes.
- Pedido é agrupamento financeiro; inscrição é o ingresso individual. Manter `order_id` e alocações sem criar outra inscrição para padronizar a tela.
- Usar snapshots para fatos da compra e uma representação explícita do titular atual para transferências. Não substituir histórico de compra por dados mutáveis do perfil.
- Valores da inscrição de pedido devem respeitar suas alocações; não repetir o total do pedido como preço de cada ingresso.
- Permitir resumo do pedido e download conjunto como ações da mesma tela. Não criar outra fonte de contagem ou outra coleção de cards.
- Preservar filtros e histórico de pendentes, ativos, transferidos, cancelados/reembolsados e convites, conforme estados suportados.

### Ações e compatibilidade

Reaproveitar visualizar, baixar, transferir, pagar/verificar pendência e cancelar quando permitido. O servidor deve fornecer permissões e motivos de indisponibilidade; a interface não deve decidir autorização apenas por `order_id` ou estado visual.

- Ações legadas continuam usando o domínio legado; ações de pedidos usam o domínio transacional dos pedidos, com uma apresentação comum.
- A adaptação de transferência para pedidos faz parte do escopo final. Não ocultá-la definitivamente para simplificar a unificação.
- Antes de implementá-la, mapear solicitação, cobrança de taxa, confirmação administrativa e callbacks. Definir continuidade entre titular, inscrição original/destino, item do pedido, alocação financeira e código do ingresso, respeitando os caminhos legados existentes.
- Preservar histórico, política de categoria, comissões, reembolsos e retirada de kit. Invalidar acesso do antigo titular quando cabível e evitar dois ingressos ativos para a mesma transferência.
- Nunca remover globalmente `orderRegistrationGuard` ou as proteções transacionais do banco. Implementar operações autorizadas dentro dos serviços adequados.
- Manter links antigos, códigos e QR já emitidos funcionando conforme a situação atual do ingresso. Separar consulta autenticada, validação operacional e acesso público por token.
- Reaproveitar geração de PDF existente e padronizar apresentação, sem perder comprovantes e acesso antigos. PDF baixado não dispensa validação atual do código.
- Transformar `/minhas-compras` em entrada compatível para a experiência unificada. Verificar compradores com outros papéis antes de redirecionar todos para uma rota exclusiva de corredor.
- Migrar também o uso de `CheckoutPurchases` pelo organizador, preservando consulta, retirada/devolução e permissões. Retirar código antigo somente após migrar todos os consumidores.

## 5. Etapas de execução e critérios de aceite

### Etapa A — contratos e regressões de referência

**Entregue em 02/10/2026:** [contratos e mapa de compatibilidade](contratos-ux-checkout-ingressos.md), fixture legada/mista e seis novos cenários de regressão. Suíte de entrega: 31 testes aprovados; regras de escolhas: 6 testes aprovados. PostgreSQL 17 descartável, gateway/CPF/SMTP simulados; sem acesso aos dados reais. O desenho técnico de transferência de pedidos está registrado; a política de autorização do comprador após vínculo com outro atleta permanece uma decisão explícita antes de habilitar essa ação na etapa E. Não impede a etapa B.

Mapear consumidores e ações, preparar dados fictícios legados/novos/mistos e registrar comportamentos atuais. Especificar contrato normalizado, permissões e estados de conclusão. Resolver o desenho de transferência para pedidos antes de expor essa ação.

**Aceite:** regras e fixtures cobrem histórico, comprador, atleta, convidado, organizador e administrador; nenhuma necessidade de reescrever inscrições antigas para viabilizar o layout.

### Etapa B — página dedicada e inscrição do comprador

**Implementada localmente em 03/10/2026, com validação de banco concluída na etapa C:** entradas desktop/mobile agora levam à página de compra por slug ou UUID quando o novo checkout está habilitado. O login/cadastro na tela de autenticação retorna à compra. O conteúdo reutiliza o fluxo de revisão, reserva e pagamento existente.

O backend aceita `include_buyer` na criação e inclui a própria participação apenas no INSERT vencedor, dentro da mesma transação. Pedidos existentes, inclusive vazios, não recebem inclusão automática. Foi acrescentada ação autenticada/versionada para adicionar ou renovar explicitamente a própria participação. O status de perfil incompleto, identidade ambígua ou inscrição já existente permite seguir comprando para terceiros. Nenhuma migração adicional foi necessária: a existência da chave de pedido já persistida distingue criação de retomada.

O roteamento conserva as rotas existentes e passa a usar `createBrowserRouter`/`RouterProvider`, permitindo o bloqueio nativo `useBlocker` na página com alterações pendentes. Foram testados o botão da página e o histórico do navegador, além de recarga e retomada. A opção de modal permanece para compatibilidade do fluxo anterior/harness; não é a entrada pública do novo checkout.

Validações: 33 verificações da página em 1366, 390 e 320 px, 22 verificações do fluxo anterior em navegador, teste de retorno seguro da autenticação, 6 testes de regras das escolhas, tipos do backend e build aprovados. As APIs de navegador são simuladas; isso não equivale a validar gravação real. Sete cenários de integração foram acrescentados à suíte de pedidos, mas **não executados nesta etapa**: o Docker Desktop falhou ao iniciar o gerenciador de inferência/socket local. Não houve reset do Docker, migração, cobrança, envio de e-mail ou alteração de dados da aplicação.

**Pendência resolvida em 03/10/2026:** com Docker novamente disponível, `test:checkout-orders` passou com 25 testes e `test:checkout-delivery` com 31, em PostgreSQL 17 descartável. A execução identificou e corrigiu a validação da inclusão do comprador para perfis antigos com sexo em português (`masculino`, `feminino`, `outro`); a compatibilidade é feita na leitura, sem atualizar perfis. A listagem única de ingressos continua na etapa E.

A verificação estrita da página e dos componentes de compra (`backend/tests/fixtures/checkoutPage.tsconfig.json`) passou. A verificação global do frontend continua com erros anteriores, inclusive na dependência de consulta de CPF usada pela autenticação; não foram declarados corrigidos por esta entrega.

Extrair o conteúdo do modal, reaproveitar `useGroupCheckout` e redirecionar as entradas desktop/mobile. Implementar autenticação com retorno, retomada, navegação e inclusão idempotente do comprador apenas em novo rascunho.

**Aceite:** compra de uma pessoa é o caminho inicial; terceiros continuam acessíveis; recarga/voltar não duplica participante/pedido nem perde escolhas; rascunhos existentes não são sobrescritos.

### Etapa C — experiência individual dos participantes

**Implementada localmente em 03/10/2026.** `ParticipantChoices` utiliza cartões grandes com radios nativos para categoria, modalidade, lote, kit e variantes. Busca e expansão atendem listas maiores; opções esgotadas ficam indisponíveis. A troca de categoria/kit pede confirmação antes de descartar escolhas dependentes. Os campos personalizados existentes continuam individuais.

Cada participante apresenta resumo, pendências e estado derivado dos dados: não iniciado, em preenchimento, aguardando salvar, escolhas completas ou precisa revisar. “Concluir participante” verifica compatibilidade, salva e abre o próximo participante incompleto. Falhas mantêm o painel e as escolhas. “Escolhas completas” exige identificação válida, escolhas locais válidas e persistidas; não significa inscrição confirmada nem dispensa a revisão do servidor.

A cópia pode partir do destino ou ser aplicada a vários participantes. Só oferece origens completas, consulta a elegibilidade de cada destino, exige confirmação para substituir escolhas existentes e deixa o cupom desmarcado por padrão. Não replica identidade, contato ou respostas pessoais. Alterações durante a prévia e expiração da identificação impedem aplicação da cópia antiga. A comparação das escolhas tolera a reordenação de chaves do JSONB.

Validação: 8 testes de regras; 33 verificações da página; 34 do fluxo incluindo conclusão, cópia pelo destino, cupom opcional e retomada de 20 participantes; 21 de escolhas/teclado/busca/estoque/troca de categoria. Navegador com APIs simuladas, desktop e larguras de 390 e 320 px; capturas inspecionadas. Tipos estritos da página, tipos do backend e build aprovados. O build mantém o aviso de chunks grandes. Sem migração adicional, dados reais, pagamento ou envio de e-mail. A homologação com serviços externos continua na etapa F.

**Aceite:** comprar para 1, 2 e 20 atletas é compreensível; cada pendência aponta para seu participante; cópia não transfere dados pessoais e não aprova escolhas inválidas.

### Etapa D — revisão e pagamento

**Implementada localmente em 03/10/2026.** Revisão mantém os valores calculados pelo servidor e inclui edição direta de cada participante, total destacado junto da ação principal e resumo expansível antes do conteúdo no celular. O rodapé acompanha a rolagem, respeita a área segura e não cobre opções ou mensagens.

Pagamento em componente extraído (`CheckoutPaymentPanel`) com cartões grandes e radios nativos para Pix/cartão. Disponibilidade e prazos continuam respeitados; quando Pix está indisponível e não existe tentativa iniciada, o cartão disponível é selecionado. A ação mostra o valor, e inscrições gratuitas têm confirmação própria. Dados de cartão continuam exclusivamente no provedor.

Estados de preparação, resposta incerta, espera, rejeição, cancelamento em andamento, expiração, conferência, confirmação e reembolso têm orientação específica. O link do provedor é exibido somente para tentativa pendente, sem cancelamento solicitado e dentro do prazo apresentado; após o prazo, consultar o servidor, sem inferir liberação de reserva pelo relógio local. Retornar o foco ou tornar a página visível consulta a situação, sem gerar cobrança.

Retomar um pedido reservado também consulta a tentativa existente. Ao tentar novamente após rejeição definitiva, a falha antiga é retirada do estado local: se a nova resposta se perder, a ação reutiliza a nova chave persistida, em vez de tratar a rejeição anterior como outra autorização para renovar a chave. O backend, a conciliação e a persistência financeira permanecem existentes.

Validações e evidências finais estão registradas na seção de etapa D de `implantacao-multiplas-inscricoes.md`. Navegador utiliza APIs simuladas; integração de pagamento usa PostgreSQL 17 descartável e gateway simulado. Sem cobrança, e-mail, nova migração ou alteração no banco da aplicação. Homologação real do provedor continua na etapa F; lista única de ingressos continua na etapa E.

**Aceite:** duplo clique, recarga e retorno do provedor não geram cobrança duplicada; valores e liberação dos ingressos continuam determinados pelo backend.

### Etapa E — ações compatíveis e ingresso único

Divisão de execução para preservar as operações existentes:

- **E1 — consulta unificada:** implementada em `GET /api/tickets/mine`, com cliente tipado, autorização, busca, filtros, paginação e valores por inscrição. Lista visual e ações antigas permanecem existentes. Contrato parcial e limitações registrados em `contratos-ux-checkout-ingressos.md`.
- **E2 — ações e transferência:** preservar a regra atual confirmada pelo usuário: titular/responsável/administrador, módulo e evento habilitados, prazo aplicável e taxa configurada. Adaptar conclusão financeira, histórico/identidade, tokens e mensagens dos pedidos; incluir testes de callbacks e concorrência antes de expor a ação.
  Backend conectado em 04/10: núcleo versionado (migração 123), criação idempotente, taxa Pix separada (migração 124), consulta, webhook, aprovação administrativa e recuperação periódica. Mantém identidade atual separada, estoque, alocação financeira, revogação de acesso e entrega idempotente. Migrações testadas somente em banco descartável; aplicação real e integração do botão no card dependem da próxima etapa e da homologação. O guard legado permanece; inscrições de pedidos usam a rota própria, sem liberar mutações legadas.
- **E3 — card e lista única:** extrair/reutilizar o card antigo, consumir a consulta unificada, adaptar ações e filtros, manter imagem do evento e redirecionar entradas compatíveis. Remover blocos duplicados somente com paridade de ações.
  Implementada localmente em 04/10: `RegistrationCard` extraído do componente antigo, uma consulta paginada em `/tickets/mine`, foto e identificação do participante, filtros unificados e ações separadas por origem. Convites/diferenças permanecem nos modais existentes; pedidos usam detalhe, PDF, reenvio e transferência próprios. `/minhas-compras` redireciona para a lista única, acessível também a compradores com outros papéis, sem ampliar o escopo de dados. O painel operacional continua separado. Sem alteração do banco da aplicação.
- **E4 — consumidores e regressões:** conferir detalhes/downloads, convites/atributos/diferenças, operação do organizador e rotas antigas. Aceite da etapa E somente após as quatro partes.
  Em andamento em 04/10: concluída a compatibilidade de links antigos e comprovantes (E4a). A página antiga usa o PDF compartilhado, revalida no servidor antes de baixar, reconhece convites/transferências e aguarda a autenticação. Links legados de pedidos recebem um código de erro explícito e encaminham para o detalhe protegido existente. O endpoint de comprovante deixou de ficar sem resposta: autoriza titular atual, admin ou organizador do evento, exige ingresso válido e não permite download pelo antigo titular. Validação pública mantém seu escopo existente e distingue transferência ativa de inscrição substituída.
  Evidência: 75 testes de integração em banco descartável; cenário adicional de validade pública após transferência aprovado; 57 verificações das páginas antigas em 1366/390/320 px e 90 da lista única; tipos do backend, escopo estrito do frontend e build aprovados (permanecem avisos existentes de bundles grandes/Browserslist). Nenhuma migração ou alteração no banco da aplicação. Falta fechar E4 com a revisão operacional completa do organizador/admin e cenários de convite/atributos/diferenças antes de F.

Implementar contrato normalizado e adaptação das ações de pedidos, especialmente transferência. Extrair o card antigo e integrar a listagem única. Unificar apresentação/download e preservar rotas e consumidores do organizador.

Esta etapa pode ser entregue internamente em partes: leitura; card; detalhes/downloads; operações e transferências; migração dos consumidores. A remoção do bloco separado depende da paridade funcional e de autorização, não apenas da aparência.

**Aceite:** cada ingresso aparece uma vez, com imagem quando disponível, valores corretos, histórico e ações permitidas; ingressos antigos mantêm seus recursos; comprador e convidado não perdem acesso; nenhum botão novo chama operação legada proibida para pedidos.

### Etapa F — homologação e liberação controlada

Validar a jornada completa em ambiente de teste, dispositivos e perfis representativos. Conferir registros, estoque, valores, efeitos financeiros e mensagens antes/depois. Liberar gradualmente, com possibilidade de reverter somente a apresentação/entrada de novas compras.

**Aceite:** cenários críticos abaixo aprovados e divergências resolvidas. Reversão de interface não interrompe conciliação, entrega, consulta ou recuperação de pedidos iniciados. Não converter pedidos existentes em inscrições legadas durante rollback.

Ordem recomendada: **A → B → C → D → E → F**. A definição dos contratos da etapa E começa em A para não precisar refazer os cartões. A revisão de UX entra antes da publicação prevista na etapa 8 do acompanhamento original.

## 6. Verificações obrigatórias na implementação

- Jornada: comprador sozinho, somente terceiros, vários atletas, comprador já inscrito, atleta sem conta com/sem e-mail e conta existente sem exposição de perfil.
- Retomada: rascunho anterior, exclusão do comprador, recarga, voltar, sessão expirada, salvamento com falha, versão concorrente e revisão desatualizada.
- Escolhas: categorias por idade/sexo, identidade manual incompleta, opção única, ausência de kit opcional, variantes esgotadas, lote vencido, campos individuais e cópia incompatível.
- Pagamento: gratuito, PIX, cartão, método desabilitado, expiração, webhook repetido, confirmação tardia, falha, reembolso parcial e total. Sem executar cobranças reais nesta fase de planejamento.
- Ingressos: conta só com dados antigos, só com pedidos e mistura; comprador igual ao atleta; comprador com outro papel; convite; transferência e histórico; imagem ausente; filtros/contagens/paginação coerentes.
- Segurança funcional: impedir acesso por outro comprador, preservar escopo de token, não vincular por e-mail sozinho, não exibir QR válido antes da confirmação nem depois da invalidação.
- Operação: transferência com/sem taxa, confirmação repetida, concorrência com reembolso, retirada e devolução; nenhuma segunda baixa de kit ou comissão duplicada.
- Entrega: mensagens corretas por destinatário, reenvio, convite para completar cadastro e vínculo posterior na mesma inscrição; testar com provedores simulados/ambiente de homologação apropriado.
- Compatibilidade: links e QR antigos, links assinados novos, download individual/conjunto, painel do organizador e ações legadas de diferenças financeiras.
- Interface: larguras de 320, 390, 768 e 1366 px, teclado virtual, toque, zoom, leitor de tela/foco e textos extensos. Validar navegadores móveis reais antes da publicação.

## 7. Dados, migrações e decisões de produto

Esta evolução não justifica, por si só, migrar/recriar ingressos, trocar códigos, reprocessar pagamentos ou atualizar perfis. Preferir adaptação de leitura e reutilização dos registros existentes. Se a compatibilidade de transferência exigir estrutura adicional, projetar migração aditiva específica, com validação de integridade e rollback, antes de executar; não fazer uma conversão em massa por conveniência visual.

Recomendações para orientar a execução:

- Manter visível a opção de comprar apenas para terceiros, mas dar prioridade à inscrição do dono da conta.
- Usar “Escolhas completas” antes da revisão e reservar “Confirmado” para o ingresso liberado pelo servidor.
- Não aplicar cupons automaticamente pela cópia; validar explicitamente o benefício de cada participante.
- Preservar acesso do comprador aos ingressos adquiridos, distinguindo isso do direito de transferir o ingresso após vínculo com a conta do atleta. A política de quem pode transferir em cada situação deve ser definida antes da etapa E.
- Exibir detalhes financeiros do pedido em uma seção expansível da tela existente, sem criar outra listagem de ingressos.

Conclusão da investigação: há base suficiente para reaproveitar o fluxo, o card e os serviços atuais. A mudança precisa corrigir a entrada do comprador e a fragmentação das telas; a parte de maior risco é a compatibilidade das ações sobre pedidos, não a troca do modal por página.


### Inscrição do próprio comprador — 05/10/2026

A investigação da conta de teste revelou um caminho sem orientação: perfil inválido não era incluído no pedido e o checkout só oferecia adicionar terceiros. Agora a resposta do pedido informa as pendências específicas de CPF, nome, nascimento e sexo; a interface prioriza Sua inscrição, destaca a inclusão do comprador válido e não exibe progresso 0 de 0. É possível consultar novamente o cadastro após correção e incluir o comprador no mesmo pedido, preservando a remoção intencional e as demais escolhas.

Foi encontrada uma restrição anterior no ProfileEditDialog e no controller de perfis: somente admin pode alterar identidade. O link para editar perfil foi removido desse bloqueio porque não resolvia o problema. A regra administrativa foi preservada nesta entrega. Revalidação de identidade pela API no checkout não foi implementada: seria uma mudança adicional de permissão/fluxo. A conta de teste não foi alterada no banco da aplicação.

Validação: 26 testes de pedidos no PostgreSQL descartável, incluindo retomada após correção, revisão e reserva com exatamente uma inscrição vinculada ao comprador; regressão de grupo com 34 verificações aprovada; tipos de backend/frontend e build aprovados (avisos existentes de bundles/Browserslist). A revisão operacional E4 continua pendente; esta entrega prioriza o problema de inscrição individual reportado.

Validação final da inscrição individual: 57 verificações de navegador aprovadas, incluindo chegada ao pagamento somente com o comprador em 1366/390/320 px. Não houve cobrança real, envio de mensagens ou alteração do banco da aplicação.
