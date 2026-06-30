"use client";

import { CircleClickLogo } from "@/components/CircleClickLogo";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from "react-joyride";

type Provider = "ga4" | "gtm" | "hotjar" | "openai" | "mcp";
type Status = "disconnected" | "connected" | "error";
type View = "clients" | "overview" | "brain" | "watch" | "integrations" | "analysis" | "insights";
type NavIconName = "clients" | "overview" | "brain" | "watch" | "tools" | "analysis" | "insights" | "menu" | "close" | "signout";
type WebsiteWatchTool = "surface" | "tracker" | "deep";
type DeepAuditAccess = "public" | "vercel" | "basic" | "login" | "custom";
type ToastNoticeState = {
  id: number;
  type: "success" | "info" | "error";
  title: string;
  message: string;
  phase: "open" | "closing";
};

type PageHeroStat = {
  label: string;
  value: string;
  helper?: string;
};

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
type BlogAuditExternalEvidenceStatus = "NOT_NEEDED" | "UNAVAILABLE" | "CHECKED" | "FAILED";

type BlogAuditExternalEvidenceSummary = {
  status: BlogAuditExternalEvidenceStatus;
  message: string;
  checkedClaims: number;
  supportedClaims: number;
  evidenceUrls: string[];
};

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
  externalEvidence?: BlogAuditExternalEvidenceSummary;
};

type BlogAuditHistoryItem = {
  id: string;
  createdAt: string;
  sourceLabel: string;
  report: BlogAuditReport;
};

type WebsiteSurfaceIssue = {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  url?: string;
};

type WebsiteSurfacePageResult = {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  missingAltCount: number;
  internalLinksFound: number;
  issues: WebsiteSurfaceIssue[];
};

type WebsiteSurfaceResult = {
  siteUrl: string;
  checkedAt: string;
  status: "healthy" | "warning" | "failed";
  summary: {
    pagesChecked: number;
    linksChecked: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  pages: WebsiteSurfacePageResult[];
  issues: WebsiteSurfaceIssue[];
};

type SeoChangeKind = "status" | "title" | "metaDescription" | "canonical" | "robots" | "h1" | "openGraph" | "copy" | "page";

type SeoPageSnapshot = {
  url: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  wordCount: number;
  copyHash: string;
  copySample: string;
};

type SeoChangeRecord = {
  kind: SeoChangeKind;
  severity: WebsiteSurfaceIssue["severity"];
  label: string;
  detail: string;
  before: string | null;
  after: string | null;
  url: string;
};

type SeoChangeTrackerBaseline = {
  version: 1;
  siteUrl: string;
  capturedAt: string;
  pages: SeoPageSnapshot[];
};

type SeoChangeTrackerResult = {
  siteUrl: string;
  checkedAt: string;
  status: "baseline" | "unchanged" | "changed" | "failed";
  summary: {
    pagesChecked: number;
    changedPages: number;
    metadataChanges: number;
    copyChanges: number;
    technicalChanges: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  pages: Array<SeoPageSnapshot & { changes: SeoChangeRecord[] }>;
  changes: SeoChangeRecord[];
  baseline: SeoChangeTrackerBaseline;
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
  { id: "watch", label: "Website Watch", description: "Surface checks and audit setup", icon: "watch" },
  { id: "integrations", label: "Tool Setup", description: "Connect keys and metadata", icon: "tools" },
  { id: "analysis", label: "Competitive Analysis", description: "Generate market briefs", icon: "analysis" },
  { id: "insights", label: "Insights", description: "Review AI recommendations", icon: "insights" },
];

const websiteWatchTools: Array<{ id: WebsiteWatchTool; label: string; description: string }> = [
  { id: "surface", label: "Surface Check", description: "Public page review" },
  { id: "tracker", label: "SEO Tracker", description: "Metadata and copy changes" },
  { id: "deep", label: "Deep Audit", description: "Protected access setup" },
];

const DEFAULT_CLIENT_ID = "demo-client";
const CLIENT_STORAGE_KEY = "seo-intelligence-client-id";
const COMPETITIVE_REPORTS_PER_PAGE = 1;

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
    target: "[data-tour='nav-watch']",
    title: "Watch public pages",
    content: "Run fast surface checks from the dashboard, then prepare deeper browser audits when protected access is needed.",
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
  const [toastNotice, setToastNotice] = useState<ToastNoticeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingGa4, setSyncingGa4] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [surfaceChecking, setSurfaceChecking] = useState(false);
  const [surfaceResult, setSurfaceResult] = useState<WebsiteSurfaceResult | null>(null);
  const [seoTracking, setSeoTracking] = useState(false);
  const [seoTrackerBaseline, setSeoTrackerBaseline] = useState<SeoChangeTrackerBaseline | null>(null);
  const [seoTrackerResult, setSeoTrackerResult] = useState<SeoChangeTrackerResult | null>(null);
  const [tourRunning, setTourRunning] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider>("ga4");
  const [activeWatchTool, setActiveWatchTool] = useState<WebsiteWatchTool>("surface");
  const [navPinned, setNavPinned] = useState(false);

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
  const navOpen = navPinned;

  function showToastNotice(toast: Omit<ToastNoticeState, "id" | "phase">) {
    setToastNotice({
      ...toast,
      id: Date.now(),
      phase: "open",
    });
  }

  useEffect(() => {
    if (!toastNotice || toastNotice.phase === "closing") {
      return;
    }

    const closeTimer = window.setTimeout(() => {
      setToastNotice((current) => (current?.id === toastNotice.id ? { ...current, phase: "closing" } : current));
    }, 3400);

    return () => window.clearTimeout(closeTimer);
  }, [toastNotice]);

  useEffect(() => {
    if (!toastNotice || toastNotice.phase !== "closing") {
      return;
    }

    const removeTimer = window.setTimeout(() => {
      setToastNotice((current) => (current?.id === toastNotice.id ? null : current));
    }, 340);

    return () => window.clearTimeout(removeTimer);
  }, [toastNotice]);

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
      setNotice(null);
      showToastNotice({
        type: "success",
        title: "Report generated",
        message: `${body.analysis.client_name || payload.clientName || "Competitive report"} is ready in Reports and evidence.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to generate competitive analysis.",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function runWebsiteSurfaceCheck(payload: { siteUrl: string; pages: string; expectedText: string }) {
    try {
      setSurfaceChecking(true);
      const body = await api<{ result: WebsiteSurfaceResult }>(clientId, "/api/seo/website-watch/surface", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSurfaceResult(body.result);
      const issueCount =
        body.result.summary.critical + body.result.summary.high + body.result.summary.medium + body.result.summary.low;
      setNotice({
        type: body.result.status === "failed" ? "error" : body.result.status === "warning" ? "info" : "success",
        message: `Surface check completed with ${issueCount} issue${issueCount === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to run surface check." });
    } finally {
      setSurfaceChecking(false);
    }
  }

  async function runSeoChangeTracker(payload: { siteUrl: string; pages: string }) {
    try {
      setSeoTracking(true);
      const body = await api<{ result: SeoChangeTrackerResult }>(clientId, "/api/seo/website-watch/seo-change-tracker", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          baseline: seoTrackerBaseline,
        }),
      });
      setSeoTrackerResult(body.result);
      setSeoTrackerBaseline(body.result.baseline);
      setNotice({
        type: body.result.status === "changed" ? "info" : "success",
        message:
          body.result.status === "baseline"
            ? `SEO change baseline captured for ${body.result.summary.pagesChecked} page${body.result.summary.pagesChecked === 1 ? "" : "s"}.`
            : `SEO tracker scanned ${body.result.summary.pagesChecked} page${body.result.summary.pagesChecked === 1 ? "" : "s"} and found ${body.result.summary.changedPages} changed page${body.result.summary.changedPages === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to run SEO change tracker." });
    } finally {
      setSeoTracking(false);
    }
  }

  function handleTourCallback(data: EventData) {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setTourRunning(false);
    }
  }

  function handleNavSelect(nextView: View) {
    setView(nextView);
    if (window.matchMedia("(max-width: 880px)").matches) {
      setNavPinned(false);
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
          <CircleClickLogo className="sidebar-brand-mark" />
          <div className="sidebar-brand-copy">
            <p className="eyebrow">CircleClick SEO</p>
            <h1>Dashboard</h1>
            <p>{loading ? "Loading workspace..." : `${clients.length} client workspace${clients.length === 1 ? "" : "s"}`}</p>
          </div>
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
                      : item.id === "watch"
                        ? "nav-watch"
                      : item.id === "integrations"
                        ? "nav-integrations"
                        : item.id === "analysis"
                          ? "nav-analysis"
                          : item.id === "insights"
                            ? "nav-insights"
                            : undefined
                  }
                  type="button"
                  onClick={() => handleNavSelect(item.id)}
                  aria-label={item.label}
                >
                  <NavIcon name={item.icon} />
                  <span className="nav-label nav-item-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
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
                          handleNavSelect("integrations");
                        }}
                      >
                        {providerLabels[provider]}
                      </button>
                    ))}
                  </div>
                ) : null}
                {item.id === "watch" && view === "watch" ? (
                  <div className="provider-subnav watch-subnav" aria-label="Website Watch tools">
                    {websiteWatchTools.map((tool) => (
                      <button
                        className="provider-subnav-item watch-subnav-item"
                        data-active={activeWatchTool === tool.id}
                        key={tool.id}
                        type="button"
                        onClick={() => {
                          setActiveWatchTool(tool.id);
                          handleNavSelect("watch");
                        }}
                      >
                        <span>{tool.label}</span>
                        <small>{tool.description}</small>
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

      {navOpen ? (
        <button className="mobile-nav-scrim" type="button" aria-label="Close navigation" onClick={() => setNavPinned(false)} />
      ) : null}

      <ToastNotice toast={toastNotice} />

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
                  <ClientBadge name={activeClient?.name || clientId} />
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

            {view === "watch" ? (
              <WebsiteWatchView
                activeTool={activeWatchTool}
                activeClient={activeClient}
                latestSiteUrl={competitiveAnalyses.find((analysis) => analysis.website_url)?.website_url || ""}
                onResetSeoTrackerBaseline={() => {
                  setSeoTrackerBaseline(null);
                  setSeoTrackerResult(null);
                }}
                onRunSeoChangeTracker={runSeoChangeTracker}
                onRunSurfaceCheck={runWebsiteSurfaceCheck}
                seoTrackerBaseline={seoTrackerBaseline}
                seoTrackerResult={seoTrackerResult}
                seoTracking={seoTracking}
                surfaceChecking={surfaceChecking}
                surfaceResult={surfaceResult}
              />
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
      {name === "watch" ? (
        <>
          <path {...common} d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
          <path {...common} d="M12 8v4l2.6 2" />
          <path {...common} d="M4 4l2.2 2.2" />
          <path {...common} d="M20 4l-2.2 2.2" />
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
  if (view === "watch") return "Website Watch";
  if (view === "integrations") return providerDetails[provider].title;
  if (view === "analysis") return "Competitive Analysis";
  if (view === "insights") return "Insights";
  return "Overview";
}

function viewDescription(view: View, clientName: string, provider: Provider) {
  if (view === "clients") return "Choose or create the active client workspace.";
  if (view === "brain") return `${clientName}: audit Vast drafts for truth, evidence, and brand fit.`;
  if (view === "watch") return `${clientName}: fast surface checks and deeper audit setup.`;
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

function ClientBadge({ name }: { name: string }) {
  return (
    <span className="client-badge" aria-label={`Active client: ${name}`} title={name}>
      {name}
    </span>
  );
}

function PageWorkspace({
  children,
  className = "",
  tourId,
}: {
  children: ReactNode;
  className?: string;
  tourId?: string;
}) {
  return (
    <div className={`page-workspace ${className}`} data-tour={tourId}>
      <reactive-dot-ribbon
        aria-hidden="true"
        className="workspace-background-ribbon"
        source="/dots-pattern.webp"
      />
      {children}
    </div>
  );
}

function PageHero({
  description,
  eyebrow,
  stats,
  title,
}: {
  description: string;
  eyebrow: string;
  stats?: PageHeroStat[];
  title: string;
}) {
  return (
    <section className="panel page-hero" aria-label={title}>
      <div className="page-hero-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {stats?.length ? (
        <div className="page-proof-grid">
          {stats.map((stat) => (
            <div key={`${stat.label}-${stat.value}`}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
              {stat.helper ? <small>{stat.helper}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ToastNotice({ toast }: { toast: ToastNoticeState | null }) {
  if (!toast) {
    return null;
  }

  return (
    <div className="toast-stack" aria-atomic="true" aria-live="polite">
      <div className="toast-notice" data-phase={toast.phase} data-type={toast.type} role="status">
        <span className="toast-status-dot" aria-hidden="true" />
        <div className="toast-copy">
          <strong>{toast.title}</strong>
          <p>{toast.message}</p>
        </div>
        <span className="toast-progress" aria-hidden="true" />
      </div>
    </div>
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
  const activeClient = clients.find((client) => client.id === clientId);
  const scopeRows = [
    {
      label: "Active workspace",
      value: activeClient?.name || (loading ? "Loading" : "No client selected"),
      helper: clientId,
    },
    {
      label: "Reports",
      value: "Scoped",
      helper: "Competitive briefs, Br(AI)N audits, and watch results follow this client.",
    },
    {
      label: "Connectors",
      value: "Isolated",
      helper: "Saved tool credentials and tests stay attached to the selected workspace.",
    },
  ];

  return (
    <PageWorkspace className="client-workspace">
      <PageHero
        eyebrow="Workspace control"
        title="Choose the client before anything runs."
        description="Every connector, audit, report, and insight is scoped to the active client workspace."
        stats={[
          { label: "saved clients", value: loading ? "..." : String(clients.length) },
          { label: "active id", value: clientId },
        ]}
      />

      <section className="client-page client-module-grid" aria-labelledby="client-selection-title">
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

        <aside className="panel client-scope-panel" aria-label="Client workspace scope">
          <span className="eyebrow">Workspace scope</span>
          <h3>Everything follows this client.</h3>
          <p>Switching clients changes the saved tools, reports, insights, and audit history shown across the dashboard.</p>
          <div className="client-scope-list">
            {scopeRows.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <small>{row.helper}</small>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </PageWorkspace>
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
    <PageWorkspace className="overview" tourId="app-overview">
      <PageHero
        eyebrow="Operating overview"
        title="Readiness, coverage, and traffic in one pass."
        description="Start here to understand whether the workspace has enough connected data to generate useful reports."
        stats={[
          { label: "setup readiness", value: `${readiness}%` },
          { label: "connected tools", value: `${connectedCount}/5`, helper: `${savedToolCount} saved` },
          { label: "GA4 users", value: formatNumber(ga4Summary.activeUsers), helper: "last synced window" },
        ]}
      />

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
    </PageWorkspace>
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
  const [auditHistory, setAuditHistory] = useState<BlogAuditHistoryItem[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const auditFormRef = useRef<HTMLFormElement | null>(null);
  const auditTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function runAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file") as File | null;
    const hasFile = file instanceof File && file.size > 0;
    const pastedContent = String(formData.get("content") || "");
    const sourceLabel = hasFile ? file.name : inferDraftLabel(pastedContent);

    if (!hasFile) {
      formData.delete("file");
    }

    try {
      setAuditing(true);
      setAuditError(null);
      setAuditReport(null);
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

      const nextReport = body as BlogAuditReport;
      const historyItem: BlogAuditHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        sourceLabel,
        report: nextReport,
      };

      setAuditReport(nextReport);
      setAuditHistory((items) => [historyItem, ...items].slice(0, 8));
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to audit blog draft.");
    } finally {
      setAuditing(false);
    }
  }

  function startAnotherAudit() {
    setAuditReport(null);
    setAuditError(null);
    setSelectedFileName(null);
    auditFormRef.current?.reset();
    window.setTimeout(() => auditTextareaRef.current?.focus(), 0);
  }

  return (
    <PageWorkspace className="brain-workspace">
      <section className="panel brain-brief-panel" aria-label="Vast Blog Audit">
        <div className="brain-brief-copy">
          <span className="eyebrow">Vast Blog Audit</span>
          <h3>Truth before publishing.</h3>
          <p>Checks draft claims against Vast docs, site knowledge, live pricing, brand sources, and approved social feeds.</p>
        </div>
        <div className="brain-brief-meta" aria-label="Audit context">
          <div>
            <span>Workspace</span>
            <strong>{activeClient?.name || "Client"}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>Audit only</strong>
            <small>Human approval required</small>
          </div>
        </div>
      </section>

      {!auditReport ? (
        <section className="panel blog-audit-panel" aria-labelledby="blog-audit-form-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Draft input</span>
              <h3 id="blog-audit-form-title">Upload or paste a blog draft.</h3>
            </div>
          </div>

          <form className="blog-audit-form" ref={auditFormRef} onSubmit={runAudit}>
            <label className="audit-upload-card">
              <input
                name="file"
                type="file"
                accept=".md,.markdown,.mdx,.txt,.html,.htm,.csv,.docx,.zip,text/markdown,text/plain,text/html,text/csv,application/zip,application/x-zip-compressed,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setSelectedFileName(event.currentTarget.files?.[0]?.name || null)}
              />
              <span className="eyebrow">Upload draft or ZIP</span>
              <strong>{selectedFileName || "Choose a file"}</strong>
              <small>Markdown, text, HTML, CSV, DOCX, and ZIP files are supported.</small>
            </label>

            <div className="audit-input-divider" aria-hidden="true">
              <span>or paste it</span>
            </div>

            <label className="audit-paste-field">
              Paste draft
              <textarea
                name="content"
                placeholder="Paste the draft here."
                ref={auditTextareaRef}
                rows={14}
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
      ) : null}

      {auditReport || auditHistory.length ? (
        <div className="audit-output-column" data-mode={auditReport ? "report" : "history"}>
          {auditReport ? (
            <section className="panel audit-report-panel" aria-labelledby="blog-audit-report-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Structured report</span>
                  <h3 id="blog-audit-report-title">Audit result</h3>
                </div>
                <button className="button" type="button" onClick={startAnotherAudit}>
                  New audit
                </button>
              </div>

              <AuditReportView report={auditReport} />
            </section>
          ) : null}

          {auditHistory.length ? (
            <AuditHistoryPanel activeReport={auditReport} items={auditHistory} onSelectReport={setAuditReport} />
          ) : null}
        </div>
      ) : null}
    </PageWorkspace>
  );
}

function AuditHistoryPanel({
  activeReport,
  items,
  onSelectReport,
}: {
  activeReport: BlogAuditReport | null;
  items: BlogAuditHistoryItem[];
  onSelectReport: (report: BlogAuditReport) => void;
}) {
  return (
    <section className="panel audit-history-panel" aria-labelledby="audit-history-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Audit history</span>
          <h3 id="audit-history-title">Previous reports</h3>
        </div>
      </div>

      <div className="audit-history-list">
        {items.map((item) => (
          <button
            className="audit-history-item"
            data-active={activeReport === item.report}
            key={item.id}
            type="button"
            onClick={() => onSelectReport(item.report)}
          >
            <span className="audit-history-copy">
              <strong>{item.sourceLabel}</strong>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
            </span>
            <span className="audit-history-meta" aria-label="Report scores">
              <span>{formatRecommendation(item.report.recommendation)}</span>
              <span>{item.report.truthScore} truth</span>
              <span>{item.report.claims.length} claims</span>
            </span>
          </button>
        ))}
      </div>
    </section>
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

      <ExternalEvidenceSummary evidence={report.externalEvidence} />

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

function ExternalEvidenceSummary({ evidence }: { evidence?: BlogAuditExternalEvidenceSummary }) {
  if (!evidence) {
    return null;
  }

  return (
    <div className="audit-evidence-summary" data-status={evidence.status}>
      <div className="audit-evidence-copy">
        <span>External evidence</span>
        <strong>{formatExternalEvidenceStatus(evidence.status)}</strong>
        <p>{evidence.message}</p>
      </div>
      <div className="audit-evidence-meta">
        <span>{evidence.checkedClaims} checked</span>
        <span>{evidence.supportedClaims} supported</span>
        {evidence.evidenceUrls.length ? <SourceLinks urls={evidence.evidenceUrls} /> : null}
      </div>
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

const deepAuditGuidance: Record<
  DeepAuditAccess,
  {
    label: string;
    summary: string;
    fields: Array<{ label: string; placeholder: string; secret?: boolean }>;
    secrets: string[];
    steps: string[];
  }
> = {
  public: {
    label: "Public site",
    summary: "Use this when the important pages are reachable without a login or deployment gate.",
    fields: [],
    secrets: ["SLACK_WEBHOOK_URL", "WEBSITE_WATCH_GITHUB_TOKEN"],
    steps: [
      "Create a GitHub workflow for the browser audit.",
      "Add the Slack webhook as a GitHub secret.",
      "Run Playwright and Lighthouse against the public URL.",
    ],
  },
  vercel: {
    label: "Vercel protected",
    summary: "Use this for preview or production URLs behind Vercel deployment protection.",
    fields: [
      { label: "Protected URL", placeholder: "https://preview.example.com" },
      { label: "Bypass token or signed access value", placeholder: "Stored as a GitHub/Vercel secret", secret: true },
    ],
    secrets: ["VERCEL_PROTECTION_BYPASS", "SLACK_WEBHOOK_URL", "WEBSITE_WATCH_GITHUB_TOKEN"],
    steps: [
      "Create or retrieve the Vercel automation bypass value.",
      "Store it as a GitHub secret, not a public dashboard value.",
      "Send the bypass value as a request header during the deep audit.",
    ],
  },
  basic: {
    label: "Basic auth",
    summary: "Use this when staging is protected by a username and password prompt.",
    fields: [
      { label: "Username", placeholder: "Stored as BASIC_AUTH_USERNAME" },
      { label: "Password", placeholder: "Stored as BASIC_AUTH_PASSWORD", secret: true },
    ],
    secrets: ["BASIC_AUTH_USERNAME", "BASIC_AUTH_PASSWORD", "SLACK_WEBHOOK_URL"],
    steps: [
      "Create a low-privilege audit-only credential.",
      "Store username and password as GitHub secrets.",
      "Have Playwright pass HTTP credentials when opening the site.",
    ],
  },
  login: {
    label: "Test login",
    summary: "Use this when the audit must sign into an app before checking pages.",
    fields: [
      { label: "Login URL", placeholder: "https://app.example.com/login" },
      { label: "Test account email", placeholder: "Stored as WATCHDOG_TEST_EMAIL" },
      { label: "Test account password", placeholder: "Stored as WATCHDOG_TEST_PASSWORD", secret: true },
    ],
    secrets: ["WATCHDOG_TEST_EMAIL", "WATCHDOG_TEST_PASSWORD", "SLACK_WEBHOOK_URL"],
    steps: [
      "Create a test account with the smallest required permissions.",
      "Store credentials as GitHub secrets.",
      "Make the deep audit sign in, save session state, then run page checks.",
    ],
  },
  custom: {
    label: "Custom header",
    summary: "Use this when the site accepts an internal audit header or signed token.",
    fields: [
      { label: "Header name", placeholder: "x-watchdog-access" },
      { label: "Header value", placeholder: "Stored as WATCHDOG_ACCESS_HEADER_VALUE", secret: true },
    ],
    secrets: ["WATCHDOG_ACCESS_HEADER_NAME", "WATCHDOG_ACCESS_HEADER_VALUE", "SLACK_WEBHOOK_URL"],
    steps: [
      "Define one reviewed access header on the target app.",
      "Store the header name and value as GitHub secrets.",
      "Have Playwright include the header on every deep audit request.",
    ],
  },
};

function WebsiteWatchView({
  activeTool,
  activeClient,
  latestSiteUrl,
  onResetSeoTrackerBaseline,
  onRunSeoChangeTracker,
  onRunSurfaceCheck,
  seoTrackerBaseline,
  seoTrackerResult,
  seoTracking,
  surfaceChecking,
  surfaceResult,
}: {
  activeTool: WebsiteWatchTool;
  activeClient?: Client;
  latestSiteUrl: string;
  onResetSeoTrackerBaseline: () => void;
  onRunSeoChangeTracker: (payload: { siteUrl: string; pages: string }) => void;
  onRunSurfaceCheck: (payload: { siteUrl: string; pages: string; expectedText: string }) => void;
  seoTrackerBaseline: SeoChangeTrackerBaseline | null;
  seoTrackerResult: SeoChangeTrackerResult | null;
  seoTracking: boolean;
  surfaceChecking: boolean;
  surfaceResult: WebsiteSurfaceResult | null;
}) {
  const [accessMethod, setAccessMethod] = useState<DeepAuditAccess>("public");
  const guidance = deepAuditGuidance[accessMethod];

  function handleSurfaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onRunSurfaceCheck({
      siteUrl: String(formData.get("siteUrl") || ""),
      pages: String(formData.get("pages") || ""),
      expectedText: String(formData.get("expectedText") || ""),
    });
  }

  function handleTrackerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onRunSeoChangeTracker({
      siteUrl: String(formData.get("siteUrl") || ""),
      pages: String(formData.get("pages") || ""),
    });
  }

  return (
    <PageWorkspace className="website-watch">
      <PageHero
        eyebrow="Website monitoring"
        title="Public crawls first. Deep audits when access is ready."
        description="Surface Check finds obvious breakage. SEO Tracker watches public metadata and copy shifts. Deep Audit handles protected pages, Sanity, CMS, screenshots, Lighthouse, and logged-in flows."
        stats={[
          { label: "Surface Check", value: "Runs now", helper: "public page review" },
          {
            label: "SEO Tracker",
            value: seoTrackerResult ? seoChangeStatusLabel(seoTrackerResult.status) : "Baseline ready",
            helper: "metadata and copy crawl",
          },
          { label: "Deep Audit", value: "Setup guided", helper: "Sanity and protected sources" },
        ]}
      />

      <div className="watch-tool-stage">
        {activeTool === "surface" ? (
          <section className="panel watch-run-panel" aria-labelledby="surface-check-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Surface check</span>
                <h3 id="surface-check-title">Review public pages</h3>
                <p>Use one public origin. Page paths stay on the same domain for safety.</p>
              </div>
            </div>

            <form className="watch-form" onSubmit={handleSurfaceSubmit}>
              <label>
                Site URL
                <input name="siteUrl" type="url" placeholder="https://example.com" defaultValue={latestSiteUrl} required />
              </label>
              <label>
                Key pages
                <textarea name="pages" defaultValue={"/\n/pricing\n/services\n/blog\n/contact"} rows={6} />
              </label>
              <label>
                Expected text
                <textarea name="expectedText" defaultValue={activeClient?.name || ""} rows={3} />
              </label>
              <button className="button button-primary" type="submit" disabled={surfaceChecking}>
                {surfaceChecking ? "Checking pages..." : "Run Surface Check"}
              </button>
            </form>
          </section>
        ) : null}

        {activeTool === "tracker" ? (
          <section className="panel watch-run-panel seo-tracker-panel" aria-labelledby="seo-tracker-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">SEO tracker</span>
                <h3 id="seo-tracker-title">Track public metadata and copy changes</h3>
                <p>Run once to capture a baseline. Run again to compare public titles, descriptions, canonicals, robots tags, H1s, Open Graph, and body copy.</p>
              </div>
              {seoTrackerBaseline ? (
                <button className="button" type="button" onClick={onResetSeoTrackerBaseline}>
                  Reset baseline
                </button>
              ) : null}
            </div>

            <form className="watch-form" onSubmit={handleTrackerSubmit}>
              <label>
                Site URL
                <input name="siteUrl" type="url" placeholder="https://example.com" defaultValue={latestSiteUrl} required />
              </label>
              <label>
                Key pages
                <textarea name="pages" defaultValue={"/\n/pricing\n/services\n/blog\n/contact"} rows={6} />
              </label>
              <div className="tracker-baseline-note" data-ready={Boolean(seoTrackerBaseline)}>
                <strong>{seoTrackerBaseline ? "Baseline active" : "No baseline yet"}</strong>
                <span>
                  {seoTrackerBaseline
                    ? `Last captured ${new Date(seoTrackerBaseline.capturedAt).toLocaleString()} from ${seoTrackerBaseline.pages.length} page${seoTrackerBaseline.pages.length === 1 ? "" : "s"}.`
                    : "The first crawl captures the comparison point. Credentialed Sanity/CMS checks belong in Deep Audit."}
                </span>
              </div>
              <button className="button button-primary" type="submit" disabled={seoTracking}>
                {seoTracking ? "Scanning SEO changes..." : seoTrackerBaseline ? "Scan for SEO Changes" : "Capture SEO Baseline"}
              </button>
            </form>
          </section>
        ) : null}

        {activeTool === "deep" ? (
          <section className="panel deep-audit-panel" aria-labelledby="deep-audit-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Deep audit</span>
                <h3 id="deep-audit-title">Prepare protected access</h3>
                <p>Choose the access shape for protected pages, Sanity, CMS, and source-of-truth comparisons. Secrets should live in GitHub or Vercel, never in public client code.</p>
              </div>
            </div>

            <div className="access-methods" aria-label="Access method">
              {(Object.keys(deepAuditGuidance) as DeepAuditAccess[]).map((method) => (
                <button
                  className="access-method"
                  data-active={accessMethod === method}
                  key={method}
                  type="button"
                  onClick={() => setAccessMethod(method)}
                >
                  {deepAuditGuidance[method].label}
                </button>
              ))}
            </div>

            <div className="deep-audit-guidance">
              <p>{guidance.summary}</p>
              {guidance.fields.length ? (
                <div className="access-field-grid">
                  {guidance.fields.map((field) => (
                    <label key={field.label}>
                      {field.label}
                      <input type={field.secret ? "password" : "text"} placeholder={field.placeholder} autoComplete="off" />
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="deep-audit-note">
                Setup worksheet only. Store real secrets in GitHub or Vercel before enabling Sanity, CMS, repository, or logged-in source checks.
              </p>
              <div className="credentialed-source-grid" aria-label="Credentialed source checks">
                <div>
                  <strong>Sanity</strong>
                  <span>Read title, slug, meta fields, and portable text revisions with a read token.</span>
                </div>
                <div>
                  <strong>CMS / repo</strong>
                  <span>Compare crawl output to source-controlled copy, routes, and published content metadata.</span>
                </div>
                <div>
                  <strong>Logged-in pages</strong>
                  <span>Use browser sessions for protected previews, dashboards, and gated page variants.</span>
                </div>
              </div>
              <div className="secret-list" aria-label="Required secret names">
                {guidance.secrets.map((secret) => (
                  <code key={secret}>{secret}</code>
                ))}
              </div>
              <ol className="setup-list">
                {guidance.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <button className="button" type="button" disabled>
                Deep Audit runner not connected yet
              </button>
            </div>
          </section>
        ) : null}
      </div>

      {activeTool === "surface" && surfaceResult ? <WebsiteSurfaceResults result={surfaceResult} /> : null}
      {activeTool === "tracker" && seoTrackerResult ? <SeoChangeTrackerResults result={seoTrackerResult} /> : null}
    </PageWorkspace>
  );
}

function WebsiteSurfaceResults({ result }: { result: WebsiteSurfaceResult }) {
  const topIssues = result.issues.slice(0, 8);

  return (
    <section className="panel surface-results" aria-labelledby="surface-results-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Latest result</span>
          <h3 id="surface-results-title">{surfaceStatusLabel(result.status)}</h3>
          <p>
            Checked {result.summary.pagesChecked} pages and {result.summary.linksChecked} internal links at{" "}
            {new Date(result.checkedAt).toLocaleString()}.
          </p>
        </div>
        <span className="surface-status" data-status={result.status}>
          {result.status}
        </span>
      </div>

      <div className="surface-score-grid" aria-label="Issue counts">
        <SurfaceScore label="Critical" value={result.summary.critical} severity="critical" />
        <SurfaceScore label="High" value={result.summary.high} severity="high" />
        <SurfaceScore label="Medium" value={result.summary.medium} severity="medium" />
        <SurfaceScore label="Low" value={result.summary.low} severity="low" />
      </div>

      <div className="surface-result-grid">
        <div className="surface-page-list">
          <h4>Pages checked</h4>
          {result.pages.map((page) => (
            <div className="surface-page-row" data-ok={page.ok} key={page.url}>
              <div>
                <strong>{page.title || page.url}</strong>
                <span>{page.finalUrl}</span>
              </div>
              <small>{page.status || "Error"}</small>
            </div>
          ))}
        </div>

        <div className="surface-issue-list">
          <h4>Top issues</h4>
          {topIssues.length ? (
            topIssues.map((issue) => (
              <article className="surface-issue" data-severity={issue.severity} key={`${issue.title}-${issue.url}-${issue.detail}`}>
                <span>{issue.severity}</span>
                <strong>{issue.title}</strong>
                <p>{issue.detail}</p>
                {issue.url ? <small>{issue.url}</small> : null}
              </article>
            ))
          ) : (
            <div className="empty-state">No surface issues were found in this run.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function SeoChangeTrackerResults({ result }: { result: SeoChangeTrackerResult }) {
  const topChanges = result.changes.slice(0, 12);

  return (
    <section className="panel seo-tracker-results" aria-labelledby="seo-tracker-results-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Latest SEO crawl</span>
          <h3 id="seo-tracker-results-title">{seoChangeStatusLabel(result.status)}</h3>
          <p>
            Checked {result.summary.pagesChecked} public page{result.summary.pagesChecked === 1 ? "" : "s"} at{" "}
            {new Date(result.checkedAt).toLocaleString()}.
          </p>
        </div>
        <span className="tracker-status" data-status={result.status}>
          {result.status}
        </span>
      </div>

      <div className="tracker-score-grid" aria-label="SEO change counts">
        <div>
          <span>Changed pages</span>
          <strong>{result.summary.changedPages}</strong>
        </div>
        <div>
          <span>Metadata</span>
          <strong>{result.summary.metadataChanges}</strong>
        </div>
        <div>
          <span>Copy</span>
          <strong>{result.summary.copyChanges}</strong>
        </div>
        <div>
          <span>Technical</span>
          <strong>{result.summary.technicalChanges}</strong>
        </div>
      </div>

      <div className="tracker-result-grid">
        <div className="tracker-change-list">
          <h4>Top changes</h4>
          {topChanges.length ? (
            topChanges.map((change) => (
              <article className="tracker-change" data-severity={change.severity} key={`${change.url}-${change.kind}-${change.label}`}>
                <div className="card-top">
                  <span>{change.severity}</span>
                  <small>{change.kind}</small>
                </div>
                <strong>{change.label}</strong>
                <p>{change.detail}</p>
                <dl>
                  <div>
                    <dt>Before</dt>
                    <dd>{change.before || "blank"}</dd>
                  </div>
                  <div>
                    <dt>After</dt>
                    <dd>{change.after || "blank"}</dd>
                  </div>
                </dl>
                <small>{change.url}</small>
              </article>
            ))
          ) : (
            <div className="empty-state">
              {result.status === "baseline" ? "Baseline captured. Run the tracker again to compare future changes." : "No SEO changes were found against the current baseline."}
            </div>
          )}
        </div>

        <div className="tracker-page-list">
          <h4>Tracked pages</h4>
          {result.pages.map((page) => (
            <article className="tracker-page-row" data-changed={page.changes.length > 0} key={page.url}>
              <div>
                <strong>{page.title || page.url}</strong>
                <span>{page.finalUrl}</span>
              </div>
              <dl>
                <div>
                  <dt>Description</dt>
                  <dd>{page.metaDescription || "Missing"}</dd>
                </div>
                <div>
                  <dt>H1</dt>
                  <dd>{page.h1 || "Missing"}</dd>
                </div>
                <div>
                  <dt>Words</dt>
                  <dd>{page.wordCount}</dd>
                </div>
              </dl>
              <small>{page.changes.length} change{page.changes.length === 1 ? "" : "s"}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function surfaceStatusLabel(status: WebsiteSurfaceResult["status"]) {
  if (status === "healthy") return "Surface looks healthy";
  if (status === "failed") return "Critical surface issue found";
  return "Surface needs review";
}

function seoChangeStatusLabel(status: SeoChangeTrackerResult["status"]) {
  if (status === "baseline") return "Baseline captured";
  if (status === "unchanged") return "No SEO changes found";
  if (status === "failed") return "SEO crawl failed";
  return "SEO changes found";
}

function SurfaceScore({
  label,
  severity,
  value,
}: {
  label: string;
  severity: WebsiteSurfaceIssue["severity"];
  value: number;
}) {
  return (
    <div className="surface-score" data-severity={severity}>
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

function inferDraftLabel(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "Pasted draft";
  return firstLine.replace(/^#+\s*/, "").slice(0, 72) || "Pasted draft";
}

function formatExternalEvidenceStatus(value: BlogAuditExternalEvidenceStatus) {
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
    <PageWorkspace className="integrations-workspace" tourId="integration-hub">
      <PageHero
        eyebrow="Tool setup"
        title="Connect one tool at a time."
        description="Choose one tool, save its setup data, then test it. Secrets are encrypted and never returned."
        stats={[
          { label: "active page", value: providerLabels[activeProvider] },
          { label: "saved tools", value: String(Object.values(latestByProvider).filter(Boolean).length) },
          { label: "status", value: statusLabel(activeIntegration?.status) },
        ]}
      />

      <section className="panel integrations-panel" aria-labelledby="integrations-title">
        <div className="section-heading">
          <h3 id="integrations-title">Tool Setup Pages</h3>
          <p>Move across setup pages without losing the active client or connection status.</p>
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
      </section>

      <div className="tool-page-layout integrations-detail-layout" aria-busy={loading}>
        <aside className="panel tool-page-summary" aria-label="Selected tool status">
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
    </PageWorkspace>
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
  const hasReports = competitiveAnalyses.length > 0;
  const rerunClientName = latestAnalysis?.client_name || activeClient?.name || "";
  const rerunWebsiteUrl = latestAnalysis?.website_url || "";
  const [reportPage, setReportPage] = useState(1);
  const totalReportPages = Math.max(1, Math.ceil(competitiveAnalyses.length / COMPETITIVE_REPORTS_PER_PAGE));
  const currentReportPage = Math.min(reportPage, totalReportPages);
  const reportStartIndex = (currentReportPage - 1) * COMPETITIVE_REPORTS_PER_PAGE;
  const visibleReports = competitiveAnalyses.slice(reportStartIndex, reportStartIndex + COMPETITIVE_REPORTS_PER_PAGE);

  useEffect(() => {
    setReportPage(1);
  }, [competitiveAnalyses.length]);

  return (
    <PageWorkspace className="competitive-workspace">
      <PageHero
        eyebrow="Competitive workspace"
        title="Evidence-backed competitor reports"
        description="Enter a company name. OpenAI fills the research brief, the crawler verifies public pages where it can, and the report separates observed facts from assumptions."
        stats={[
          { label: "saved reports", value: String(competitiveAnalyses.length) },
          { label: "latest sources crawled", value: String(latestSourceCount) },
          { label: "latest pages reviewed", value: String(latestEvidenceCount) },
        ]}
      />

      {hasReports ? (
        <form hidden id="competitive-report-form" onSubmit={onGenerateCompetitiveAnalysis}>
          <input name="clientName" readOnly value={rerunClientName} />
          <input name="websiteUrl" readOnly value={rerunWebsiteUrl} />
        </form>
      ) : (
        <section className="panel competitive-brief-panel" data-tour="competitive-analysis" aria-labelledby="competitive-brief-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Research brief</span>
              <h3 id="competitive-brief-title">Start with the company.</h3>
              <p>The system will infer the website, market, competitors, and search topics before collecting evidence.</p>
            </div>
          </div>
          <form className="competitive-form" id="competitive-report-form" onSubmit={onGenerateCompetitiveAnalysis}>
            <Field name="clientName" label="Company name" placeholder={activeClient?.name || "Acme Health"} required />
          </form>
        </section>
      )}

      <section className={`panel competitive-results-panel${hasReports ? " competitive-results-panel-wide" : ""}`}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Output</span>
            <h3>Reports and evidence</h3>
            <p>Each report keeps the answer, the source trail, and the editable draft in one place.</p>
          </div>
          <button
            className="button button-primary"
            data-tour="generate-competitive-analysis"
            disabled={analyzing}
            form="competitive-report-form"
            type="submit"
          >
            {analyzing ? "Generating..." : "Generate report"}
          </button>
        </div>
        {competitiveAnalyses.length > COMPETITIVE_REPORTS_PER_PAGE ? (
          <ReportPagination
            currentPage={currentReportPage}
            onPageChange={setReportPage}
            totalPages={totalReportPages}
            totalReports={competitiveAnalyses.length}
          />
        ) : null}
        <div className="analysis-results" aria-live="polite">
          {competitiveAnalyses.length ? (
            visibleReports.map((analysis) => <CompetitiveAnalysisCard analysis={analysis} key={analysis.id} />)
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
        {competitiveAnalyses.length > COMPETITIVE_REPORTS_PER_PAGE ? (
          <ReportPagination
            currentPage={currentReportPage}
            onPageChange={setReportPage}
            totalPages={totalReportPages}
            totalReports={competitiveAnalyses.length}
          />
        ) : null}
      </section>
    </PageWorkspace>
  );
}

function ReportPagination({
  currentPage,
  onPageChange,
  totalPages,
  totalReports,
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
  totalReports: number;
}) {
  const pages = buildReportPageItems(currentPage, totalPages);

  return (
    <nav className="report-pagination" aria-label="Report pages">
      <p>
        Showing report {currentPage} of {totalReports}
      </p>
      <div>
        <button
          aria-label="Show previous report"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Previous</span>
        </button>
        <span className="report-page-list" aria-label="Report page numbers">
          {pages.map((page) =>
            typeof page === "number" ? (
              <button
                aria-current={page === currentPage ? "page" : undefined}
                aria-label={`Show report page ${page}`}
                data-active={page === currentPage}
                key={page}
                onClick={() => onPageChange(page)}
                type="button"
              >
                {page}
              </button>
            ) : (
              <span className="report-page-ellipsis" aria-hidden="true" key={page}>
                ...
              </span>
            )
          )}
        </span>
        <button
          aria-label="Show next report"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          type="button"
        >
          <span>Next</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </nav>
  );
}

function buildReportPageItems(currentPage: number, totalPages: number): Array<number | string> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const middleStart = Math.max(2, currentPage - 1);
  const middleEnd = Math.min(totalPages - 1, currentPage + 1);
  const pages: Array<number | string> = [1];

  if (middleStart > 2) {
    pages.push("ellipsis-start");
  }

  for (let page = middleStart; page <= middleEnd; page += 1) {
    pages.push(page);
  }

  if (middleEnd < totalPages - 1) {
    pages.push("ellipsis-end");
  }

  pages.push(totalPages);
  return pages;
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
    <PageWorkspace className="insights-workspace" tourId="insight-feed">
      <PageHero
        eyebrow="Insight feed"
        title="Prioritize the next SEO move."
        description={
          latestByProvider.openai
            ? "Generate recommendations from the connected workspace signals and review confidence before acting."
            : "Connect OpenAI plus analytics sources to turn saved signals into recommendation cards."
        }
        stats={[
          { label: "saved insights", value: String(insights.length) },
          { label: "OpenAI", value: latestByProvider.openai ? statusLabel(latestByProvider.openai.status) : "Not connected" },
          { label: "action", value: generating ? "Generating" : "Ready" },
        ]}
      />

      <div className="insights-layout">
        <section className="panel insight-command-panel" aria-labelledby="insight-command-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Signal command</span>
              <h3 id="insight-command-title">Generate the next recommendation set.</h3>
              <p>
                {latestByProvider.openai
                  ? "Use the saved workspace signals to create fresh SEO recommendations."
                  : "OpenAI is required before the recommendation runner can produce useful cards."}
              </p>
            </div>
          </div>
          <div className="insight-command-grid">
            <div>
              <span>OpenAI</span>
              <strong>{latestByProvider.openai ? statusLabel(latestByProvider.openai.status) : "Not connected"}</strong>
            </div>
            <div>
              <span>Saved cards</span>
              <strong>{insights.length}</strong>
            </div>
            <div>
              <span>Runner</span>
              <strong>{generating ? "Working" : "Ready"}</strong>
            </div>
          </div>
          <button className="button button-primary" type="button" disabled={generating} onClick={onGenerateInsights}>
            {generating ? "Generating..." : "Generate Insights"}
          </button>
        </section>

        <section className="panel insights-panel" aria-labelledby="insights-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Recommendation feed</span>
              <h3 id="insights-title">Insight Feed</h3>
              {!insights.length ? (
                <p>
                  {latestByProvider.openai
                    ? "Connect GA4 and Hotjar, then generate your first SEO intelligence report."
                    : "Connect GA4, Hotjar, and OpenAI to generate your first SEO intelligence report."}
                </p>
              ) : null}
            </div>
          </div>

          <div className="insights">
            {insights.length ? (
              insights.map((insight) => (
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
              ))
            ) : (
              <div className="empty-state">Generated insight cards will appear here.</div>
            )}
          </div>
        </section>
      </div>
    </PageWorkspace>
  );
}

function CompetitiveAnalysisCard({ analysis }: { analysis: CompetitiveAnalysis }) {
  const missingPatterns = analysis.missing_from_client || [];
  const topPerformers = analysis.top_performers || [];
  const crawlEvidence = analysis.crawl_evidence || [];
  const reportDraft = analysis.report_draft || [];
  const successfulSites = crawlEvidence.filter((site) => site.status === "success" || site.status === "partial");
  const reviewedPageCount = crawlEvidence.reduce((total, site) => total + site.pages.length, 0);
  const [confidenceModalOpen, setConfidenceModalOpen] = useState(false);
  const confidenceReasons = buildConfidenceReasons({
    analysis,
    missingPatternCount: missingPatterns.length,
    reportDraftCount: reportDraft.length,
    reviewedPageCount,
    successfulSiteCount: successfulSites.length,
  });

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
        <div className="confidence-chip">
          <span>{analysis.confidence_score}% confidence</span>
          <button
            aria-label="Explain confidence score"
            className="confidence-why-button"
            onClick={() => setConfidenceModalOpen(true)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 10.8v5" />
              <path d="M12 7.8h.01" />
            </svg>
          </button>
        </div>
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
      <div className="report-accordion">
        <CollapsibleReportSection
          count="1 brief"
          defaultOpen
          id={`${analysis.id}-positioning`}
          title="Positioning"
        >
          <p>{analysis.positioning}</p>
        </CollapsibleReportSection>

        {missingPatterns.length ? (
          <CollapsibleReportSection
            count={`${missingPatterns.length} ${missingPatterns.length === 1 ? "gap" : "gaps"}`}
            id={`${analysis.id}-feature-gaps`}
            title="Feature gap matrix"
          >
            <div className="pattern-list">
              {missingPatterns.slice(0, 5).map((pattern) => (
                <div className="pattern-row" key={`${analysis.id}-${pattern.feature}`}>
                  <strong>{pattern.label}</strong>
                  <span>{pattern.competitors.join(", ")}</span>
                  <SourceLinks urls={pattern.evidence_urls} />
                </div>
              ))}
            </div>
          </CollapsibleReportSection>
        ) : null}

        {reportDraft.length ? (
          <CollapsibleReportSection
            count={`${reportDraft.length} ${reportDraft.length === 1 ? "section" : "sections"}`}
            id={`${analysis.id}-report-draft`}
            title="Editable report draft"
          >
            <div className="report-draft">
              {reportDraft.map((section) => (
                <div className="report-section" key={`${analysis.id}-${section.heading}`}>
                  <strong>{section.heading}</strong>
                  <p>{section.body}</p>
                  <SourceLinks urls={section.source_urls} />
                </div>
              ))}
            </div>
          </CollapsibleReportSection>
        ) : null}

        <CollapsibleReportSection
          count={`${
            analysis.competitor_themes.length +
            analysis.content_gaps.length +
            analysis.keyword_opportunities.length +
            analysis.assumptions.length
          } items`}
          id={`${analysis.id}-research-lists`}
          title="Research themes"
        >
          <div className="analysis-lists">
            <TextList title="Competitor themes" items={analysis.competitor_themes} />
            <TextList title="Content gaps" items={analysis.content_gaps} />
            <TextList title="Keyword opportunities" items={analysis.keyword_opportunities} />
            <TextList title="Assumptions" items={analysis.assumptions} />
          </div>
        </CollapsibleReportSection>

        {crawlEvidence.length ? (
          <CollapsibleReportSection
            count={`${crawlEvidence.length} ${crawlEvidence.length === 1 ? "site" : "sites"}`}
            id={`${analysis.id}-evidence-board`}
            title="Evidence board"
          >
            <div className="crawl-evidence">
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
          </CollapsibleReportSection>
        ) : null}

        <CollapsibleReportSection
          count={`${analysis.recommendations.length} ${analysis.recommendations.length === 1 ? "action" : "actions"}`}
          id={`${analysis.id}-recommendations`}
          title="Recommended next actions"
        >
          <div className="recommendations">
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
        </CollapsibleReportSection>
      </div>

      <footer>
        <span>{analysis.competitors.length} competitors supplied</span>
        <span>{analysis.target_keywords.length} keywords supplied</span>
        <time dateTime={analysis.created_at}>{new Date(analysis.created_at).toLocaleString()}</time>
      </footer>

      {confidenceModalOpen ? (
        <ConfidenceReasonModal
          analysis={analysis}
          reasons={confidenceReasons}
          onClose={() => setConfidenceModalOpen(false)}
        />
      ) : null}
    </article>
  );
}

function CollapsibleReportSection({
  children,
  count,
  defaultOpen = false,
  id,
  title,
}: {
  children: ReactNode;
  count: string;
  defaultOpen?: boolean;
  id: string;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="collapsible-report-section" data-open={open}>
      <button
        aria-controls={id}
        aria-expanded={open}
        className="collapsible-report-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          <strong>{title}</strong>
          <small>{count}</small>
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m8 10 4 4 4-4" />
        </svg>
      </button>
      <div className="collapsible-report-content" hidden={!open} id={id}>
        {children}
      </div>
    </section>
  );
}

function ConfidenceReasonModal({
  analysis,
  onClose,
  reasons,
}: {
  analysis: CompetitiveAnalysis;
  onClose: () => void;
  reasons: string[];
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-labelledby={`confidence-title-${analysis.id}`}
        aria-modal="true"
        className="confidence-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="card-top">
          <div>
            <span className="eyebrow">Confidence reason</span>
            <h3 id={`confidence-title-${analysis.id}`}>{analysis.confidence_score}% confidence</h3>
          </div>
          <button aria-label="Close confidence explanation" className="modal-close-button" onClick={onClose} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p>
          This score summarizes how much usable evidence the system could inspect. It is not approval to publish without
          human review.
        </p>
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function buildConfidenceReasons({
  analysis,
  missingPatternCount,
  reportDraftCount,
  reviewedPageCount,
  successfulSiteCount,
}: {
  analysis: CompetitiveAnalysis;
  missingPatternCount: number;
  reportDraftCount: number;
  reviewedPageCount: number;
  successfulSiteCount: number;
}) {
  const reasons = [
    confidenceLevelReason(analysis.confidence_score),
    successfulSiteCount
      ? `The crawler reviewed ${successfulSiteCount} crawlable source ${successfulSiteCount === 1 ? "site" : "sites"} and ${reviewedPageCount} public ${reviewedPageCount === 1 ? "page" : "pages"}.`
      : "The crawler did not confirm any crawlable source sites, so the score should be treated cautiously.",
    analysis.competitors.length
      ? `The comparison used ${analysis.competitors.length} competitor ${analysis.competitors.length === 1 ? "entry" : "entries"} for market context.`
      : "No competitor list was available, so the system had less comparison context.",
  ];

  if (missingPatternCount) {
    reasons.push(
      `${missingPatternCount} feature ${missingPatternCount === 1 ? "gap was" : "gaps were"} identified from competitor-visible patterns.`
    );
  }

  if (reportDraftCount) {
    reasons.push(
      `${reportDraftCount} draft ${reportDraftCount === 1 ? "section was" : "sections were"} generated with source links where available.`
    );
  }

  if (analysis.assumptions.length) {
    reasons.push(
      `${analysis.assumptions.length} explicit ${analysis.assumptions.length === 1 ? "assumption still needs" : "assumptions still need"} human validation.`
    );
  }

  if (!analysis.website_url) {
    reasons.push("No verified client website URL was available, which lowers confidence.");
  }

  reasons.push("Private data, logged-in pages, and uncrawlable content may still change the conclusion.");
  return reasons;
}

function confidenceLevelReason(score: number) {
  if (score >= 85) {
    return "High confidence: the report has broad crawl coverage and relatively few unresolved assumptions.";
  }

  if (score >= 70) {
    return "Moderate confidence: the report has useful public evidence, but some claims still need human validation.";
  }

  if (score >= 50) {
    return "Limited confidence: the report has partial evidence and should be treated as directional.";
  }

  return "Low confidence: the report lacks enough verified source coverage for strong conclusions.";
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
