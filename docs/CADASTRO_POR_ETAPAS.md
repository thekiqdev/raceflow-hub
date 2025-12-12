# 📋 Documentação: Cadastro por Etapas

## 🎯 Objetivo
Modificar o sistema de cadastro atual para um cadastro em etapas (multi-step), melhorando a experiência do usuário e organizando melhor a coleta de informações.

---

## 📊 Análise do Estado Atual

### Campos Atuais no Cadastro
- ✅ Nome Completo (`full_name`)
- ✅ CPF (`cpf`)
- ✅ Telefone (`phone`)
- ✅ Data de Nascimento (`birth_date`)
- ✅ Gênero (`gender`) - campo texto livre
- ✅ E-mail (`email`)
- ✅ Senha (`password`)
- ✅ Consentimento LGPD (`lgpd_consent`)

### Campos Faltantes (Novos)
- ❌ Como você quer ser chamado(a)? (`preferred_name` ou `nickname`)
- ❌ CEP (`postal_code` ou `zip_code`)
- ❌ Logradouro (`street` ou `address`)
- ❌ Número (`address_number`)
- ❌ Complemento (`address_complement`)
- ❌ Bairro (`neighborhood` ou `district`)
- ❌ Cidade (`city`)
- ❌ Estado (`state`)
- ❌ Confirmação de E-mail (validação frontend)
- ❌ Confirmação de Senha (validação frontend)

---

## 🗂️ Estrutura Proposta: 4 Etapas

### **ETAPA 1: Dados Pessoais Básicos**
**Objetivo:** Coletar informações de identificação essenciais

**Campos:**
1. CPF (com máscara e validação)
2. Data de Nascimento (date picker)
3. Contato/Telefone (com máscara)
4. Nome Completo
5. Como você quer ser chamado(a)? (campo opcional)
6. Sexo: Masculino | Feminino (select)

**Validações:**
- CPF válido e único
- Data de nascimento válida 
- Telefone válido (formato brasileiro)
- Nome completo obrigatório (mínimo 3 caracteres)

---

### **ETAPA 2: Endereço**
**Objetivo:** Coletar informações de localização

**Campos:**
1. CEP (com busca automática via API ViaCEP)
2. Logradouro (preenchido automaticamente via CEP)
3. Número (obrigatório)
4. Complemento (opcional)
5. Bairro (preenchido automaticamente via CEP)
6. Cidade (preenchida automaticamente via CEP)
7. Estado (preenchido automaticamente via CEP - dropdown)

**Validações:**
- CEP válido (formato: 00000-000)
- Busca automática de endereço via ViaCEP ao digitar CEP
- Número obrigatório
- Campos de endereço preenchidos automaticamente quando possível

**Integração ViaCEP:**
- API: `https://viacep.com.br/ws/{cep}/json/`
- Preencher automaticamente: logradouro, bairro, cidade, estado

---

### **ETAPA 3: Credenciais de Acesso**
**Objetivo:** Criar conta de acesso ao sistema

**Campos:**
1. E-mail
2. Confirme seu e-mail (validação de correspondência)
3. Senha (mínimo 6 caracteres, mostrar requisitos)
4. Confirme sua senha (validação de correspondência)

**Validações:**
- E-mail válido e único no sistema
- Confirmação de e-mail deve corresponder
- Senha com requisitos mínimos (exibir indicadores visuais)
- Confirmação de senha deve corresponder
- Verificar se e-mail já existe antes de avançar

**Indicadores de Senha:**
- Mínimo 6 caracteres
- Indicador visual de força da senha (opcional)

---

### **ETAPA 4: Confirmação e Termos**
**Objetivo:** Revisar dados e aceitar termos

**Conteúdo:**
1. Resumo dos dados preenchidos (read-only)
   - Dados Pessoais
   - Endereço
   - E-mail
2. Checkbox: "Aceito os termos de uso e política de privacidade (LGPD)"
3. Botão "Finalizar Cadastro"

**Validações:**
- Termos devem ser aceitos para finalizar
- Exibir dados para revisão antes de submeter

---

## 🗄️ Alterações no Banco de Dados

### Tabela: `profiles`

**Campos a Adicionar:**
```sql
-- Nome preferido/apelido
preferred_name VARCHAR(100) NULL,

-- Endereço completo
postal_code VARCHAR(10) NULL,           -- CEP (formato: 00000-000)
street VARCHAR(255) NULL,               -- Logradouro
address_number VARCHAR(20) NULL,        -- Número
address_complement VARCHAR(100) NULL,    -- Complemento
neighborhood VARCHAR(100) NULL,          -- Bairro
city VARCHAR(100) NULL,                  -- Cidade
state VARCHAR(2) NULL,                   -- Estado (UF - 2 caracteres)
```

**Migration Necessária:**
- Criar migration `029_add_address_fields_to_profiles.sql`
- Adicionar campos de endereço
- Adicionar campo `preferred_name`
- Atualizar campo `gender` para ENUM ou manter VARCHAR com validação

---

## 🎨 Alterações no Frontend

### Componente: `MultiStepRegistration.tsx` (Novo)

**Estrutura:**
```typescript
interface RegistrationData {
  // Etapa 1: Dados Pessoais
  cpf: string;
  birthDate: string;
  phone: string;
  fullName: string;
  preferredName?: string;
  gender: 'M' | 'F';
  
  // Etapa 2: Endereço
  postalCode: string;
  street: string;
  addressNumber: string;
  addressComplement?: string;
  neighborhood: string;
  city: string;
  state: string;
  
  // Etapa 3: Credenciais
  email: string;
  confirmEmail: string;
  password: string;
  confirmPassword: string;
  
  // Etapa 4: Termos
  lgpdConsent: boolean;
}
```

**Funcionalidades:**
- Navegação entre etapas (Anterior/Próximo)
- Validação por etapa antes de avançar
- Indicador de progresso (1/4, 2/4, 3/4, 4/4)
- Salvar dados no localStorage (opcional - para não perder dados)
- Integração com ViaCEP para busca de endereço
- Validação de e-mail único antes de avançar para etapa 4

---

## 🔧 Alterações no Backend

### 1. Service: `authService.ts`

**Atualizar Interface `RegisterData`:**
```typescript
export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  cpf: string;
  phone: string;
  gender?: 'M' | 'F';
  birth_date: string;
  preferred_name?: string;
  postal_code?: string;
  street?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  lgpd_consent: boolean;
}
```

**Atualizar Função `register`:**
- Incluir novos campos na inserção do profile
- Validar campos de endereço (se fornecidos)
- Validar formato de CEP

### 2. Controller: `authController.ts`

**Atualizar Endpoint de Registro:**
- Aceitar novos campos no body
- Validar dados antes de processar
- Retornar erros específicos por campo

### 3. Service: `profilesService.ts`

**Atualizar Interface `Profile`:**
- Adicionar novos campos de endereço
- Adicionar `preferred_name`

---

## 📝 Plano de Implementação em 4 Etapas

### **ETAPA DE IMPLEMENTAÇÃO 1: Banco de Dados e Backend**
**Objetivo:** Preparar estrutura de dados

**Tarefas:**
1. ✅ Criar migration `029_add_address_fields_to_profiles.sql`
2. ✅ Adicionar campo `preferred_name` na migration
3. ✅ Atualizar interface `RegisterData` no `authService.ts`
4. ✅ Atualizar função `register` para incluir novos campos
5. ✅ Atualizar interface `Profile` no `profilesService.ts`
6. ✅ Testar endpoint de registro com novos campos
7. ✅ Executar migration no banco de dados

**Arquivos a Modificar:**
- `backend/migrations/029_add_address_fields_to_profiles.sql` (NOVO)
- `backend/src/services/authService.ts`
- `backend/src/services/profilesService.ts`
- `backend/src/types/index.ts`

**Critérios de Sucesso:**
- Migration executada com sucesso
- Endpoint de registro aceita novos campos
- Dados são salvos corretamente no banco

---

### **ETAPA DE IMPLEMENTAÇÃO 2: Componente Multi-Step (Estrutura Base)**
**Objetivo:** Criar estrutura do componente de cadastro por etapas

**Tarefas:**
1. ✅ Criar componente `MultiStepRegistration.tsx`
2. ✅ Implementar navegação entre etapas
3. ✅ Criar indicador de progresso
4. ✅ Implementar validação básica por etapa
5. ✅ Criar estados para cada etapa
6. ✅ Implementar botões de navegação (Anterior/Próximo)

**Arquivos a Criar/Modificar:**
- `src/components/MultiStepRegistration.tsx` (NOVO)
- `src/components/ui/progress.tsx` (se não existir)

**Critérios de Sucesso:**
- Componente renderiza 4 etapas
- Navegação entre etapas funciona
- Indicador de progresso exibido
- Validação básica impede avanço com campos inválidos

---

### **ETAPA DE IMPLEMENTAÇÃO 3: Implementação das Etapas 1 e 2**
**Objetivo:** Implementar formulários das etapas de dados pessoais e endereço

**Tarefas:**
1. ✅ Implementar Etapa 1: Dados Pessoais
   - Campos: CPF, Data Nascimento, Telefone, Nome, Nome Preferido, Sexo
   - Máscaras de CPF e Telefone
   - Validação de CPF
   - Select para Sexo (Masculino/Feminino)
2. ✅ Implementar Etapa 2: Endereço
   - Campo CEP com máscara
   - Integração com ViaCEP API
   - Preenchimento automático de endereço
   - Campos: Logradouro, Número, Complemento, Bairro, Cidade, Estado
   - Validação de CEP

**Arquivos a Modificar:**
- `src/components/MultiStepRegistration.tsx`
- `src/lib/utils/masks.ts` (criar se não existir - máscaras)
- `src/lib/utils/validators.ts` (criar se não existir - validações)
- `src/lib/api/viacep.ts` (NOVO - integração ViaCEP)

**Dependências:**
- Biblioteca de máscaras (ex: `react-input-mask` ou similar)
- Função de validação de CPF

**Critérios de Sucesso:**
- Etapa 1 valida todos os campos corretamente
- Etapa 2 busca endereço via CEP automaticamente
- Máscaras aplicadas corretamente
- Validações impedem avanço com dados inválidos

---

### **ETAPA DE IMPLEMENTAÇÃO 4: Implementação das Etapas 3 e 4 + Integração**
**Objetivo:** Finalizar cadastro e integrar com backend

**Tarefas:**
1. ✅ Implementar Etapa 3: Credenciais
   - Campos: E-mail, Confirmar E-mail, Senha, Confirmar Senha
   - Validação de correspondência de e-mails
   - Validação de correspondência de senhas
   - Verificação de e-mail único (chamada ao backend)
   - Indicador de força de senha (opcional)
2. ✅ Implementar Etapa 4: Confirmação
   - Exibir resumo dos dados (read-only)
   - Checkbox de termos LGPD
   - Botão "Finalizar Cadastro"
3. ✅ Integrar com Backend
   - Chamada ao endpoint de registro
   - Tratamento de erros
   - Redirecionamento após sucesso
   - Loading states
4. ✅ Substituir `LoginDialog.tsx` antigo
   - Manter apenas login no `LoginDialog.tsx`
   - Criar rota/página separada para cadastro
   - Ou integrar `MultiStepRegistration` no `LoginDialog`

**Arquivos a Modificar:**
- `src/components/MultiStepRegistration.tsx`
- `src/components/LoginDialog.tsx` (remover cadastro ou criar separado)
- `src/lib/api/auth.ts` (verificar se precisa atualizar)
- `src/pages/Auth.tsx` (se existir - adicionar rota de cadastro)

**Critérios de Sucesso:**
- Etapa 3 valida e-mails e senhas corretamente
- Etapa 4 exibe resumo e permite finalizar
- Cadastro completo funciona end-to-end
- Usuário é redirecionado após cadastro bem-sucedido
- Erros são exibidos adequadamente

---

## 🔍 Pontos de Atenção

### Validações Importantes
1. **CPF:** Deve ser único e válido (algoritmo de validação)
2. **E-mail:** Deve ser único e válido (formato e domínio)
3. **CEP:** Deve ser válido e buscar endereço automaticamente
4. **Senha:** Mínimo 6 caracteres (pode adicionar mais requisitos)
5. **Data de Nascimento:** Validar idade mínima se necessário

### UX/UI
1. **Progresso Visual:** Indicador claro de qual etapa está
2. **Validação em Tempo Real:** Mostrar erros enquanto usuário digita
3. **Salvamento Temporário:** Salvar no localStorage para não perder dados
4. **Mensagens de Erro:** Claras e específicas por campo
5. **Loading States:** Mostrar carregamento durante validações e submissão

### Performance
1. **Debounce na busca de CEP:** Aguardar usuário parar de digitar
2. **Validação de E-mail Único:** Fazer apenas quando necessário (antes de finalizar)
3. **Otimização de Re-renders:** Usar React.memo onde apropriado

### Segurança
1. **Validação Backend:** Sempre validar no backend também
2. **Sanitização:** Limpar dados antes de salvar
3. **LGPD:** Garantir consentimento explícito

---

## 📦 Dependências Necessárias

### Frontend
- `react-input-mask` ou similar (máscaras de CPF, telefone, CEP)
- Biblioteca de validação (opcional - pode usar validação manual)

### Backend
- Nenhuma dependência adicional necessária

---

## ✅ Checklist Final

### Banco de Dados
- [ ] Migration criada e testada
- [ ] Campos adicionados à tabela `profiles`
- [ ] Dados antigos migrados (se necessário)

### Backend
- [ ] Interface `RegisterData` atualizada
- [ ] Função `register` atualizada
- [ ] Interface `Profile` atualizada
- [ ] Endpoint testado com novos campos
- [ ] Validações implementadas

### Frontend
- [ ] Componente `MultiStepRegistration` criado
- [ ] Etapa 1 implementada e testada
- [ ] Etapa 2 implementada e testada
- [ ] Etapa 3 implementada e testada
- [ ] Etapa 4 implementada e testada
- [ ] Integração com backend funcionando
- [ ] Validações funcionando
- [ ] Máscaras aplicadas
- [ ] Integração ViaCEP funcionando
- [ ] Mensagens de erro adequadas
- [ ] Loading states implementados
- [ ] Testes de fluxo completo

---

## 🚀 Próximos Passos

1. Revisar esta documentação
2. Aprovar plano de implementação
3. Iniciar **ETAPA DE IMPLEMENTAÇÃO 1**
4. Testar cada etapa antes de avançar
5. Fazer code review após cada etapa

---

**Data de Criação:** 2025-12-12  
**Última Atualização:** 2025-12-12  
**Versão:** 1.0

