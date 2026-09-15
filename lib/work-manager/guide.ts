import { getSupabaseAdminClient } from "@/lib/seo/db";

export const WORK_MANAGER_GUIDE_ID = "work-manager-v1";

export type WorkGuideStatus = "not_started" | "in_progress" | "dismissed" | "completed";

export type WorkGuideProgress = {
  guide_id: string;
  status: WorkGuideStatus;
  current_step: number;
  completed_at: string | null;
  dismissed_at: string | null;
  updated_at: string | null;
};

const EMPTY_PROGRESS: WorkGuideProgress = {
  guide_id: WORK_MANAGER_GUIDE_ID,
  status: "not_started",
  current_step: 0,
  completed_at: null,
  dismissed_at: null,
  updated_at: null,
};

export function workManagerGuideEnabled() {
  return process.env.WORK_MANAGER_GUIDE_ENABLED !== "false";
}

export function normalizeWorkGuideUpdate(input: { status?: unknown; currentStep?: unknown }) {
  const validStatuses: WorkGuideStatus[] = ["in_progress", "dismissed", "completed"];
  const status = validStatuses.includes(input.status as WorkGuideStatus)
    ? input.status as WorkGuideStatus
    : "in_progress";
  const requestedStep = Number(input.currentStep);
  const currentStep = Number.isInteger(requestedStep) ? Math.max(0, Math.min(4, requestedStep)) : 0;
  return { status, currentStep: status === "completed" ? 4 : currentStep };
}

function table() {
  return getSupabaseAdminClient().from("work_guide_progress");
}

export async function getWorkGuideProgress(userId: string): Promise<WorkGuideProgress> {
  if (!workManagerGuideEnabled()) return EMPTY_PROGRESS;
  const { data, error } = await table()
    .select("guide_id,status,current_step,completed_at,dismissed_at,updated_at")
    .eq("user_id", userId)
    .eq("guide_id", WORK_MANAGER_GUIDE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data as WorkGuideProgress : EMPTY_PROGRESS;
}

export async function saveWorkGuideProgress(
  userId: string,
  input: { status?: unknown; currentStep?: unknown }
): Promise<WorkGuideProgress> {
  if (!workManagerGuideEnabled()) return EMPTY_PROGRESS;
  const { status, currentStep } = normalizeWorkGuideUpdate(input);
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    guide_id: WORK_MANAGER_GUIDE_ID,
    status,
    current_step: currentStep,
    completed_at: status === "completed" ? now : null,
    dismissed_at: status === "dismissed" ? now : null,
    updated_at: now,
  };
  const { data, error } = await table()
    .upsert(row, { onConflict: "user_id,guide_id" })
    .select("guide_id,status,current_step,completed_at,dismissed_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as WorkGuideProgress;
}
