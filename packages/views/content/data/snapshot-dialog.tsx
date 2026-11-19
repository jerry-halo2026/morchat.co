"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { useUpsertCreatorPostMetric } from "@morechat/core/creator/mutations";
import { useT } from "../../i18n";
import { useMetricLabels } from "./copy";
import { METRIC_FIELDS, numberOrNull, todayKey, type MetricField } from "./model";

type Draft = Record<MetricField, string>;

const EMPTY_DRAFT: Draft = {
  play: "",
  likes: "",
  comments: "",
  shares: "",
  clicks: "",
  converts: "",
};

/**
 * 补一天快照 — the one write on the data page.
 *
 * `POST /creator-posts/{id}/metrics` upserts on `(post, captured_on)`, so the
 * form is a *correction* as much as a first entry: saving a day that already
 * exists rewrites that day instead of adding a second row. The dialog says so,
 * because "what happens if I pick today twice" is the question the button raises.
 *
 * **A blank field is sent as `null`, never as 0.** That is the whole point of the
 * three-state cells behind this dialog: a day read off a platform that reports
 * only plays must not backfill zeros for the likes nobody read
 * (`WORKBENCH-DATA-CONTRACT` §2.1). GMV is not in this form — it carries a
 * currency per row and there is no picker here — so this writes the six
 * engagement measures and leaves the money columns to the collection.
 */
export function SnapshotDialog({
  postId,
  open,
  onOpenChange,
}: {
  /** The post being corrected; `null` disables the form. */
  postId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT("publishing");
  const labels = useMetricLabels();
  const fieldId = useId();

  const [day, setDay] = useState(() => todayKey(new Date()));
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [failed, setFailed] = useState(false);

  // One attempt per opening: a reopen starts from today and a blank form, so the
  // first frame never shows the previous day's numbers.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDay(todayKey(new Date()));
      setDraft(EMPTY_DRAFT);
      setFailed(false);
    }
  }

  const upsert = useUpsertCreatorPostMetric();
  const pending = upsert.isPending;
  const canSubmit = !!postId && day !== "" && !pending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || !postId) return;
    setFailed(false);
    try {
      await upsert.mutateAsync({
        postId,
        captured_on: day,
        play: numberOrNull(draft.play),
        likes: numberOrNull(draft.likes),
        comments: numberOrNull(draft.comments),
        shares: numberOrNull(draft.shares),
        clicks: numberOrNull(draft.clicks),
        converts: numberOrNull(draft.converts),
      });
      onOpenChange(false);
    } catch {
      // The form keeps what was typed: the fix is the reader's.
      setFailed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t(($) => $.data.form_title)}</DialogTitle>
            <DialogDescription>{t(($) => $.data.form_description)}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-day`}>{t(($) => $.data.form_day)}</Label>
              <Input
                id={`${fieldId}-day`}
                type="date"
                value={day}
                required
                disabled={pending}
                onChange={(event) => setDay(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {METRIC_FIELDS.map((field) => (
                <div key={field} className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-${field}`}>{labels[field]}</Label>
                  <Input
                    id={`${fieldId}-${field}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={draft[field]}
                    disabled={pending}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <p className="text-caption text-muted-foreground">
              {t(($) => $.data.form_blank_note)}
            </p>

            {failed ? (
              <p role="alert" className="text-caption text-destructive">
                {t(($) => $.data.form_failed)}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t(($) => $.data.form_cancel)}
            </Button>
            <Button type="submit" disabled={!canSubmit} aria-busy={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.data.form_save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
