"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from "react-joyride";

type Provider = "ga4" | "gtm" | "hotjar" | "openai" | "mcp";
type Status = "disconnected" | "connected" | "error";
type View = "clients" | "overview" | "brain" | "integrations" | "analysis" | "insights";
type NavIconName = "clients" | "overview" | "brain" | "tools" | "analysis" | "insights" | "menu" | "close" | "signout";

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
  report_draft?: Array<{ heading: string; body: string; source_urls: string[] }>;
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

type BlogAuditClaimStatus = "PASS" | "FAIL" | "UNSUPPORTED" | "STALE_RISK" | "BLOCKED";

type BlogAuditReport = {
  recommendation: "PASS" | "PASS_WITH_EDITS" | "DO_NOT_PUBLISH";
  truthScore: number;
  brandScore: number;
  summary: string;
  claims: Array<{
    claim: string;
    status: BlogAuditClaimStatus;
    reason: string;
    evidence: string[];
    suggestedRewrite: string;
  }>;
  brandFindings: Array<{
    issue: string;
    severity: "low" | "medium" | "high";
    suggestedRewrite: string;
  }>;
  missingEvidence: string[];
  publishRisks: string[];
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

const navItems: Array<{ id: View; label: string; description: string; icon: NavIconName }> = [
  { id: "clients", label: "Clients", description: "Choose workspace", icon: "clients" },
  { id: "overview", label: "Overview", description: "Health and report coverage", icon: "overview" },
  { id: "brain", label: "Br(AI)N", description: "Vast blog audit", icon: "brain" },
  { id: "integrations", label: "Tool Setup", description: "Connect keys and metadata", icon: "tools" },
  { id: "analysis", label: "Competitive Analysis", description: "Generate market briefs", icon: "analysis" },
  { id: "insights", label: "Insights", description: "Review AI recommendations", icon: "insights" },
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
    content: "Switch between overview, Br(AI)N, tool setup, competitive analysis, and insights without losing context.",
    placement: "right",
  },
  {
    target: "[data-tour='nav-brain']",
    title: "Audit Vast blog drafts",
    content: "Br(AI)N checks a draft against current Vast truth sources and brand rules before publication.",
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
  const [view, setView] = useState<View>("clients");
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
  const [navPinned, setNavPinned] = useState(false);
  const [navActive, setNavActive] = useState(false);

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
  const hasClients = clients.length > 0;
  const navOpen = navPinned || navActive;

  async function loadDashboard(activeClientId = clientId) {
    try {
      setLoading(true);
      const clientBody = await api<{ clients: Client[] }>(activeClientId, "/api/seo/clients");
      setClients(clientBody.clients);

      if (!clientBody.clients.length) {
        setIntegrations([]);
        setInsights([]);
        setCompetitiveAnalyses([]);
        setMetricSnapshots([]);
        setNotice(null);
        return;
      }

      const resolvedClientId = clientBody.clients.some((client) => client.id === activeClientId) ? activeClientId : clientBody.clients[0].id;
      if (resolvedClientId !== activeClientId) {
        window.localStorage.setItem(CLIENT_STORAGE_KEY, resolvedClientId);
        setClientId(resolvedClientId);
      }

      const [integrationBody, insightBody, competitiveBody, metricBody] = await Promise.all([
        api<{ integrations: Integration[] }>(resolvedClientId, "/api/seo/integrations"),
        api<{ insights: Insight[] }>(resolvedClientId, "/api/seo/insights"),
        api<{ analyses: CompetitiveAnalysis[] }>(resolvedClientId, "/api/seo/competitive-analysis"),
        api<{ metricSnapshots: MetricSnapshot[] }>(resolvedClientId, "/api/seo/metrics"),
      ]);
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

    const nextClient = clients.find((client) => client.id === nextClientId);
    window.localStorage.setItem(CLIENT_STORAGE_KEY, nextClientId);
    setClientId(nextClientId);
    setView("overview");
    setIntegrations([]);
    setInsights([]);
    setMetricSnapshots([]);
    setCompetitiveAnalyses([]);
    setNotice({ type: "info", message: `Viewing client workspace: ${nextClient?.name || nextClientId}` });
    loadDashboard(nextClientId);
  }

  async function addClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();

    try {
      const body = await api<{ client: Client }>(clientId, "/api/seo/clients", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      form.reset();
      window.localStorage.setItem(CLIENT_STORAGE_KEY, body.client.id);
      setClientId(body.client.id);
      setView("overview");
      await loadDashboard(body.client.id);
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
    <section className="dashboard-shell" data-nav-open={navOpen} aria-labelledby="dashboard-title">
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

      <aside
        className="app-sidebar"
        aria-label="Dashboard navigation"
        onFocus={() => setNavActive(true)}
        onMouseEnter={() => setNavActive(true)}
        onMouseLeave={() => setNavActive(false)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setNavActive(false);
          }
        }}
      >
        <button
          className="nav-toggle"
          type="button"
          aria-label={navPinned ? "Collapse navigation" : "Expand navigation"}
          aria-expanded={navOpen}
          onClick={() => setNavPinned((current) => !current)}
        >
          <NavIcon name={navPinned ? "close" : "menu"} />
          <span className="nav-label" aria-hidden="true">{navPinned ? "Close" : "Menu"}</span>
        </button>
        {activeClient ? (
          <div className="sidebar-client-context" aria-label={`Active client: ${activeClient.name}`}>
            <ClientLogo client={activeClient} />
            <div className="nav-label">
              <span>Active client</span>
              <strong>{activeClient.name}</strong>
            </div>
          </div>
        ) : null}
        <div className="sidebar-brand">
          <p className="eyebrow">SEO Intelligence</p>
          <h1>Dashboard</h1>
          <p>{loading ? "Loading workspace..." : `${clients.length} client workspace${clients.length === 1 ? "" : "s"}`}</p>
        </div>

        {hasClients ? (
          <nav className="side-nav" data-tour="side-nav" aria-label="Primary">
            {navItems.map((item) => (
              <div className="nav-group" key={item.id}>
                <button
                  className="nav-item"
                  data-active={view === item.id}
                  data-tour={
                    item.id === "brain"
                      ? "nav-brain"
                      : item.id === "integrations"
                        ? "nav-integrations"
                        : item.id === "analysis"
                          ? "nav-analysis"
                          : item.id === "insights"
                            ? "nav-insights"
                            : undefined
                  }
                  type="button"
                  onClick={() => setView(item.id)}
                  aria-label={item.label}
                >
                  <NavIcon name={item.icon} />
                  <strong className="nav-label">{item.label}</strong>
                </button>
                {item.id === "integrations" && view === "integrations" ? (
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
        ) : null}

        <form action="/api/auth/logout" method="post">
          <button className="button sidebar-signout" type="submit" aria-label="Sign out">
            <NavIcon name="signout" />
            <span className="nav-label">Sign out</span>
          </button>
        </form>
      </aside>

      <div className="dashboard" aria-live="polite">
        {notice ? (
          <div className="alert" data-type={notice.type} role="status">
            {notice.message}
          </div>
        ) : null}

        {!hasClients || view === "clients" ? (
          <ClientsView
            clientId={clientId}
            clients={clients}
            loading={loading}
            onAddClient={addClient}
            onSwitchClient={switchClient}
          />
        ) : null}

        {hasClients ? (
          <>
            {view !== "clients" ? (
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
                </div>
              </div>
            ) : null}

            {view === "overview" ? (
              <OverviewView
                connectedCount={connectedCount}
                savedToolCount={savedToolCount}
                latestByProvider={latestByProvider}
                metricSnapshots={metricSnapshots}
                onSyncGa4={syncGa4Metrics}
                readiness={readiness}
                syncingGa4={syncingGa4}
              />
            ) : null}

            {view === "brain" ? <BrainView activeClient={activeClient} clientId={clientId} /> : null}

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
          </>
        ) : null}
      </div>
    </section>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
  };

  return (
    <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      {name === "clients" ? (
        <>
          <path {...common} d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path {...common} d="M2.8 19.2c.6-3.1 2.5-5 5.2-5s4.6 1.9 5.2 5" />
          <path {...common} d="M17 10.5a2.5 2.5 0 1 0 0-5" />
          <path {...common} d="M14.5 14.6c2.5.2 4.1 1.7 4.7 4.6" />
        </>
      ) : null}
      {name === "overview" ? (
        <>
          <path {...common} d="M4 13h6V4H4v9Z" />
          <path {...common} d="M14 20h6V4h-6v16Z" />
          <path {...common} d="M4 20h6v-3H4v3Z" />
        </>
      ) : null}
      {name === "brain" ? (
        <>
          <path {...common} d="M9 4.5a3 3 0 0 0-3 3v.3a3 3 0 0 0-1.2 5.4 3 3 0 0 0 3 5.3H9" />
          <path {...common} d="M15 4.5a3 3 0 0 1 3 3v.3a3 3 0 0 1 1.2 5.4 3 3 0 0 1-3 5.3H15" />
          <path {...common} d="M9 4.5v14" />
          <path {...common} d="M15 4.5v14" />
          <path {...common} d="M9 10h6" />
          <path {...common} d="M9 14h6" />
        </>
      ) : null}
      {name === "tools" ? (
        <>
          <path {...common} d="M14.5 6.5 17.5 3 21 6.5 17.5 10l-3-3.5Z" />
          <path {...common} d="m14.5 6.5-8.2 8.2a2.4 2.4 0 1 0 3.4 3.4l8.2-8.2" />
          <path {...common} d="M4 7h4" />
          <path {...common} d="M6 5v4" />
        </>
      ) : null}
      {name === "analysis" ? (
        <>
          <path {...common} d="M4 18V6" />
          <path {...common} d="M4 18h16" />
          <path {...common} d="m7 14 3.2-3.2 2.6 2.6L18.5 7.5" />
          <path {...common} d="M16 7.5h2.5V10" />
        </>
      ) : null}
      {name === "insights" ? (
        <>
          <path {...common} d="M9 18h6" />
          <path {...common} d="M10 21h4" />
          <path {...common} d="M8.3 14.5a6 6 0 1 1 7.4 0c-.9.7-1.3 1.5-1.4 2.5H9.7c-.1-1-.5-1.8-1.4-2.5Z" />
          <path {...common} d="M12 7v3" />
          <path {...common} d="m10.8 10.8 1.2 1.2 1.8-2" />
        </>
      ) : null}
      {name === "menu" ? (
        <>
          <path {...common} d="M4 7h16" />
          <path {...common} d="M4 12h16" />
          <path {...common} d="M4 17h16" />
        </>
      ) : null}
      {name === "close" ? (
        <>
          <path {...common} d="M6 6l12 12" />
          <path {...common} d="M18 6 6 18" />
        </>
      ) : null}
      {name === "signout" ? (
        <>
          <path {...common} d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" />
          <path {...common} d="M13 16l4-4-4-4" />
          <path {...common} d="M17 12H9" />
        </>
      ) : null}
    </svg>
  );
}

function viewTitle(view: View, provider: Provider) {
  if (view === "clients") return "Clients";
  if (view === "brain") return "Br(AI)N";
  if (view === "integrations") return providerDetails[provider].title;
  if (view === "analysis") return "Competitive Analysis";
  if (view === "insights") return "Insights";
  return "Overview";
}

function viewDescription(view: View, clientName: string, provider: Provider) {
  if (view === "clients") return "Choose or create the active client workspace.";
  if (view === "brain") return `${clientName}: audit Vast drafts for truth, evidence, and brand fit.`;
  if (view === "integrations") return `${clientName}: ${providerDetails[provider].description}`;
  if (view === "analysis") return `Generate competitive briefs for ${clientName}.`;
  if (view === "insights") return `Review AI recommendations for ${clientName}.`;
  return "Graph-style readiness, coverage, and output summary.";
}

function clientInitials(name: string) {
  const words = name
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "CL";
  const initials = words.slice(0, 2).map((word) => word[0]).join("");
  return initials.toUpperCase();
}

function ClientLogo({ client }: { client: Client }) {
  return (
    <span className="client-logo" aria-hidden="true">
      {clientInitials(client.name)}
    </span>
  );
}

function ClientsView({
  clientId,
  clients,
  loading,
  onAddClient,
  onSwitchClient,
}: {
  clientId: string;
  clients: Client[];
  loading: boolean;
  onAddClient: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchClient: (clientId: string) => void;
}) {
  const hasClients = clients.length > 0;
  const [mode, setMode] = useState<"list" | "create">("list");
  const showForm = !hasClients || mode === "create";

  return (
    <section className="client-page" aria-labelledby="client-selection-title">
      <div className="dashboard-client-selection" data-tour="client-switcher">
        <div className="dashboard-client-topline">
          <div>
            <p className="eyebrow">Client selection</p>
            <h2 id="client-selection-title">{showForm ? "Create a client." : "Choose a client."}</h2>
          </div>
          {hasClients ? (
            <button className="button" type="button" onClick={() => setMode(showForm ? "list" : "create")}>
              {showForm ? "Show Clients" : "New Client"}
            </button>
          ) : null}
        </div>

        {loading ? <p className="client-selection-empty">Loading clients...</p> : null}

        {!loading && hasClients && !showForm ? (
          <div className="dashboard-client-list" aria-label="Available clients">
            {clients.map((client) => {
              const isActive = client.id === clientId;

              return (
                <button
                  className="dashboard-client-option"
                  data-active={isActive}
                  key={client.id}
                  type="button"
                  onClick={() => onSwitchClient(client.id)}
                >
                  <ClientLogo client={client} />
                  <span>{client.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {!loading && showForm ? (
          <form className="first-client-form" onSubmit={onAddClient}>
            <label>
              Client name
              <input name="name" placeholder="Acme Health" required />
            </label>
            <button className="button button-primary" type="submit">
              {hasClients ? "Create Client" : "Add First Client"}
            </button>
          </form>
        ) : null}

        {!loading && showForm ? <p className="client-selection-empty">Client id is assigned automatically.</p> : null}
      </div>
    </section>
  );
}

function OverviewView({
  connectedCount,
  latestByProvider,
  metricSnapshots,
  onSyncGa4,
  readiness,
  savedToolCount,
  syncingGa4,
}: {
  connectedCount: number;
  latestByProvider: Partial<Record<Provider, Integration>>;
  metricSnapshots: MetricSnapshot[];
  onSyncGa4: () => void;
  readiness: number;
  savedToolCount: number;
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

      <section className="panel">
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

function BrainView({ activeClient, clientId }: { activeClient?: Client; clientId: string }) {
  const [auditReport, setAuditReport] = useState<BlogAuditReport | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  async function runAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file") as File | null;

    if (file && file.size === 0) {
      formData.delete("file");
    }

    try {
      setAuditing(true);
      setAuditError(null);
      const response = await fetch("/api/blog-audit", {
        method: "POST",
        headers: {
          "x-seo-client-id": clientId,
        },
        body: formData,
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(body.error || "Unable to audit blog draft.");
      }

      setAuditReport(body as BlogAuditReport);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to audit blog draft.");
    } finally {
      setAuditing(false);
    }
  }

  return (
    <div className="brain-workspace">
      <section className="panel brain-hero" aria-labelledby="brain-workspace-title">
        <div>
          <span className="eyebrow">Vast Blog Audit</span>
          <h3 id="brain-workspace-title">Truth before publishing.</h3>
          <p>
            Br(AI)N checks draft claims against Vast docs, site knowledge, live pricing, brand sources, and approved
            social feeds.
          </p>
        </div>
        <div className="brain-guardrails" aria-label="Publishing guardrails">
          <div>
            <strong>{activeClient?.name || "Client"}</strong>
            <span>workspace</span>
          </div>
          <div>
            <strong>Audit only</strong>
            <span>human approval required</span>
          </div>
        </div>
      </section>

      <section className="panel blog-audit-panel" aria-labelledby="blog-audit-form-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Draft input</span>
            <h3 id="blog-audit-form-title">Upload or paste a blog draft.</h3>
          </div>
        </div>

        <form className="blog-audit-form" onSubmit={runAudit}>
          <div className="audit-input-grid">
            <label>
              Title
              <input name="title" placeholder="How to Run Qwen on Vast.ai" />
            </label>
            <label>
              Format
              <select name="format" defaultValue="markdown">
                <option value="markdown">Markdown</option>
                <option value="plain_text">Plain text</option>
                <option value="html">HTML</option>
                <option value="url">URL</option>
              </select>
            </label>
          </div>
          <label>
            URL
            <input name="url" placeholder="https://example.com/draft" type="url" />
          </label>
          <label>
            Upload file
            <input name="file" type="file" accept=".md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html" />
          </label>
          <label>
            Draft content
            <textarea
              name="content"
              placeholder="# How to Run Qwen on Vast.ai&#10;&#10;Vast.ai offers..."
              rows={12}
            />
          </label>
          <div className="actions">
            <button className="button button-primary" type="submit" disabled={auditing}>
              {auditing ? "Auditing..." : "Audit Draft"}
            </button>
          </div>
        </form>

        {auditError ? (
          <div className="alert" data-type="error" role="status">
            {auditError}
          </div>
        ) : null}
      </section>

      <section className="panel audit-report-panel" aria-labelledby="blog-audit-report-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Structured report</span>
            <h3 id="blog-audit-report-title">Audit result</h3>
          </div>
        </div>

        {auditReport ? <AuditReportView report={auditReport} /> : <div className="empty-state">Run an audit to see truth, brand, evidence, and publish risk.</div>}
      </section>
    </div>
  );
}

function AuditReportView({ report }: { report: BlogAuditReport }) {
  return (
    <div className="audit-report">
      <div className="audit-score-grid">
        <ScoreBlock label="Recommendation" value={formatRecommendation(report.recommendation)} tone={report.recommendation} />
        <ScoreBlock label="Truth score" value={`${report.truthScore}`} />
        <ScoreBlock label="Brand score" value={`${report.brandScore}`} />
        <ScoreBlock label="Claims" value={`${report.claims.length}`} />
      </div>

      <p className="audit-summary">{report.summary}</p>

      <div className="audit-section">
        <h4>Claims</h4>
        <div className="audit-claim-list">
          {report.claims.length ? (
            report.claims.map((claim, index) => (
              <article className="audit-claim" data-status={claim.status} key={`${claim.claim}-${index}`}>
                <div className="card-top">
                  <span className="audit-status" data-status={claim.status}>
                    {claim.status.replace(/_/g, " ")}
                  </span>
                  <SourceLinks urls={claim.evidence} />
                </div>
                <strong>{claim.claim}</strong>
                <p>{claim.reason}</p>
                {claim.suggestedRewrite && claim.suggestedRewrite !== "No rewrite required." ? (
                  <div className="audit-rewrite">
                    <span>Suggested rewrite</span>
                    <p>{claim.suggestedRewrite}</p>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-state">No factual claims were extracted.</div>
          )}
        </div>
      </div>

      <AuditList title="Brand findings" items={report.brandFindings.map((finding) => `${finding.severity}: ${finding.issue} ${finding.suggestedRewrite}`)} />
      <AuditList title="Missing evidence" items={report.missingEvidence} />
      <AuditList title="Publish risks" items={report.publishRisks} />
    </div>
  );
}

function ScoreBlock({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <div className="audit-score" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AuditList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="audit-section">
      <h4>{title}</h4>
      {items.length ? (
        <ul className="audit-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">No items returned.</div>
      )}
    </div>
  );
}

function formatRecommendation(value: BlogAuditReport["recommendation"]) {
  return value.replace(/_/g, " ");
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
  const latestAnalysis = competitiveAnalyses[0];
  const latestEvidenceCount = latestAnalysis?.crawl_evidence?.reduce((total, site) => total + site.pages.length, 0) || 0;
  const latestSourceCount = latestAnalysis?.crawl_evidence?.filter((site) => site.status === "success" || site.status === "partial").length || 0;

  return (
    <div className="competitive-workspace">
      <section className="panel competitive-hero" aria-labelledby="competitive-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Competitive workspace</span>
            <h3 id="competitive-title">Evidence-backed competitor reports</h3>
            <p>
              Enter a company name. OpenAI fills the research brief, the crawler verifies public pages where it can,
              and the report separates observed facts from assumptions.
            </p>
          </div>
        </div>

        <div className="competitive-proof-grid">
          <div>
            <strong>{competitiveAnalyses.length}</strong>
            <span>saved reports</span>
          </div>
          <div>
            <strong>{latestSourceCount}</strong>
            <span>latest sources crawled</span>
          </div>
          <div>
            <strong>{latestEvidenceCount}</strong>
            <span>latest pages reviewed</span>
          </div>
        </div>
      </section>

      <section className="panel competitive-brief-panel" data-tour="competitive-analysis" aria-labelledby="competitive-brief-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Research brief</span>
            <h3 id="competitive-brief-title">Start with the company.</h3>
            <p>The system will infer the website, market, competitors, and search topics before collecting evidence.</p>
          </div>
        </div>
        <form className="competitive-form" onSubmit={onGenerateCompetitiveAnalysis}>
          <Field name="clientName" label="Company name" placeholder={activeClient?.name || "Acme Health"} required />
          <button className="button button-primary" data-tour="generate-competitive-analysis" type="submit" disabled={analyzing}>
            {analyzing ? "Filling brief and collecting evidence..." : "Generate report"}
          </button>
        </form>
      </section>

      <section className="panel competitive-results-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Output</span>
            <h3>Reports and evidence</h3>
            <p>Each report keeps the answer, the source trail, and the editable draft in one place.</p>
          </div>
        </div>
        <div className="analysis-results" aria-live="polite">
          {competitiveAnalyses.length ? (
            competitiveAnalyses.map((analysis) => <CompetitiveAnalysisCard analysis={analysis} key={analysis.id} />)
          ) : (
            <div className="competitive-empty-state">
              <span className="eyebrow">No report yet</span>
              <h4>Your first competitive brief will appear here.</h4>
              <p>
                Enter one company name. The first useful output should show what was crawled, what gaps were observed,
                and which claims are still uncertain.
              </p>
            </div>
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
  const reportDraft = analysis.report_draft || [];
  const successfulSites = crawlEvidence.filter((site) => site.status === "success" || site.status === "partial");
  const reviewedPageCount = crawlEvidence.reduce((total, site) => total + site.pages.length, 0);

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

      <div className="competitive-summary-grid">
        <div>
          <span>Competitors</span>
          <strong>{analysis.competitors.length}</strong>
        </div>
        <div>
          <span>Sources</span>
          <strong>{successfulSites.length}</strong>
        </div>
        <div>
          <span>Pages reviewed</span>
          <strong>{reviewedPageCount}</strong>
        </div>
        <div>
          <span>Draft sections</span>
          <strong>{reportDraft.length}</strong>
        </div>
      </div>

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
          <h5>Feature gap matrix</h5>
          {missingPatterns.slice(0, 5).map((pattern) => (
            <div className="pattern-row" key={`${analysis.id}-${pattern.feature}`}>
              <strong>{pattern.label}</strong>
              <span>{pattern.competitors.join(", ")}</span>
              <SourceLinks urls={pattern.evidence_urls} />
            </div>
          ))}
        </div>
      ) : null}

      {reportDraft.length ? (
        <div className="report-draft">
          <h5>Editable report draft</h5>
          {reportDraft.map((section) => (
            <div className="report-section" key={`${analysis.id}-${section.heading}`}>
              <strong>{section.heading}</strong>
              <p>{section.body}</p>
              <SourceLinks urls={section.source_urls} />
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
          <h5>Evidence board</h5>
          {crawlEvidence.map((site) => (
            <div className="crawl-site" key={`${analysis.id}-${site.site_role}-${site.name}`}>
              <div className="card-top">
                <strong>{site.name}</strong>
                <span>{site.status}</span>
              </div>
              <p>
                {site.feature_count} features across {site.pages.filter((page) => page.status === "success").length} crawled pages
              </p>
              {site.errors.length ? <p>{site.errors.slice(0, 2).join(" ")}</p> : null}
              <SourceLinks urls={site.pages.map((page) => page.url)} />
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

function SourceLinks({ urls }: { urls: string[] }) {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean))).slice(0, 5);

  if (!uniqueUrls.length) {
    return <span className="source-links">No source links attached</span>;
  }

  return (
    <span className="source-links">
      Sources{" "}
      {uniqueUrls.map((url, index) => (
        <a href={url} target="_blank" rel="noreferrer" key={url}>
          {index + 1}
        </a>
      ))}
    </span>
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
