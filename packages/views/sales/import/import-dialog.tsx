"use client";

import { useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@morechat/core/api";
import { bdKeys } from "@morechat/core/bd/queries";
import { workbenchKeys } from "@morechat/core/crm/queries";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Field, FieldLabel } from "@morechat/ui/components/ui/field";
import { Input } from "@morechat/ui/components/ui/input";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../../i18n";
import type { ImportKind, ImportPreviewResponse } from "./contract";
import { useImportCopy } from "./copy";
import {
  canCommit,
  errorRows,
  hasSource,
  importCounts,
  previewRows,
  readCsvFile,
  summarizePreview,
} from "./model";

/**
 * 「导入 CSV」 — one dialog, three ledgers (`kind` names which).
 *
 * The flow is the contract's, in this order and no other:
 *
 *   1. **A file or a paste.** Both land in the same field, so what the reader sees
 *      in the textarea is exactly what will be sent — a picked file is not a
 *      hidden second source.
 *   2. **Preview first, always.** 预览 is the only way to reach 确认, and it is a
 *      `dryRun: true` call: the server validates without writing (`WORKBENCH-B3-
 *      BACKLOG` 三条硬规则 3), so the numbers on screen are the numbers the real
 *      import will produce.
 *   3. **Confirm only when nothing is refused.** The real import is all-or-nothing
 *      (rule 2), so a preview holding one error row disables the button instead of
 *      sending a batch the server already said it would roll back.
 *   4. **Nothing optimistic.** A committed batch closes the dialog and asks the
 *      page to invalidate its own list; a failed one keeps the preview and shows
 *      the server's message, because the reader's next move is to fix the file.
 */
export function ImportCsvButton({
  wsId,
  kind,
  onImported,
}: {
  /** The workspace whose query roots a committed batch invalidates. */
  wsId: string;
  kind: ImportKind;
  /**
   * Extra invalidation for the caller's own surface. The dialog already
   * invalidates the pair `WORKBENCH-API` §23.6 names (`bdKeys.all` + `workbenchKeys.all`);
   * a page passes this only when its list lives under a third root — the
   * collaboration ledger's `crmKeys`.
   */
  onImported?: () => void;
}) {
  const { t } = useImportCopy();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2"
        onClick={() => setOpen(true)}
      >
        {t(($) => $.import.button)}
      </Button>
      {open ? (
        <ImportCsvDialog
          wsId={wsId}
          kind={kind}
          onClose={() => setOpen(false)}
          onImported={onImported}
        />
      ) : null}
    </>
  );
}

function ImportCsvDialog({
  wsId,
  kind,
  onClose,
  onImported,
}: {
  wsId: string;
  kind: ImportKind;
  onClose: () => void;
  onImported?: () => void;
}) {
  const { t, reason } = useImportCopy();
  const { t: tCommon } = useT("common");
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const pending = busy !== null;
  const counts = preview === null ? null : importCounts(preview);
  const errors = errorRows(preview);
  const { rows, truncated } = previewRows(preview);

  /** Any edit invalidates the numbers: they described the previous text. */
  const replaceSource = (next: string) => {
    setCsv(next);
    setPreview(null);
    setFailure(null);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(null);
    setFailure(null);
    try {
      replaceSource(await readCsvFile(file));
    } catch {
      setFailure(t(($) => $.import.failed));
    }
  };

  const run = async (dryRun: boolean) => {
    setFailure(null);
    if (!hasSource(csv)) {
      setFailure(t(($) => $.import.empty_source));
      return;
    }
    setBusy(dryRun ? "preview" : "commit");
    try {
      const response = await api.importWorkbenchCsv({ kind, csv, dryRun });
      if (dryRun) {
        setPreview(response);
        return;
      }
      // §23.6: a committed import invalidates the two roots the ledgers hang off —
      // this is a mutation, not a new key. `quotes` / `activities` carry no
      // `:changed` event, so this invalidation is the only refresh they get; a
      // `collabs` import also emits one per row, which the realtime patcher applies.
      if (response.committed > 0) {
        void queryClient.invalidateQueries({ queryKey: bdKeys.all(wsId) });
        void queryClient.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
      }
      onImported?.();
      onClose();
    } catch (error) {
      // A 413 / 400 / 500 keeps the preview on screen: the file is still here to
      // fix, and a dialog that closed on the refusal would hide the reason.
      setFailure(
        error instanceof Error && error.message ? error.message : t(($) => $.import.failed),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(($) => $.import.title)}</DialogTitle>
          <DialogDescription>{t(($) => $.import.hint)}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Field>
            <FieldLabel htmlFor="import-file">{t(($) => $.import.file)}</FieldLabel>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={pending}
              onChange={(event) => void onFile(event)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="import-paste">{t(($) => $.import.paste)}</FieldLabel>
            <Textarea
              id="import-paste"
              className="min-h-24 font-mono text-caption"
              autoComplete="off"
              spellCheck={false}
              value={csv}
              disabled={pending}
              onChange={(event) => replaceSource(event.target.value)}
            />
          </Field>

          {counts === null ? null : (
            <section
              aria-label={t(($) => $.import.preview)}
              data-slot="import-preview"
              className="flex flex-col gap-2 rounded-lg border border-surface-border p-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-caption">
                <Figure label={t(($) => $.import.parsed)} value={counts.parsed} />
                <Figure label={t(($) => $.import.accepted)} value={counts.accepted} />
                {/* A duplicate is `skip`, not an error — without its own number a
                    reader counting lines cannot tell where the missing rows went. */}
                <Figure label={t(($) => $.import.skipped)} value={counts.skipped} />
                <Figure
                  label={t(($) => $.import.errors)}
                  value={counts.errors}
                  tone={counts.errors > 0 ? "destructive" : "muted"}
                />
              </div>

              {errors.length === 0 ? null : (
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="w-14 text-left font-medium">
                          {t(($) => $.import.error_line)}
                        </th>
                        <th className="w-40 text-left font-medium">
                          {t(($) => $.import.error_column)}
                        </th>
                        <th className="text-left font-medium">
                          {t(($) => $.import.error_reason)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((row) => (
                        <tr
                          key={`${row.line}-${row.column}-${row.reason}`}
                          data-import-error={row.reason}
                          className="align-top"
                        >
                          <td className="tabular-nums text-muted-foreground">{row.line}</td>
                          <td className="font-mono text-caption text-muted-foreground">
                            {row.column}
                          </td>
                          <td className="text-destructive">{reason(row.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* The rows the server would write, as it normalized them: the
                  preview exists to confirm that, not to echo the file back. A
                  `skip` row is a duplicate that is already in the ledger — grey,
                  never red, because it is not an error. */}
              {preview === null || rows.length === 0 ? null : (
                <div className="flex flex-col gap-1">
                  {truncated ? (
                    <p className="text-caption text-muted-foreground">
                      {t(($) => $.import.rows_shown, {
                        shown: rows.length,
                        n: preview.rows.length,
                      })}
                    </p>
                  ) : null}
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-caption">
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.line} data-import-row={row.action} className="align-top">
                            <td className="w-10 tabular-nums text-muted-foreground">{row.line}</td>
                            <td className="w-28 whitespace-nowrap">
                              <span
                                className={cn(
                                  "rounded-sm px-1",
                                  row.action === "skip"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-success/10 text-success",
                                )}
                              >
                                {row.action === "skip"
                                  ? t(($) => $.import.action_skip)
                                  : t(($) => $.import.action_create)}
                              </span>
                            </td>
                            <td className="min-w-0">
                              <span
                                className="block truncate font-mono text-caption text-muted-foreground"
                                title={summarizePreview(row.preview)}
                              >
                                {summarizePreview(row.preview)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClose}>
            {tCommon(($) => $.cancel)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !hasSource(csv)}
            aria-busy={busy === "preview"}
            onClick={() => void run(true)}
          >
            {busy === "preview" ? <Spinner className="size-3.5" /> : null}
            {t(($) => $.import.preview)}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !canCommit(preview)}
            aria-busy={busy === "commit"}
            onClick={() => void run(false)}
          >
            {busy === "commit" ? <Spinner className="size-3.5" /> : null}
            {t(($) => $.import.confirm, { n: preview?.accepted ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The 取消 control is the shared bundle's, like every other dialog in the space. */
function Figure({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "destructive";
}) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <b className={cn("tabular-nums", tone === "destructive" ? "text-destructive" : "text-foreground")}>
        {value}
      </b>
    </span>
  );
}
