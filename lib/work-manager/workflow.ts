import { WORKFLOW_STAGES, type WorkflowStage, type WorkItem, type WorkStatus } from "./types";

export const workflowStageLabels: Record<WorkflowStage, string> = {
  ready: "Ready",
  in_progress: "In Progress",
  client_review: "Client Review",
  done: "Done",
};

export function isWorkflowStage(value: unknown): value is WorkflowStage {
  return typeof value === "string" && WORKFLOW_STAGES.includes(value as WorkflowStage);
}

export function workflowStageFor(item: Pick<WorkItem, "status" | "workflow_stage">): WorkflowStage | null {
  if (item.workflow_stage !== undefined) return isWorkflowStage(item.workflow_stage) ? item.workflow_stage : null;
  if (item.status === "new") return "ready";
  if (item.status === "in_progress") return "in_progress";
  if (item.status === "done") return "done";
  return null;
}

export function workflowBadgeLabel(item: Pick<WorkItem, "status" | "workflow_stage">): string {
  if (item.status === "blocked") return "Blocked";
  if (item.status === "needs_evidence") return "Needs evidence";
  if (item.status === "unknown") return "Needs clarification";
  const stage = workflowStageFor(item);
  if (stage) return workflowStageLabels[stage];
  return item.status === "new" ? "Ready to start" : "Needs placement";
}

export function nextWorkflowStage(stage: WorkflowStage | null): WorkflowStage | null {
  if (!stage || stage === "done") return null;
  return WORKFLOW_STAGES[WORKFLOW_STAGES.indexOf(stage) + 1] || null;
}

export function statusForWorkflowStage(stage: WorkflowStage): WorkStatus {
  if (stage === "ready") return "new";
  if (stage === "done") return "done";
  return "in_progress";
}

export function workflowStageFromStatus(status: WorkStatus): WorkflowStage | null {
  if (status === "new") return "ready";
  if (status === "in_progress") return "in_progress";
  if (status === "done") return "done";
  return null;
}
