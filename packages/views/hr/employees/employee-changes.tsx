"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@morechat/core/hooks";
import { hrEmployeeChangeListOptions } from "@morechat/core/hr/change";
import type { HrEmployeeChange, HrEmployeeChangeKind } from "@morechat/core/types";
import { History } from "@morechat/ui/icons";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import { ObjectSectionEmpty } from "../../layout/object-page";
import { formatDay } from "./employees-model";

/**
 * The changes recorded against one employee file.
 *
 * The list is append-only and ordered by the day each change took effect, so it
 * reads as a career rather than as an edit history: the newest line is what the
 * file looks like now.
 */
export function ChangesTab({ employeeId, empty }: { employeeId: string; empty: string }) {
  const wsId = useWorkspaceId();
  const query = useQuery(hrEmployeeChangeListOptions(wsId, { employee_id: employeeId }));
  const changes = query.data?.changes ?? [];

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner aria-hidden />
      </div>
    );
  }
  if (changes.length === 0) {
    return <ObjectSectionEmpty icon={History} description={empty} />;
  }

  return (
    <ol className="flex flex-col">
      {changes.map((change) => (
        <ChangeRow key={change.id} change={change} />
      ))}
    </ol>
  );
}

const KIND_LABEL: Record<HrEmployeeChangeKind, string> = {
  hire: "入职",
  regularize: "转正",
  renew: "续签",
  move: "调岗",
  promote: "晋升",
  grade: "职级调整",
  salary: "薪资调整",
  leave: "离职",
  other: "其他",
};

function ChangeRow({ change }: { change: HrEmployeeChange }) {
  return (
    <li
      data-testid="employee-change-row"
      className="flex flex-col gap-1 border-b border-surface-border py-2.5 last:border-b-0"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
          {formatDay(change.effective_on)}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">
          {KIND_LABEL[change.kind] ?? change.kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-body text-foreground" title={change.note ?? ""}>
          {change.note ?? ""}
        </span>
      </div>
    </li>
  );
}
