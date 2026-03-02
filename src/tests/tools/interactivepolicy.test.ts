import { describe, expect, test } from "bun:test";
import {
  isHeadlessAutoAllowTool,
  isInteractiveApprovalTool,
  requiresRuntimeUserInput,
  shouldAutoApproveExitPlanMode,
} from "../../tools/interactivePolicy";

describe("interactive tool policy", () => {
  test("marks interactive approval tools", () => {
    expect(isInteractiveApprovalTool("AskUserQuestion")).toBe(true);
    expect(isInteractiveApprovalTool("EnterPlanMode")).toBe(true);
    expect(isInteractiveApprovalTool("ExitPlanMode")).toBe(true);
    expect(isInteractiveApprovalTool("TodoWrite")).toBe(false);
  });

  test("marks runtime user input tools", () => {
    expect(requiresRuntimeUserInput("AskUserQuestion")).toBe(true);
    expect(requiresRuntimeUserInput("ExitPlanMode")).toBe(true);
    expect(requiresRuntimeUserInput("EnterPlanMode")).toBe(false);
  });

  test("marks headless auto-allow tools", () => {
    expect(isHeadlessAutoAllowTool("EnterPlanMode")).toBe(true);
    expect(isHeadlessAutoAllowTool("AskUserQuestion")).toBe(false);
    expect(isHeadlessAutoAllowTool("ExitPlanMode")).toBe(false);
  });

  test("respects env: auto-allow ExitPlanMode in headless", () => {
    const original = process.env.LETTA_AUTO_APPROVE_EXIT_PLAN_MODE;
    try {
      delete process.env.LETTA_AUTO_APPROVE_EXIT_PLAN_MODE;
      expect(shouldAutoApproveExitPlanMode()).toBe(false);
      expect(isHeadlessAutoAllowTool("ExitPlanMode")).toBe(false);

      process.env.LETTA_AUTO_APPROVE_EXIT_PLAN_MODE = "1";
      expect(shouldAutoApproveExitPlanMode()).toBe(true);
      expect(isHeadlessAutoAllowTool("ExitPlanMode")).toBe(true);
    } finally {
      if (original == null) {
        delete process.env.LETTA_AUTO_APPROVE_EXIT_PLAN_MODE;
      } else {
        process.env.LETTA_AUTO_APPROVE_EXIT_PLAN_MODE = original;
      }
    }
  });
});
