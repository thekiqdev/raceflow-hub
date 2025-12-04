import { query } from '../config/database.js';

// Get home page settings
export const getHomePageSettings = async () => {
  const result = await query(
    'SELECT * FROM home_page_settings ORDER BY created_at DESC LIMIT 1'
  );

  if (result.rows.length === 0) {
    // Return default settings
    return {
      id: '00000000-0000-0000-0000-000000000001',
      hero_title: 'Agende seu Próximo Evento Esportivo',
      hero_subtitle: 'Gestão completa de cronometragem e inscrições para corridas e eventos esportivos',
      hero_image_url: null,
      whatsapp_number: '+5511999999999',
      whatsapp_text: 'Entre em contato via WhatsApp',
      consultoria_title: 'Consultoria Especializada em Eventos Esportivos',
      consultoria_description: 'Nossa equipe oferece consultoria completa para organização de eventos esportivos',
      stats_events: '500+',
      stats_events_label: 'Eventos Realizados',
      stats_runners: '50k+',
      stats_runners_label: 'Corredores Atendidos',
      stats_cities: '100+',
      stats_cities_label: 'Cidades',
      stats_years: '10+',
      stats_years_label: 'Anos de Experiência',
    };
  }

  return result.rows[0];
};

// Update home page settings
export const updateHomePageSettings = async (data: any) => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && key !== 'id') {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  // Get or create settings
  const existing = await getHomePageSettings();
  const settingsId = existing.id || '00000000-0000-0000-0000-000000000001';

  // Try to update, if fails, insert
  const result = await query(
    `UPDATE home_page_settings 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    [...values, settingsId]
  );

  if (result.rows.length === 0) {
    // Insert new settings
    const insertResult = await query(
      `INSERT INTO home_page_settings (id, ${Object.keys(data).filter(k => k !== 'id').join(', ')})
       VALUES ($1, ${Object.keys(data).filter(k => k !== 'id').map((_, i) => `$${i + 2}`).join(', ')})
       RETURNING *`,
      [settingsId, ...Object.values(data).filter((_, i) => Object.keys(data)[i] !== 'id')]
    );
    return insertResult.rows[0];
  }

  return result.rows[0];
};

