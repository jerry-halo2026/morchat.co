/**
 * Workbench view selection: which slice of the 22 metrics and nine ledgers a
 * reader sees, and where their choice is remembered. See `./view`.
 */
export {
  WORKBENCH_VIEWS,
  defaultViewFor,
  isWorkbenchView,
  readViewPreference,
  viewGroups,
  viewMetricIds,
  viewPreferenceKey,
  writeViewPreference,
} from "./view";
export type { LedgerGroup, WorkbenchView } from "./view";
