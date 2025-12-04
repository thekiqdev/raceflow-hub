# Plano: Conexão de Dados do Evento com Visualização e Inscrição

## Objetivo
Conectar todos os dados inseridos pelo organizador no painel de eventos com:
1. A página de visualização do evento (`EventDetails.tsx`)
2. O popup de inscrição (`RegistrationFlow.tsx`)

---

## ETAPA 1: Mapeamento de Dados do Evento
**Objetivo:** Identificar todos os campos disponíveis no evento e verificar o que já está sendo exibido.

### 1.1 Campos do Evento no Backend
- [ ] Verificar schema completo da tabela `events`
- [ ] Listar todos os campos disponíveis (title, description, event_date, location, city, state, banner_url, regulation_url, result_url, status, etc.)
- [ ] Verificar campos adicionais que podem existir

### 1.2 Campos Exibidos na Página EventDetails
- [ ] Mapear o que já está sendo exibido
- [ ] Identificar campos faltantes que precisam ser adicionados
- [ ] Verificar se há dados mockados que precisam ser substituídos

### 1.3 Campos no Popup de Inscrição
- [ ] Verificar quais dados do evento são usados no RegistrationFlow
- [ ] Identificar campos que precisam ser passados do evento

**Endpoints necessários:**
- [ ] Verificar se `GET /api/events/:id` retorna todos os campos necessários
- [ ] Verificar se campos adicionais precisam ser adicionados ao endpoint

---

## ETAPA 2: Dados Básicos do Evento
**Objetivo:** Garantir que todos os dados básicos do evento sejam exibidos corretamente.

### 2.1 Informações Principais
- [ ] Título do evento (`title`)
- [ ] Descrição completa (`description`)
- [ ] Data e hora (`event_date`)
- [ ] Localização completa (`location`, `city`, `state`)

### 2.2 Banner e Imagens
- [ ] Banner do evento (`banner_url`)
- [ ] Exibir banner quando disponível
- [ ] Fallback para imagem padrão quando não houver banner

### 2.3 Links e Documentos
- [ ] Link do regulamento (`regulation_url`)
- [ ] Link de resultados (`result_url`) - quando evento finalizado
- [ ] Botões funcionais para acessar esses links

**Arquivos a modificar:**
- `src/pages/EventDetails.tsx`
- `src/lib/api/events.ts` (se necessário)

---

## ETAPA 3: Informações de Contato e Organizador
**Objetivo:** Exibir informações de contato do organizador na página do evento.

### 3.1 Dados do Organizador
- [ ] Nome do organizador (`organizer_name`)
- [ ] Email de contato (`contact_email` do perfil do organizador)
- [ ] Telefone de contato (`contact_phone` do perfil do organizador)
- [ ] Website (`website_url` do perfil do organizador)
- [ ] Logo da organização (`logo_url` do perfil do organizador)

### 3.2 Componente de Contato
- [ ] Atualizar `ContactDialog.tsx` para usar dados reais
- [ ] Exibir informações de contato quando disponíveis
- [ ] Formulário de contato funcional

**Endpoints necessários:**
- [ ] Verificar se dados do organizador vêm no `GET /api/events/:id`
- [ ] Se não, criar endpoint para buscar dados do organizador do evento

**Arquivos a modificar:**
- `src/pages/EventDetails.tsx`
- `src/components/event/ContactDialog.tsx`
- `backend/src/services/eventsService.ts` (se necessário)

---

## ETAPA 4: Categorias e Preços
**Objetivo:** Garantir que categorias e preços sejam exibidos corretamente.

### 4.1 Exibição de Categorias
- [ ] Listar todas as categorias do evento
- [ ] Exibir nome, distância e preço de cada categoria
- [ ] Mostrar limite de participantes se aplicável
- [ ] Destacar categoria mais barata

### 4.2 Preços e Valores
- [ ] Exibir preço mínimo (categoria mais barata)
- [ ] Exibir range de preços se houver múltiplas categorias
- [ ] Formatação correta de valores em R$

**Arquivos a modificar:**
- `src/pages/EventDetails.tsx` (já conectado, verificar se está completo)
- Verificar se todas as informações estão sendo exibidas

---

## ETAPA 5: Kits e Opções Adicionais
**Objetivo:** Garantir que kits e opções adicionais sejam exibidos e funcionem no fluxo de inscrição.

### 5.1 Exibição de Kits
- [ ] Listar todos os kits disponíveis
- [ ] Exibir nome, descrição e preço de cada kit
- [ ] Mostrar diferença entre kits (o que cada um inclui)

### 5.2 Integração no Fluxo de Inscrição
- [ ] Garantir que kits apareçam no `RegistrationFlow`
- [ ] Permitir seleção de kit durante inscrição
- [ ] Calcular preço total corretamente (categoria + kit)

**Arquivos a modificar:**
- `src/pages/EventDetails.tsx` (já conectado, verificar se está completo)
- `src/components/event/RegistrationFlow.tsx` (verificar se está usando dados reais)

---

## ETAPA 6: Informações Adicionais do Evento
**Objetivo:** Exibir todas as informações adicionais que o organizador pode inserir.

### 6.1 Informações de Localização Detalhada
- [ ] Endereço completo (`location`)
- [ ] Cidade e Estado (`city`, `state`)
- [ ] Mapa ou link para localização (se disponível)

### 6.2 Informações de Data e Horário
- [ ] Data e hora do evento formatadas corretamente
- [ ] Contador regressivo (já existe `FlipCountdown`)
- [ ] Informações sobre horário de largada

### 6.3 Status do Evento
- [ ] Exibir status atual (publicado, em andamento, finalizado)
- [ ] Mostrar resultados quando evento finalizado
- [ ] Bloquear inscrições quando apropriado

**Arquivos a modificar:**
- `src/pages/EventDetails.tsx`

---

## ETAPA 7: Validações e Regras de Negócio
**Objetivo:** Garantir que regras de negócio sejam aplicadas corretamente.

### 7.1 Validações de Inscrição
- [ ] Verificar se evento está aberto para inscrições
- [ ] Verificar limite de participantes por categoria
- [ ] Validar datas (não permitir inscrição em evento passado)
- [ ] Verificar se categoria ainda tem vagas disponíveis

### 7.2 Exibição Condicional
- [ ] Mostrar botão de inscrição apenas se evento estiver aberto
- [ ] Exibir mensagem quando evento estiver lotado
- [ ] Mostrar resultados apenas quando evento finalizado

**Arquivos a modificar:**
- `src/pages/EventDetails.tsx`
- `src/components/event/RegistrationFlow.tsx`
- `backend/src/services/eventsService.ts` (validações)

---

## ETAPA 8: Melhorias de UX e Visualização
**Objetivo:** Melhorar a experiência do usuário na visualização do evento.

### 8.1 Layout e Design
- [ ] Garantir que banner seja exibido corretamente
- [ ] Melhorar layout de informações
- [ ] Adicionar seções bem organizadas

### 8.2 Informações Organizadas
- [ ] Seção de informações principais
- [ ] Seção de categorias e preços
- [ ] Seção de kits disponíveis
- [ ] Seção de contato e organizador
- [ ] Seção de regulamento e documentos

### 8.3 Responsividade
- [ ] Garantir que tudo funcione bem em mobile
- [ ] Testar em diferentes tamanhos de tela

**Arquivos a modificar:**
- `src/pages/EventDetails.tsx`

---

## Resumo de Arquivos a Modificar

### Backend
- `backend/src/services/eventsService.ts` (se necessário adicionar campos)
- `backend/src/controllers/eventsController.ts` (se necessário)

### Frontend
- `src/pages/EventDetails.tsx` (principal)
- `src/components/event/RegistrationFlow.tsx` (verificar dados)
- `src/components/event/ContactDialog.tsx` (dados reais)
- `src/lib/api/events.ts` (verificar interfaces)

---

## Ordem de Execução Recomendada

1. **ETAPA 1** - Mapeamento (análise)
2. **ETAPA 2** - Dados básicos (fundação)
3. **ETAPA 3** - Contato e organizador
4. **ETAPA 4** - Categorias e preços
5. **ETAPA 5** - Kits
6. **ETAPA 6** - Informações adicionais
7. **ETAPA 7** - Validações
8. **ETAPA 8** - Melhorias UX

---

## Notas Importantes

- Algumas funcionalidades já podem estar parcialmente implementadas
- Verificar o que já está funcionando antes de modificar
- Manter compatibilidade com dados existentes
- Testar cada etapa antes de prosseguir



