"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from "react-joyride";

type Provider = "ga4" | "gtm" | "hotjar" | "openai" | "mcp";
type Status = "disconnected" | "connected" | "error";
type View = "overview" | "clients" | "integrations" | "analysis" | "insights";

type Client = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Integration = {
  id: string;
  provider: Provider;
  display_name: string;
  status: Status;
  config_json: Record<string, unknown>;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  has_secret: boolean;
};

type Insight = {
  id: string;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  priority: "low" | "medium" | "high";
  confidence_score: number;
  source_provider: string;
  created_at: string;
};

type CompetitiveAnalysis = {
  id: string;
  client_name: string;
  website_url: string | null;
  industry: string;
  market: string | null;
  target_audience: string | null;
  competitors: Array<{ name: string; url: string | null }>;
  target_keywords: string[];
  summary: string;
  positioning: string;
  competitor_themes: string[];
  content_gaps: string[];
  keyword_opportunities: string[];
  missing_from_client?: Array<{ feature: string; label: string; competitors: string[]; evidence_urls: string[] }>;
  competitor_only_patterns?: Array<{ feature: string; label: string; competitors: string[]; evidence_urls: string[] }>;
  shared_patterns?: Array<{ feature: string; label: string; competitors: string[]; evidence_urls: string[] }>;
  client_strengths?: Array<{ feature: string; label: string; competitors: string[]; evidence_urls: string[] }>;
  top_performers?: Array<{ name: string; url: string | null; feature_count: number }>;
  crawl_evidence?: Array<{
    site_role: "client" | "competitor";
    name: string;
    url: string | null;
    status: "success" | "skipped" | "partial" | "failed";
    feature_count: number;
    pages: Array<{ url: string; status: string; title: string | null; features: Array<{ feature: string; label: string; urls: string[] }> }>;
    errors: string[];
  }>;
  recommendations: Array<{ title: string; rationale: string; priority: "low" | "medium" | "high" }>;
  assumptions: string[];
  confidence_score: number;
  created_at: string;
};

type MetricSnapshot = {
  id: string;
  provider: Provider;
  page_url: string | null;
  metric_name: string;
  metric_value: number;
  dimensions_json: Record<string, unknown>;
  captured_at: string;
  created_at: string;
};

const providerLabels: Record<Provider, string> = {
  ga4: "GA4",
  gtm: "GTM",
  hotjar: "Hotjar",
  openai: "OpenAI",
  mcp: "MCP",
};

const providerDetails: Record<Provider, { title: string; description: string }> = {
  ga4: {
    title: "Google Analytics 4",
    description: "Connect the GA4 property used for traffic and conversion reporting.",
  },
  gtm: {
    title: "Google Tag Manager",
    description: "Save the GTM account and container ids for tag coverage checks.",
  },
  hotjar: {
    title: "Hotjar",
    description: "Save the Hotjar site id, connector token, or connector health URL.",
  },
  openai: {
    title: "ChatGPT / OpenAI Token",
    description: "Add the encrypted token used for competitive briefs and insight generation.",
  },
  mcp: {
    title: "MCP Connectors",
    description: "Register a remote connector endpoint and its client metadata.",
  },
};

const providerOrder = Object.keys(providerLabels) as Provider[];

const navItems: Array<{ id: View; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Health and report coverage" },
  { id: "clients", label: "Clients", description: "Pick or add workspaces" },
  { id: "integrations", label: "Tool Setup", description: "Connect keys and metadata" },
  { id: "analysis", label: "Competitive", description: "Generate market briefs" },
  { id: "insights", label: "Insights", description: "Review AI recommendations" },
];

const DEFAULT_CLIENT_ID = "demo-client";
const CLIENT_STORAGE_KEY = "seo-intelligence-client-id";

const tourSteps: Step[] = [
  {
    target: "[data-tour='app-overview']",
    title: "Start with the overview",
    content: "The home view is now a compact operating dashboard with coverage, reports, and setup status.",
    placement: "bottom",
    skipBeacon: true,
  },
  {
    target: "[data-tour='side-nav']",
    title: "Use the sidebar to move",
    content: "Switch between overview, clients, tool setup, competitive analysis, and insights without losing context.",
    placement: "right",
  },
  {
    target: "[data-tour='client-switcher']",
    title: "Choose the active client",
    content: "The selected client scopes integrations, encrypted keys, analyses, and reports.",
    placement: "right",
  },
  {
    target: "[data-tour='overview-graphs']",
    title: "Scan readiness first",
    content: "These chart cards show whether the workspace has enough setup to create useful reports.",
    placement: "top",
  },
  {
    target: "[data-tour='nav-integrations']",
    title: "Open focused setup pages",
    content: "Tool Setup now breaks GA4, GTM, Hotjar, OpenAI, and MCP into separate pages so users can connect one tool at a time.",
    placement: "right",
  },
  {
    target: "[data-tour='tool-provider-nav']",
    title: "Choose one setup flow",
    content: "Use these tool buttons to move between focused setup pages while keeping the active client and connection status visible.",
    placement: "bottom",
  },
  {
    target: "[data-tour='nav-analysis']",
    title: "Run competitive analysis",
    content: "Use this view to crawl client and competitor sites, then compare observed website patterns.",
    placement: "right",
  },
  {
    target: "[data-tour='nav-insights']",
    title: "Review recommendations",
    content: "Generated findings live in the insights view with priority, confidence, impact, and next action.",
    placement: "right",
  },
];

function statusLabel(status?: Status) {
  if (status === "connected") return "Connected";
  if (status === "error") return "Error";
  return "Not connected";
}

async function api<T>(clientId: string, path: string, init?: RequestInit): Promise<T> {
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

  try {
    body = (text ? JSON.parse(text) : {}) as T & { error?: string };
  } catch {
    body = { error: `Request failed with HTTP ${response.status}.` } as T & { error?: string };
  }

  if (!response.ok) {
    throw new Error(body.error || "Request failed.");
  }

  return body;
}

function formPayload(form: HTMLFormElement, provider: Provider) {
  const formData = new FormData(form);
  const config: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    const next = String(value).trim();
    if (next) {
      config[key] = next;
    }
  }

  if (provider === "mcp") {
    config.enabled = (form.elements.namedItem("enabled") as HTMLInputElement).checked;
  }

  return {
    provider,
    display_name: String(config.name || providerLabels[provider]),
    config,
  };
}

export function SeoDashboard() {
  const [view, setView] = useState<View>("overview");
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID);
  const [clients, setClients] = useState<Client[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [metricSnapshots, setMetricSnapshots] = useState<MetricSnapshot[]>([]);
  const [competitiveAnalyses, setCompetitiveAnalyses] = useState<CompetitiveAnalysis[]>([]);
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingGa4, setSyncingGa4] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider>("ga4");

  const activeClient = clients.find((client) => client.id === clientId);
  const latestByProvider = useMemo(() => {
    return integrations.reduce<Partial<Record<Provider, Integration>>>((acc, integration) => {
      acc[integration.provider] = integration;
      return acc;
    }, {});
  }, [integrations]);
  const connectedCount = Object.values(latestByProvider).filter((integration) => integration?.status === "connected").length;
  const savedToolCount = Object.values(latestByProvider).filter(Boolean).length;
  const readiness = Math.round(((latestByProvider.openai ? 1 : 0) + Math.min(savedToolCount, 4) / 4) * 50);

  async function loadClients(activeClientId = clientId) {
    const body = await api<{ clients: Client[] }>(activeClientId, "/api/seo/clients");
    setClients(body.clients);
    return body.clients;
  }

  async function loadDashboard(activeClientId = clientId) {
    try {
      const [clientBody, integrationBody, insightBody, competitiveBody, metricBody] = await Promise.all([
        api<{ clients: Client[] }>(activeClientId, "/api/seo/clients"),
        api<{ integrations: Integration[] }>(activeClientId, "/api/seo/integrations"),
        api<{ insights: Insight[] }>(activeClientId, "/api/seo/insights"),
        api<{ analyses: CompetitiveAnalysis[] }>(activeClientId, "/api/seo/competitive-analysis"),
        api<{ metricSnapshots: MetricSnapshot[] }>(activeClientId, "/api/seo/metrics"),
      ]);
      setClients(clientBody.clients);
      setIntegrations(integrationBody.integrations);
      setInsights(insightBody.insights);
      setCompetitiveAnalyses(competitiveBody.analyses);
      setMetricSnapshots(metricBody.metricSnapshots);
      if (!integrationBody.integrations.some((item) => item.provider === "openai")) {
        setNotice({ type: "info", message: "Connect a ChatGPT/OpenAI token to unlock AI-generated analysis." });
      }
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to load the dashboard.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedClientId = window.localStorage.getItem(CLIENT_STORAGE_KEY) || DEFAULT_CLIENT_ID;
    setClientId(storedClientId);
    loadDashboard(storedClientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchClient(nextClientId: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}[a-zA-Z0-9]$/.test(nextClientId)) {
      setNotice({
        type: "error",
        message: "Client id must be 3-64 characters using letters, numbers, underscores, or hyphens.",
      });
      return;
    }

    window.localStorage.setItem(CLIENT_STORAGE_KEY, nextClientId);
    setClientId(nextClientId);
    setIntegrations([]);
    setInsights([]);
    setMetricSnapshots([]);
    setCompetitiveAnalyses([]);
    setNotice({ type: "info", message: `Viewing client workspace: ${nextClientId}` });
    loadDashboard(nextClientId);
  }

  async function addClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const id = String(formData.get("id") || "").trim();
    const notes = String(formData.get("notes") || "").trim();

    try {
      const body = await api<{ client: Client }>(clientId, "/api/seo/clients", {
        method: "POST",
        body: JSON.stringify({ name, id, notes }),
      });
      form.reset();
      await loadClients(clientId);
      switchClient(body.client.id);
      setView("clients");
      setNotice({ type: "success", message: `${body.client.name} client workspace created.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to add client." });
    }
  }

  async function saveIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const provider = form.dataset.provider as Provider;

    try {
      const body = await api<{ integration: Integration }>(clientId, "/api/seo/integrations", {
        method: "POST",
        body: JSON.stringify(formPayload(form, provider)),
      });
      setIntegrations((current) => {
        const existingIndex = current.findIndex((item) => item.id === body.integration.id);
        if (existingIndex < 0) return [...current, body.integration];
        return current.map((item) => (item.id === body.integration.id ? body.integration : item));
      });
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="password"], textarea[name="serviceAccountJson"]').forEach((input) => {
        input.value = "";
      });
      setNotice({ type: "success", message: `${body.integration.display_name} saved.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save integration." });
    }
  }

  async function testProvider(provider: Provider) {
    const candidates = integrations.filter((item) => item.provider === provider);
    const integration = candidates[candidates.length - 1];
    if (!integration) {
      setNotice({ type: "error", message: `Save ${providerLabels[provider]} before testing.` });
      return;
    }

    try {
      const body = await api<{ integration: Integration; result: { detail?: string } }>(
        clientId,
        `/api/seo/integrations/${integration.id}/test`,
        { method: "POST" }
      );
      setIntegrations((current) => current.map((item) => (item.id === body.integration.id ? body.integration : item)));
      setNotice({ type: "success", message: body.result.detail || "Connection test passed." });
    } catch (error) {
      await loadDashboard();
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Connection test failed." });
    }
  }

  async function generateInsights() {
    try {
      setGenerating(true);
      const body = await api<{ insights: Insight[] }>(clientId, "/api/seo/insights/generate", { method: "POST" });
      setInsights((current) => [...body.insights, ...current]);
      setNotice({ type: "success", message: "Insights generated." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to generate insights." });
    } finally {
      setGenerating(false);
    }
  }

  async function syncGa4Metrics() {
    try {
      setSyncingGa4(true);
      const body = await api<{ metricSnapshots: MetricSnapshot[] }>(clientId, "/api/seo/sync/ga4", { method: "POST" });
      setMetricSnapshots(body.metricSnapshots);
      await loadDashboard(clientId);
      setNotice({ type: "success", message: `GA4 synced ${body.metricSnapshots.length} metric snapshots.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to sync GA4 metrics." });
    } finally {
      setSyncingGa4(false);
    }
  }

  async function generateCompetitiveAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      clientName: String(formData.get("clientName") || "").trim(),
      websiteUrl: String(formData.get("websiteUrl") || "").trim(),
      industry: String(formData.get("industry") || "").trim(),
      market: String(formData.get("market") || "").trim(),
      targetAudience: String(formData.get("targetAudience") || "").trim(),
      competitors: String(formData.get("competitors") || "").trim(),
      targetKeywords: String(formData.get("targetKeywords") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
    };

    try {
      setAnalyzing(true);
      const body = await api<{ analysis: CompetitiveAnalysis }>(clientId, "/api/seo/competitive-analysis", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCompetitiveAnalyses((current) => [body.analysis, ...current]);
      setNotice({ type: "success", message: "Competitive analysis generated." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to generate competitive analysis.",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function handleTourCallback(data: EventData) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setTourRunning(false);
    }
  }

  return (
    <section className="dashboard-shell" aria-labelledby="dashboard-title">
      <Joyride
        onEvent={handleTourCallback}
        continuous
        options={{
          overlayColor: "rgba(10, 10, 12, 0.68)",
          primaryColor: "#111214",
          scrollOffset: 80,
          spotlightPadding: 14,
          spotlightRadius: 12,
          textColor: "#111214",
          width: 420,
          zIndex: 10000,
        }}
        run={tourRunning}
        scrollToFirstStep
        steps={tourSteps}
        tooltipComponent={CinematicTourTooltip}
      />

      <aside className="app-sidebar" aria-label="Dashboard navigation">
        <div className="sidebar-brand">
          <p className="eyebrow">SEO Intelligence</p>
          <h1>Dashboard</h1>
          <p>{loading ? "Loading workspace..." : `${clients.length} client workspace${clients.length === 1 ? "" : "s"}`}</p>
        </div>

        <nav className="side-nav" data-tour="side-nav" aria-label="Primary">
          {navItems.map((item) => (
            <div className="nav-group" key={item.id}>
              <button
                className="nav-item"
                data-active={view === item.id}
                data-tour={item.id === "integrations" ? "nav-integrations" : item.id === "analysis" ? "nav-analysis" : item.id === "insights" ? "nav-insights" : undefined}
                type="button"
                onClick={() => setView(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
              {item.id === "integrations" ? (
                <div className="provider-subnav" data-tour="tool-provider-nav" aria-label="Tool setup pages">
                  {providerOrder.map((provider) => (
                    <button
                      className="provider-subnav-item"
                      data-active={activeProvider === provider}
                      key={provider}
                      type="button"
                      onClick={() => {
                        setActiveProvider(provider);
                        setView("integrations");
                      }}
                    >
                      {providerLabels[provider]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="sidebar-clients" data-tour="client-switcher">
          <div className="sidebar-section-title">
            <span>Active Client</span>
            <button className="text-button" type="button" onClick={() => setView("clients")}>
              Manage
            </button>
          </div>
          <div className="client-list">
            {clients.map((client) => (
              <button
                className="client-item"
                data-active={client.id === clientId}
                key={client.id}
                type="button"
                onClick={() => {
                  switchClient(client.id);
                  setView("clients");
                }}
              >
                <strong>{client.name}</strong>
                <span>{client.id}</span>
              </button>
            ))}
          </div>
        </div>

        <form action="/api/auth/logout" method="post">
          <button className="button" type="submit">
            Sign out
          </button>
        </form>
      </aside>

      <div className="dashboard" aria-live="polite">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">{activeClient?.name || clientId}</p>
            <h2 id="dashboard-title">{viewTitle(view, activeProvider)}</h2>
            <p className="active-client">{viewDescription(view, activeClient?.name || clientId, activeProvider)}</p>
          </div>
          <div className="dashboard-tools">
            <button className="button" type="button" onClick={() => setTourRunning(true)}>
              Start Tutorial
            </button>
            {view !== "overview" ? (
              <button className="button" type="button" onClick={() => setView("overview")}>
                Back to Overview
              </button>
            ) : null}
          </div>
        </div>

        {notice ? (
          <div className="alert" data-type={notice.type} role="status">
            {notice.message}
          </div>
        ) : null}

        {view === "overview" ? (
          <OverviewView
            connectedCount={connectedCount}
            savedToolCount={savedToolCount}
            clients={clients}
            competitiveAnalyses={competitiveAnalyses}
            insights={insights}
            latestByProvider={latestByProvider}
            metricSnapshots={metricSnapshots}
            onSyncGa4={syncGa4Metrics}
            readiness={readiness}
            setView={setView}
            syncingGa4={syncingGa4}
          />
        ) : null}

        {view === "clients" ? (
          <ClientsView activeClient={activeClient} clientId={clientId} clients={clients} onAddClient={addClient} onSwitchClient={switchClient} />
        ) : null}

        {view === "integrations" ? (
          <IntegrationsView
            activeProvider={activeProvider}
            latestByProvider={latestByProvider}
            loading={loading}
            onSaveIntegration={saveIntegration}
            onSelectProvider={setActiveProvider}
            onTestProvider={testProvider}
          />
        ) : null}

        {view === "analysis" ? (
          <CompetitiveView
            activeClient={activeClient}
            analyzing={analyzing}
            competitiveAnalyses={competitiveAnalyses}
            onGenerateCompetitiveAnalysis={generateCompetitiveAnalysis}
          />
        ) : null}

        {view === "insights" ? (
          <InsightsView
            generating={generating}
            insights={insights}
            latestByProvider={latestByProvider}
            onGenerateInsights={generateInsights}
          />
        ) : null}
      </div>
    </section>
  );
}

function viewTitle(view: View, provider: Provider) {
  if (view === "clients") return "Clients";
  if (view === "integrations") return providerDetails[provider].title;
  if (view === "analysis") return "Competitive Analysis";
  if (view === "insights") return "Insights";
  return "Overview";
}

function viewDescription(view: View, clientName: string, provider: Provider) {
  if (view === "clients") return "Pick a workspace or add a new client.";
  if (view === "integrations") return `${clientName}: ${providerDetails[provider].description}`;
  if (view === "analysis") return `Generate competitive briefs for ${clientName}.`;
  if (view === "insights") return `Review AI recommendations for ${clientName}.`;
  return "Graph-style readiness, coverage, and output summary.";
}

function OverviewView({
  clients,
  connectedCount,
  competitiveAnalyses,
  insights,
  latestByProvider,
  metricSnapshots,
  onSyncGa4,
  readiness,
  savedToolCount,
  setView,
  syncingGa4,
}: {
  clients: Client[];
  connectedCount: number;
  competitiveAnalyses: CompetitiveAnalysis[];
  insights: Insight[];
  latestByProvider: Partial<Record<Provider, Integration>>;
  metricSnapshots: MetricSnapshot[];
  onSyncGa4: () => void;
  readiness: number;
  savedToolCount: number;
  setView: (view: View) => void;
  syncingGa4: boolean;
}) {
  const ga4Summary = getGa4Summary(metricSnapshots);

  return (
    <div className="overview" data-tour="app-overview">
      <section className="overview-grid" data-tour="overview-graphs" aria-label="Overview charts">
        <GraphCard label="Setup readiness" value={`${readiness}%`} helper="OpenAI plus connector coverage" percent={readiness} />
        <GraphCard label="Connected tools" value={`${connectedCount}/5`} helper={`${savedToolCount} saved connectors`} percent={connectedCount * 20} />
        <GraphCard label="GA4 users" value={formatNumber(ga4Summary.activeUsers)} helper="Last 28 synced days" percent={ga4Summary.userPercent} />
        <GraphCard label="Page views" value={formatNumber(ga4Summary.pageViews)} helper="Last 28 synced days" percent={ga4Summary.pageViewPercent} />
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="section-heading">
            <h3>Connection Health</h3>
            <p>Use this to decide what to set up next.</p>
          </div>
          <div className="status-row compact" aria-label="Connection status">
            {(Object.keys(providerLabels) as Provider[]).map((provider) => {
              const integration = latestByProvider[provider];
              return (
                <article className="status-card" data-status={integration?.status || "disconnected"} key={provider}>
                  <span>{providerLabels[provider]}</span>
                  <strong>{statusLabel(integration?.status)}</strong>
                </article>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <h3>Next Actions</h3>
            <p>Move from setup into client data.</p>
          </div>
          <div className="quick-actions">
            <button className="button button-primary" type="button" onClick={() => setView("clients")}>
              Manage Clients
            </button>
            <button className="button" type="button" onClick={() => setView("integrations")}>
              Connect Tools
            </button>
            <button className="button" type="button" onClick={() => setView("analysis")}>
              Run Competitive Analysis
            </button>
            <button className="button" type="button" onClick={() => setView("insights")}>
              Review Insights
            </button>
          </div>
          <div className="mini-summary">
            <span>{clients.length} clients</span>
            <span>{savedToolCount} tools saved</span>
            <span>{insights.length + competitiveAnalyses.length} reports</span>
          </div>
        </div>
      </section>

      <section className="panel metric-panel" aria-labelledby="ga4-metrics-title">
        <div className="section-heading split-heading">
          <div>
            <h3 id="ga4-metrics-title">GA4 Performance</h3>
            <p>Stored snapshots from the Google Analytics Data API.</p>
          </div>
          <button className="button button-primary" type="button" disabled={syncingGa4} onClick={onSyncGa4}>
            {syncingGa4 ? "Syncing..." : "Sync GA4"}
          </button>
        </div>

        {metricSnapshots.some((item) => item.provider === "ga4") ? (
          <div className="metric-dashboard">
            <MetricTrendChart title="Active users" snapshots={metricSnapshots} metricName="active_users" />
            <MetricTrendChart title="Sessions" snapshots={metricSnapshots} metricName="sessions" />
            <MetricTrendChart title="Page views" snapshots={metricSnapshots} metricName="page_views" />
            <TopPagesList snapshots={metricSnapshots} />
          </div>
        ) : (
          <div className="empty-state">Connect GA4 with credentials, then sync metrics to populate these graphs.</div>
        )}
      </section>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function getMetricRows(snapshots: MetricSnapshot[], metricName: string) {
  return snapshots
    .filter((item) => item.provider === "ga4" && item.metric_name === metricName)
    .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
}

function getGa4Summary(snapshots: MetricSnapshot[]) {
  const activeUsers = getMetricRows(snapshots, "active_users").reduce((sum, item) => sum + item.metric_value, 0);
  const pageViews = getMetricRows(snapshots, "page_views").reduce((sum, item) => sum + item.metric_value, 0);
  return {
    activeUsers,
    pageViews,
    userPercent: Math.min(100, activeUsers / 10),
    pageViewPercent: Math.min(100, pageViews / 20),
  };
}

function MetricTrendChart({ metricName, snapshots, title }: { metricName: string; snapshots: MetricSnapshot[]; title: string }) {
  const rows = getMetricRows(snapshots, metricName).slice(-28);
  const max = Math.max(1, ...rows.map((item) => item.metric_value));
  const total = rows.reduce((sum, item) => sum + item.metric_value, 0);

  return (
    <article className="metric-card">
      <div className="card-top">
        <div>
          <span>{title}</span>
          <strong>{formatNumber(total)}</strong>
        </div>
        <small>{rows.length} days</small>
      </div>
      <div className="metric-bars" aria-label={`${title} trend`}>
        {rows.map((item) => (
          <span
            key={`${metricName}-${item.captured_at}`}
            style={{ height: `${Math.max(6, Math.round((item.metric_value / max) * 100))}%` }}
            title={`${new Date(item.captured_at).toLocaleDateString()}: ${formatNumber(item.metric_value)}`}
          />
        ))}
      </div>
    </article>
  );
}

function TopPagesList({ snapshots }: { snapshots: MetricSnapshot[] }) {
  const rows = snapshots
    .filter((item) => item.provider === "ga4" && item.metric_name === "top_page_views")
    .sort((a, b) => b.metric_value - a.metric_value)
    .slice(0, 6);

  return (
    <article className="metric-card top-pages-card">
      <div className="card-top">
        <div>
          <span>Top pages</span>
          <strong>{rows.length}</strong>
        </div>
        <small>by views</small>
      </div>
      <div className="top-pages-list">
        {rows.map((item) => (
          <div key={`${item.page_url}-${item.metric_value}`}>
            <span>{item.page_url || "/"}</span>
            <strong>{formatNumber(item.metric_value)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function GraphCard({ helper, label, percent, value }: { helper: string; label: string; percent: number; value: string }) {
  return (
    <article className="graph-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="bar-chart" aria-hidden="true">
        <span style={{ height: `${Math.max(8, Math.min(100, percent))}%` }} />
        <span style={{ height: `${Math.max(8, Math.min(100, percent * 0.72 + 10))}%` }} />
        <span style={{ height: `${Math.max(8, Math.min(100, percent * 0.52 + 18))}%` }} />
      </div>
      <p>{helper}</p>
    </article>
  );
}

function ClientsView({
  activeClient,
  clientId,
  clients,
  onAddClient,
  onSwitchClient,
}: {
  activeClient?: Client;
  clientId: string;
  clients: Client[];
  onAddClient: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchClient: (clientId: string) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="section-heading">
          <h3>Client Workspaces</h3>
          <p>Each client keeps separate integrations, encrypted keys, analyses, and insights.</p>
        </div>
        <div className="client-grid">
          {clients.map((client) => (
            <button
              className="client-card"
              data-active={client.id === clientId}
              key={client.id}
              type="button"
              onClick={() => onSwitchClient(client.id)}
            >
              <strong>{client.name}</strong>
              <span>{client.id}</span>
              <p>{client.notes || "No notes yet."}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" data-tour="add-client-form">
        <div className="section-heading">
          <h3>Add Client</h3>
          <p>Keep the id simple, like vast or acme-health.</p>
        </div>
        <form className="add-client-form" onSubmit={onAddClient}>
          <label>
            Client name
            <input name="name" placeholder="Vast" required />
          </label>
          <label>
            Client id
            <input name="id" placeholder="vast" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}[a-zA-Z0-9]" />
          </label>
          <label>
            Notes
            <textarea name="notes" placeholder="Optional context" rows={4} />
          </label>
          <button className="button button-primary" type="submit">
            Add client
          </button>
        </form>
        <div className="active-client-panel">
          <span>Current workspace</span>
          <strong>{activeClient?.name || clientId}</strong>
        </div>
      </section>
    </div>
  );
}

function IntegrationsView({
  activeProvider,
  latestByProvider,
  loading,
  onSaveIntegration,
  onSelectProvider,
  onTestProvider,
}: {
  activeProvider: Provider;
  latestByProvider: Partial<Record<Provider, Integration>>;
  loading: boolean;
  onSaveIntegration: (event: FormEvent<HTMLFormElement>) => void;
  onSelectProvider: (provider: Provider) => void;
  onTestProvider: (provider: Provider) => void;
}) {
  const activeIntegration = latestByProvider[activeProvider];

  return (
    <section className="panel" data-tour="integration-hub" aria-labelledby="integrations-title">
      <div className="section-heading">
        <h3 id="integrations-title">Tool Setup Pages</h3>
        <p>Choose one tool, save its setup data, then test it. Secrets are encrypted and never returned.</p>
      </div>

      <div className="status-row tool-page-picker" data-tour="status-row" aria-label="Connection status">
        {providerOrder.map((provider) => {
          const integration = latestByProvider[provider];
          return (
            <button
              className="status-card status-card-button"
              data-active={activeProvider === provider}
              data-status={integration?.status || "disconnected"}
              key={provider}
              type="button"
              onClick={() => onSelectProvider(provider)}
            >
              <span>{providerLabels[provider]}</span>
              <strong>{statusLabel(integration?.status)}</strong>
            </button>
          );
        })}
      </div>

      <div className="tool-page-layout" aria-busy={loading}>
        <aside className="tool-page-summary" aria-label="Selected tool status">
          <span>Current setup page</span>
          <strong>{providerDetails[activeProvider].title}</strong>
          <p>{providerDetails[activeProvider].description}</p>
          <div className="metric">
            <span>Status</span>
            <strong>{statusLabel(activeIntegration?.status)}</strong>
          </div>
          {activeIntegration?.last_tested_at ? (
            <div className="metric">
              <span>Last tested</span>
              <strong>{new Date(activeIntegration.last_tested_at).toLocaleString()}</strong>
            </div>
          ) : null}
          {activeIntegration?.last_error ? <p className="tool-page-error">{activeIntegration.last_error}</p> : null}
        </aside>

        <div className="tool-page-form" data-tour="active-tool-form">
          {activeProvider === "ga4" ? (
            <ProviderForm provider="ga4" title="Google Analytics 4" onSubmit={onSaveIntegration} onTest={onTestProvider}>
              <Field name="propertyId" label="Property ID" placeholder="properties/123456789" required tourId="ga4-property" />
              <Field name="serviceAccountJson" label="Service account JSON" placeholder='{"client_email":"...","private_key":"..."}' type="textarea" />
              <Field name="accessToken" label="Temporary access token" placeholder="Stored encrypted" type="password" />
            </ProviderForm>
          ) : null}

          {activeProvider === "gtm" ? (
            <ProviderForm provider="gtm" title="Google Tag Manager" onSubmit={onSaveIntegration} onTest={onTestProvider}>
              <Field name="accountId" label="Account ID" placeholder="1234567" required />
              <Field name="containerId" label="Container ID" placeholder="GTM-XXXXXXX" required />
            </ProviderForm>
          ) : null}

          {activeProvider === "hotjar" ? (
            <ProviderForm provider="hotjar" title="Hotjar" onSubmit={onSaveIntegration} onTest={onTestProvider}>
              <Field name="siteId" label="Site ID" placeholder="1234567" />
              <Field name="apiKey" label="API key or connector token" placeholder="Stored encrypted" type="password" />
              <Field name="baseUrl" label="Connector URL" placeholder="https://connector.example.com" type="url" />
            </ProviderForm>
          ) : null}

          {activeProvider === "openai" ? (
            <ProviderForm provider="openai" title="ChatGPT / OpenAI Token" onSubmit={onSaveIntegration} onTest={onTestProvider}>
              <Field name="apiKey" label="API key" placeholder="sk-..." type="password" required tourId="openai-key" />
            </ProviderForm>
          ) : null}

          {activeProvider === "mcp" ? (
            <ProviderForm
              provider="mcp"
              title="MCP Connectors"
              tourId="mcp-card"
              onSubmit={onSaveIntegration}
              onTest={onTestProvider}
              actionLabel="Add remote connector"
            >
              <div className="two-col">
                <Field name="name" label="Name" placeholder="Remote connector" required />
                <Field name="type" label="Type" placeholder="analytics | crawler | crm" />
                <Field name="baseUrl" label="Base URL" placeholder="https://mcp.example.com" type="url" required />
                <label>
                  Auth type
                  <select name="authType" defaultValue="none">
                    <option value="none">none</option>
                    <option value="bearer">bearer</option>
                    <option value="oauth">oauth</option>
                  </select>
                </label>
                <Field name="token" label="Token / client metadata" placeholder="Stored encrypted when present" type="password" />
                <label className="check">
                  <input name="enabled" type="checkbox" defaultChecked />
                  Enabled
                </label>
              </div>
            </ProviderForm>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CompetitiveView({
  activeClient,
  analyzing,
  competitiveAnalyses,
  onGenerateCompetitiveAnalysis,
}: {
  activeClient?: Client;
  analyzing: boolean;
  competitiveAnalyses: CompetitiveAnalysis[];
  onGenerateCompetitiveAnalysis: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="panel" data-tour="competitive-analysis" aria-labelledby="competitive-title">
        <div className="section-heading">
          <h3 id="competitive-title">Competitive Analysis</h3>
          <p>Crawl and compare websites first. OpenAI can summarize the evidence when a token is connected.</p>
        </div>

        <form className="competitive-form" onSubmit={onGenerateCompetitiveAnalysis}>
          <Field name="clientName" label="Client name" placeholder={activeClient?.name || "Acme Health"} required />
          <Field name="websiteUrl" label="Website URL" placeholder="https://example.com" type="url" />
          <Field name="industry" label="Industry" placeholder="Healthcare SaaS" required />
          <Field name="market" label="Market" placeholder="US mid-market" />
          <label>
            Target audience
            <textarea name="targetAudience" placeholder="Who the client needs to win with" rows={3} />
          </label>
          <label>
            Known competitors
            <textarea name="competitors" placeholder="One per line, include URL when available" rows={4} />
          </label>
          <label>
            Target keywords
            <textarea name="targetKeywords" placeholder="One keyword or topic per line" rows={4} />
          </label>
          <label>
            Notes
            <textarea name="notes" placeholder="Positioning, offers, constraints, or market context" rows={4} />
          </label>
          <button className="button button-primary" data-tour="generate-competitive-analysis" type="submit" disabled={analyzing}>
            {analyzing ? "Crawling..." : "Crawl and Compare Websites"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h3>Briefs</h3>
          <p>Stored competitive reports for the active client.</p>
        </div>
        <div className="analysis-results" aria-live="polite">
          {competitiveAnalyses.length ? (
            competitiveAnalyses.map((analysis) => <CompetitiveAnalysisCard analysis={analysis} key={analysis.id} />)
          ) : (
            <div className="empty-state">Add a client URL and competitor URLs to generate the first crawl-based comparison.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function InsightsView({
  generating,
  insights,
  latestByProvider,
  onGenerateInsights,
}: {
  generating: boolean;
  insights: Insight[];
  latestByProvider: Partial<Record<Provider, Integration>>;
  onGenerateInsights: () => void;
}) {
  return (
    <section className="panel" data-tour="insight-feed" aria-labelledby="insights-title">
      <div className="section-heading">
        <div>
          <h3 id="insights-title">Insight Feed</h3>
          {!insights.length ? (
            <p>
              {latestByProvider.openai
                ? "Connect GA4 and Hotjar, then generate your first SEO intelligence report."
                : "Connect GA4, Hotjar, and OpenAI to generate your first SEO intelligence report."}
            </p>
          ) : null}
        </div>
        <button className="button button-primary" type="button" disabled={generating} onClick={onGenerateInsights}>
          {generating ? "Generating..." : "Generate Insights"}
        </button>
      </div>

      <div className="insights">
        {insights.map((insight) => (
          <article className="insight-card" key={insight.id}>
            <div className="card-top">
              <h4>{insight.title}</h4>
              <span className="priority" data-priority={insight.priority}>
                {insight.priority}
              </span>
            </div>
            <p>{insight.description}</p>
            <dl>
              <div>
                <dt>Impact</dt>
                <dd>{insight.impact}</dd>
              </div>
              <div>
                <dt>Recommendation</dt>
                <dd>{insight.recommendation}</dd>
              </div>
            </dl>
            <footer>
              <span>{insight.source_provider}</span>
              <span>{insight.confidence_score}% confidence</span>
              <time dateTime={insight.created_at}>{new Date(insight.created_at).toLocaleString()}</time>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function CompetitiveAnalysisCard({ analysis }: { analysis: CompetitiveAnalysis }) {
  const missingPatterns = analysis.missing_from_client || [];
  const topPerformers = analysis.top_performers || [];
  const crawlEvidence = analysis.crawl_evidence || [];

  return (
    <article className="analysis-card">
      <div className="card-top">
        <div>
          <h4>{analysis.client_name}</h4>
          <p>
            {analysis.industry}
            {analysis.market ? ` - ${analysis.market}` : ""}
          </p>
        </div>
        <span>{analysis.confidence_score}% confidence</span>
      </div>

      <p>{analysis.summary}</p>
      {topPerformers.length ? (
        <div className="evidence-strip">
          {topPerformers.map((performer) => (
            <span key={`${analysis.id}-${performer.name}`}>
              {performer.name}: {performer.feature_count} observed features
            </span>
          ))}
        </div>
      ) : null}
      <dl>
        <div>
          <dt>Positioning</dt>
          <dd>{analysis.positioning}</dd>
        </div>
      </dl>

      {missingPatterns.length ? (
        <div className="pattern-list">
          <h5>Competitors have, client does not</h5>
          {missingPatterns.slice(0, 5).map((pattern) => (
            <div className="pattern-row" key={`${analysis.id}-${pattern.feature}`}>
              <strong>{pattern.label}</strong>
              <span>{pattern.competitors.join(", ")}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="analysis-lists">
        <TextList title="Competitor themes" items={analysis.competitor_themes} />
        <TextList title="Content gaps" items={analysis.content_gaps} />
        <TextList title="Keyword opportunities" items={analysis.keyword_opportunities} />
        <TextList title="Assumptions" items={analysis.assumptions} />
      </div>

      {crawlEvidence.length ? (
        <div className="crawl-evidence">
          <h5>Crawl evidence</h5>
          {crawlEvidence.map((site) => (
            <div className="crawl-site" key={`${analysis.id}-${site.site_role}-${site.name}`}>
              <div className="card-top">
                <strong>{site.name}</strong>
                <span>{site.status}</span>
              </div>
              <p>
                {site.feature_count} features across {site.pages.filter((page) => page.status === "success").length} crawled pages
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="recommendations">
        <h5>Recommended next actions</h5>
        {analysis.recommendations.map((recommendation) => (
          <div className="recommendation" key={`${analysis.id}-${recommendation.title}`}>
            <div className="card-top">
              <strong>{recommendation.title}</strong>
              <span className="priority" data-priority={recommendation.priority}>
                {recommendation.priority}
              </span>
            </div>
            <p>{recommendation.rationale}</p>
          </div>
        ))}
      </div>

      <footer>
        <span>{analysis.competitors.length} competitors supplied</span>
        <span>{analysis.target_keywords.length} keywords supplied</span>
        <time dateTime={analysis.created_at}>{new Date(analysis.created_at).toLocaleString()}</time>
      </footer>
    </article>
  );
}

function TextList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h5>{title}</h5>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>No items returned.</p>
      )}
    </div>
  );
}

function ProviderForm({
  provider,
  title,
  wide,
  tourId,
  children,
  actionLabel = "Save",
  onSubmit,
  onTest,
}: {
  provider: Provider;
  title: string;
  wide?: boolean;
  tourId?: string;
  children: ReactNode;
  actionLabel?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: (provider: Provider) => void;
}) {
  return (
    <form className={`card form ${wide ? "form-wide" : ""}`} data-provider={provider} data-tour={tourId} onSubmit={onSubmit}>
      <div className="card-top">
        <h4>{title}</h4>
        <span className="badge">Save to connect</span>
      </div>
      {children}
      <div className="actions">
        <button className="button" type="submit">
          {actionLabel}
        </button>
        <button className="button" type="button" onClick={() => onTest(provider)}>
          Test
        </button>
      </div>
    </form>
  );
}

function CinematicTourTooltip({
  backProps,
  closeProps,
  continuous,
  index,
  isLastStep,
  primaryProps,
  size,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  const progress = Math.round(((index + 1) / size) * 100);

  return (
    <div className="tour-dialogue" {...tooltipProps}>
      <div className="tour-dialogue__meta">
        <span>Guided setup</span>
        <span>
          {index + 1} / {size}
        </span>
      </div>
      <div className="tour-dialogue__bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="tour-dialogue__body">
        {step.title ? <h3>{step.title}</h3> : null}
        <p>{step.content}</p>
      </div>
      <div className="tour-dialogue__actions">
        <button className="tour-button tour-button-ghost" type="button" {...skipProps}>
          Skip
        </button>
        <div>
          {index > 0 ? (
            <button className="tour-button" type="button" {...backProps}>
              Back
            </button>
          ) : null}
          <button className="tour-button tour-button-primary" type="button" {...(continuous ? primaryProps : closeProps)}>
            {isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
  required,
  tourId,
}: {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  required?: boolean;
  tourId?: string;
}) {
  return (
    <label data-tour={tourId}>
      {label}
      {type === "textarea" ? (
        <textarea name={name} placeholder={placeholder} required={required} rows={5} autoComplete="off" />
      ) : (
        <input name={name} placeholder={placeholder} type={type} required={required} autoComplete="off" />
      )}
    </label>
  );
}
