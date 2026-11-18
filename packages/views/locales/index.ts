import type { LocaleResources, SupportedLocale } from "@morechat/core/i18n";
import enCommon from "./en/common.json";
import enAuth from "./en/auth.json";
import enSettings from "./en/settings.json";
import enIssues from "./en/issues.json";
import enAgents from "./en/agents.json";
import enEditor from "./en/editor.json";
import enOnboarding from "./en/onboarding.json";
import enInvite from "./en/invite.json";
import enLabels from "./en/labels.json";
import enMembers from "./en/members.json";
import enMyIssues from "./en/my-issues.json";
import enSearch from "./en/search.json";
import enInbox from "./en/inbox.json";
import enWorkspace from "./en/workspace.json";
import enProjects from "./en/projects.json";
import enAutopilots from "./en/autopilots.json";
import enSkills from "./en/skills.json";
import enChat from "./en/chat.json";
import enModals from "./en/modals.json";
import enRuntimes from "./en/runtimes.json";
import enLayout from "./en/layout.json";
import enUsage from "./en/usage.json";
import enUi from "./en/ui.json";
import enSquads from "./en/squads.json";
import enBilling from "./en/billing.json";
import enPresets from "./en/presets.json";
import enKnowledge from "./en/knowledge.json";
import enBlocks from "./en/blocks.json";
import enFinance from "./en/finance.json";
import enSales from "./en/sales.json";
import enContent from "./en/content.json";
import enProduction from "./en/production.json";
import enPublishing from "./en/publishing.json";
import enBoss from "./en/boss.json";
import enBiz from "./en/biz.json";
import enDiscovery from "./en/discovery.json";
import enPerformance from "./en/performance.json";
import enAds from "./en/ads.json";
import zhHansCommon from "./zh-Hans/common.json";
import zhHansAuth from "./zh-Hans/auth.json";
import zhHansSettings from "./zh-Hans/settings.json";
import zhHansIssues from "./zh-Hans/issues.json";
import zhHansAgents from "./zh-Hans/agents.json";
import zhHansEditor from "./zh-Hans/editor.json";
import zhHansOnboarding from "./zh-Hans/onboarding.json";
import zhHansInvite from "./zh-Hans/invite.json";
import zhHansLabels from "./zh-Hans/labels.json";
import zhHansMembers from "./zh-Hans/members.json";
import zhHansMyIssues from "./zh-Hans/my-issues.json";
import zhHansSearch from "./zh-Hans/search.json";
import zhHansInbox from "./zh-Hans/inbox.json";
import zhHansWorkspace from "./zh-Hans/workspace.json";
import zhHansProjects from "./zh-Hans/projects.json";
import zhHansAutopilots from "./zh-Hans/autopilots.json";
import zhHansSkills from "./zh-Hans/skills.json";
import zhHansChat from "./zh-Hans/chat.json";
import zhHansModals from "./zh-Hans/modals.json";
import zhHansRuntimes from "./zh-Hans/runtimes.json";
import zhHansLayout from "./zh-Hans/layout.json";
import zhHansUsage from "./zh-Hans/usage.json";
import zhHansUi from "./zh-Hans/ui.json";
import zhHansSquads from "./zh-Hans/squads.json";
import zhHansBilling from "./zh-Hans/billing.json";
import zhHansPresets from "./zh-Hans/presets.json";
import zhHansKnowledge from "./zh-Hans/knowledge.json";
import zhHansBlocks from "./zh-Hans/blocks.json";
import zhHansFinance from "./zh-Hans/finance.json";
import zhHansSales from "./zh-Hans/sales.json";
import zhHansContent from "./zh-Hans/content.json";
import zhHansProduction from "./zh-Hans/production.json";
import zhHansPublishing from "./zh-Hans/publishing.json";
import zhHansBoss from "./zh-Hans/boss.json";
import zhHansBiz from "./zh-Hans/biz.json";
import zhHansDiscovery from "./zh-Hans/discovery.json";
import zhHansPerformance from "./zh-Hans/performance.json";
import zhHansAds from "./zh-Hans/ads.json";
import zhHantCommon from "./zh-Hant/common.json";
import zhHantAuth from "./zh-Hant/auth.json";
import zhHantSettings from "./zh-Hant/settings.json";
import zhHantIssues from "./zh-Hant/issues.json";
import zhHantAgents from "./zh-Hant/agents.json";
import zhHantEditor from "./zh-Hant/editor.json";
import zhHantOnboarding from "./zh-Hant/onboarding.json";
import zhHantInvite from "./zh-Hant/invite.json";
import zhHantLabels from "./zh-Hant/labels.json";
import zhHantMembers from "./zh-Hant/members.json";
import zhHantMyIssues from "./zh-Hant/my-issues.json";
import zhHantSearch from "./zh-Hant/search.json";
import zhHantInbox from "./zh-Hant/inbox.json";
import zhHantWorkspace from "./zh-Hant/workspace.json";
import zhHantProjects from "./zh-Hant/projects.json";
import zhHantAutopilots from "./zh-Hant/autopilots.json";
import zhHantSkills from "./zh-Hant/skills.json";
import zhHantChat from "./zh-Hant/chat.json";
import zhHantModals from "./zh-Hant/modals.json";
import zhHantRuntimes from "./zh-Hant/runtimes.json";
import zhHantLayout from "./zh-Hant/layout.json";
import zhHantUsage from "./zh-Hant/usage.json";
import zhHantUi from "./zh-Hant/ui.json";
import zhHantSquads from "./zh-Hant/squads.json";
import zhHantBilling from "./zh-Hant/billing.json";
import zhHantPresets from "./zh-Hant/presets.json";
import zhHantKnowledge from "./zh-Hant/knowledge.json";
import zhHantBlocks from "./zh-Hant/blocks.json";
import zhHantFinance from "./zh-Hant/finance.json";
import zhHantSales from "./zh-Hant/sales.json";
import zhHantContent from "./zh-Hant/content.json";
import zhHantProduction from "./zh-Hant/production.json";
import zhHantPublishing from "./zh-Hant/publishing.json";
import zhHantBoss from "./zh-Hant/boss.json";
import zhHantBiz from "./zh-Hant/biz.json";
import zhHantDiscovery from "./zh-Hant/discovery.json";
import zhHantPerformance from "./zh-Hant/performance.json";
import zhHantAds from "./zh-Hant/ads.json";
import koCommon from "./ko/common.json";
import koAuth from "./ko/auth.json";
import koSettings from "./ko/settings.json";
import koIssues from "./ko/issues.json";
import koAgents from "./ko/agents.json";
import koEditor from "./ko/editor.json";
import koOnboarding from "./ko/onboarding.json";
import koInvite from "./ko/invite.json";
import koLabels from "./ko/labels.json";
import koMembers from "./ko/members.json";
import koMyIssues from "./ko/my-issues.json";
import koSearch from "./ko/search.json";
import koInbox from "./ko/inbox.json";
import koWorkspace from "./ko/workspace.json";
import koProjects from "./ko/projects.json";
import koAutopilots from "./ko/autopilots.json";
import koSkills from "./ko/skills.json";
import koChat from "./ko/chat.json";
import koModals from "./ko/modals.json";
import koRuntimes from "./ko/runtimes.json";
import koLayout from "./ko/layout.json";
import koUsage from "./ko/usage.json";
import koUi from "./ko/ui.json";
import koSquads from "./ko/squads.json";
import koBilling from "./ko/billing.json";
import koPresets from "./ko/presets.json";
import koKnowledge from "./ko/knowledge.json";
import koBlocks from "./ko/blocks.json";
import koFinance from "./ko/finance.json";
import koSales from "./ko/sales.json";
import koContent from "./ko/content.json";
import koProduction from "./ko/production.json";
import koPublishing from "./ko/publishing.json";
import koBoss from "./ko/boss.json";
import koBiz from "./ko/biz.json";
import koDiscovery from "./ko/discovery.json";
import koPerformance from "./ko/performance.json";
import koAds from "./ko/ads.json";
import jaCommon from "./ja/common.json";
import jaAuth from "./ja/auth.json";
import jaSettings from "./ja/settings.json";
import jaIssues from "./ja/issues.json";
import jaAgents from "./ja/agents.json";
import jaEditor from "./ja/editor.json";
import jaOnboarding from "./ja/onboarding.json";
import jaInvite from "./ja/invite.json";
import jaLabels from "./ja/labels.json";
import jaMembers from "./ja/members.json";
import jaMyIssues from "./ja/my-issues.json";
import jaSearch from "./ja/search.json";
import jaInbox from "./ja/inbox.json";
import jaWorkspace from "./ja/workspace.json";
import jaProjects from "./ja/projects.json";
import jaAutopilots from "./ja/autopilots.json";
import jaSkills from "./ja/skills.json";
import jaChat from "./ja/chat.json";
import jaModals from "./ja/modals.json";
import jaRuntimes from "./ja/runtimes.json";
import jaLayout from "./ja/layout.json";
import jaUsage from "./ja/usage.json";
import jaUi from "./ja/ui.json";
import jaSquads from "./ja/squads.json";
import jaBilling from "./ja/billing.json";
import jaPresets from "./ja/presets.json";
import jaKnowledge from "./ja/knowledge.json";
import jaBlocks from "./ja/blocks.json";
import jaFinance from "./ja/finance.json";
import jaSales from "./ja/sales.json";
import jaContent from "./ja/content.json";
import jaProduction from "./ja/production.json";
import jaPublishing from "./ja/publishing.json";
import jaBoss from "./ja/boss.json";
import jaBiz from "./ja/biz.json";
import jaDiscovery from "./ja/discovery.json";
import jaPerformance from "./ja/performance.json";
import jaAds from "./ja/ads.json";
import frCommon from "./fr/common.json";
import frAuth from "./fr/auth.json";
import frSettings from "./fr/settings.json";
import frIssues from "./fr/issues.json";
import frAgents from "./fr/agents.json";
import frEditor from "./fr/editor.json";
import frOnboarding from "./fr/onboarding.json";
import frInvite from "./fr/invite.json";
import frLabels from "./fr/labels.json";
import frMembers from "./fr/members.json";
import frMyIssues from "./fr/my-issues.json";
import frSearch from "./fr/search.json";
import frInbox from "./fr/inbox.json";
import frWorkspace from "./fr/workspace.json";
import frProjects from "./fr/projects.json";
import frAutopilots from "./fr/autopilots.json";
import frSkills from "./fr/skills.json";
import frChat from "./fr/chat.json";
import frModals from "./fr/modals.json";
import frRuntimes from "./fr/runtimes.json";
import frLayout from "./fr/layout.json";
import frUsage from "./fr/usage.json";
import frUi from "./fr/ui.json";
import frSquads from "./fr/squads.json";
import frBilling from "./fr/billing.json";
import frPresets from "./fr/presets.json";
import frKnowledge from "./fr/knowledge.json";
import frBlocks from "./fr/blocks.json";
import frFinance from "./fr/finance.json";
import frSales from "./fr/sales.json";
import frContent from "./fr/content.json";
import frProduction from "./fr/production.json";
import frPublishing from "./fr/publishing.json";
import frBoss from "./fr/boss.json";
import frBiz from "./fr/biz.json";
import frDiscovery from "./fr/discovery.json";
import frPerformance from "./fr/performance.json";
import frAds from "./fr/ads.json";
import esCommon from "./es/common.json";
import esAuth from "./es/auth.json";
import esSettings from "./es/settings.json";
import esIssues from "./es/issues.json";
import esAgents from "./es/agents.json";
import esEditor from "./es/editor.json";
import esOnboarding from "./es/onboarding.json";
import esInvite from "./es/invite.json";
import esLabels from "./es/labels.json";
import esMembers from "./es/members.json";
import esMyIssues from "./es/my-issues.json";
import esSearch from "./es/search.json";
import esInbox from "./es/inbox.json";
import esWorkspace from "./es/workspace.json";
import esProjects from "./es/projects.json";
import esAutopilots from "./es/autopilots.json";
import esSkills from "./es/skills.json";
import esChat from "./es/chat.json";
import esModals from "./es/modals.json";
import esRuntimes from "./es/runtimes.json";
import esLayout from "./es/layout.json";
import esUsage from "./es/usage.json";
import esUi from "./es/ui.json";
import esSquads from "./es/squads.json";
import esBilling from "./es/billing.json";
import esPresets from "./es/presets.json";
import esKnowledge from "./es/knowledge.json";
import esBlocks from "./es/blocks.json";
import esFinance from "./es/finance.json";
import esSales from "./es/sales.json";
import esContent from "./es/content.json";
import esProduction from "./es/production.json";
import esPublishing from "./es/publishing.json";
import esBoss from "./es/boss.json";
import esBiz from "./es/biz.json";
import esDiscovery from "./es/discovery.json";
import esPerformance from "./es/performance.json";
import esAds from "./es/ads.json";
import ruCommon from "./ru/common.json";
import ruAuth from "./ru/auth.json";
import ruSettings from "./ru/settings.json";
import ruIssues from "./ru/issues.json";
import ruAgents from "./ru/agents.json";
import ruEditor from "./ru/editor.json";
import ruOnboarding from "./ru/onboarding.json";
import ruInvite from "./ru/invite.json";
import ruLabels from "./ru/labels.json";
import ruMembers from "./ru/members.json";
import ruMyIssues from "./ru/my-issues.json";
import ruSearch from "./ru/search.json";
import ruInbox from "./ru/inbox.json";
import ruWorkspace from "./ru/workspace.json";
import ruProjects from "./ru/projects.json";
import ruAutopilots from "./ru/autopilots.json";
import ruSkills from "./ru/skills.json";
import ruChat from "./ru/chat.json";
import ruModals from "./ru/modals.json";
import ruRuntimes from "./ru/runtimes.json";
import ruLayout from "./ru/layout.json";
import ruUsage from "./ru/usage.json";
import ruUi from "./ru/ui.json";
import ruSquads from "./ru/squads.json";
import ruBilling from "./ru/billing.json";
import ruPresets from "./ru/presets.json";
import ruKnowledge from "./ru/knowledge.json";
import ruBlocks from "./ru/blocks.json";
import ruFinance from "./ru/finance.json";
import ruSales from "./ru/sales.json";
import ruContent from "./ru/content.json";
import ruProduction from "./ru/production.json";
import ruPublishing from "./ru/publishing.json";
import ruBoss from "./ru/boss.json";
import ruBiz from "./ru/biz.json";
import ruDiscovery from "./ru/discovery.json";
import ruPerformance from "./ru/performance.json";
import ruAds from "./ru/ads.json";

// Single source of truth for the resource bundle. Both apps (web layout +
// desktop App.tsx) import from here so adding a locale or namespace happens
// in exactly one place.
export const RESOURCES: Record<SupportedLocale, LocaleResources> = {
  en: {
    common: enCommon,
    auth: enAuth,
    settings: enSettings,
    issues: enIssues,
    agents: enAgents,
    editor: enEditor,
    onboarding: enOnboarding,
    invite: enInvite,
    labels: enLabels,
    members: enMembers,
    "my-issues": enMyIssues,
    search: enSearch,
    inbox: enInbox,
    workspace: enWorkspace,
    projects: enProjects,
    autopilots: enAutopilots,
    skills: enSkills,
    chat: enChat,
    modals: enModals,
    runtimes: enRuntimes,
    layout: enLayout,
    usage: enUsage,
    ui: enUi,
    squads: enSquads,
    billing: enBilling,
    presets: enPresets,
    knowledge: enKnowledge,
    blocks: enBlocks,
    finance: enFinance,
    sales: enSales,
    content: enContent,
    production: enProduction,
    publishing: enPublishing,
    boss: enBoss,
    biz: enBiz,
    discovery: enDiscovery,
    performance: enPerformance,
    ads: enAds,
  },
  "zh-Hans": {
    common: zhHansCommon,
    auth: zhHansAuth,
    settings: zhHansSettings,
    issues: zhHansIssues,
    agents: zhHansAgents,
    editor: zhHansEditor,
    onboarding: zhHansOnboarding,
    invite: zhHansInvite,
    labels: zhHansLabels,
    members: zhHansMembers,
    "my-issues": zhHansMyIssues,
    search: zhHansSearch,
    inbox: zhHansInbox,
    workspace: zhHansWorkspace,
    projects: zhHansProjects,
    autopilots: zhHansAutopilots,
    skills: zhHansSkills,
    chat: zhHansChat,
    modals: zhHansModals,
    runtimes: zhHansRuntimes,
    layout: zhHansLayout,
    usage: zhHansUsage,
    ui: zhHansUi,
    squads: zhHansSquads,
    billing: zhHansBilling,
    presets: zhHansPresets,
    knowledge: zhHansKnowledge,
    blocks: zhHansBlocks,
    finance: zhHansFinance,
    sales: zhHansSales,
    content: zhHansContent,
    production: zhHansProduction,
    publishing: zhHansPublishing,
    boss: zhHansBoss,
    biz: zhHansBiz,
    discovery: zhHansDiscovery,
    performance: zhHansPerformance,
    ads: zhHansAds,
  },
  "zh-Hant": {
    common: zhHantCommon,
    auth: zhHantAuth,
    settings: zhHantSettings,
    issues: zhHantIssues,
    agents: zhHantAgents,
    editor: zhHantEditor,
    onboarding: zhHantOnboarding,
    invite: zhHantInvite,
    labels: zhHantLabels,
    members: zhHantMembers,
    "my-issues": zhHantMyIssues,
    search: zhHantSearch,
    inbox: zhHantInbox,
    workspace: zhHantWorkspace,
    projects: zhHantProjects,
    autopilots: zhHantAutopilots,
    skills: zhHantSkills,
    chat: zhHantChat,
    modals: zhHantModals,
    runtimes: zhHantRuntimes,
    layout: zhHantLayout,
    usage: zhHantUsage,
    ui: zhHantUi,
    squads: zhHantSquads,
    billing: zhHantBilling,
    presets: zhHantPresets,
    knowledge: zhHantKnowledge,
    blocks: zhHantBlocks,
    finance: zhHantFinance,
    sales: zhHantSales,
    content: zhHantContent,
    production: zhHantProduction,
    publishing: zhHantPublishing,
    boss: zhHantBoss,
    biz: zhHantBiz,
    discovery: zhHantDiscovery,
    performance: zhHantPerformance,
    ads: zhHantAds,
  },
  ko: {
    common: koCommon,
    auth: koAuth,
    settings: koSettings,
    issues: koIssues,
    agents: koAgents,
    editor: koEditor,
    onboarding: koOnboarding,
    invite: koInvite,
    labels: koLabels,
    members: koMembers,
    "my-issues": koMyIssues,
    search: koSearch,
    inbox: koInbox,
    workspace: koWorkspace,
    projects: koProjects,
    autopilots: koAutopilots,
    skills: koSkills,
    chat: koChat,
    modals: koModals,
    runtimes: koRuntimes,
    layout: koLayout,
    usage: koUsage,
    ui: koUi,
    squads: koSquads,
    billing: koBilling,
    presets: koPresets,
    knowledge: koKnowledge,
    blocks: koBlocks,
    finance: koFinance,
    sales: koSales,
    content: koContent,
    production: koProduction,
    publishing: koPublishing,
    boss: koBoss,
    biz: koBiz,
    discovery: koDiscovery,
    performance: koPerformance,
    ads: koAds,
  },
  ja: {
    common: jaCommon,
    auth: jaAuth,
    settings: jaSettings,
    issues: jaIssues,
    agents: jaAgents,
    editor: jaEditor,
    onboarding: jaOnboarding,
    invite: jaInvite,
    labels: jaLabels,
    members: jaMembers,
    "my-issues": jaMyIssues,
    search: jaSearch,
    inbox: jaInbox,
    workspace: jaWorkspace,
    projects: jaProjects,
    autopilots: jaAutopilots,
    skills: jaSkills,
    chat: jaChat,
    modals: jaModals,
    runtimes: jaRuntimes,
    layout: jaLayout,
    usage: jaUsage,
    ui: jaUi,
    squads: jaSquads,
    billing: jaBilling,
    presets: jaPresets,
    knowledge: jaKnowledge,
    blocks: jaBlocks,
    finance: jaFinance,
    sales: jaSales,
    content: jaContent,
    production: jaProduction,
    publishing: jaPublishing,
    boss: jaBoss,
    biz: jaBiz,
    discovery: jaDiscovery,
    performance: jaPerformance,
    ads: jaAds,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    settings: frSettings,
    issues: frIssues,
    agents: frAgents,
    editor: frEditor,
    onboarding: frOnboarding,
    invite: frInvite,
    labels: frLabels,
    members: frMembers,
    "my-issues": frMyIssues,
    search: frSearch,
    inbox: frInbox,
    workspace: frWorkspace,
    projects: frProjects,
    autopilots: frAutopilots,
    skills: frSkills,
    chat: frChat,
    modals: frModals,
    runtimes: frRuntimes,
    layout: frLayout,
    usage: frUsage,
    ui: frUi,
    squads: frSquads,
    billing: frBilling,
    presets: frPresets,
    knowledge: frKnowledge,
    blocks: frBlocks,
    finance: frFinance,
    sales: frSales,
    content: frContent,
    production: frProduction,
    publishing: frPublishing,
    boss: frBoss,
    biz: frBiz,
    discovery: frDiscovery,
    performance: frPerformance,
    ads: frAds,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    settings: esSettings,
    issues: esIssues,
    agents: esAgents,
    editor: esEditor,
    onboarding: esOnboarding,
    invite: esInvite,
    labels: esLabels,
    members: esMembers,
    "my-issues": esMyIssues,
    search: esSearch,
    inbox: esInbox,
    workspace: esWorkspace,
    projects: esProjects,
    autopilots: esAutopilots,
    skills: esSkills,
    chat: esChat,
    modals: esModals,
    runtimes: esRuntimes,
    layout: esLayout,
    usage: esUsage,
    ui: esUi,
    squads: esSquads,
    billing: esBilling,
    presets: esPresets,
    knowledge: esKnowledge,
    blocks: esBlocks,
    finance: esFinance,
    sales: esSales,
    content: esContent,
    production: esProduction,
    publishing: esPublishing,
    boss: esBoss,
    biz: esBiz,
    discovery: esDiscovery,
    performance: esPerformance,
    ads: esAds,
  },
  ru: {
    common: ruCommon,
    auth: ruAuth,
    settings: ruSettings,
    issues: ruIssues,
    agents: ruAgents,
    editor: ruEditor,
    onboarding: ruOnboarding,
    invite: ruInvite,
    labels: ruLabels,
    members: ruMembers,
    "my-issues": ruMyIssues,
    search: ruSearch,
    inbox: ruInbox,
    workspace: ruWorkspace,
    projects: ruProjects,
    autopilots: ruAutopilots,
    skills: ruSkills,
    chat: ruChat,
    modals: ruModals,
    runtimes: ruRuntimes,
    layout: ruLayout,
    usage: ruUsage,
    ui: ruUi,
    squads: ruSquads,
    billing: ruBilling,
    presets: ruPresets,
    knowledge: ruKnowledge,
    blocks: ruBlocks,
    finance: ruFinance,
    sales: ruSales,
    content: ruContent,
    production: ruProduction,
    publishing: ruPublishing,
    boss: ruBoss,
    biz: ruBiz,
    discovery: ruDiscovery,
    performance: ruPerformance,
    ads: ruAds,
  },
};
