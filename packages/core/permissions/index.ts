/**
 * Public API for the permissions module.
 *
 * Exports only what the views currently consume. The full pure-rule set lives
 * in `./rules` and is available to tests and future surfaces directly. Adding
 * a new rule to the public API should follow the same minimum-surface pattern
 * — only export when there's a caller.
 */
export type {
  Decision,
  DecisionReason,
  PermissionContext,
} from "./types";

export { canAssignAgentToIssue, canEditAgent } from "./rules";

export {
  useAgentPermissions,
  useSkillPermissions,
} from "./use-resource-permissions";
export { useCurrentMember } from "./use-current-member";

// Product-layer capabilities (WORKBENCH-API §24). Separate from the platform resource
// permissions above: those answer "may this member edit this agent", these answer
// "may this employee change money". `useCapabilities` is the one hook a workbench
// page needs to hide an entry point it cannot use.
export {
  WORKBENCH_CAPABILITIES,
  useCapabilities,
  workbenchCapabilitiesOptions,
  workbenchCapabilityKeys,
} from "./workbench";
export type { WorkbenchCapabilities } from "./workbench";
