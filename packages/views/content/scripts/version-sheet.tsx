"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Button } from "@morechat/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@morechat/ui/components/ui/field";
import { Input } from "@morechat/ui/components/ui/input";
import { Textarea } from "@morechat/ui/components/ui/textarea";
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
import { useCreateMediaScript, useUpdateMediaScript } from "@morechat/core/media/mutations";
import type { MediaScript, MediaScriptStatus, MediaTopic } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../../i18n";
import { CollectionEmptyValue } from "../../layout/collection-list";
import {
  createVersionRequest,
  draftFrom,
  nextVersion,
  statusRequest,
  tagsText,
  timestampLabel,
  type ScriptDraft,
} from "./model";
import { ScriptStatusBadge, ScriptStatusSelect } from "./status";

/**
 * One version of one topic: read it, or write the next one on top of it.
 *
 * The screen exists to make the versioning rule (`WORKBENCH-API.md` §12.4) visible
 * instead of hiding it behind a form:
 *
 * - **A saved version is drawn read-only.** There is no text box over v2's body,
 *   because no request changes v2's body: any copy field on a PATCH mints v3. The
 *   `?inPlace=1` escape hatch is not offered either — "I fixed a typo" and "this
 *   is a new draft" are the operator's judgement, and a checkbox is a poor way to
 *   ask for it.
 * - **Writing is a separate, named action.** "Save as v3" is the button label, the
 *   request is a POST, and the number comes from the chain the page read.
 * - **Status and publish time stay on the version in front of you.** They are the
 *   two fields §12.4 keeps in place, so they sit beside a `Save` that sends those
 *   two and nothing else. A review decision must not bury the text history.
 *
 * A topic's first version is the same sheet with no base: the topic is picked
 * here, the copy starts blank, and the POST is what makes it v1.
 */
export function VersionSheet({
  topicId,
  topicTitle,
  topics,
  base,
  versions,
  mode,
  ownerName,
  locale,
  onTopicChange,
  onSelectVersion,
  onMode,
  onClose,
}: {
  /** The topic the write lands in; null only while a first version is set up. */
  topicId: string | null;
  topicTitle: string | null;
  /** Every topic this page read, for the create-time picker. */
  topics: readonly MediaTopic[];
  /** The version being read, or null while creating. */
  base: MediaScript | null;
  /** This topic's chain, newest first: the version chips and the next number. */
  versions: readonly MediaScript[];
  mode: "read" | "write";
  /** The owner's name, resolved by the page; the row's id is the fallback. */
  ownerName: string | null;
  locale: string;
  onTopicChange: (topicId: string) => void;
  onSelectVersion: (scriptId: string) => void;
  onMode: (mode: "read" | "write") => void;
  onClose: () => void;
}) {
  const { t } = useT("production");
  const create = useCreateMediaScript();
  const update = useUpdateMediaScript();

  const [draft, setDraft] = useState<ScriptDraft>(() => draftFrom(base));
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState<"version" | "status" | null>(null);

  const busy = saving !== null;
  const next = nextVersion(versions);
  const latestId = versions[0]?.id ?? null;
  const writing = mode === "write" || base === null;
  const canPickTopic = topicId === null;
  const heading = topicTitle ?? (base ? `v${base.version}` : t(($) => $.scripts.new_script));
  // The unique index (739) only covers unarchived rows, so a chain read across an
  // archived row can hold two rows numbered alike; the page says so rather than
  // picking a winner.
  const duplicated = versions.find(
    (script, position) =>
      versions.findIndex((other) => other.version === script.version) !== position,
  );

  const patch = (changes: Partial<ScriptDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const saveVersion = async () => {
    if (!topicId) return;
    setFailure(null);
    setSaving("version");
    try {
      const created = await create.mutateAsync(createVersionRequest(topicId, draft));
      toast.success(t(($) => $.scripts.saved, { version: created.version }));
      onClose();
    } catch (error) {
      setFailure(error instanceof Error && error.message ? error.message : t(($) => $.shared.save_failed));
    } finally {
      setSaving(null);
    }
  };

  const saveStatus = async () => {
    if (!base) return;
    setFailure(null);
    setSaving("status");
    try {
      await update.mutateAsync({ id: base.id, ...statusRequest(draft) });
      toast.success(t(($) => $.scripts.saved, { version: base.version }));
    } catch (error) {
      setFailure(error instanceof Error && error.message ? error.message : t(($) => $.shared.save_failed));
    } finally {
      setSaving(null);
    }
  };

  const publishLabel = timestampLabel(base?.publish_at ?? null, locale);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate" title={heading}>
            {heading}
          </SheetTitle>
          <p
            data-slot="version-route"
            className="flex items-center gap-2 text-caption text-muted-foreground"
          >
            {base ? (
              <span className="tabular-nums">
                {t(($) => $.scripts.version_label, { version: base.version })}
              </span>
            ) : null}
            {writing ? (
              <span className="tabular-nums">
                {t(($) => $.scripts.version_label, { version: next })}
              </span>
            ) : (
              <ScriptStatusBadge status={base.status} />
            )}
          </p>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {versions.length > 1 ? (
            <div data-slot="version-chips" className="flex flex-wrap items-center gap-1.5">
              {versions.map((script) => (
                <button
                  key={script.id}
                  type="button"
                  data-version={script.version}
                  aria-pressed={base?.id === script.id}
                  onClick={() => onSelectVersion(script.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-caption tabular-nums transition-colors",
                    base?.id === script.id
                      ? "border-foreground/20 bg-muted font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(($) => $.scripts.version_label, { version: script.version })}
                  {script.id === latestId ? (
                    <span className="text-micro text-brand">{t(($) => $.scripts.latest)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {duplicated ? (
            <p role="alert" className="text-caption text-warning">
              {t(($) => $.scripts.conflict, { version: duplicated.version })}
            </p>
          ) : null}

          {canPickTopic ? (
            <Field>
              <FieldLabel htmlFor="script-topic">{t(($) => $.scripts.field_topic)}</FieldLabel>
              {topics.length === 0 ? (
                <p className="text-caption text-muted-foreground">{t(($) => $.scripts.no_topics)}</p>
              ) : (
                <Select
                  items={topics.map((topic) => ({ value: topic.id, label: topic.title }))}
                  value={topicId ?? ""}
                  onValueChange={(value) => onTopicChange(String(value))}
                  disabled={busy}
                >
                  <SelectTrigger id="script-topic" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}

          {writing ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="script-hook">{t(($) => $.scripts.field_hook)}</FieldLabel>
                <Textarea
                  id="script-hook"
                  className="min-h-16"
                  value={draft.hook}
                  disabled={busy}
                  onChange={(event) => patch({ hook: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="script-body">{t(($) => $.scripts.field_body)}</FieldLabel>
                <Textarea
                  id="script-body"
                  className="min-h-40"
                  value={draft.body}
                  disabled={busy}
                  onChange={(event) => patch({ body: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="script-cta">{t(($) => $.scripts.field_cta)}</FieldLabel>
                <Textarea
                  id="script-cta"
                  className="min-h-16"
                  value={draft.cta}
                  disabled={busy}
                  onChange={(event) => patch({ cta: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="script-cover">{t(($) => $.scripts.field_cover)}</FieldLabel>
                <Input
                  id="script-cover"
                  value={draft.coverNote}
                  disabled={busy}
                  onChange={(event) => patch({ coverNote: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="script-tags">{t(($) => $.scripts.field_tags)}</FieldLabel>
                <Input
                  id="script-tags"
                  value={draft.tags}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => patch({ tags: event.target.value })}
                />
              </Field>
              <Field>
                <FieldTitle>{t(($) => $.shared.status)}</FieldTitle>
                <ScriptStatusSelect
                  value={draft.status}
                  disabled={busy}
                  onChange={(status: MediaScriptStatus) => patch({ status })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="script-publish">
                  {t(($) => $.scripts.field_publish_at)}
                </FieldLabel>
                <Input
                  id="script-publish"
                  type="datetime-local"
                  value={draft.publishAt}
                  disabled={busy}
                  onChange={(event) => patch({ publishAt: event.target.value })}
                />
              </Field>
              <p className="text-caption text-muted-foreground">
                {t(($) => $.scripts.version_hint)}
              </p>
            </FieldGroup>
          ) : (
            <>
              <ReadField label={t(($) => $.scripts.field_hook)} value={base?.hook ?? null} />
              <ReadField
                label={t(($) => $.scripts.field_body)}
                value={base?.body ?? null}
                multiline
              />
              <ReadField label={t(($) => $.scripts.field_cta)} value={base?.cta ?? null} />
              <ReadField label={t(($) => $.scripts.field_cover)} value={base?.cover_note ?? null} />
              <ReadField
                label={t(($) => $.scripts.field_tags)}
                value={base && base.tags.length > 0 ? tagsText(base.tags) : null}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadField
                  label={t(($) => $.shared.owner)}
                  value={ownerName ?? base?.owner_member_id ?? null}
                />
                <ReadField label={t(($) => $.scripts.field_publish_at)} value={publishLabel} />
              </div>

              <fieldset className="flex flex-col gap-2 rounded-lg border border-surface-border p-3">
                <legend className="px-1 text-caption text-muted-foreground">
                  {t(($) => $.shared.status)}
                </legend>
                <p className="text-caption text-muted-foreground">
                  {t(($) => $.scripts.version_hint)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <ScriptStatusSelect
                    value={draft.status}
                    disabled={busy}
                    onChange={(status: MediaScriptStatus) => patch({ status })}
                  />
                  <Input
                    aria-label={t(($) => $.scripts.field_publish_at)}
                    type="datetime-local"
                    className="w-auto"
                    value={draft.publishAt}
                    disabled={busy}
                    onChange={(event) => patch({ publishAt: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-busy={saving === "status"}
                    onClick={() => void saveStatus()}
                  >
                    {saving === "status" ? <Spinner className="size-3.5" /> : null}
                    {t(($) => $.shared.save)}
                  </Button>
                </div>
              </fieldset>
            </>
          )}
        </div>

        <SheetFooter className="mt-0 border-t">
          {failure ? (
            <p role="alert" className="text-caption text-destructive">
              {failure}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => (writing && base ? onMode("read") : onClose())}
            >
              {t(($) => $.shared.cancel)}
            </Button>
            {writing ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || !topicId}
                aria-busy={saving === "version"}
                onClick={() => void saveVersion()}
              >
                {saving === "version" ? <Spinner className="size-3.5" /> : null}
                {t(($) => $.scripts.save_version, { version: next })}
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={busy} onClick={() => onMode("write")}>
                {t(($) => $.scripts.edit_version, { version: next })}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** One stored field, printed as it was saved. An empty one reads as a dash. */
function ReadField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-muted-foreground">{label}</span>
      {value ? (
        <p
          className={cn(
            "break-words text-body",
            multiline ? "max-h-64 overflow-y-auto whitespace-pre-wrap" : "truncate",
          )}
          title={multiline ? undefined : value}
        >
          {value}
        </p>
      ) : (
        <CollectionEmptyValue />
      )}
    </div>
  );
}
