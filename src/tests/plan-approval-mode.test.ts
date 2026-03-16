import { describe, expect, test } from "bun:test";

import {
  getPlanApprovalChoices,
  getPlanRestoreLabel,
  resolvePlanExitMode,
} from "../cli/helpers/planApproval";

describe("plan approval mode restoration", () => {
  test("restore choice returns to the pre-plan mode", () => {
    expect(resolvePlanExitMode("restore", "bypassPermissions")).toBe(
      "bypassPermissions",
    );
    expect(resolvePlanExitMode("restore", "default")).toBe("default");
    expect(resolvePlanExitMode("restore", null)).toBe("default");
  });

  test("manual and auto-accept choices resolve correctly", () => {
    expect(resolvePlanExitMode("manual", "bypassPermissions")).toBe("default");
    expect(resolvePlanExitMode("manual", "acceptEdits")).toBe("default");
    expect(resolvePlanExitMode("autoAccept", "bypassPermissions")).toBe(
      "acceptEdits",
    );
    expect(resolvePlanExitMode("autoAccept", "default")).toBe("acceptEdits");
  });

  test("choices expose explicit yolo restore and omit duplicates", () => {
    expect(getPlanRestoreLabel("bypassPermissions")).toBe(
      "Yes, and return to yolo mode",
    );
    expect(getPlanRestoreLabel("acceptEdits")).toBe(
      "Yes, and return to auto-accept edits",
    );
    expect(getPlanRestoreLabel("default")).toBe(
      "Yes, and return to manual approvals",
    );

    expect(
      getPlanApprovalChoices("default").map((choice) => choice.decision),
    ).toEqual(["restore", "autoAccept", "custom"]);
    expect(
      getPlanApprovalChoices("acceptEdits").map((choice) => choice.decision),
    ).toEqual(["restore", "manual", "custom"]);
    expect(
      getPlanApprovalChoices("bypassPermissions").map(
        (choice) => choice.decision,
      ),
    ).toEqual(["restore", "manual", "autoAccept", "custom"]);
  });
});
