import "server-only";

import { prisma } from "@/lib/prisma";
import { formatUnitLabel } from "@/lib/property-types";
import { personDisplayName } from "@/lib/utils";
import { areaValue } from "@/lib/unit-area";

/**
 * Occupied vs vacant units for one calendar month, from the tenancy history
 * (a unit is occupied on every day a tenancy covers it). Works for every
 * property type — the unit label follows each type's own naming.
 *
 * A month still in progress is measured up to today, not to the last day,
 * so days that haven't happened yet are never counted as vacant.
 */

export type OccupancyStatus = "occupied" | "partial" | "vacant";
export type OccupancyStatusFilter = "all" | OccupancyStatus;

export type OccupancyRow = {
  unitId: string;
  unitLabel: string;
  floor: number | null;
  areaSqm: number | null;
  status: OccupancyStatus;
  occupiedDays: number;
  tenantName: string | null;
  monthlyRent: number | null;
  /** Human note: move-in / move-out inside the period, or "Vacant all month". */
  note: string;
};

export type OccupancyTotals = {
  units: number;
  occupied: number;
  partial: number;
  vacant: number;
  /** Occupied unit-days as a share of all unit-days in the period, 0–100. */
  occupancyPct: number;
  totalSqm: number;
  /** Day-weighted: a 100 m² unit occupied half the month counts 50 m². */
  occupiedSqm: number;
  vacantSqm: number;
  unitsWithoutArea: number;
};

export type OccupancyGroup = {
  propertyId: string;
  propertyName: string;
  propertyTypeLabel: string;
  rows: OccupancyRow[];
  totals: OccupancyTotals;
};

export type OccupancyReport = {
  month: string;
  monthLabel: string;
  /** e.g. "1 Sep 2026 – 30 Sep 2026" or "1 Sep 2026 – 25 Sep 2026 (to date)". */
  periodLabel: string;
  periodDays: number;
  scopeLabel: string;
  groups: OccupancyGroup[];
  totals: OccupancyTotals;
};

const DAY_MS = 86_400_000;

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayYearFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09" -> { year, monthIndex } or null when malformed / out of range. */
export function parseMonthKey(
  key: string | null | undefined,
): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

function emptyTotals(): OccupancyTotals {
  return {
    units: 0,
    occupied: 0,
    partial: 0,
    vacant: 0,
    occupancyPct: 0,
    totalSqm: 0,
    occupiedSqm: 0,
    vacantSqm: 0,
    unitsWithoutArea: 0,
  };
}

function totalsFor(rows: OccupancyRow[], periodDays: number): OccupancyTotals {
  const totals = emptyTotals();
  let occupiedDays = 0;
  for (const row of rows) {
    totals.units += 1;
    totals[row.status] += 1;
    occupiedDays += row.occupiedDays;
    if (row.areaSqm === null) {
      totals.unitsWithoutArea += 1;
      continue;
    }
    totals.totalSqm += row.areaSqm;
    totals.occupiedSqm += (row.areaSqm * row.occupiedDays) / periodDays;
  }
  totals.vacantSqm = totals.totalSqm - totals.occupiedSqm;
  totals.occupancyPct =
    totals.units > 0
      ? Math.round((occupiedDays / (totals.units * periodDays)) * 100)
      : 0;
  totals.occupiedSqm = Math.round(totals.occupiedSqm * 100) / 100;
  totals.vacantSqm = Math.round(totals.vacantSqm * 100) / 100;
  totals.totalSqm = Math.round(totals.totalSqm * 100) / 100;
  return totals;
}

/** Days covered by a set of [start, end] intervals (inclusive), overlaps merged. */
function coveredDays(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const [start, end] of sorted) {
    if (start > curEnd + DAY_MS) {
      if (curEnd !== -Infinity) total += (curEnd - curStart) / DAY_MS + 1;
      curStart = start;
      curEnd = end;
    } else if (end > curEnd) {
      curEnd = end;
    }
  }
  if (curEnd !== -Infinity) total += (curEnd - curStart) / DAY_MS + 1;
  return total;
}

export async function getOccupancyReport({
  month,
  propertyId = "all",
  status = "all",
}: {
  month: string;
  propertyId?: string;
  status?: OccupancyStatusFilter;
}): Promise<OccupancyReport> {
  const parsed = parseMonthKey(month);
  if (!parsed) throw new Error("Invalid month");

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monthStart = Date.UTC(parsed.year, parsed.monthIndex, 1);
  const monthEnd = Date.UTC(parsed.year, parsed.monthIndex + 1, 0);

  if (monthStart > today) throw new Error("That month hasn't started yet");

  const toDate = today < monthEnd;
  const periodStart = monthStart;
  const periodEnd = toDate ? today : monthEnd;
  const periodDays = (periodEnd - periodStart) / DAY_MS + 1;

  const units = await prisma.unit.findMany({
    where: propertyId !== "all" ? { propertyId } : {},
    select: {
      id: true,
      label: true,
      floor: true,
      areaSqm: true,
      propertyId: true,
      property: {
        select: {
          name: true,
          propertyType: {
            select: { label: true, unitPrefix: true, hasFloors: true },
          },
        },
      },
      tenancies: {
        where: {
          startDate: { lte: new Date(periodEnd) },
          OR: [{ endDate: null }, { endDate: { gte: new Date(periodStart) } }],
        },
        orderBy: { startDate: "asc" },
        select: {
          startDate: true,
          endDate: true,
          monthlyRent: true,
          tenant: {
            select: { email: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

  const byProperty = new Map<
    string,
    { name: string; typeLabel: string; rows: OccupancyRow[] }
  >();

  for (const unit of units) {
    const intervals: [number, number][] = unit.tenancies.map((t) => [
      Math.max(t.startDate.getTime(), periodStart),
      Math.min(t.endDate ? t.endDate.getTime() : periodEnd, periodEnd),
    ]);
    const occupiedDays = Math.min(periodDays, coveredDays(intervals));
    const rowStatus: OccupancyStatus =
      occupiedDays >= periodDays
        ? "occupied"
        : occupiedDays === 0
          ? "vacant"
          : "partial";

    const latest = unit.tenancies[unit.tenancies.length - 1];
    const notes: string[] = [];
    if (rowStatus === "vacant") {
      notes.push("Vacant all period");
    } else {
      for (const t of unit.tenancies) {
        if (t.startDate.getTime() > periodStart) {
          notes.push(`Moved in ${dayFormat.format(t.startDate)}`);
        }
        if (t.endDate && t.endDate.getTime() < periodEnd) {
          notes.push(`Moved out ${dayFormat.format(t.endDate)}`);
        }
      }
    }

    const group = byProperty.get(unit.propertyId) ?? {
      name: unit.property.name,
      typeLabel: unit.property.propertyType.label,
      rows: [],
    };
    group.rows.push({
      unitId: unit.id,
      unitLabel: formatUnitLabel(unit.property.propertyType, unit.label),
      floor: unit.floor,
      areaSqm: areaValue(unit.areaSqm),
      status: rowStatus,
      occupiedDays,
      tenantName: latest ? personDisplayName(latest.tenant) : null,
      monthlyRent: latest ? Number(latest.monthlyRent) : null,
      note: notes.join(" · "),
    });
    byProperty.set(unit.propertyId, group);
  }

  const groups: OccupancyGroup[] = [...byProperty.entries()]
    .map(([id, group]) => {
      group.rows.sort(
        (a, b) =>
          (a.floor ?? -1) - (b.floor ?? -1) ||
          a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true }),
      );
      const totals = totalsFor(group.rows, periodDays);
      return {
        propertyId: id,
        propertyName: group.name,
        propertyTypeLabel: group.typeLabel,
        rows: group.rows,
        totals,
      };
    })
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName));

  // The summary always describes everything in scope; the status filter only
  // narrows which unit rows are listed.
  const totals = totalsFor(groups.flatMap((g) => g.rows), periodDays);

  const filteredGroups =
    status === "all"
      ? groups
      : groups
          .map((g) => ({ ...g, rows: g.rows.filter((r) => r.status === status) }))
          .filter((g) => g.rows.length > 0);

  const scopeName =
    propertyId !== "all" ? (groups[0]?.propertyName ?? "Selected property") : "All properties";

  return {
    month,
    monthLabel: monthFormat.format(new Date(monthStart)),
    periodLabel: `${dayYearFormat.format(new Date(periodStart))} – ${dayYearFormat.format(new Date(periodEnd))}${toDate ? " (to date)" : ""}`,
    periodDays,
    scopeLabel: scopeName,
    groups: filteredGroups,
    totals,
  };
}
