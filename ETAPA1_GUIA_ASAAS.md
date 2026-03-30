# Etapa 1: Configuração Inicial - Guia Passo a Passo

## ✅ 1.1 Criar Conta no Asaas

### Sandbox (Ambiente de Testes)

1. **Acesse o site do Asaas Sandbox:**
   - URL: https://sandbox.asaas.com
   - Clique em "Criar Conta" ou "Cadastre-se"

2. **Preencha os dados:**
   - Nome completo
   - Email
   - CPF/CNPJ
   - Telefone
   - Senha

3. **Confirme seu email:**
   - Verifique sua caixa de entrada
   - Clique no link de confirmação

4. **Obter API Key:**
   - Faça login no painel
   - Vá em "Minha Conta" > "Integrações" > "Chaves de API"
   - Clique em "Gerar nova chave"
   - **Copie a chave gerada** (você só verá ela uma vez!)
   - Guarde em local seguro

5. **Obter Webhook Token (será configurado na Etapa 4):**
   - Vá em "Configurações" > "Webhooks"
   - Por enquanto, apenas anote onde está essa seção
   - O token será gerado quando configurarmos o webhook

### Produção (Ambiente Real)

⚠️ **Importante:** Só crie a conta de produção após testar tudo no sandbox!

1. **Acesse o site do Asaas:**
   - URL: https://www.asaas.com
   - Siga os mesmos passos do sandbox

2. **Obter API Key de Produção:**
   - Mesmo processo: "Minha Conta" > "Integrações" > "Chaves de API"
   - Gere uma nova chave para produção
   - **Nunca use a chave de sandbox em produção!**

## ✅ 1.2 Configurar Variáveis de Ambiente

### Arquivo `.env` do Backend

1. **Localize o arquivo `.env` no diretório `backend/`**
   - Se não existir, copie o arquivo `env.example` para `.env`

2. **Adicione as seguintes variáveis:**

```env
# ============================================
# Asaas Payment Gateway Configuration
# ============================================
ASAAS_API_KEY=sua_chave_api_sandbox_aqui
ASAAS_WEBHOOK_TOKEN=seu_token_webhook_aqui
ASAAS_ENVIRONMENT=sandbox
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
```

3. **Substitua os valores:**
   - `sua_chave_api_sandbox_aqui` → Cole a API Key que você copiou do Asaas Sandbox
   - `seu_token_webhook_aqui` → Por enquanto, deixe como `your_webhook_token_here` (será configurado na Etapa 4)

### Exemplo de `.env` completo:

```env
# ... outras variáveis existentes ...

# Asaas Configuration
ASAAS_API_KEY=$aact_YTU5YTE0M2M2N2I4MTliNzk0YjNhY2ZhYzExZjFjMDQ6OjAwMDAwMDAwMDAwMDAwMDAwMDA6OiRhYWNoX2E3YjE0YzE4LWE4YzEtNDY5ZC1hYjY3LWE4YzE0YzE4YzE4
ASAAS_WEBHOOK_TOKEN=your_webhook_token_here
ASAAS_ENVIRONMENT=sandbox
ASAAS_API_URL=https://sandbox.asaas.com/api/v3
```

⚠️ **IMPORTANTE:**
- Nunca commite o arquivo `.env` no Git!
- O arquivo `.env.example` já foi atualizado com as variáveis (sem valores reais)
- Use valores diferentes para sandbox e produção

## ✅ 1.3 Instalar Dependências

### Verificar se axios está instalado

O axios já foi instalado automaticamente. Para verificar:

```bash
cd backend
npm list axios
```

Se não estiver instalado, execute:

```bash
npm install axios
```

### Verificar outras dependências

Todas as dependências necessárias já estão no `package.json`:
- ✅ `axios` - Para requisições HTTP ao Asaas
- ✅ `dotenv` - Para carregar variáveis de ambiente
- ✅ `express` - Framework web
- ✅ `pg` - Cliente PostgreSQL
- ✅ `zod` - Validação de dados

## 📋 Checklist da Etapa 1

- [ ] Conta criada no Asaas Sandbox
- [ ] API Key do Sandbox obtida e copiada
- [ ] Conta criada no Asaas Produção (opcional por enquanto)
- [ ] API Key de Produção obtida (opcional por enquanto)
- [ ] Arquivo `.env` atualizado com as variáveis do Asaas
- [ ] API Key do Sandbox configurada no `.env`
- [ ] Axios instalado (verificado)
- [ ] Todas as dependências verificadas

## 🚀 Próximos Passos

Após completar a Etapa 1, você estará pronto para:
- **Etapa 2:** Criar as migrations do banco de dados
- **Etapa 3:** Criar o serviço de integração com Asaas

## ❓ Dúvidas Frequentes

**P: Posso usar a mesma API Key para sandbox e produção?**
R: Não! Cada ambiente tem sua própria API Key. Use sempre a chave correta para cada ambiente.

**P: O que fazer se perder a API Key?**
R: Gere uma nova chave no painel do Asaas. A chave antiga será desativada automaticamente.

**P: Posso pular a criação da conta de produção por enquanto?**
R: Sim! Você pode criar apenas a conta do sandbox para começar os testes. A conta de produção pode ser criada depois.

**P: O webhook token é obrigatório agora?**
R: Não. O webhook será configurado na Etapa 4. Por enquanto, deixe um valor placeholder.

## 📞 Suporte

- Documentação Asaas: https://docs.asaas.com/
- Suporte Asaas: Através do painel do Asaas


