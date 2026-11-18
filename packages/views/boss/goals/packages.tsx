"use client";

import { useState } from "react";
import { Plus, Trash2 } from "@morechat/ui/icons";
import { Button } from "@morechat/ui/components/ui/button";
import { IconButton } from "@morechat/ui/components/common/icon-button";
import { Input } from "@morechat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import {
  useCreateGoalPackage,
  useDeleteGoalPackage,
  useUpdateGoalPackage,
} from "@morechat/core/goal/mutations";
import type { Department, GoalDetail, GoalPackage, GoalStatus, MemberWithUser } from "@morechat/core/types";
import { cn } from "@morechat/ui/lib/utils";
import { useT } from "../../i18n";
import {
  ObjectSection,
  ObjectSectionAction,
  ObjectSectionCard,
  ObjectSectionEmpty,
} from "../../layout/object-page";
import { GOAL_STATUS_TONE, goalStatusLabel } from "./copy";
import { GOAL_STATUSES, packageSummary } from "./model";

/**
 * 部门分包: which department answers for which slice of the objective.
 *
 * A package is a department plus a title plus (optionally) the person carrying
 * it — `goal_package.department_id` is required because a "split" that names no
 * department is just a copy of the goal, and `owner_member_id` is not the write
 * gate (§13.4), it is who the slice is drawn against. Writes therefore go through
 * the goal's own owner permission; the page only decides whether to draw the
 * controls at all.
 *
 * Packages are not progress: there is no percentage on a package, because a
 * department's share of a key result is a number nobody recorded. The heading
 * counts what the rows are — how many are in progress out of how many exist.
 */
export function PackagesSection({
  goal,
  departments,
  members,
  canWrite,
}: {
  goal: GoalDetail;
  departments: readonly Department[];
  members: readonly MemberWithUser[];
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const [adding, setAdding] = useState(false);
  const summary = packageSummary(goal.packages);

  return (
    <ObjectSection
      title={t(($) => $.goals.packages)}
      count={goal.packages.length}
      action={
        canWrite && !adding ? (
          <ObjectSectionAction icon={Plus} onClick={() => setAdding(true)}>
            {t(($) => $.goals.package_add)}
          </ObjectSectionAction>
        ) : null
      }
    >
      {goal.packages.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          {t(($) => $.goals.package_count, { active: summary.active, total: summary.total })}
        </p>
      ) : null}

      {goal.packages.length === 0 ? (
        <ObjectSectionEmpty description={t(($) => $.goals.section_empty)} />
      ) : (
        <ObjectSectionCard>
          {goal.packages.map((pkg) => (
            <PackageRow
              key={pkg.id}
              goalId={goal.id}
              pkg={pkg}
              departments={departments}
              members={members}
              canWrite={canWrite}
            />
          ))}
        </ObjectSectionCard>
      )}

      {adding ? (
        <NewPackageForm
          goalId={goal.id}
          departments={departments}
          members={members}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </ObjectSection>
  );
}

function PackageRow({
  goalId,
  pkg,
  departments,
  members,
  canWrite,
}: {
  goalId: string;
  pkg: GoalPackage;
  departments: readonly Department[];
  members: readonly MemberWithUser[];
  canWrite: boolean;
}) {
  const { t } = useT("boss");
  const update = useUpdateGoalPackage();
  const remove = useDeleteGoalPackage();

  const department = departments.find((candidate) => candidate.id === pkg.department_id) ?? null;
  const owner = members.find((candidate) => candidate.id === pkg.owner_member_id) ?? null;

  const statusItems: { value: GoalStatus; label: string }[] = GOAL_STATUSES.map((status) => ({
    value: status,
    label: goalStatusLabel(t, status),
  }));

  return (
    <div className="flex min-w-0 items-center gap-2 px-3.5 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-caption text-muted-foreground">
            {department?.name ?? t(($) => $.unset)}
          </span>
          <span className="min-w-0 truncate text-body" title={pkg.title}>
            {pkg.title}
          </span>
        </span>
        <span className="truncate text-caption text-muted-foreground">
          {owner?.name ?? t(($) => $.unset)}
        </span>
      </span>
      {canWrite ? (
        <Select
          items={statusItems}
          value={pkg.status}
          onValueChange={(next) => {
            if (next === null) return;
            void update.mutateAsync({ goalId, packageId: pkg.id, status: next });
          }}
        >
          <SelectTrigger size="sm" aria-label={t(($) => $.field.status)} className="w-32 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span
          className={cn(
            "shrink-0 rounded-xs px-1 text-micro leading-4 font-medium",
            GOAL_STATUS_TONE[pkg.status],
          )}
        >
          {goalStatusLabel(t, pkg.status)}
        </span>
      )}
      {canWrite ? (
        <IconButton
          size="icon-xs"
          label={t(($) => $.action.delete)}
          className="shrink-0 text-muted-foreground"
          disabled={remove.isPending}
          onClick={() => void remove.mutateAsync({ goalId, packageId: pkg.id })}
        >
          <Trash2 />
        </IconButton>
      ) : null}
    </div>
  );
}

function NewPackageForm({
  goalId,
  departments,
  members,
  onClose,
}: {
  goalId: string;
  departments: readonly Department[];
  members: readonly MemberWithUser[];
  onClose: () => void;
}) {
  const { t } = useT("boss");
  const create = useCreateGoalPackage();
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const busy = create.isPending;

  const departmentItems = departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));
  const ownerItems = [
    { value: "", label: t(($) => $.unset) },
    ...members.map((member) => ({ value: member.id, label: member.name })),
  ];

  const submit = async () => {
    setFailure(null);
    const trimmed = title.trim();
    if (trimmed === "" || departmentId === "") return;
    try {
      await create.mutateAsync({
        goalId,
        department_id: departmentId,
        title: trimmed,
        owner_member_id: ownerId === "" ? undefined : ownerId,
      });
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-input p-2.5">
      <Select
        items={departmentItems}
        value={departmentId}
        onValueChange={(next) => {
          if (next !== null) setDepartmentId(next);
        }}
        disabled={busy}
      >
        <SelectTrigger size="sm" aria-label={t(($) => $.goals.department)} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {departmentItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label={t(($) => $.field.title)}
        placeholder={t(($) => $.field.title)}
        className="h-7 min-w-40 flex-1"
        value={title}
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Select
        items={ownerItems}
        value={ownerId}
        onValueChange={(next) => {
          if (next !== null) setOwnerId(next);
        }}
        disabled={busy}
      >
        <SelectTrigger size="sm" aria-label={t(($) => $.field.owner)} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ownerItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        disabled={busy || title.trim() === "" || departmentId === ""}
        aria-busy={busy}
        onClick={() => void submit()}
      >
        {busy ? <Spinner className="size-3.5" /> : null}
        {t(($) => $.action.save)}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>
        {t(($) => $.action.cancel)}
      </Button>
      {failure ? (
        <p role="alert" className="basis-full text-caption text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
