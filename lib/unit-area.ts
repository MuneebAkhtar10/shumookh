/**
 * Square-metre helpers. Some units are let by the m², so alongside the
 * occupied / vacant unit COUNT the client needs the occupied / vacant AREA.
 * A unit counts as occupied when it has a tenant (same rule as the unit
 * counts everywhere else).
 */

export type AreaUnit = {
  areaSqm: unknown;
  tenantId: string | null;
};

export type SpaceStats = {
  totalSqm: number;
  occupiedSqm: number;
  vacantSqm: number;
  /** Occupied share of the measured area, 0–100. */
  occupiedPct: number;
  unitsWithArea: number;
  /** Units with no area recorded — left out of every figure above. */
  unitsWithoutArea: number;
};

/** Prisma returns Decimal columns as Decimal objects; accept those, numbers
 * and numeric strings. */
export function areaValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function computeSpaceStats(units: AreaUnit[]): SpaceStats {
  let occupiedSqm = 0;
  let vacantSqm = 0;
  let unitsWithArea = 0;

  for (const unit of units) {
    const area = areaValue(unit.areaSqm);
    if (area === null) continue;
    unitsWithArea += 1;
    if (unit.tenantId) occupiedSqm += area;
    else vacantSqm += area;
  }

  const totalSqm = occupiedSqm + vacantSqm;
  return {
    totalSqm,
    occupiedSqm,
    vacantSqm,
    occupiedPct: totalSqm > 0 ? Math.round((occupiedSqm / totalSqm) * 100) : 0,
    unitsWithArea,
    unitsWithoutArea: units.length - unitsWithArea,
  };
}

/** "1,250.5 m²" — trims a trailing ".00" but keeps real decimals. */
export function formatSqm(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} m²`;
}

/**
 * Parses an "Area (m²)" form field. A positive number of square metres;
 * blank is only accepted when the field isn't required.
 */
export function parseAreaSqm(
  raw: FormDataEntryValue | null | undefined,
  options: { required?: boolean } = {},
): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = raw?.toString().trim() ?? "";
  if (!text) {
    return options.required
      ? { ok: false, error: "Area (m²) is required." }
      : { ok: true, value: null };
  }
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0 || n > 9_999_999_999) {
    return { ok: false, error: "Area must be a positive number of square metres." };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}
