import { query } from '../config/database.js';

export interface HomeBanner {
  id: string;
  image_url: string | null;
  image_url_mobile: string | null;
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
  image_url?: string | null;
  image_url_mobile?: string | null;
  title?: string | null;
  link_url?: string | null;
  is_active?: boolean;
  display_order?: number;
}

/** Banners ativos para exibição na home (slider), ordenados por display_order */
export const getActiveBanners = async (): Promise<HomeBanner[]> => {
  const result = await query(
    `SELECT id, image_url, image_url_mobile, title, link_url, is_active, display_order, created_at, updated_at
     FROM home_banners
     WHERE is_active = true
     ORDER BY display_order ASC, created_at ASC`
  );
  return result.rows as HomeBanner[];
};

/** Todos os banners (admin) */
export const getAllBanners = async (): Promise<HomeBanner[]> => {
  const result = await query(
    `SELECT id, image_url, image_url_mobile, title, link_url, is_active, display_order, created_at, updated_at
     FROM home_banners
     ORDER BY display_order ASC, created_at ASC`
  );
  return result.rows as HomeBanner[];
};

/** Um banner por ID */
export const getBannerById = async (id: string): Promise<HomeBanner | null> => {
  const result = await query(
    `SELECT id, image_url, image_url_mobile, title, link_url, is_active, display_order, created_at, updated_at
     FROM home_banners
     WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as HomeBanner;
};

/** Criar banner */
export const createBanner = async (data: CreateHomeBannerData): Promise<HomeBanner> => {
  const displayOrder = data.display_order ?? 0;
  const isActive = data.is_active ?? true;
  const result = await query(
    `INSERT INTO home_banners (image_url, image_url_mobile, title, link_url, is_active, display_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, image_url, image_url_mobile, title, link_url, is_active, display_order, created_at, updated_at`,
    [
      data.image_url ?? null,
      data.image_url_mobile ?? null,
      data.title ?? null,
      data.link_url ?? null,
      isActive,
      displayOrder,
    ]
  );
  return result.rows[0] as HomeBanner;
};

/** Atualizar banner */
export const updateBanner = async (
  id: string,
  data: UpdateHomeBannerData
): Promise<HomeBanner | null> => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const allowedKeys: (keyof UpdateHomeBannerData)[] = [
    'image_url',
    'image_url_mobile',
    'title',
    'link_url',
    'is_active',
    'display_order',
  ];
  for (const key of allowedKeys) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(data[key]);
      paramIndex++;
    }
  }

  if (fields.length === 0) {
    const existing = await getBannerById(id);
    return existing;
  }

  values.push(id);
  const result = await query(
    `UPDATE home_banners
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING id, image_url, image_url_mobile, title, link_url, is_active, display_order, created_at, updated_at`,
    values
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as HomeBanner;
};

/** Excluir banner */
export const deleteBanner = async (id: string): Promise<boolean> => {
  const result = await query('DELETE FROM home_banners WHERE id = $1 RETURNING id', [id]);
  return result.rowCount !== null && result.rowCount > 0;
}
