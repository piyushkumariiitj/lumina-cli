# ✨ Lumina & LuminaCLI — Autonomous AI Software Engineering Agent & Web Platform

<p align="center">
  <b>An Autonomous AI Software Engineering Agent that helps developers build, analyze, debug, and automate workflows directly from the terminal, paired with a Next.js 16 & Express 5 Web Platform.</b>
</p>

<p align="center">
  TypeScript • Node.js • Gemini AI • Next.js 16 • React 19 • Express.js 5 • Better Auth • Prisma ORM • PostgreSQL (Neon) • Tailwind CSS
</p>

---

## 📋 Table of Contents

- [🚀 Overview](#-overview)
- [🎯 Core Goals](#-core-goals)
- [✨ Features & Agent Capabilities](#-features--agent-capabilities)
  - [🤖 1. AI Chat Assistant](#-1-ai-chat-assistant)
  - [🧠 2. Autonomous AI Agent Engine](#-2-autonomous-ai-agent-engine)
  - [🔧 3. Intelligent Tool Calling](#-3-intelligent-tool-calling)
  - [📁 4. File System Management](#-4-file-system-management)
  - [💻 5. Code Generation](#-5-code-generation)
  - [⚡ 6. Code Execution Engine](#-6-code-execution-engine)
  - [🔍 7. Web Search Integration](#-7-web-search-integration)
  - [🐙 8. GitHub Repository Analyzer](#-8-github-repository-analyzer)
  - [🧠 9. Persistent Memory System](#-9-persistent-memory-system)
  - [🔐 10. Authentication System](#-10-authentication-system)
  - [🎨 11. Modern CLI Experience](#-11-modern-cli-experience)
  - [🛡️ 12. Command Safety Layer](#-12-command-safety-layer)
  - [🔄 13. Self Correction Loop](#-13-self-correction-loop)
- [🏗️ Project Architecture & Monorepo Structure](#️-project-architecture--monorepo-structure)
- [🛠️ Technology Stack](#️-technology-stack)
- [🔐 Authentication Architecture](#-authentication-architecture)
  - [1. GitHub OAuth Social Authentication](#1-github-oauth-social-authentication)
  - [2. CLI Device Authorization Flow](#2-cli-device-authorization-flow)
- [🗄️ Database Schema & Models](#️-database-schema--models)
- [⚙️ Environment Variables Setup](#️-environment-variables-setup)
- [🛠️ Database Setup & Migrations](#️-database-setup--migrations)
- [🚀 Running the Application](#-running-the-application)
- [📡 API Endpoints Reference](#-api-endpoints-reference)
- [🐛 Common Issues & Troubleshooting](#-common-issues--troubleshooting)
- [👨‍💻 Author & Vision](#-author--vision)

---

## 🚀 Overview

**LuminaCLI** is an AI-powered command-line software engineering agent designed to act as a personal AI developer assistant. Unlike traditional AI chatbots that only provide text answers, LuminaCLI can:

- Understand complex development tasks
- Plan solutions autonomously
- Generate, edit, and refactor code
- Analyze existing repositories
- Execute development commands safely
- Use external tools (Search, Git, Shell, Filesystem)
- Maintain conversation memory
- Authenticate via GitHub OAuth and Device Authorization Flow

It pairs a terminal-based CLI agent with a full-stack web application featuring an **Express 5** backend server (powered by **Better Auth** and **Prisma ORM** over PostgreSQL) and a modern **Next.js 16** frontend dashboard (utilizing **React 19**, **Tailwind CSS**, and **Shadcn UI**).

---

## 🎯 Core Goals

- Provide an intelligent terminal-based AI software developer
- Enable autonomous coding workflows (Plan -> Execute -> Test -> Verify)
- Deep repository understanding and architecture analysis
- Automated bug detection and fixing
- Persistent project memory and context awareness

---

## ✨ Features & Agent Capabilities

### 🤖 1. AI Chat Assistant
Provides an interactive AI assistant inside the terminal.
```bash
lumina
```
```text
> Explain this authentication system

Lumina:
The authentication system uses OAuth 2.0 flow integrated with Better Auth...
```

### 🧠 2. Autonomous AI Agent Engine
Independently plans and executes multi-step engineering tasks.
```text
User Request -> Task Understanding -> Planning -> Tool Selection -> Execution -> Verification -> Final Response
```

### 🔧 3. Intelligent Tool Calling
Performs concrete actions rather than just generating text:
- File system operations (read, write, replace, list)
- Code execution and testing
- Repository analysis
- Web search
- Git version control

### 📁 4. File System Management
Read, create, update, delete, and search project files directly:
```text
Create a React login component
-> Created src/components/Login.tsx and src/components/Login.css
```

### 💻 5. Code Generation
Generates complete software components, REST APIs, database schemas, and boilerplate following project structure.

### ⚡ 6. Code Execution Engine
Executes development commands, runs tests, installs dependencies, and manages build workflows safely.

### 🔍 7. Web Search Integration
Searches online documentation and StackOverflow to solve errors and fetch up-to-date library usages.

### 🐙 8. GitHub Repository Analyzer
Clones and analyzes external GitHub repositories to provide architecture overviews, code quality insights, and bug identification.

### 🧠 9. Persistent Memory System
Remembers past conversations, user preferences, and project context across sessions.

### 🔐 10. Authentication System
Secure authentication powered by Better Auth featuring GitHub OAuth and CLI Device Authorization flow.

### 🎨 11. Modern CLI Experience
Designed for a beautiful terminal experience with colored output, interactive prompts, spinners, and structured boxes using Chalk, Boxen, Clack, and Ora.

### 🛡️ 12. Command Safety Layer
Prevents destructive or unsafe command execution with safety checks (SAFE, WARNING, DANGEROUS).

### 🔄 13. Self Correction Loop
Observes execution errors, analyzes failure outputs, and automatically applies code corrections.

---

## 🏗️ Project Architecture & Monorepo Structure

```text
lumina/
├── client/                             # Next.js 16 Frontend Web Application
│   ├── app/                            # Next.js App Router (Pages, Layouts & Sub-routes)
│   │   ├── (auth)/                     # Auth Route Group (sign-in layout & page)
│   │   ├── globals.css                 # Design System Tokens & Tailwind CSS Imports
│   │   ├── layout.tsx                  # Root App Layout (ThemeProvider & Toaster)
│   │   └── page.tsx                    # Protected Dashboard (Session Info & Logout)
│   ├── components/                     # Reusable UI Components
│   │   ├── login-form.tsx              # GitHub Login Button Component
│   │   ├── theme-provider.tsx          # React 19 compatible NextThemes Provider
│   │   └── ui/                         # Shadcn UI Primitives (Button, Card, Form, Toast, etc.)
│   ├── lib/                            # Frontend Utility Functions & Auth Client
│   │   ├── auth-client.ts              # Better Auth React Client Instance (`better-auth/react`)
│   │   └── utils.ts                    # Classname Merger (`clsx` + `tailwind-merge`)
│   └── package.json
│
├── server/                             # Express 5 Backend API Server
│   ├── prisma/                         # Prisma Database Setup & Schemas
│   │   ├── migrations/                 # Migration SQL Files
│   │   └── schema.prisma               # Prisma Data Models (User, Session, Account, etc.)
│   ├── src/
│   │   ├── lib/                        # Server Libraries & Configs
│   │   │   ├── auth.js                 # Better Auth Server Configuration & Device Flow Plugin
│   │   │   └── db.js                   # Prisma Client Singleton Instance
│   │   └── index.js                    # Express Application Entry Point & Routes
│   ├── .env                            # Backend Environment Variables
│   ├── prisma.config.js                # Prisma Configuration Setup
│   └── package.json                    # Server Dependencies & Scripts
│
└── README.md                           # Master Project Documentation
```

---

## 🛠️ Technology Stack

### Frontend (`client/`)
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **Next.js** | `16.3.0` | React Framework (App Router with Turbopack) |
| **React** | `19.2.8` | UI Library & DOM Reconciler |
| **Tailwind CSS** | `4.x` | Utility-first CSS Styling System |
| **Better Auth Client** | `1.6.27` | React Auth Hooks & Client State (`better-auth/react`) |
| **next-themes** | `0.4.6` | Hydration-safe Dark/Light Theme Switching |

### Backend (`server/`)
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.x` | JavaScript Runtime (ES Modules) |
| **Express** | `5.2.1` | HTTP Server & Web API Routing |
| **Better Auth Server** | `1.6.27` | Auth Engine, OAuth Handlers & Device Flow Plugin |
| **Prisma ORM** | `7.9.1` | Database ORM, Migrations & Client Generator |
| **PostgreSQL** | `Neon DB` | Cloud Serverless Relational Database |

---

## 🔐 Authentication Architecture

### 1. GitHub OAuth Social Authentication

```text
[ User Browser ]                  [ Next.js Client ]                [ Express Server ]              [ GitHub OAuth ]
       |                                  |                                 |                               |
       |--- Click "Continue with GitHub" ->|                                 |                               |
       |                                  |--- POST /api/auth/sign-in/social ->|                               |
       |                                  |    (provider: "github")         |                               |
       |                                  |                                 |--- Redirect to GitHub ------->|
       |<--------------------------------- Redirect User to GitHub Auth Page -------------------------------|
       |                                                                                                    |
       |--- User Approves App Permissions ----------------------------------------------------------------->|
       |                                                                                                    |
       |<--------------------------------- Redirect back to /api/auth/callback/github ----------------------|
       |                                                                                                    |
       |                                                                    |--- Exchange Code & Create Session -->
       |                                                                    |--- Store Session in PostgreSQL --->
       |<--------------------------------- Set HttpOnly Cookie & Redirect to / ----------------------------|
```

### 2. CLI Device Authorization Flow
Configured in `server/src/lib/auth.js` with the `deviceAuthorization` plugin:
- **Device Code Expiration**: 30 Minutes (`expiresIn: "30m"`)
- **Polling Interval**: 5 Seconds (`interval: "5s"`)
- **Device Table**: Stored in PostgreSQL `deviceCode` model for CLI token verification.

---

## 🗄️ Database Schema & Models

The PostgreSQL database schema is defined in [schema.prisma](file:///d:/lumina/server/prisma/schema.prisma):

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}

model DeviceCode {
  id              String    @id
  deviceCode      String
  userCode        String
  userId          String?
  expiresAt       DateTime
  status          String
  lastPolledAt    DateTime?
  pollingInterval Int?
  clientId        String?
  scope           String?

  @@map("deviceCode")
}

model Test {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
}
```

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the `server/` directory (`server/.env`):

```env
# Server Port
PORT=3005

# PostgreSQL Database Connection Strings (Neon DB)
DATABASE_URL="postgresql://neondb_owner:<password>@<host>/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://neondb_owner:<password>@<host>/neondb?sslmode=require"

# Better Auth Secret & Public URL
BETTER_AUTH_SECRET=your_generated_secret_key_here
BETTER_AUTH_URL=http://localhost:3005

# GitHub OAuth App Credentials
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

---

## 🛠️ Database Setup & Migrations

To set up the database:

1. **Navigate to the server directory:**
   ```bash
   cd server
   ```

2. **Generate the Prisma Client:**
   ```bash
   npx prisma generate
   ```

3. **Push Schema Models to Database (Neon PostgreSQL):**
   ```bash
   npx prisma db push
   ```

4. *(Optional)* Regenerate Better Auth schema models if updating plugins:
   ```bash
   npx @better-auth/cli generate --config ./src/lib/auth.js
   ```

---

## 🚀 Running the Application

### 1. Launch the Backend API Server
```bash
cd server
npm run dev
```
*Server will listen at `http://localhost:3005`.*

### 2. Launch the Next.js Client
```bash
cd client
npm run dev
```
*Client will listen at `http://localhost:3000`.*

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server Health Check (`OK`) |
| `GET` | `/api/me` | Fetch Current Authenticated User Session |
| `POST` | `/api/auth/sign-in/social` | Initiate OAuth Flow (`{ provider: "github", callbackURL: "http://localhost:3000" }`) |
| `GET` | `/api/auth/callback/github` | Better Auth OAuth Callback Endpoint |
| `POST` | `/api/auth/sign-out` | Destroy Session & Revoke Auth Cookies |
| `ALL` | `/api/auth/*` | Better Auth Express Request Handler |

---

## 🐛 Common Issues & Troubleshooting

### 1. `Cannot find name 'ThemeProvider'`
- **Fix**: Ensure `ThemeProvider` is imported from `@/components/theme-provider` inside `app/layout.tsx`.

### 2. `Encountered a script tag while rendering React component`
- **Fix**: In React 19 / Next.js 16, pass `scriptProps={{ async: true }}` to `<NextThemesProvider>` inside `components/theme-provider.tsx` and place `<ThemeProvider>` inside `<body>` in `app/layout.tsx`.

### 3. `Model verification does not exist in the database`
- **Fix**: Run `npx @better-auth/cli generate` followed by `npx prisma db push` and `npx prisma generate` in the `server` directory to update Prisma models.

---

## 👨‍💻 Author & Vision

**Piyush Kumar**  
B.Tech Student @ IIITDM Jabalpur  
GitHub: [@piyushkumariiitj](https://github.com/piyushkumariiitj)

> *LuminaCLI represents the future of developer tooling where AI agents move beyond answering questions and actively collaborate with developers to build software.*
