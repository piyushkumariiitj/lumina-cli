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

### 3. Launch Lumina

Launch the interactive AI engineering environment:

```bash
lumina wakeup
```

```text
✦ Lumina CLI v1.0.5 • openai/gpt-oss-120b

  ✦ Developer <Active User>
  • Engine: openai/gpt-oss-120b  • Status: Active

? Select capability:
  ❯ 💬 Chat                  (Conversational AI with memory and code formatting)
    ⚡ Tools                 (Live web search, code execution, git, workspace reader)
    🤖 Agent                 (Autonomous project architect & code generator)
    ⚙  Status & Diagnostics  (Inspect profile, Groq model, and database connection)
    🚪 Exit
```

---

## 🕹️ Operating Modes

Lumina provides three distinct AI engineering modes:

### 1. 💬 Chat Mode (Persistent Conversational AI)
- Multi-turn conversational pair programmer for software architecture, debugging, and code reviews.
- Renders real-time ANSI syntax-highlighted code blocks, formatted lists, and responsive markdown.
- **In-Chat Commands**:
  - `/clear` — Clear terminal screen while preserving context.
  - `exit` or `quit` — Gracefully end the session.

### 2. ⚡ Tool Calling Mode (Real-Time Developer Tools)
Empowers the AI to autonomously inspect and interact with your local environment:
- 🌐 **Web & Google Search**: Fetch real-time documentation, package releases, and error solutions.
- ⚡ **Code Execution**: Execute sandboxed JavaScript (`node`) or Python (`python`) snippets to test algorithms and regex.
- 🧮 **Calculator & Math Engine**: Compute complex algebraic formulas and unit conversions.
- 📂 **Workspace File Reader**: Read project source files, `package.json`, and configs in your active directory.
- 🌿 **Git Inspector**: Check repository status, recent commits, current branch, and uncommitted diffs.
- 🔗 **Web URL Reader**: Fetch raw text or JSON data from any public HTTP/HTTPS URL.
- 🖥️ **System Diagnostics**: Inspect OS platform, Node version, memory, and working directory.

### 3. 🤖 Autonomous Agent Mode (Full-Stack Scaffolder)
Provide a high-level project prompt (e.g. *"Build a modern task tracker with Express, SQLite, and vanilla JS"*):
1. **Architects Application**: Designs folder hierarchy, file dependencies, and configuration.
2. **Generates Working Code**: Creates clean, un-truncated multi-file source code.
3. **Scaffolds to Disk**: Writes all directories and files directly into your active working directory.
4. **Provides Setup Commands**: Displays copy-pasteable execution instructions (e.g. `npm install && npm start`).

---

## 💻 CLI Command Reference

| Command | Options | Description |
| :--- | :--- | :--- |
| `lumina wakeup` | — | Launch interactive menu (Chat, Tools, Agent, Diagnostics) |
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
│  └───────────┬──────────────────────────┬───────────┘  │
│              │                          │              │
│              ▼                          ▼              │
│     ┌──────────────────┐      ┌──────────────────┐     │
│     │  Groq LPU Engine │      │ Neon PostgreSQL  │     │
│     │  AI Inference    │      │ User & Sessions  │     │
│     └──────────────────┘      └──────────────────┘     │
└────────────────────────────────────────────────────────┘
```

- **Zero Client-Side Secrets**: End users do not need to configure PostgreSQL, Neon DB, GitHub OAuth applications, or server secrets.
- **Production Backend by Default**: The CLI automatically connects to Lumina's production cloud infrastructure.
- **Local Tool Sandboxing**: Execution tools (like Python/JS snippets or reading workspace files) execute securely on the developer's local machine.

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
│   │   ├── cli/                        # Lumina CLI source code
│   │   │   ├── ai/                     # Groq AI Service (`streamText`, fallbacks)
│   │   │   ├── chat/                   # Interactive chat, tools & agent handlers
│   │   │   ├── commands/               # Commander action definitions (login, wakeup)
│   │   │   ├── ui/                     # Terminal UI (theme, ANSI markdown, components)
│   │   │   └── main.js                 # CLI binary executable entry point
│   │   ├── config/                     # Groq, tools, and agent schemas
│   │   ├── lib/                        # Auth, database, token store, and server resolution
│   │   ├── services/                   # Message and conversation persistence
│   │   └── index.js                    # Express application entry point
│   ├── .env.example                    # Server environment template
│   └── package.json                    # CLI npm package configuration
│
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
- **Node.js**: `>= 18.0.0`
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

# Better Auth
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
3. **Multi-Model Fallback on Groq Rate Limits (429)**: The AI engine automatically switches to `openai/gpt-oss-20b` if the primary model reaches temporary rate limits or quotas.
4. **ANSI Table Formatting**: Terminal markdown tables automatically convert to structured bullet lists (`• **Key**: Value`) to prevent terminal wrapping glitches.

---

## 👨‍💻 Author & License

**Piyush Kumar**  
B.Tech Student @ IIITDM Jabalpur  
GitHub: [@piyushkumariiitj](https://github.com/piyushkumariiitj)

Distributed under the [MIT License](LICENSE).
