# ✨ LuminaCLI

<p align="center">
  <b>An Autonomous AI Software Engineering Agent that helps developers build, analyze, debug, and automate software workflows directly from the terminal.</b>
</p>

<p align="center">
  TypeScript • Node.js • Gemini AI • Prisma • PostgreSQL • AI Agents
</p>

---

# 🚀 Overview

LuminaCLI is an AI-powered command-line software engineering agent designed to act as a personal AI developer assistant.

Unlike traditional AI chatbots that only provide answers, LuminaCLI can:

- Understand complex development tasks
- Plan solutions autonomously
- Generate and modify code
- Analyze existing repositories
- Execute development commands
- Use external tools
- Maintain conversation memory
- Assist throughout the software development lifecycle

The vision behind LuminaCLI is to create an AI agent that works alongside developers by combining Large Language Models with tools, memory, and automation.

---

# 🎯 Goals

LuminaCLI aims to provide:

- An intelligent terminal-based AI assistant
- Autonomous coding workflows
- Repository understanding
- Automated debugging
- AI-powered development automation
- Persistent project memory

---

# ✨ Features

# 🤖 1. AI Chat Assistant

LuminaCLI provides an interactive AI assistant inside the terminal.

Example:

```bash
lumina
```

Conversation:

```
> Explain this authentication system

Lumina:
The authentication system uses OAuth flow...
```

Capabilities:

- Natural conversations
- Programming assistance
- Technical explanations
- Code suggestions
- Documentation help

---

# 🧠 2. Autonomous AI Agent

LuminaCLI can independently solve complex tasks.

Example:

```
Create a complete REST API with authentication
```

Agent workflow:

```
User Request

        ↓

Task Understanding

        ↓

Planning

        ↓

Tool Selection

        ↓

Execution

        ↓

Testing

        ↓

Final Response
```

The agent decides:

- What steps are required
- Which tools to use
- How to verify results

---

# 🔧 3. Intelligent Tool Calling

LuminaCLI extends AI capabilities through tools.

Instead of only generating text, the agent can perform actions.

Supported tools:

- File operations
- Code execution
- Repository analysis
- Web search
- Git operations

Example:

```
Find and fix bugs in this project
```

Agent:

```
Analyzing files...

Running tests...

Finding issue...

Applying fix...
```

---

# 📁 4. File System Management

LuminaCLI can interact with local projects.

Capabilities:

✅ Read files  
✅ Create files  
✅ Update files  
✅ Delete files  
✅ Search project structure  


Example:

```
Create a React login component
```

Output:

```
Created:

src/components/Login.tsx
src/components/Login.css
```

---

# 💻 5. Code Generation

LuminaCLI can generate complete software components.

Examples:

```
Create an Express authentication API
```

```
Generate a React dashboard
```

```
Create database models
```

Capabilities:

- Generate files
- Modify existing code
- Follow project structure
- Create boilerplate

---

# ⚡ 6. Code Execution Engine

LuminaCLI can execute development commands.

Examples:

```
Run tests
```

```
Install dependencies
```

```
Build project
```

Supported operations:

- npm commands
- Scripts
- Testing
- Debugging workflows

---

# 🔍 7. Web Search Integration

LuminaCLI can access external information.

Capabilities:

- Search documentation
- Find solutions
- Retrieve technical information
- Understand latest libraries

Example:

```
Why is Prisma migration failing?
```

Agent:

```
Searching documentation...

Possible causes:
1. Schema mismatch
2. Database connection issue
```

---

# 🐙 8. GitHub Repository Analyzer

LuminaCLI can understand external repositories.

Example:

```
Analyze this GitHub repository
```

The agent can provide:

- Project overview
- Architecture explanation
- Technology analysis
- Code improvement suggestions
- Bug identification


Workflow:

```
Clone Repository

        ↓

Analyze Files

        ↓

Understand Architecture

        ↓

Generate Insights
```

---

# 🧠 9. Persistent Memory System

LuminaCLI remembers previous interactions.

Stores:

- Conversations
- User preferences
- Project context
- Previous tasks


Example:

First session:

```
I am building an ecommerce application
```

Later:

```
Add payment integration
```

LuminaCLI understands previous context.

---

# 🗄️ Database System

Persistent storage using:

- PostgreSQL
- Prisma ORM


Database entities:

```
User

Conversation

Message

Project

Tool Execution
```

---

# 🔐 10. Authentication System

Secure user authentication.

Features:

- OAuth authentication
- Device authorization flow
- User sessions
- Token management


Authentication flow:

```
User

 ↓

OAuth Provider

 ↓

Authorization Token

 ↓

Session Creation

 ↓

Database Storage
```

---

# 🎨 11. Modern CLI Experience

Designed for a beautiful terminal experience.

Features:

- Colored output
- Interactive prompts
- Progress indicators
- Status messages
- Error handling


Libraries:

- Chalk
- Boxen
- Clack Prompts
- Ora

---

# 🛡️ 12. Command Safety Layer

LuminaCLI prevents unsafe operations.

Example:

```
Delete production database
```

Agent:

```
⚠️ Warning

This operation may cause data loss.

Continue?
```

Safety levels:

```
SAFE

WARNING

DANGEROUS
```

---

# 🔄 13. Self Correction Loop

LuminaCLI can verify and improve its own output.

Workflow:

```
Generate Code

      ↓

Execute

      ↓

Observe Error

      ↓

Analyze

      ↓

Fix

      ↓

Repeat
```

Example:

```
Generated application failed.

Analyzing error...

Applying correction...
```

---

# 🏗️ Architecture

```
                    User
                      |
                      |
                CLI Interface
                      |
                      |
              Agent Controller
                      |
        --------------------------------
        |                              |
     Planner                       Executor
        |                              |
        |
       LLM
        |
 ------------------------------------------------
 |              |              |                |
Tools        Memory        Database          APIs
 |              |              |
Files       Context       PostgreSQL
Git         History
Shell
Search
```

---

# 🛠️ Tech Stack

## Core

- TypeScript
- Node.js


## AI

- Google Gemini API
- Vercel AI SDK


## CLI

- Commander.js


## Database

- PostgreSQL
- Prisma ORM


## Validation

- Zod


## Authentication

- OAuth 2.0


## Terminal UI

- Chalk
- Boxen
- Clack Prompts
- Ora

---

# 📂 Project Structure

```
lumina-cli/

src/

├── agent/
│   ├── agent.ts
│   ├── planner.ts
│   ├── executor.ts
│   └── memory.ts
│
├── tools/
│   ├── filesystem.ts
│   ├── github.ts
│   ├── shell.ts
│   └── search.ts
│
├── services/
│   ├── ai.service.ts
│   ├── database.service.ts
│   └── auth.service.ts
│
├── database/
│   └── schema.prisma
│
├── commands/
│   └── commands.ts
│
└── index.ts
```

---

# ⚙️ Installation

## Requirements

Install:

- Node.js >= 18
- PostgreSQL
- Git


Verify:

```bash
node -v

npm -v
```

---

# Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/lumina-cli.git

cd lumina-cli
```

---

# Install Dependencies

```bash
npm install
```

---

# Environment Setup

Create:

```
.env
```

Add:

```env
GEMINI_API_KEY=

DATABASE_URL=

AUTH_SECRET=
```

---

# Database Setup

Generate Prisma client:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate dev
```

---

# Running Application

Development:

```bash
npm run dev
```

Production:

```bash
npm run build

npm start
```

---

# Example Commands

Start agent:

```bash
lumina
```

Chat:

```
Explain this project
```

Generate:

```
Create authentication system
```

Analyze:

```
Analyze this repository
```

Debug:

```
Fix this error
```

---

# 🛣️ Development Roadmap

## Phase 1: Foundation

- [ ] TypeScript setup
- [ ] CLI framework
- [ ] Gemini integration
- [ ] Basic chat


## Phase 2: Agent System

- [ ] Agent loop
- [ ] Planning system
- [ ] Tool calling
- [ ] File operations


## Phase 3: Developer Tools

- [ ] Code execution
- [ ] GitHub analysis
- [ ] Web search
- [ ] Code generation


## Phase 4: Production Features

- [ ] PostgreSQL integration
- [ ] Prisma models
- [ ] Authentication
- [ ] Conversation history


## Phase 5: Advanced AI

- [ ] RAG system
- [ ] Vector database
- [ ] Multi-agent architecture
- [ ] Self-correction loops

---

# 📚 Learning Outcomes

This project covers:

## AI Engineering

- LLM APIs
- AI agents
- Tool calling
- Prompt engineering
- Memory systems


## Backend Engineering

- Node.js
- Databases
- Authentication
- System architecture


## Software Engineering

- TypeScript
- Clean architecture
- CLI development
- Production practices

---

# 👨‍💻 Author

**Piyush Kumar**

B.Tech Student @ IIITDM Jabalpur

Interested in:

- Artificial Intelligence
- Software Development
- Autonomous Agents

---

# ⭐ Vision

LuminaCLI represents the future of developer tooling where AI agents move beyond answering questions and actively collaborate with developers to build software.
