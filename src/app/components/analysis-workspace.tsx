"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AnalysisRequest, CompetitiveAnalysis, CompetitorInput } from "@/app/types";

const starterCompetitors: CompetitorInput[] = [
  { name: "", url: "" },
  { name: "", url: "" },
  { name: "", url: "" }
];

function emptyRequest(): AnalysisRequest {
  return {
    companyName: "",
    companyUrl: "",
    category: "",
    targetCustomer: "",
    reportGoal: "Find positioning gaps and create a client-ready competitive brief.",
    competitors: starterCompetitors
  };
}

export function AnalysisWorkspace() {
  const [form, setForm] = useState<AnalysisRequest>(emptyRequest);
  const [analysis, setAnalysis] = useState<CompetitiveAnalysis | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const validCompetitors = useMemo(
    () => form.competitors.filter((competitor) => competitor.url.trim()),
    [form.competitors]
  );

  function updateCompetitor(index: number, field: keyof CompetitorInput, value: string) {
    setForm((current) => ({
      ...current,
      competitors: current.competitors.map((competitor, competitorIndex) =>
        competitorIndex === index ? { ...competitor, [field]: value } : competitor
      )
    }));
  }

  function addCompetitor() {
    setForm((current) => ({
      ...current,
      competitors: [...current.competitors, { name: "", url: "" }].slice(0, 5)
    }));
  }

  async function submitAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          competitors: validCompetitors
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Analysis failed");
      }

      setAnalysis(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="workspace">
      <reactive-dot-ribbon
        background
        aria-hidden="true"
        source="/dots-pattern.webp"
        style={{
          "--dot-ribbon-aura-strength": "0.12",
          "--dot-ribbon-min-height": "100vh",
          opacity: 0.18
        } as React.CSSProperties}
      />

      <section className="workspace__intro" aria-labelledby="page-title">
        <p className="eyebrow">CircleClick Competitive Analysis</p>
        <h1 id="page-title">Evidence-backed competitor reports for startups and agencies.</h1>
        <p>
          Start with known competitors. The first loop fetches public page text, separates
          evidence from interpretation, and drafts a report you can edit.
        </p>
      </section>

      <section className="workspace__grid" aria-label="Competitive analysis workspace">
        <form className="brief-panel" onSubmit={submitAnalysis}>
          <div className="panel-heading">
            <p className="eyebrow">Research brief</p>
            <h2>Define the analysis.</h2>
          </div>

          <label>
            Company name
            <input
              value={form.companyName}
              onChange={(event) => setForm({ ...form, companyName: event.target.value })}
              placeholder="Acme Analytics"
              required
            />
          </label>

          <label>
            Company URL
            <input
              value={form.companyUrl}
              onChange={(event) => setForm({ ...form, companyUrl: event.target.value })}
              placeholder="https://example.com"
              required
            />
          </label>

          <div className="field-row">
            <label>
              Category
              <input
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder="B2B research software"
              />
            </label>

            <label>
              Target customer
              <input
                value={form.targetCustomer}
                onChange={(event) => setForm({ ...form, targetCustomer: event.target.value })}
                placeholder="Seed-stage founders, agencies"
              />
            </label>
          </div>

          <label>
            Report goal
            <textarea
              value={form.reportGoal}
              onChange={(event) => setForm({ ...form, reportGoal: event.target.value })}
              rows={3}
            />
          </label>

          <div className="competitor-list">
            <div className="competitor-list__header">
              <h3>Competitors</h3>
              <button type="button" onClick={addCompetitor} disabled={form.competitors.length >= 5}>
                Add
              </button>
            </div>

            {form.competitors.map((competitor, index) => (
              <div className="competitor-row" key={index}>
                <input
                  aria-label={`Competitor ${index + 1} name`}
                  value={competitor.name}
                  onChange={(event) => updateCompetitor(index, "name", event.target.value)}
                  placeholder="Name"
                />
                <input
                  aria-label={`Competitor ${index + 1} URL`}
                  value={competitor.url}
                  onChange={(event) => updateCompetitor(index, "url", event.target.value)}
                  placeholder="https://competitor.com"
                />
              </div>
            ))}
          </div>

          {error ? <p className="error-message">{error}</p> : null}

          <button className="primary-action" type="submit" disabled={isLoading}>
            {isLoading ? "Running analysis..." : "Generate analysis"}
          </button>
        </form>

        <ResultsPanel analysis={analysis} isLoading={isLoading} />
      </section>
    </main>
  );
}

function ResultsPanel({
  analysis,
  isLoading
}: {
  analysis: CompetitiveAnalysis | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section className="results-panel results-panel--empty">
        <p className="eyebrow">Processing</p>
        <h2>Collecting source pages and drafting the first comparison.</h2>
        <p>Keep this loop small. Bad sources should be visible before we trust insights.</p>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="results-panel results-panel--empty">
        <p className="eyebrow">Output</p>
        <h2>Your report draft will appear here.</h2>
        <p>
          The v1 goal is not a perfect market map. It is one useful, inspectable report
          from public evidence.
        </p>
      </section>
    );
  }

  return (
    <section className="results-panel">
      <div className="result-block result-block--lead">
        <p className="eyebrow">Executive summary</p>
        <h2>{analysis.executiveSummary}</h2>
        <p>{analysis.marketRead}</p>
      </div>

      <div className="result-block">
        <h3>Comparison matrix</h3>
        <div className="matrix">
          {analysis.matrix.map((row) => (
            <article className="matrix-row" key={row.competitor}>
              <div>
                <h4>{row.competitor}</h4>
                <p>{row.positioning}</p>
              </div>
              <dl>
                <dt>Audience</dt>
                <dd>{row.targetCustomer}</dd>
                <dt>Pricing signals</dt>
                <dd>{row.pricingSignals}</dd>
                <dt>Features</dt>
                <dd>{row.keyFeatures.join(", ") || "Unclear from current evidence"}</dd>
              </dl>
              <SourceLinks urls={row.sourceUrls} />
            </article>
          ))}
        </div>
      </div>

      <div className="result-block">
        <h3>Opportunity gaps</h3>
        <div className="opportunity-grid">
          {analysis.opportunities.map((opportunity) => (
            <article className="opportunity" key={opportunity.title}>
              <span>{opportunity.confidence}</span>
              <h4>{opportunity.title}</h4>
              <p>{opportunity.reasoning}</p>
              <SourceLinks urls={opportunity.supportingSources} />
            </article>
          ))}
        </div>
      </div>

      <div className="result-block">
        <h3>Report draft</h3>
        <div className="report-draft">
          <h4>{analysis.reportDraft.title}</h4>
          {analysis.reportDraft.sections.map((section) => (
            <article key={section.heading}>
              <h5>{section.heading}</h5>
              <p>{section.body}</p>
              <SourceLinks urls={section.sourceUrls} />
            </article>
          ))}
        </div>
      </div>

      <div className="result-block">
        <h3>Evidence status</h3>
        <div className="evidence-list">
          {analysis.evidence.map((source) => (
            <article className="evidence-item" key={`${source.name}-${source.url}`}>
              <span className={`status-pill status-pill--${source.status}`}>{source.status}</span>
              <div>
                <h4>{source.name}</h4>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                {source.error ? <p>{source.error}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SourceLinks({ urls }: { urls: string[] }) {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

  if (uniqueUrls.length === 0) {
    return <p className="source-links">No source attached</p>;
  }

  return (
    <p className="source-links">
      Sources:{" "}
      {uniqueUrls.map((url, index) => (
        <a href={url} target="_blank" rel="noreferrer" key={url}>
          {index + 1}
        </a>
      ))}
    </p>
  );
}
