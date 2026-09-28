import { format } from "date-fns";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";

import { formatMoney } from "@/lib/finance";
import {
  getOccupancyReport,
  parseMonthKey,
  type OccupancyStatusFilter,
} from "@/lib/occupancy-report";
import { OccupancyReportDocument } from "@/lib/pdf/occupancy-report";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isStaffAdmin } from "@/lib/session";

const STATUS_FILTERS: OccupancyStatusFilter[] = ["all", "occupied", "partial", "vacant"];
const STATUS_LABEL: Record<OccupancyStatusFilter, string | null> = {
  all: null,
  occupied: "occupied",
  partial: "part-month",
  vacant: "vacant",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Printable Occupancy & Vacancy report — every unit's status for one month,
 * for one property or all of them.
 *   ?month=YYYY-MM  ?property=<id|all>  ?status=all|occupied|partial|vacant
 *   ?inline=1 opens in the browser instead of downloading.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isStaffAdmin(user.userType)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const month = params.get("month") ?? "";
  const propertyId = params.get("property") ?? "all";
  const statusParam = (params.get("status") ?? "all") as OccupancyStatusFilter;
  const status = STATUS_FILTERS.includes(statusParam) ? statusParam : "all";

  if (!parseMonthKey(month)) {
    return NextResponse.json({ error: "Choose a month (YYYY-MM)." }, { status: 400 });
  }

  let report;
  try {
    report = await getOccupancyReport({ month, propertyId, status });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const property =
    propertyId !== "all"
      ? await prisma.property.findUnique({
          where: { id: propertyId },
          select: { name: true },
        })
      : null;
  const scopeLabel = property ? property.name : "All properties";

  const pdfBuffer = await renderToBuffer(
    OccupancyReportDocument({
      scopeLabel,
      monthLabel: report.monthLabel,
      periodLabel: report.periodLabel,
      periodDays: report.periodDays,
      statusFilterLabel: STATUS_LABEL[status],
      totals: report.totals,
      groups: report.groups.map((group) => ({
        ...group,
        rows: group.rows.map((row) => ({
          ...row,
          rentLabel:
            row.status !== "vacant" && row.monthlyRent !== null
              ? formatMoney(row.monthlyRent).replace("OMR", "").trim()
              : "—",
        })),
      })),
      generatedAt: format(new Date(), "dd/MM/yyyy HH:mm"),
    }),
  );

  const filename = `occupancy-report-${month}-${slug(scopeLabel)}${status !== "all" ? `-${status}` : ""}.pdf`;
  const disposition = params.get("inline") === "1" ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
    },
  });
}
