import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getActiveBanners,
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../services/homeBannersService.js';
import { z } from 'zod';

const linkUrlSchema = z.union([z.string().url(), z.literal(''), z.null()]).optional();

const createBannerSchema = z
  .object({
    image_url: z.string().max(2000).nullable().optional().or(z.literal('')),
    image_url_mobile: z.string().max(2000).nullable().optional().or(z.literal('')),
    title: z.string().max(500).nullable().optional(),
    link_url: linkUrlSchema,
    is_active: z.boolean().optional(),
    display_order: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      const desktop = (data.image_url ?? '').toString().trim();
      const mobile = (data.image_url_mobile ?? '').toString().trim();
      return desktop.length > 0 || mobile.length > 0;
    },
    { message: 'Informe pelo menos a imagem desktop ou a imagem mobile.', path: ['image_url'] }
  );

const updateBannerSchema = z.object({
  image_url: z.string().max(2000).nullable().optional().or(z.literal('')),
  image_url_mobile: z.string().max(2000).nullable().optional().or(z.literal('')),
  title: z.string().max(500).nullable().optional(),
  link_url: linkUrlSchema,
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
});

/** GET /api/home-banners – público: lista apenas banners ativos */
export const getActiveBannersController = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const banners = await getActiveBanners();
  res.json({ success: true, data: banners });
});

/** GET /api/admin/home-banners – admin: lista todos os banners */
export const getAllBannersController = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const banners = await getAllBanners();
  res.json({ success: true, data: banners });
});

/** GET /api/admin/home-banners/:id – admin: um banner */
export const getBannerByIdController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const banner = await getBannerById(id);
  if (!banner) {
    res.status(404).json({ success: false, error: 'Not Found', message: 'Banner não encontrado' });
    return;
  }
  res.json({ success: true, data: banner });
});

/** POST /api/admin/home-banners – admin: criar banner */
export const createBannerController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = createBannerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: parsed.error.errors[0]?.message ?? 'Dados inválidos',
    });
    return;
  }
  const data = parsed.data;
  const payload = {
    ...data,
    image_url: data.image_url === '' ? null : (data.image_url ?? null),
    image_url_mobile: data.image_url_mobile === '' ? null : data.image_url_mobile ?? null,
    link_url: data.link_url === '' ? null : data.link_url ?? null,
  };
  const banner = await createBanner(payload);
  res.status(201).json({ success: true, data: banner, message: 'Banner criado com sucesso' });
});

/** PUT /api/admin/home-banners/:id – admin: atualizar banner */
export const updateBannerController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const parsed = updateBannerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: parsed.error.errors[0]?.message ?? 'Dados inválidos',
    });
    return;
  }
  const data = parsed.data;
  const payload = {
    ...data,
    image_url: data.image_url === '' ? null : data.image_url,
    image_url_mobile: data.image_url_mobile === '' ? null : data.image_url_mobile,
    link_url: data.link_url === '' ? null : data.link_url,
  };
  const banner = await updateBanner(id, payload);
  if (!banner) {
    res.status(404).json({ success: false, error: 'Not Found', message: 'Banner não encontrado' });
    return;
  }
  res.json({ success: true, data: banner, message: 'Banner atualizado com sucesso' });
});

/** DELETE /api/admin/home-banners/:id – admin: excluir banner */
export const deleteBannerController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const deleted = await deleteBanner(id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Not Found', message: 'Banner não encontrado' });
    return;
  }
  res.json({ success: true, message: 'Banner excluído com sucesso' });
});
