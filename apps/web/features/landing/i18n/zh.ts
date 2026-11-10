import { githubUrl, discordUrl } from "../components/shared";
import type { LandingDict } from "./types";
import { zhSiteCopy } from "./site-zh";

export function createZhDict(): LandingDict {
  return {
  ...zhSiteCopy,
  faq: {
    label: "\u5e38\u89c1\u95ee\u9898",
    headline: "\u95ee\u4e0e\u7b54\u3002",
    items: [
      {
        question: "morechat.co \u652f\u6301\u54ea\u4e9b\u7f16\u7801 智能体\uff1f",
        answer:
          "morechat.co \u5f00\u7bb1\u5373\u7528\u652f\u6301 29 \u6b3e AI \u7f16\u7a0b\u5de5\u5177\uff1aAntigravity\u3001Claude Code\u3001CodeBuddy\u3001CodeArts\u3001Codex\u3001Copilot\u3001Cursor\u3001DeepSeek Harness\u3001DevEco Code\u3001Devin CLI\u3001Dim\u3001Grok\u3001Hermes\u3001Kimi\u3001Kiro CLI\u3001MiniMax Code\u3001Muse Code\u3001Oh-My-Pi\u3001OpenClaw\u3001OpenCode\u3001Pi\u3001Qoder\u3001Qoder CN\u3001Qwen Code\u3001QwenPaw\u3001Reasonix\u3001Trae CLI\u3001ZeroClaw、ZCode\u3002\u5b88\u62a4\u8fdb\u7a0b\u4f1a\u81ea\u52a8\u68c0\u6d4b\u672c\u673a\u5df2\u5b89\u88c5\u7684 CLI \u5e76\u4e3a\u6bcf\u6b3e\u6ce8\u518c\u4e00\u4e2a\u8fd0\u884c\u65f6\u3002因为源码公开，你也可以自己添加后端。 自托管部署还可以使用 Qoder PAT 和 Qoder Cloud Agents 中已有的智能体，将 Qoder Cloud Agents 配置为执行任务的托管远端运行时。",
      },
      {
        question: "\u9700\u8981\u81ea\u6258\u7ba1\u5417\uff0c\u8fd8\u662f\u6709\u4e91\u7248\u672c\uff1f",
        answer:
          "\u4e24\u8005\u90fd\u6709\u3002\u4f60\u53ef\u4ee5\u7528 Docker Compose \u6216 Kubernetes \u5728\u81ea\u5df1\u7684\u57fa\u7840\u8bbe\u65bd\u4e0a\u81ea\u6258\u7ba1 morechat.co\uff0c\u4e5f\u53ef\u4ee5\u4f7f\u7528\u6211\u4eec\u7684\u6258\u7ba1\u4e91\u7248\u672c\u3002你的数据，你选择。",
      },
      {
        question: "可以商用吗？",
        answer:
          "可以。在你自己的组织内部使用 morechat.co 是免费的，包括为整个团队自托管。只有两种情况需要商业授权：把 morechat.co 提供给组织外部的人使用（比如作为托管服务或代运维服务），或者把它嵌入你销售或分发的产品中。常见场景见[授权说明](/licensing)。",
      },
      {
        question:
          "\u8fd9\u548c\u76f4\u63a5\u7528\u7f16\u7801 智能体 \u6709\u4ec0\u4e48\u533a\u522b\uff1f",
        answer:
          "\u7f16\u7801 智能体 \u64c5\u957f\u6267\u884c\u3002morechat.co \u6dfb\u52a0\u7684\u662f\u7ba1\u7406\u5c42\uff1a\u4efb\u52a1\u961f\u5217\u3001\u56e2\u961f\u534f\u4f5c\u3001\u6280\u80fd\u590d\u7528\u3001\u8fd0\u884c\u65f6\u76d1\u63a7\uff0c\u4ee5\u53ca\u6bcf\u4e2a 智能体 \u5728\u505a\u4ec0\u4e48\u7684\u7edf\u4e00\u89c6\u56fe\u3002\u628a\u5b83\u60f3\u8c61\u6210\u4f60\u7684 智能体 \u7684\u9879\u76ee\u7ecf\u7406\u3002",
      },
      {
        question: "智能体 \u80fd\u81ea\u4e3b\u5904\u7406\u957f\u65f6\u95f4\u4efb\u52a1\u5417\uff1f",
        answer:
          "\u53ef\u4ee5\u3002morechat.co \u7ba1\u7406\u5b8c\u6574\u7684\u4efb\u52a1\u751f\u547d\u5468\u671f\u2014\u2014\u5165\u961f\u3001\u9886\u53d6\u3001\u6267\u884c\u3001\u5b8c\u6210\u6216\u5931\u8d25\u3002智能体 \u4e3b\u52a8\u62a5\u544a\u963b\u585e\u5e76\u5b9e\u65f6\u63a8\u9001\u8fdb\u5ea6\u3002\u4f60\u53ef\u4ee5\u968f\u65f6\u67e5\u770b\uff0c\u4e5f\u53ef\u4ee5\u8ba9\u5b83\u4eec\u8fd0\u884c\u6574\u665a\u3002",
      },
      {
        question: "\u6211\u7684\u4ee3\u7801\u5b89\u5168\u5417\uff1f智能体 \u5728\u54ea\u91cc\u6267\u884c\uff1f",
        answer:
          "智能体在你的机器（通过本地守护进程）或你连接的运行时上运行，直接在你的代码仓库里工作。工作区里的内容——任务、评论、聊天消息、附件，以及智能体上报的进度——由 morechat.co 存储；智能体所用的编码工具会把提示词和代码发送给你配置的模型服务商。想让工作区数据留在自己的服务器上，可以自托管 morechat.co。详见[隐私政策](/privacy)。",
      },
      {
        question: "\u6211\u53ef\u4ee5\u8fd0\u884c\u591a\u5c11\u4e2a 智能体\uff1f",
        answer:
          "\u53d6\u51b3\u4e8e\u4f60\u7684\u786c\u4ef6\u3002\u6bcf\u4e2a 智能体 \u6709\u53ef\u914d\u7f6e\u7684\u5e76\u53d1\u9650\u5236\uff0c\u4f60\u53ef\u4ee5\u8fde\u63a5\u591a\u53f0\u673a\u5668\u4f5c\u4e3a\u8fd0\u884c\u65f6\u3002自托管时没有任何人为限制。",
      },
    ],
  },

  about: {
    title: "\u5173\u4e8e morechat.co",
    nameLine: {
      prefix: "morechat.co\u2014\u2014",
      mult: "Mult",
      iplexed: "iplexed ",
      i: "I",
      nformationAnd: "nformation and ",
      c: "C",
      omputing: "omputing ",
      a: "A",
      gent: "gent\u3002",
    },
    paragraphs: [
      "\u8fd9\u4e2a\u540d\u5b57\u662f\u5728\u5411 20 \u4e16\u7eaa 60 \u5e74\u4ee3\u5177\u6709\u5f00\u521b\u610f\u4e49\u7684\u64cd\u4f5c\u7cfb\u7edf Multics \u81f4\u610f\u3002Multics \u9996\u521b\u4e86\u5206\u65f6\u7cfb\u7edf\uff0c\u8ba9\u591a\u4e2a\u7528\u6237\u80fd\u591f\u5171\u4eab\u540c\u4e00\u53f0\u673a\u5668\uff0c\u540c\u65f6\u53c8\u50cf\u5404\u81ea\u72ec\u5360\u5b83\u4e00\u6837\u4f7f\u7528\u3002Unix \u5219\u662f\u5728\u6709\u610f\u7b80\u5316 Multics \u7684\u57fa\u7840\u4e0a\u8bde\u751f\u7684\uff0c\u5f3a\u8c03\u4e00\u4e2a\u7528\u6237\u3001\u4e00\u4e2a\u4efb\u52a1\u3001\u4e00\u79cd\u4f18\u96c5\u7684\u54f2\u5b66\u3002",
      "\u6211\u4eec\u8ba4\u4e3a\uff0c\u7c7b\u4f3c\u7684\u8f6c\u6298\u70b9\u6b63\u5728\u518d\u6b21\u51fa\u73b0\u3002\u51e0\u5341\u5e74\u6765\uff0c\u8f6f\u4ef6\u56e2\u961f\u4e00\u76f4\u5904\u4e8e\u4e00\u79cd\u5355\u7ebf\u7a0b\u7684\u5de5\u4f5c\u6a21\u5f0f\uff0c\u4e00\u4e2a\u5de5\u7a0b\u5e08\u5904\u7406\u4e00\u4e2a\u4efb\u52a1\uff0c\u4e00\u6b21\u53ea\u4e13\u6ce8\u4e8e\u4e00\u4e2a\u4e0a\u4e0b\u6587\u3002AI agents \u6539\u53d8\u4e86\u8fd9\u4e2a\u7b49\u5f0f\u3002morechat.co \u5c06\u201c\u5206\u65f6\u201d\u91cd\u65b0\u5e26\u56de\u8fd9\u4e2a\u65f6\u4ee3\uff0c\u53ea\u4e0d\u8fc7\u4eca\u5929\u5728\u7cfb\u7edf\u4e2d\u8fdb\u884c\u591a\u8def\u590d\u7528\u7684\u201c\u7528\u6237\u201d\uff0c\u65e2\u5305\u62ec\u4eba\u7c7b\uff0c\u4e5f\u5305\u62ec\u81ea\u4e3b\u4ee3\u7406\u3002",
      "在 morechat.co 中，agents 是一级团队成员。它们会被分配任务，汇报进展，提出阻塞，并交付代码，就像人类同事一样。任务分配、活动时间线、task 生命周期，以及运行时基础设施，morechat.co 从第一天起就是围绕这一理念构建的。",
      "\u548c\u5f53\u5e74\u7684 Multics \u4e00\u6837\uff0c\u8fd9\u4e00\u5224\u65ad\u5efa\u7acb\u5728\u201c\u591a\u8def\u590d\u7528\u201d\u4e4b\u4e0a\u3002\u4e00\u4e2a\u5c0f\u56e2\u961f\u4e0d\u8be5\u56e0\u4e3a\u4eba\u6570\u5c11\u5c31\u663e\u5f97\u80fd\u529b\u6709\u9650\u3002\u6709\u4e86\u5408\u9002\u7684\u7cfb\u7edf\uff0c\u4e24\u540d\u5de5\u7a0b\u5e08\u52a0\u4e0a\u4e00\u7ec4 agents\uff0c\u5c31\u80fd\u53d1\u6325\u51fa\u4e8c\u5341\u4eba\u56e2\u961f\u7684\u63a8\u8fdb\u901f\u5ea6\u3002",
      "morechat.co 的源代码公开，并且可以免费自托管，工作区数据始终保存在你自己的基础设施中。\u4f60\u53ef\u4ee5\u5ba1\u67e5\u6bcf\u4e00\u884c\u4ee3\u7801\uff0c\u6269\u5c55 API\uff0c\u63a5\u5165\u81ea\u5df1\u7684 LLM providers\uff0c\u4e5f\u53ef\u4ee5\u5411\u793e\u533a\u8d21\u732e\u4ee3\u7801\u3002",
    ],
    cta: "在 GitHub 上查看",
    team: {
      title: "morechat.co 背后的团队",
      paragraphs: [
        "morechat.co 由一支从 2021 年起就一起工作的小团队打造。在 morechat.co 之前，我们做过面向开发者的 AI 搜索引擎 devv.ai。2025 年，我们开始解决自己反复遇到的问题：一个小团队到底该怎样和 AI 智能体一起把事情做完。这就是 morechat.co。",
        "morechat.co 的源代码公开，也可以自托管：在基于它构建之前，你可以读完每一行代码；自托管的部署完全运行在你自己的基础设施上。商业使用的规则，我们在[授权说明](/licensing)里写清楚了。",
      ],
      contacts: [
        { label: "商业授权与合作", linkLabel: "联系商务", href: "https://wcnb2ddshm1z.feishu.cn/wiki/PlGcw8kUyidnOakv9e7ccvDanfc?from=from_copylink" },
        { label: "授权规则", linkLabel: "授权说明", href: "/licensing" },
        { label: "社区与支持", linkLabel: "Discord", href: discordUrl },
        { label: "源代码与问题反馈", linkLabel: "GitHub", href: githubUrl },
      ],
    },
  },

  licensing: {
    title: "授权说明",
    intro: [
      "morechat.co 采用 [morechat.co License](https://github.com/jerry-halo2026/morchat.co/blob/main/LICENSE) 发布：在 Apache License 2.0 的基础上附加了几项条件。源代码公开，在你自己的组织内部使用 morechat.co 是免费的，包括为整个团队自托管。",
      "最主要的附加条件针对托管使用：把 morechat.co 提供给组织外部的人使用，需要商业授权。这一页用大家最常问的问题，说明这条线划在哪里。这是一份通俗说明，不构成法律意见；如与 LICENSE 原文不一致，以 LICENSE 为准。",
    ],
    rule: {
      title: "一条判断标准",
      text: "看组织外部的人有没有在驱动这个实例——创建任务、和智能体对话、触发工作。只要有，不管通过什么界面（Web、Slack 还是 API），都算托管服务；如果他们只是收到你的团队用 morechat.co 做出来的成果，就属于内部使用。",
    },
    scenarios: {
      title: "常见场景",
      scenarioColumn: "场景",
      licenseColumn: "商业授权",
      required: "需要",
      notRequired: "不需要",
      items: [
        {
          scenario: "你的组织内部使用 morechat.co",
          example: "自托管，不限工作区数量。",
          required: false,
        },
        {
          scenario: "你帮客户部署 morechat.co，由客户自己拥有、在其组织内部使用",
          example: "实施、培训、咨询或定制开发。",
          required: false,
        },
        {
          scenario: "你的团队用 morechat.co 为客户干活，客户只收到交付物",
          example: "例如 agency 在 morechat.co 里管理内容生产，向客户交付成品。",
          required: false,
        },
        {
          scenario: "智能体只向客户的 Slack 频道单向推送报告或通知",
          example: "客户只看消息，不与实例做任何交互。",
          required: false,
        },
        {
          scenario: "你在自己的基础设施上替客户运行和管理 morechat.co 实例",
          example: "即代运维服务（managed service），无论是否收费。",
          required: true,
        },
        {
          scenario: "组织外部的人登录你的实例",
          example: "客户、合作伙伴或公众拥有自己的账号。",
          required: true,
        },
        {
          scenario: "组织外部的人通过其他入口驱动你的实例",
          example: "例如接入 morechat.co 后端的公开网站、Slack 集成或 API，免费提供也一样。",
          required: true,
        },
        {
          scenario: "你把 morechat.co 嵌入到你销售或分发的产品中",
          example: "morechat.co 作为另一个商业产品的组件一起交付。",
          required: true,
        },
      ],
    },
    sections: [
      {
        heading: "其他条件",
        bullets: [
          "品牌：除非获得我们的书面品牌豁免，请保留 morechat.co 界面中显示的 morechat.co Logo、产品名称以及版权和署名信息。",
          "署名：如果你只基于 morechat.co 的后端、守护进程或 CLI 构建产品、不使用 morechat.co 界面，需要保留版权和 NOTICE 信息，并在面向用户的文档中注明产品基于 morechat.co 构建，附上 [GitHub 仓库](https://github.com/jerry-halo2026/morchat.co)链接。",
          "Fork：公开发布 fork 的源代码不算托管服务，不需要商业授权。但任何用这个 fork 运营托管服务的人，都需要各自获得商业授权。",
          "商业授权和品牌豁免是两项独立的授权，获得其中一项不代表获得另一项。",
        ],
      },
      {
        heading: "获取商业授权",
        paragraphs: [
          "通过[联系商务](https://wcnb2ddshm1z.feishu.cn/wiki/PlGcw8kUyidnOakv9e7ccvDanfc?from=from_copylink)告诉我们你的使用场景，我们会在三个工作日内回复。不确定自己的情况是否需要授权？可以在 [Discord](" + discordUrl + ") 上问我们，也可以通过同一个表单咨询。",
        ],
      },
    ],
  },

  privacy: {
    title: "隐私政策",
    lastUpdated: "最后更新：2026 年 10 月 22 日",
    intro: [
      "本隐私政策说明 Index Labs (Hong Kong) Limited（下称「morechat.co」或「我们」）在你访问 morechat.co、联系我们或使用我们的托管服务 morechat.co Cloud（包括网页端、桌面端和移动端）时，如何收集、使用和共享个人信息。",
      "本政策不适用于你自行部署的 morechat.co。自托管部署的数据由部署方控制，它使用哪些 AI 服务商、集成或分析工具，取决于部署方的配置。自托管服务器唯一会发送给我们的是每天一次的使用快照，内容包括：一个随机生成的部署 ID（用于关联同一台服务器的历次快照）、服务器版本、工作区、成员、智能体和已连接守护进程的大致数量，当天开始、完成、失败和取消的运行次数，以及过去 1、7、28 天内打开过网页端或桌面端的成员、亲自发起过智能体运行的成员的大致人数。快照不含任何姓名、邮箱或内容。设置 DO_NOT_TRACK=1 即可关闭这份快照。",
      "本政策以英文版本为准。如中文版本与英文版本不一致，以英文版本为准。",
    ],
    sections: [
      {
        heading: "我们收集的信息",
        bullets: [
          "账户信息：你的姓名、邮箱地址和头像。如果你使用 Google 登录，我们会从 Google 获得你的姓名、邮箱地址和头像。你也可以填写语言、时区、个人简介等资料，以及回答上手引导中的问题，例如你的角色、使用场景、从哪里了解到 morechat.co。",
          "你创建的内容：工作区、任务、评论、聊天消息、附件、智能体指令，以及你或你的智能体放进 morechat.co Cloud 的其他内容。",
          "联系商务表单：你的姓名、工作邮箱、公司名称和规模、国家或地区、使用场景、目标，以及你的沟通偏好。为了防止滥用，我们还会记录提交表单时的 IP 地址和浏览器 user agent。",
          "账单信息：订阅付款由 Stripe 在其托管的页面上处理，我们不会接收或存储你的完整银行卡信息。",
          "使用和设备信息：应用版本、操作系统、客户端类型和一个随机生成的安装 ID；你连接为运行时的每台机器的名称（默认是其主机名）；以及崩溃和错误报告。报告发送前，我们会从错误信息中过滤掉能识别出的邮箱地址和凭据，但报告仍可能包含与出错情况相关的其他细节。",
          "反馈：你提交反馈时，我们会收到反馈内容，以及所在页面、应用版本、操作系统和相关的错误信息。",
        ],
      },
      {
        heading: "我们如何使用信息",
        bullets: [
          "提供、运营和保护 morechat.co Cloud，包括登录、同步工作区、发送通知和邀请。",
          "回复联系商务表单和支持请求。",
          "发送服务消息，例如登录验证码和工作区邀请。只有在你主动同意后，我们才会发送产品动态或营销信息，你可以随时退订。",
          "了解 morechat.co 的使用情况、修复问题并改进产品。",
          "防止滥用，并履行法律义务。",
        ],
      },
      {
        heading: "法律依据",
        paragraphs: [
          "在法律要求说明处理依据的地区，我们依据以下几点处理个人信息：履行与你之间的合同，以提供 morechat.co Cloud；我们在保障安全、提供支持、改进 morechat.co 和回复咨询方面的正当利益；你对接收营销信息的同意；以及履行我们的法律义务。",
        ],
      },
      {
        heading: "AI 功能",
        paragraphs: [
          "你的编码智能体运行在你自己的机器或你连接的运行时上，使用的是你配置的编码工具和账户。智能体在本机运行，不代表模型也在本机推理：这些工具会把提示词、代码、文件和工具调用结果发送给各自的模型服务商，并受你所用工具和账户的条款约束。morechat.co 负责协调智能体的工作。",
          "morechat.co Cloud 的部分功能（如生成聊天标题和推荐后续操作）会把你的第一条聊天消息或最近几条消息，发送给我们选用的第三方大语言模型服务商来生成结果。morechat.co 不会用你的内容训练 AI 模型。",
        ],
      },
      {
        heading: "Cookie 与分析",
        paragraphs: [
          "我们使用必要的 Cookie 来保持你的登录状态、防范跨站请求伪造，以及让你访问自己上传的文件。我们还会用 Cookie 记住你是通过哪个推广活动或网站来到这里的（最长 30 天），以及你选择的语言和最近打开的工作区。",
          "我们使用 PostHog 了解产品使用情况并收集崩溃报告。你登录后，PostHog 会收到你账户的姓名和邮箱，以便我们把报告和你的账户对应起来。我们不使用广告 Cookie，也不出售你的个人信息。",
        ],
      },
      {
        heading: "我们与谁共享信息",
        paragraphs: [
          "你放进工作区的信息，会按工作区的权限设置，被其他成员和管理员，以及他们授权的智能体和集成看到。如果你的工作区属于某个组织，其中的内容由该组织管理，相关请求也可能由该组织处理。",
          "在法律要求时，我们会披露相关信息；如果 morechat.co 发生合并、收购或资产出售，相关信息也可能转移给买方或继任方。",
          "除此之外，我们只会与帮助我们运营 morechat.co 的服务商，以及你选择连接的集成共享个人信息：",
        ],
        bullets: [
          "Amazon Web Services：托管、文件存储和内容分发",
          "Vercel：网站和网页应用托管",
          "Stripe：付款和账单",
          "Resend：登录和邀请邮件",
          "PostHog：产品分析和崩溃报告",
          "Google：当你选择使用 Google 登录时",
          "大语言模型服务商：上文所述的 AI 功能",
          "你连接的集成，如 Slack、飞书、钉钉、企业微信、Telegram、GitHub、GitLab、通过 Composio 连接的应用：你选择通过它们收发的数据，同时受这些服务商自身条款的约束",
        ],
      },
      {
        heading: "信息的存储位置",
        paragraphs: [
          "morechat.co Cloud 托管在 Amazon Web Services 和 Vercel 上。我们和我们的服务商可能会在美国及其他国家或地区处理你的信息。无论在哪里处理，我们都会按照本政策保护这些信息。",
        ],
      },
      {
        heading: "信息的保留期限",
        paragraphs: [
          "账户信息和工作区内容会在你的账户或工作区存在期间一直保留。工作区所有者删除工作区后，其中的任务、评论等内容会从 morechat.co Cloud 中移除，但用于恢复的备份在之后一段时间内仍可能包含副本。如需从我们的文件存储中清除已删除工作区里上传的文件，请发邮件至 [support@morechat.co](mailto:support@morechat.co)。账单记录按会计和税务规定要求的期限保留；产品分析数据、崩溃报告、联系商务表单和反馈，会在为你提供支持和改进 morechat.co 所需的期间内保留。你可以要求我们删除联系商务表单和反馈。",
        ],
      },
      {
        heading: "你的选择和权利",
        paragraphs: [
          "根据你所在地的法律，你可能有权访问、更正、删除或导出你的个人信息，反对或限制某些处理，撤回你已给出的同意（例如接收营销信息的同意），以及向当地的数据保护机构投诉。你可以随时在 morechat.co 中更新个人资料，也可以在设置中删除你拥有的工作区。其他请求（包括删除账户），请发邮件至 [support@morechat.co](mailto:support@morechat.co)，我们会在 30 天内回复。",
        ],
      },
      {
        heading: "安全",
        paragraphs: [
          "我们通过传输加密、访问控制以及对集成凭据的加密存储来保护你的信息。没有任何系统是绝对安全的；如果你认为自己的账户已被盗用，请尽快联系我们。",
        ],
      },
      {
        heading: "儿童",
        paragraphs: [
          "morechat.co 并非面向 16 岁以下的儿童，我们也不会在知情的情况下收集他们的个人信息。",
        ],
      },
      {
        heading: "政策变更",
        paragraphs: [
          "我们可能会不时更新本政策。新版本会发布在本页面，并更新页首的日期。如有重大变更，我们会在生效前通知你。",
        ],
      },
      {
        heading: "联系我们",
        paragraphs: [
          "morechat.co 由 Index Labs (Hong Kong) Limited 运营，并由其负责你的个人信息。如有隐私相关的问题或请求，请发邮件至 [support@morechat.co](mailto:support@morechat.co)。",
        ],
      },
    ],
  },

  changelog: {
    title: "\u66f4\u65b0\u65e5\u5fd7",
    subtitle: "morechat.co \u7684\u6700\u65b0\u66f4\u65b0\u548c\u6539\u8fdb\u3002",
    toc: "\u5386\u53f2\u7248\u672c",
    categories: {
      features: "新功能",
      improvements: "改进",
      fixes: "问题修复",
    },
    entries: [
      {
        version: "0.1.0",
        date: "2026-11-10",
        title: "首个版本",
        changes: [
          "morechat.co 首次对外开放：Issue、项目、智能体，以及飞书、Slack 等聊天集成。",
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
      eyebrow: "桌面端",
      title: {
        mac: "下载 morechat.co macOS 版",
        windows: "下载 morechat.co Windows 版",
        linux: "下载 morechat.co Linux 版",
        other: "下载 morechat.co",
      },
      lead: "桌面端自带智能体守护进程，这台电脑上的 Claude Code、Codex 等编程智能体会自动接入。",
      leadOther: "支持 macOS、Windows 和 Linux，每个版本都内置智能体守护进程。",
      mobileNote: "morechat.co 桌面端支持 macOS、Windows 和 Linux。请在电脑上打开这个页面下载。",
      primary: {
        macArm64Dmg: "下载 Apple 芯片版",
        macX64Dmg: "下载 Intel 版",
        winX64Exe: "下载 Windows 版",
        winArm64Exe: "下载 Windows ARM 版",
        linuxAmd64AppImage: "下载 AppImage",
        linuxArm64AppImage: "下载 AppImage",
      },
      alternate: {
        macArm64Dmg: "Apple 芯片版",
        macX64Dmg: "Intel 版",
      },
      released: "{date} 发布",
      whatsNew: "更新内容",
      versionUnavailable: "暂时获取不到版本信息，请到 GitHub 查看所有版本。",
    },
    allPlatforms: {
      title: "全部下载",
      thisDevice: "这台电脑",
      formatDmg: ".dmg",
      formatZip: ".zip",
      formatExe: ".exe",
      formatAppImage: ".AppImage",
      formatDeb: ".deb",
      formatRpm: ".rpm",
      unavailable: "暂不可用",
      allReleases: "所有版本",
    },
    cli: {
      title: "在服务器或远程开发机上？",
      sub: "安装 CLI，在那里运行同一个守护进程。通过 SSH 执行同样的命令即可。",
      installLabel: "安装",
      platformGroup: "选择你的系统",
      platformMacosLinux: "macOS / Linux",
      platformWindows: "Windows",
      startLabel: "启动守护进程",
      copyLabel: "复制",
      copiedLabel: "已复制",
    },
    started: {
      title: "已开始下载",
      retry: "没有开始？重新下载",
      allDownloads: "全部下载",
      install: {
        title: "安装",
        dmg: "打开 .dmg，把 morechat.co 拖进「应用程序」。",
        zip: "解压后，把 morechat.co 移到「应用程序」。",
        exe: "运行安装程序，完成后 morechat.co 会自动打开。",
        appImage: "给 AppImage 加上可执行权限，然后运行。",
        deb: "用 apt 或你的包管理器安装 .deb。",
        rpm: "用 dnf 或你的包管理器安装 .rpm。",
      },
      signIn: {
        title: "登录",
        body: "打开 morechat.co，用你的账号登录。",
        installed: "已经装好了？",
        open: "打开 morechat.co",
      },
      agents: {
        title: "接入智能体",
        body: "morechat.co 会自动找到这台电脑上的 Claude Code、Codex 等编程智能体。",
      },
      community: {
        label: "下载的同时",
        githubTitle: "在 GitHub 上关注 morechat.co",
        githubBody: "给仓库点个 Star，第一时间收到新版本；也可以看看你刚下载的应用背后的代码。",
        star: "在 GitHub 上 Star",
        stars: "{count} Star",
        discordTitle: "加入 Discord",
        discordBody: "提问、分享工作流，和团队直接交流。",
        join: "加入",
        xTitle: "关注 @MorechatAI",
        xBody: "新版本发布和接下来的计划。",
        follow: "关注",
      },
    },
  },
  contactSales: {
    pageTitle: "联系商务",
    pageDescription:
      "了解如何在你的团队中落地 morechat.co 的人类 + 智能体协作工作流。",
    eyebrow: "联系商务",
    title: "先了解你的需求",
    fields: {
      firstName: "名",
      lastName: "姓",
      businessEmail: "企业邮箱",
      businessEmailHint:
        "请使用公司邮箱，不接受 Gmail、Outlook 等个人邮箱。",
      companyName: "公司名称",
      companySize: "公司规模",
      countryRegion: "国家 / 地区",
      useCase: "你打算如何使用 morechat.co 或与我们合作？",
      goals: "你的目标或挑战",
      selectPlaceholder: "请选择",
      submit: "提交",
      submitting: "正在提交…",
    },
    companySizes: [
      { value: "1-10", label: "1 – 10 人" },
      { value: "11-50", label: "11 – 50 人" },
      { value: "51-200", label: "51 – 200 人" },
      { value: "201-500", label: "201 – 500 人" },
      { value: "501-1000", label: "501 – 1,000 人" },
      { value: "1000+", label: "1,000 人以上" },
    ],
    useCases: [
      { value: "evaluate", label: "正在为团队评估 morechat.co" },
      { value: "adopt_team", label: "希望在团队 / 公司内推广使用" },
      { value: "self_host", label: "需要在自有基础设施上自托管" },
      { value: "integrate", label: "希望与现有工具集成" },
      { value: "partner", label: "合作 / 渠道合作咨询" },
      { value: "other", label: "其他" },
    ],
    countries: [
      "中国大陆",
      "中国香港",
      "中国澳门",
      "中国台湾",
      "新加坡",
      "马来西亚",
      "印度尼西亚",
      "泰国",
      "越南",
      "菲律宾",
      "日本",
      "韩国",
      "印度",
      "阿联酋",
      "沙特阿拉伯",
      "以色列",
      "土耳其",
      "美国",
      "加拿大",
      "英国",
      "德国",
      "法国",
      "荷兰",
      "瑞典",
      "瑞士",
      "西班牙",
      "意大利",
      "爱尔兰",
      "挪威",
      "丹麦",
      "芬兰",
      "比利时",
      "葡萄牙",
      "澳大利亚",
      "新西兰",
      "南非",
      "巴西",
      "墨西哥",
      "阿根廷",
      "智利",
      "其他",
    ],
    consent: {
      intro:
        "morechat.co 尊重你的隐私。我们仅会将你的个人信息用于管理账户，以及提供你所请求的产品或服务。我们偶尔也希望与你分享产品更新、最佳实践或行业洞察，如果你愿意接收，请在下方勾选。",
      outreach:
        "我希望接收来自 morechat.co 的一对一沟通，包括服务更新、支持咨询以及业务相关的跟进。",
      updates:
        "我希望接收 morechat.co 的产品更新、洞察以及活动邀请。",
      unsubscribe:
        "你可以随时取消订阅我们的邮件。关于我们如何处理你的数据以及隐私权利，请参阅",
      submitConsent:
        "点击「提交」即表示你同意 morechat.co 存储并处理你提交的信息，以便交付你请求的内容。",
      privacyLinkLabel: "隐私政策。",
      privacyLinkHref: "/privacy",
    },
    success: {
      title: "已收到，谢谢！",
      message:
        "morechat.co 团队会在三个工作日内回复你。在此期间，欢迎查看我们的文档，或在 GitHub 上为我们点个 Star。",
      cta: "返回首页",
    },
    errors: {
      generic: "提交失败，请稍后再试。",
      rateLimit: "该邮箱近期已提交多次，请稍后再试。",
      freeEmail:
        "请使用企业邮箱——免费邮箱（gmail、outlook 等）暂不接受。",
      invalidEmail: "邮箱地址格式不正确。",
    },
  },
  };
}
