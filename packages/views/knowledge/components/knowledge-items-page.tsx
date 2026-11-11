"use client";

/**
 * S4 �?the entry list and its drawer.
 *
 * An "entry" is what the knowledge base knows about a thing: a page, a captured
 * source, a decision. The table is the inventory view; the drawer is where the
 * two facts that actually change are changed �?its status and who may read it.
 * The table is exported on its own so the list can be rendered (and tested)
 * without the drawer or the network.
 */

import { useMemo, useState } from "react";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morechat/ui/components/ui/table";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import type { KnowledgeAccess, KnowledgeItem, KnowledgeItemStatus } from "../data/types";
import {
  useKnowledgeItems,
  useKnowledgeWorkspaceId,
  useUpdateKnowledgeItem,
} from "../hooks/use-knowledge";
import { KnowledgeRail } from "./knowledge-rail";
import {
  KnowledgeAccessBadge,
  KnowledgeQueryState,
  KnowledgeStatusBadge,
  KnowledgeUpdated,
} from "./knowledge-parts";

const STATUS_FLOW: KnowledgeItemStatus[] = ["draft", "review", "approved", "archived"];
const ACCESS_OPTIONS: KnowledgeAccess[] = ["workspace", "space", "restricted"];

export function KnowledgeItemsTable({
  items,
  onOpen,
}: {
  items: readonly KnowledgeItem[];
  onOpen: (item: KnowledgeItem) => void;
}) {
  const { t } = useT("knowledge");
  const p = useWorkspacePaths();
  const typeLabel = (type: KnowledgeItem["type"]) =>
    type === "source"
      ? t(($) => $.items.type_source)
      : type === "decision"
        ? t(($) => $.items.type_decision)
        : t(($) => $.items.type_page);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t(($) => $.items.column_title)}</TableHead>
          <TableHead>{t(($) => $.items.column_type)}</TableHead>
          <TableHead>{t(($) => $.items.column_source)}</TableHead>
          <TableHead>{t(($) => $.items.column_status)}</TableHead>
          <TableHead>{t(($) => $.items.column_owner)}</TableHead>
          <TableHead>{t(($) => $.items.column_updated)}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            tabIndex={0}
            role="button"
            onClick={() => onOpen(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(item);
              }
            }}
            className="cursor-pointer"
          >
            <TableCell className="max-w-80 truncate font-medium">
              {item.path ? (
                <AppLink
                  href={p.knowledgePage(item.space, item.path)}
                  className="hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {item.title}
                </AppLink>
              ) : (
                item.title
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{typeLabel(item.type)}</TableCell>
            <TableCell className="max-w-56 truncate text-muted-foreground">{item.source}</TableCell>
            <TableCell>
              <KnowledgeStatusBadge status={item.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{item.owner ?? "—"}</TableCell>
            <TableCell>
              <KnowledgeUpdated at={item.updated_at} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function KnowledgeItemDrawer({
  item,
  open,
  onOpenChange,
  onStatus,
  onAccess,
  busy,
}: {
  item: KnowledgeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatus: (status: KnowledgeItemStatus) => void;
  onAccess: (access: KnowledgeAccess) => void;
  busy?: boolean;
}) {
  const { t } = useT("knowledge");
  if (!item) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>{t(($) => $.items.drawer_title)}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          <div>
            <h3 className="text-title-sm font-semibold">{item.title}</h3>
            <p className="mt-1 truncate text-caption text-faint-foreground">
              {item.space}/{item.path ?? ""}
            </p>
          </div>

          <section>
            <h4 className="mb-1.5 text-caption font-medium text-muted-foreground">{t(($) => $.items.status)}</h4>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FLOW.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={status === item.status ? "default" : "outline"}
                  disabled={busy || status === item.status}
                  onClick={() => onStatus(status)}
                >
                  <KnowledgeStatusBadge status={status} />
                </Button>
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-1.5 text-caption font-medium text-muted-foreground">{t(($) => $.items.access)}</h4>
            <div className="flex flex-col gap-1">
              {ACCESS_OPTIONS.map((access) => (
                <label key={access} className="flex items-center gap-2 text-caption">
                  <input
                    type="radio"
                    name="knowledge-item-access"
                    value={access}
                    checked={(item.access ?? "workspace") === access}
                    disabled={busy}
                    onChange={() => onAccess(access)}
                  />
                  <KnowledgeAccessBadge access={access} />
                </label>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function KnowledgeItemsPage({ wsId: wsIdProp }: { wsId?: string }) {
  const { t } = useT("knowledge");
  const fallbackWsId = useKnowledgeWorkspaceId();
  const wsId = wsIdProp ?? fallbackWsId;
  const itemsQuery = useKnowledgeItems(wsId, {});
  const updateItem = useUpdateKnowledgeItem(wsId);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const selected = items.find((item) => item.id === openId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <KnowledgeRail wsId={wsId} space={items[0]?.space ?? ""} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 pr-4 pl-5">
          <h1 className="min-w-0 flex-1 truncate text-title-sm font-semibold">{t(($) => $.items.title)}</h1>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
          <KnowledgeQueryState
            error={itemsQuery.error}
            onRetry={() => void itemsQuery.refetch()}
            empty={items.length === 0}
          >
            <KnowledgeItemsTable items={items} onOpen={(item) => setOpenId(item.id)} />
          </KnowledgeQueryState>
        </div>
      </div>

      <KnowledgeItemDrawer
        item={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        busy={updateItem.isPending}
        onStatus={(status) => {
          if (selected) updateItem.mutate({ id: selected.id, status });
        }}
        onAccess={(access) => {
          if (selected) updateItem.mutate({ id: selected.id, access });
        }}
      />
    </div>
  );
}

