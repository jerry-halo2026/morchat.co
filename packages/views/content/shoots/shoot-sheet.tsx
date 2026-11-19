"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "@morechat/ui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@morechat/ui/components/ui/alert-dialog";
import { Button } from "@morechat/ui/components/ui/button";
import { Checkbox } from "@morechat/ui/components/ui/checkbox";
import { Field, FieldLabel, FieldTitle } from "@morechat/ui/components/ui/field";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Input } from "@morechat/ui/components/ui/input";
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
import { Skeleton } from "@morechat/ui/components/ui/skeleton";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { useWorkspaceId } from "@morechat/core/hooks";
import { mediaShootDetailOptions } from "@morechat/core/media/queries";
import {
  useCreateMediaShoot,
  useDeleteMediaShoot,
  useUpdateMediaShoot,
} from "@morechat/core/media/mutations";
import type { MediaShotSize, MediaShoot, MediaShootStatus } from "@morechat/core/types";
import { useT } from "../../i18n";
import {
  DEFAULT_ASPECT_RATIO,
  SHOT_ASPECT_RATIOS,
  checklistEntries,
  checklistProgress,
  newShotRow,
  readShotDocument,
  shotDocument,
  type MediaAspectRatio,
  type ShotRow,
} from "./model";
import { ShotSizeSelect, ShootStatusSelect } from "./status";

/** One script the shoot can be filed under, named by its topic. */
export interface ShootScriptOption {
  id: string;
  label: string;
}

/**
 * 一场拍摄：日期、地点、状态、镜头清单、开拍清单.
 *
 * Three behaviours come straight from the contract and are the reason this is a
 * sheet rather than a row of inline fields:
 *
 * 1. **`shots` is one document, saved whole** (§12.5). The editor therefore reads
 *    the document into an ordered table, lets the operator add / drop / reorder
 *    rows, and writes the whole document back — a row that left the table is shot
 *    the server deletes. The hint above the table says so before the button.
 * 2. **The list never reaches zero rows.** A PATCH that sends `{}` clears the
 *    shot list, but the request type only carries a `shotlist.v1` document, and
 *    §12.5's empty object is the *column's* "not planned" default rather than a
 *    body a client sends. So the last row cannot be removed here: a shoot that has
 *    no shot list is one that was created without one, and clearing it back to
 *    that state is not an operation this screen offers.
 * 3. **A checklist tick is its own PATCH.** The server merges the tick map key by
 *    key (§12.3), so ticking one box cannot clear the others, and the tick lands
 *    without waiting for the rest of the form.
 */
export function ShootSheet({
  shootId,
  scripts,
  defaultDate,
  onClose,
}: {
  /** The shoot being edited; null while creating one. */
  shootId: string | null;
  /** Scripts a new shoot can be filed under. */
  scripts: readonly ShootScriptOption[];
  /** The day a new shoot starts on (`YYYY-MM-DD`). */
  defaultDate: string;
  onClose: () => void;
}) {
  const wsId = useWorkspaceId();
  const { t } = useT("production");
  const detail = useQuery({
    ...mediaShootDetailOptions(wsId ?? "", shootId ?? ""),
    enabled: !!wsId && !!shootId,
  });

  if (!shootId) {
    return (
      <ShootForm
        shoot={null}
        scripts={scripts}
        defaultDate={defaultDate}
        onClose={onClose}
      />
    );
  }

  if (!detail.data) {
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent className="w-full gap-0 sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>{t(($) => $.shoots.shots_title)}</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" aria-busy="true">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            {detail.isError ? (
              <p role="alert" className="text-caption text-destructive">
                {detail.error instanceof Error && detail.error.message
                  ? detail.error.message
                  : t(($) => $.shared.load_failed)}
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <ShootForm
      key={detail.data.id}
      shoot={detail.data}
      scripts={scripts}
      defaultDate={defaultDate}
      onClose={onClose}
    />
  );
}

function ShootForm({
  shoot,
  scripts,
  defaultDate,
  onClose,
}: {
  shoot: MediaShoot | null;
  scripts: readonly ShootScriptOption[];
  defaultDate: string;
  onClose: () => void;
}) {
  const { t } = useT("production");
  const create = useCreateMediaShoot();
  const update = useUpdateMediaShoot();
  const remove = useDeleteMediaShoot();

  // Seeded once, never re-seeded: a checklist tick invalidates the detail query,
  // and re-reading it into these fields would throw away half-typed copy.
  const [seeded] = useState(() => {
    const document = readShotDocument(shoot?.shots);
    const script = scripts.find((option) => option.id === shoot?.script_id);
    return {
      title: document.title ?? script?.label ?? "",
      aspectRatio: document.aspectRatio ?? DEFAULT_ASPECT_RATIO,
      rows: document.rows,
    };
  });

  const [scriptId, setScriptId] = useState(shoot?.script_id ?? scripts[0]?.id ?? "");
  const [date, setDate] = useState(shoot?.shoot_date ?? defaultDate);
  const [location, setLocation] = useState(shoot?.location ?? "");
  const [status, setStatus] = useState<MediaShootStatus>(shoot?.status ?? "planned");
  const [title, setTitle] = useState(seeded.title);
  const [aspectRatio, setAspectRatio] = useState<MediaAspectRatio>(seeded.aspectRatio);
  const [rows, setRows] = useState<ShotRow[]>(seeded.rows);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(shoot?.checklist ?? {});
  const [newItem, setNewItem] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState<"form" | null>(null);

  const editing = shoot !== null;
  const busy = saving !== null || update.isPending || remove.isPending;
  const scriptLabel = useMemo(
    () => scripts.find((option) => option.id === (shoot?.script_id ?? scriptId))?.label ?? "",
    [scripts, shoot?.script_id, scriptId],
  );
  const items = checklistEntries(checklist);
  const progress = checklistProgress(checklist);
  const heading = editing ? scriptLabel || t(($) => $.shoots.shots_title) : t(($) => $.shoots.new_shoot);

  const failWith = (error: unknown) =>
    setFailure(
      error instanceof Error && error.message ? error.message : t(($) => $.shared.save_failed),
    );

  const updateRow = (key: string, changes: Partial<ShotRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    );

  const move = (index: number, delta: number) =>
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const moved = next[index];
      const displaced = next[target];
      if (!moved || !displaced) return current;
      next[index] = displaced;
      next[target] = moved;
      return next;
    });

  const save = async () => {
    setFailure(null);
    if (!date || (!editing && !scriptId)) {
      setFailure(t(($) => $.shared.save_failed));
      return;
    }
    setSaving("form");
    try {
      if (!shoot) {
        await create.mutateAsync({
          script_id: scriptId,
          shoot_date: date,
          status,
          ...(location.trim() ? { location: location.trim() } : {}),
        });
      } else {
        // Rows are the whole document: `buildShotsValue` renumbers them from 1 and
        // lays them end to end, so the write cannot describe a list the operator
        // is not looking at. An empty table sends no `shots` at all — see the
        // component's note about the request type.
        const documentTitle = title.trim() || scriptLabel.trim() || date;
        const shots =
          rows.length > 0 ? shotDocument({ title: documentTitle, aspectRatio, rows }) : null;
        await update.mutateAsync({
          id: shoot.id,
          shoot_date: date,
          status,
          location: location.trim(),
          ...(shots ? { shots } : {}),
        });
      }
      onClose();
    } catch (error) {
      failWith(error);
    } finally {
      setSaving(null);
    }
  };

  const toggleItem = async (name: string, next: boolean) => {
    if (!shoot) return;
    const previous = checklist;
    setChecklist((current) => ({ ...current, [name]: next }));
    setFailure(null);
    try {
      await update.mutateAsync({ id: shoot.id, checklist: { [name]: next } });
    } catch (error) {
      setChecklist(previous);
      failWith(error);
    }
  };

  const addItem = async () => {
    if (!shoot) return;
    const name = newItem.trim();
    if (!name || name in checklist) return;
    setFailure(null);
    try {
      await update.mutateAsync({ id: shoot.id, checklist: { [name]: false } });
      setChecklist((current) => ({ ...current, [name]: false }));
      setNewItem("");
    } catch (error) {
      failWith(error);
    }
  };

  const destroy = async () => {
    if (!shoot) return;
    setFailure(null);
    try {
      await remove.mutateAsync(shoot.id);
      setConfirming(false);
      onClose();
    } catch (error) {
      failWith(error);
      setConfirming(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate" title={heading}>
            {heading}
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {editing ? null : (
            <Field>
              <FieldLabel htmlFor="shoot-script">{t(($) => $.shoots.field_script)}</FieldLabel>
              {scripts.length === 0 ? (
                <p className="text-caption text-muted-foreground">{t(($) => $.shoots.no_scripts)}</p>
              ) : (
                <Select
                  items={scripts.map((option) => ({ value: option.id, label: option.label }))}
                  value={scriptId}
                  onValueChange={(value) => setScriptId(String(value))}
                  disabled={busy}
                >
                  <SelectTrigger id="shoot-script" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scripts.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="shoot-date">{t(($) => $.shared.date)}</FieldLabel>
              <Input
                id="shoot-date"
                type="date"
                value={date}
                disabled={busy}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="shoot-location">{t(($) => $.shared.location)}</FieldLabel>
              <Input
                id="shoot-location"
                value={location}
                disabled={busy}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
            <Field>
              <FieldTitle>{t(($) => $.shared.status)}</FieldTitle>
              <ShootStatusSelect value={status} disabled={busy} onChange={setStatus} />
            </Field>
          </div>

          {editing ? (
            <>
              <section aria-label={t(($) => $.shoots.shots_title)} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body font-medium">{t(($) => $.shoots.shots_title)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      setRows((current) => [
                        ...current,
                        newShotRow(current[current.length - 1]),
                      ])
                    }
                  >
                    <Plus aria-hidden="true" />
                    {t(($) => $.shoots.shots_add)}
                  </Button>
                </div>
                <p className="text-caption text-muted-foreground">{t(($) => $.shoots.shots_hint)}</p>

                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                  <Field>
                    <FieldLabel htmlFor="shotlist-title">{t(($) => $.shoots.doc_title)}</FieldLabel>
                    <Input
                      id="shotlist-title"
                      value={title}
                      disabled={busy}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldTitle>{t(($) => $.shoots.doc_aspect)}</FieldTitle>
                    <Select
                      items={SHOT_ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
                      value={aspectRatio}
                      onValueChange={(value) => setAspectRatio(String(value) as MediaAspectRatio)}
                      disabled={busy}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t(($) => $.shoots.doc_aspect)}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHOT_ASPECT_RATIOS.map((ratio) => (
                          <SelectItem key={ratio} value={ratio}>
                            {ratio}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <ul data-slot="shot-rows" className="flex flex-col gap-2">
                  {rows.map((row, index) => {
                    const number = index + 1;
                    return (
                      <li
                        key={row.key}
                        data-shot-index={number}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border p-2"
                      >
                        <span className="w-5 shrink-0 text-caption tabular-nums text-muted-foreground">
                          {number}
                        </span>
                        <Input
                          aria-label={`${t(($) => $.shoots.shot_frame)} ${number}`}
                          className="min-w-32 flex-1"
                          value={row.text}
                          disabled={busy}
                          onChange={(event) => updateRow(row.key, { text: event.target.value })}
                        />
                        <ShotSizeSelect
                          value={row.shotSize}
                          label={`${t(($) => $.shoots.shot_size)} ${number}`}
                          disabled={busy}
                          onChange={(size: MediaShotSize) => updateRow(row.key, { shotSize: size })}
                        />
                        <Input
                          aria-label={`${t(($) => $.shoots.shot_seconds)} ${number}`}
                          inputMode="numeric"
                          className="w-14 text-center"
                          value={row.seconds}
                          disabled={busy}
                          onChange={(event) => updateRow(row.key, { seconds: event.target.value })}
                        />
                        <IconButton
                          size="icon-xs"
                          label={t(($) => $.shoots.shots_up, { index: number })}
                          disabled={busy || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp />
                        </IconButton>
                        <IconButton
                          size="icon-xs"
                          label={t(($) => $.shoots.shots_down, { index: number })}
                          disabled={busy || index === rows.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown />
                        </IconButton>
                        <IconButton
                          size="icon-xs"
                          label={t(($) => $.shoots.shots_remove, { index: number })}
                          disabled={busy || rows.length === 1}
                          onClick={() =>
                            setRows((current) => current.filter((item) => item.key !== row.key))
                          }
                        >
                          <Trash2 />
                        </IconButton>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <fieldset className="flex flex-col gap-2 rounded-lg border border-surface-border p-3">
                <legend className="px-1 text-caption text-muted-foreground">
                  {t(($) => $.shoots.checklist_title)}
                </legend>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t(($) => $.shoots.checklist_add)}
                    placeholder={t(($) => $.shoots.checklist_add)}
                    className="h-7 max-w-56"
                    value={newItem}
                    disabled={busy}
                    onChange={(event) => setNewItem(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void addItem();
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || newItem.trim() === ""}
                    onClick={() => void addItem()}
                  >
                    {t(($) => $.shoots.checklist_add)}
                  </Button>
                  <span className="ml-auto text-caption tabular-nums text-muted-foreground">
                    {progress.done}/{progress.total}
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {items.map((item) => (
                    <li key={item.name}>
                      <label className="flex items-center gap-2 text-body">
                        <Checkbox
                          checked={item.ticked}
                          disabled={busy}
                          onCheckedChange={(next) => void toggleItem(item.name, next === true)}
                        />
                        <span className={item.ticked ? "text-muted-foreground line-through" : undefined}>
                          {item.name}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </>
          ) : null}
        </div>

        <SheetFooter className="mt-0 border-t">
          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto text-destructive"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {t(($) => $.shared.delete)}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              {t(($) => $.shared.cancel)}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !date || (!editing && !scriptId)}
              aria-busy={saving === "form"}
              onClick={() => void save()}
            >
              {saving === "form" ? <Spinner className="size-3.5" /> : null}
              {editing ? t(($) => $.shared.save) : t(($) => $.shoots.new_shoot)}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.shoots.delete_title)}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t(($) => $.shared.cancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              aria-busy={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void destroy();
              }}
            >
              {t(($) => $.shared.delete)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
