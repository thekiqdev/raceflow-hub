/** Validação de lotes no formulário de evento (admin/organizador). */
export type BatchLike = {
  name?: string | null;
  price?: number | null;
  valid_from?: string | Date | null;
  valid_to?: string | Date | null;
};

export type CategoryWithBatches = {
  name?: string | null;
  batches?: BatchLike[] | null;
};

export function validateCategoryBatchesForSave(categories: CategoryWithBatches[]): string | null {
  for (const category of categories) {
    const catName = (category.name || 'Categoria').trim() || 'Categoria';
    const batches = category.batches || [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const label = (batch.name || '').trim() || `${i + 1}º lote`;
      if (!(batch.name || '').trim()) {
        return `${catName}: informe o nome do ${label}.`;
      }
      if (batch.price == null || Number.isNaN(Number(batch.price)) || Number(batch.price) < 0) {
        return `${catName}: informe um preço válido para o lote "${label}".`;
      }
      if (!batch.valid_from) {
        return `${catName}: informe a data de início do lote "${label}".`;
      }
      const from = new Date(batch.valid_from);
      if (Number.isNaN(from.getTime())) {
        return `${catName}: data de início inválida no lote "${label}".`;
      }
      if (batch.valid_to) {
        const to = new Date(batch.valid_to);
        if (Number.isNaN(to.getTime())) {
          return `${catName}: data de término inválida no lote "${label}".`;
        }
        if (to.getTime() < from.getTime()) {
          return `${catName}: no lote "${label}", o término deve ser após o início.`;
        }
      }
    }
  }
  return null;
}
