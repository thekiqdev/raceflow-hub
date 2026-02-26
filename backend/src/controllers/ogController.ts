import { Request, Response } from 'express';
import { getEventById } from '../services/eventsService.js';
import { getSystemSettings } from '../services/systemSettingsService.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * GET /api/og/event/:slug
 * Retorna HTML com meta tags Open Graph/Twitter para crawlers (WhatsApp, Facebook, etc.).
 * Para o preview mostrar o banner do evento, o proxy/reverse proxy deve encaminhar
 * requisições a /evento/:slug com User-Agent de bot para esta rota.
 */
export async function getEventOgHtml(req: Request, res: Response) {
  const slug = req.params.slug;
  if (!slug) {
    res.status(400).send('Slug é obrigatório');
    return;
  }

  const event = await getEventById(slug);
  if (!event) {
    res.status(404).send('Evento não encontrado');
    return;
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0]?.trim() || 'https://cronoteam.com.br';
  const baseUrl = frontendUrl.replace(/\/$/, '');
  const eventUrl = `${baseUrl}/evento/${encodeURIComponent(slug)}`;
  const title = `${event.title} | Cronoteam`;
  const description = event.description
    ? escapeHtml(event.description.replace(/<[^>]*>/g, '').slice(0, 160))
    : escapeHtml(`Confira ${event.title} - Cronoteam`);
  const imageUrl = event.banner_url
    ? (event.banner_url.startsWith('http') ? event.banner_url : `${baseUrl}${event.banner_url.startsWith('/') ? '' : '/'}${event.banner_url}`)
    : `${baseUrl}/favicon.png`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(eventUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${escapeHtml(eventUrl)}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(eventUrl)}">
</head>
<body>
  <p>Redirecionando para <a href="${escapeHtml(eventUrl)}">${escapeHtml(event.title)}</a>...</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min
  res.send(html);
}

/**
 * GET /api/og/home
 * Retorna HTML com meta tags Open Graph/Twitter para a página inicial.
 * Usa a logo da plataforma configurada pelo admin em Configurações > Geral (Logo da Plataforma).
 * O proxy deve encaminhar requisições de bots à raiz (/) para esta rota.
 */
export async function getHomeOgHtml(_req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0]?.trim() || 'https://cronoteam.com.br';
  const baseUrl = frontendUrl.replace(/\/$/, '');

  let title = 'cronoteam';
  let description = 'Empresa de cronometragem esportiva.';
  let imageUrl = `${baseUrl}/logo-og.png`;

  try {
    const settings = await getSystemSettings();
    if (settings.platform_name) title = settings.platform_name;
    if (settings.platform_logo_url) imageUrl = settings.platform_logo_url;
  } catch (_e) {
    // usa fallbacks acima
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(baseUrl)}/">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(baseUrl)}/">
</head>
<body>
  <p>Redirecionando para <a href="${escapeHtml(baseUrl)}/">${escapeHtml(title)}</a>...</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
}
