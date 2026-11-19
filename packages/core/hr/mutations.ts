import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { hrKeys, type HrResource } from "./queries";
import type {
  CreateHrCandidateRequest,
  CreateHrEmployeeProfileRequest,
  CreateHrInterviewRequest,
  CreateHrJobRequest,
  CreateHrScorecardRequest,
  HireHrCandidateRequest,
  UpdateHrCandidateRequest,
  UpdateHrEmployeeProfileRequest,
  UpdateHrInterviewRequest,
  UpdateHrJobRequest,
  UpdateHrScorecardRequest,
} from "../types/workbench";

/**
 * HR mutations (job → candidate → interview → scorecard, plus employee files).
 *
 * No optimistic row writes, for the reason the ledgers already state: these rows
 * carry server-decided fields a client cannot predict — `hired_at` and the
 * employee profile the hire writes, `rescheduled_count` on a moved interview,
 * the weighted score and verdict resolution, stage timestamps — so a predicted
 * row would be a guess to reconcile. The lists are small and re-read fast.
 *
 * Every write invalidates its own resource prefix plus `["workbench", wsId]`,
 * which covers `/overview` and `/counts`: all four HR metrics
 * (`hr.candidates.active`, `hr.time_to_hire.median`, `hr.scorecard.backlog`,
 * `hr.interview.on_time_rate`) are computed from these tables, so any row write
 * can move at least one of them.
 */
function useInvalidateHr() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return (resource?: HrResource) => {
    void qc.invalidateQueries({
      queryKey: resource ? hrKeys.resource(wsId, resource) : hrKeys.all(wsId),
    });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateHrJob() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (data: CreateHrJobRequest) => api.createHrJob(data),
    onSuccess: () => invalidate("jobs"),
  });
}

export function useUpdateHrJob() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrJobRequest) => api.updateHrJob(id, data),
    onSuccess: () => invalidate("jobs"),
  });
}

/** Soft delete. The job's candidates stay (no cascades, §10.2). */
export function useDeleteHrJob() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrJob(id),
    onSuccess: () => invalidate("jobs"),
  });
}

export function useCreateHrCandidate() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (data: CreateHrCandidateRequest) => api.createHrCandidate(data),
    onSuccess: () => invalidate("candidates"),
  });
}

/** A stage move is an ordinary PATCH; the server sends
 *  `hr_candidate:stage_changed` alongside `hr_candidate:changed`. */
export function useUpdateHrCandidate() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrCandidateRequest) =>
      api.updateHrCandidate(id, data),
    onSuccess: () => invalidate("candidates"),
  });
}

export function useDeleteHrCandidate() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrCandidate(id),
    onSuccess: () => invalidate("candidates"),
  });
}

/**
 * The hire transition writes two tables in one transaction (§10.3): the
 * candidate becomes `hired` and its employee profile is created or updated. Both
 * prefixes are invalidated — refreshing only the candidate would leave the
 * employee list showing a member who is not there yet.
 */
export function useHireHrCandidate() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ candidateId, ...data }: { candidateId: string } & HireHrCandidateRequest) =>
      api.hireHrCandidate(candidateId, data),
    onSuccess: () => {
      invalidate("candidates");
      invalidate("employees");
    },
  });
}

export function useCreateHrInterview() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (data: CreateHrInterviewRequest) => api.createHrInterview(data),
    onSuccess: () => invalidate("interviews"),
  });
}

/**
 * Scheduling is exclusive per interviewer and slot (§10.3): a collision answers
 * 409, and the mutation surfaces that error rather than retrying. Moving
 * `scheduled_at` bumps `rescheduled_count` server-side.
 */
export function useUpdateHrInterview() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrInterviewRequest) =>
      api.updateHrInterview(id, data),
    onSuccess: () => invalidate("interviews"),
  });
}

export function useDeleteHrInterview() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrInterview(id),
    onSuccess: () => invalidate("interviews"),
  });
}

/** A saved scorecard also resolves `hr.scorecard.backlog`. */
export function useCreateHrScorecard() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (data: CreateHrScorecardRequest) => api.createHrScorecard(data),
    onSuccess: () => invalidate("scorecards"),
  });
}

export function useUpdateHrScorecard() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrScorecardRequest) =>
      api.updateHrScorecard(id, data),
    onSuccess: () => invalidate("scorecards"),
  });
}

export function useDeleteHrScorecard() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrScorecard(id),
    onSuccess: () => invalidate("scorecards"),
  });
}

export function useCreateHrEmployee() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (data: CreateHrEmployeeProfileRequest) => api.createHrEmployee(data),
    onSuccess: () => invalidate("employees"),
  });
}

export function useUpdateHrEmployee() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrEmployeeProfileRequest) =>
      api.updateHrEmployee(id, data),
    onSuccess: () => invalidate("employees"),
  });
}

export function useDeleteHrEmployee() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrEmployee(id),
    onSuccess: () => invalidate("employees"),
  });
}
