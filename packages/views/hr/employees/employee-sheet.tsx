"use client";

import type { ReactNode } from "react";
import { CalendarClock, History, TriangleAlert, UserRound } from "@morechat/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@morechat/ui/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@morechat/ui/components/ui/tabs";
import { RadarChart } from "@morechat/ui/components/ui/radar-chart";
import { cn } from "@morechat/ui/lib/utils";
import { ObjectSectionEmpty } from "../../layout/object-page";
import { CollectionEmptyValue } from "../../layout/collection-list";
import { useEmployeesCopy } from "./employees-copy";
import { ChangesTab } from "./employee-changes";
import {
  abilityAxes,
  discAxes,
  formatDay,
  type ContractState,
  type RosterRow,
} from "./employees-model";

/**
 * The roster's row, opened: who the employee is, what the contract says, and the
 * two records the profile cannot yet hold.
 *
 * Four tabs, because the four things someone opens a row to read do not answer
 * the same question and a single column of sections would bury the contract date
 * under the ability picture:
 *
 *   Profile  — the columns that need more room, then the ability matrix (the
 *              six-dimension 1–10 radar) and the DISC profile below it.
 *   Contract — the end date and how many days that is, in the warning colour
 *              from 60 days out and once it has passed.
 *   Rewards & discipline, Changes — no table exists for either, so these two
 *              say so. An empty list would read as "nothing recorded", which is
 *              a claim the database cannot make yet.
 */
export function EmployeeSheet({
  row,
  onClose,
}: {
  /** The row on screen, or null when the sheet is closed. */
  row: RosterRow | null;
  onClose: () => void;
}) {
  const copy = useEmployeesCopy();

  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 pb-2 sm:max-w-lg"
      >
        {row ? (
          <>
            <SheetHeader className="pr-10">
              <SheetTitle className="break-words">{row.memberName ?? "—"}</SheetTitle>
              <p className="min-w-0 truncate text-caption text-muted-foreground">
                {[row.profile.job_title, row.departmentName]
                  .filter((part): part is string => !!part)
                  .join(" · ") || row.profile.member_id.slice(0, 8)}
              </p>
            </SheetHeader>
            <Tabs defaultValue="profile" className="min-h-0 flex-1 gap-0">
              <div className="px-2">
                <TabsList
                  variant="line"
                  className="w-full justify-start gap-1 overflow-x-auto p-0 group-data-horizontal/tabs:h-8"
                >
                  <TabsTrigger
                    value="profile"
                    className="h-full rounded-none px-2 group-data-horizontal/tabs:after:bottom-0"
                  >
                    {copy("tab_profile")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="contract"
                    className="h-full rounded-none px-2 group-data-horizontal/tabs:after:bottom-0"
                  >
                    {copy("tab_contract")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="rewards"
                    className="h-full rounded-none px-2 group-data-horizontal/tabs:after:bottom-0"
                  >
                    {copy("tab_rewards")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="h-full rounded-none px-2 group-data-horizontal/tabs:after:bottom-0"
                  >
                    {copy("tab_history")}
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <TabsContent value="profile" className="space-y-5 outline-none">
                  <Section title={copy("section_basic")}>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <DefItem label={copy("field_department")} value={row.departmentName} />
                      <DefItem label={copy("field_job_title")} value={row.profile.job_title} />
                      <DefItem label={copy("field_grade")} value={row.profile.grade} />
                      <DefItem label={copy("field_hire_date")} value={formatDay(row.profile.hire_date)} />
                      <DefItem
                        label={copy("field_regular_date")}
                        value={formatDay(row.profile.regular_date)}
                      />
                      <DefItem label={copy("field_email")} value={row.memberEmail} />
                    </dl>
                  </Section>
                  <Section title={copy("section_ability")}>
                    <AbilityRadar row={row} empty={copy("ability_empty")} label={copy("section_ability")} />
                  </Section>
                  <Section title={copy("section_disc")}>
                    <DiscBars row={row} empty={copy("disc_empty")} />
                  </Section>
                </TabsContent>
                <TabsContent value="contract" className="outline-none">
                  <ContractTab row={row} />
                </TabsContent>
                <TabsContent value="rewards" className="outline-none">
                  <div data-testid="pending-table-rewards" data-pending-table="rewards">
                    <ObjectSectionEmpty
                      icon={History}
                      title={copy("rewards_empty_title")}
                      description={copy("rewards_empty_description")}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="history" className="outline-none">
                  <ChangesTab employeeId={row.profile.id} empty={copy("history_empty_description")} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-caption font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function DefItem({ label, value }: { label: ReactNode; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd
        className="min-w-0 truncate text-body"
        title={value && value.length > 24 ? value : undefined}
      >
        {value || <CollectionEmptyValue />}
      </dd>
    </div>
  );
}

/**
 * The six-dimension ability matrix on its recorded 1–10 scale, drawn by the
 * shared radar. A profile with no scores renders the radar's empty state rather
 * than a degenerate polygon at the centre, which would read as "measured and
 * terrible".
 */
function AbilityRadar({
  row,
  empty,
  label,
}: {
  row: RosterRow;
  empty: string;
  label: string;
}) {
  const axes = abilityAxes(row.profile.ability);
  return (
    <RadarChart
      axes={axes.map(({ key, label: axisLabel }) => ({ key, label: axisLabel }))}
      series={
        axes.length > 0
          ? [
              {
                key: "ability",
                label: row.memberName ?? label,
                values: axes.map((axis) => axis.value),
              },
            ]
          : []
      }
      max={10}
      label={label}
      empty={empty}
      height={220}
    />
  );
}

const CONTRACT_TONE: Record<ContractState, string> = {
  none: "text-muted-foreground",
  ok: "text-muted-foreground",
  warning: "bg-warning/15 text-warning",
  due: "bg-warning/15 text-warning",
  expired: "bg-warning/15 text-warning",
};

/**
 * The end date and the days left, as one statement in one colour: a contract in
 * its last 60 days (or past its end) is the reason someone opens this tab, so it
 * is drawn the way the roster draws a warning and carries the state on
 * `data-contract-state` for the test that pins the threshold.
 */
function ContractTab({ row }: { row: RosterRow }) {
  const copy = useEmployeesCopy();
  const { state, days } = row.contract;
  const end = formatDay(row.profile.contract_end);

  let countdown: string;
  if (state === "none") countdown = copy("contract_none");
  else if (state === "expired" && days !== null) countdown = copy("contract_expired", { days: -days });
  else if (state === "due") countdown = copy("contract_due_today");
  else countdown = copy("contract_remaining", { days: days ?? 0 });

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <DefItem label={copy("field_contract_end")} value={end} />
      </dl>
      <div
        data-testid="employee-contract"
        data-contract-state={state}
        data-contract-days={days ?? undefined}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-body",
          state === "none" ? "bg-muted text-muted-foreground" : CONTRACT_TONE[state],
        )}
      >
        {state === "warning" || state === "due" || state === "expired" ? (
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        ) : (
          <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
        )}
        <span className="min-w-0 truncate">{countdown}</span>
      </div>
      {state === "warning" ? (
        <p className="text-caption text-muted-foreground">{copy("contract_soon")}</p>
      ) : null}
    </div>
  );
}

/**
 * DISC's four axes as bars on the recorded 0–10 scale. Bars rather than a second
 * radar: the four axes are read one at a time ("how much steadiness"), and a
 * profile whose axes come back in an unexpected order still reads top to bottom.
 */
function DiscBars({ row, empty }: { row: RosterRow; empty: string }) {
  const copy = useEmployeesCopy();
  const axes = discAxes(row.profile.disc);
  if (axes.length === 0) {
    return (
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        <UserRound aria-hidden="true" className="size-4 shrink-0" />
        <span>{empty}</span>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5" aria-label={copy("section_disc")}>
      {axes.map((axis) => (
        <li key={axis.key} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-caption text-muted-foreground">
            {discLabel(axis.key, copy)}
          </span>
          <span
            aria-hidden="true"
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-brand"
              style={{ width: `${Math.min(100, Math.max(0, axis.value * 10))}%` }}
            />
          </span>
          <span className="w-6 shrink-0 text-right text-caption tabular-nums">
            {axis.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A known DISC axis gets the bundle's word; an unknown one keeps its own key. */
function discLabel(key: string, copy: ReturnType<typeof useEmployeesCopy>): string {
  switch (key) {
    case "d":
      return copy("disc_d");
    case "i":
      return copy("disc_i");
    case "s":
      return copy("disc_s");
    case "c":
      return copy("disc_c");
    default:
      return key;
  }
}
