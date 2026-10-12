# Lumina CLI — Audit & Coding-Agent Plan

Audit date: 2026-10-11 · Commit audited: `bd93e92c` · Package: `@piyushkumariiitj/lumina-cli@1.0.10`

Everything below was verified by reading the code at that commit and, where noted, by running it
(`node` 22.15, `ai` 7.0.66, `@ai-sdk/groq` 4.0.28, live Groq calls with the dev key).

---

## 1. Architecture summary

```
client/  Next.js 16 app — only sign-in (GitHub via Better Auth) and device-code approval pages.
server/  ONE npm package that contains both:
  src/index.js            Express 5 API: /api/auth/* (Better Auth), /api/me, /api/ai/config, /device, /health
  src/lib/auth.js         Better Auth + Prisma adapter + deviceAuthorization plugin + GitHub provider
  src/lib/db.js           Prisma client over pg Pool; falls back to a no-op Proxy when DATABASE_URL is unset
  src/cli/main.js         `lumina` bin (commander): wakeup | login | logout | whoami
  src/cli/commands/       login/logout/whoami (device flow, token in ~/.better-auth/token.json), wakeup menu
  src/cli/ai/groq-service.js   AIService: key resolution + streamText wrapper
  src/cli/chat/*.js       three interactive modes: chat, tool chat, "agent" (app scaffolder)
  src/config/tool.config.js    7 tools for tool-chat mode
  src/config/agent.config.js   one-shot JSON app generator for agent mode
  src/services/chat-services.js  Conversation/Message persistence (Prisma)
prisma/   User/Session/Account/Verification/DeviceCode (Better Auth) + Conversation/Message
```

Traced request (tool mode): `lumina wakeup` → `wakeUpAction` (reads token file, optionally `GET /api/me`,
optionally queries Postgres **directly from the CLI**) → `startToolChat` → `AIService.sendMessage`
→ `ensureApiKey()` (env → `GET /api/ai/config` returns the **server's Groq key** → stored key → prompt)
→ `streamText` with tools → tools execute locally → if no text came back, a **second** model call
"synthesizes" an answer from JSON-dumped tool results → rendered with marked-terminal.

There is **no test suite, no CI workflow, and no lint/typecheck** for the server/CLI package
(`npm test` is the npm placeholder that exits 1).

---

## 2. Verified problems

Severity: **P0** = security hole or core feature broken · **P1** = correctness/robustness · **P2** = hygiene.

| # | Sev | Problem | Evidence |
|---|-----|---------|----------|
| 1 | P0 | **Server's Groq API key is handed to every signed-in user.** Any GitHub account can `lumina login` and read the provider key; the CLI then puts it in `process.env`, where every child process inherits it. | `server/src/index.js:45-63` returns `apiKey: process.env.GROQ_API_KEY`; consumed in `src/cli/ai/groq-service.js:42-62`. |
| 2 | P0 | **CORS reflects any origin with credentials.** Both branches of the origin callback allow; cookies are `SameSite=None; Secure`. A malicious site visited by a signed-in user can read `/api/ai/config` (the key) and `/api/me` (which includes the session token). | `server/src/index.js:16-28` (lines 20-23 both `callback(null, true)`), `src/lib/auth.js:25-31`. |
| 3 | P0 | **Tool calling is broken: every tool reaches the model with an empty schema.** Tools use the AI SDK v4 field `parameters`; SDK v7 reads `inputSchema` and substitutes `{type:"object",properties:{}}` when it's missing. Live run: the model's tool call arrived with `input: {}`. The code compensates by regex-guessing arguments from the user's last message (`lastUserQuery`). | `src/config/tool.config.js:28,117,190,246,292,331`; `node_modules/@ai-sdk/provider-utils/dist/index.js:2973-2978`; live probe output `TOOL CALL input: {}`. |
| 4 | P0 | **Multi-step tool loop never runs.** `maxSteps` is not a v7 option (default `stopWhen = stepCountIs(1)`), so the model never sees tool results; a second "synthesis" model call papers over it. `maxTokens` is also silently ignored (v7: `maxOutputTokens`). | `groq-service.js:215,226,263-312`; `node_modules/ai/dist/index.js:5247`. |
| 5 | P0 | **Unconfined file reads + unrestricted network fetch = exfiltration path.** `workspace_reader` resolves any path (e.g. `~/.better-auth/token.json`, `~/.ssh/*`); `fetch_url` sends to any URL; `web_search`/`fetch_url` content can carry prompt injection. | `tool.config.js:270` (`path.resolve(process.cwd(), targetPath)`), `:349`. |
| 6 | P0 | **Model-generated code runs through a shell with no approval.** `node -e "${code}"` / `python -c "${code}"` with only `"` escaped — `$()`/backticks/`%VAR%` still expand; no sandbox, no prompt. | `tool.config.js:144-170`. |
| 7 | P0 | **Agent-mode scaffolder can write outside the working directory.** `path.join(appDir, file.path)` with model-controlled `folderName`/`file.path` (`../../.bashrc` works). | `src/config/agent.config.js:27-38`. |
| 8 | P1 | **Model errors are masked and the fallback model is dead code.** `streamText` delivers provider errors as `error` stream parts, which the loop ignores, so a 429 or bad key surfaces as "Received an empty response from Groq API" (verified with a mock model throwing 429). The retry at `:348` also passes `true` into the `onToolResult` slot, so `isFallback` stays false. | `groq-service.js:235-255, 315-319, 348`. |
| 9 | P1 | **CLI loads the *target project's* `.env`.** `dotenv.config()` with no path reads `.env` from the user's cwd; a project `BETTER_AUTH_URL` then redirects `resolveServerUrl()` — the Lumina bearer token is sent to that project's server. | `src/config/groq.config.js:13`, `src/lib/server-url.js:13-14`. |
| 10 | P1 | Hard-coded fallback auth secret: if `BETTER_AUTH_SECRET` is missing in prod, sessions are signed with a public string. | `src/lib/auth.js:10`. |
| 11 | P1 | CLI connects to Postgres directly (with `rejectUnauthorized:false`) whenever `DATABASE_URL` is in env, instead of going through the API; when it isn't, a Proxy makes every DB call resolve `null`, so chat history is silently not saved. | `src/lib/db.js:13-51`; `login.js:300-327`; `wakeUp.js:65-90`; `chat-services.js:9-21`. |
| 12 | P1 | Token file written with default permissions (0644 on POSIX) and also stores the Groq key in plaintext. | `src/lib/token.js:15-35, 49-59`. |
| 13 | P1 | Version drift: package `1.0.10`, `lumina --version` prints `1.0.7`, banner prints `v1.0.0`. | `src/cli/main.js:21`, `src/cli/ui/components.js:11`. |
| 14 | P1 | README claims "Zero Client-Side Secrets" — false given #1. | `readme.md:165`. |
| 15 | P2 | No tests, no CI, no lint for the server/CLI package. | `server/package.json` `scripts.test`; no `.github/`. |
| 16 | P2 | Duplicated logic: `getUserFromToken` ×3, profile-sync block ×2, conversation init ×3. | `chat-with-ai*.js`, `login.js:274-327`, `wakeUp.js:39-90`. |
| 17 | P2 | Published CLI ships the Express server + Prisma and runs `prisma generate` on every end-user install. | `server/package.json` `files`, `scripts.postinstall`; `npm pack --dry-run`. |
| 18 | P2 | `/device` interpolates `user_code` into the redirect URL unencoded; `updateTitle` doesn't scope by user; several unused exports (`requireAuth`, `formatMessagesForAI`). | `src/index.js:65-68`, `chat-services.js:126-131`, `token.js:95-101`. |

What works today (verified): the device-flow login, `whoami`/`logout`, plain chat (live call returned `OK`),
Prisma schema/migrations, and the Next.js approval pages.

---

## 3. Prioritized backlog

**P0**
1. *(this slice)* `lumina task`: a bounded coding-agent loop (inspect → plan → edit → validate → repair → report) with workspace confinement, a command policy, approvals, limits, and harness-generated reports.
2. *(next slice)* Server-side model proxy `POST /api/ai/generate` (key never leaves the server, per-user rate/token limits); remove the key from `/api/ai/config` behind a deprecation flag; restrict CORS to the same allow-list as `trustedOrigins`; strip the session token from `/api/me`; **rotate the Groq key**, since every signed-in user has been able to read it.
3. Fix tool-chat tools: `parameters` → `inputSchema`, real multi-step via `stopWhen`, delete `lastUserQuery` heuristics, confine `workspace_reader` to the workspace using the agent's `Workspace` guard, gate `code_execution` behind approval (or remove it).
4. Confine the scaffolder's writes (reuse `Workspace.resolveWritable`).

**P1**
5. Surface stream `error` parts in `AIService.sendMessage`, fix the fallback call signature.
6. Don't load the cwd `.env` *(done in this slice — required for running inside user repos)*; fail closed when `BETTER_AUTH_SECRET` is unset in production.
7. Remove direct DB access from the CLI; persist conversations through authenticated API routes.
8. Token file `0600`; drop the stored Groq key once the proxy exists.
9. Single version source *(done in this slice)*.

**P2**
10. CI workflow (install, `npm test`, client lint/build); deduplicate auth/profile helpers; split the CLI into its own package without server deps or `postinstall`.
11. Agent follow-ups: resumable runs, per-run JSON transcripts, context summarization instead of truncation, `--revert` of agent-made changes, non-Node validation detection beyond the basics.

---

## 4. Coding-agent architecture (slice 1)

New code lives in `server/src/agent/`; the existing chat/tool/scaffolder modes are untouched.

```
lumina task "<task>"  ──►  cli/commands/ai/task.js  (options, approvals via @clack/prompts, rendering)
                                   │
                                   ▼
                          agent/agent-loop.js  runCodingTask()
          ┌──────────────┬────────┴─────────┬───────────────────┬────────────────┐
   model-client.js   tools.js           workspace.js       command-policy.js   report.js
   (Groq via AIService; (zod schemas;   (path confinement,  (blocked / allow /   (status from real
   neutral messages;     executors;      secret-file deny,   ask; exact-match     exit codes, git
   timeout+fallback)     phase gates)    git baseline/diff,  pre-approval)        diff stats)
                                         validation detect)  command-runner.js
                                                             (spawn, timeout, tree-kill,
                                                              output head/tail, env scrub)
```

Loop (single conversation, one model call per step):

1. **Inspect** — `list_files`, `read_file`, `search_code` (git-aware, size-capped).
2. **Plan** — model must call `submit_plan` (summary, steps, files, validation commands). Writes are rejected until the plan is approved (interactive prompt: approve / request changes / cancel; `--yes` auto-approves; `--plan-only` stops here).
3. **Implement** — `edit_file` (exact, unique-match replacement, CRLF-aware) or `write_file`; each write is confined to the workspace, size-limited, counted against a max-files limit, and needs approval if the file already had uncommitted changes.
4. **Validate** — `run_command` goes through the policy: destructive commands are blocked outright; read-only git is allowed; user-supplied `--validate` commands (and detected ones with `--yes`) are pre-approved; everything else asks, and is denied when non-interactive.
5. **Finish & verify** — when the model calls `finish`, the *harness* runs the validation commands itself (reusing a passing result only if nothing changed since). On failure it feeds the real output back for a bounded number of repair rounds.
6. **Report** — built by the harness from recorded exit codes and `git diff --numstat`, never from model text. The model's summary is shown, labeled as model-written.

Limits (flags): `--max-steps` 30, `--max-repairs` 2, `--max-tokens` 300k, `--command-timeout` 180 s, `--time-limit` 20 min, plus 20 files / 256 KB per write. Old tool outputs are truncated when the history grows large.

Model access in this slice reuses `AIService.ensureApiKey()`, so behavior matches the existing modes. `ModelClient` is a narrow interface (`generate({system, messages, tools})`), so the next slice can swap in the server proxy without touching the loop.

---

## 5. Testing & acceptance plan

`node --test` (built in, no new dependency). Unit: path confinement (traversal, absolute, symlink, `.git`, `.env`),
command policy (blocked/allowed/ask, chained commands), command runner (exit codes, timeout kill, truncation, env scrub),
edit semantics (unique/ambiguous/missing/CRLF), validation detection, model-client message mapping (AI SDK `MockLanguageModelV4`).
Integration (temp git repo + scripted fake model): success, repair-then-pass, repairs exhausted → `validation_failed`,
destructive command blocked, path escape rejected, write-before-plan rejected, dirty user file preserved, plan rejected,
step limit, non-interactive denial. Live: one real `lumina task` run against Groq on a fixture repo, inspected via `git diff`.

| Acceptance criterion | Verified by |
|---|---|
| Task submitted via CLI | `lumina task` command + live run |
| Files inspected & modified correctly | integration success test + live run diff |
| Validation actually executed | runner tests; report built from real exit codes |
| Failures handled within limits | repair/exhausted/step-limit tests |
| Unsafe ops blocked or approved | policy tests; blocked-command & path-escape integration tests |
| Inspectable via git diff | nothing is committed; report lists files; tests assert `git diff` |
| Automated tests | `npm test` in `server/` |
| Docs accurate | README "Coding agent" section |

---

## 6. Compatibility & migrations

* **No database migration** in this slice (runs are not persisted).
* No change to auth, the server API, or existing commands; `lumina task` is additive. The wakeup menu gains a "Code Task" entry.
* Behavior change: the CLI no longer reads `.env` from the directory it's run in (#9). Developers running from `server/` or the repo root are unaffected (those paths are still loaded explicitly). A user who relied on a project-level `.env` for `GROQ_API_KEY` must export it in the shell instead.
* Next slice (server proxy) **will** affect published CLIs ≤1.0.10, which expect `apiKey` from `/api/ai/config`. Plan: ship the proxy-aware CLI first, keep the old response behind `LUMINA_LEGACY_KEY_HANDOUT=true` for a deprecation window, then turn it off and rotate the key.

---

## 7. Slice 1 status (implemented 2026-10-11)

**Delivered:** `lumina task` (and a "Code Task" entry in `lumina wakeup`) backed by `server/src/agent/`:
`workspace.js`, `command-policy.js`, `command-runner.js`, `tools.js`, `model-client.js`, `agent-loop.js`,
`report.js`, `prompts.js`. Also: `lumina --version` and the banner now read `package.json` (#13), the CLI no
longer loads `.env` from the user's project (#9), `npm test` runs a real suite, and the README's false
"Zero Client-Side Secrets" / "sandboxed" claims were corrected (#14).

**Verification performed**

* `npm test` in `server/`: 42 tests, all passing (Windows 11, Node 22.15). Covers the success path,
  repair-then-pass, repairs exhausted, blocked destructive commands, path escapes, write-before-plan,
  dirty-file protection, plan rejection/revision, step and token limits, model errors, non-interactive denial,
  `--yes` pre-approval, CRLF edits, output truncation, timeouts, env scrubbing, and the AI SDK mapping
  (via `MockLanguageModelV4`, including that tool schemas are no longer empty).
* Mutation checks: making failed validation count as success breaks 2 loop tests; disabling both
  path-confinement layers breaks 4 tests.
* Live run against Groq (`openai/gpt-oss-120b`) on a fixture repo with a failing `slugify` test and an
  uncommitted user edit: 7 model calls, ~13.5k tokens, 52 s; status `passed`. Independently re-ran
  `npm test` (3/3 pass), confirmed the diff touched only `src/slugify.js`, the user's `notes.md` edit was
  intact, and nothing was committed.

**Not yet verified / known limitations**

* The interactive approval prompts (`@clack/prompts` select/confirm) were not exercised: this session had no
  TTY. Their decision logic is covered through the approver interface, but the prompt wiring itself
  should be tried by hand: `lumina task "..."` in a real terminal.
* The repair loop was verified with a scripted model only; the live run passed on the first attempt.
* Only tested on Windows. The POSIX process-group kill path in `command-runner.js` is untested.
* Model access still goes through `AIService.ensureApiKey()`, i.e. the server key handout (#1) — slice 2.
* Context control is truncation of old tool outputs, not summarization; long tasks on small rate limits
  may still hit provider token-per-minute limits (reported as `error` with the provider's reason).
* The command policy is a deny-list plus approvals, not a sandbox: an approved command runs with the
  user's permissions.

**Recommended next slice:** server-side model proxy + CORS allow-list + key rotation (backlog item 2),
then the tool-chat fixes (item 3), which can reuse `Workspace` and `classifyCommand`.

---

## 8. Hardening round (2026-10-11): status of every finding

Two further problems were found and fixed during this round:

* **#19 (P0) CLI authentication never worked against the server.** Better Auth only honours
  `Authorization: Bearer` with the `bearer()` plugin, which wasn't installed, and the CLI's hand-built cookie is
  unsigned. Proven with an in-memory Better Auth instance (`session resolved: false` → `true` after adding the
  plugin). Consequence before the fix: `/api/me` and `/api/ai/config` treated every CLI as anonymous.
* **#20 (P1) Web client:** `callbackUrl` on the sign-in page accepted absolute URLs (open redirect, mitigated by
  Better Auth's origin check); 16 ESLint errors in app code.

| # | Finding | Status |
|---|---------|--------|
| 1 | Server Groq key handed to clients | **Fixed** — `/api/ai/proxy/v1/chat/completions` adds the key server-side (auth, model allow-list, field allow-list, token cap, per-user RPM/concurrency, timeout, streaming). `/api/ai/config` no longer returns the key unless `LUMINA_LEGACY_KEY_HANDOUT=true`. **Rotate the key on deploy.** |
| 2 | CORS reflects any origin | **Fixed** — allow-list (`CLIENT_URL` + `CORS_ORIGINS`); CLI routes accept bearer tokens only (no cookie CSRF); `/api/me` no longer returns the session token |
| 3 | Tool schemas empty | **Fixed** — `inputSchema`; regex argument-guessing removed |
| 4 | No multi-step tool loop | **Fixed** — `stopWhen: stepCountIs(5)`; extra "synthesis" model call removed |
| 5 | Unconfined reads, unrestricted fetch | **Fixed** — `workspace_reader` uses the agent's `Workspace` guard; `fetch_url` blocks localhost/private IPs/redirects/non-http |
| 6 | Model code run via shell without approval | **Fixed** — shows code and asks; `execFile` without a shell; credentials scrubbed. Still not a sandbox. |
| 7 | Scaffolder path traversal | **Fixed** — sanitized folder name, never reuses a non-empty folder, every file confined; secrets/oversized/>100 files skipped |
| 8 | Errors masked, fallback dead | **Fixed** — stream `error` parts thrown, fallback on rate-limit/unavailable/timeout, actionable messages, no stack-trace dump |
| 9 | CLI loads target project's `.env` | **Fixed** (slice 1) |
| 10 | Hard-coded auth secret fallback | **Fixed** — server refuses to start without `BETTER_AUTH_SECRET` |
| 11 | CLI talks to Postgres directly | Open |
| 12 | Token file permissions | **Fixed** — `0600` file / `0700` dir (POSIX). A key entered at the prompt is still stored there in plaintext. |
| 13 | Version drift | **Fixed** (slice 1) |
| 14 | README security claims | **Fixed** |
| 15 | No tests / CI | **Fixed** — 74 automated tests, `npm run verify` (7 phases), GitHub Actions (Linux + Windows, Node 20/22, client build) |
| 16 | Duplicated helpers | Open |
| 17 | CLI package ships server + `postinstall` | Open |
| 18 | `/device` encoding / `updateTitle` scope / unused exports | `/device` **fixed**; others open |
| 19 | CLI auth broken (no `bearer()`) | **Fixed** |
| 20 | Client open redirect + lint errors | **Fixed** — same-site paths only; app code lint-clean (shadcn `components/ui` excluded as vendored) |
| — | `db.js` uses `ssl.rejectUnauthorized: false` | Open — not changed without testing against the production database |

**Verification (Windows 11, Node 22.15):**
`npm run verify -- --with-build`: 16/16 checks pass (phases 1–5). A CI-equivalent run with both `.env` files moved
aside also passed 13/13 (phases 1–4). `npm run verify:live`: 8/8 pass, including a full `lumina task` run that went through the
proxy with no key on the client (17 proxied model calls). The interactive approval prompts are now tested by driving the
real `@clack/prompts` UI with simulated keystrokes.

**Still not verified:** Linux/macOS (CI covers it once pushed; WSL here has no Node). The live harness-driven
repair path: in live runs the model fixed failures itself before finishing, so that path is covered by scripted tests only.
The device-flow login against a deployed server with real GitHub OAuth (needs a browser).

---

## 9. End-to-end testing of every feature (2026-10-13)

The real `lumina` binary was driven through its prompts (keystrokes over stdin) against the real Lumina app code
with an in-memory database, and real Groq calls went through the proxy with no key on the client.
**19/19 scenarios pass:** `--help`/`--version`; `whoami`/`wakeup` while logged out; device-code login (code claimed and
approved via the API, real user stored); `whoami` from the token and fetched from `/api/me`; logging in while already signed in;
wakeup → Status and → Exit; `/api/ai/config`; Chat mode with conversation memory; Tools mode with all 7 tools plus the
out-of-project refusal; Code Task from the menu with plan approval and "allow for this task" command approval (tests
fixed, the user's uncommitted edit kept, nothing committed); `lumina task` request-changes → plan-only, and cancel;
the app scaffolder; `logout`; a login denied in the browser; Ctrl+C during login.

Bugs found and fixed:

* **CLI never exited after a prompt when stdin is a pipe** (scripts, CI, `echo y | lumina logout`): `@clack/prompts`
  leaves stdin referenced. `main.js` now awaits the command and releases stdin.
* **Ctrl+C at "Open browser automatically?" didn't cancel `lumina login`**; it kept polling. It now exits.
* **Tools mode: the model called `workspace_reader` with `path` instead of `filePath`**; Groq rejected the whole turn
  (`tool_use_failed`) and the user saw a raw error. The parameter is now `path`, and a rejected tool call is retried
  once before a clear error is shown.

Regression tests: `tests/cli-process.test.js` (spawns the CLI: login, whoami, logout exit, Ctrl+C), plus a
tool-call-retry test in `tests/ai-service.test.js`. 79 tests in total.

Not covered: real GitHub OAuth sign-in on the website (needs the Claude in Chrome extension or a manual check), and
the deployed server, which still ran the old code at the time of testing. Local note: Windows reserves TCP ports
2946–3145 on the test machine, so the default dev ports 3000/3005 cannot bind there.
