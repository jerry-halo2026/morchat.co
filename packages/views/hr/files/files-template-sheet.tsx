"use client";

import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@morechat/ui/components/ui/alert-dialog";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import {
  useCreateHrDocTemplate,
  useDeleteHrDocTemplate,
  useUpdateHrDocTemplate,
} from "@morechat/core/hr/doc";
import type { HrDocTemplate, HrDocTemplateKind } from "@morechat/core/types";
import { DocEditor } from "../../editor/doc-editor";
import { KIND_COPY_KEYS, kindLabel, useFilesCopy, type FilesTranslate } from "./files-copy";
import {
  PLACEHOLDERS,
  TEMPLATE_KINDS,
  copyName,
  previewValues,
  renderPreview,
} from "./files-model";

/**
 * One template, opened: its name, its kind, the body, and the slots the body can
 * name.
 *
 * A sheet rather than a page, for the reason the roster and the offboarding
 * record are sheets: the list is what a reader scans, and a template is a row
 * opened. The draft is local until Save — writing a letter is a paragraph at a
 * time, and a PATCH per keystroke would rewrite the row under the caret.
 *
 * **A built-in template is a document, not a form.** The server seeds three and
 * re-seeds them on every read (§18), so `PATCH` and `DELETE` on one are a 400.
 * This sheet therefore draws no Save and no Delete for it, says why, and offers
 * the one write that is allowed: a copy, which is an ordinary workspace row and
 * opens here as soon as it exists.
 *
 * **The preview never leaves the browser.** A template is edited a dozen times
 * before it is used for anybody, so the filled-in text is produced locally by
 * `renderPreview` from sample values — same substitution rule as the generator,
 * none of the cost of a request. Unknown slots are kept verbatim, exactly as the
 * server keeps them, so a typo shows up here rather than on a stamped page.
 */
export function TemplateSheet({
  template,
  canWrite,
  onClose,
  onOpened,
}: {
  template: HrDocTemplate;
  /** Owner or admin: the only reader who may save, copy or delete a template. */
  canWrite: boolean;
  onClose: () => void;
  /** Opens another template in this sheet — the copy a built-in earns. */
  onOpened: (template: HrDocTemplate) => void;
}) {
  const copy = useFilesCopy();
  const update = useUpdateHrDocTemplate();
  const remove = useDeleteHrDocTemplate();
  const duplicate = useCreateHrDocTemplate();

  const [name, setName] = useState(template.name);
  const [kind, setKind] = useState<HrDocTemplateKind>(template.kind as HrDocTemplateKind);
  const [body, setBody] = useState(template.body);
  const [previewing, setPreviewing] = useState(false);
  const [failure, setFailure] = useState<"save" | "delete" | "copy" | null>(null);

  // One clock for the whole sheet: `{{今天}}` must not read a different day in
  // the preview than the file will say.
  const today = useMemo(() => new Date(), []);
  const preview = useMemo(() => renderPreview(body, previewValues(today)), [body, today]);

  const builtin = template.builtin;
  const editable = canWrite && !builtin;
  const busy = update.isPending || remove.isPending || duplicate.isPending;

  const save = async () => {
    setFailure(null);
    try {
      await update.mutateAsync({ id: template.id, name: name.trim(), kind, body });
      onClose();
    } catch {
      setFailure("save");
    }
  };

  const destroy = async () => {
    setFailure(null);
    try {
      await remove.mutateAsync(template.id);
      onClose();
    } catch {
      setFailure("delete");
    }
  };

  /** A built-in becomes a workspace row with the same wording, then opens here. */
  const fork = async () => {
    setFailure(null);
    try {
      const created = await duplicate.mutateAsync({
        name: copyName(template.name, copy("copy_name")),
        kind: (template.kind as HrDocTemplateKind) ?? "other",
        body: template.body,
      });
      onOpened(created);
    } catch {
      setFailure("copy");
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="gap-1 border-b">
          <SheetTitle className="min-w-0 truncate" title={template.name}>
            {template.name}
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{kindLabel(template.kind, copy)}</Badge>
            {builtin ? (
              <Badge variant="outline">{copy("builtin_badge")}</Badge>
            ) : null}
            {builtin ? (
              <span data-slot="files-builtin-notice" className="text-caption text-muted-foreground">
                {copy("builtin_notice")}
              </span>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {editable ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="files-template-name">{copy("field_name")}</Label>
                <Input
                  id="files-template-name"
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="files-template-kind">{copy("field_kind")}</Label>
                <KindPicker
                  id="files-template-kind"
                  value={kind}
                  disabled={busy}
                  copy={copy}
                  onChange={setKind}
                />
              </div>
            </div>
          ) : null}

          <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-caption font-medium text-muted-foreground">
                {copy("field_body")}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-caption"
                aria-expanded={previewing}
                data-action="files-preview"
                onClick={() => setPreviewing((current) => !current)}
              >
                {copy(previewing ? "preview_hide" : "preview")}
              </Button>
            </div>
            <DocEditor
              mode="plain"
              value={body}
              readOnly={!editable}
              minHeight={320}
              label={copy("field_body")}
              placeholder={editable ? copy("body_placeholder") : undefined}
              onChange={setBody}
            />
          </section>

          {previewing ? (
            <section
              data-slot="files-preview"
              aria-label={copy("preview_title")}
              className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-3"
            >
              <h3 className="text-caption font-medium text-muted-foreground">
                {copy("preview_title")}
              </h3>
              {preview.trim() === "" ? (
                <p className="text-caption text-muted-foreground">{copy("preview_empty")}</p>
              ) : (
                <pre
                  data-testid="files-preview-text"
                  title={preview}
                  className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-[inherit] text-body"
                >
                  {preview}
                </pre>
              )}
            </section>
          ) : null}

          {editable ? (
            <PlaceholderPanel copy={copy} onInsert={(token) => setBody((current) => current + token)} />
          ) : null}

          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {copy(
                failure === "save"
                  ? "save_failed"
                  : failure === "delete"
                    ? "delete_failed"
                    : "create_failed",
              )}
            </p>
          ) : null}
        </div>

        <SheetFooter className="mt-0 flex-row flex-wrap items-center justify-between gap-2 border-t">
          {editable ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button type="button" variant="ghost" size="sm" className="text-destructive" />}
              >
                {copy("delete")}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy("delete_title")}</AlertDialogTitle>
                  <AlertDialogDescription>{copy("delete_description")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{copy("delete_cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    data-action="files-delete-confirm"
                    disabled={remove.isPending}
                    onClick={() => void destroy()}
                  >
                    {copy("delete_confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {copy("cancel")}
            </Button>
            {builtin && canWrite ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-action="files-copy"
                disabled={duplicate.isPending}
                onClick={() => void fork()}
              >
                {duplicate.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
                {copy("copy_template")}
              </Button>
            ) : null}
            {editable ? (
              <Button
                type="button"
                size="sm"
                data-action="files-save"
                disabled={busy || name.trim() === ""}
                onClick={() => void save()}
              >
                {update.isPending ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
                {copy(update.isPending ? "saving" : "save")}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The slots, each with the field it reads.
 *
 * A button per slot rather than a dropdown: a template is written by placing two
 * or three slots in a sentence, and a list that stays open is what lets a reader
 * place them without reopening a menu between each. They are appended at the end
 * of the body — the editor owns the caret, and inserting *at* the caret would
 * mean reaching into a textarea this component does not own.
 */
function PlaceholderPanel({
  copy,
  onInsert,
}: {
  copy: FilesTranslate;
  onInsert: (token: string) => void;
}) {
  return (
    <section
      data-slot="files-placeholders"
      aria-label={copy("placeholders_title")}
      className="flex flex-col gap-2 border-t pt-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-caption font-medium text-muted-foreground">
          {copy("placeholders_title")}
        </h3>
        <p className="text-caption text-muted-foreground">{copy("placeholders_hint")}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {PLACEHOLDERS.map((slot) => (
          <li key={slot.token} className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0 font-mono"
              data-action="files-placeholder"
              data-token={slot.token}
              onClick={() => onInsert(slot.token)}
            >
              {slot.token}
            </Button>
            <span className="min-w-0 truncate text-caption text-muted-foreground" title={copy(slot.hint)}>
              {copy(slot.hint)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The five template kinds; `kind` is required on the wire, so there is no blank. */
export function KindPicker({
  id,
  value,
  disabled,
  copy,
  onChange,
}: {
  id?: string;
  value: HrDocTemplateKind;
  disabled?: boolean;
  copy: FilesTranslate;
  onChange: (value: HrDocTemplateKind) => void;
}) {
  const options = TEMPLATE_KINDS.map((kind) => ({
    value: kind,
    label: copy(KIND_COPY_KEYS[kind]),
  }));
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === null) return;
        onChange(next as HrDocTemplateKind);
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {() => options.find((option) => option.value === value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
