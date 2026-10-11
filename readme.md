# ✨ Lumina CLI — Autonomous AI Software Engineering Companion

<p align="center">
  <b>An autonomous AI software engineering agent that helps developers build, analyze, debug, and architect software workflows directly from the terminal.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@piyushkumariiitj/lumina-cli">
    <img src="https://img.shields.io/npm/v/@piyushkumariiitj/lumina-cli.svg?style=flat-square&color=CB3837&logo=npm" alt="npm version" />
  </a>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/AI%20Engine-Groq%20LPU-F55036?style=flat-square&logo=groq&logoColor=white" alt="Groq" />
  <img src="https://img.shields.io/badge/Vercel%20AI%20SDK-v7.0-000000?style=flat-square&logo=vercel&logoColor=white" alt="AI SDK" />
  <img src="https://img.shields.io/badge/Next.js-16.3-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Express-5.2-000000?style=flat-square&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Better%20Auth-1.6-4F46E5?style=flat-square" alt="Better Auth" />
  <img src="https://img.shields.io/badge/Database-Neon%20PostgreSQL-00E599?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
</p>

---

## ⚡ Quick Start (For End Users)

You can install and run Lumina CLI on any macOS, Linux, or Windows machine in seconds via **npm**.

### 1. Global Installation

Install the CLI globally on your machine:

```bash
npm install -g @piyushkumariiitj/lumina-cli
```

Verify your installation:
```bash
lumina --help
```

---

### 2. Sign In with GitHub

Authenticate your CLI using the RFC 8628 Device Authorization flow:

```bash
lumina login
```

1. Lumina displays a one-time verification code (e.g. `ABCD-1234`).
2. Press **Enter** to open the browser verification portal (`https://luminacli.vercel.app/device`).
3. Click **Sign in with GitHub** and **Approve Device**.
4. Return to your terminal — it will automatically detect the approval and save your secure session locally!

---

### 3. Launch Lumina (Zero-Config AI)

Launch the interactive AI engineering environment — no API keys or local database setup required:

```bash
lumina wakeup
```

```text
✦ Lumina CLI v1.0.7 • openai/gpt-oss-120b

  ✦ Developer <Active User>
  • Engine: openai/gpt-oss-120b  • Status: Active

? Select capability:
  ❯ 💬 Chat                  (Conversational AI with memory and code formatting)
    ⚡ Tools                 (Live web search, code execution, git, workspace reader)
    🛠  Code Task             (Plan, edit and validate a change in this repository)
    🤖 Agent                 (Autonomous project architect & code generator)
    ⚙  Status & Diagnostics  (Inspect profile, Groq model, and database connection)
    🚪 Exit
```

---

## 🕹️ Operating Modes

Lumina provides four AI engineering modes:

### 1. 💬 Chat Mode (Persistent Conversational AI)
- Multi-turn conversational pair programmer for software architecture, debugging, and code reviews.
- Renders real-time ANSI syntax-highlighted code blocks, formatted lists, and responsive markdown.
- **In-Chat Commands**:
  - `/clear` — Clear terminal screen while preserving context.
  - `exit` or `quit` — Gracefully end the session.

### 2. ⚡ Tool Calling Mode (Real-Time Developer Tools)
Empowers the AI to autonomously inspect and interact with your local environment:
- 🌐 **Web & Google Search**: Fetch real-time documentation, package releases, and error solutions.
- ⚡ **Code Execution**: Execute JavaScript (`node`) or Python (`python`) snippets to test algorithms and regex. Lumina shows you the code and asks before every run. ⚠️ Approved snippets run directly on your machine with your user's permissions — there is no sandbox.
- 🧮 **Calculator & Math Engine**: Compute complex algebraic formulas and unit conversions.
- 📂 **Workspace File Reader**: Read project source files, `package.json`, and configs in your active directory (files outside it and secret files like `.env` are refused).
- 🌿 **Git Inspector**: Check repository status, recent commits, current branch, and uncommitted diffs.
- 🔗 **Web URL Reader**: Fetch raw text or JSON data from public HTTP/HTTPS URLs (localhost and private-network addresses are refused).
- 🖥️ **System Diagnostics**: Inspect OS platform, Node version, memory, and working directory.

### 3. 🤖 Autonomous Agent Mode (Full-Stack Scaffolder)
Provide a high-level project prompt (e.g. *"Build a modern task tracker with Express, SQLite, and vanilla JS"*):
1. **Architects Application**: Designs folder hierarchy, file dependencies, and configuration.
2. **Generates Working Code**: Creates clean, un-truncated multi-file source code.
3. **Scaffolds to Disk**: Writes all directories and files directly into your active working directory.
4. **Provides Setup Commands**: Displays copy-pasteable execution instructions (e.g. `npm install && npm start`).

### 4. 🛠 Code Task Mode (`lumina task`)
Give Lumina a change to make in an **existing** repository. It works through a bounded, inspectable loop:

1. **Inspect** — lists, searches and reads the relevant files (secret files such as `.env` are never read).
2. **Plan** — proposes a short plan with the files it expects to change and how it will validate them. Nothing is modified until you approve it (*Approve*, *Request changes*, or *Cancel*).
3. **Implement** — edits files with exact-match replacements or writes new files, only inside the workspace.
4. **Validate** — runs your project's tests / type checks / linters through a command policy (below).
5. **Repair** — if Lumina's own verification run fails, the real output is sent back to the model for a limited number of repair rounds.
6. **Report** — lists the files changed (with line counts from `git diff`) and the exit code of every validation command **Lumina itself ran after the agent finished**. The model's own summary is shown separately and labeled as unverified.

```bash
cd my-project
lumina task "Fix the failing date parsing test in utils/ without changing the tests"
lumina task "Add input validation to createUser" --validate "npm test" --validate "npm run lint"
lumina task "Rename the config loader" --plan-only
```

Nothing is committed: review the result with `git diff`.

**Safety model**

| Area | Behavior |
| :--- | :--- |
| Files | Reads and writes are confined to the workspace (`--cwd`, default: current directory), including through symlinks. `.git/`, `node_modules/` (writes) and secret files (`.env*` except `.env.example`, `*.pem`, `*.key`, `id_rsa`, `.npmrc`, …) are off-limits. |
| Your uncommitted work | Files that already had uncommitted changes when the task started are only modified after you confirm (or with `--allow-dirty`). Lumina never runs commands that discard changes. |
| Blocked commands | Never executed, even if approved: recursive deletes, `git push/reset/checkout/restore/clean/stash/rebase/…`, `sudo`, publishing (`npm publish`, …), `curl … | sh`, killing processes, disk/system commands. Chaining (`npm test && git push`) doesn't bypass this. |
| Auto-run commands | Read-only git (`git status/diff/log/show`), commands you pass with `--validate`, and — with `--yes` — the validation commands detected from your project (`npm test`, `npm run lint`, `npm run typecheck`, `pytest`, `go test ./...`, `cargo test`). |
| Everything else | Requires your approval (*Run once* / *Allow for this task* / *Don't run*). Without a terminal, it is denied. |
| Command environment | No stdin, killed (with its process tree) after the timeout, output truncated for the model. Lumina's own credentials (`GROQ_API_KEY`, `LUMINA_*`, …) are removed from the environment. |

**Options**

| Option | Default | Description |
| :--- | :--- | :--- |
| `-C, --cwd <dir>` | current dir | Workspace directory |
| `-y, --yes` | off | Auto-approve the plan and the detected validation commands (required when not running in a terminal) |
| `--validate <cmd>` | detected | Validation command; repeatable; pre-approved |
| `--plan-only` | off | Stop after the plan is approved |
| `--allow-dirty` | off | Allow edits to files with pre-existing uncommitted changes |
| `--max-steps <n>` | 30 | Maximum model calls |
| `--max-repairs <n>` | 2 | Repair rounds after a failed verification |
| `--max-tokens <n>` | 300000 | Total token budget |
| `--command-timeout <s>` | 180 | Timeout per command |
| `--time-limit <min>` | 20 | Wall-clock limit for the whole task |
| `--report-file <path>` | — | Also write the report as JSON |

Each run also limits edits to 20 files and 256 KB per write.

**Result statuses and exit codes**

| Status | Meaning | Exit code |
| :--- | :--- | :---: |
| `passed` | Files changed and every validation command passed | 0 |
| `planned` / `no_changes` | `--plan-only`, or the agent decided nothing needed changing | 0 |
| `unverified` / `partially_verified` | No validation command could run, or only some did | 2 |
| `validation_failed` | Still failing after the repair rounds | 1 |
| `limit_reached` / `aborted` / `error` | A limit was hit, the plan was rejected, or the model call failed | 1 |

The model is reached the same way as the other modes (your `GROQ_API_KEY`, or the key provided after `lumina login`). Validation-command detection currently covers Node (npm/pnpm/yarn/bun scripts), pytest, Go and Cargo; for anything else pass `--validate`.

---

## 💻 CLI Command Reference

| Command | Options | Description |
| :--- | :--- | :--- |
| `lumina wakeup` | — | Launch interactive menu (Chat, Tools, Code Task, Agent, Diagnostics) |
| `lumina task "<task>"` | `--yes`, `--validate <cmd>`, `--plan-only`, `--cwd <dir>`, limits | Plan, implement and validate a change in the current repository ([details](#4--code-task-mode-lumina-task)) |
| `lumina login` | `--server-url <url>`, `--client-id <id>` | Authenticate with GitHub via browser device approval |
| `lumina whoami` | `--server-url <url>` | View current developer session and active model |
| `lumina logout` | — | End session and clear stored local credentials |
| `lumina --help` | `-h` | Display CLI help menu and available options |
| `lumina --version` | `-v` | Output installed version of Lumina CLI |

---

## 🏗️ System Architecture

Lumina separates end-user client execution from production cloud infrastructure:

```text
┌────────────────────────────────────────────────────────┐
│                   END-USER MACHINE                     │
│                                                        │
│  $ npm install -g @piyushkumariiitj/lumina-cli         │
│  $ lumina login                                        │
│  $ lumina wakeup                                       │
│                                                        │
│  • Secure Local Token Store (~/.better-auth/token.json)│
│  • Local Tool Runners (git, node, python, file I/O)    │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS / RFC 8628
                           ▼
┌────────────────────────────────────────────────────────┐
│                   LUMINA CLOUD STACK                   │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Lumina Web Portal (Vercel)                       │  │
│  │ https://luminacli.vercel.app                     │  │
│  │ • Next.js 16 App Router & Device Approval Page   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Lumina Backend Server (Render)                   │  │
│  │ https://lumina-cli.onrender.com                  │  │
│  │ • Express 5 & Better Auth Device Plugin          │  │
│  │ • GitHub OAuth 2.0 Provider Integration          │  │
│  │ • AI proxy: adds the Groq key server-side        │  │
│  └───────────┬──────────────────────────┬───────────┘  │
│              │                          │              │
│              ▼                          ▼              │
│     ┌──────────────────┐      ┌──────────────────┐     │
│     │  Groq LPU Engine │      │ Neon PostgreSQL  │     │
│     │  AI Inference    │      │ User & Sessions  │     │
│     └──────────────────┘      └──────────────────┘     │
└────────────────────────────────────────────────────────┘
```

- **Zero API Key Setup, no client-side secrets**: After `lumina login`, the CLI sends model requests to the Lumina server's proxy (`/api/ai/proxy/v1`) authenticated with your session; the server adds its Groq key, so the key never leaves the server. Requests are limited per user (30/min, 4 concurrent by default). If you set your own `GROQ_API_KEY`, the CLI calls Groq directly instead.
- **Production Backend by Default**: The CLI automatically connects to Lumina's cloud infrastructure (`https://lumina-cli.onrender.com`).
- **Local Tool Execution**: Tools run on the developer's own machine with the developer's permissions. File reads are confined to the current project (secret files such as `.env` are refused), code snippets run only after you approve them, and `lumina task` additionally gates every command through its safety policy.

---

## 🛠️ Monorepo Structure

```text
lumina/
├── client/                             # Next.js 16 Frontend Web Application (Port 3000)
│   ├── app/                            # Next.js App Router (sign-in, device approval)
│   ├── components/                     # UI components & theme provider
│   ├── lib/                            # Better Auth React client
│   └── package.json                    # Client dependencies
│
├── server/                             # Express 5 Backend API Server & CLI Package (Port 3005)
│   ├── prisma/                         # Database schema & migrations
│   ├── src/
│   │   ├── agent/                      # `lumina task` coding agent (loop, tools, policy, workspace guard)
│   │   ├── server/                     # Server config, AI proxy, rate limiter
│   │   ├── app.js                      # Express app factory (routes, CORS)
│   │   ├── cli/                        # Lumina CLI source code
│   │   │   ├── ai/                     # Groq AI Service (`streamText`, fallbacks)
│   │   │   ├── chat/                   # Interactive chat, tools & agent handlers
│   │   │   ├── commands/               # Commander action definitions (login, wakeup)
│   │   │   ├── ui/                     # Terminal UI (theme, ANSI markdown, components)
│   │   │   └── main.js                 # CLI binary executable entry point
│   │   ├── config/                     # Groq, tools, and agent schemas
│   │   ├── lib/                        # Auth, database, token store, and server resolution
│   │   ├── services/                   # Message and conversation persistence
│   │   └── index.js                    # Express server entry point
│   ├── tests/                          # node:test unit & integration tests
│   ├── scripts/verify.mjs              # Phased verification runner (npm run verify)
│   ├── .env.example                    # Server environment template
│   └── package.json                    # CLI npm package configuration
│
├── docs/AGENT_AUDIT.md                 # Audit, architecture and roadmap
├── .github/workflows/ci.yml            # CI: server tests (Linux/Windows) + client build
├── .env.example                        # Root environment template
└── README.md                           # Documentation
```

---

## 🛠️ Contributor & Developer Guide

> [!IMPORTANT]
> **The following section is strictly for contributors developing Lumina itself.**
> Normal end users do NOT need to clone this repository, run servers, or configure databases.

If you are contributing to Lumina or running the full stack locally:

### 1. Prerequisites
- **Node.js**: `>= 20` (CI runs Node 20 and 22)
- **PostgreSQL Database**: Free serverless instance on [Neon](https://neon.tech)
- **GitHub OAuth App**: Create at [GitHub Developer Settings](https://github.com/settings/developers)
- **Groq API Key**: Free key from [Groq Console](https://console.groq.com/keys)

---

### 2. Clone Repository & Install Dependencies

```bash
# Clone repository
git clone https://github.com/piyushkumariiitj/lumina-cli.git
cd lumina-cli

# Install server & CLI dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

---

### 3. Configure Server Environment Variables

Create `server/.env` based on `server/.env.example`:

```env
PORT=3005

# PostgreSQL Connection Strings (Neon DB)
DATABASE_URL="postgresql://username:password@ep-sample-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://username:password@ep-sample.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Better Auth (required — the server refuses to start without it)
BETTER_AUTH_SECRET="your_random_32_character_secret_key"
BETTER_AUTH_URL="http://localhost:3005"

# GitHub OAuth App Credentials
GITHUB_CLIENT_ID="your_github_oauth_client_id"
GITHUB_CLIENT_SECRET="your_github_oauth_client_secret"

# Groq AI Inference Engine
GROQ_API_KEY="gsk_your_groq_api_key"
LUMINA_MODEL="openai/gpt-oss-120b"
LUMINA_FALLBACK_MODEL="openai/gpt-oss-20b"

# Web Client URL
CLIENT_URL="http://localhost:3000"
```

> [!TIP]
> **GitHub OAuth Callback URL**: In your GitHub OAuth App settings, set the callback URL to:
> `http://localhost:3005/api/auth/callback/github`

---

### 4. Push Database Schema

Generate Prisma client and push the schema to your Neon PostgreSQL instance:

```bash
cd server
npx prisma db push
```

---

### 5. Start Backend Server & Frontend Client

```bash
# Terminal 1 - Start Express Backend Server (Port 3005)
cd server
npm run dev

# Terminal 2 - Start Next.js Web App (Port 3000)
cd client
npm run dev
```

---

### 6. Link and Test CLI Locally

```bash
cd server
npm link --force

# Test local CLI
lumina login --server-url http://localhost:3005
lumina wakeup
```

*(Alternatively, run directly with `node src/cli/main.js wakeup`)*

---

### 7. Verify Everything

```bash
cd server
npm test                 # unit & integration tests (no network, no database)
npm run verify           # phased checks: static, tests, CLI smoke, server smoke, client
npm run verify:live      # + real Groq calls through the proxy and live `lumina task` scenarios
```

| Phase | What it checks |
| :--- | :--- |
| 1. Static | Syntax of every source file, every module imports, CLI version matches `package.json` |
| 2. Tests | The full `node --test` suite: agent loop, safety policy, workspace guard, proxy, auth, AI service, prompts |
| 3. CLI smoke | Real `lumina` binary: help, task options, non-TTY guard, invalid workspace |
| 4. Server smoke | Real `src/index.js`: health, 401s for anonymous CLI routes, CORS allow-list, auth routes, refuses to boot without `BETTER_AUTH_SECRET` |
| 5. Client | `tsc --noEmit`, ESLint, and with `--with-build` a production `next build` |
| 6. Live proxy (`--live`) | Non-streaming, streaming and tool-calling requests through the proxy to Groq |
| 7. Live agent (`--live`) | Real `lumina task` runs, verified independently: bug fix, `--plan-only`, hidden acceptance check, destructive instructions, and a full run through the proxy with no client key |

Live phases use `GROQ_API_KEY` (or `server/.env`) and cost roughly 100k Groq tokens. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs phases 1–4 on Linux and Windows (Node 20 and 22) and builds the client.

---

## 🚀 Deploying the Server

Required environment: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GROQ_API_KEY`, `CLIENT_URL`. Optional proxy tuning and CORS settings are documented in [`server/.env.example`](server/.env.example).

- The server **fails to start** if `BETTER_AUTH_SECRET` is missing (it used to fall back to a public string).
- CLI requests are authenticated with `Authorization: Bearer <session token>` (Better Auth `bearer()` plugin). Cookies alone are not accepted on CLI routes.
- `/api/ai/config` no longer returns the Groq key. CLI versions ≤ 1.0.10 relied on that; to keep them working during a migration window set `LUMINA_LEGACY_KEY_HANDOUT=true`, then remove it. Because earlier versions handed the key to any signed-in user, **rotate `GROQ_API_KEY`** when deploying this change.
- The proxy's rate limits are in memory: run a single instance, or add a shared store before scaling out.

---

## 🗄️ Database Schema

The production schema in [`server/prisma/schema.prisma`](file:///d:/lumina/server/prisma/schema.prisma) defines:

- **`User`**: Developer account, name, email, avatar.
- **`Session`**: Active developer sessions and auth tokens.
- **`Account`**: Linked GitHub OAuth accounts and provider tokens.
- **`DeviceCode`**: RFC 8628 device verification codes, polling intervals, and claim status.
- **`Conversation`**: Saved chat and agent sessions.
- **`Message`**: Multi-turn dialogue history with JSON-structured tool and text payloads.

---

## 🎨 Terminal User Interface (TUI) Design System

Lumina includes a custom terminal theme in [`server/src/cli/ui/`](file:///d:/lumina/server/src/cli/ui/):

| Semantic Token | Color / Style | Purpose |
| :--- | :--- | :--- |
| **`accent`** | Amber (`#e8b339`) | Brand glyphs (`✦`) & headers |
| **`user`** | Mint Green (`#5fd75f`) | User prompts & inputs |
| **`agent`** | Violet (`#af87ff`) | AI assistant responses |
| **`tool`** | Steel Blue (`#5fafd7`) | Tool names & execution indicators |
| **`success`** | Light Green (`#5fd787`) | Success states & completion checkmarks |
| **`error`** | Coral Red (`#ff5f5f`) | Errors & exception details |
| **`warning`** | Soft Orange (`#ffaf5f`) | Rate limits & fallback model notices |
| **`muted`** | Subtle Grey (`#808080`) | Footers, shortcuts, & timestamps |

---

## 🐛 Troubleshooting & Solved Edge Cases

1. **Option Parsing Safety**: Commander options for `--server-url` use clean option flags without passing global object constructors as defaults.
2. **Offline & Client-Only DB Resilience**: The CLI utilizes an active proxy layer in `src/lib/db.js` so end users without `DATABASE_URL` never experience database connection crashes.
3. **Multi-Model Fallback**: The AI engine switches to the fallback model (`openai/gpt-oss-20b`) when the primary model is rate-limited, unavailable or times out. Other errors (invalid key, expired session) are reported with what to do next.
4. **ANSI Table Formatting**: Terminal markdown tables automatically convert to structured bullet lists (`• **Key**: Value`) to prevent terminal wrapping glitches.

---

## 👨‍💻 Author & License

**Piyush Kumar**  
B.Tech Student @ IIITDM Jabalpur  
GitHub: [@piyushkumariiitj](https://github.com/piyushkumariiitj)

Distributed under the [MIT License](LICENSE).
