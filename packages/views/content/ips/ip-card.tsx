"use client";

import type { MediaIP, MediaIPAccount } from "@morechat/core/types";
import { Badge } from "@morechat/ui/components/ui/badge";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@morechat/ui/components/ui/card";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Pencil, Trash2 } from "@morechat/ui/icons";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../../i18n";
import { isKnownIpStatus } from "./model";

/** The tone of each status: running, standing still, closed. */
const STATUS_TONE: Record<string, string> = {
  active: "text-success",
  paused: "text-warning",
  ended: "text-muted-foreground",
};

/**
 * One IP, as the accounts page shows it: who the persona is, its track and
 * audience, how far this week's publishing goal has got, and how many platform
 * accounts hang off it.
 *
 * The card states the goal as `done / goal` rather than a percentage: the
 * original workbench wrote `本周 3/5 条`, and a fraction is what a reader
 * compares against tomorrow's. An IP with no goal draws the count alone — zero
 * as a denominator would read as "you are infinitely behind".
 *
 * `accounts` is `null` while that IP's detail read is in flight, which is why the
 * count is omitted rather than drawn as 0: the list endpoint does not carry
 * accounts, and a zero that turns into three a moment later is a lie.
 */
export function IpCard({
  ip,
  done,
  accounts,
  canWrite,
  onOpen,
  onEdit,
  onDelete,
}: {
  ip: MediaIP;
  /** Topics this IP finished this week. */
  done: number;
  accounts: readonly MediaIPAccount[] | null;
  canWrite: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT("content");
  const status = isKnownIpStatus(ip.status) ? ip.status : null;
  const goal = ip.week_goal > 0 ? ip.week_goal : null;

  return (
    <Card size="sm" className="h-full gap-3" data-ip-card={ip.id}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-brand"
            style={ip.color ? { backgroundColor: ip.color } : undefined}
          />
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 truncate text-left outline-none hover:underline focus-visible:underline"
            title={ip.name}
          >
            {ip.name}
          </button>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          <Badge
            variant="secondary"
            className={cn("h-4 px-1.5", status ? STATUS_TONE[status] : undefined)}
          >
            {status ? t(($) => $.ips.status[status]) : ip.status}
          </Badge>
          <span data-card-stat="done">
            {t(($) => $.common.week)}{" "}
            <span className="tabular-nums text-foreground">
              {goal === null ? done : `${done}/${goal}`}
            </span>
          </span>
          {accounts !== null ? (
            <span data-card-stat="accounts" className="tabular-nums">
              {t(($) => $.ips.accounts)} {accounts.length}
            </span>
          ) : null}
        </div>
      </CardHeader>

      {ip.persona ? (
        <CardContent className="text-body">
          <p className="line-clamp-2 text-muted-foreground" title={ip.persona}>
            {ip.persona}
          </p>
        </CardContent>
      ) : null}

      {ip.track || ip.audience ? (
        <CardContent className="flex flex-wrap gap-1 pb-0">
          {ip.track ? (
            <Badge variant="outline" className="max-w-full" title={ip.track}>
              {ip.track}
            </Badge>
          ) : null}
          {ip.audience ? (
            <Badge variant="outline" className="max-w-full" title={ip.audience}>
              {ip.audience}
            </Badge>
          ) : null}
        </CardContent>
      ) : null}

      <CardFooter className="mt-auto gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          {t(($) => $.ips.accounts)}
        </Button>
        {canWrite ? (
          <div className="ml-auto flex items-center gap-1">
            <IconButton size="icon-xs" label={t(($) => $.common.edit)} onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton
              size="icon-xs"
              label={t(($) => $.common.delete)}
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
            </IconButton>
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
}
