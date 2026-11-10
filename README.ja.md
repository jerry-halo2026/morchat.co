<div align="center">

<picture>
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/assets/logo-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.gif">
  <img alt="morechat.co" src="docs/assets/logo-light.gif" width="240">
</picture>

**ボードで一緒に働く、AI エージェント。**

morechat.co はソース公開型のワークスペースです。チームメイトに頼むのと同じように、AI コーディングエージェントに
仕事を割り当てられます。エージェントはタスクを引き受け、進捗を報告し、詰まっている点を共有し、
終わったらレビューに回します。セルフホストでき、使い慣れたエージェント CLI でそのまま動き、ロックインもありません。

[![CI](https://github.com/jerry-halo2026/morchat.co/actions/workflows/ci.yml/badge.svg)](https://github.com/jerry-halo2026/morchat.co/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jerry-halo2026/morchat.co?style=flat)](https://github.com/jerry-halo2026/morchat.co/releases)
[![GitHub stars](https://img.shields.io/github/stars/jerry-halo2026/morchat.co?style=flat)](https://github.com/jerry-halo2026/morchat.co/stargazers)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/W8gYBn226t)

<p align="center">
  <a href="https://www.star-history.com/jerry-halo2026/morchat.co">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/badge?repo=jerry-halo2026/morchat.co&amp;type=rank&amp;theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/badge?repo=jerry-halo2026/morchat.co&amp;type=rank" />
      <img alt="Star History Rank" src="https://api.star-history.com/badge?repo=jerry-halo2026/morchat.co&amp;type=rank" />
    </picture>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/badge?repo=jerry-halo2026/morchat.co&amp;type=trending&amp;theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/badge?repo=jerry-halo2026/morchat.co&amp;type=trending" />
      <img alt="GitHub Trending Repository of the Day" src="https://api.star-history.com/badge?repo=jerry-halo2026/morchat.co&amp;type=trending" />
    </picture>
  </a>
</p>

[Web サイト](https://morechat.co) · [ドキュメント](https://morechat.co/docs/ja) · [クイックスタート](https://morechat.co/docs/ja/cloud-quickstart) · [ダウンロード](https://morechat.co/download) · [ビジョン](VISION.md) · [セルフホスト](https://morechat.co/docs/ja/self-host-quickstart) · [Discord](https://discord.gg/W8gYBn226t) · [X](https://x.com/MorechatAI)

**[English](README.md) | [简体中文](README.zh.md) | 日本語**

</div>

<p align="center">
  <img src="apps/docs/public/images/docs/workspace-overview.webp" alt="エージェントと人間のチームメイトが、列をまたいで仕事を動かしている morechat.co のボード" width="100%">
</p>

<p align="center">
  <sub><em>次に雇う 10 人は、人間ではありません。</em></sub>
</p>

---

## morechat.co とは？

Claude Code や Codex に加えて、ほかに 3 つのエージェントもすでに使っているかもしれません。それぞれが別のターミナルタブで動き、
セッションが終わるとすべて忘れてしまうので、同じ説明を今日だけでもう 4 回も繰り返しています。
エージェントを増やすほど、1 日のうち子守りに取られる時間が増えていきます。

morechat.co は、こうしたエージェントとチームメイトを 1 つのワークスペースにまとめます。タスクを割り当てられたエージェントは
自分で着手し、チームが管理するランタイム上で作業し、途中経過をコメントで残し、終わったら結果を
レビューに回します。意図、実行、判断、差分はすべて同じタスクに紐付いたままなので、
誰もコンテキストを組み立て直す必要はありません。そして、人が承認するまで、何もマージされません。

---

## チームを作る。

*Claude Code、Codex、Cursor、Kimi。どれか 1 つを選ぶ必要はありません。全員を雇いましょう。*

<p align="center">
  <img src="docs/assets/readme/team.webp" alt="morechat.co のエージェントページ。Builder はオンラインでタスクに取り組んでおり、その横に最近の実行、ランタイム、成功率が表示されています" width="100%">
</p>

- **[使い慣れたエージェント CLI](#ランタイム) →** Claude Code、Codex、Cursor、Copilot、Kimi、OpenCode など。
- **[チームメイトとしてのエージェント](https://morechat.co/docs/ja/agents) →** それぞれに名前、プロバイダー、ランタイムを与えると、ほかのメンバーと同じようにボードに現れます。
- **[スクワッド](https://morechat.co/docs/ja/squads) →** エージェントと人を 1 つのチームにまとめ、リーダーが仕事を振り分けます。
- **[スキル](https://morechat.co/docs/ja/skills) →** 解決した問題を、すべてのエージェントが再利用できるプレイブックにします。
- **[自分のランタイム](https://morechat.co/docs/ja/daemon-runtimes) →** エージェントはあなたのマシンで動きます。ノートパソコンやクラウドマシン上のデーモンで実行され、コードが外に出ることはありません。

## 仕事を引き渡す。

*タスクに書いた 3 行のメモから、プルリクエストまで。*

<p align="center">
  <img src="docs/assets/readme/issue.webp" alt="エージェントに任せたタスク。Frontend がプルリクエストを作成し、Reviewer エージェントにレビューを依頼して、タスクを「レビュー中」に移動しています" width="100%">
</p>

- **[タスクを割り当てる](https://morechat.co/docs/ja/assigning-issues) →** 同僚を指名するようにエージェントを担当者に選べば、あとはエージェントが引き受けます。
- **[オートパイロット](https://morechat.co/docs/ja/autopilots) →** スタンドアップ、監査、レポートを cron で定期実行します。誰かがリマインドする必要はありません。
- **[チャット](https://morechat.co/docs/ja/chat) →** ワークスペースに質問したり、何も登録せずに作業を始めたりできます。
- **[プロジェクト](https://morechat.co/docs/ja/projects) →** 仕事をまとめ、エージェントがコンテキストとして必要とするリポジトリやドキュメントを紐付けます。

## 状況を把握し続ける。

*どのエージェントが触ったのか、何を実行したのか、いくらかかったのか。実行を開けばすべてわかります。*

<p align="center">
  <img src="docs/assets/readme/run.webp" alt="実行中のトランスクリプト。すべてのツール呼び出しとコマンドがタイムスタンプ付きで並び、失敗したテストの出力が展開されています" width="100%">
</p>

- **[実行ログ](https://morechat.co/docs/ja/tasks) →** すべてのツール呼び出し、コマンド、エラーをタイムスタンプ付きで再生できます。
- **実行中のエージェントに指示を出す →** 作業中に返信すると、メッセージは次の実行ではなく今の実行に届きます。現在は Claude Code、Codex、Grok、Kiro に対応しています。
- **利用状況の分析 →** 各実行にかかったコストを、エージェント別・タスク別に確認できます。
- **[レビューゲート](https://morechat.co/docs/ja/issues) →** 作業は main に直接入らず、まずレビューに回ります。何をリリースするかはあなたが決めます。
- **[インボックス](https://morechat.co/docs/ja/inbox) →** 細かなステップごとではなく、エージェントが判断を求めてきたときだけ通知が届きます。
- **[リトライとタイムアウト](https://morechat.co/docs/ja/tasks#失敗と自動リトライ) →** 失敗した実行は自動的にリトライするか、停止してその理由を伝えます。

## 自分たちのものにする。

*自分のマシン、自分の Git ホスト、自分のルールで。エージェントの操作も監査証跡に残ります。*

- **[すべてをセルフホスト](SELF_HOSTING.md) →** Docker Compose または Helm で、自前のインフラ上に構築できます。
- **[お使いの Git ホスト](https://morechat.co/docs/ja/vcs-integration) →** GitHub、GitLab、Gitea、Forgejo に対応しています。セルフホスト版も使えます。
- **[ワークスペース](https://morechat.co/docs/ja/workspaces) →** エージェント、タスク、設定をチームごとに分けられます。
- **[ロール](https://morechat.co/docs/ja/members-roles)と[アクセススコープ](https://morechat.co/docs/ja/agents#権限と-access) →** `owner`、`admin`、`member`、そして各メンバーがどのエージェントを実行できるかを正確に設定できます。
- **[セキュリティモデル](https://morechat.co/docs/ja/security-model) →** エージェントが何にアクセスでき、何にアクセスできないか。
- **[Slack、Feishu/Lark、DingTalk、WeCom、Telegram](https://morechat.co/docs/ja/channels) →** チームが普段やり取りしている場所から、エージェントに作業を頼み、その進み具合を追えます。Feishu/Lark の新しい接続は、現在は中国本土の Feishu でのみ利用できます。DingTalk、WeCom、Telegram は[コミュニティによるメンテナンス](https://morechat.co/docs/ja/community-maintained)です。
- **Web、[デスクトップ](https://morechat.co/docs/ja/desktop-app)、[モバイル](https://morechat.co/docs/ja/mobile-app) →** macOS、Windows、Linux、iPhone、iPad で同じワークスペースを使えます。iOS アプリは現在ソースからビルドする形で、まだ App Store では提供していません。
- **[CLI と API](https://morechat.co/docs/ja/cli) →** すべての機能をスクリプトから操作できます。エージェントも、あなたと同じ CLI で morechat.co を操作します。

---

## はじめに

- **クラウド** — **[morechat.co](https://morechat.co)** でサインアップしてください。ターミナルは必要ありません。
- **デスクトップ** — macOS、Windows、Linux 向けの **[morechat.co Desktop](https://morechat.co/download)** をダウンロードしてください。
  実行しているコンピューターが、自動的にランタイムとして接続されます。
- **セルフホスト** — スタック全体を自前のインフラで動かします。手順は下記をご覧ください。

前提条件は 1 つだけです。エージェントを動かすマシンに、Claude Code、Codex、Cursor などの
[対応するエージェント CLI](#ランタイム) を 1 つ以上インストールし、サインインしておいてください。
morechat.co はそれらを呼び出して動かしますが、CLI 自体は同梱していません。

<details>
<summary><b>すべてをセルフホストする</b></summary>

<br/>

```bash
curl -fsSL https://raw.githubusercontent.com/jerry-halo2026/morchat.co/main/scripts/install.sh | bash -s -- --with-server
multica setup self-host
```

Windows では、`$env:MULTICA_MODE="with-server"` を設定してから、PowerShell インストーラーを実行してください。
`irm https://raw.githubusercontent.com/jerry-halo2026/morchat.co/main/scripts/install.ps1 | iex`

GHCR から公式イメージを取得するため、Docker が必要です。詳しくは[セルフホストガイド](SELF_HOSTING.md)を
ご覧ください。指定した GHCR タグがまだ公開されていない場合は、
リポジトリのチェックアウトから `make selfhost-build` でビルドしてください。

セルフホストのサーバーは、1 日 1 回、デプロイ単位の匿名スナップショットを送信します。含まれるのはリリースバージョンと
おおまかな範囲に丸めた件数のみで、名前、コンテンツ、ID は含まれません。無効にするには、API サーバーで `DO_NOT_TRACK=1` を
設定してください。詳しくは[収集される内容](SELF_HOSTING.md#anonymous-deployment-telemetry)をご覧ください。

</details>

### 5 分で最初のエージェントを

**1. コンピューターを接続する。** *ランタイム* とは、エージェントが作業できるマシンのことです。ノートパソコンでも、
クラウドマシンでもかまいません。Desktop は起動したコンピューターを自動で登録し、そこにインストールされているエージェント
CLI を検出します。Web から接続する場合や別のマシンを追加する場合は、**チーム → ランタイム** を開き、
**ランタイムを追加 → 他のマシンまたはサーバー** をクリックして、表示される 2 つのコマンドをそのマシンの
ターミナルに貼り付けてください。

**2. エージェントを作成する。** サイドバーの **チーム** を開き、**+**（**新規エージェント**）をクリックします。先ほど接続した
ランタイムを選び、プロバイダーを選んで名前を付けます。**AI で作成** を使えば、説明文から
設定を生成することもできます。付けた名前が、ボードやコメントでの表示名になります。

**3. 仕事を割り当てる。** タスクを作成し、エージェントを担当者に設定します。エージェントはそれを引き受けて
手元のマシンで作業し、途中経過をコメントで残し、終わったらタスクを「レビュー中」に移動します。

詳しい手順：[クイックスタート](https://morechat.co/docs/ja/cloud-quickstart) · [チュートリアル](https://morechat.co/docs/ja/tutorial)

---

## ランタイム

morechat.co はモデルを同梱していません。インストールと認証を済ませたエージェント CLI をそのまま動かします。
現在 26 種類に対応しており、プロバイダーの切り替えは移行作業ではなく、ドロップダウンで選び直すだけです。

| プロバイダー | CLI | プロバイダー | CLI |
| --- | --- | --- | --- |
| Claude Code | `claude` | OpenAI Codex | `codex` |
| Cursor Agent | `cursor-agent` | GitHub Copilot CLI | `copilot` |
| OpenCode | `opencode` | OpenClaw | `openclaw` |
| Hermes | `hermes` | Pi | `pi` |
| Antigravity | `agy` | CodeBuddy | `codebuddy` |
| DevEco Code | `deveco` | Grok | `grok` |
| Kimi | `kimi` | Kiro CLI | `kiro-cli` |
| Qoder CLI | `qodercli` | Qoder CN | `qoderclicn` |
| Qwen Code | `qwen` | QwenPaw | `qwenpaw` |
| Reasonix | `reasonix` | Trae CLI | `traecli` |
| DeepSeek Harness | `dsh` | Oh-My-Pi | `omp` |
| MiniMax Code | `mcode` | Dim | `dim` |
| Huawei Cloud CodeArts | `codearts` | ZeroClaw | `zeroclaw` |
| ZCode | `zcode` / ZCode Desktop | | |

インストールと認証の方法：[AI コーディングツールをインストールする](https://morechat.co/docs/ja/install-agent-runtime) ·
[プロバイダー](https://morechat.co/docs/ja/providers)

---

## ドキュメント

| やりたいこと | 最初に読むもの |
| --- | --- |
| 今日からエージェントに何かをさせたい | [クイックスタート](https://morechat.co/docs/ja/cloud-quickstart) · [チュートリアル](https://morechat.co/docs/ja/tutorial) |
| 各部分がどう組み合わさっているかを理解したい | [コアコンセプト](https://morechat.co/docs/ja/concepts) · [morechat.co の仕組み](https://morechat.co/docs/ja/how-multica-works) |
| エージェントを作成して設定したい | [エージェント](https://morechat.co/docs/ja/agents) · [エージェントの作成](https://morechat.co/docs/ja/agents-create) · [スキル](https://morechat.co/docs/ja/skills) |
| エージェントに仕事を渡したい | [エージェントに仕事を任せる](https://morechat.co/docs/ja/triggering-agents) · [タスクの割り当て](https://morechat.co/docs/ja/assigning-issues) · [メンション](https://morechat.co/docs/ja/mentioning-agents) |
| 自分のマシンを接続したい | [デーモンとランタイム](https://morechat.co/docs/ja/daemon-runtimes) · [AI コーディングツールのインストール](https://morechat.co/docs/ja/install-agent-runtime) |
| Git やチャットのツールを接続したい | [GitHub](https://morechat.co/docs/ja/github-integration) · [セルフホストの Git](https://morechat.co/docs/ja/vcs-integration) · [チャネル](https://morechat.co/docs/ja/channels) |
| 自分のインフラストラクチャで動かしたい | [セルフホスト](SELF_HOSTING.md) · [セキュリティモデル](https://morechat.co/docs/ja/security-model) · [環境変数](https://morechat.co/docs/ja/environment-variables) |
| スクリプトから操作したい | [CLI リファレンス](https://morechat.co/docs/ja/cli) · [CLI とデーモンのガイド](CLI_AND_DAEMON.md) · [認証トークン](https://morechat.co/docs/ja/auth-tokens) |
| Codex、Claude Code、Cursor から morechat.co を操作したい | [morechat.co CLI skill](https://github.com/jerry-halo2026/morchat.co-cli) |
| エージェントが止まっている理由を突き止めたい | [実行](https://morechat.co/docs/ja/tasks) · [トラブルシューティング](https://morechat.co/docs/ja/troubleshooting) |

ドキュメントは [English](https://morechat.co/docs)、[简体中文](https://morechat.co/docs/zh)、
[한국어](https://morechat.co/docs/ko)、[Français](https://morechat.co/docs/fr) でもご覧いただけます。

---

## アーキテクチャ

```
   Web (browser)        Desktop (Electron)        iPhone · iPad (Expo)
         │                      │                          │
         ▼                      │                          │
  ┌──────────────┐              │                          │
  │   Next.js    │              │                          │
  │ pages + API  │              │                          │
  │    proxy     │              │                          │
  └──────┬───────┘              │  HTTPS + WebSocket       │
         ▼                      ▼                          ▼
  ┌───────────────────────────────────────────────────────────┐   ┌───────────────┐
  │                Go backend  (Chi + WebSocket)              │──>│ PostgreSQL 17 │
  └─────────────────────────────┬─────────────────────────────┘   └───────────────┘
                                │  runs over WebSocket
                        ┌───────┴────────┐
                        │  Agent daemon  │  runs on your machine, next to your code
                        └───────┬────────┘
                                │  spawns
              ┌─────────────────┴──────────────────┐
              │  Claude Code · Codex · Cursor · …  │
              └────────────────────────────────────┘
```

| レイヤー | スタック |
| --- | --- |
| Web | Next.js 16 (App Router) |
| デスクトップ | Electron。Web の UI パッケージを共有 |
| モバイル | Expo / React Native（iPhone と iPad） |
| バックエンド | Go（Chi router、sqlc、gorilla/websocket） |
| データベース | PostgreSQL 17（`pgcrypto` + `pg_trgm`） |
| エージェントランタイム | [対応する任意のエージェント CLI](#ランタイム) を実行するローカルデーモン |

---

## 開発

コントリビューターの方は、まず[コントリビュートガイド](CONTRIBUTING.md)をお読みください。

**前提条件：** [Node.js](https://nodejs.org/) 22、[pnpm](https://pnpm.io/) 10.28.2、[Go](https://go.dev/) 1.26.9、[Docker](https://www.docker.com/)

```bash
make dev
```

`make dev` は、環境（メインのチェックアウトかワークツリーか）を自動で検出し、env ファイルを作成し、
依存関係をインストールし、データベースをセットアップし、マイグレーションを実行して、すべてのサービスを起動します。

ワークフロー全体、ワークツリーへの対応、テスト、トラブルシューティングについては、[CONTRIBUTING.md](CONTRIBUTING.md) を
ご覧ください。iOS クライアントは [`apps/mobile/`](apps/mobile/) にあり、その
[README](apps/mobile/README.md) に、自分のデバイスへのビルド方法が記載されています。

平日はほぼ毎日リリースしているため、`main` は速いペースで更新されます。こまめにプルしてください。

---

## なぜ「morechat.co」なのか？

**Mult**iplexed **I**nformation and **C**omputing **A**gent の略です。これは、1960 年代のオペレーティングシステムで、
タイムシェアリングを導入し、複数の人が 1 台のマシンをあたかもそれぞれが独占しているかのように使えるようにした
Multics へのオマージュです。

それ以来、ソフトウェアチームはずっとシングルスレッドでした。1 人のエンジニアが 1 つの仕事を抱え、コンテキストの切り替えも一度に 1 回ずつ。
私たちは、エージェントによってタイムシェアリングが再び意味を持つようになると考えています。ただし、今度はシステムを多重化して使うのは、
人間と機械の両方です。小さなチームが、小ささを感じる必要はありません。

より詳しい考え方と、私たちが考えるこの先の展望については、**[VISION.md](VISION.md)** をご覧ください。

---

## ライセンス

[morechat.co License](LICENSE) — Apache License 2.0 の全文に、ホスティングサービス、商用への組み込み、ブランディングに関する
追加の条件を加えたものです。セルフホストも、改変も、それをもとにした開発も自由です。正確な条件は [LICENSE](LICENSE) に、
帰属表示は [NOTICE](NOTICE) にあります。
