"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import {
  useCreateHrCandidate,
  useCreateHrEmployee,
  useCreateHrJob,
} from "@morechat/core/hr/mutations";
import { hrJobListOptions } from "@morechat/core/hr/queries";
import {
  affiliatePickListOptions,
  affiliateProductListOptions,
} from "@morechat/core/affiliate/queries";
import { useUpsertAffiliateDaily } from "@morechat/core/affiliate/mutations";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type { HrCandidateStage } from "@morechat/core/types";
import { useT } from "../i18n";
import {
  IMPORT_FIELDS,
  IMPORT_SAMPLE,
  buildImportRows,
  formatImportError,
  guessColumnMap,
  parseImportError,
  parseTable,
  type ImportDomain,
  type ImportField,
  type ImportRowContext,
  type ImportRowResult,
} from "./import";

/** The preview stops at 20 rows: enough to check a mapping, short enough that
 *  the counts above stay the thing you look at. */
const PREVIEW_ROWS = 20;

/** Select value for "this field has no column". A real column is its index. */
const UNMAPPED = "__unmapped";

interface ImportFailure {
  line: number;
  errors: string[];
}

interface ImportResult {
  ok: number;
  failures: ImportFailure[];
}

/**
 * Paste → map columns → preview → import, for the ledgers that take pasted rows:
 * the three people ledgers (`jobs`, `candidates`, `employees`) and the affiliate
 * daily report (`affiliate_daily`, `§11`).
 *
 * The dialog owns no rules. Everything that decides whether a row can be
 * written — header aliases, reference resolution, dates, amounts, duplicates —
 * is in `import.ts`, and every run of it is a pure function of the pasted text
 * and the ledger's current names. What stays here is state: the text, the
 * column the user picked over the guessed one, and the rows that came back
 * wrong.
 *
 * Writes are serial, one row at a time, through the same mutations the rest of
 * the ledger uses, so every write invalidates the ledger and `/counts` the way
 * a hand-entered row does. A failed row keeps its reason and stays on screen;
 * a succeeded row is only counted, because the list behind the dialog has
 * already refreshed.
 */
export function ImportSheet({
  wsId,
  domain,
  open,
  onOpenChange,
}: {
  wsId: string;
  domain: ImportDomain;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT("blocks");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Partial<Record<ImportField, number>> | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // One sheet, one attempt. A reopen starts empty because the paste, the column
  // picks and the failure list describe a paste that has already been written;
  // the ledger behind the dialog has refreshed in the meantime. Resetting while
  // rendering (rather than in an effect) keeps the first frame of the reopened
  // dialog from flashing the previous attempt.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setPicked(null);
      setPending(false);
      setResult(null);
    }
  }

  // Only the references the dialog's own domain needs are read: a jobs import
  // never resolves a job, an employees import never resolves a member post, and
  // a daily report resolves a pick out of the product and creator lists the
  // affiliate panes already load.
  const jobsQuery = useQuery({
    ...hrJobListOptions(wsId),
    enabled: open && !!wsId && domain === "candidates",
  });
  const membersQuery = useQuery({
    ...memberListOptions(wsId),
    enabled: open && !!wsId && domain === "employees",
  });
  const departmentsQuery = useQuery({
    ...departmentListOptions(wsId),
    enabled: open && !!wsId && (domain === "jobs" || domain === "employees"),
  });
  const picksQuery = useQuery({
    ...affiliatePickListOptions(wsId),
    enabled: open && !!wsId && domain === "affiliate_daily",
  });
  const productsQuery = useQuery({
    ...affiliateProductListOptions(wsId),
    enabled: open && !!wsId && domain === "affiliate_daily",
  });
  const creatorsQuery = useQuery({
    ...creatorListOptions(wsId),
    enabled: open && !!wsId && domain === "affiliate_daily",
  });

  const parsed = useMemo(() => parseTable(text), [text]);
  const guessed = useMemo(() => guessColumnMap(parsed.headers, domain), [parsed.headers, domain]);
  const columnMap = picked ?? guessed;

  const ctx = useMemo<ImportRowContext>(() => {
    const productTitles = new Map(
      (productsQuery.data?.products ?? []).map((row) => [row.id, row.title] as const),
    );
    const creatorNames = new Map(
      (creatorsQuery.data?.creators ?? []).map((row) => [row.id, row.display_name] as const),
    );
    return {
      jobs: (jobsQuery.data?.jobs ?? []).map((job) => ({ id: job.id, title: job.title })),
      members: (membersQuery.data ?? []).map((member) => ({ id: member.id, name: member.name })),
      departments: departmentsQuery.data ?? [],
      picks: (picksQuery.data?.picks ?? []).map((pick) => ({
        id: pick.id,
        productTitle: productTitles.get(pick.product_id) ?? pick.product_id,
        creatorName: creatorNames.get(pick.creator_id) ?? pick.creator_id,
      })),
    };
  }, [
    jobsQuery.data,
    membersQuery.data,
    departmentsQuery.data,
    picksQuery.data,
    productsQuery.data,
    creatorsQuery.data,
  ]);

  const rows = useMemo(
    () => buildImportRows(parsed, columnMap, domain, ctx),
    [parsed, columnMap, domain, ctx],
  );
  const importable = rows.filter((row) => row.errors.length === 0);
  const invalid = rows.length - importable.length;

  const failureLines = new Set((result?.failures ?? []).map((failure) => failure.line));
  const previewRows: ImportRowResult[] = result
    ? rows
        .filter((row) => row.errors.length > 0 || failureLines.has(row.line))
        .map((row) => {
          const failure = result.failures.find((entry) => entry.line === row.line);
          return failure ? { ...row, errors: failure.errors } : row;
        })
    : rows.slice(0, PREVIEW_ROWS);
  const previewFields = IMPORT_FIELDS[domain].filter((field) => columnMap[field] !== undefined);

  const createJob = useCreateHrJob();
  const createCandidate = useCreateHrCandidate();
  const createEmployee = useCreateHrEmployee();
  const upsertDaily = useUpsertAffiliateDaily();

  /** One row's write, in the ledger's own request shape. Ids were resolved by
   *  `buildImportRows`, so a row that reaches here is already writable. */
  const send = (values: Record<string, string>) => {
    switch (domain) {
      case "jobs": {
        const midpoint = values.salary ? Number(values.salary) : null;
        // Two columns keep the band; a single range column can only supply its
        // midpoint, which `buildImportRows` already wrote to `salary`.
        const salaryMin = values.salary_min ? Number(values.salary_min) : midpoint;
        const salaryMax = values.salary_max ? Number(values.salary_max) : midpoint;
        return createJob.mutateAsync({
          title: values.title ?? "",
          department_id: values.department_id ?? null,
          level: values.level ?? null,
          headcount: values.headcount ? Number(values.headcount) : undefined,
          salary_min: salaryMin,
          salary_max: salaryMax,
          owner_member_id: values.owner_member_id ?? null,
        });
      }
      case "candidates":
        return createCandidate.mutateAsync({
          name: values.name ?? "",
          job_id: values.job_id ?? "",
          // Validated against `HrCandidateStage` by the importer; an unstaged
          // candidate keeps the server's default.
          stage: values.stage as HrCandidateStage | undefined,
          phone: values.phone ?? null,
          email: values.email ?? null,
          expected_salary: values.expected_salary ? Number(values.expected_salary) : null,
          // The profile fields the match score reads: without them the keyword,
          // education and experience dimensions have nothing to measure.
          edu: values.edu ?? null,
          years_experience: values.years_experience ? Number(values.years_experience) : null,
          resume_text: values.resume_text ?? null,
          owner_member_id: values.owner_member_id ?? null,
        });
      case "employees":
        return createEmployee.mutateAsync({
          member_id: values.member_id ?? "",
          department_id: values.department_id ?? null,
          job_title: values.job_title ?? null,
          grade: values.grade ?? null,
          hire_date: values.hire_date ?? null,
          regular_date: values.regular_date ?? null,
          contract_end: values.contract_end ?? null,
        });
      case "affiliate_daily":
        // The day is replaced, not merged (`§11`): a paste of a corrected report
        // has to overwrite the numbers that were wrong, so an absent measure is
        // written as the server's zero rather than keeping the old value.
        return upsertDaily.mutateAsync({
          pick_id: values.pick_id ?? "",
          stat_date: values.stat_date ?? "",
          gmv_amount: values.gmv ? Number(values.gmv) : undefined,
          order_count: values.orders ? Number(values.orders) : undefined,
          refund_amount: values.refund ? Number(values.refund) : undefined,
          est_commission: values.commission ? Number(values.commission) : undefined,
        });
    }
  };

  const runImport = async () => {
    if (pending || importable.length === 0) return;
    setPending(true);
    const failures: ImportFailure[] = [];
    let ok = 0;
    for (const row of importable) {
      try {
        await send(row.values);
        ok += 1;
      } catch {
        failures.push({ line: row.line, errors: [formatImportError("server_error")] });
      }
    }
    setResult({ ok, failures });
    setPending(false);
  };

  const fieldLabel = (field: ImportField) => t(($) => $.import.field[field]);
  const errorText = (error: string) => {
    const { code, value } = parseImportError(error);
    return t(($) => $.import.errors[code], { value });
  };

  const columnOptions = [
    { value: UNMAPPED, label: t(($) => $.import.unmapped) },
    ...parsed.headers.map((header, index) => ({
      value: String(index),
      label: header || `#${index + 1}`,
    })),
  ];

  const summary = result
    ? t(($) => $.import.done, { count: result.ok, failed: result.failures.length })
    : t(($) => $.import.summary, { count: rows.length, ok: importable.length, bad: invalid });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(($) => $.import.title)}</DialogTitle>
          <DialogDescription>{t(($) => $.import.paste_hint)}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
          <Textarea
            aria-label={t(($) => $.import.paste_label)}
            value={text}
            rows={5}
            disabled={pending || result !== null}
            onChange={(event) => {
              setText(event.target.value);
              // A new paste re-guesses: the old columns belonged to the old header.
              setPicked(null);
            }}
            className="min-h-24 font-mono text-caption"
          />

          {/* A demo workspace has no sheet to paste. One click fills the ledger's
              own example, which is the same shape as a real paste — including a
              row that fails, so the error copy is visible before the user has to
              guess what went wrong with their own rows. */}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={pending || result !== null}
              onClick={() => {
                setText(IMPORT_SAMPLE[domain]);
                setPicked(null);
              }}
            >
              {t(($) => $.import.sample)}
            </Button>
          </div>

          {parsed.headers.length > 0 ? (
            <section aria-label={t(($) => $.import.map_columns)} className="space-y-2">
              <h3 className="text-caption font-medium text-muted-foreground">
                {t(($) => $.import.map_columns)}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {IMPORT_FIELDS[domain].map((field) => {
                  const column = columnMap[field];
                  const value = column === undefined ? UNMAPPED : String(column);
                  return (
                    <div key={field} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-caption text-muted-foreground">
                        {fieldLabel(field)}
                      </span>
                      <Select
                        items={columnOptions}
                        value={value}
                        disabled={pending || result !== null}
                        onValueChange={(next) => {
                          if (next === null) return;
                          const updated = { ...columnMap };
                          if (next === UNMAPPED) delete updated[field];
                          else updated[field] = Number(next);
                          setPicked(updated);
                        }}
                      >
                        <SelectTrigger
                          aria-label={fieldLabel(field)}
                          className="h-8 min-w-0 flex-1"
                        >
                          <SelectValue>
                            {() => columnOptions.find((option) => option.value === value)?.label}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {columnOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {rows.length > 0 ? (
            <section aria-label={t(($) => $.import.preview)} className="min-h-0 space-y-2">
              <h3 className="text-caption font-medium text-muted-foreground">
                {result ? t(($) => $.import.failed_rows) : t(($) => $.import.preview)}
              </h3>
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full text-caption">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 text-start font-normal">
                        #
                      </th>
                      {previewFields.map((field) => (
                        <th key={field} scope="col" className="px-2 py-1.5 text-start font-normal">
                          {fieldLabel(field)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr
                        key={row.line}
                        className={row.errors.length > 0 ? "text-destructive" : undefined}
                      >
                        <td className="px-2 py-1 tabular-nums text-muted-foreground">{row.line}</td>
                        {previewFields.map((field) => (
                          <td key={field} className="px-2 py-1">
                            {row.values[field] ?? ""}
                          </td>
                        ))}
                        {row.errors.length > 0 ? (
                          <td className="px-2 py-1">
                            {row.errors.map((error) => (
                              <span key={error} className="block">
                                {errorText(error)}
                              </span>
                            ))}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-caption text-muted-foreground" aria-live="polite">
            {summary}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t(($) => $.import.close)}
            </Button>
            <Button
              onClick={() => void runImport()}
              disabled={pending || importable.length === 0 || result !== null}
              aria-busy={pending}
            >
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.import.import_button, { count: importable.length })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
