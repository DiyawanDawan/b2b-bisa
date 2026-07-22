import { ProductMode } from '#prisma';

export type ProductSpecInput = { label: string; value: string };

export const productSpecsSelect = {
  select: {
    id: true,
    label: true,
    value: true,
    sortOrder: true,
  },
  orderBy: { sortOrder: 'asc' as const },
};

export function parseSpecsInput(raw: unknown): ProductSpecInput[] {
  if (raw === undefined || raw === null || raw === '') return [];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const label = String((item as { label?: unknown }).label ?? '').trim();
      const value = String((item as { value?: unknown }).value ?? '').trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter((item): item is ProductSpecInput => item !== null);
}

export function applyKnownFieldsFromSpecs(
  productMode: ProductMode | string | undefined,
  specs: ProductSpecInput[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const isOrganic = productMode === ProductMode.ORGANIC_PRODUCE;

  for (const { label, value } of specs) {
    if (isOrganic) {
      switch (label) {
        case 'Jenis Hasil Tani':
          out.cropType = value;
          break;
        case 'Pupuk / Nutrisi':
          out.fertilizerType = value;
          break;
        case 'Bebas Bahan Kimia':
          out.isChemicalFree = value.toLowerCase().includes('ya') || value.includes('100%');
          break;
        case 'Ketahanan (hari)':
        case 'Ketahanan': {
          const n = parseSpecNumber(value);
          if (n != null) out.shelfLifeDays = Math.round(n);
          break;
        }
        case 'Luas Lahan (ha)':
        case 'Luas Lahan': {
          const n = parseSpecNumber(value);
          if (n != null) out.landAreaHa = n;
          break;
        }
        default:
          break;
      }
    } else {
      const num = parseSpecNumber(value);
      switch (label) {
        case 'Kadar Air':
          if (num != null) out.moistureContent = num;
          break;
        case 'Kemurnian Karbon':
          if (num != null) out.carbonPurity = num;
          break;
        case 'Tingkat pH':
          if (num != null) out.phLevel = num;
          break;
        case 'Densitas':
          out.density = value;
          break;
        case 'Kapasitas Produksi':
          if (num != null) out.productionCapacity = num;
          break;
        case 'Luas Permukaan':
          if (num != null) out.surfaceArea = num;
          break;
        case 'Offset Karbon per Ton':
          if (num != null) out.carbonOffsetPerTon = num;
          break;
        case 'Berat Kotor per Sak':
          if (num != null) out.grossWeightPerSak = num;
          break;
        case 'Berat Bersih per Sak':
          if (num != null) out.netWeightPerSak = num;
          break;
        case 'Dimensi Karung':
          out.bagDimension = value;
          break;
        default:
          break;
      }
    }
  }

  return out;
}

export function buildSpecsCreateInput(specs: ProductSpecInput[]) {
  return specs.map((spec, index) => ({
    label: spec.label,
    value: spec.value,
    sortOrder: index,
  }));
}

export function organicSpecsFromProduct(product: {
  cropType?: string | null;
  fertilizerType?: string | null;
  isChemicalFree?: boolean;
  shelfLifeDays?: number | null;
  landAreaHa?: number | string | null;
}): ProductSpecInput[] {
  const rows: ProductSpecInput[] = [];
  if (product.cropType) {
    rows.push({ label: 'Jenis Hasil Tani', value: product.cropType });
  }
  if (product.fertilizerType) {
    rows.push({ label: 'Pupuk / Nutrisi', value: product.fertilizerType });
  }
  rows.push({
    label: 'Bebas Bahan Kimia',
    value: product.isChemicalFree ? 'Ya (100% Organik)' : 'Tidak',
  });
  if (product.shelfLifeDays != null && Number(product.shelfLifeDays) > 0) {
    rows.push({ label: 'Ketahanan (hari)', value: String(product.shelfLifeDays) });
  }
  if (product.landAreaHa != null && Number(product.landAreaHa) > 0) {
    rows.push({ label: 'Luas Lahan (ha)', value: String(product.landAreaHa) });
  }
  return rows;
}

export function biomassSpecsFromTechnical(
  spec?: {
    moistureContent?: unknown;
    carbonPurity?: unknown;
    phLevel?: unknown;
    density?: string | null;
    productionCapacity?: unknown;
    surfaceArea?: unknown;
    carbonOffsetPerTon?: unknown;
    grossWeightPerSak?: unknown;
    netWeightPerSak?: unknown;
    bagDimension?: string | null;
  } | null,
): ProductSpecInput[] {
  if (!spec) return [];
  const rows: ProductSpecInput[] = [];
  const addNum = (label: string, v: unknown, suffix = '') => {
    if (v == null || v === '') return;
    rows.push({ label, value: `${v}${suffix}` });
  };

  addNum('Kadar Air', spec.moistureContent, '%');
  addNum('Kemurnian Karbon', spec.carbonPurity, '%');
  addNum('Tingkat pH', spec.phLevel);
  if (spec.density) rows.push({ label: 'Densitas', value: spec.density });
  addNum('Kapasitas Produksi', spec.productionCapacity, ' /bln');
  addNum('Luas Permukaan', spec.surfaceArea, ' m²/g');
  addNum('Offset Karbon per Ton', spec.carbonOffsetPerTon, ' tCO₂e');
  addNum('Berat Kotor per Sak', spec.grossWeightPerSak, ' kg');
  addNum('Berat Bersih per Sak', spec.netWeightPerSak, ' kg');
  if (spec.bagDimension) {
    rows.push({ label: 'Dimensi Karung', value: spec.bagDimension });
  }
  return rows;
}

function parseSpecNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,-]/g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
