import type { PermissionMode } from "../../permissions/mode";

export type PlanApprovalDecision = "restore" | "manual" | "autoAccept";

export type PlanApprovalChoice = {
  decision: PlanApprovalDecision | "custom";
  label: string;
};

function normalizeModeBeforePlan(
  modeBeforePlan: PermissionMode | null | undefined,
): PermissionMode {
  if (!modeBeforePlan || modeBeforePlan === "plan") return "default";
  return modeBeforePlan;
}

export function getPlanRestoreLabel(
  modeBeforePlan: PermissionMode | null | undefined,
): string {
  const prev = normalizeModeBeforePlan(modeBeforePlan);

  switch (prev) {
    case "bypassPermissions":
      return "Yes, and return to yolo mode";
    case "acceptEdits":
      return "Yes, and return to auto-accept edits";
    case "default":
    case "plan":
      return "Yes, and return to manual approvals";
  }
}

export function getPlanApprovalChoices(
  modeBeforePlan: PermissionMode | null | undefined,
): PlanApprovalChoice[] {
  const prev = normalizeModeBeforePlan(modeBeforePlan);

  const choices: PlanApprovalChoice[] = [
    {
      decision: "restore",
      label: getPlanRestoreLabel(prev),
    },
  ];

  if (prev !== "default") {
    choices.push({
      decision: "manual",
      label: "Yes, and manually approve edits",
    });
  }

  if (prev !== "acceptEdits") {
    choices.push({
      decision: "autoAccept",
      label: "Yes, and auto-accept edits",
    });
  }

  choices.push({
    decision: "custom",
    label: "custom",
  });

  return choices;
}

export function resolvePlanExitMode(
  decision: PlanApprovalDecision,
  modeBeforePlan: PermissionMode | null | undefined,
): PermissionMode {
  const prev = normalizeModeBeforePlan(modeBeforePlan);

  if (decision === "restore") return prev;
  if (decision === "manual") return "default";
  return "acceptEdits";
}
