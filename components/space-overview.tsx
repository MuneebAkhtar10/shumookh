import { ArrowUpRight, FileText, Layers, ListTree, Ruler } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatSqm, type SpaceStats } from "@/lib/unit-area";

/** Brand teal for occupied space, neutral slate for vacant — used by every
 * space visual on the dashboard so a colour always means the same thing. */
const OCCUPIED = "#23abb5";
const VACANT = "#cbd5e1";

export type PropertySpace = {
  id: string;
  name: string;
  units: number;
  occupied: number;
  openRequests: number;
  space: SpaceStats;
};

/** Circular gauge of occupied share — server-rendered SVG, no client JS. */
function Ring({ pct, size = 168 }: { pct: number; size?: number }) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${pct}% of space occupied`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={VACANT}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={OCCUPIED}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tracking-tight tabular-nums text-slate-900">
          {pct}%
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          occupied
        </span>
      </div>
    </div>
  );
}

/**
 * The dashboard's headline: how much of the portfolio's floor area is let
 * and how much is empty. Everything else on the page is secondary to this.
 */
export function SpaceHero({
  stats,
  unitCount,
  occupiedUnits,
  propertyCount,
}: {
  stats: SpaceStats;
  unitCount: number;
  occupiedUnits: number;
  propertyCount: number;
}) {
  const hasArea = stats.unitsWithArea > 0;

  return (
    <Card className="overflow-hidden border-teal-200/70 shadow-sm">
      <div className="flex flex-col gap-4 bg-gradient-to-r from-teal-800 via-teal-700 to-cyan-700 px-6 py-5 text-white sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-100">
            <Ruler className="h-3.5 w-3.5" />
            Portfolio space
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">
            {hasArea ? formatSqm(stats.totalSqm) : "—"}
          </p>
          <p className="mt-0.5 text-sm text-teal-50/90">
            {hasArea
              ? `measured across ${stats.unitsWithArea} of ${unitCount} units in ${propertyCount} ${propertyCount === 1 ? "property" : "properties"}`
              : "No unit areas recorded yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/protected/reports/occupancy"
            className="inline-flex w-fit items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-50"
          >
            <FileText className="h-4 w-4" />
            Occupancy report
          </Link>
          <Link
            href="/protected/properties"
            className="inline-flex w-fit items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/25"
          >
            Open properties
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <CardContent className="p-6">
        {hasArea ? (
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-center">
            <Ring pct={stats.occupiedPct} />

            <div className="w-full min-w-0 flex-1 space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold text-teal-800">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#23abb5]" />
                    Occupied area
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-teal-950">
                    {formatSqm(stats.occupiedSqm)}
                  </p>
                  <p className="text-xs text-teal-800/80">
                    {stats.occupiedPct}% of measured space
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                    Vacant area
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    {formatSqm(stats.vacantSqm)}
                  </p>
                  <p className="text-xs text-slate-600">
                    {100 - stats.occupiedPct}% available to let
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Layers className="h-3.5 w-3.5 text-slate-500" />
                    Units let
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    {occupiedUnits}
                    <span className="text-base font-semibold text-slate-400">
                      {" "}
                      / {unitCount}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {unitCount - occupiedUnits} empty
                  </p>
                </div>
              </div>

              <div>
                <div
                  className="flex h-3 overflow-hidden rounded-full bg-slate-200"
                  role="img"
                  aria-label={`${formatSqm(stats.occupiedSqm)} occupied, ${formatSqm(stats.vacantSqm)} vacant`}
                >
                  <div
                    className="h-full bg-[#23abb5]"
                    style={{ width: `${stats.occupiedPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-xs tabular-nums text-slate-500">
                  <span>0 m²</span>
                  <span>{formatSqm(stats.totalSqm)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Add an area (m²) to your units and the occupied / vacant space
            appears here.
          </p>
        )}

        {stats.unitsWithoutArea > 0 && (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">{stats.unitsWithoutArea}</span>{" "}
            unit{stats.unitsWithoutArea === 1 ? " has" : "s have"} no area
            recorded and {stats.unitsWithoutArea === 1 ? "is" : "are"} left out
            of these figures. Open a unit and set its area to include it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** One property's occupied vs vacant m² — shared by the card and its modal. */
function PropertySpaceRow({
  property,
  showRequests,
}: {
  property: PropertySpace;
  showRequests: boolean;
}) {
  return (
    <Link
      href={`/protected/properties/${property.id}`}
      className="block rounded-lg px-1 py-3 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold text-slate-900">
          {property.name}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {showRequests && property.openRequests > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              {property.openRequests} open
            </span>
          )}
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold tabular-nums text-teal-700 ring-1 ring-inset ring-teal-600/20">
            {property.space.occupiedPct}%
          </span>
        </div>
      </div>

      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-[#23abb5]"
          style={{ width: `${property.space.occupiedPct}%` }}
        />
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Occupied</dt>
          <dd className="text-sm font-bold tabular-nums text-teal-800">
            {formatSqm(property.space.occupiedSqm)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Vacant</dt>
          <dd className="text-sm font-bold tabular-nums text-slate-900">
            {formatSqm(property.space.vacantSqm)}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-slate-500">Total</dt>
          <dd className="text-sm font-bold tabular-nums text-slate-900">
            {formatSqm(property.space.totalSqm)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

/** How many properties the dashboard card lists before pointing to the modal. */
const PREVIEW_COUNT = 3;

/**
 * Occupied vs vacant m² for the properties with the most empty space, three
 * on the card; the full list — every property — opens in a modal so a large
 * portfolio never stretches the dashboard.
 */
export function SpaceByProperty({
  properties,
  showRequests,
}: {
  properties: PropertySpace[];
  showRequests: boolean;
}) {
  const rows = properties
    .filter((p) => p.space.totalSqm > 0)
    .sort((a, b) => b.space.vacantSqm - a.space.vacantSqm);
  const preview = rows.slice(0, PREVIEW_COUNT);
  const hiddenCount = rows.length - preview.length;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Space by property</CardTitle>
          <p className="text-xs text-muted-foreground">
            Occupied vs vacant m² · most vacant first
          </p>
        </div>
        <Link
          href="/protected/properties"
          className="text-xs font-medium text-primary hover:underline"
        >
          All properties
        </Link>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No property has unit areas recorded yet.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border/60">
              {preview.map((property) => (
                <li key={property.id}>
                  <PropertySpaceRow
                    property={property}
                    showRequests={showRequests}
                  />
                </li>
              ))}
            </ul>

            {hiddenCount > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <Modal
                  title="Space by property"
                  description={`Occupied and vacant m² for all ${rows.length} properties, most vacant first.`}
                  widthClassName="max-w-2xl"
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <ListTree className="h-3.5 w-3.5" />
                      View all {rows.length} properties
                      <span className="text-muted-foreground">
                        (+{hiddenCount} more)
                      </span>
                    </Button>
                  }
                >
                  <ul className="divide-y divide-border/60">
                    {rows.map((property) => (
                      <li key={property.id}>
                        <PropertySpaceRow
                          property={property}
                          showRequests={showRequests}
                        />
                      </li>
                    ))}
                  </ul>
                </Modal>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The biggest empty units — what could be let next. */
export function LargestVacantUnits({
  units,
}: {
  units: {
    id: string;
    label: string;
    areaSqm: number;
    propertyId: string;
    propertyName: string;
  }[];
}) {
  const max = units[0]?.areaSqm ?? 0;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-base">Largest vacant units</CardTitle>
        <p className="text-xs text-muted-foreground">Ready to let, by area</p>
      </CardHeader>
      <CardContent>
        {units.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No vacant units with a recorded area.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {units.map((unit) => (
              <li key={unit.id}>
                <Link
                  href={`/protected/properties/${unit.propertyId}?occupancy=empty`}
                  className="block rounded-lg border border-border/60 p-3 transition-colors hover:border-teal-300 hover:bg-teal-50/30"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                      {unit.propertyName}
                      <span className="font-medium text-slate-500">
                        {" "}
                        · {unit.label}
                      </span>
                    </p>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                      {formatSqm(unit.areaSqm)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-400"
                      style={{ width: `${max > 0 ? (unit.areaSqm / max) * 100 : 0}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
