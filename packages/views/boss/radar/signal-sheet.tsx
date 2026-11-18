"use client";

import { useState } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@morechat/ui/components/ui/field";
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
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { Textarea } from "@morechat/ui/components/ui/textarea";
import { useCreateMarketSignal, useUpdateMarketSignal } from "@morechat/core/goal/mutations";
import type {
  MarketSignal,
  MarketSignalCategory,
  MarketSignalCut,
  MarketSignalSource,
  MarketSignalUrgency,
} from "@morechat/core/types";
import { useT } from "../../i18n";
import { SIGNAL_CATEGORIES, SIGNAL_CUTS, SIGNAL_URGENCIES } from "./model";
import { categoryLabel, cutLabel, sourceLabel, urgencyLabel } from "./copy";

const SOURCES: readonly MarketSignalSource[] = ["manual", "ai", "import"];

/**
 * 记一条信号 / 改一条信号.
 *
 * Nine fields, all of them what the contract stores: what was seen, how close it
 * is (category), how hot (cut), how soon it matters (urgency), a 0–100 relevance,
 * where it came from, and the three pieces of prose that make the signal readable
 * six weeks later (summary, note, link).
 *
 * Two deliberate omissions:
 *
 *   - **No `status` field.** A new signal is `new`; moving it is the row's own
 *     action (观察 → 验证 → 采纳/放弃), and "converted" is the convert endpoint's
 *     alone (§13.3).
 *   - **The score is never cleared to null.** The contract allows an unscored
 *     signal, but this form cannot express "remove the score", so leaving the
 *     field empty on an edit keeps the stored value instead of pretending to erase
 *     it.
 */
export function SignalSheet({
  signal,
  onClose,
}: {
  signal: MarketSignal | null;
  onClose: () => void;
}) {
  const { t } = useT("boss");
  const create = useCreateMarketSignal();
  const update = useUpdateMarketSignal();

  const [title, setTitle] = useState(signal?.title ?? "");
  const [category, setCategory] = useState<MarketSignalCategory>(signal?.category ?? "market");
  const [cut, setCut] = useState<MarketSignalCut>(signal?.cut ?? "warm");
  const [urgency, setUrgency] = useState<MarketSignalUrgency>(signal?.urgency ?? "medium");
  const [score, setScore] = useState(signal?.score == null ? "" : String(signal.score));
  const [source, setSource] = useState<MarketSignalSource>(signal?.source ?? "manual");
  const [url, setUrl] = useState(signal?.url ?? "");
  const [summary, setSummary] = useState(signal?.summary ?? "");
  const [note, setNote] = useState(signal?.note ?? "");
  const [failure, setFailure] = useState<string | null>(null);

  const busy = create.isPending || update.isPending;
  const parsedScore = score.trim() === "" ? undefined : Number(score);

  const categoryItems = SIGNAL_CATEGORIES.map((value) => ({
    value,
    label: categoryLabel(t, value),
  }));
  const cutItems = SIGNAL_CUTS.map((value) => ({ value, label: cutLabel(t, value) }));
  const urgencyItems = SIGNAL_URGENCIES.map((value) => ({
    value,
    label: urgencyLabel(t, value),
  }));
  const sourceItems = SOURCES.map((value) => ({ value, label: sourceLabel(t, value) }));

  const submit = async () => {
    setFailure(null);
    const trimmed = title.trim();
    if (trimmed === "") return;
    const body = {
      title: trimmed,
      category,
      cut,
      urgency,
      source,
      score: parsedScore !== undefined && Number.isFinite(parsedScore) ? parsedScore : undefined,
      url: url.trim() === "" ? undefined : url.trim(),
      summary: summary.trim() === "" ? undefined : summary.trim(),
      note: note.trim() === "" ? undefined : note.trim(),
    };
    try {
      if (signal) await update.mutateAsync({ id: signal.id, ...body });
      else await create.mutateAsync(body);
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{signal ? signal.title : t(($) => $.radar.new)}</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="signal-title">{t(($) => $.field.title)}</FieldLabel>
              <Input
                id="signal-title"
                value={title}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="signal-category">{t(($) => $.field.category)}</FieldLabel>
                <Select
                  items={categoryItems}
                  value={category}
                  onValueChange={(next) => {
                    if (next !== null) setCategory(next);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="signal-category" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="signal-cut">{t(($) => $.field.cut)}</FieldLabel>
                <Select
                  items={cutItems}
                  value={cut}
                  onValueChange={(next) => {
                    if (next !== null) setCut(next);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="signal-cut" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cutItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="signal-urgency">{t(($) => $.field.urgency)}</FieldLabel>
                <Select
                  items={urgencyItems}
                  value={urgency}
                  onValueChange={(next) => {
                    if (next !== null) setUrgency(next);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="signal-urgency" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {urgencyItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="signal-score">{t(($) => $.field.score)}</FieldLabel>
                <Input
                  id="signal-score"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  value={score}
                  disabled={busy}
                  onChange={(event) => setScore(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="signal-source">{t(($) => $.field.source)}</FieldLabel>
                <Select
                  items={sourceItems}
                  value={source}
                  onValueChange={(next) => {
                    if (next !== null) setSource(next);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="signal-source" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="signal-url">{t(($) => $.field.url)}</FieldLabel>
              <Input
                id="signal-url"
                value={url}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="signal-summary">{t(($) => $.field.summary)}</FieldLabel>
              <Textarea
                id="signal-summary"
                value={summary}
                disabled={busy}
                className="min-h-16"
                onChange={(event) => setSummary(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="signal-note">{t(($) => $.field.note)}</FieldLabel>
              <Textarea
                id="signal-note"
                value={note}
                disabled={busy}
                className="min-h-16"
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter className="mt-0 border-t">
          <FieldError>{failure}</FieldError>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              {t(($) => $.action.cancel)}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || title.trim() === ""}
              aria-busy={busy}
              onClick={() => void submit()}
            >
              {busy ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.action.save)}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
