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
export {
  IMPORT_FIELDS,
  buildImportRows,
  formatImportError,
  guessColumnMap,
  parseImportAmount,
  parseImportDay,
  parseImportError,
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
  HR_LEDGER_DOMAINS,
  LEDGER_GROUPS,
  ledgerDomainsIn,
  ledgerGroup,
} from "./data";
export type { HrCountField, HrLedgerDomain, LedgerGroup } from "./data";
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
