# Preview de links (Open Graph) – evento e home

## Home (página inicial)

Ao compartilhar o link do site (ex.: `https://cronoteam.com.br/`), o preview deve usar a **logo da plataforma** configurada pelo admin em **Configurações → aba Geral → “Logo da Plataforma”**.

### O que o backend faz

O backend expõe a rota:

- **GET** `/api/og/home`

Ela lê os system settings (campo `platform_logo_url`) e retorna um **HTML mínimo** com meta tags Open Graph e Twitter em que **og:image** é a URL da logo configurada. Se não houver logo configurada, usa fallback `https://cronoteam.com.br/logo-og.png`.

### O que falta na hospedagem (proxy)

Para o preview da home usar essa logo, o **proxy** deve encaminhar requisições de **bots** à **raiz** (`/`) para o backend:

- Se o caminho for **/** e o **User-Agent** for de bot → encaminhar para **GET** `https://[URL_DO_BACKEND]/api/og/home` e devolver essa resposta ao bot.

Assim, ao compartilhar `https://cronoteam.com.br/`, o bot recebe o HTML com a logo definida em Configurações → Geral.

(O arquivo estático `public/logo-og.png` continua como fallback no backend e no `index.html` quando o proxy não encaminha bots para `/api/og/home`.)

## Evento (banner na prévia)

Crawlers (WhatsApp, Facebook, Telegram etc.) **não executam JavaScript**. Eles leem só o HTML inicial. Por isso, para o link do evento (ex.: `https://cronoteam.com.br/evento/corrida-da-infantaria-2026`) mostrar o **banner do evento** na prévia, o HTML retornado para esses bots precisa já vir com as meta tags preenchidas.

### O que o backend faz

O backend expõe a rota:

- **GET** `/api/og/event/:slug`

Ela retorna um **HTML mínimo** com as meta tags Open Graph e Twitter (título, descrição, **imagem = banner do evento**, URL). Assim, quando um bot acessa essa URL, recebe o HTML com o banner correto.

### O que falta na sua hospedagem

É preciso fazer com que, quando um **bot** acessar `https://cronoteam.com.br/evento/XYZ`, ele receba a resposta da rota acima em vez do `index.html` do front.

Ou seja: no **proxy/reverse proxy** que atende `cronoteam.com.br`:

1. Se o caminho for `/evento/:slug` **e**
2. O **User-Agent** for de bot (WhatsApp, Facebook, Telegram, etc.),  
   então encaminhar a requisição para o backend:  
   **GET** `https://[URL_DO_BACKEND]/api/og/event/:slug`  
   e devolver essa resposta (HTML) ao bot.

Assim, o link compartilhado continua sendo `https://cronoteam.com.br/evento/XYZ`, mas o bot recebe o HTML com as meta tags e o banner do evento.

### Exemplo (Nginx)

Se o front e a API estiverem atrás do mesmo Nginx:

```nginx
# Mapa para detectar bot (colocar no bloco http)
map $http_user_agent $is_bot {
    default 0;
    ~*whatsapp     1;
    ~*facebookexternalhit 1;
    ~*facebot       1;
    ~*twitterbot   1;
    ~*telegrambot  1;
    ~*linkedinbot  1;
}

server {
    # ...
    # Preview da home: bots na raiz → backend /api/og/home (logo da plataforma)
    location = / {
        if ($is_bot = 1) {
            proxy_pass https://BACKEND_URL/api/og/home;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        try_files $uri $uri/ /index.html;
    }

    # Preview do evento: bots em /evento/:slug → backend /api/og/event/:slug
    location ~ ^/evento/([a-z0-9-]+)$ {
        if ($is_bot = 1) {
            proxy_pass https://BACKEND_URL/api/og/event/$1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        try_files $uri $uri/ /index.html;
    }
}
```

(Substituir `BACKEND_URL` pela URL real do backend.)

### Easypanel (Traefik)

O Easypanel usa **Traefik** como proxy. O arquivo `deploy/easypanel/traefik-og-preview-eventos.yaml` configura:

- **Home:** bots que acessam `/` são enviados ao backend `/api/og/home` (preview usa a logo da plataforma).
- **Evento:** bots que acessam `/evento/:slug` são enviados ao backend `/api/og/event/:slug` (preview usa o banner do evento).

1. **Use o arquivo do repositório** em `deploy/easypanel/traefik-og-preview-eventos.yaml`. Copie para o servidor:
   ```bash
   # No servidor, crie o diretório se não existir
   sudo mkdir -p /etc/easypanel/traefik/config
   # Do seu micro (no clone do repo): copie o arquivo
   scp deploy/easypanel/traefik-og-preview-eventos.yaml user@servidor:/etc/easypanel/traefik/config/
   ```
   Ou, no servidor, crie manualmente o arquivo em `/etc/easypanel/traefik/config/` com o conteúdo desse YAML.

2. **Substitua `SEU_BACKEND`** pelo **nome do serviço/container do backend** no Easypanel (ex.: `crono-back`, `backend`, ou o nome que aparece no painel). Se o backend usa outra porta, troque `3001` também.
```yaml
# Home: bots em / → /api/og/home (logo da plataforma)
# Evento: bots em /evento/:slug → /api/og/event/:slug (banner do evento)
http:
  routers:
    home-og-bot:
      rule: "Path(`/`) && HeadersRegexp(`User-Agent`, `(?i)(whatsapp|facebookexternalhit|...)`)"
      priority: 210
      service: og-backend
      middlewares: [home-og-replacepath]
    evento-og-bot:
      rule: "PathPrefix(`/evento/`) && HeadersRegexp(`User-Agent`, ...)"
      priority: 200
      service: og-backend
      middlewares: [evento-og-replacepath]
  middlewares:
    home-og-replacepath:
      replacePath: { path: "/api/og/home" }
    evento-og-replacepath:
      replacePathRegex: { regex: "^/evento/([a-z0-9-]+)$", replacement: "/api/og/event/${1}" }
  services:
    og-backend:
      loadBalancer:
        servers: [{ url: "http://SEU_BACKEND:3001" }]
        passHostHeader: true
```

3. **Substitua `SEU_BACKEND`** pelo **nome do serviço/container do backend** no Easypanel (ex.: `crono-back`, `backend`, ou o nome que aparece no painel). Se o backend usa outra porta, troque `3001` também.


3. **Se o domínio do site não for o padrão `websecure`**, troque `entryPoints` pelo entrypoint que o Easypanel usa para HTTPS (pode ser `web` em alguns setups).

4. **Reinicie o Traefik** no Easypanel: **Settings** → botão de reiniciar o Traefik.

5. **Teste**: compartilhe no WhatsApp o link `https://cronoteam.com.br/evento/[slug-do-evento]`. O preview deve mostrar o banner do evento. Se ainda mostrar a logo do site, confira o nome do serviço do backend e os logs do Traefik.

### Variável de ambiente no backend

No backend, defina **FRONTEND_URL** (ex.: `https://cronoteam.com.br`) para montar corretamente as URLs nas meta tags (e o redirect no HTML). Opcional: se não estiver definido, o backend usa `CORS_ORIGIN` ou `https://cronoteam.com.br`.

### Teste rápido

1. **Preview da home**  
   Compartilhe `https://cronoteam.com.br/` – deve aparecer a logo do site.

2. **Preview do evento (após configurar o proxy)**  
   Compartilhe `https://cronoteam.com.br/evento/[slug-do-evento]` – deve aparecer o banner do evento.  
   Ou acesse no navegador (como bot):  
   `https://[BACKEND]/api/og/event/[slug]`  
   e confira se o HTML tem `og:image` com a URL do banner.
