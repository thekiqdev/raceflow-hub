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

## ⚙️ Variável de Ambiente Opcional

O código agora suporta uma variável de ambiente `UPLOADS_DIR` para customizar o caminho de uploads (opcional):

```env
UPLOADS_DIR=/app/uploads
```

**Nota**: Se não configurada, o sistema usa o caminho padrão `/app/uploads`, que é o correto para o volume Docker.

## 🔄 Alternativa: Migração para Armazenamento em Nuvem

Para uma solução mais robusta e escalável, considere migrar para:
- **AWS S3**
- **Google Cloud Storage**
- **Azure Blob Storage**
- **DigitalOcean Spaces**

Isso requer alterações no código para usar SDKs de armazenamento em nuvem ao invés de `multer.diskStorage`.

## ✅ O que foi corrigido no código

1. **docker-compose.prod.yml**: Adicionado volume persistente `uploads_data:/app/uploads`
2. **backend/src/middleware/upload.ts**: Suporte para variável `UPLOADS_DIR`
3. **backend/src/server.ts**: Suporte para variável `UPLOADS_DIR` no servidor de arquivos estáticos
4. **Documentação**: Criado guia completo em `docs/CONFIGURACAO_VOLUMES_EASYPANEL.md`
