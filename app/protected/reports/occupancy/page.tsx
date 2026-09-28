import { CalendarDays, ChevronRight, Download, Eye, Layers, Ruler, Search } from "lucide-react";

import { ExpandCollapseAll } from "@/components/expand-collapse-all";

import { PageHeader } from "@/components/page-header";
import { SummaryTile } from "@/components/summary-tile";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  currentMonthKey,
  getOccupancyReport,
  parseMonthKey,
  type OccupancyStatus,
  type OccupancyStatusFilter,
} from "@/lib/occupancy-report";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { formatSqm } from "@/lib/unit-area";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const PREVIEW_ROW_LIMIT = 150;

const STATUS_OPTIONS: { value: OccupancyStatusFilter; label: string }[] = [
  { value: "all", label: "All units" },
  { value: "occupied", label: "Occupied all period" },
  { value: "partial", label: "Part-month" },
  { value: "vacant", label: "Vacant all period" },
];

const STATUS_BADGE: Record<OccupancyStatus, { label: string; className: string }> = {
  occupied: {
    label: "Occupied",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  partial: {
    label: "Part-month",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  vacant: {
    label: "Vacant",
    className: "bg-slate-100 text-slate-700 ring-slate-500/20",
  },
};

/**
 * Occupancy & Vacancy — which units were occupied or vacant in a given
 * month (and how much floor area that is), for one property or all of them,
 * with a printable PDF of the full list.
 */
export default async function OccupancyReportPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const params = (await searchParams) as unknown as {
    month?: string;
    property?: string;
    status?: string;
  };

  const thisMonth = currentMonthKey();
  const month =
    typeof params.month === "string" && parseMonthKey(params.month) && params.month <= thisMonth
      ? params.month
      : thisMonth;
  const propertyId = typeof params.property === "string" ? params.property : "all";
  const status = STATUS_OPTIONS.some((o) => o.value === params.status)
    ? (params.status as OccupancyStatusFilter)
    : "all";

  const [report, properties] = await Promise.all([
    getOccupancyReport({ month, propertyId, status }),
    prisma.property.findMany({
      where: { approved: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, propertyType: { select: { label: true } } },
    }),
  ]);

  const query = new URLSearchParams({ month });
  if (propertyId !== "all") query.set("property", propertyId);
  if (status !== "all") query.set("status", status);
  const pdfHref = `/api/reports/occupancy/pdf?${query.toString()}`;

  const { totals } = report;
  const hasArea = totals.totalSqm > 0;

  let shown = 0;
  const listedCount = report.groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Occupancy & Vacancy"
        description={`${report.scopeLabel} · ${report.periodLabel}`}
        back={{ href: "/protected/reports", label: "Reports" }}
      >
        <ButtonLink href={`${pdfHref}&inline=1`} target="_blank" variant="outline">
          <Eye className="h-4 w-4" />
          View PDF
        </ButtonLink>
        <ButtonLink href={pdfHref}>
          <Download className="h-4 w-4" />
          Download PDF
        </ButtonLink>
      </PageHeader>

      <Card className="border-border/60 p-4 shadow-sm">
        <form className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="occ-month" className="text-xs">
              Month
            </Label>
            <Input
              id="occ-month"
              name="month"
              type="month"
              defaultValue={month}
              max={thisMonth}
              required
              className="w-44"
            />
          </div>
          <div className="min-w-56 space-y-1">
            <Label htmlFor="occ-property" className="text-xs">
              Property
            </Label>
            <Select id="occ-property" name="property" defaultValue={propertyId}>
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name} — {property.propertyType.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-48 space-y-1">
            <Label htmlFor="occ-status" className="text-xs">
              Show
            </Label>
            <Select id="occ-status" name="status" defaultValue={status}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="outline">
            <Search className="h-4 w-4" />
            Apply
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,18rem))] gap-3">
        <SummaryTile
          icon={<Layers className="h-4 w-4" />}
          value={totals.units}
          label="Total units"
          sublabel={`${totals.occupancyPct}% occupancy`}
          accent="bg-teal-500"
          iconBg="bg-teal-50 text-teal-600"
          progress={totals.occupancyPct}
        />
        <SummaryTile
          icon={<CalendarDays className="h-4 w-4" />}
          value={totals.occupied}
          label="Occupied all period"
          sublabel={`${totals.partial} part-month`}
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <SummaryTile
          icon={<CalendarDays className="h-4 w-4" />}
          value={totals.vacant}
          label="Vacant all period"
          accent="bg-slate-400"
          iconBg="bg-slate-100 text-slate-600"
        />
        {hasArea && (
          <SummaryTile
            icon={<Ruler className="h-4 w-4" />}
            value={formatSqm(totals.occupiedSqm)}
            label="Occupied area"
            sublabel={`${formatSqm(totals.vacantSqm)} vacant of ${formatSqm(totals.totalSqm)}`}
            accent="bg-cyan-500"
            iconBg="bg-cyan-50 text-cyan-700"
            progress={
              totals.totalSqm > 0
                ? Math.round((totals.occupiedSqm / totals.totalSqm) * 100)
                : 0
            }
          />
        )}
      </div>

      {report.groups.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {report.groups.length} properties — open one to see its units.
          </p>
          <ExpandCollapseAll />
        </div>
      )}

      {listedCount === 0 ? (
        <Card className="border-border/60 p-10 text-center text-sm text-muted-foreground shadow-sm">
          No units match this selection.
        </Card>
      ) : (
        <div className="space-y-4">
          {report.groups.map((group) => {
            const remaining = PREVIEW_ROW_LIMIT - shown;
            if (remaining <= 0) return null;
            const rows = group.rows.slice(0, remaining);
            shown += rows.length;

            return (
              <Card key={group.propertyId} className="overflow-hidden border-border/60 shadow-sm">
                <details
                  className="group"
                  data-collapsible-group
                  open={report.groups.length === 1}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 bg-teal-50/60 px-4 py-3 transition-colors hover:bg-teal-50 group-open:border-b group-open:border-border/60 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-4 w-4 shrink-0 text-teal-700 transition-transform group-open:rotate-90" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-teal-950">
                        {group.propertyName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.propertyTypeLabel} · {group.totals.units}{" "}
                        {group.totals.units === 1 ? "unit" : "units"}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-xs font-semibold tabular-nums text-teal-900">
                        {group.totals.occupied + group.totals.partial} of {group.totals.units} let
                        {group.totals.totalSqm > 0 && (
                          <>
                            {" · "}
                            {formatSqm(group.totals.occupiedSqm)} occupied
                            {" · "}
                            {formatSqm(group.totals.vacantSqm)} vacant
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-teal-700 ring-1 ring-inset ring-teal-600/20">
                      {group.totals.occupancyPct}%
                    </span>
                  </summary>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Unit</th>
                        <th className="px-2 py-2 font-medium">Floor</th>
                        <th className="px-2 py-2 text-right font-medium">Area (m²)</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-2 py-2 text-center font-medium">Days</th>
                        <th className="px-2 py-2 font-medium">Tenant</th>
                        <th className="px-4 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rows.map((row) => {
                        const badge = STATUS_BADGE[row.status];
                        return (
                          <tr key={row.unitId} className="hover:bg-muted/30">
                            <td className="px-4 py-2 font-semibold">{row.unitLabel}</td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {row.floor ?? "—"}
                            </td>
                            <td className="px-2 py-2 text-right font-medium tabular-nums">
                              {row.areaSqm === null
                                ? "—"
                                : row.areaSqm.toLocaleString("en-US", {
                                    maximumFractionDigits: 2,
                                  })}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                              {row.occupiedDays}/{report.periodDays}
                            </td>
                            <td className="px-2 py-2">
                              {row.status === "vacant" ? "—" : (row.tenantName ?? "—")}
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">
                              {row.note}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </details>
              </Card>
            );
          })}

          {listedCount > PREVIEW_ROW_LIMIT && (
            <p className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
              Showing the first {PREVIEW_ROW_LIMIT} of {listedCount} units on screen.{" "}
              <a href={pdfHref} className="font-medium text-primary hover:underline">
                Download the PDF
              </a>{" "}
              for the complete list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
