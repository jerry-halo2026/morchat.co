"use client";

import { useQuery } from "@tanstack/react-query";
import { workbenchOverviewOptions } from "@morechat/core/crm/queries";
import { WORKBENCH_METRICS, type MetricId } from "@morechat/core/metrics/contracts";
import { useWorkspacePaths } from "@morechat/core/paths";
import { AppLink } from "../../navigation";
import { useLocale, useT } from "../../i18n";
import { ObjectSectionCard } from "../../layout/object-page";
import { metricLabelKey } from "../../blocks/metrics";
import { BossBlock } from "./block";
import { useReviewCopy } from "../../review/copy";

/**
 * The three rates that make the review gate accountable (WORKBENCH-API §26.4).
 *
 * All three read `activity_log`, all three are sliced by `(agent_id, domain)` on
 * the server — no single score — and all three are `insufficient_data` until the
 * rows exist. So a cell has three states and they are *different statements*:
 *
 *   - a percentage: the server could measure it;
 *   - "not enough data": the metric exists, the sample does not (fewer than five
 *     verdicts, or no agent write yet) — the honest answer, and the one that
 *     tells the reader to keep working rather than that the number is zero;
 *   - "—": this server does not compute it at all. That is a version fact, not a
 *     judgement, and drawing 0% for it would claim something nobody measured.
 *
 * The cells link into `/review` because that is the page that moves them: a
 * reviewer reading "12% rejected" should land on the rows behind it, not on a
 * second report about them.
 */
const QUALITY_METRICS: readonly MetricId[] = [
  "agent.write.overwrite_rate",
  "agent.review.reject_rate",
  "agent.action.rollback_rate",
];

export function BossQualityBlock({ wsId }: { wsId: string }) {
  const { t } = useT("blocks");
  const copy = useReviewCopy();
  const locales = useLocale();
  const p = useWorkspacePaths();
  const overview = useQuery(workbenchOverviewOptions(wsId));
  const metrics = overview.data?.metrics;

  const percent = new Intl.NumberFormat(locales, {
    style: "percent",
    maximumFractionDigits: 1,
  });

  return (
    <BossBlock
      title={copy("quality_title")}
      isLoading={overview.isPending}
      isError={overview.isError}
      onRetry={() => void overview.refetch()}
      action={
        <AppLink href={p.boss.review()} className="text-caption text-muted-foreground">
          {copy("quality_open")}
        </AppLink>
      }
    >
      <ObjectSectionCard className="px-3.5 py-3">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          {QUALITY_METRICS.map((id) => {
            const contract = WORKBENCH_METRICS[id];
            const sample = metrics?.[id];
            const label = t(($) => $.metric[metricLabelKey(contract)]);
            // Three states, in the order they can be told apart: absent vs
            // unmeasured vs measured. `value` is narrowed before it is formatted,
            // so a sample that arrives without a number cannot print "NaN%".
            const measured = sample !== undefined && sample.value !== null && sample.empty !== "insufficient_data"
              ? sample.value
              : null;
            const state = !metrics || sample === undefined
              ? "absent"
              : measured === null
                ? "insufficient"
                : "value";
            return (
              <div key={id} className="flex min-w-0 flex-col gap-0.5" data-quality-metric={id}>
                <dt className="min-w-0 truncate text-caption text-muted-foreground" title={label}>
                  {label}
                </dt>
                <dd
                  className={
                    state === "value"
                      ? "text-title-sm font-medium tabular-nums"
                      : "text-title-sm font-medium text-muted-foreground"
                  }
                >
                  {measured !== null
                    ? percent.format(measured)
                    : state === "insufficient"
                      ? copy("quality_insufficient")
                      : copy("quality_absent")}
                </dd>
              </div>
            );
          })}
        </dl>
      </ObjectSectionCard>
    </BossBlock>
  );
}
