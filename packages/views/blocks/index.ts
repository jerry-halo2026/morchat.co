/**
 * The workbench's building blocks.
 *
 * A block reads its data through `@morechat/core` query options, draws only what
 * the metric contract in `docs/METRICS.md` allows, and reports interaction
 * through a narrow event type rather than a store. The page in
 * `views/workbench` composes them.
 */
export { MetricRow } from "./metric-row";
export { GapCard } from "./gap-card";
export { TeamStrip, buildTeamGroups } from "./team-strip";
export type { TeamGroup, TeamStripEvent } from "./team-strip";
export { LedgerSection } from "./ledger-section";
export { LedgerTable } from "./ledger-table";
export type { LedgerTableProps } from "./ledger-table";
export { ImportSheet } from "./import-sheet";
export { ExportButton } from "./export-button";
export type { ExportButtonProps } from "./export-button";
export { exportCsv, exportFilename, toCsv } from "./export";
export type { ExportColumn, ExportOptions } from "./export";
export { HireDialog } from "./hire-dialog";
export type { HireDialogProps } from "./hire-dialog";
export { RecordSheet } from "./record-sheet";
export type { RecordField, RecordSheetProps, RecordTarget } from "./record-sheet";
export { CollabSheet } from "./collab-sheet";
export type { CollabSheetProps } from "./collab-sheet";
export { CreatorSheet, PublishDialog } from "./publish-dialog";
export type { CreatorSheetProps, PublishDialogProps } from "./publish-dialog";
export { RecordForm } from "./record-form";
export type { RecordFormProps } from "./record-form";
export { AffiliateForm } from "./affiliate-form";
export type { AffiliateField, AffiliateFormProps } from "./affiliate-form";
export { ResumeUpload, matchResumeFile } from "./resume-upload";
export type { ResumeCandidateRef, ResumeMatch, ResumeMatchState } from "./resume-upload";
export { AiDispatchButton } from "./ai-dispatch";
export type { AiDispatchButtonProps } from "./ai-dispatch";
export { MATCH_WEIGHTS, matchSignals, scoreCandidate } from "./match-score";
export type {
  MatchDimension,
  MatchReason,
  MatchReasonKey,
  MatchResult,
  MatchSignals,
} from "./match-score";
export {
  IMPORT_FIELDS,
  IMPORT_SAMPLE,
  buildImportRows,
  formatImportError,
  guessColumnMap,
  normalizeLabel,
  parseImportAmount,
  parseImportDay,
  parseImportError,
  parseImportNumber,
  parseTable,
} from "./import";
export type {
  ImportDomain,
  ImportErrorCode,
  ImportField,
  ImportRowContext,
  ImportRowResult,
  ParsedTable,
} from "./import";
export { LEDGER_DOMAINS, isLedgerDomain } from "./data";
export type { LedgerDomain, LedgerRowByDomain } from "./data";
export {
  AFFILIATE_LEDGER_DOMAINS,
  HR_LEDGER_DOMAINS,
  LEDGER_GROUPS,
  ledgerDomainsIn,
  ledgerGroup,
} from "./data";
export type {
  AffiliateLedgerDomain,
  HrCountField,
  HrLedgerDomain,
  LedgerGroup,
} from "./data";
export {
  HR_METRIC_IDS,
  OVERVIEW_METRIC_IDS,
  gapDomain,
  metricContract,
  metricDisplay,
  metricLabelKey,
  metricRenderState,
} from "./metrics";
export type { MetricDisplay, MetricRenderState } from "./metrics";
