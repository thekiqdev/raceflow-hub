# 📦 Configuração de Volumes Persistentes no Easypanel

## 🔴 Problema Identificado

Quando o container do backend é recriado durante atualizações/deploy, **todos os arquivos de upload (banners e regulamentos) são perdidos** porque estão armazenados dentro do container, não em um volume persistente.

## ✅ Solução: Configurar Volume Persistente

### Passo 1: Configurar Volume no Easypanel

1. Acesse o serviço do **backend** no Easypanel
2. Vá na aba **"Volumes"** ou **"Storage"**
3. Clique em **"Add Volume"** ou **"Adicionar Volume"**
4. Configure:
   - **Path no Container**: `/app/uploads`
   - **Tipo**: Volume Persistente (Persistent Volume)
   - **Nome** (opcional): `uploads_data` ou `cronoteam_uploads`

### Passo 2: Verificar Configuração

Após adicionar o volume, o Easypanel deve mostrar algo como:

```
Volume: uploads_data
Mount Path: /app/uploads
Type: Persistent
```

### Passo 3: Reiniciar o Serviço

1. Após configurar o volume, **reinicie o serviço do backend**
2. Isso garantirá que o volume seja montado corretamente

## 🔍 Verificação

Após configurar o volume, você pode verificar se está funcionando:

1. Faça upload de uma imagem ou regulamento
2. Reinicie o container do backend
3. Verifique se o arquivo ainda está acessível

## 📝 Notas Importantes

- **Backup**: Mesmo com volumes persistentes, é recomendado fazer backup regular dos arquivos
- **Espaço**: Monitore o uso de espaço do volume
- **Migração**: Se você já tem arquivos no container, eles serão perdidos na primeira vez que montar o volume. Considere fazer backup antes.

## 🚨 Importante para Deploy Atual

Se você já tem arquivos no sistema atual:

1. **Antes de configurar o volume**, faça backup dos arquivos existentes (se possível)
2. Configure o volume conforme instruções acima
3. Reinicie o serviço
4. Os novos uploads serão salvos no volume persistente

## ⚙️ Variável de Ambiente (Recomendado)

**IMPORTANTE**: Configure a variável de ambiente `UPLOADS_DIR` no Easypanel para garantir que o caminho esteja correto:

1. Acesse o serviço do **backend** no Easypanel
2. Vá na aba **"Environment Variables"** ou **"Variáveis de Ambiente"**
3. Adicione ou verifique se existe:
   ```env
   UPLOADS_DIR=/app/uploads
   ```
4. Salve e reinicie o serviço

**Nota**: Se não configurada, o sistema usa automaticamente `/app/uploads` em produção, mas é recomendado configurar explicitamente para evitar problemas.

## 🔄 Alternativa: Migração para Armazenamento em Nuvem

Para uma solução mais robusta e escalável, considere migrar para:
- **AWS S3**
- **Google Cloud Storage**
- **Azure Blob Storage**
- **DigitalOcean Spaces**

Isso requer alterações no código para usar SDKs de armazenamento em nuvem ao invés de `multer.diskStorage`.

## 🔧 Troubleshooting

### Problema: Arquivos desaparecem após deploy

**Causa**: O volume não está configurado ou montado incorretamente.

**Solução**:
1. Verifique se o volume está configurado no Easypanel (aba "Volumes")
2. Verifique se o caminho do volume é `/app/uploads`
3. Verifique se a variável `UPLOADS_DIR=/app/uploads` está configurada
4. Reinicie o serviço após configurar o volume
5. Verifique os logs do backend ao iniciar - deve mostrar:
   ```
   📁 Uploads configuration: { uploadsDir: '/app/uploads', ... }
   📁 Static files configuration: { uploadsStaticDir: '/app/uploads', ... }
   ```

### Problema: Arquivos não são acessíveis via URL

**Causa**: O servidor de arquivos estáticos não está configurado corretamente.

**Solução**:
1. Verifique se `UPLOADS_DIR` está definido como `/app/uploads`
2. Verifique se o volume está montado no caminho correto
3. Verifique os logs do backend para ver qual caminho está sendo usado

### Verificar se o volume está funcionando

1. Faça upload de uma imagem
2. Verifique os logs do backend - deve mostrar o caminho completo onde o arquivo foi salvo
3. Reinicie o container do backend
4. Verifique se a imagem ainda está acessível

## ✅ O que foi corrigido no código

1. **docker-compose.prod.yml**: Adicionado volume persistente `uploads_data:/app/uploads`
2. **backend/src/middleware/upload.ts**: 
   - Padronizado para usar `/app/uploads` em produção quando `UPLOADS_DIR` não está definido
   - Adicionados logs detalhados para debug
3. **backend/src/server.ts**: 
   - Padronizado para usar `/app/uploads` em produção quando `UPLOADS_DIR` não está definido
   - Adicionados logs detalhados para debug
4. **Documentação**: Criado guia completo em `docs/CONFIGURACAO_VOLUMES_EASYPANEL.md`
