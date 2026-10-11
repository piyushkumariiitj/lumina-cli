import { promises as fs } from "node:fs";
import path from "node:path";

const tail = (text, max) => (text && text.length > max ? `…${text.slice(-max)}` : text || "");

async function countLines(abs) {
  try {
    const content = await fs.readFile(abs, "utf8");
    if (!content) return 0;
    return content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0);
  } catch {
    return null;
  }
}

/**
 * Builds the final run report. File stats come from git; validation results come
 * from the commands the harness executed. Nothing here is taken from model text
 * except `agentSummary`, which is labeled as such when rendered.
 */
export async function buildReport({ task, workspace, state, limits, outcome, durationMs }) {
  const changedPaths = [...state.changedFiles.keys()];
  const numstat = await workspace.diffNumstat(changedPaths);

  const filesChanged = [];
  for (const rel of changedPaths) {
    const { action } = state.changedFiles.get(rel);
    let added = numstat.get(rel)?.added ?? null;
    let removed = numstat.get(rel)?.removed ?? null;
    if (added === null && action === "created") {
      added = await countLines(path.join(workspace.root, rel));
      removed = 0;
    }
    filesChanged.push({ path: rel, action, added, removed, hadUserChanges: state.baselineDirty.has(rel) });
  }

  const finalStatus = await workspace.gitStatus();
  const otherChanges = [...finalStatus.keys()].filter(
    (p) => !state.baselineDirty.has(p) && !state.changedFiles.has(p)
  );

  return {
    task,
    workspace: workspace.root,
    gitAvailable: workspace.isGitRepo,
    status: outcome.status,
    reason: outcome.reason,
    plan: state.plan,
    planApproved: state.planApproved,
    agentSummary: state.agentSummary,
    filesChanged,
    otherChanges,
    preexistingChanges: state.baselineDirty.size,
    verification: (state.verification ?? []).map((run) => ({ ...run, output: tail(run.output, 4000) })),
    commands: state.commands.map((c) => ({
      command: c.command,
      source: c.source,
      status: c.status,
      exitCode: c.exitCode ?? null,
      timedOut: Boolean(c.timedOut),
      durationMs: c.durationMs ?? 0,
      reason: c.reason,
    })),
    repairs: { used: state.repairs, max: limits.maxRepairs },
    steps: { used: state.steps, max: limits.maxSteps },
    tokens: { input: state.usage.inputTokens, output: state.usage.outputTokens, max: limits.maxTokens },
    durationMs,
  };
}
