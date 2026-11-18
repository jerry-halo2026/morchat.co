"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  crmBriefListOptions,
  crmClientListOptions,
  crmCollabListOptions,
} from "@morechat/core/crm/queries";
import { useWorkspaceId } from "@morechat/core/hooks";
import { BOSS_PAGES } from "@morechat/core/paths";
import { useCurrentMember } from "@morechat/core/permissions";
import { memberListOptions } from "@morechat/core/workspace/queries";
import { AlertCircle, Search } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@morechat/ui/components/ui/input-group";
import { cn } from "@morechat/ui/lib/utils";
import { formatStamp } from "../blocks/record-sheet";
import { useT } from "../i18n";
import {
  CollectionCreateButton,
  CollectionNoMatches,
  CollectionPageHeader,
  CollectionPageState,
} from "../layout/collection-page";
import {
  CollectionEmptyValue,
  CollectionList,
  CollectionNameCell,
  type CollectionColumn,
} from "../layout/collection-list";
import { PAGE_GUTTER } from "../layout/page-header";
import { ROUTE_ICON_COMPONENTS } from "../layout/route-icon-components";
import { ClientFormDialog } from "./customers/client-form";
import { ClientSheet } from "./customers/client-sheet";
import { CLIENT_STAGE_TONE } from "./customers/copy";
import { clientRows, type ClientRow } from "./customers/model";

/**
 * `/{slug}/boss/customers` — 客户商机, read as the chain it is:
 * 客户 → 需求单 → 合作单.
 *
 * The table answers "who are we selling to and where does it stand"; the drawer
 * opens one customer and shows both levels under it. Nothing here re-derives a
 * number: the columns are counts of rows the server returned, and 状态 is derived
 * by `customers/model.ts` from those same rows, because `crm_client` has no status
 * column to read.
 *
 * Everything is read once: three list reads (clients, briefs, collabs) plus the
 * member directory for the owner column. A failure in the client read is the
 * page's own failure — without clients there is no table. A failure in either of
 * the two chain reads is narrower: the counts print `—` and one line says that
 * half did not load, instead of showing every customer as having no work.
 */
export function BossCustomersPage() {
  const wsId = useWorkspaceId() ?? "";
  return <CustomersBody wsId={wsId} />;
}

function CustomersBody({ wsId }: { wsId: string }) {
  const { t } = useT("biz");
  const { t: tLabel } = useT("blocks");
  const { t: tLayout } = useT("layout");
  const Icon = ROUTE_ICON_COMPONENTS[BOSS_PAGES.customers.icon];

  const { role, isLoading: memberLoading } = useCurrentMember(wsId);
  // A member may open a customer (the server defaults the owner to them); only a
  // reader with no role at all — not a member of this workspace — may not.
  const canWrite = !memberLoading && role !== null;

  const clients = useQuery(crmClientListOptions(wsId));
  const briefs = useQuery(crmBriefListOptions(wsId));
  const collabs = useQuery(crmCollabListOptions(wsId));
  const members = useQuery({ ...memberListOptions(wsId), enabled: !!wsId });

  const [search, setSearch] = useState("");
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [form, setForm] = useState<{ client: ClientRow["client"] | null } | null>(null);

  /** `crm_client.owner_member_id` is a user id (WORKBENCH-API §8 rule 1). */
  const ownerNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of members.data ?? []) {
      if (member.user_id) names.set(member.user_id, member.name);
    }
    return names;
  }, [members.data]);

  const chainFailed = briefs.isError || collabs.isError;
  const rows = useMemo(
    () =>
      clientRows(
        clients.data?.clients ?? [],
        // A failed chain read yields no briefs: the row must not then claim
        // "no brief" as a fact, which is why the count cells read `chainFailed`.
        briefs.data?.briefs ?? [],
        collabs.data?.collabs ?? [],
        search,
      ),
    [clients.data, briefs.data, collabs.data, search],
  );

  const selected = openClientId ? (rows.find((row) => row.client.id === openClientId) ?? null) : null;

  const columns: CollectionColumn<ClientRow>[] = [
    {
      key: "client",
      header: tLabel(($) => $.ledger.column.client),
      width: 220,
      cell: (row) => {
        const detail = [row.client.brand, row.client.contact_name].filter(Boolean).join(" · ");
        return (
          <CollectionNameCell
            title={
              <span className="truncate" title={row.client.name}>
                {row.client.name}
              </span>
            }
            description={
              detail ? (
                <span className="truncate" title={detail}>
                  {detail}
                </span>
              ) : undefined
            }
          />
        );
      },
    },
    {
      key: "industry",
      header: tLabel(($) => $.ledger.column.industry),
      width: 140,
      cell: (row) =>
        row.client.industry ? (
          <span className="truncate" title={row.client.industry}>
            {row.client.industry}
          </span>
        ) : (
          <CollectionEmptyValue />
        ),
    },
    {
      key: "owner",
      header: t(($) => $.customers.column_owner),
      width: 130,
      cell: (row) => {
        const owner = row.client.owner_member_id
          ? (ownerNames.get(row.client.owner_member_id) ?? null)
          : null;
        return owner ? (
          <span className="truncate" title={owner}>
            {owner}
          </span>
        ) : (
          <CollectionEmptyValue />
        );
      },
    },
    {
      key: "status",
      header: t(($) => $.customers.column_status),
      width: 120,
      core: true,
      cell: (row) => (
        <span
          data-stage={row.stage}
          className={cn(
            "w-fit shrink-0 rounded-xs px-1 text-micro font-medium leading-4",
            CLIENT_STAGE_TONE[row.stage],
          )}
        >
          {t(($) => $.customers.status[row.stage])}
        </span>
      ),
    },
    {
      key: "briefs",
      header: t(($) => $.customers.column_briefs),
      width: 90,
      align: "end",
      cell: (row) =>
        chainFailed ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{row.briefs.length}</span>
        ),
    },
    {
      key: "collabs",
      header: t(($) => $.customers.column_collabs),
      width: 110,
      align: "end",
      cell: (row) =>
        chainFailed ? (
          <CollectionEmptyValue />
        ) : (
          <span className="tabular-nums">{row.collabs.length}</span>
        ),
    },
    {
      key: "channel",
      header: t(($) => $.customers.column_channel),
      width: 140,
      cell: (row) =>
        row.client.contact_channel ? (
          <span className="truncate" title={row.client.contact_channel}>
            {row.client.contact_channel}
          </span>
        ) : (
          <CollectionEmptyValue />
        ),
    },
    {
      key: "updated",
      header: t(($) => $.customers.column_updated),
      width: 150,
      cell: (row) => {
        const stamp = formatStamp(row.client.updated_at);
        return stamp ? (
          <span className="tabular-nums text-muted-foreground">{stamp}</span>
        ) : (
          <CollectionEmptyValue />
        );
      },
    },
  ];

  const header = (
    <CollectionPageHeader
      icon={Icon}
      title={tLayout(($) => $.nav[BOSS_PAGES.customers.navKey])}
      actions={
        canWrite ? (
          <CollectionCreateButton
            label={t(($) => $.customers.new_client)}
            onClick={() => setForm({ client: null })}
          />
        ) : null
      }
    />
  );

  if (clients.isError) {
    const failure = clients.error;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CollectionPageState
          role="alert"
          tone="destructive"
          icon={AlertCircle}
          title={t(($) => $.customers.error)}
          description={failure instanceof Error && failure.message ? failure.message : undefined}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void clients.refetch()}
            >
              {t(($) => $.retry)}
            </Button>
          }
        />
      </div>
    );
  }

  /** The first run: no customer at all, which is not the same as "no match". */
  const firstRun =
    !clients.isPending && rows.length === 0 && search.trim() === "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      {firstRun ? (
        <CollectionPageState
          icon={Icon}
          title={t(($) => $.customers.empty_title)}
          description={t(($) => $.customers.empty_description)}
        />
      ) : (
        <>
          <div
            data-slot="customers-toolbar"
            className={cn(
              PAGE_GUTTER,
              "flex shrink-0 flex-wrap items-center gap-2 border-b border-surface-border py-2",
            )}
          >
            <div className="min-w-40 max-w-64 flex-1">
              <InputGroup className="h-7">
                <InputGroupAddon>
                  <Search aria-hidden="true" className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t(($) => $.customers.search)}
                  placeholder={t(($) => $.customers.search)}
                  value={search}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </InputGroup>
            </div>
          </div>

          {chainFailed ? (
            <p role="status" className={cn(PAGE_GUTTER, "shrink-0 py-1.5 text-caption text-destructive")}>
              {t(($) => $.block_error)}
            </p>
          ) : null}

          <CollectionList
            label={tLayout(($) => $.nav[BOSS_PAGES.customers.navKey])}
            columns={columns}
            rows={rows}
            loading={clients.isPending}
            getRowId={(row) => row.client.id}
            onRowOpen={(row) => setOpenClientId(row.client.id)}
            empty={
              <CollectionNoMatches
                title={t(($) => $.customers.no_matches)}
                onReset={() => setSearch("")}
                hasSearch={search.trim() !== ""}
              />
            }
          />
        </>
      )}

      {selected ? (
        <ClientSheet
          key={selected.client.id}
          wsId={wsId}
          row={selected}
          open
          canWrite={canWrite}
          ownerName={
            selected.client.owner_member_id
              ? (ownerNames.get(selected.client.owner_member_id) ?? null)
              : null
          }
          onOpenChange={(open) => {
            if (!open) setOpenClientId(null);
          }}
          onEdit={() => setForm({ client: selected.client })}
        />
      ) : null}

      {form ? (
        <ClientFormDialog
          key={form.client?.id ?? "new"}
          client={form.client}
          open
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
        />
      ) : null}
    </div>
  );
}
