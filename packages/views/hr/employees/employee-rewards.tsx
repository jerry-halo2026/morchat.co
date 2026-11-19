"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@morechat/core/hooks";
import { hrEmployeeRewardListOptions } from "@morechat/core/hr/reward";
import type { HrEmployeeReward } from "@morechat/core/types";
import { History } from "@morechat/ui/icons";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { cn } from "@morechat/ui/lib/utils";
import { ObjectSectionEmpty } from "../../layout/object-page";
import { formatDay } from "./employees-model";

/**
 * Rewards and disciplines for one employee file.
 *
 * One list, newest decision first: a bonus and a warning are the same kind of
 * fact about a person, and splitting them into two columns would make the reader
 * cross-reference to answer "how has this year gone".
 */
export function RewardsTab({ employeeId, empty }: { employeeId: string; empty: string }) {
  const wsId = useWorkspaceId();
  const query = useQuery(hrEmployeeRewardListOptions(wsId, { employee_id: employeeId }));
  const rewards = query.data?.rewards ?? [];

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner aria-hidden />
      </div>
    );
  }
  if (rewards.length === 0) {
    return <ObjectSectionEmpty icon={History} description={empty} />;
  }

  return (
    <ol className="flex flex-col">
      {rewards.map((reward) => (
        <RewardRow key={reward.id} reward={reward} />
      ))}
    </ol>
  );
}

function RewardRow({ reward }: { reward: HrEmployeeReward }) {
  const isReward = reward.kind === "reward";
  return (
    <li
      data-testid="employee-reward-row"
      data-kind={reward.kind}
      className="flex flex-col gap-1 border-b border-surface-border py-2.5 last:border-b-0"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
          {formatDay(reward.decided_on)}
        </span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-micro",
            isReward ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
          )}
        >
          {isReward ? "奖励" : "处分"}
        </span>
        {reward.category ? (
          <span className="shrink-0 text-micro text-muted-foreground">{reward.category}</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-body text-foreground" title={reward.reason}>
          {reward.reason}
        </span>
        {reward.amount !== null ? (
          <span className="shrink-0 text-body tabular-nums text-foreground">
            {formatAmount(reward.amount, reward.currency)}
          </span>
        ) : null}
      </div>
      {reward.note ? (
        <p className="text-caption text-muted-foreground">{reward.note}</p>
      ) : null}
    </li>
  );
}

function formatAmount(amount: number, currency: string): string {
  const prefix = currency === "CNY" ? "¥" : currency === "USD" ? "$" : `${currency} `;
  return `${prefix}${amount.toLocaleString()}`;
}
