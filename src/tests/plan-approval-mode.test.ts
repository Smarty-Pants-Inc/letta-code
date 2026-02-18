import { describe, expect, test } from "bun:test";

import {
  getPlanApprovalOption,
  resolvePlanExitMode,
} from "../cli/helpers/planApproval";

describe("plan approval mode restoration", () => {
  test("manual approval restores pre-plan mode", () => {
    expect(resolvePlanExitMode(false, "bypassPermissions")).toBe(
      "bypassPermissions",
    );
    expect(resolvePlanExitMode(false, "default")).toBe("default");
    expect(resolvePlanExitMode(false, null)).toBe("default");
  });

  test("auto-accept option forces acceptEdits", () => {
    expect(resolvePlanExitMode(true, "bypassPermissions")).toBe("acceptEdits");
    expect(resolvePlanExitMode(true, "default")).toBe("acceptEdits");
  });

  test("option mapping keeps manual on option 1 and auto-accept on option 2", () => {
    expect(getPlanApprovalOption(0)).toBe("manual");
    expect(getPlanApprovalOption(1)).toBe("autoAccept");
    expect(getPlanApprovalOption(2)).toBe("custom");
  });
});
