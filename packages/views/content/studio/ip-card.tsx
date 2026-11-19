"use client";

import type { MediaIP } from "@morechat/core/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@morechat/ui/components/ui/card";
import { AppLink } from "../../navigation";
import { useStudioCopy } from "./copy";
import type { IpCounts } from "./model";

/** The card's four stages, in pipeline order. */
const COUNT_CELLS = [
  { key: "topics", label: "count_topics" },
  { key: "scripts", label: "count_scripts" },
  { key: "shoots", label: "count_shoots" },
  { key: "publishing", label: "count_publishing" },
] as const;

/** One line of the card's body; a field with nothing in it draws no line. */
function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2 text-body">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate" title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * One IP, as the studio shows it: who it is, who it speaks to, how many accounts
 * it runs on, this week's publishing goal, and what is waiting at each stage.
 *
 * The whole card is the link to that IP's topic pool — the studio is a switch
 * board, and "where do I go next" is always the same answer. There is no IP
 * detail page to open instead.
 *
 * `accounts` is `null` until that IP's detail read answers: the count comes from
 * `creator.media_ip_id` through `GET /media/ips/{id}` (the list endpoint does not
 * carry it), so an unfinished read draws no number rather than a zero.
 */
export function IpCard({
  ip,
  accounts,
  counts,
  href,
}: {
  ip: MediaIP;
  accounts: number | null;
  counts: IpCounts;
  href: string;
}) {
  const copy = useStudioCopy();
  const goal = ip.week_goal > 0 ? copy("card_week_goal_value", { count: ip.week_goal }) : null;

  return (
    <AppLink
      href={href}
      newTabTitle={ip.name}
      className="block min-w-0 rounded-card outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card size="sm" className="h-full gap-3 transition-colors hover:bg-surface-hover">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-brand"
              style={ip.color ? { backgroundColor: ip.color } : undefined}
            />
            <span className="min-w-0 truncate">{ip.name}</span>
          </CardTitle>
          {/* Accounts and the goal are the two facts the card states outside its
              body lines: a count is not a sentence, and the goal is a number. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            {accounts !== null ? (
              <span>
                {copy("card_accounts")} <span className="tabular-nums">{accounts}</span>
              </span>
            ) : null}
            {goal ? (
              <span>
                {copy("card_week_goal")} <span className="tabular-nums">{goal}</span>
              </span>
            ) : (
              <span>{copy("card_no_goal")}</span>
            )}
          </div>
        </CardHeader>

        {ip.persona || ip.track || ip.audience ? (
          <CardContent className="space-y-0.5">
            {ip.persona ? <DetailLine label={copy("card_persona")} value={ip.persona} /> : null}
            {ip.track ? <DetailLine label={copy("card_track")} value={ip.track} /> : null}
            {ip.audience ? <DetailLine label={copy("card_audience")} value={ip.audience} /> : null}
          </CardContent>
        ) : null}

        <CardFooter className="mt-auto">
          <dl className="grid w-full grid-cols-4 gap-2">
            {COUNT_CELLS.map((cell) => (
              <div key={cell.key} data-count={cell.key} className="flex min-w-0 flex-col gap-0.5">
                <dt className="truncate text-micro uppercase tracking-wide text-muted-foreground">
                  {copy(cell.label)}
                </dt>
                <dd className="text-title-sm font-medium tabular-nums">
                  {counts[cell.key]}
                </dd>
              </div>
            ))}
          </dl>
        </CardFooter>
      </Card>
    </AppLink>
  );
}
