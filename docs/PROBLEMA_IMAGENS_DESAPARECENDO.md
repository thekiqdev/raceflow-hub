# 🔴 Problema: Imagens Desaparecendo Após Deploy

## 📋 Descrição do Problema

Quando você faz um redeploy no Easypanel, as imagens (banners) e regulamentos (PDFs) que foram enviados para os eventos desaparecem.

## 🔍 Causa Raiz

O problema ocorre porque:

1. **Sem volume persistente**: Os arquivos são salvos dentro do container Docker em `/app/uploads`
2. **Container é recriado**: Quando você faz deploy, o Easypanel recria o container do zero
3. **Arquivos são perdidos**: Como os arquivos estão dentro do container (não em um volume), eles são perdidos

## ✅ Solução: Configurar Volume Persistente

### Passo 1: Configurar Volume no Easypanel

**⚠️ IMPORTANTE**: Faça isso ANTES de fazer uploads, ou os arquivos existentes serão perdidos!

1. Acesse o serviço do **backend** no Easypanel
2. Vá na aba **"Volumes"** ou **"Storage"**
3. Clique em **"Add Volume"** ou **"Adicionar Volume"**
4. Configure:
   - **Path no Container**: `/app/uploads`
   - **Tipo**: Volume Persistente (Persistent Volume)
   - **Nome** (opcional): `uploads_data` ou `cronoteam_uploads`

### Passo 2: Configurar Variável de Ambiente

1. Acesse o serviço do **backend** no Easypanel
2. Vá na aba **"Environment Variables"** ou **"Variáveis de Ambiente"**
3. Adicione ou verifique se existe:
   ```env
   UPLOADS_DIR=/app/uploads
   ```
4. Salve as alterações

### Passo 3: Reiniciar o Serviço

1. Após configurar o volume e a variável, **reinicie o serviço do backend**
2. Isso garantirá que o volume seja montado corretamente

### Passo 4: Verificar Logs

Após reiniciar, verifique os logs do backend. Você deve ver:

```
📁 Uploads configuration: { uploadsDir: '/app/uploads', ... }
📁 Static files configuration: { uploadsStaticDir: '/app/uploads', ... }
✅ Uploads directory exists: /app/uploads (isDirectory: true)
✅ Uploads directory is writable
```

Se você ver mensagens de erro como:
```
❌ CRITICAL: Uploads directory does not exist
❌ CRITICAL: Uploads directory is NOT writable
```

Significa que o volume não está configurado corretamente.

## 🔄 O Que Acontece Agora

### Antes (Sem Volume):
1. Upload de imagem → Salva em `/app/uploads/banners/banner-123.jpg` (dentro do container)
2. Deploy → Container é recriado
3. Arquivo perdido → `/app/uploads` é recriado vazio
4. Imagem não encontrada → URL retorna 404

### Depois (Com Volume):
1. Upload de imagem → Salva em `/app/uploads/banners/banner-123.jpg` (no volume persistente)
2. Deploy → Container é recriado, mas volume permanece
3. Arquivo preservado → Volume é remontado em `/app/uploads`
4. Imagem acessível → URL funciona normalmente

## 🚨 Importante: Arquivos Existentes

Se você já tem arquivos no sistema atual:

1. **Antes de configurar o volume**: Os arquivos existentes estão dentro do container antigo
2. **Após configurar o volume**: O volume será montado vazio (primeira vez)
3. **Novos uploads**: Serão salvos no volume persistente
4. **Arquivos antigos**: Infelizmente, serão perdidos se o container antigo já foi removido

**Solução temporária**: Se você ainda tem acesso ao container antigo, pode copiar os arquivos:
```bash
# Conecte-se ao container antigo (se ainda existir)
docker exec -it <container_id> sh

# Copie os arquivos para um local temporário
# (Isso requer acesso SSH ao servidor Easypanel)
```

## 🔍 Verificação

Para verificar se está funcionando:

1. Faça upload de uma nova imagem
2. Verifique os logs do backend - deve mostrar:
   ```
   📤 Banner upload: { path: '/app/uploads/banners/banner-xxx.jpg', fileExists: true, ... }
   ```
3. Reinicie o container do backend
4. Verifique se a imagem ainda está acessível via URL
5. Verifique os logs - não deve haver erros de arquivo não encontrado

## 📝 Notas Técnicas

- O código agora usa `/app/uploads` por padrão em produção
- A variável `UPLOADS_DIR` permite customizar o caminho se necessário
- Logs detalhados foram adicionados para facilitar diagnóstico
- O servidor verifica se o diretório existe e é gravável na inicialização

## 🆘 Troubleshooting

### Problema: Volume configurado mas arquivos ainda desaparecem

**Possíveis causas**:
1. Volume não está montado no caminho correto
2. Variável `UPLOADS_DIR` não está configurada
3. Permissões incorretas no volume

**Solução**:
1. Verifique os logs do backend na inicialização
2. Confirme que o volume está montado em `/app/uploads`
3. Verifique se `UPLOADS_DIR=/app/uploads` está nas variáveis de ambiente

### Problema: Erro "Uploads directory is NOT writable"

**Causa**: Permissões incorretas no volume

**Solução**:
1. No Easypanel, verifique as configurações do volume
2. O volume deve ter permissões de leitura/escrita
3. Se necessário, entre no container e ajuste permissões:
   ```bash
   chmod -R 755 /app/uploads
   ```

## 📚 Referências

- [Configuração de Volumes no Easypanel](./CONFIGURACAO_VOLUMES_EASYPANEL.md)
- [Guia de Deploy](./EASYPANEL_DEPLOYMENT.md)
