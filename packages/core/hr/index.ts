export {
  hrKeys,
  hrCandidateDetailOptions,
  hrCandidateListOptions,
  hrEmployeeDetailOptions,
  hrEmployeeListOptions,
  hrInterviewDetailOptions,
  hrInterviewListOptions,
  hrJobDetailOptions,
  hrJobListOptions,
  hrScorecardListOptions,
  type HrResource,
} from "./queries";
export {
  useCreateHrCandidate,
  useCreateHrEmployee,
  useCreateHrInterview,
  useCreateHrJob,
  useCreateHrScorecard,
  useDeleteHrCandidate,
  useDeleteHrEmployee,
  useDeleteHrInterview,
  useDeleteHrJob,
  useDeleteHrScorecard,
  useHireHrCandidate,
  useUpdateHrCandidate,
  useUpdateHrEmployee,
  useUpdateHrInterview,
  useUpdateHrJob,
  useUpdateHrScorecard,
} from "./mutations";
// Offboarding (docs/engineering/WORKBENCH-API.md §15) lives in its own module
// rather than in queries.ts / mutations.ts: the record is a state machine, and
// every write also invalidates the employee files its `done` step writes to.
export {
  offboardKeys,
  hrOffboardingDetailOptions,
  hrOffboardingListOptions,
  useAdvanceHrOffboarding,
  useAppendHrOffboardingHandoverItem,
  useCancelHrOffboarding,
  useCreateHrOffboarding,
  useDeleteHrOffboarding,
  useDeleteHrOffboardingHandoverItem,
  useUpdateHrOffboarding,
  useUpdateHrOffboardingHandoverItem,
} from "./offboard";
