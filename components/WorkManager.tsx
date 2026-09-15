"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { previewChannels, previewItems, previewSources } from "@/lib/work-manager/preview";
import type { WorkAssignableUser, WorkAutomationSource, WorkChannel, WorkItem, WorkStatus } from "@/lib/work-manager/types";

type WorkNotice = { type: "success" | "error" | "info"; message: string } | null;
type QuickEditor = { itemId: string; kind: "complete" | "block" } | null;

const statusLabels: Record<WorkStatus, string> = {
  new: "Ready to start",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  needs_evidence: "Needs evidence",
  unknown: "Needs clarification",
};

const statusOptions = Object.entries(statusLabels) as Array<[WorkStatus, string]>;

async function workApi<T>(clientId: string, path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-seo-client-id": clientId,
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let body = {} as T & { error?: string };
  if (text) {
    try {
      body = JSON.parse(text) as T & { error?: string };
    } catch {
      throw new Error(`Work Manager returned an unreadable response (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) throw new Error(body.error || `Request failed with HTTP ${response.status}.`);
  return body;
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDue(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`)
  );
}

function primaryAction(item: WorkItem) {
  if (item.status === "done") return { label: "Reopen", status: "in_progress" as WorkStatus };
  if (item.status === "blocked") return { label: "Resume", status: "in_progress" as WorkStatus };
  if (item.status === "in_progress" || item.status === "needs_evidence") return { label: "Complete", status: "done" as WorkStatus };
  return { label: "Start", status: "in_progress" as WorkStatus };
}

function proposedItem(item: WorkItem) {
  const proposal = item.source_snapshot_json || {};
  const text = (key: string, fallback: string | null) => typeof proposal[key] === "string" ? String(proposal[key]) : fallback;
  const proposedStatus = typeof proposal.status === "string" && statusOptions.some(([status]) => status === proposal.status)
    ? proposal.status as WorkStatus
    : item.status;
  return {
    ...item,
    title: text("title", item.title) || item.title,
    now_text: text("nowText", item.now_text) || "",
    next_text: text("nextText", item.next_text) || "",
    blocker_text: text("blockerText", item.blocker_text) || null,
    owner_name: text("ownerName", item.owner_name) || null,
    status: proposedStatus,
    due_date: text("dueDate", item.due_date) || null,
    source_url: text("sourceUrl", item.source_url) || null,
    completion_evidence_url: text("completionEvidenceUrl", item.completion_evidence_url) || null,
    client_visible: typeof proposal.clientVisible === "boolean" ? proposal.clientVisible : item.client_visible,
  };
}

function previewItemFromForm(clientId: string, item: WorkItem | null, formData: FormData): WorkItem {
  const timestamp = new Date().toISOString();
  const status = String(formData.get("status") || "new") as WorkStatus;
  return {
    id: item?.id || `preview-${Date.now()}`,
    client_id: clientId,
    channel_id: String(formData.get("channelId") || ""),
    title: String(formData.get("title") || "").trim(),
    now_text: String(formData.get("nowText") || "").trim(),
    next_text: String(formData.get("nextText") || "").trim(),
    blocker_text: String(formData.get("blockerText") || "").trim() || null,
    owner_name: String(formData.get("ownerName") || "").trim() || null,
    owner_user_id: String(formData.get("ownerUserId") || "").trim() || null,
    status,
    due_date: String(formData.get("dueDate") || "").trim() || null,
    source_kind: item?.source_kind || "manual",
    source_url: String(formData.get("sourceUrl") || "").trim() || item?.source_url || null,
    source_external_id: item?.source_external_id || null,
    source_snapshot_json: item?.source_snapshot_json || {},
    automation_review_needed: false,
    automation_last_seen_at: item?.automation_last_seen_at || null,
    completion_evidence_url: String(formData.get("completionEvidenceUrl") || "").trim() || null,
    client_visible: formData.get("clientVisible") === "on",
    created_by_user_id: item?.created_by_user_id || "preview-user",
    updated_by_user_id: "preview-user",
    created_at: item?.created_at || timestamp,
    updated_at: timestamp,
    completed_at: status === "done" ? item?.completed_at || timestamp : null,
  };
}

export function WorkManager({
  clientId,
  clientName,
  canEdit,
}: {
  clientId: string;
  clientName: string;
  canEdit: boolean;
}) {
  const [channels, setChannels] = useState<WorkChannel[]>([]);
  const [sources, setSources] = useState<WorkAutomationSource[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<WorkAssignableUser[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<WorkNotice>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [shareFormOpen, setShareFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [quickEditor, setQuickEditor] = useState<QuickEditor>(null);
  const [reviewUrl, setReviewUrl] = useState("");

  async function loadWorkManager() {
    try {
      setLoading(true);
      setNotice(null);
      const [channelBody, itemBody, sourceBody, userBody] = await Promise.all([
        workApi<{ channels: WorkChannel[] }>(clientId, "/api/work-manager/channels"),
        workApi<{ items: WorkItem[] }>(clientId, "/api/work-manager/items"),
        workApi<{ sources: WorkAutomationSource[] }>(clientId, "/api/work-manager/sources"),
        workApi<{ users: WorkAssignableUser[] }>(clientId, "/api/work-manager/users"),
      ]);
      setChannels(channelBody.channels);
      setItems(itemBody.items);
      setSources(sourceBody.sources);
      setAssignableUsers(userBody.users);
      const requestedItemId = new URLSearchParams(window.location.search).get("item");
      const requestedItem = itemBody.items.find((item) => item.id === requestedItemId);
      setSelectedChannelId((current) =>
        requestedItem?.channel_id || (current && channelBody.channels.some((channel) => channel.id === current)
          ? current
          : channelBody.channels[0]?.id || "")
      );
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to load Work Manager." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const isPreview = process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("preview") === "work-manager";
    setPreview(isPreview);
    setReviewUrl("");
    setEditorOpen(false);
    setEditingItem(null);
    setQuickEditor(null);

    if (isPreview) {
      const previewClientChannels = previewChannels.map((channel) => ({ ...channel, client_id: clientId }));
      setChannels(previewClientChannels);
      setItems(previewItems.map((item) => ({ ...item, client_id: clientId })));
      setSources(previewSources.map((source) => ({ ...source, client_id: clientId })));
      setAssignableUsers([{ id: "preview-user", email: "dimitri@circleclick.com", role: "admin" }]);
      setSelectedChannelId(previewClientChannels[0]?.id || "");
      setLoading(false);
      setNotice({ type: "info", message: "Preview mode uses local sample work and cannot change production data." });
      return;
    }

    loadWorkManager();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (loading) return;
    const itemId = new URLSearchParams(window.location.search).get("item");
    const item = items.find((candidate) => candidate.id === itemId);
    if (item) openEditItem(item);
    // Open once when a notification deep link resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const handleOpenItem = (event: Event) => {
      const itemId = (event as CustomEvent<{ itemId?: string }>).detail?.itemId;
      const item = items.find((candidate) => candidate.id === itemId);
      if (item) openEditItem(item);
    };
    window.addEventListener("work-manager:open-item", handleOpenItem);
    return () => window.removeEventListener("work-manager:open-item", handleOpenItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) || null;
  const selectedSources = sources.filter((source) => source.channel_id === selectedChannelId && source.active);
  const visibleItems = useMemo(
    () => items.filter((item) => !selectedChannelId || item.channel_id === selectedChannelId),
    [items, selectedChannelId]
  );
  const activeCount = visibleItems.filter((item) => item.status === "in_progress" || item.status === "new").length;
  const blockedCount = visibleItems.filter((item) => item.status === "blocked").length;
  const evidenceCount = visibleItems.filter((item) => item.status === "needs_evidence").length;

  function openNewItem() {
    setEditingItem(null);
    setEditorOpen(true);
    setShareFormOpen(false);
    setNotice(null);
    setQuickEditor(null);
    setSourceFormOpen(false);
  }

  function openEditItem(item: WorkItem) {
    setEditingItem(item);
    setSelectedChannelId(item.channel_id);
    setEditorOpen(true);
    setShareFormOpen(false);
    setNotice(null);
    setQuickEditor(null);
  }

  function openAutomationProposal(item: WorkItem) {
    openEditItem(proposedItem(item));
    setNotice({ type: "info", message: "The newest automation suggestion is prefilled. Save to accept it, or Cancel to keep the human update." });
  }

  async function updateItemQuickly(item: WorkItem, payload: Record<string, unknown>, message: string) {
    try {
      setSaving(true);
      let saved: WorkItem;
      if (preview) {
        const timestamp = new Date().toISOString();
        const status = (payload.status as WorkStatus | undefined) || item.status;
        saved = {
          ...item,
          status,
          blocker_text: payload.blockerText === undefined ? item.blocker_text : String(payload.blockerText || "").trim() || null,
          completion_evidence_url: payload.completionEvidenceUrl === undefined
            ? item.completion_evidence_url
            : String(payload.completionEvidenceUrl || "").trim() || null,
          automation_review_needed: false,
          updated_by_user_id: "preview-user",
          updated_at: timestamp,
          completed_at: status === "done" ? item.completed_at || timestamp : null,
        };
      } else {
        const body = await workApi<{ item: WorkItem }>(clientId, `/api/work-manager/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        saved = body.item;
      }
      setItems((current) => current.map((currentItem) => currentItem.id === saved.id ? saved : currentItem));
      setQuickEditor(null);
      setNotice({ type: "success", message });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to update this work." });
    } finally {
      setSaving(false);
    }
  }

  async function usePrimaryAction(item: WorkItem) {
    const action = primaryAction(item);
    if (action.status === "done") {
      setQuickEditor({ itemId: item.id, kind: "complete" });
      return;
    }
    await updateItemQuickly(
      item,
      { status: action.status, ...(item.status === "blocked" ? { blockerText: "" } : {}) },
      `${item.title} is now in progress.`
    );
  }

  async function submitQuickAction(event: FormEvent<HTMLFormElement>, item: WorkItem) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (quickEditor?.kind === "complete") {
      const completionEvidenceUrl = String(formData.get("completionEvidenceUrl") || "").trim();
      if (!completionEvidenceUrl) {
        setNotice({ type: "error", message: "Add a proof link before marking this Done." });
        return;
      }
      await updateItemQuickly(item, { status: "done", completionEvidenceUrl }, `${item.title} is Done, with proof attached.`);
      return;
    }
    const blockerText = String(formData.get("blockerText") || "").trim();
    if (!blockerText) {
      setNotice({ type: "error", message: "Say what would unblock this work." });
      return;
    }
    await updateItemQuickly(item, { status: "blocked", blockerText }, `${item.title} is marked Blocked.`);
  }

  async function saveChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    if (!name) {
      setNotice({ type: "error", message: "Channel name is required." });
      return;
    }

    try {
      setSaving(true);
      if (preview) {
        const timestamp = new Date().toISOString();
        const channel: WorkChannel = {
          id: `preview-channel-${Date.now()}`,
          client_id: clientId,
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          description: String(formData.get("description") || "").trim() || null,
          source_kind: "manual",
          external_ref: null,
          active: true,
          created_by_user_id: "preview-user",
          created_at: timestamp,
          updated_at: timestamp,
        };
        setChannels((current) => [...current, channel]);
        setSelectedChannelId(channel.id);
      } else {
        const body = await workApi<{ channel: WorkChannel }>(clientId, "/api/work-manager/channels", {
          method: "POST",
          body: JSON.stringify({ name, description: String(formData.get("description") || "") }),
        });
        setChannels((current) => [...current, body.channel].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedChannelId(body.channel.id);
      }
      form.reset();
      setChannelFormOpen(false);
      setNotice({ type: "success", message: `${name} is ready for work updates.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to create channel." });
    } finally {
      setSaving(false);
    }
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedChannelId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = String(formData.get("displayName") || "").trim();
    const sourceRef = String(formData.get("sourceRef") || "").trim();
    if (!displayName || !sourceRef) {
      setNotice({ type: "error", message: "Give the source a name and a stable channel or meeting reference." });
      return;
    }

    try {
      setSaving(true);
      let source: WorkAutomationSource;
      if (preview) {
        const timestamp = new Date().toISOString();
        source = {
          id: `preview-source-${Date.now()}`,
          client_id: clientId,
          channel_id: selectedChannelId,
          source_kind: String(formData.get("sourceKind")) === "google_meet" ? "google_meet" : "slack",
          workspace_ref: String(formData.get("workspaceRef") || "").trim(),
          source_ref: sourceRef,
          display_name: displayName,
          active: true,
          default_client_visible: formData.get("defaultClientVisible") === "on",
          last_ingested_at: null,
          created_by_user_id: "preview-user",
          created_at: timestamp,
          updated_at: timestamp,
        };
      } else {
        const body = await workApi<{ source: WorkAutomationSource }>(clientId, "/api/work-manager/sources", {
          method: "POST",
          body: JSON.stringify({
            channelId: selectedChannelId,
            sourceKind: String(formData.get("sourceKind") || "slack"),
            workspaceRef: String(formData.get("workspaceRef") || ""),
            sourceRef,
            displayName,
            defaultClientVisible: formData.get("defaultClientVisible") === "on",
          }),
        });
        source = body.source;
      }
      setSources((current) => [...current, source]);
      form.reset();
      setSourceFormOpen(false);
      setNotice({ type: "success", message: `${displayName} will route findings into ${selectedChannel?.name || "this workstream"}.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to connect this source." });
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const status = String(formData.get("status") || "new") as WorkStatus;
    const completionEvidenceUrl = String(formData.get("completionEvidenceUrl") || "").trim();
    const blockerText = String(formData.get("blockerText") || "").trim();
    if (status === "done" && !completionEvidenceUrl) {
      setNotice({ type: "error", message: "Add completion proof before marking this Done." });
      return;
    }
    if (status === "blocked" && !blockerText) {
      setNotice({ type: "error", message: "Describe what would unblock this work." });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        channelId: String(formData.get("channelId") || ""),
        title: String(formData.get("title") || ""),
        nowText: String(formData.get("nowText") || ""),
        nextText: String(formData.get("nextText") || ""),
        blockerText,
        ownerName: String(formData.get("ownerName") || ""),
        ownerUserId: String(formData.get("ownerUserId") || ""),
        status,
        dueDate: String(formData.get("dueDate") || ""),
        sourceUrl: String(formData.get("sourceUrl") || ""),
        completionEvidenceUrl,
        clientVisible: formData.get("clientVisible") === "on",
      };
      let saved: WorkItem;
      if (preview) {
        saved = previewItemFromForm(clientId, editingItem, formData);
      } else if (editingItem) {
        const body = await workApi<{ item: WorkItem }>(clientId, `/api/work-manager/items/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        saved = body.item;
      } else {
        const body = await workApi<{ item: WorkItem }>(clientId, "/api/work-manager/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        saved = body.item;
      }
      setItems((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current];
      });
      setSelectedChannelId(saved.channel_id);
      setEditorOpen(false);
      setEditingItem(null);
      setNotice({ type: "success", message: `${saved.title} was ${editingItem ? "updated" : "added"}.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save work." });
    } finally {
      setSaving(false);
    }
  }

  async function createReviewLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      setSaving(true);
      if (preview) {
        setReviewUrl(`${window.location.origin}/review/preview`);
      } else {
        const body = await workApi<{ token: string }>(clientId, "/api/work-manager/review-links", {
          method: "POST",
          body: JSON.stringify({
            channelId: formData.get("shareScope") === "channel" ? selectedChannelId : null,
            label: String(formData.get("label") || "Client work review"),
            expiresAt: String(formData.get("expiresAt") || "") || null,
          }),
        });
        setReviewUrl(`${window.location.origin}/review/${body.token}`);
      }
      setNotice({ type: "success", message: "Read-only client review link created. Copy it now; the token is not stored in plain text." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to create review link." });
    } finally {
      setSaving(false);
    }
  }

  async function copyReviewLink() {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setNotice({ type: "success", message: "Client review link copied." });
    } catch {
      setNotice({ type: "info", message: "Copy the review link from the field below." });
    }
  }

  return (
    <div className="page-workspace work-manager-workspace">
      <section className="work-command-bar" aria-label="Work Manager controls">
        <div>
          <span className="eyebrow">People-first project view</span>
          <h3>Keep every handoff visible.</h3>
          <p>One client, one workstream, and a plain answer to what is happening now and what comes next.</p>
        </div>
        <div className="work-command-actions">
          <button className="button button-primary" type="button" onClick={openNewItem} disabled={!canEdit || loading || !channels.length}>
            Add work update
          </button>
          <button className="button" type="button" onClick={() => { setShareFormOpen(true); setEditorOpen(false); }} disabled={!canEdit || loading}>
            Share client view
          </button>
        </div>
      </section>

      {notice ? <div className="alert work-manager-alert" data-type={notice.type} role="status">{notice.message}</div> : null}

      <section className="work-status-strip" aria-label="Selected channel status">
        <div><span>Client</span><strong>{clientName}</strong></div>
        <div><span>Workstream</span><strong>{selectedChannel?.name || (loading ? "Loading" : "Choose a channel")}</strong></div>
        <div><span>Moving</span><strong>{activeCount}</strong></div>
        <div data-tone={blockedCount ? "warn" : "neutral"}><span>Blocked</span><strong>{blockedCount}</strong></div>
        <div data-tone={evidenceCount ? "warn" : "neutral"}><span>Proof needed</span><strong>{evidenceCount}</strong></div>
      </section>

      <div className="work-manager-layout">
        <aside className="work-channel-panel" aria-label="Client work channels">
          <div className="work-panel-heading">
            <div><span className="eyebrow">Channels</span><h3>Workstreams</h3></div>
            {canEdit ? <button className="work-text-button" type="button" onClick={() => setChannelFormOpen((current) => !current)}>+ Add</button> : null}
          </div>
          {channelFormOpen ? (
            <form className="work-channel-form" onSubmit={saveChannel}>
              <label>Channel name<input name="name" placeholder="Video Queue" maxLength={80} required /></label>
              <label>What belongs here?<textarea name="description" rows={3} placeholder="A short sentence that helps people route work." /></label>
              <div><button className="button button-primary" type="submit" disabled={saving}>Create channel</button><button className="button" type="button" onClick={() => setChannelFormOpen(false)}>Cancel</button></div>
            </form>
          ) : null}
          <div className="work-channel-list" role="list">
            {channels.map((channel) => {
              const channelItems = items.filter((item) => item.channel_id === channel.id);
              const attention = channelItems.filter((item) => item.status === "blocked" || item.status === "needs_evidence").length;
              return (
                <button
                  className="work-channel-button"
                  data-active={channel.id === selectedChannelId}
                  key={channel.id}
                  type="button"
                  onClick={() => { setSelectedChannelId(channel.id); setEditorOpen(false); setEditingItem(null); }}
                >
                  <span><strong>{channel.name}</strong><small>{channel.description || "Client workstream"}</small></span>
                  <span className="work-channel-count" data-attention={attention > 0}>{attention || channelItems.length}</span>
                </button>
              );
            })}
            {!loading && !channels.length ? (
              <div className="work-empty-compact"><strong>No channels yet</strong><span>Create the first workstream to start adding updates.</span></div>
            ) : null}
          </div>
          {selectedChannel ? (
            <div className="work-source-panel">
              <div className="work-source-heading"><span className="eyebrow">Automation routes</span>{canEdit ? <button className="work-text-button" type="button" onClick={() => setSourceFormOpen((current) => !current)}>{sourceFormOpen ? "Close" : "+ Connect"}</button> : null}</div>
              {selectedSources.length ? selectedSources.map((source) => (
                <div className="work-source-route" key={source.id}>
                  <span aria-hidden="true">{source.source_kind === "slack" ? "#" : "◉"}</span>
                  <span><strong>{source.display_name}</strong><small>{source.source_kind === "slack" ? "Slack" : "Google Meet"} → {selectedChannel.name}{source.last_ingested_at ? ` · Seen ${formatUpdated(source.last_ingested_at)}` : " · Waiting for first update"}</small></span>
                </div>
              )) : <p>No automation source is routed here yet.</p>}
              {sourceFormOpen ? (
                <form className="work-source-form" onSubmit={saveSource}>
                  <label>Source type<select name="sourceKind" defaultValue="slack"><option value="slack">Slack channel</option><option value="google_meet">Google Meet</option></select></label>
                  <label>Human name<input name="displayName" placeholder="#ext-abk-video" maxLength={120} required /></label>
                  <label>Stable source ID<input name="sourceRef" placeholder="Slack channel ID or meeting series key" maxLength={220} required /></label>
                  <label>Workspace key <small>Optional</small><input name="workspaceRef" placeholder="circleclick" maxLength={220} /></label>
                  <label className="work-source-visible"><input name="defaultClientVisible" type="checkbox" /><span>New findings are client-visible by default</span></label>
                  <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Connecting…" : "Connect source"}</button>
                </form>
              ) : null}
            </div>
          ) : null}
        </aside>

        <section className="work-feed-panel" aria-labelledby="work-feed-title">
          <div className="work-panel-heading work-feed-heading">
            <div>
              <span className="eyebrow">{selectedChannel?.source_kind === "slack" ? "Slack-linked queue" : selectedChannel?.source_kind === "google_meet" ? "Meeting follow-ups" : "Team-maintained queue"}</span>
              <h3 id="work-feed-title">{selectedChannel?.name || "Work updates"}</h3>
              <p>{selectedChannel?.description || "Choose a channel to see its work."}</p>
            </div>
            {selectedChannel ? <span className="work-freshness">{visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}</span> : null}
          </div>

          {editorOpen ? (
            <WorkItemForm
              channels={channels}
              assignableUsers={assignableUsers}
              editingItem={editingItem}
              saving={saving}
              selectedChannelId={selectedChannelId}
              onCancel={() => { setEditorOpen(false); setEditingItem(null); }}
              onSubmit={saveItem}
            />
          ) : null}

          {shareFormOpen ? (
            <form className="work-share-panel" onSubmit={createReviewLink}>
              <div><span className="eyebrow">Client review</span><h4>Create a calm, read-only update</h4><p>Only items marked visible to the client will appear. Internal controls and notes stay private.</p></div>
              <div className="work-share-fields">
                <label>Link name<input name="label" defaultValue={`${clientName} work review`} maxLength={120} /></label>
                <label>Share scope<select name="shareScope" defaultValue={selectedChannelId ? "channel" : "client"}><option value="channel" disabled={!selectedChannelId}>This channel{selectedChannel ? ` — ${selectedChannel.name}` : ""}</option><option value="client">All client channels</option></select></label>
                <label>Optional expiry<input name="expiresAt" type="datetime-local" /></label>
              </div>
              <div className="work-share-actions"><button className="button button-primary" type="submit" disabled={saving}>Create review link</button><button className="button" type="button" onClick={() => { setShareFormOpen(false); setReviewUrl(""); }}>Close</button></div>
              {reviewUrl ? (
                <div className="work-share-result" role="status"><label>Read-only link<input readOnly value={reviewUrl} onFocus={(event) => event.currentTarget.select()} /></label><button className="button" type="button" onClick={copyReviewLink}>Copy link</button><a className="button" href={reviewUrl} target="_blank" rel="noreferrer">Preview</a></div>
              ) : null}
            </form>
          ) : null}

          {loading ? <div className="work-loading" role="status">Loading this client’s work…</div> : null}
          {!loading && selectedChannel && !visibleItems.length && !editorOpen ? (
            <div className="work-empty-state"><span aria-hidden="true">→</span><h4>Start with a real handoff.</h4><p>Add what is happening now, who owns it, and the very next step. The client view will stay empty until you choose to share an item.</p>{canEdit ? <button className="button button-primary" type="button" onClick={openNewItem}>Add the first update</button> : null}</div>
          ) : null}

          {!loading && visibleItems.length ? (
            <div className="work-item-list" role="list">
              {visibleItems.map((item) => (
                <article className="work-item-row" data-status={item.status} key={item.id} role="listitem">
                  <header>
                    <div className="work-item-title"><span className="work-status" data-status={item.status}>{statusLabels[item.status]}</span><h4>{item.title}</h4></div>
                    <div className="work-item-owner"><strong>{item.owner_name || "Owner to confirm"}</strong><span>{formatDue(item.due_date)}</span></div>
                  </header>
                  <div className="work-handoff">
                    <section><span>Now</span><p>{item.now_text || "No current update yet."}</p></section>
                    <span className="work-handoff-arrow" aria-hidden="true">→</span>
                    <section><span>Next</span><p>{item.next_text || "The next step has not been confirmed."}</p></section>
                  </div>
                  {item.blocker_text ? <p className="work-blocker"><strong>What would unblock this:</strong> {item.blocker_text}</p> : null}
                  {item.automation_review_needed ? (
                    <div className="work-automation-review" role="status">
                      <span><strong>New source update</strong>The automation found a change and kept the human update in place.</span>
                      {canEdit ? <button className="work-text-button" type="button" onClick={() => openAutomationProposal(item)}>Review suggestion</button> : null}
                    </div>
                  ) : null}
                  <footer>
                    <span>Updated {formatUpdated(item.updated_at)}</span>
                    <span>{item.client_visible ? "Visible in client review" : "Internal only"}</span>
                    {item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">Source</a> : null}
                    {canEdit ? (
                      <div className="work-quick-actions" aria-label={`Actions for ${item.title}`}>
                        <button className="button button-primary" type="button" disabled={saving} onClick={() => usePrimaryAction(item)}>{primaryAction(item).label}</button>
                        {item.status !== "blocked" && item.status !== "done" ? <button className="button" type="button" disabled={saving} onClick={() => setQuickEditor({ itemId: item.id, kind: "block" })}>Block</button> : null}
                        <button className="work-text-button" type="button" disabled={saving} onClick={() => openEditItem(item)}>Details</button>
                      </div>
                    ) : null}
                  </footer>
                  {quickEditor?.itemId === item.id ? (
                    <form className="work-quick-panel" onSubmit={(event) => submitQuickAction(event, item)}>
                      <label>
                        <span>{quickEditor.kind === "complete" ? "Paste the completion proof" : "What would unblock this?"}</span>
                        {quickEditor.kind === "complete"
                          ? <input autoFocus name="completionEvidenceUrl" type="url" placeholder="https://…" required />
                          : <input autoFocus name="blockerText" maxLength={1600} placeholder="One clear sentence" required />}
                      </label>
                      <div><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : quickEditor.kind === "complete" ? "Mark Done" : "Mark Blocked"}</button><button className="button" type="button" disabled={saving} onClick={() => setQuickEditor(null)}>Cancel</button></div>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function WorkItemForm({
  channels,
  assignableUsers,
  editingItem,
  saving,
  selectedChannelId,
  onCancel,
  onSubmit,
}: {
  channels: WorkChannel[];
  assignableUsers: WorkAssignableUser[];
  editingItem: WorkItem | null;
  saving: boolean;
  selectedChannelId: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="work-item-form" onSubmit={onSubmit} key={editingItem?.id || "new-work-item"}>
      <div className="work-form-heading"><div><span className="eyebrow">{editingItem ? "Update the handoff" : "Add work"}</span><h4>{editingItem ? editingItem.title : "What is moving?"}</h4></div><button className="work-text-button" type="button" onClick={onCancel}>Close</button></div>
      <div className="work-form-grid">
        <label className="work-form-wide">Work title<input name="title" defaultValue={editingItem?.title || ""} placeholder="Publish the customer interview" maxLength={180} required /></label>
        <label>Channel<select name="channelId" defaultValue={editingItem?.channel_id || selectedChannelId} required>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>
        <label>Person responsible<select name="ownerUserId" defaultValue={editingItem?.owner_user_id || ""}><option value="">Not assigned to a login</option>{assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></label>
        <label>Team or display name<input name="ownerName" defaultValue={editingItem?.owner_name || ""} placeholder="Optional team name" maxLength={120} /></label>
        <label>Status<select name="status" defaultValue={editingItem?.status || "new"}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Due date<input name="dueDate" type="date" defaultValue={editingItem?.due_date || ""} /></label>
        <label className="work-form-wide">What is happening now?<textarea name="nowText" defaultValue={editingItem?.now_text || ""} rows={3} placeholder="Use a sentence a teammate or client can understand without context." /></label>
        <label className="work-form-wide">What happens next?<textarea name="nextText" defaultValue={editingItem?.next_text || ""} rows={3} placeholder="Name the next observable handoff or decision." /></label>
        <label className="work-form-wide">Blocker or decision needed<textarea name="blockerText" defaultValue={editingItem?.blocker_text || ""} rows={2} placeholder="Required when status is Blocked." /></label>
        <label>Source link<input name="sourceUrl" type="url" defaultValue={editingItem?.source_url || ""} placeholder="https://…" /></label>
        <label>Completion proof<input name="completionEvidenceUrl" type="url" defaultValue={editingItem?.completion_evidence_url || ""} placeholder="Required for Done" /></label>
      </div>
      <label className="work-client-visible"><input name="clientVisible" type="checkbox" defaultChecked={editingItem?.client_visible ?? true} /><span><strong>Include in client review</strong><small>Shares only the fields shown in the read-only client view.</small></span></label>
      <div className="work-form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editingItem ? "Save update" : "Add work update"}</button><button className="button" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
