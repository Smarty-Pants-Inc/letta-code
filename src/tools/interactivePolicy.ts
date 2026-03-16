// Interactive tool capability policy shared across UI/headless/SDK-compatible paths.
// This avoids scattering name-based checks throughout approval handling.

function envFlagEnabled(name: string): boolean {
  const value = process.env[name];
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * Optional: auto-approve plan mode transitions.
 *
 * These tools were designed to require explicit user interaction, but for some
 * workflows (e.g. fully-autonomous local harness sessions) it's useful to
 * allow the agent to enter/exit plan mode without awaiting an approval prompt.
 */
export function shouldAutoApproveEnterPlanMode(): boolean {
  return (
    envFlagEnabled("LETTA_AUTO_APPROVE_PLAN_MODE") ||
    envFlagEnabled("LETTA_AUTO_APPROVE_ENTER_PLAN_MODE")
  );
}

export function shouldAutoApproveExitPlanMode(): boolean {
  return (
    envFlagEnabled("LETTA_AUTO_APPROVE_PLAN_MODE") ||
    envFlagEnabled("LETTA_AUTO_APPROVE_EXIT_PLAN_MODE")
  );
}

const INTERACTIVE_APPROVAL_TOOLS = new Set([
  "AskUserQuestion",
  "EnterPlanMode",
  "ExitPlanMode",
]);

const RUNTIME_USER_INPUT_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);

const HEADLESS_AUTO_ALLOW_TOOLS = new Set(["EnterPlanMode", "ExitPlanMode"]);

export function isInteractiveApprovalTool(toolName: string): boolean {
  return INTERACTIVE_APPROVAL_TOOLS.has(toolName);
}

export function requiresRuntimeUserInput(toolName: string): boolean {
  return RUNTIME_USER_INPUT_TOOLS.has(toolName);
}

export function isHeadlessAutoAllowTool(toolName: string): boolean {
  if (HEADLESS_AUTO_ALLOW_TOOLS.has(toolName)) return true;
  // Headless mode can't pause for UI prompts; allow optional auto-exit.
  if (toolName === "ExitPlanMode" && shouldAutoApproveExitPlanMode())
    return true;
  return false;
}
