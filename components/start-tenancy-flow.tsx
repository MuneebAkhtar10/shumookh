"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  Copy,
  DoorOpen,
  FilePenLine,
  FileText,
  FileUp,
  Loader2,
  ScanText,
  Sparkles,
  UserPlus,
} from "lucide-react";

import type { CreatedUnit } from "@/app/tenancy-import-actions";
import {
  createPropertyFromContractAction,
  createTenantFromContractAction,
  createUnitFromContractAction,
  findUnitInPropertyAction,
  readTenancyPdfAction,
} from "@/app/tenancy-import-actions";
import { StartTenancyForm, type TenancyPrefill } from "@/components/start-tenancy-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { PickableUnit } from "@/components/unit-picker";
import { OMAN_GOVERNORATES } from "@/lib/oman";
import type { TenancyExtraction } from "@/lib/tenancy-extract";
import type { TenancyMatch } from "@/lib/tenancy-match";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";

type Tenant = { id: string; email: string; firstName: string | null; lastName: string | null };
export type PropertyTypeOption = { id: string; label: string; unitNounSingular: string };

type Step = "choose" | "manual" | "upload" | "review";

type ReadResult = { extraction: TenancyExtraction; match: TenancyMatch; fileName: string };

const READING_STEPS = [
  { icon: FileUp, label: "Uploading the document" },
  { icon: ScanText, label: "Reading the agreement" },
  { icon: Sparkles, label: "Matching property, unit and tenant" },
];

const displayName = (t: { firstName: string | null; lastName: string | null; email: string }) =>
  [t.firstName, t.lastName].filter(Boolean).join(" ") || t.email;

/**
 * "Create a tenancy" — two ways in: type the details yourself, or upload the
 * signed agreement PDF and let the system read it, fill the form, and offer to
 * create any property, unit or tenant that isn't in the system yet.
 */
export function StartTenancyFlow({
  availableTenants,
  pickableUnits,
  propertyTypes,
}: {
  availableTenants: Tenant[];
  pickableUnits: PickableUnit[];
  propertyTypes: PropertyTypeOption[];
}) {
  const [step, setStep] = useState<Step>("choose");
  const [tenants, setTenants] = useState(availableTenants);
  const [units, setUnits] = useState(pickableUnits);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ReadResult | null>(null);

  // What the person resolved during this import, on top of what the reader matched.
  const [property, setProperty] = useState<{ id: string; name: string } | null>(null);
  const [unit, setUnit] = useState<{ id: string; label: string } | null>(null);
  const [tenant, setTenant] = useState<{ id: string; name: string } | null>(null);
  const [createdTenant, setCreatedTenant] = useState<{ name: string; email: string; password: string } | null>(null);
  const [blockedUnit, setBlockedUnit] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const reset = () => {
    setFile(null);
    setResult(null);
    setProperty(null);
    setUnit(null);
    setTenant(null);
    setCreatedTenant(null);
    setBlockedUnit(null);
    setDialogOpen(false);
  };

  /* Effective state = what the reader matched, unless the person overrode it. */
  const match = result?.match;
  const effProperty =
    property ?? (match?.property.status === "found" && match.property.id ? { id: match.property.id, name: match.property.name! } : null);
  const effUnit =
    unit ??
    (!property && match?.unit.status === "found" && match.unit.id ? { id: match.unit.id, label: match.unit.label! } : null);
  const unitOccupied = Boolean(blockedUnit) || (!unit && !property && match?.unit.status === "occupied");
  const effTenant =
    tenant ?? (match?.tenant.status === "found" && match.tenant.id ? { id: match.tenant.id, name: match.tenant.name! } : null);
  const tenantBusy = !tenant && match?.tenant.status === "busy";

  const nextStep: "property" | "unit" | "tenant" | null = !result
    ? null
    : !effProperty
      ? "property"
      : !effUnit && !unitOccupied
        ? "unit"
        : !effTenant && !tenantBusy
          ? "tenant"
          : null;

  const onRead = (read: ReadResult, pdf: File) => {
    setFile(pdf);
    setResult(read);
    setProperty(null);
    setUnit(null);
    setTenant(null);
    setCreatedTenant(null);
    setBlockedUnit(null);
    setStep("review");
    const m = read.match;
    const needsSomething =
      m.property.status !== "found" ||
      (m.unit.status === "missing") ||
      m.tenant.status === "missing";
    setDialogOpen(needsSomething);
  };

  const chargesEnabled = useMemo(() => {
    const u = units.find((x) => x.id === effUnit?.id);
    return u ? u.propertyTypeShowRentBills : true;
  }, [units, effUnit]);

  const prefill = useMemo<TenancyPrefill | undefined>(() => {
    if (!result) return undefined;
    const { extraction: ex } = result;
    const c = ex.contract;
    const notes = [
      ex.notes,
      ex.landlord.name ? `Landlord: ${ex.landlord.name}` : null,
      ex.tenant.sponsorName ? `Sponsor: ${ex.tenant.sponsorName}` : null,
      ex.tenant.laborCardNumber ? `Labor card: ${ex.tenant.laborCardNumber}` : null,
      "Filled from the uploaded signed agreement — please verify.",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      tenantId: effTenant?.id,
      unitId: effUnit?.id,
      startDate: c.startDate ?? undefined,
      leaseEndDate: c.endDate ?? undefined,
      monthlyRent: c.monthlyRent ?? undefined,
      rentDueDay: c.rentDueDay ?? undefined,
      securityDeposit: c.securityDeposit ?? undefined,
      paidBy: c.paidBy ?? undefined,
      purpose: c.purpose ?? undefined,
      agreementRef: ex.agreementRef ?? undefined,
      parkingSlotNumber: c.parkingSlot ?? undefined,
      notes,
      chargesEnabled,
    };
  }, [result, effTenant?.id, effUnit?.id, chargesEnabled]);

  const formKey = `${result?.fileName ?? "manual"}|${effUnit?.id ?? ""}|${effTenant?.id ?? ""}`;

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (step === "choose") {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">How would you like to add it?</h3>
          <p className="text-xs text-muted-foreground">Both end at the same form, so you can review everything before saving.</p>
        </div>
        <div className="space-y-3">
          <MethodCard
            icon={<FilePenLine className="h-5 w-5" />}
            title="Enter details manually"
            description="Pick the tenant and unit and type the lease terms yourself."
            onClick={() => setStep("manual")}
          />
          <MethodCard
            icon={<FileUp className="h-5 w-5" />}
            badge="Auto-fill"
            title="Upload the signed agreement"
            description="We read the PDF and fill the form. If the property, unit or tenant isn't in the system yet, we offer to create it."
            onClick={() => setStep("upload")}
            highlight
          />
        </div>
      </div>
    );
  }

  if (step === "manual") {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => setStep("choose")}>Change method</BackLink>
        {tenants.length === 0 || units.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <p>
              A manual tenancy needs both an unassigned tenant and an empty unit, and there
              {tenants.length === 0 && units.length === 0 ? " are none of either" : tenants.length === 0 ? " are no unassigned tenants" : " are no empty units"} right now.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setStep("upload")}>
                <FileUp className="h-4 w-4" />
                Upload the agreement instead
              </Button>
              <Link href="/protected/users" className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted">
                People
              </Link>
              <Link href="/protected/properties" className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted">
                Properties
              </Link>
            </div>
          </div>
        ) : (
          <StartTenancyForm availableTenants={tenants} pickableUnits={units} />
        )}
      </div>
    );
  }

  if (step === "upload") {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => setStep("choose")}>Change method</BackLink>
        <PdfUploader onRead={onRead} onManual={() => setStep("manual")} />
      </div>
    );
  }

  /* step === "review" */
  return (
    <div className="space-y-4">
      <BackLink
        onClick={() => {
          reset();
          setStep("choose");
        }}
      >
        Start over
      </BackLink>

      {result && (
        <ReviewBanner
          result={result}
          property={effProperty}
          unit={effUnit}
          unitOccupied={unitOccupied}
          tenant={effTenant}
          tenantBusy={tenantBusy}
          canResolve={nextStep !== null}
          onResolve={() => setDialogOpen(true)}
          onUploadAnother={() => {
            reset();
            setStep("upload");
          }}
        />
      )}

      <StartTenancyForm
        key={formKey}
        availableTenants={tenants}
        pickableUnits={units}
        prefill={prefill}
        attachFile={file}
      />

      {result && (
        <ResolveDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          result={result}
          propertyTypes={propertyTypes}
          step={createdTenant ? "tenantDone" : nextStep}
          property={effProperty}
          createdTenant={createdTenant}
          onPropertyResolved={async (p) => {
            setProperty(p);
            setUnit(null);
            setBlockedUnit(null);
            // A different property was chosen or created: look the unit up in it.
            const found = await findUnitInPropertyAction({
              propertyId: p.id,
              label: result.extraction.property.unitLabel ?? "",
            });
            if (found.status === "found" && found.id) {
              setUnit({ id: found.id, label: found.label! });
            } else if (found.status === "occupied") {
              setBlockedUnit(found.label ?? result.extraction.property.unitLabel ?? "");
            }
          }}
          onUnitCreated={(u) => {
            setUnits((list) => [...list, u]);
            setUnit({ id: u.id, label: u.label });
          }}
          onTenantCreated={(t, password) => {
            setTenants((list) => [...list, t]);
            setTenant({ id: t.id, name: displayName(t) });
            setCreatedTenant({ name: displayName(t), email: t.email, password });
          }}
          onDone={() => {
            setCreatedTenant(null);
            setDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ── Building blocks ──────────────────────────────────────────────────────── */

function MethodCard({
  icon,
  title,
  description,
  badge,
  highlight,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all hover:shadow-md ${
        highlight
          ? "border-teal-300 bg-gradient-to-r from-teal-50 to-cyan-50/50 hover:border-teal-400"
          : "border-border/70 bg-card hover:border-primary/40"
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          highlight ? "bg-teal-600 text-white" : "bg-muted text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              <Sparkles className="h-3 w-3" />
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/** Drag-and-drop PDF picker that reads the file as soon as it's chosen. */
function PdfUploader({
  onRead,
  onManual,
}: {
  onRead: (result: ReadResult, file: File) => void;
  onManual: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const read = useCallback(
    (picked: File) => {
      setError(null);
      const isPdf = picked.type === "application/pdf" || picked.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) return setError("That isn't a PDF. Upload the signed agreement as a PDF file.");
      if (picked.size > MAX_UPLOAD_BYTES) {
        return setError(`That PDF is ${(picked.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_LABEL}.`);
      }

      setFile(picked);
      setFailedFile(null);
      setPhase(0);
      timers.current.forEach(clearTimeout);
      timers.current = [setTimeout(() => setPhase(1), 900), setTimeout(() => setPhase(2), 6000)];

      startTransition(async () => {
        const data = new FormData();
        data.set("file", picked);
        let response;
        try {
          response = await readTenancyPdfAction(data);
        } catch {
          response = { ok: false as const, error: "Something went wrong while reading the PDF. Please try again." };
        }
        timers.current.forEach(clearTimeout);
        if (response.ok) {
          onRead({ extraction: response.extraction, match: response.match, fileName: response.fileName }, picked);
        } else {
          setError(response.error);
          setFailedFile(picked);
          setFile(null);
        }
      });
    },
    [onRead],
  );

  if (pending && file) {
    return (
      <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/70 to-cyan-50/40 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-teal-200">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        </div>
        <ol className="mt-4 space-y-2.5">
          {READING_STEPS.map((s, i) => {
            const state = i < phase ? "done" : i === phase ? "active" : "todo";
            return (
              <li
                key={s.label}
                className={`flex items-center gap-2.5 text-sm ${state === "todo" ? "text-muted-foreground/60" : "text-foreground"}`}
              >
                {state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                ) : state === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                ) : (
                  <s.icon className="h-4 w-4" />
                )}
                {s.label}
                {state === "active" && "…"}
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">This usually takes 10–30 seconds. Scanned and Arabic agreements are supported.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) read(dropped);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-teal-500 bg-teal-50" : "border-border hover:border-teal-400 hover:bg-teal-50/40"
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm">
          <FileUp className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold">Drop the signed agreement here, or click to choose</p>
        <p className="text-xs text-muted-foreground">PDF up to {MAX_UPLOAD_LABEL} · typed, scanned, English or Arabic</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) read(picked);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {failedFile && (
                <Button type="button" size="sm" onClick={() => read(failedFile)}>
                  Try again
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={onManual}>
                Fill the form by hand instead
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        The PDF is sent to an AI reading service to extract the details. You review and confirm everything before anything is saved.
      </p>
    </div>
  );
}

function ReviewBanner({
  result,
  property,
  unit,
  unitOccupied,
  tenant,
  tenantBusy,
  canResolve,
  onResolve,
  onUploadAnother,
}: {
  result: ReadResult;
  property: { name: string } | null;
  unit: { label: string } | null;
  unitOccupied: boolean;
  tenant: { name: string } | null;
  tenantBusy: boolean;
  canResolve: boolean;
  onResolve: () => void;
  onUploadAnother: () => void;
}) {
  const { extraction: ex, match, fileName } = result;
  const rows: { icon: React.ReactNode; label: string; value: string; state: "ok" | "warn" }[] = [
    {
      icon: <Building2 className="h-4 w-4" />,
      label: "Property",
      value: property ? property.name : `“${match.property.suggestedName || "Unknown"}” — not in your list`,
      state: property ? "ok" : "warn",
    },
    {
      icon: <DoorOpen className="h-4 w-4" />,
      label: "Unit",
      value: unit
        ? unit.label
        : unitOccupied
          ? `${ex.property.unitLabel} — already has an active tenancy`
          : `${ex.property.unitLabel ?? "Unknown"} — not created yet`,
      state: unit ? "ok" : "warn",
    },
    {
      icon: <UserPlus className="h-4 w-4" />,
      label: "Tenant",
      value: tenant
        ? tenant.name
        : tenantBusy
          ? `${match.tenant.name} — already has an active tenancy`
          : `${ex.tenant.name ?? "Unknown"} — not in People yet`,
      state: tenant ? "ok" : "warn",
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/70 to-cyan-50/40">
      <div className="flex items-center gap-3 border-b border-teal-100 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-teal-950">Filled from your agreement</p>
          <p className="truncate text-xs text-teal-800/80">{fileName}</p>
        </div>
        <button type="button" onClick={onUploadAnother} className="text-xs font-medium text-teal-800 underline-offset-2 hover:underline">
          Use another PDF
        </button>
      </div>
      <ul className="divide-y divide-teal-100/80">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className={row.state === "ok" ? "text-teal-700" : "text-amber-600"}>{row.icon}</span>
            <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">{row.label}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{row.value}</span>
            {row.state === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            )}
          </li>
        ))}
      </ul>
      {canResolve && (
        <div className="border-t border-teal-100 bg-white/60 px-4 py-2.5">
          <Button type="button" size="sm" onClick={onResolve}>
            Create the missing records
          </Button>
        </div>
      )}
      {ex.warnings.length > 0 && (
        <ul className="space-y-1 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {ex.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-teal-100 px-4 py-2 text-[11px] text-muted-foreground">
        Automatically read — check every field below before saving.
      </p>
    </div>
  );
}

/* ── "Not in your list — create it?" ───────────────────────────────────────── */

const STEP_ORDER = ["property", "unit", "tenant"] as const;

function ResolveDialog({
  open,
  onClose,
  result,
  propertyTypes,
  step,
  property,
  createdTenant,
  onPropertyResolved,
  onUnitCreated,
  onTenantCreated,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  result: ReadResult;
  propertyTypes: PropertyTypeOption[];
  step: "property" | "unit" | "tenant" | "tenantDone" | null;
  property: { id: string; name: string } | null;
  createdTenant: { name: string; email: string; password: string } | null;
  onPropertyResolved: (p: { id: string; name: string }) => Promise<void> | void;
  onUnitCreated: (u: CreatedUnit) => void;
  onTenantCreated: (t: Tenant, password: string) => void;
  onDone: () => void;
}) {
  const { match, extraction } = result;
  const needed = STEP_ORDER.filter((s) => {
    if (s === "property") return match.property.status !== "found";
    if (s === "unit") return match.unit.status === "missing" || match.property.status !== "found";
    return match.tenant.status === "missing";
  });
  const index = step && step !== "tenantDone" ? needed.indexOf(step) : needed.length - 1;

  // Close automatically once nothing is left to resolve.
  useEffect(() => {
    if (open && step === null) onDone();
  }, [open, step, onDone]);

  return (
    <Dialog
      open={open && step !== null}
      onClose={onClose}
      title={
        step === "property"
          ? match.property.candidates.length > 0
            ? "Confirm the property"
            : "Property not found"
          : step === "unit"
            ? `${extraction.property.unitLabel ?? "Unit"} not found`
            : step === "tenant"
              ? "Tenant not found"
              : "Tenant account created"
      }
      description={
        needed.length > 1 && step !== "tenantDone" ? (
          <span>
            Step {Math.max(index, 0) + 1} of {needed.length} · creating what this agreement refers to
          </span>
        ) : undefined
      }
      icon={
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          {step === "property" ? (
            <Building2 className="h-5 w-5" />
          ) : step === "unit" ? (
            <DoorOpen className="h-5 w-5" />
          ) : step === "tenantDone" ? (
            <CheckCircle2 className="h-5 w-5 text-teal-700" />
          ) : (
            <UserPlus className="h-5 w-5" />
          )}
        </span>
      }
      widthClassName="max-w-xl"
    >
      {step === "property" && (
        <PropertyStep match={match} extraction={extraction} propertyTypes={propertyTypes} onResolved={onPropertyResolved} onSkip={onClose} />
      )}
      {step === "unit" && property && (
        <UnitStep property={property} match={match} onCreated={onUnitCreated} onSkip={onClose} />
      )}
      {step === "tenant" && <TenantStep match={match} onCreated={onTenantCreated} onSkip={onClose} />}
      {step === "tenantDone" && createdTenant && <TenantDone info={createdTenant} onDone={onDone} />}
    </Dialog>
  );
}

function StepFooter({
  pending,
  yesLabel,
  noLabel = "No, I'll choose manually",
  error,
  onSkip,
  yesType = "submit",
}: {
  pending: boolean;
  yesLabel: string;
  noLabel?: string;
  error: string | null;
  onSkip: () => void;
  yesType?: "submit" | "button";
}) {
  return (
    <div className="mt-4 space-y-3">
      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onSkip} disabled={pending}>
          {noLabel}
        </Button>
        <Button type={yesType} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {yesLabel}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Best guess at the property type from the unit label and land use on the
 * agreement ("Flat 12" -> apartment building, "Villa 3" -> villa, shops and
 * offices -> a commercial type). Falls back to the first type. */
function guessPropertyType(types: PropertyTypeOption[], ex: TenancyExtraction): string {
  const text = `${ex.property.unitLabel ?? ""} ${ex.property.landUse ?? ""} ${ex.property.activity ?? ""}`.toLowerCase();
  const find = (...needles: string[]) =>
    types.find((t) => needles.some((n) => t.label.toLowerCase().includes(n)))?.id;

  const guess =
    /villa/.test(text)
      ? find("villa")
      : /shop|office|commercial|store|warehouse/.test(text)
        ? find("office", "shop", "commercial")
        : /apt|apartment|flat|residential/.test(text)
          ? find("apartment")
          : undefined;
  return guess ?? types[0]?.id ?? "";
}

function PropertyStep({
  match,
  extraction,
  propertyTypes,
  onResolved,
  onSkip,
}: {
  match: TenancyMatch;
  extraction: TenancyExtraction;
  propertyTypes: PropertyTypeOption[];
  onResolved: (p: { id: string; name: string }) => Promise<void> | void;
  onSkip: () => void;
}) {
  const p = extraction.property;
  const [name, setName] = useState(match.property.suggestedName);
  const [typeId, setTypeId] = useState(guessPropertyType(propertyTypes, extraction));
  const [address, setAddress] = useState(match.property.suggestedAddress);
  const [governorate, setGovernorate] = useState(p.governorate && OMAN_GOVERNORATES.includes(p.governorate as never) ? p.governorate : "Muscat");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createPropertyFromContractAction({
        name,
        propertyTypeId: typeId,
        address,
        governorate,
        area: p.area ?? "",
        buildingNumber: p.buildingNumber ?? "",
        wayNumber: p.way ?? "",
        plotNumber: p.plot ?? "",
      });
      if (!res.ok) return setError(res.error);
      await onResolved({ id: res.property.id, name: res.property.name });
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {match.property.candidates.length > 0 ? (
        <>
          <p className="text-sm">
            This agreement doesn&apos;t name its property. Its address details
            {" "}
            <span className="text-muted-foreground">
              ({[p.buildingNumber && `Building ${p.buildingNumber}`, p.way && `Way ${p.way}`, p.plot && `Plot ${p.plot}`, p.area].filter(Boolean).join(" · ")})
            </span>{" "}
            match a property you already have. Is it the same one?
          </p>
          <div className="space-y-2">
            {match.property.candidates.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">Matches on {c.matchedOn.join(", ")}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => startTransition(async () => onResolved({ id: c.id, name: c.name }))}
                >
                  Yes, use {c.name}
                </Button>
              </div>
            ))}
          </div>
          <p className="border-t pt-3 text-sm font-medium">Not the same? Create a new property instead:</p>
        </>
      ) : (
        <p className="text-sm">
          The property <strong>“{name.trim() || match.property.suggestedName}”</strong> isn&apos;t in your list. Do you want to create it first?
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Property name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Property type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            {propertyTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Address" hint="Built from the block, building, way and plot on the agreement.">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} required />
      </Field>
      <Field label="Governorate">
        <Select value={governorate} onChange={(e) => setGovernorate(e.target.value)}>
          {OMAN_GOVERNORATES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </Field>
      <StepFooter pending={pending} yesLabel={match.property.candidates.length > 0 ? "Create a new property" : "Yes, create property"} error={error} onSkip={onSkip} />
    </form>
  );
}

function UnitStep({
  property,
  match,
  onCreated,
  onSkip,
}: {
  property: { id: string; name: string };
  match: TenancyMatch;
  onCreated: (u: CreatedUnit) => void;
  onSkip: () => void;
}) {
  const [label, setLabel] = useState(match.unit.suggestedLabel);
  const [area, setArea] = useState("");
  const [floor, setFloor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createUnitFromContractAction({ propertyId: property.id, label, areaSqm: area, floor });
      if (!res.ok) return setError(res.error);
      onCreated(res.unit);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm">
        There&apos;s no unit <strong>“{label || "—"}”</strong> in <strong>{property.name}</strong> yet. Create it now?
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Unit number">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
        <Field label="Area (m²)" hint="Required — the agreement doesn't state it.">
          <Input type="number" min="0.01" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. 85.5" required autoFocus />
        </Field>
        <Field label="Floor (optional)">
          <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} />
        </Field>
      </div>
      <StepFooter pending={pending} yesLabel="Yes, create unit" error={error} onSkip={onSkip} />
    </form>
  );
}

function TenantStep({
  match,
  onCreated,
  onSkip,
}: {
  match: TenancyMatch;
  onCreated: (t: Tenant, password: string) => void;
  onSkip: () => void;
}) {
  const s = match.tenant.suggested;
  const [firstName, setFirstName] = useState(s.firstName);
  const [lastName, setLastName] = useState(s.lastName);
  const [email, setEmail] = useState(s.email);
  const [phone, setPhone] = useState(s.phone);
  const [civilId, setCivilId] = useState(s.civilId);
  const [nationality, setNationality] = useState(s.nationality);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createTenantFromContractAction({ firstName, lastName, email, phone, civilId, nationality });
      if (!res.ok) return setError(res.error);
      onCreated(res.tenant, res.temporaryPassword);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm">
        No tenant matching <strong>“{[s.firstName, s.lastName].filter(Boolean).join(" ") || "this name"}”</strong>
        {s.civilId ? ` (Civil ID ${s.civilId})` : ""} was found in People. Create them now as a tenant?
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </Field>
        <Field label="Last name">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Email" hint="Not on the agreement — needed for their login.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tenant@example.com" required autoFocus={!s.email} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>
        <Field label="Civil ID / Resident card">
          <Input value={civilId} onChange={(e) => setCivilId(e.target.value)} />
        </Field>
        <Field label="Nationality">
          <Input value={nationality} onChange={(e) => setNationality(e.target.value)} />
        </Field>
      </div>
      <StepFooter pending={pending} yesLabel="Yes, create tenant" error={error} onSkip={onSkip} />
    </form>
  );
}

function TenantDone({
  info,
  onDone,
}: {
  info: { name: string; email: string; password: string };
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <strong>{info.name}</strong> is now in People and selected on the agreement form.
      </p>
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Temporary password</p>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-sm ring-1 ring-teal-200">{info.password}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(info.password).then(() => setCopied(true));
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-teal-900/80">
          Login: {info.email}. Shown only now — you can reset it any time from People.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={onDone}>
          Continue to the agreement
        </Button>
      </div>
    </div>
  );
}
