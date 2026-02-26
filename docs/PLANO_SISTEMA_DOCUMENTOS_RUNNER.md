# Plano de Implementação: Sistema de Documentos do Runner

## 📋 Objetivo
Implementar sistema completo de envio e aprovação de documentos no painel do runner, permitindo que runners enviem documentos (RG, CPF, atestado médico, carteirinhas, etc.) e que administradores possam aprovar ou rejeitar esses documentos.

---

## 🗂️ Estrutura do Banco de Dados

### ETAPA 1: Migration - Criar Tabela de Documentos

**Arquivo:** `backend/migrations/067_create_runner_documents.sql`

```sql
-- Tabela para armazenar documentos dos runners
CREATE TABLE IF NOT EXISTS public.runner_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- 'militar', 'estudante', 'pcd', 'rg', 'cpf', 'atestado_medico', etc.
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER NOT NULL, -- em bytes
  mime_type VARCHAR(100) NOT NULL,
  expiry_date DATE, -- Data de validade (opcional)
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT, -- Motivo da rejeição (se rejeitado)
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin que revisou
  reviewed_at TIMESTAMP WITH TIME ZONE, -- Data da revisão
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_runner_documents_runner_id ON public.runner_documents(runner_id);
CREATE INDEX IF NOT EXISTS idx_runner_documents_status ON public.runner_documents(status);
CREATE INDEX IF NOT EXISTS idx_runner_documents_document_type ON public.runner_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_runner_documents_created_at ON public.runner_documents(created_at DESC);

-- Comentários
COMMENT ON TABLE public.runner_documents IS 'Documentos enviados pelos runners para validação';
COMMENT ON COLUMN public.runner_documents.document_type IS 'Tipo do documento: militar, estudante, pcd, rg, cpf, atestado_medico, etc.';
COMMENT ON COLUMN public.runner_documents.status IS 'Status: pending (pendente), approved (aprovado), rejected (rejeitado)';
COMMENT ON COLUMN public.runner_documents.rejection_reason IS 'Motivo da rejeição (preenchido apenas quando status = rejected)';
```

**Ações:**
- [x] Criar arquivo de migration
- [x] Adicionar migration ao script de execução
- [ ] Testar migration

---

## 🔧 Backend - Services

### ETAPA 2: Service de Documentos

**Arquivo:** `backend/src/services/documentsService.ts`

**Funções a implementar:**
1. `getRunnerDocuments(runnerId: string)` - Buscar documentos de um runner
2. `getDocumentById(documentId: string)` - Buscar documento por ID
3. `createDocument(data: CreateDocumentData)` - Criar novo documento
4. `updateDocumentStatus(documentId: string, status: 'approved' | 'rejected', reviewedBy: string, rejectionReason?: string)` - Atualizar status
5. `deleteDocument(documentId: string, runnerId: string)` - Deletar documento (apenas o próprio runner)
6. `getPendingDocuments()` - Buscar documentos pendentes (para admin)
7. `getDocumentsByStatus(status: string)` - Buscar documentos por status

**Ações:**
- [x] Criar arquivo `documentsService.ts`
- [x] Implementar todas as funções acima
- [x] Adicionar validações (tipo de arquivo, tamanho, etc.)
- [x] Adicionar tratamento de erros

---

## 🎮 Backend - Controllers

### ETAPA 3: Controller de Documentos

**Arquivo:** `backend/src/controllers/documentsController.ts`

**Endpoints a implementar:**

#### Runner Endpoints:
1. `GET /api/documents` - Listar documentos do runner autenticado
2. `POST /api/documents` - Upload de novo documento
3. `GET /api/documents/:id` - Buscar documento específico
4. `DELETE /api/documents/:id` - Deletar documento (apenas próprio)

#### Admin Endpoints:
5. `GET /api/admin/documents` - Listar todos os documentos (com filtros)
6. `GET /api/admin/documents/pending` - Listar documentos pendentes
7. `POST /api/admin/documents/:id/approve` - Aprovar documento
8. `POST /api/admin/documents/:id/reject` - Rejeitar documento

**Ações:**
- [x] Criar arquivo `documentsController.ts`
- [x] Implementar todos os endpoints
- [x] Adicionar autenticação e autorização
- [x] Adicionar validação com Zod
- [ ] Adicionar tratamento de erros

---

## 📤 Backend - Upload Middleware

### ETAPA 4: Extender Middleware de Upload

**Arquivo:** `backend/src/middleware/upload.ts`

**Ações:**
- [x] Adicionar configuração de storage para documentos (`documentsDir`)
- [x] Criar `uploadDocument` multer instance
- [x] Adicionar validação de tipos de arquivo permitidos (PDF, JPG, PNG)
- [x] Adicionar limite de tamanho (10MB)
- [x] Criar diretório `uploads/documents` se não existir
- [x] Atualizar `getFileUrl` e `getFilePath` para suportar documentos

---

## 🛣️ Backend - Rotas

### ETAPA 5: Adicionar Rotas

**Arquivo:** `backend/src/routes/documents.ts` (novo)
**Arquivo:** `backend/src/routes/admin.ts` (adicionar rotas admin)

**Ações:**
- [x] Adicionar rotas do runner em `routes/runnerRoutes.ts`
- [x] Adicionar rotas admin em `routes/adminRoutes.ts`
- [x] Adicionar middlewares de autenticação e autorização
- [x] Integrar middleware de upload (`uploadDocument`)

---

## 🎨 Frontend - API Client

### ETAPA 6: API Client para Documentos

**Arquivo:** `src/lib/api/documents.ts` (novo)

**Funções a implementar:**
1. `getRunnerDocuments()` - Buscar documentos do runner
2. `uploadDocument(data: FormData)` - Upload de documento
3. `deleteDocument(documentId: string)` - Deletar documento
4. `getDocumentById(documentId: string)` - Buscar documento específico
5. `getAllDocuments(filters?)` - Buscar todos (admin)
6. `getPendingDocuments()` - Buscar pendentes (admin)
7. `approveDocument(documentId: string, notes?: string)` - Aprovar (admin)
8. `rejectDocument(documentId: string, reason: string)` - Rejeitar (admin)

**Ações:**
- [x] Criar arquivo `src/lib/api/documents.ts`
- [x] Definir interfaces TypeScript
- [x] Implementar todas as funções
- [x] Adicionar tratamento de erros

---

## 👤 Frontend - Runner: Componente de Documentos

### ETAPA 7: Atualizar DocumentsManagement.tsx

**Arquivo:** `src/components/runner/profile/DocumentsManagement.tsx`

**Funcionalidades:**
1. Listar documentos reais do backend
2. Formulário de upload funcional
3. Seleção de tipo de documento
4. Upload de arquivo com preview
5. Data de validade (opcional)
6. Exibir status (pending, approved, rejected)
7. Permitir deletar documentos próprios
8. Download de documentos aprovados
9. Exibir motivo de rejeição (se rejeitado)

**Ações:**
- [x] Conectar ao backend (usar API client)
- [x] Implementar upload real de arquivo
- [x] Adicionar preview de arquivo antes do upload
- [x] Adicionar validação de tipo e tamanho de arquivo
- [x] Adicionar loading states
- [x] Adicionar tratamento de erros
- [x] Melhorar UI/UX
- [x] Permitir deletar documentos (pendentes/rejeitados)
- [x] Permitir download de documentos aprovados
- [x] Exibir motivo de rejeição

---

## 👨‍💼 Frontend - Admin: Gestão de Documentos

### ETAPA 8: Criar Componente Admin de Documentos

**Arquivo:** `src/components/admin/DocumentsManagement.tsx` (novo)

**Funcionalidades:**
1. Listar todos os documentos com filtros:
   - Por status (pending, approved, rejected)
   - Por tipo de documento
   - Por runner (busca por nome/CPF)
   - Por data de envio
2. Visualizar documento (preview/download)
3. Aprovar documento:
   - Botão de aprovação
   - Campo opcional para notas
4. Rejeitar documento:
   - Botão de rejeição
   - Campo obrigatório para motivo da rejeição
5. Exibir informações do runner:
   - Nome
   - CPF
   - Email
6. Estatísticas:
   - Total de documentos pendentes
   - Total aprovados
   - Total rejeitados

**Ações:**
- [x] Criar componente `DocumentsManagement.tsx` no admin
- [x] Adicionar tabela/listagem de documentos
- [x] Implementar filtros
- [x] Adicionar preview de documentos
- [x] Implementar aprovação/rejeição
- [x] Adicionar estatísticas
- [x] Integrar no AdminSidebar e AdminDashboard

---

## 🔔 Notificações

### ETAPA 9: Sistema de Notificações

**Funcionalidades:**
1. Notificar runner quando documento for aprovado
2. Notificar runner quando documento for rejeitado (com motivo)
3. Notificar admin quando novo documento for enviado (opcional)

**Ações:**
- [x] Criar/atualizar serviço de notificações
- [x] Adicionar notificações para aprovação
- [x] Adicionar notificações para rejeição
- [x] Adicionar notificações para novos documentos (admin)
- [x] Criar templates de notificação padrão

---

## 📁 Estrutura de Diretórios

### ETAPA 10: Organizar Uploads

**Estrutura proposta:**
```
uploads/
  ├── banners/
  ├── regulations/
  └── documents/
      ├── {runner_id}/
      │   ├── {document_id}_{timestamp}.pdf
      │   └── ...
      └── ...
```

**Ações:**
- [x] Criar diretório `uploads/documents` no middleware
- [x] Organizar por runner_id (documentos salvos em `documents/{runner_id}/`)
- [x] Garantir permissões corretas (criação automática de diretórios)
- [x] Renomear arquivo após criação para incluir document_id

---

## 🔒 Segurança e Validações

### ETAPA 11: Implementar Validações

**Validações necessárias:**

1. **Upload:**
   - Tipos permitidos: PDF, JPG, JPEG, PNG
   - Tamanho máximo: 10MB
   - Validação de tipo MIME
   - Sanitização de nome de arquivo

2. **Autorização:**
   - Runner só pode ver/deletar próprios documentos
   - Admin pode ver todos e aprovar/rejeitar
   - Validação de propriedade antes de deletar

3. **Dados:**
   - Validar tipo de documento (enum)
   - Validar data de validade (se fornecida)
   - Validar motivo de rejeição (obrigatório ao rejeitar)

**Ações:**
- [x] Implementar todas as validações
  - [x] Validação de tipo MIME e extensão (dupla verificação)
  - [x] Validação de tamanho máximo (10MB)
  - [x] Sanitização de nome de arquivo (prevenção de path traversal)
  - [x] Validação de data de validade (deve ser futura e válida)
  - [x] Validação de motivo de rejeição (obrigatório e sanitizado)
  - [x] Validação de propriedade (runner só pode acessar próprios documentos)
  - [x] Validação de status (não pode aprovar/rejeitar documento já no mesmo status)
  - [x] Validação de race conditions (verificação dupla antes de deletar)
- [ ] Adicionar testes de segurança (opcional - pode ser feito depois)
- [ ] Adicionar rate limiting (opcional - pode ser feito depois)

---

## 📊 Tipos de Documentos

### ETAPA 12: Definir Tipos de Documentos

**Tipos sugeridos:**
- `militar` - Carteira de Reservista/Militar
- `estudante` - Carteirinha de Estudante
- `pcd` - Documento de Pessoa com Deficiência
- `rg` - RG (Registro Geral)
- `cpf` - CPF
- `atestado_medico` - Atestado Médico
- `comprovante_residencia` - Comprovante de Residência
- `outro` - Outro tipo

**Ações:**
- [ ] Definir lista completa de tipos
- [ ] Criar enum/constante no backend
- [ ] Adicionar ao select no frontend
- [ ] Documentar cada tipo

---

## 🧪 Testes

### ETAPA 13: Testes

**Testes a implementar:**

1. **Backend:**
   - Testar upload de documento
   - Testar listagem de documentos
   - Testar aprovação/rejeição
   - Testar validações
   - Testar autorizações

2. **Frontend:**
   - Testar upload
   - Testar listagem
   - Testar aprovação/rejeição (admin)
   - Testar validações de formulário

**Ações:**
- [ ] Criar testes unitários
- [ ] Criar testes de integração
- [ ] Testar fluxo completo

---

## 📝 Documentação

### ETAPA 14: Documentação

**Ações:**
- [ ] Documentar endpoints da API
- [ ] Documentar tipos de documentos
- [ ] Adicionar exemplos de uso
- [ ] Documentar fluxo de aprovação

---

## ✅ Checklist de Implementação

### Fase 1: Backend (Fundação)
- [ ] ETAPA 1: Migration - Criar tabela
- [ ] ETAPA 2: Service de documentos
- [ ] ETAPA 4: Extender middleware de upload
- [ ] ETAPA 5: Adicionar rotas
- [ ] ETAPA 3: Controller de documentos
- [ ] ETAPA 11: Validações e segurança

### Fase 2: Frontend Runner
- [ ] ETAPA 6: API Client
- [ ] ETAPA 7: Atualizar DocumentsManagement.tsx

### Fase 3: Frontend Admin
- [ ] ETAPA 8: Criar componente admin

### Fase 4: Melhorias
- [ ] ETAPA 9: Notificações
- [ ] ETAPA 10: Organizar estrutura de diretórios
- [ ] ETAPA 12: Definir tipos de documentos
- [ ] ETAPA 13: Testes
- [ ] ETAPA 14: Documentação

---

## 🎯 Ordem de Implementação Recomendada

1. **ETAPA 1** - Migration (base de dados)
2. **ETAPA 4** - Upload middleware (infraestrutura)
3. **ETAPA 2** - Service (lógica de negócio)
4. **ETAPA 3** - Controller (API)
5. **ETAPA 5** - Rotas (conectar tudo)
6. **ETAPA 6** - API Client (frontend)
7. **ETAPA 7** - Componente Runner (funcionalidade básica)
8. **ETAPA 8** - Componente Admin (aprovação)
9. **ETAPA 9** - Notificações (melhorias)
10. **ETAPA 10-14** - Organização, testes e documentação

---

## 📌 Observações Importantes

1. **Armazenamento:** Usar o mesmo sistema de volumes persistentes já configurado para banners/regulamentos
2. **Segurança:** Validar sempre que o runner só acessa seus próprios documentos
3. **Performance:** Considerar paginação para listagem de documentos (admin)
4. **UX:** Adicionar feedback visual claro para cada ação (upload, aprovação, rejeição)
5. **Histórico:** Considerar manter histórico de alterações de status (opcional, para versão futura)

---

## 🔄 Fluxo Completo

1. **Runner envia documento:**
   - Seleciona tipo de documento
   - Faz upload do arquivo
   - Opcionalmente informa data de validade
   - Documento é salvo com status `pending`

2. **Admin visualiza documento:**
   - Vê lista de documentos pendentes
   - Pode visualizar/preview do documento
   - Vê informações do runner

3. **Admin aprova/rejeita:**
   - Se aprovar: status muda para `approved`, runner é notificado
   - Se rejeitar: status muda para `rejected`, motivo é salvo, runner é notificado

4. **Runner vê resultado:**
   - Documentos aprovados aparecem com badge verde
   - Documentos rejeitados aparecem com badge vermelho e motivo
   - Pode deletar documentos próprios
   - Pode enviar novo documento se rejeitado

---

**Status:** ✅ Implementação Completa (Backend + Frontend + Notificações + Organização + Validações)

**Progresso:**
- ✅ ETAPA 1: Migration criada e adicionada ao script
- ✅ ETAPA 2: Service de documentos implementado
- ✅ ETAPA 3: Controller de documentos implementado
- ✅ ETAPA 4: Upload middleware implementado
- ✅ ETAPA 5: Rotas implementadas
- ✅ ETAPA 6: API Client implementado
- ✅ ETAPA 7: Componente Runner implementado
- ✅ ETAPA 8: Componente Admin implementado
- ✅ ETAPA 9: Sistema de Notificações implementado
- ✅ ETAPA 10: Organização de Uploads implementada
- ✅ ETAPA 11: Validações de Segurança implementadas

**Próximas melhorias (opcionais):**
- ETAPA 12-14: Tipos de documentos, testes e melhorias
