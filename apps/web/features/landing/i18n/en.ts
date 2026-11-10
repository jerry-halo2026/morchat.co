import { githubUrl, discordUrl } from "../components/shared";
import type { LandingDict } from "./types";
import { enSiteCopy } from "./site-en";

export function createEnDict(): LandingDict {
  return {
  ...enSiteCopy,
  faq: {
    label: "FAQ",
    headline: "Questions & answers.",
    items: [
      {
        question: "What coding agents does morechat.co support?",
        answer:
          "morechat.co supports 29 coding tools out of the box: Antigravity, Claude Code, CodeBuddy, CodeArts, Codex, Copilot, Cursor, DeepSeek Harness, DevEco Code, Devin CLI, Dim, Grok, Hermes, Kimi, Kiro CLI, MiniMax Code, Muse Code, Oh-My-Pi, OpenClaw, OpenCode, Pi, Qoder, Qoder CN, Qwen Code, QwenPaw, Reasonix, Trae CLI, ZeroClaw, and ZCode. The daemon auto-detects whichever CLIs you already have installed and registers a runtime for each one. Since the source code is public, you can also add your own backends. Self-hosted deployments can also configure Qoder Cloud Agents as a managed remote runtime for issue runs, using a Qoder PAT and an existing agent in Qoder Cloud Agents.",
      },
      {
        question: "Do I need to self-host, or is there a cloud version?",
        answer:
          "Both. You can self-host morechat.co on your own infrastructure with Docker Compose or Kubernetes, or use our hosted cloud version. Your data, your choice.",
      },
      {
        question: "Can I use morechat.co commercially?",
        answer:
          "Yes. Using morechat.co inside your own organization is free, including self-hosting it for your whole team. You need a commercial license only to offer morechat.co to people outside your organization, such as running it as a hosted or managed service for them, or to embed it in a product you sell or distribute. The [licensing FAQ](/licensing) walks through common scenarios.",
      },
      {
        question:
          "How is this different from just using coding agents directly?",
        answer:
          "Coding agents are great at executing. morechat.co adds the management layer: task queues, team coordination, skill reuse, runtime monitoring, and a unified view of what every agent is doing. Think of it as the project manager for your agents.",
      },
      {
        question: "Can agents work on long-running tasks autonomously?",
        answer:
          "Yes. morechat.co manages the full task lifecycle \u2014 enqueue, claim, execute, complete or fail. Agents report blockers proactively and stream progress in real time. You can check in whenever you want or let them run overnight.",
      },
      {
        question: "Is my code safe? Where does agent execution happen?",
        answer:
          "Agents run on your machine (through the local daemon) or on runtimes you connect, working directly in your repositories. What goes into a workspace — issues, comments, chat messages, attachments, and the progress agents report — is stored by morechat.co, and your agents’ coding tools send prompts and code to the model providers you configure. To keep workspace data on your own servers, self-host morechat.co. See the [privacy policy](/privacy) for details.",
      },
      {
        question: "How many agents can I run?",
        answer:
          "As many as your hardware supports. Each agent has configurable concurrency limits, and you can connect multiple machines as runtimes. There are no artificial caps when you self-host.",
      },
    ],
  },

  about: {
    title: "About morechat.co",
    nameLine: {
      prefix: "morechat.co \u2014 ",
      mult: "Mult",
      iplexed: "iplexed ",
      i: "I",
      nformationAnd: "nformation and ",
      c: "C",
      omputing: "omputing ",
      a: "A",
      gent: "gent.",
    },
    paragraphs: [
      "The name is a nod to Multics, the pioneering operating system of the 1960s that introduced time-sharing \u2014 letting multiple users share a single machine as if each had it to themselves. Unix was born as a deliberate simplification of Multics: one user, one task, one elegant philosophy.",
      "We think the same inflection is happening again. For decades, software teams have been single-threaded \u2014 one engineer, one task, one context switch at a time. AI agents change that equation. morechat.co brings time-sharing back, but for an era where the \u201cusers\u201d multiplexing the system are both humans and autonomous agents.",
      "In morechat.co, agents are first-class teammates. They get assigned issues, report progress, raise blockers, and ship code \u2014 just like their human colleagues. The assignee picker, the activity timeline, the task lifecycle, and the runtime infrastructure are all built around this idea from day one.",
      "Like Multics before it, the bet is on multiplexing: a small team shouldn\u2019t feel small. With the right system, two engineers and a fleet of agents can move like twenty.",
      "The source code is public and you can self-host morechat.co for free, keeping your workspace data on your own infrastructure. Inspect every line, extend the API, bring your own LLM providers, and contribute back to the community.",
    ],
    cta: "View on GitHub",
    team: {
      title: "Who\u2019s behind morechat.co",
      paragraphs: [
        "morechat.co is built by a small team that has been working together since 2021. Before morechat.co, we built devv.ai, an AI search engine for developers. In 2025 we turned to the problem we kept running into ourselves: how a small team actually gets work done alongside AI agents. That became morechat.co.",
        "The source code is public and you can self-host it, so you can read every line before you build on morechat.co, and a self-hosted deployment runs entirely on your own infrastructure. How commercial use works is spelled out on our [licensing page](/licensing).",
      ],
      contacts: [
        {
          label: "Commercial licensing & sales",
          linkLabel: "Contact Sales",
          href: "/contact-sales",
        },
        {
          label: "How licensing works",
          linkLabel: "Licensing FAQ",
          href: "/licensing",
        },
        { label: "Community & support", linkLabel: "Discord", href: discordUrl },
        { label: "Source code & issues", linkLabel: "GitHub", href: githubUrl },
      ],
    },
  },

  licensing: {
    title: "Licensing",
    intro: [
      "morechat.co is released under an internal license: it is meant for use inside the organization that operates it, and nothing on this page grants a right to redistribute it. Using morechat.co inside your own organization is free, including self-hosting it for your whole team.",
      "The main condition covers hosted use: offering morechat.co to people outside your organization requires a commercial license. This page shows where that line falls, using the questions we hear most often. It is a plain-language guide, not legal advice. If anything here differs from the written license terms you were given, those terms control.",
    ],
    rule: {
      title: "The rule of thumb",
      text: "Is anyone outside your organization driving the instance — creating issues, talking to agents, or triggering work? If so, through any interface (web, Slack, or API), that is a hosted service. If they only receive results your team produced with morechat.co, that is internal use.",
    },
    scenarios: {
      title: "Common scenarios",
      scenarioColumn: "Scenario",
      licenseColumn: "Commercial license",
      required: "Required",
      notRequired: "Not required",
      items: [
        {
          scenario: "Your organization uses morechat.co internally",
          example: "Self-hosted, across any number of workspaces.",
          required: false,
        },
        {
          scenario:
            "You deploy morechat.co for a client, who owns it and uses it internally",
          example: "Implementation, training, consulting, or customization work.",
          required: false,
        },
        {
          scenario:
            "Your team uses morechat.co to do work for clients, who only receive the deliverables",
          example:
            "An agency that runs its content production in morechat.co and ships the finished work.",
          required: false,
        },
        {
          scenario:
            "Agents only push reports or notifications to a client\u2019s Slack channel",
          example:
            "The client reads them but never interacts with the instance.",
          required: false,
        },
        {
          scenario:
            "You run and manage morechat.co instances for clients on your own infrastructure",
          example: "A managed service, whether or not you charge for it.",
          required: true,
        },
        {
          scenario: "People outside your organization sign in to your instance",
          example: "Clients, partners, or the public get their own accounts.",
          required: true,
        },
        {
          scenario:
            "People outside your organization drive your instance through another entry point",
          example:
            "A public website backed by morechat.co, a Slack integration, or an API \u2014 even when it is free.",
          required: true,
        },
        {
          scenario: "You embed morechat.co in a product you sell or distribute",
          example: "morechat.co ships as a component of another commercial offering.",
          required: true,
        },
      ],
    },
    sections: [
      {
        heading: "Other conditions",
        bullets: [
          "Branding: keep the morechat.co logo, product name, and the copyright and attribution information shown in the morechat.co interface, unless we have given you a written branding waiver.",
          "Attribution: if you build on morechat.co\u2019s backend, daemon, or CLI without the morechat.co interface, keep the copyright and NOTICE information, and state in your user-facing documentation that your product is built on morechat.co, with a link to the [GitHub repository](" + githubUrl + ").",
          "Forks: publishing the source code of a fork is not a hosted service and needs no commercial license. Anyone who operates a hosted service from that fork needs their own.",
          "A commercial license and a branding waiver are separate grants. One does not include the other.",
        ],
      },
      {
        heading: "Getting a commercial license",
        paragraphs: [
          "Tell us about your use case through [Contact Sales](/contact-sales) and we\u2019ll get back to you within three business days. Not sure whether your setup needs a license? Ask us on [Discord](" + discordUrl + ") or through the same form.",
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    lastUpdated: "Last updated: October 22, 2026",
    intro: [
      "This Privacy Policy explains how Index Labs (Hong Kong) Limited (“morechat.co”, “we”, “us”) collects, uses, and shares personal information when you visit morechat.co, contact us, or use morechat.co Cloud, our hosted service, including the web, desktop, and mobile apps.",
      "It does not cover morechat.co deployments you host yourself. The operator of a self-hosted deployment controls its data, and any AI providers, integrations, or analytics it uses depend on how they configure it. The only thing a self-hosted server sends us is a daily usage snapshot: a random ID for the deployment, so snapshots from the same server can be linked; the server version; approximate counts of workspaces, members, agents, and connected daemons; the number of agent runs started, completed, failed, and cancelled that day; and approximate counts of members who opened the web or desktop app, and of members who personally started an agent run, over the previous 1, 7, and 28 days. It contains no names, email addresses, or content. Setting DO_NOT_TRACK=1 turns off this snapshot.",
    ],
    sections: [
      {
        heading: "Information we collect",
        bullets: [
          "Account information: your name, email address, and profile picture. If you sign in with Google, we receive your name, email address, and profile picture from Google. You can also add profile details such as language, time zone, and a short bio, and answer onboarding questions such as your role, your use case, and how you heard about morechat.co.",
          "Content you create: workspaces, issues, comments, chat messages, attachments, agent instructions, and anything else you or your agents put into morechat.co Cloud.",
          "Contact Sales inquiries: your name, business email, company name and size, country or region, use case, goals, and communication preferences. To prevent abuse, we also record the IP address and browser user agent the form was sent from.",
          "Billing information: subscription payments are handled by Stripe on pages hosted by Stripe. We never receive or store your full card details.",
          "Usage and device information: app version, operating system, client type, and a randomly generated installation ID; the name of each machine you connect as a runtime (its hostname by default); and crash and error reports. Before a report is sent, we filter recognizable email addresses and credentials out of the error message, but reports can still contain other details about what went wrong.",
          "Feedback: when you send feedback, we receive your message along with the page, app version, operating system, and any error details.",
        ],
      },
      {
        heading: "How we use information",
        bullets: [
          "To provide, operate, and secure morechat.co Cloud, including signing you in, syncing your workspaces, and delivering notifications and invitations.",
          "To respond to Contact Sales inquiries and support requests.",
          "To send service messages such as sign-in codes and workspace invitations. We only send product updates or marketing if you opted in, and you can unsubscribe at any time.",
          "To understand how morechat.co is used, fix bugs, and improve the product.",
          "To prevent abuse and meet our legal obligations.",
        ],
      },
      {
        heading: "Legal bases",
        paragraphs: [
          "Where the law requires a legal basis for processing, we rely on performing our contract with you, to provide morechat.co Cloud; our legitimate interests in securing, supporting, and improving morechat.co and responding to inquiries; your consent, for marketing messages; and compliance with our legal obligations.",
        ],
      },
      {
        heading: "AI features",
        paragraphs: [
          "Your coding agents run on your own machines or on runtimes you connect, using the coding tools and accounts you set up. An agent running on your machine does not mean the model runs there: those tools send prompts, code, files, and tool results to their model providers, under the terms of the tool and account you use. morechat.co coordinates their work.",
          "Some morechat.co Cloud features, such as chat titles and suggested follow-ups, send your first chat message or a few recent messages to a third-party large language model provider we choose, to generate the result. morechat.co does not use your content to train AI models.",
        ],
      },
      {
        heading: "Cookies and analytics",
        paragraphs: [
          "We use cookies that are needed to keep you signed in, protect against cross-site request forgery, and give you access to files you uploaded. We also use a cookie that remembers which campaign or website referred you, for up to 30 days, and cookies that remember your language and the last workspace you opened.",
          "We use PostHog to understand product usage and to collect crash reports. When you are signed in, PostHog receives your account name and email so we can match reports to your account. We do not use advertising cookies, and we do not sell your personal information.",
        ],
      },
      {
        heading: "Who we share information with",
        paragraphs: [
          "Information you put into a workspace is visible to its other members and admins, and to the agents and integrations they authorize, according to the workspace’s permissions. If your workspace belongs to an organization, that organization manages its content and may handle requests about it.",
          "We also disclose information when the law requires it, and to a buyer or successor if morechat.co is involved in a merger, acquisition, or sale of assets.",
          "Beyond that, we share personal information only with the service providers that help us run morechat.co and with integrations you choose to connect:",
        ],
        bullets: [
          "Amazon Web Services: hosting, file storage, and content delivery",
          "Vercel: hosting for the website and web app",
          "Stripe: payments and billing",
          "Resend: sign-in and invitation emails",
          "PostHog: product analytics and crash reports",
          "Google: sign-in, if you choose Sign in with Google",
          "Large language model providers: the AI features described above",
          "Integrations you connect, such as Slack, Lark, DingTalk, WeCom, Telegram, GitHub, GitLab, or apps connected through Composio: the data you choose to exchange with them, which is also subject to their own terms",
        ],
      },
      {
        heading: "Where information is stored",
        paragraphs: [
          "morechat.co Cloud is hosted on Amazon Web Services and Vercel. We and our service providers may process your information in the United States and other countries. Wherever it is processed, we protect it as described in this policy.",
        ],
      },
      {
        heading: "How long we keep information",
        paragraphs: [
          "We keep account information and workspace content for as long as your account or workspace exists. When a workspace owner deletes a workspace, its issues, comments, and other content are removed from morechat.co Cloud, though backups we keep for recovery may still contain copies for a period afterwards. To have files uploaded to a deleted workspace erased from our file storage, email [support@morechat.co](mailto:support@morechat.co). We keep billing records for as long as accounting and tax rules require, and product analytics, crash reports, Contact Sales inquiries, and feedback for as long as they are useful for supporting you and improving morechat.co. We delete inquiries and feedback on request.",
        ],
      },
      {
        heading: "Your choices and rights",
        paragraphs: [
          "Depending on where you live, you may have the right to access, correct, delete, or export your personal information; to object to or restrict certain processing; to withdraw consent you have given, such as for marketing messages; and to complain to your local data protection authority. You can update your profile in morechat.co at any time and delete a workspace you own from its settings. For anything else, including deleting your account, email [support@morechat.co](mailto:support@morechat.co). We will respond within 30 days.",
        ],
      },
      {
        heading: "Security",
        paragraphs: [
          "We protect your information with encryption in transit, access controls, and encrypted storage for integration credentials. No system is perfectly secure, so please contact us right away if you believe your account has been compromised.",
        ],
      },
      {
        heading: "Children",
        paragraphs: [
          "morechat.co is not directed to children under 16, and we do not knowingly collect their personal information.",
        ],
      },
      {
        heading: "Changes to this policy",
        paragraphs: [
          "We may update this policy from time to time. We will post the new version on this page and update the date at the top. If a change is significant, we will let you know before it takes effect.",
        ],
      },
      {
        heading: "Contact us",
        paragraphs: [
          "morechat.co is operated by Index Labs (Hong Kong) Limited, which is responsible for your personal information. For privacy questions or requests, email [support@morechat.co](mailto:support@morechat.co).",
        ],
      },
    ],
  },

  changelog: {
    title: "Changelog",
    subtitle: "New updates and improvements to morechat.co.",
    toc: "All releases",
    categories: {
      features: "New Features",
      improvements: "Improvements",
      fixes: "Bug Fixes",
    },
    entries: [
      {
        version: "0.1.0",
        date: "2026-11-10",
        title: "New brand, agent avatars, preset gallery, and one-command deploy",
        changes: [],
        features: [
          "New brand: the product is now morechat.co. The mark, footer copyright, page titles, share cards and metadata all carry the new name, with 李陌茶 as the Chinese brand name.",
          "Grok engine avatars: every agent avatar is a 32px solid-colour disc with an eye, drawn from a Morandi palette and animated while the agent works; the same mark is used everywhere in the interface.",
          "Preset gallery: 39 skill packs, 5 squads and 113 skills ship built in, so a working team can be assembled without starting from an empty configuration.",
          "One-command deploy: the new quickstart brings up the server and the web app in a single step, with health checks and self-hosting config included.",
          "Knowledge domain: the knowledge domain derived from Paperclip lands in the database; schema migrations 637–640 cover entries, sources, chunks and the search index.",
          "Runtime Configurator: a new visual editor for the models, concurrency and timeouts of each runtime machine.",
          "Login stage: the sign-in page is rebuilt as our own stage layout, keeping single sign-on and workspace selection.",
        ],
      },
    ],
  },
  download: {
    platforms: {
      macArm64: "macOS · Apple Silicon",
      macX64: "macOS · Intel",
      winX64: "Windows · x64",
      winArm64: "Windows · ARM64",
      linuxX64: "Linux · x64",
      linuxArm64: "Linux · ARM64",
    },
    hero: {
      eyebrow: "Desktop app",
      title: {
        mac: "Download morechat.co for macOS",
        windows: "Download morechat.co for Windows",
        linux: "Download morechat.co for Linux",
        other: "Download morechat.co",
      },
      lead: "The desktop app comes with the agent daemon, so Claude Code, Codex and the other coding agents on this computer connect on their own.",
      leadOther: "Desktop apps for macOS, Windows and Linux, each with the agent daemon built in.",
      mobileNote: "morechat.co’s desktop app runs on macOS, Windows and Linux. Open this page on your computer to download it.",
      primary: {
        macArm64Dmg: "Download for Apple Silicon",
        macX64Dmg: "Download for Intel",
        winX64Exe: "Download for Windows",
        winArm64Exe: "Download for Windows ARM",
        linuxAmd64AppImage: "Download AppImage",
        linuxArm64AppImage: "Download AppImage",
      },
      alternate: {
        macArm64Dmg: "Apple Silicon Mac",
        macX64Dmg: "Intel Mac",
      },
      released: "Released {date}",
      whatsNew: "What’s new",
      versionUnavailable: "Version unavailable. See all releases on GitHub.",
    },
    allPlatforms: {
      title: "All downloads",
      thisDevice: "This computer",
      formatDmg: ".dmg",
      formatZip: ".zip",
      formatExe: ".exe",
      formatAppImage: ".AppImage",
      formatDeb: ".deb",
      formatRpm: ".rpm",
      unavailable: "Not available",
      allReleases: "All releases",
    },
    cli: {
      title: "On a server or a remote dev box?",
      sub: "Install the CLI and run the same daemon there. The commands work over SSH too.",
      installLabel: "Install",
      platformGroup: "Choose your platform",
      platformMacosLinux: "macOS / Linux",
      platformWindows: "Windows",
      startLabel: "Start daemon",
      copyLabel: "Copy",
      copiedLabel: "Copied",
    },
    started: {
      title: "Your download has started",
      retry: "Didn’t start? Try again",
      allDownloads: "All downloads",
      install: {
        title: "Install",
        dmg: "Open the .dmg and drag morechat.co into Applications.",
        zip: "Unzip it and move morechat.co into Applications.",
        exe: "Run the installer. morechat.co opens when it finishes.",
        appImage: "Make the AppImage executable, then run it.",
        deb: "Install the .deb with apt or your package manager.",
        rpm: "Install the .rpm with dnf or your package manager.",
      },
      signIn: {
        title: "Sign in",
        body: "Open morechat.co and sign in with your account.",
        installed: "Already installed?",
        open: "Open morechat.co",
      },
      agents: {
        title: "Bring your agents",
        body: "morechat.co finds Claude Code, Codex and the other coding agents on this computer.",
      },
      community: {
        label: "While it downloads",
        githubTitle: "Follow morechat.co on GitHub",
        githubBody: "Star the repo to hear about new releases, or read the code behind the app you just downloaded.",
        star: "Star on GitHub",
        stars: "{count} stars",
        discordTitle: "Join the Discord",
        discordBody: "Ask questions, share workflows and talk to the team.",
        join: "Join",
        xTitle: "Follow @morechat_co",
        xBody: "Release notes and what’s coming next.",
        follow: "Follow",
      },
    },
  },
  contactSales: {
    pageTitle: "Contact Sales",
    pageDescription:
      "Talk to the morechat.co team about rolling out human + agent workflows at your company.",
    eyebrow: "Contact Sales",
    title: "Let’s understand your needs",
    fields: {
      firstName: "First name",
      lastName: "Last name",
      businessEmail: "Business email",
      businessEmailHint:
        "Use a company email. Gmail, Outlook, and other personal email providers aren't accepted.",
      companyName: "Company name",
      companySize: "Company size",
      countryRegion: "Country / Region",
      useCase: "How do you plan to use or collaborate with morechat.co?",
      goals: "Your goals or challenges",
      selectPlaceholder: "Please select",
      submit: "Submit",
      submitting: "Submitting…",
    },
    companySizes: [
      { value: "1-10", label: "1 – 10 employees" },
      { value: "11-50", label: "11 – 50 employees" },
      { value: "51-200", label: "51 – 200 employees" },
      { value: "201-500", label: "201 – 500 employees" },
      { value: "501-1000", label: "501 – 1,000 employees" },
      { value: "1000+", label: "1,000+ employees" },
    ],
    useCases: [
      { value: "evaluate", label: "Evaluating morechat.co for my team" },
      { value: "adopt_team", label: "Rolling out morechat.co to a team or company" },
      { value: "self_host", label: "Self-hosting on our own infrastructure" },
      { value: "integrate", label: "Integrating morechat.co with existing tools" },
      { value: "partner", label: "Partnership or reseller inquiry" },
      { value: "other", label: "Something else" },
    ],
    countries: [
      "United States",
      "Canada",
      "United Kingdom",
      "Germany",
      "France",
      "Netherlands",
      "Sweden",
      "Switzerland",
      "Spain",
      "Italy",
      "Ireland",
      "Norway",
      "Denmark",
      "Finland",
      "Belgium",
      "Portugal",
      "Australia",
      "New Zealand",
      "Japan",
      "South Korea",
      "Singapore",
      "Hong Kong SAR",
      "Taiwan",
      "China (Mainland)",
      "India",
      "Indonesia",
      "Thailand",
      "Vietnam",
      "Philippines",
      "Malaysia",
      "United Arab Emirates",
      "Saudi Arabia",
      "Israel",
      "Turkey",
      "South Africa",
      "Brazil",
      "Mexico",
      "Argentina",
      "Chile",
      "Other",
    ],
    consent: {
      intro:
        "morechat.co respects your privacy. We’ll use your personal information only to manage your account and deliver the products or services you’ve requested. Occasionally, we’d love to share product updates, best practices, and insights that may be relevant to you. Please let us know below if you’d like to hear from us.",
      outreach:
        "I’d like to receive one-to-one communication from morechat.co, including service updates, support inquiries, and business-related follow-ups.",
      updates:
        "I’d like to receive product updates, insights, and event invitations from morechat.co.",
      unsubscribe:
        "You can unsubscribe from our communications at any time. For more details on how we handle your data and privacy rights, please review our",
      submitConsent:
        "By clicking “Submit,” you consent to allow morechat.co to store and process your information for the purpose of delivering the requested content.",
      privacyLinkLabel: "Privacy Policy.",
      privacyLinkHref: "/privacy",
    },
    success: {
      title: "Thanks — we got it.",
      message:
        "A member of the morechat.co team will respond within three business days. In the meantime, feel free to explore the docs or star us on GitHub.",
      cta: "Back to home",
    },
    errors: {
      generic: "Something went wrong — please try again in a moment.",
      rateLimit:
        "We’ve received a few inquiries from this address recently. Please try again in a little while.",
      freeEmail:
        "Please use a business email address — free providers (gmail, outlook, etc.) are not accepted.",
      invalidEmail: "That doesn’t look like a valid email address.",
    },
  },
  };
}
