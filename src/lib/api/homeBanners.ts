import { apiClient } from './client';

export interface HomeBanner {
  id: string;
  image_url: string | null;
  image_url_mobile?: string | null;
  title: string | null;
  link_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateHomeBannerData {
  image_url?: string | null;
  image_url_mobile?: string | null;
  title?: string | null;
  link_url?: string | null;
  is_active?: boolean;
  display_order?: number;
}

export interface UpdateHomeBannerData {
  image_url?: string;
  image_url_mobile?: string | null;
  title?: string | null;
  link_url?: string | null;
  is_active?: boolean;
  display_order?: number;
}

/** GET /api/home-banners – público: lista banners ativos para o slider da home */
export const getActiveBanners = () => apiClient.get<HomeBanner[]>('/home-banners');

/** GET /api/admin/home-banners – admin: lista todos os banners */
export const getAllBanners = () => apiClient.get<HomeBanner[]>('/admin/home-banners');

/** GET /api/admin/home-banners/:id – admin: um banner */
export const getBanner = (id: string) => apiClient.get<HomeBanner>(`/admin/home-banners/${id}`);

/** POST /api/admin/home-banners – admin: criar banner */
export const createBanner = (data: CreateHomeBannerData) =>
  apiClient.post<HomeBanner>('/admin/home-banners', data);

/** PUT /api/admin/home-banners/:id – admin: atualizar banner */
export const updateBanner = (id: string, data: UpdateHomeBannerData) =>
  apiClient.put<HomeBanner>(`/admin/home-banners/${id}`, data);

/** DELETE /api/admin/home-banners/:id – admin: excluir banner */
export const deleteBanner = (id: string) => apiClient.delete<unknown>(`/admin/home-banners/${id}`);
