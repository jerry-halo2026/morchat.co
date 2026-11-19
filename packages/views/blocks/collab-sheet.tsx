"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, buttonVariants } from "@morechat/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { cn } from "@morechat/ui/lib/utils";
import { useUpdateCrmCollab } from "@morechat/core/crm/mutations";
import { crmBriefListOptions, crmClientListOptions } from "@morechat/core/crm/queries";
import { creatorListOptions } from "@morechat/core/creator/queries";
import { useCreateIssue } from "@morechat/core/issues/mutations";
import { issueDetailOptions } from "@morechat/core/issues/queries";
import { paths, useWorkspaceSlug } from "@morechat/core/paths";
import type { CrmCollab, Issue } from "@morechat/core/types";
import { useLocale, useT } from "../i18n";
import { useStatusLabel } from "../issues/utils/status-label";
import { AppLink } from "../navigation";
import { formatDay, formatMoney, formatStamp } from "./record-sheet";

/** The value fields of a collab, in the order the sheet draws them. */
type CollabField = "creator" | "stage" | "amount" | "fee" | "schedule" | "settlement";

export interface CollabSheetProps {
  /**
   * The workspace the detail reads resolve against. Optional for the same
   * reason as `RecordSheet`: a sheet drawn without one (a preview, a test) shows
   * the refs as ids and offers no task to create, because creating one writes
   * into a workspace.
   */
  wsId?: string;
  collab: CrmCollab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One collaboration, read-only, plus the one write its row feeds: the
 * fulfilment task.
 *
 * `crm_collab.issue_id` is the fixed bridge direction the contract names
 * (`WORKBENCH-API.md` §2): the collab points at an issue, and the issue carries
 * no workbench fields. So the sheet is where a collab becomes work — it creates
 * the task, writes its id back, and from then on opens it.
 *
 * The terms are read from the row itself. The two refs are read by detail query
 * because a collab row carries `creator_id` and `brief_id` and nothing else; the
 * client behind the brief is what names the task ("creator × client"), and the
 * brief's `schedule_from` / `schedule_to` is the only window in the chain — a
 * collab carries one `scheduled_at`.
 */
export function CollabSheet({ wsId, collab, open, onOpenChange }: CollabSheetProps) {
  const { t } = useT("blocks");
  const locales = useLocale();
  const slug = useWorkspaceSlug();
  const statusLabel = useStatusLabel(wsId ?? "");
  const empty = t(($) => $.record.empty);

  // Names come from the lists the ledgers already load, not from the `/{id}`
  // detail endpoints: those are workspace-scoped calls that carry no
  // `workspace_id`, so they answer "workspace_id or workspace_slug is required"
  // and every name falls back to a uuid prefix.
  const creators = useQuery({
    ...creatorListOptions(wsId ?? ""),
    enabled: open && !!wsId,
  });
  const briefs = useQuery({
    ...crmBriefListOptions(wsId ?? ""),
    enabled: open && !!wsId,
  });
  const brief = briefs.data?.briefs.find((row) => row.id === collab.brief_id) ?? null;
  const clients = useQuery({
    ...crmClientListOptions(wsId ?? ""),
    enabled: open && !!wsId,
  });

  // The link the row carries, or the one this sheet just created. The row is a
  // snapshot, so a written `issue_id` has to reach this state too — otherwise
  // 「建履约任务」 stays on screen next to the task it made. Both reset on the
  // next opening, during render, so the first frame never shows the last row's
  // task.
  const [linkedId, setLinkedId] = useState<string | null>(collab.issue_id);
  const [created, setCreated] = useState<Issue | null>(null);
  /**
   * The issue that was created but whose id did not reach the collab. A retry
   * then finishes the second write instead of making a second task.
   */
  const [unlinked, setUnlinked] = useState<Issue | null>(null);
  const [failed, setFailed] = useState(false);

  const openKey = `${collab.id}:${collab.issue_id}:${open}`;
  const [seenKey, setSeenKey] = useState(openKey);
  if (openKey !== seenKey) {
    setSeenKey(openKey);
    setLinkedId(collab.issue_id);
    setCreated(null);
    setUnlinked(null);
    setFailed(false);
  }

  const issues = useQuery({
    ...issueDetailOptions(wsId ?? "", linkedId ?? ""),
    enabled: open && !!wsId && !!linkedId,
  });
  const issue = created?.id === linkedId ? created : (issues.data ?? null);

  const createIssue = useCreateIssue();
  const updateCollab = useUpdateCrmCollab();
  const pending = createIssue.isPending || updateCollab.isPending;

  const creator = creators.data?.creators.find((row) => row.id === collab.creator_id) ?? null;
  const client = clients.data?.clients.find((row) => row.id === brief?.client_id) ?? null;
  const creatorName = creator?.display_name || shortId(collab.creator_id) || empty;
  const clientName = client?.name || shortId(brief?.client_id ?? collab.brief_id) || empty;

  /** The money glyph comes from the bundle (`unit.currency`); a currency the
   *  bundle does not carry falls back to its own code rather than a guess. */
  const prefixFor = (currency: string): string => {
    if (!currency) return "";
    return currency === "CNY" || currency === "USD"
      ? t(($) => $.unit.currency[currency])
      : `${currency} `;
  };
  const money = (value: number | null) =>
    formatMoney(value, prefixFor(collab.currency), locales) ?? empty;

  // A window when the brief has one, the collab's own publishing instant when
  // it does not.
  const schedule = ((): string => {
    const from = brief?.schedule_from ?? null;
    const to = brief?.schedule_to ?? null;
    if (from || to) {
      return `${formatDay(from) ?? empty} – ${formatDay(to) ?? empty}`;
    }
    return formatStamp(collab.scheduled_at) ?? empty;
  })();

  const settlement = collab.settlement_mode;

  const cells: { key: CollabField; value: ReactNode }[] = [
    {
      key: "creator",
      value: (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate">{creatorName}</span>
          {creator?.handle ? (
            <span className="shrink-0 text-caption text-muted-foreground">{creator.handle}</span>
          ) : null}
        </span>
      ),
    },
    { key: "stage", value: t(($) => $.ledger.stage[collab.stage]) },
    { key: "amount", value: money(collab.final_amount) },
    { key: "fee", value: money(collab.creator_fee) },
    { key: "schedule", value: schedule },
    {
      key: "settlement",
      value: settlement ? t(($) => $.collab.settlement_mode[settlement]) : empty,
    },
  ];

  const issueHref = slug && linkedId ? paths.workspace(slug).issueDetail(linkedId) : null;

  const create = async () => {
    if (pending) return;
    setFailed(false);
    try {
      const issue =
        unlinked ??
        (await createIssue.mutateAsync({
          title: t(($) => $.collab.issue_title, { creator: creatorName, client: clientName }),
          description: t(($) => $.collab.issue_body, {
            id: collab.id,
            amount: money(collab.final_amount),
            schedule,
          }),
        }));
      if (!unlinked) setUnlinked(issue);
      await updateCollab.mutateAsync({ id: collab.id, issue_id: issue.id });
      setCreated(issue);
      setLinkedId(issue.id);
      setUnlinked(null);
    } catch {
      // One message for either write: the retry is the button, and it picks up
      // whichever half is missing.
      setFailed(true);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The built-in close button carries an English `sr-only` label; this
          sheet draws its own, so the one closing control speaks the reader's
          language. */}
      <SheetContent side="right" showCloseButton={false} className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="break-words pr-1">{creatorName}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <dl
            aria-label={t(($) => $.ledger.domain.collabs)}
            className="grid grid-cols-2 gap-x-6 gap-y-3 pb-2"
          >
            {cells.map((cell) => (
              <div key={cell.key} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-caption text-muted-foreground">
                  {t(($) => $.collab.field[cell.key])}
                </dt>
                <dd className="text-body break-words">{cell.value}</dd>
              </div>
            ))}
            <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
              <dt className="text-caption text-muted-foreground">
                {t(($) => $.collab.field.issue)}
              </dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-2 text-body">
                {linkedId ? (
                  <>
                    <span className="min-w-0 truncate">{issue?.title ?? shortId(linkedId)}</span>
                    {issue ? (
                      <span className="shrink-0 text-caption text-muted-foreground">
                        {statusLabel(issue.status)}
                      </span>
                    ) : null}
                    {issueHref ? (
                      <AppLink
                        href={issueHref}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        {t(($) => $.collab.action.open_issue)}
                      </AppLink>
                    ) : null}
                    {created ? (
                      <span className="text-caption text-muted-foreground">
                        {t(($) => $.collab.issue_created)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!wsId || pending}
                    aria-busy={pending}
                    onClick={() => void create()}
                  >
                    {pending ? <Spinner className="size-3.5" /> : null}
                    {t(($) => $.collab.action.create_issue)}
                  </Button>
                )}
                {failed ? (
                  <span role="alert" className="text-caption text-destructive">
                    {t(($) => $.collab.issue_failed)}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t(($) => $.record.action.close)}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Ids are UUIDs; the first segment is what people read out loud. */
function shortId(id: string | null): string | null {
  if (!id) return null;
  return id.length > 8 ? id.slice(0, 8) : id;
}
