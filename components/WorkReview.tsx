import type { WorkReviewSnapshot, WorkStatus } from "@/lib/work-manager/types";

const statusLabels: Record<WorkStatus, string> = {
  new: "Ready to start",
  in_progress: "In progress",
  blocked: "Needs attention",
  done: "Completed",
  needs_evidence: "Proof needed",
  unknown: "Needs clarification",
};

function formatDate(value: string | null) {
  if (!value) return "No date promised";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`)
  );
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function WorkReview({ snapshot }: { snapshot: WorkReviewSnapshot }) {
  const openItems = snapshot.items.filter((item) => item.status !== "done");
  const blockedItems = snapshot.items.filter((item) => item.status === "blocked");

  return (
    <main className="work-review-page">
      <header className="work-review-header">
        <div className="work-review-brand" aria-label="CircleClick client review">
          <span aria-hidden="true">CC</span>
          <div>
            <strong>CircleClick</strong>
            <small>Clear work, shared honestly</small>
          </div>
      </div>
        <div className="work-review-header-actions"><p>Read-only client view</p><a className="button" href="/">Open Work Manager</a></div>
      </header>

      <section className="work-review-intro" aria-labelledby="work-review-title">
        <div>
          <span className="eyebrow">{snapshot.client.name}</span>
          <h1 id="work-review-title">{snapshot.channel?.name || snapshot.label}</h1>
          <p>{snapshot.channel?.description || "A clear view of current work, next steps, and decisions that need attention."}</p>
        </div>
        <dl className="work-review-summary">
          <div><dt>Open</dt><dd>{openItems.length}</dd></div>
          <div><dt>Needs attention</dt><dd>{blockedItems.length}</dd></div>
          <div><dt>Last refreshed</dt><dd>{formatUpdated(snapshot.generated_at)}</dd></div>
        </dl>
      </section>

      <section className="work-review-list" aria-label="Shared work updates">
        {snapshot.items.length ? snapshot.items.map((item) => (
          <article className="work-review-item" key={item.id} data-status={item.status}>
            <header>
              <div>
                <span className="work-status" data-status={item.status}>{statusLabels[item.status]}</span>
                <h2>{item.title}</h2>
              </div>
              <div className="work-review-owner">
                <span>{item.owner_name || "Owner to confirm"}</span>
                <small>{formatDate(item.due_date)}</small>
              </div>
            </header>
            <div className="work-handoff">
              <section>
                <span>Now</span>
                <p>{item.now_text || "No current update yet."}</p>
              </section>
              <span className="work-handoff-arrow" aria-hidden="true">→</span>
              <section>
                <span>Next</span>
                <p>{item.next_text || "The next step has not been confirmed."}</p>
              </section>
            </div>
            {item.blocker_text ? (
              <p className="work-blocker"><strong>What would unblock this:</strong> {item.blocker_text}</p>
            ) : null}
            <footer>
              <span>{item.channel_name}</span>
              <span>Updated {formatUpdated(item.updated_at)}</span>
              {item.completion_evidence_url ? (
                <a href={item.completion_evidence_url} rel="noreferrer" target="_blank">View completion proof</a>
              ) : item.source_url ? (
                <a href={item.source_url} rel="noreferrer" target="_blank">View source</a>
              ) : null}
            </footer>
          </article>
        )) : (
          <div className="work-review-empty">
            <h2>Nothing is waiting here.</h2>
            <p>This shared view has no client-visible work yet.</p>
          </div>
        )}
      </section>

      <footer className="work-review-page-footer">
        <p>This link is read-only. Reply to your CircleClick contact if a priority or decision has changed.</p>
      </footer>
    </main>
  );
}
