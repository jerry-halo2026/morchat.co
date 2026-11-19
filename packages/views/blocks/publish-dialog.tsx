"use client";

import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { ApiError } from "@morechat/core/api";
import { useCreateCreatorPost } from "@morechat/core/creator/mutations";
import { creatorPostsOptions } from "@morechat/core/creator/queries";
import type { Creator } from "@morechat/core/types";
import { useLocale, useT } from "../i18n";
import { formatStamp } from "./record-sheet";

export interface PublishDialogProps {
  wsId: string;
  /** The creator the post belongs to. The dialog writes nothing else. */
  creator: Creator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface CreatorSheetProps {
  /** Optional for the same reason as `CollabSheet`: a sheet without a workspace
   *  has no post list to read and no post to write. */
  wsId?: string;
  creator: Creator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** What the last attempt ran into, or nothing yet. */
type SubmitError = "conflict" | "failed" | null;

/**
 * One published post (`WORKBENCH-API.md` §2, `creator_post`).
 *
 * The row is evidence: a URL, a title, a platform and when it went live.
 * `(creator_id, url)` is unique server-side, so logging the same link twice is
 * a 409 rather than a second row — the dialog keeps itself open and says so
 * instead of closing over a write the server refused.
 *
 * The platform is a free string on the wire, not an enum, so the field starts at
 * the creator's own platform and stays editable: a creator who also posts
 * somewhere else needs no new schema to say so.
 *
 * The publish time defaults to now, because that is what "we just published it"
 * means; anything older is the user correcting it.
 */
export function PublishDialog({ wsId, creator, open, onOpenChange }: PublishDialogProps) {
  const { t } = useT("blocks");
  const fieldId = useId();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState(creator.platform);
  const [publishedAt, setPublishedAt] = useState(() => localDateTimeInput(new Date()));
  const [error, setError] = useState<SubmitError>(null);

  const create = useCreateCreatorPost();
  const pending = create.isPending;

  // One attempt per opening: the defaults describe a post that has since been
  // logged, so a reopen starts clean — during render, so the first frame of the
  // reopened dialog never shows the last attempt.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUrl("");
      setTitle("");
      setPlatform(creator.platform);
      setPublishedAt(localDateTimeInput(new Date()));
      setError(null);
    }
  }

  const canSubmit = !!wsId && url.trim().length > 0 && !pending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const when = new Date(publishedAt);
    try {
      await create.mutateAsync({
        creator_id: creator.id,
        platform: platform.trim() || creator.platform,
        url: url.trim(),
        // An unparsable or emptied field is "just now", the only time the dialog
        // can honestly claim without asking again.
        published_at: Number.isNaN(when.getTime())
          ? new Date().toISOString()
          : when.toISOString(),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      onOpenChange(false);
      toast.success(t(($) => $.publish.done));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "conflict" : "failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t(($) => $.publish.title)}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-url`}>{t(($) => $.publish.field.url)}</Label>
              <Input
                id={`${fieldId}-url`}
                value={url}
                required
                disabled={pending}
                aria-invalid={error === "conflict" ? true : undefined}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-title`}>{t(($) => $.publish.field.title)}</Label>
              <Input
                id={`${fieldId}-title`}
                value={title}
                disabled={pending}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${fieldId}-published-at`}>
                  {t(($) => $.publish.field.published_at)}
                </Label>
                <Input
                  id={`${fieldId}-published-at`}
                  type="datetime-local"
                  value={publishedAt}
                  disabled={pending}
                  onChange={(event) => setPublishedAt(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${fieldId}-platform`}>
                  {t(($) => $.publish.field.platform)}
                </Label>
                <Input
                  id={`${fieldId}-platform`}
                  value={platform}
                  disabled={pending}
                  onChange={(event) => setPlatform(event.target.value)}
                />
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-caption text-destructive">
                {error === "conflict" ? t(($) => $.publish.conflict) : t(($) => $.publish.failed)}
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
              {t(($) => $.record.action.close)}
            </Button>
            <Button type="submit" disabled={!canSubmit} aria-busy={pending}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.publish.action.submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One creator, read-only, with the posts logged against them.
 *
 * The row's own columns are the fields the ledger already names — nothing here
 * is a new vocabulary — and the post list is the evidence behind the follow and
 * engagement columns: a creator row is a summary of what their posts did, and
 * this is the list of posts that made it. Adding one is `PublishDialog`; there is
 * no metric write here by contract (§2: `creator_post_metric` is read-only for
 * this wave).
 */
export function CreatorSheet({ wsId, creator, open, onOpenChange }: CreatorSheetProps) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const empty = t(($) => $.record.empty);
  const [publishOpen, setPublishOpen] = useState(false);

  const posts = useQuery({
    ...creatorPostsOptions(wsId ?? "", { creator_id: creator.id }),
    enabled: open && !!wsId,
  });
  const rows = posts.data?.posts ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="break-words pr-1">{creator.display_name}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <dl
            aria-label={t(($) => $.creator.sheet.title)}
            className="grid grid-cols-2 gap-x-6 gap-y-3 pb-4"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">
                {t(($) => $.ledger.column.creator)}
              </dt>
              <dd className="flex min-w-0 items-baseline gap-1.5 text-body break-words">
                <span className="truncate">{creator.display_name}</span>
                <span className="shrink-0 text-caption text-muted-foreground">
                  {creator.handle || empty}
                </span>
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">
                {t(($) => $.ledger.column.platform)}
              </dt>
              <dd className="text-body break-words">{creator.platform || empty}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">
                {t(($) => $.ledger.column.fans)}
              </dt>
              <dd className="text-body break-words">
                {new Intl.NumberFormat(locales).format(creator.fans)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">
                {t(($) => $.ledger.column.score)}
              </dt>
              <dd className="text-body break-words">
                {creator.score === null ? empty : String(creator.score)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">
                {t(($) => $.ledger.column.risk)}
              </dt>
              <dd className="text-body break-words">
                {creator.risk_flag ? t(($) => $.ledger.risk_flagged) : empty}
              </dd>
            </div>
          </dl>

          <section className="flex flex-col gap-2">
            <h3 className="text-caption font-medium text-muted-foreground">
              {t(($) => $.creator.sheet.posts)}
            </h3>
            {rows.length === 0 ? (
              <p className="text-caption text-muted-foreground">
                {t(($) => $.creator.sheet.no_posts)}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((post) => (
                  <li key={post.id} className="flex min-w-0 flex-col gap-0.5">
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-body underline-offset-2 hover:underline"
                    >
                      {post.title || post.url}
                    </a>
                    <span className="text-caption text-muted-foreground">
                      {[post.platform, formatStamp(post.published_at)].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t(($) => $.record.action.close)}
          </Button>
          {wsId ? (
            <>
              {/* Mounted only while open, so a closed sheet costs no mutation
                  hook and no workspace id. */}
              {publishOpen ? (
                <PublishDialog wsId={wsId} creator={creator} open onOpenChange={setPublishOpen} />
              ) : null}
              <Button type="button" size="sm" onClick={() => setPublishOpen(true)}>
                {t(($) => $.publish.title)}
              </Button>
            </>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * `datetime-local` reads and writes `YYYY-MM-DDTHH:mm` in the viewer's zone —
 * never an ISO instant, which the control would reject and which would shift the
 * time by the offset if it did.
 */
function localDateTimeInput(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
