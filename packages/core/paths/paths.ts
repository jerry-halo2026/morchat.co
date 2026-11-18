/**
 * Centralized URL path builder. All navigation in shared packages (packages/views)
 * MUST go through this module — no hardcoded string paths.
 *
 * Two kinds of paths:
 *  - workspace-scoped: paths.workspace(slug).xxx() — carry workspace in URL
 *  - global: paths.login(), paths.newWorkspace(), paths.invite(id) — pre-workspace routes
 *
 * Why pure functions + builder pattern:
 *  - Changing a route shape (e.g. adding workspace slug prefix) becomes a single-file edit
 *  - IDs are always URL-encoded here so callers can't forget
 *  - Zero runtime deps means this module is safe in Node (tests) and browsers
 */

import type { BossPageKey, ContentPageKey, HrPageKey, SalesPageKey } from "./route-icons";

const encode = (id: string) => encodeURIComponent(id);

/**
 * Encode a knowledge page path (a slash-separated tree path) for a URL or a
 * query string: one segment per part, so `a/b c` survives as `a/b%20c` rather
 * than collapsing into a single escaped slash.
 */
const encodePath = (path: string) =>
  path
    .split("/")
    .filter((part) => part.length > 0)
    .map(encode)
    .join("/");

/**
 * `?focus=` token that scrolls the agent's General settings to its
 * conversation-starters editor and flashes it. Lives here because it is URL
 * vocabulary: `agentConversationStarters()` writes it and the page reads it,
 * and a shared constant is what stops the two from drifting apart.
 */
export const AGENT_FOCUS_CONVERSATION_STARTERS = "conversation_starters";

/**
 * My agents' work is the My issues route with `?scope=agents`. It is URL
 * vocabulary rather than stored state so every tab and window keeps its own
 * — a Cmd-click opens it beside My issues, and one tab's switch leaves the
 * others alone.
 */
const MY_AGENTS_SCOPE = "agents";

/** Whether a My issues URL's search params open My agents' work. */
export function isMyAgentsSearch(searchParams: URLSearchParams): boolean {
  return searchParams.get("scope") === MY_AGENTS_SCOPE;
}

function workspaceScoped(slug: string) {
  const ws = `/${encode(slug)}`;
  return {
    // The workspace lands on the workbench, so `root` is the workbench: a
    // "back to the workspace" button that jumped to the issue list would undo
    // the default both the rail and the post-auth redirect follow.
    root: () => `${ws}/overview`,
    usage: () => `${ws}/usage`,
    // The workbench: one department's metrics, its ledgers and its team. It
    // owns its own rail space now; the Work panel is still its left column.
    overview: () => `${ws}/overview`,
    issues: () => `${ws}/issues`,
    issueDetail: (id: string) => `${ws}/issues/${encode(id)}`,
    // Opens the newest upload of the deliverable named `filename` on this
    // issue. Addresses the file by name, not by attachment id, so the link
    // keeps pointing at the latest version as new ones are uploaded.
    issueDeliverable: (id: string, filename: string) =>
      `${ws}/issues/${encode(id)}/deliverables/${encode(filename)}`,
    projects: () => `${ws}/projects`,
    projectDetail: (id: string) => `${ws}/projects/${encode(id)}`,
    autopilots: () => `${ws}/autopilots`,
    autopilotDetail: (id: string) => `${ws}/autopilots/${encode(id)}`,
    agents: () => `${ws}/agents`,
    // Step 1 of agent creation: choose where the agent runs.
    newAgent: () => `${ws}/agents/new`,
    // Step 2: configure the agent on the chosen runtime. A real route so a
    // half-filled form survives a refresh and can be linked to directly.
    newAgentManual: () => `${ws}/agents/new/manual`,
    // Step 3: the agent exists; offer its first uses.
    newAgentDone: (agentId: string) =>
      `${ws}/agents/new/done/${encode(agentId)}`,
    newAgentAi: () => `${ws}/agents/new/ai`,
    // One creation conversation. It is a durable object, not a step of the
    // route above: it survives leaving the studio and is resumed later, so it
    // owns an address instead of being a query param on the "start one" screen.
    newAgentAiSession: (sessionId: string) =>
      `${ws}/agents/new/ai/${encode(sessionId)}`,
    agentDetail: (id: string) => `${ws}/agents/${encode(id)}`,
    // Deep link behind "customize" in a chat's empty state: the agent's
    // General settings, scrolled to the conversation starters that produced
    // the buttons the viewer just looked at.
    agentConversationStarters: (id: string) =>
      `${ws}/agents/${encode(id)}?view=general&focus=${AGENT_FOCUS_CONVERSATION_STARTERS}`,
    memberDetail: (id: string) => `${ws}/members/${encode(id)}`,
    squads: () => `${ws}/squads`,
    squadDetail: (id: string) => `${ws}/squads/${encode(id)}`,
    inbox: () => `${ws}/inbox`,
    chat: () => `${ws}/chat`,
    chatWithAgent: (agentId: string) =>
      `${ws}/chat?agent=${encode(agentId)}`,
    chatSession: (sessionId: string) =>
      `${ws}/chat?session=${encode(sessionId)}`,
    myIssues: () => `${ws}/my-issues`,
    myAgents: () => `${ws}/my-issues?scope=${MY_AGENTS_SCOPE}`,
    views: () => `${ws}/views`,
    runtimes: () => `${ws}/runtimes`,
    runtimeDetail: (id: string) => `${ws}/runtimes/${encode(id)}`,
    runtimeSettings: (machineId: string, runtimeId: string) =>
      `${ws}/runtimes/${encode(machineId)}/runtime/${encode(runtimeId)}`,
    skills: () => `${ws}/skills`,
    skillDetail: (id: string) => `${ws}/skills/${encode(id)}`,
    // Preset gallery: the content repository's 39 ready-made agents/teams.
    presets: () => `${ws}/presets`,
    // Knowledge (the workspace wiki). A page's address is its space plus its
    // tree path, so both halves are encoded per segment and the path keeps its
    // slashes: /{slug}/knowledge/{space}/{a}/{b}. Editing is a query on that
    // same address, so the page keeps one identity across read and write.
    knowledge: () => `${ws}/knowledge`,
    knowledgeSpace: (space: string) => `${ws}/knowledge/${encode(space)}`,
    knowledgePage: (space: string, path: string) =>
      `${ws}/knowledge/${encode(space)}/${encodePath(path)}`,
    knowledgeEdit: (space: string, path: string) =>
      `${ws}/knowledge/${encode(space)}/${encodePath(path)}?mode=edit`,
    knowledgeItems: () => `${ws}/knowledge/items`,
    knowledgeRetrievalTest: () => `${ws}/knowledge/retrieval-test`,
    settings: () => `${ws}/settings`,
    attachmentPreview: (id: string) => `${ws}/attachments/${encode(id)}/preview`,
    // The HR space's nine pages. One route each rather than tabs on one page:
    // the space's left column lists them side by side, and a link has to name
    // the page it opens. `satisfies` keeps this object and `HR_PAGES` (which
    // owns the same nine segments, icons and labels) in lockstep — a page added
    // to one and not the other is a compile error, and `consistency.test.ts`
    // checks the segments agree.
    hr: {
      recruit: () => `${ws}/hr/recruit`,
      resumes: () => `${ws}/hr/resumes`,
      interviews: () => `${ws}/hr/interviews`,
      scores: () => `${ws}/hr/scores`,
      guide: () => `${ws}/hr/guide`,
      employees: () => `${ws}/hr/employees`,
      offboard: () => `${ws}/hr/offboard`,
      files: () => `${ws}/hr/files`,
      analysis: () => `${ws}/hr/analysis`,
    } satisfies Record<HrPageKey, () => string>,
    // The three department spaces beside HR. Same shape as `hr`: one builder
    // per registered page, `satisfies` keeping the object and the registry in
    // lockstep. Each space's landing page is the space root itself (`/sales`
    // is the cockpit), so no page is a bare segment of its own.
    sales: {
      dashboard: () => `${ws}/sales`,
      creators: () => `${ws}/sales/creators`,
      followups: () => `${ws}/sales/followups`,
      quotes: () => `${ws}/sales/quotes`,
      collabs: () => `${ws}/sales/collabs`,
      campaigns: () => `${ws}/sales/campaigns`,
      performance: () => `${ws}/sales/performance`,
    } satisfies Record<SalesPageKey, () => string>,
    content: {
      studio: () => `${ws}/content`,
      ips: () => `${ws}/content/ips`,
      hot: () => `${ws}/content/hot`,
      bench: () => `${ws}/content/bench`,
      topics: () => `${ws}/content/topics`,
      scripts: () => `${ws}/content/scripts`,
      shoots: () => `${ws}/content/shoots`,
      publish: () => `${ws}/content/publish`,
      ads: () => `${ws}/content/ads`,
      data: () => `${ws}/content/data`,
    } satisfies Record<ContentPageKey, () => string>,
    boss: {
      home: () => `${ws}/boss`,
      goals: () => `${ws}/boss/goals`,
      tasks: () => `${ws}/boss/tasks`,
      radar: () => `${ws}/boss/radar`,
      customers: () => `${ws}/boss/customers`,
      biz: () => `${ws}/boss/biz`,
      team: () => `${ws}/boss/team`,
    } satisfies Record<BossPageKey, () => string>,
  };
}

export const paths = {
  workspace: workspaceScoped,

  // Global (pre-workspace) routes
  login: () => "/login",
  newWorkspace: () => "/workspaces/new",
  invite: (id: string) => `/invite/${encode(id)}`,
  invitations: () => "/invitations",
  onboarding: () => "/onboarding",
  authCallback: () => "/auth/callback",
  root: () => "/",
};

export type WorkspacePaths = ReturnType<typeof workspaceScoped>;

// Prefixes — not slug names — because we match against full URL paths.
// A path is global if it equals or begins with any of these.
// Note: `/workspaces/` (trailing slash) is the prefix — `workspaces` is reserved,
// so any path starting with `/workspaces/...` is system-owned, not user-owned.
const GLOBAL_PREFIXES = ["/login", "/workspaces/", "/invite/", "/invitations", "/onboarding", "/auth/", "/logout", "/signup"];

export function isGlobalPath(path: string): boolean {
  return GLOBAL_PREFIXES.some((p) => path === p || path.startsWith(p));
}
