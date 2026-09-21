export const WORK_STATUSES = ["new", "in_progress", "blocked", "done", "needs_evidence", "unknown"] as const;
export const WORK_SOURCE_KINDS = ["manual", "slack", "google_meet"] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];
export type WorkSourceKind = (typeof WORK_SOURCE_KINDS)[number];
export const WORK_SLACK_NOTIFICATION_MODES = ["never", "completed", "completed_and_blocked"] as const;
export type WorkSlackNotificationMode = (typeof WORK_SLACK_NOTIFICATION_MODES)[number];

export type WorkAutomationSource = {
  id: string;
  client_id: string;
  channel_id: string;
  source_kind: Exclude<WorkSourceKind, "manual">;
  workspace_ref: string;
  source_ref: string;
  display_name: string;
  active: boolean;
  default_client_visible: boolean;
  last_ingested_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  slack_notification_mode: WorkSlackNotificationMode;
  slack_notification_thread_ts: string | null;
};

export type WorkChannel = {
  id: string;
  client_id: string;
  name: string;
  slug: string;
  description: string | null;
  source_kind: WorkSourceKind;
  external_ref: string | null;
  active: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkItem = {
  id: string;
  client_id: string;
  channel_id: string;
  title: string;
  now_text: string;
  next_text: string;
  blocker_text: string | null;
  owner_name: string | null;
  owner_user_id: string | null;
  status: WorkStatus;
  due_date: string | null;
  source_kind: WorkSourceKind;
  source_url: string | null;
  source_external_id: string | null;
  source_snapshot_json: Record<string, unknown>;
  automation_review_needed: boolean;
  automation_last_seen_at: string | null;
  completion_evidence_url: string | null;
  client_visible: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  dismissed_at?: string | null;
  dismissed_by_user_id?: string | null;
  dismissal_reason?: WorkDismissalReason | null;
  dismissal_note?: string | null;
};

export const WORK_DISMISSAL_REASONS = ["not_work", "no_longer_needed", "duplicate", "wrong_client", "other"] as const;
export type WorkDismissalReason = (typeof WORK_DISMISSAL_REASONS)[number];

export const WORK_NOTIFICATION_KINDS = ["assigned", "blocked", "review_needed", "watched_changed", "due_soon", "overdue", "channel_intake"] as const;
export type WorkNotificationKind = (typeof WORK_NOTIFICATION_KINDS)[number];

export type WorkNotification = {
  id: string;
  recipient_user_id: string;
  client_id: string;
  channel_id: string;
  item_id: string;
  event_id: string | null;
  kind: WorkNotificationKind;
  title: string;
  message: string;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
  client_name?: string;
  channel_name?: string;
  channel_slug?: string;
};

export type WorkNotificationPreferences = {
  user_id: string;
  email_enabled: boolean;
  digest_hour: number;
  timezone: string;
  assigned_enabled: boolean;
  blocked_enabled: boolean;
  review_enabled: boolean;
  due_enabled: boolean;
  channel_intake_enabled: boolean;
  updated_at: string;
};

export type WorkAssignableUser = { id: string; email: string; role: "admin" | "operator" | "viewer" };
export type WorkRoutingClient = { id: string; name: string; channels: WorkChannel[] };

export type WorkIngestItemInput = {
  externalId: string;
  title: string;
  nowText?: string;
  nextText?: string;
  blockerText?: string;
  ownerName?: string;
  status?: WorkStatus;
  dueDate?: string;
  sourceUrl?: string;
  completionEvidenceUrl?: string;
  clientVisible?: boolean;
  automationReviewNeeded?: boolean;
};

export type WorkIngestBatch = {
  sourceKind: Exclude<WorkSourceKind, "manual">;
  workspaceRef?: string;
  sourceRef: string;
  items: WorkIngestItemInput[];
};

export type WorkIngestResult = {
  source: Pick<WorkAutomationSource, "id" | "client_id" | "channel_id" | "display_name">;
  created: number;
  updated: number;
  proposed: number;
  unchanged: number;
  dismissed: number;
  items: Array<{ id: string; externalId: string; outcome: "created" | "updated" | "proposed" | "unchanged" | "dismissed" }>;
};

export type WorkReviewLink = {
  id: string;
  client_id: string;
  channel_id: string | null;
  item_id: string | null;
  label: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type WorkReviewSnapshot = {
  client: { id: string; name: string };
  channel: Pick<WorkChannel, "id" | "name" | "slug" | "description"> | null;
  label: string;
  generated_at: string;
  items: Array<
    Pick<
      WorkItem,
      | "id"
      | "title"
      | "now_text"
      | "next_text"
      | "blocker_text"
      | "owner_name"
      | "status"
      | "due_date"
      | "source_url"
      | "completion_evidence_url"
      | "updated_at"
    > & { channel_name: string }
  >;
};

export type WorkManagerSnapshot = {
  channels: WorkChannel[];
  items: WorkItem[];
  storageReady: boolean;
  storageError: string | null;
};
