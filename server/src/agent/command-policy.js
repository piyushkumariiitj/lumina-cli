/**
 * Decides whether a shell command proposed by the model may run.
 *
 *   blocked — never executed (destructive, irreversible, privileged, or publishes)
 *   allow   — runs without asking (read-only git, or exactly matches a pre-approved command)
 *   ask     — needs explicit user approval; denied when running non-interactively
 *
 * The block list is checked first, against the whole command string, so chaining a
 * blocked command onto an approved one (`npm test && git push`) is still blocked.
 */

const GIT = String.raw`\bgit\b[^|;&\n]*\s`;

const BLOCK_RULES = [
  [/\brm\s+(?:-\w+\s+)*(?:-\w*[rR]\w*|--recursive)\b/, "recursive delete"],
  [/\b(?:rmdir|rd)\s+\/s\b/i, "recursive delete"],
  [/\bdel\s+.*\/s\b/i, "recursive delete"],
  [/\bremove-item\b.*-recurse/i, "recursive delete"],
  [/\b(?:mkfs(?:\.\w+)?|fdisk|diskpart)\b|\bformat\s+[a-z]:/i, "disk formatting"],
  [/\bdd\s+if=/i, "raw disk write"],
  [/\bshred\b/i, "secure delete"],
  [/\b(?:sudo|doas|runas)\b|\bsu(?:\s|$)/i, "privilege escalation"],
  [/\b(?:shutdown|reboot|halt|poweroff)\b/i, "system power control"],
  [/\b(?:kill|pkill|killall|taskkill)\b/i, "kills processes"],
  [new RegExp(`${GIT}push\\b`, "i"), "git push publishes changes"],
  [
    new RegExp(
      `${GIT}(?:reset|clean|checkout|switch|restore|stash|rebase|merge|cherry-pick|revert|am|filter-branch|filter-repo|update-ref|reflog|gc|prune|worktree)\\b`,
      "i"
    ),
    "git command that rewrites history or discards working-tree changes",
  ],
  [new RegExp(`${GIT}(?:branch|tag)\\b.*\\s(?:-[dD]|--delete)\\b`), "deletes a git branch or tag"],
  [/\bgit\b.*\bconfig\b.*--(?:global|system)\b/i, "changes global git configuration"],
  [/\b(?:npm|pnpm|yarn|bun)\s+(?:publish|unpublish|deprecate|owner|dist-tag|adduser|login|logout|token)\b/i, "package registry or account operation"],
  [/\b(?:npm|pnpm|yarn)\s+(?:config\s+set|set)\b/i, "changes package manager configuration"],
  [/\b(?:cargo|gem|twine|poetry)\s+(?:publish|push|upload)\b/i, "publishes a package"],
  [/\bdocker\s+(?:push|rm|rmi|system\s+prune|volume\s+rm)\b/i, "destructive or publishing docker operation"],
  [/\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b.*\|\s*(?:sh|bash|zsh|pwsh|powershell|iex|python\d?|node)\b/i, "pipes a download into an interpreter"],
  [/\b(?:iex|invoke-expression)\b/i, "Invoke-Expression"],
  [/\b(?:chmod|chown)\s+(?:-\S*R|.*\b777\b)/, "recursive or world-writable permission change"],
  [/\b(?:crontab|setx|schtasks)\b|\breg\s+(?:add|delete)\b/i, "persistent system configuration"],
  [/:\(\)\s*\{.*\};\s*:/, "fork bomb"],
];

// Shell operators: chaining, pipes, redirection, substitution.
const SHELL_OPERATORS = /[;&|<>`\n\r]|\$\(/;

// Read-only git subcommands that can run without asking.
const READ_ONLY_GIT = /^git\s+(?:status|diff|log|show|ls-files|rev-parse)(?:\s|$)/i;
// Options that make otherwise read-only git commands write files or run programs.
const UNSAFE_GIT_OPTIONS = /(?:^|\s)(?:--output\b|-O|--open-files-in-pager|--ext-diff)/;

export function normalizeCommand(command) {
  return String(command ?? "").trim().replace(/[ \t]+/g, " ");
}

export function classifyCommand(command, { preApproved = new Set() } = {}) {
  const normalized = normalizeCommand(command);
  if (!normalized) return { decision: "blocked", reason: "empty command" };
  if (normalized.length > 2000) return { decision: "blocked", reason: "command is too long" };

  for (const [re, reason] of BLOCK_RULES) {
    if (re.test(normalized)) return { decision: "blocked", reason };
  }

  if (preApproved.has(normalized)) return { decision: "allow", reason: "pre-approved" };

  const usesOperators = SHELL_OPERATORS.test(normalized);
  if (!usesOperators && READ_ONLY_GIT.test(normalized) && !UNSAFE_GIT_OPTIONS.test(normalized)) {
    return { decision: "allow", reason: "read-only git command" };
  }

  return {
    decision: "ask",
    reason: usesOperators ? "uses shell operators" : "not pre-approved",
  };
}
