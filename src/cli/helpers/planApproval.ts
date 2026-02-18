import type { PermissionMode } from "../../permissions/mode";

export const PLAN_APPROVAL_OPTION_LABELS = {
  manual: "Yes, and manually approve edits",
  autoAccept: "Yes, and auto-accept edits",
} as const;

export type PlanApprovalOption = "manual" | "autoAccept" | "custom";

export function getPlanApprovalOption(
  selectedOption: number,
): PlanApprovalOption | null {
  if (selectedOption === 0) return "manual";
  if (selectedOption === 1) return "autoAccept";
  if (selectedOption === 2) return "custom";
  return null;
}

export function resolvePlanExitMode(
  acceptEdits: boolean,
  modeBeforePlan: PermissionMode | null | undefined,
): PermissionMode {
  if (acceptEdits) {
    return "acceptEdits";
  }
  return modeBeforePlan ?? "default";
}
