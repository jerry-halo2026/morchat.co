"use client";

import { useId, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@morechat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@morechat/ui/components/ui/dialog";
import { Input } from "@morechat/ui/components/ui/input";
import { Label } from "@morechat/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@morechat/ui/components/ui/select";
import { Spinner } from "@morechat/ui/components/ui/spinner";
import {
  useCreateHrCandidate,
  useCreateHrEmployee,
  useCreateHrInterview,
  useCreateHrJob,
} from "@morechat/core/hr/mutations";
import { hrCandidateListOptions, hrJobListOptions } from "@morechat/core/hr/queries";
import { departmentListOptions, memberListOptions } from "@morechat/core/workspace/queries";
import type {
  HrCandidateStage,
  HrInterviewMode,
  HrInterviewStatus,
} from "@morechat/core/types";
import { useT } from "../i18n";
import type { HrLedgerDomain } from "./data";
import type { RecordField } from "./record-sheet";

/** Select value for "nothing picked". A real pick is the entity's id. */
const NONE = "__none";

const CANDIDATE_STAGES: readonly HrCandidateStage[] = [
  "screening",
  "test",
  "interview",
  "scored",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];

const INTERVIEW_MODES: readonly HrInterviewMode[] = ["onsite", "video", "phone"];

const INTERVIEW_STATUSES: readonly HrInterviewStatus[] = [
  "scheduled",
  "done",
  "cancelled",
  "no_show",
];

/** The two currencies the bundle names; anything else would have no glyph. */
const CURRENCIES = ["CNY", "USD"] as const;

const EMPTY_JOB = {
  title: "",
  department_id: NONE,
  level: "",
  headcount: "",
  salary_min: "",
  salary_max: "",
  currency: "CNY",
};

const EMPTY_CANDIDATE: {
  name: string;
  job_id: string;
  stage: HrCandidateStage;
  phone: string;
  email: string;
  expected_salary: string;
} = {
  name: "",
  job_id: "",
  stage: "screening",
  phone: "",
  email: "",
  expected_salary: "",
};

const EMPTY_INTERVIEW: {
  candidate_id: string;
  scheduled_at: string;
  round: string;
  interviewer_name: string;
  mode: HrInterviewMode | "";
  status: HrInterviewStatus;
} = {
  candidate_id: "",
  scheduled_at: "",
  round: "1",
  interviewer_name: "",
  mode: "",
  status: "scheduled",
};

const EMPTY_EMPLOYEE = {
  member_id: "",
  job_title: "",
  grade: "",
  department_id: NONE,
  hire_date: "",
  regular_date: "",
  contract_end: "",
};

export interface RecordFormProps {
  domain: HrLedgerDomain;
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One new row of a hiring ledger, written through the ledger's own mutation.
 *
 * The fields are the body of `Create*Request` (`WORKBENCH-API.md` §10.3) and
 * nothing more: a field the server will not take is a field the form must not
 * ask for. Required inputs are checked here, before the request, because the
 * server's answer to a missing title is a 400 with no field to point at; a
 * rejected write keeps its input and prints the reason instead of closing, so a
 * typed row is never lost to a validation error the reader could have fixed.
 */
export function RecordForm({ domain, wsId, open, onOpenChange }: RecordFormProps) {
  const { t } = useT("blocks");
  const id = useId();

  const [job, setJob] = useState(EMPTY_JOB);
  const [candidate, setCandidate] = useState(EMPTY_CANDIDATE);
  const [interview, setInterview] = useState(EMPTY_INTERVIEW);
  const [employee, setEmployee] = useState(EMPTY_EMPLOYEE);
  const [missing, setMissing] = useState<RecordField[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  // One dialog, one attempt. A reopen starts empty because the row it described
  // has been written (or abandoned) in the meantime. Resetting while rendering
  // rather than in an effect keeps the first frame of the reopened dialog from
  // flashing the previous draft.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setJob(EMPTY_JOB);
      setCandidate(EMPTY_CANDIDATE);
      setInterview(EMPTY_INTERVIEW);
      setEmployee(EMPTY_EMPLOYEE);
      setMissing([]);
      setFailure(null);
    }
  }

  // Only the references this domain's pickers need are read. Every list is
  // already in the cache from the ledger the dialog was opened on.
  const departments = useQuery({
    ...departmentListOptions(wsId),
    enabled: open && (domain === "jobs" || domain === "employees"),
  });
  const jobs = useQuery({
    ...hrJobListOptions(wsId),
    enabled: open && domain === "candidates",
  });
  const candidates = useQuery({
    ...hrCandidateListOptions(wsId),
    enabled: open && domain === "interviews",
  });
  const members = useQuery({
    ...memberListOptions(wsId),
    enabled: open && (domain === "interviews" || domain === "employees"),
  });

  const createJob = useCreateHrJob();
  const createCandidate = useCreateHrCandidate();
  const createInterview = useCreateHrInterview();
  const createEmployee = useCreateHrEmployee();
  const pending =
    createJob.isPending ||
    createCandidate.isPending ||
    createInterview.isPending ||
    createEmployee.isPending;

  const label = (field: RecordField) => t(($) => $.record.field[field]);

  const noneOption: { value: typeof NONE; label: string } = {
    value: NONE,
    label: t(($) => $.record.option.none),
  };
  const chooseOption = { value: "", label: t(($) => $.record.option.choose) };
  const departmentOptions = [
    noneOption,
    ...(departments.data ?? []).map((row) => ({ value: row.id, label: row.name })),
  ];
  const jobOptions = [
    chooseOption,
    ...(jobs.data?.jobs ?? []).map((row) => ({ value: row.id, label: row.title })),
  ];
  const candidateOptions = [
    chooseOption,
    ...(candidates.data?.candidates ?? []).map((row) => ({ value: row.id, label: row.name })),
  ];
  const memberOptions = [
    noneOption,
    ...(members.data ?? []).map((row) => ({ value: row.id, label: row.name })),
  ];
  const currencyOptions = CURRENCIES.map((code) => ({
    value: code,
    label: t(($) => $.unit.currency[code]),
  }));
  const stageOptions = CANDIDATE_STAGES.map((stage) => ({
    value: stage,
    label: t(($) => $.ledger.candidate_stage[stage]),
  }));
  const modeOptions: { value: HrInterviewMode | typeof NONE; label: string }[] = [
    noneOption,
    ...INTERVIEW_MODES.map((mode) => ({
      value: mode,
      label: t(($) => $.ledger.interview_mode[mode]),
    })),
  ];
  const statusOptions = INTERVIEW_STATUSES.map((status) => ({
    value: status,
    label: t(($) => $.ledger.interview_status[status]),
  }));

  const requiredNow = (): RecordField[] => {
    switch (domain) {
      case "jobs":
        return job.title.trim() ? [] : ["title"];
      case "candidates": {
        const fields: RecordField[] = [];
        if (!candidate.name.trim()) fields.push("name");
        if (!candidate.job_id) fields.push("job");
        return fields;
      }
      case "interviews": {
        const fields: RecordField[] = [];
        if (!interview.candidate_id) fields.push("candidate");
        if (!interview.scheduled_at) fields.push("scheduled_at");
        return fields;
      }
      case "employees":
        return employee.member_id && employee.member_id !== NONE ? [] : ["member"];
    }
  };

  const send = () => {
    switch (domain) {
      case "jobs":
        return createJob.mutateAsync({
          title: job.title.trim(),
          department_id: job.department_id === NONE ? null : job.department_id,
          level: job.level.trim() || null,
          headcount: job.headcount.trim() ? Number(job.headcount) : undefined,
          salary_min: amount(job.salary_min),
          salary_max: amount(job.salary_max),
          currency: job.currency,
        });
      case "candidates":
        return createCandidate.mutateAsync({
          name: candidate.name.trim(),
          job_id: candidate.job_id,
          stage: candidate.stage,
          phone: candidate.phone.trim() || null,
          email: candidate.email.trim() || null,
          expected_salary: amount(candidate.expected_salary),
        });
      case "interviews":
        return createInterview.mutateAsync({
          candidate_id: interview.candidate_id,
          // `datetime-local` carries a wall clock and no zone; the API takes an
          // instant. Parsing the local string and sending its UTC form is what
          // keeps the slot where the scheduler picked it.
          scheduled_at: new Date(interview.scheduled_at).toISOString(),
          round: interview.round.trim() ? Number(interview.round) : undefined,
          interviewer_name: interview.interviewer_name.trim(),
          mode: interview.mode || undefined,
          status: interview.status,
        });
      case "employees":
        return createEmployee.mutateAsync({
          member_id: employee.member_id,
          job_title: employee.job_title.trim() || null,
          grade: employee.grade.trim() || null,
          department_id: employee.department_id === NONE ? null : employee.department_id,
          hire_date: employee.hire_date || null,
          regular_date: employee.regular_date || null,
          contract_end: employee.contract_end || null,
        });
    }
  };

  const submit = async () => {
    if (pending) return;
    const required = requiredNow();
    setMissing(required);
    if (required.length > 0) return;
    setFailure(null);
    try {
      await send();
      onOpenChange(false);
    } catch (error) {
      // The dialog stays open with its input: the row was not written, and the
      // reader needs to see it to fix it.
      setFailure(error instanceof Error ? error.message : "");
    }
  };

  const field = (key: RecordField, control: ReactNode, required = false) => (
    <Field id={`${id}-${key}`} label={label(key)} required={required}>
      {control}
    </Field>
  );

  const invalid = (key: RecordField) => missing.includes(key) || undefined;

  const controls = () => {
    switch (domain) {
      case "jobs":
        return (
          <>
            {field(
              "title",
              <Input
                id={`${id}-title`}
                value={job.title}
                aria-invalid={invalid("title")}
                onChange={(event) => setJob({ ...job, title: event.target.value })}
              />,
              true,
            )}
            {field(
              "department",
              <Picker
                id={`${id}-department`}
                value={job.department_id}
                options={departmentOptions}
                onChange={(value) => setJob({ ...job, department_id: value })}
              />,
            )}
            {field(
              "level",
              <Input
                id={`${id}-level`}
                value={job.level}
                onChange={(event) => setJob({ ...job, level: event.target.value })}
              />,
            )}
            {field(
              "headcount",
              <Input
                id={`${id}-headcount`}
                type="number"
                min={1}
                step={1}
                value={job.headcount}
                onChange={(event) => setJob({ ...job, headcount: event.target.value })}
              />,
            )}
            {field(
              "salary_min",
              <Input
                id={`${id}-salary_min`}
                type="number"
                inputMode="decimal"
                value={job.salary_min}
                onChange={(event) => setJob({ ...job, salary_min: event.target.value })}
              />,
            )}
            {field(
              "salary_max",
              <Input
                id={`${id}-salary_max`}
                type="number"
                inputMode="decimal"
                value={job.salary_max}
                onChange={(event) => setJob({ ...job, salary_max: event.target.value })}
              />,
            )}
            {field(
              "currency",
              <Picker
                id={`${id}-currency`}
                value={job.currency}
                options={currencyOptions}
                onChange={(value) => setJob({ ...job, currency: value })}
              />,
            )}
          </>
        );
      case "candidates":
        return (
          <>
            {field(
              "name",
              <Input
                id={`${id}-name`}
                value={candidate.name}
                aria-invalid={invalid("name")}
                onChange={(event) => setCandidate({ ...candidate, name: event.target.value })}
              />,
              true,
            )}
            {field(
              "job",
              <Picker
                id={`${id}-job`}
                value={candidate.job_id}
                options={jobOptions}
                invalid={invalid("job")}
                onChange={(value) => setCandidate({ ...candidate, job_id: value })}
              />,
              true,
            )}
            {field(
              "stage",
              <Picker
                id={`${id}-stage`}
                value={candidate.stage}
                options={stageOptions}
                onChange={(value) => setCandidate({ ...candidate, stage: value })}
              />,
            )}
            {field(
              "phone",
              <Input
                id={`${id}-phone`}
                value={candidate.phone}
                onChange={(event) => setCandidate({ ...candidate, phone: event.target.value })}
              />,
            )}
            {field(
              "email",
              <Input
                id={`${id}-email`}
                type="email"
                value={candidate.email}
                onChange={(event) => setCandidate({ ...candidate, email: event.target.value })}
              />,
            )}
            {field(
              "expected_salary",
              <Input
                id={`${id}-expected_salary`}
                type="number"
                inputMode="decimal"
                value={candidate.expected_salary}
                onChange={(event) =>
                  setCandidate({ ...candidate, expected_salary: event.target.value })
                }
              />,
            )}
          </>
        );
      case "interviews":
        return (
          <>
            {field(
              "candidate",
              <Picker
                id={`${id}-candidate`}
                value={interview.candidate_id}
                options={candidateOptions}
                invalid={invalid("candidate")}
                onChange={(value) => setInterview({ ...interview, candidate_id: value })}
              />,
              true,
            )}
            {field(
              "scheduled_at",
              <Input
                id={`${id}-scheduled_at`}
                type="datetime-local"
                value={interview.scheduled_at}
                aria-invalid={invalid("scheduled_at")}
                onChange={(event) =>
                  setInterview({ ...interview, scheduled_at: event.target.value })
                }
              />,
              true,
            )}
            {field(
              "round",
              <Input
                id={`${id}-round`}
                type="number"
                min={1}
                step={1}
                value={interview.round}
                onChange={(event) => setInterview({ ...interview, round: event.target.value })}
              />,
            )}
            {field(
              "interviewer",
              // The interviewer is recorded, not registered: they are a name on
              // the schedule, so a free-text field is the honest control. Linking
              // a member stays available through the API for internal panels.
              <Input
                id={`${id}-interviewer`}
                value={interview.interviewer_name}
                onChange={(event) =>
                  setInterview({ ...interview, interviewer_name: event.target.value })
                }
              />,
            )}
            {field(
              "mode",
              <Picker
                id={`${id}-mode`}
                value={interview.mode || NONE}
                options={modeOptions}
                onChange={(value) =>
                  setInterview({ ...interview, mode: value === NONE ? "" : value })
                }
              />,
            )}
            {field(
              "status",
              <Picker
                id={`${id}-status`}
                value={interview.status}
                options={statusOptions}
                onChange={(value) => setInterview({ ...interview, status: value })}
              />,
            )}
          </>
        );
      case "employees":
        return (
          <>
            {field(
              "member",
              <Picker
                id={`${id}-member`}
                value={employee.member_id}
                options={memberOptions}
                invalid={invalid("member")}
                onChange={(value) => setEmployee({ ...employee, member_id: value })}
              />,
              true,
            )}
            {field(
              "job_title",
              <Input
                id={`${id}-job_title`}
                value={employee.job_title}
                onChange={(event) =>
                  setEmployee({ ...employee, job_title: event.target.value })
                }
              />,
            )}
            {field(
              "grade",
              <Input
                id={`${id}-grade`}
                value={employee.grade}
                onChange={(event) => setEmployee({ ...employee, grade: event.target.value })}
              />,
            )}
            {field(
              "department",
              <Picker
                id={`${id}-department`}
                value={employee.department_id}
                options={departmentOptions}
                onChange={(value) => setEmployee({ ...employee, department_id: value })}
              />,
            )}
            {field(
              "hire_date",
              <Input
                id={`${id}-hire_date`}
                type="date"
                value={employee.hire_date}
                onChange={(event) => setEmployee({ ...employee, hire_date: event.target.value })}
              />,
            )}
            {field(
              "regular_date",
              <Input
                id={`${id}-regular_date`}
                type="date"
                value={employee.regular_date}
                onChange={(event) =>
                  setEmployee({ ...employee, regular_date: event.target.value })
                }
              />,
            )}
            {field(
              "contract_end",
              <Input
                id={`${id}-contract_end`}
                type="date"
                value={employee.contract_end}
                onChange={(event) =>
                  setEmployee({ ...employee, contract_end: event.target.value })
                }
              />,
            )}
          </>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.record.create[domain])}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3">{controls()}</div>
          {missing.length > 0 || failure !== null ? (
            <p role="alert" className="text-caption text-destructive">
              {missing.length > 0
                ? t(($) => $.record.error.required, {
                    fields: missing.map(label).join(", "),
                  })
                : t(($) => $.record.error.submit)}
              {failure ? (
                <span className="block break-words text-muted-foreground">{failure}</span>
              ) : null}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t(($) => $.record.action.close)}
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
              {pending ? <Spinner className="size-3.5" /> : null}
              {t(($) => $.record.action.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  required = false,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

/**
 * A select over ids. `items` is required by the primitive (it renders the raw
 * value otherwise), so the option list is the single source of both the menu and
 * the trigger's label.
 */
function Picker<T extends string>({
  id,
  value,
  options,
  invalid,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: string }[];
  invalid?: true;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next === null) return;
        onChange(next);
      }}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue>
          {() => options.find((option) => option.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A form field is a string until it is sent; an empty or unreadable one is
 *  the same "not given" the request type spells as `null`. */
function amount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
