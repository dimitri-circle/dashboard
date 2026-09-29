"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { WorkItemActivityEvent, WorkItemComment, WorkSlackDelivery } from "@/lib/work-manager/types";

type ActivityPayload = { comments: WorkItemComment[]; activity: WorkItemActivityEvent[]; deliveries: WorkSlackDelivery[] };

export function WorkItemActivity({ itemId, clientId, canEdit, preview = false, defaultOpen = false, showToggle = true }: { itemId: string; clientId: string; canEdit: boolean; preview?: boolean; defaultOpen?: boolean; showToggle?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState("");
  const [shareWithClient, setShareWithClient] = useState(false);
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<ActivityPayload>({ comments: [], activity: preview ? [{ id: `preview-created-${itemId}`, action: "created", summary: "Work added from Slack", created_at: new Date().toISOString(), author_name: null }] : [], deliveries: [] });

  async function load() {
    if (preview) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/work-manager/items/${encodeURIComponent(itemId)}/activity`, { headers: { "x-seo-client-id": clientId } });
      const payload = await response.json() as ActivityPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load activity.");
      setData(payload);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load activity.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (preview) {
      setData((current) => current.activity.length ? current : { ...current, activity: [{ id: `preview-created-${itemId}`, action: "created", summary: "Work added from Slack", created_at: new Date().toISOString(), author_name: null }] });
      return;
    }
    if (open) void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, preview]);

  useEffect(() => setOpen(defaultOpen), [defaultOpen, itemId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      if (preview) {
        const comment: WorkItemComment = { id: `preview-comment-${Date.now()}`, item_id: itemId, author_name: "You", body: body.trim(), client_visible: shareWithClient, created_at: new Date().toISOString() };
        setData((current) => ({ ...current, comments: [...current.comments, comment] }));
        setBody("");
        setShareWithClient(false);
        setNotice("Preview comment added locally.");
        return;
      }
      const response = await fetch(`/api/work-manager/items/${encodeURIComponent(itemId)}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-seo-client-id": clientId },
        body: JSON.stringify({ body, clientVisible: shareWithClient }),
      });
      const payload = await response.json() as { comment?: WorkItemComment; error?: string };
      if (!response.ok || !payload.comment) throw new Error(payload.error || "Unable to add this comment.");
      setBody("");
      setShareWithClient(false);
      setNotice("Comment added.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to add this comment.");
    } finally { setSaving(false); }
  }

  async function retryDelivery(delivery: WorkSlackDelivery) {
    if (delivery.status === "uncertain" && !window.confirm("Slack may already have received this update. Check the original Slack thread first. Retry anyway?")) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/work-manager/items/${encodeURIComponent(itemId)}/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-seo-client-id": clientId },
        body: JSON.stringify({ deliveryId: delivery.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to retry this Slack update.");
      setNotice("Slack update retry submitted.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to retry this Slack update.");
    } finally { setSaving(false); }
  }

  return (
    <section className="work-item-activity" aria-label="Task activity">
      {showToggle ? <button className="work-text-button" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? "Hide activity" : "Comments and activity"}
      </button> : null}
      {open ? <div className="work-item-activity-panel">
        {loading ? <p role="status">Loading activity…</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {data.deliveries.map((delivery) => <div className="work-delivery-status" key={delivery.id} data-status={delivery.status}><span>Slack {delivery.kind} update: {delivery.status}{delivery.error_text ? ` — ${delivery.error_text}` : ""}</span>{canEdit && (delivery.status === "failed" || delivery.status === "uncertain") ? <button className="work-text-button" type="button" disabled={saving} onClick={() => void retryDelivery(delivery)}>{delivery.status === "uncertain" ? "Check and retry" : "Retry Slack update"}</button> : null}</div>)}
        <ol className="work-activity-timeline">
          {[...data.activity.map((entry) => ({ ...entry, kind: "event" as const })), ...data.comments.map((comment) => ({ ...comment, summary: `${comment.author_name}${comment.client_visible ? " · shared with client" : " · internal"}: ${comment.body}`, kind: "comment" as const }))].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((entry) => <li key={entry.id} data-shared={entry.kind === "comment" ? entry.client_visible : undefined}><span>{entry.summary}</span><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></li>)}
        </ol>
        {!loading && !data.activity.length && !data.comments.length && !data.deliveries.length ? <p>No activity yet. Add a note when something meaningful changes.</p> : null}
        {canEdit ? <form onSubmit={submit} className="work-activity-form">
          <label htmlFor={`work-comment-${itemId}`}>Add a comment</label>
          <textarea id={`work-comment-${itemId}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={3000} rows={2} placeholder="Add context, a decision, or a handoff…" required />
          <label className="work-activity-share"><input type="checkbox" checked={shareWithClient} onChange={(event) => setShareWithClient(event.target.checked)} /> Share this comment in the client view</label>
          <button className="button" type="submit" disabled={saving || !body.trim()}>{saving ? "Adding…" : "Add comment"}</button>
        </form> : null}
      </div> : null}
    </section>
  );
}
