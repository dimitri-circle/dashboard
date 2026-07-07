"use client";

import { CircleClickLogo } from "@/components/CircleClickLogo";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from "react-joyride";

type Provider = "ga4" | "gtm" | "hotjar" | "openai" | "mcp";
type Status = "disconnected" | "connected" | "error";
type View = "clients" | "admin" | "overview" | "brain" | "watch" | "integrations" | "analysis" | "insights";
type FeatureKey = "overview" | "brain" | "watch" | "integrations" | "analysis" | "insights";
type FeatureFlags = Record<FeatureKey, boolean>;
type AppRole = "admin" | "operator" | "viewer";
type NavIconName = "clients" | "admin" | "overview" | "brain" | "watch" | "tools" | "analysis" | "insights" | "menu" | "close" | "signout";
type WebsiteWatchTool = "surface" | "tracker" | "social" | "visitors" | "jobIndex" | "deep";
type DeepAuditAccess = "public" | "vercel" | "basic" | "login" | "custom";
type ToastNoticeState = {
  id: number;
  type: "success" | "info" | "error";
  title: string;
  message: string;
  phase: "open" | "closing";
};

type SetupNotificationId = "openai";
type SetupNotification = {
  id: SetupNotificationId;
  type: "info" | "error";
  title: string;
  message: string;
  actionLabel: string;
};

type ChangelogEntry = {
  id: string;
  date: string;
  dateTime: string;
  title: string;
  summary: string;
  tags: string[];
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
  feature_flags_json?: Partial<FeatureFlags> | null;
  created_at: string;
  updated_at: string;
};

type ClientDedupeResult = {
  duplicateGroups: number;
  removed: Array<{ id: string; name: string; keptId: string }>;
  skipped: Array<{ id: string; name: string; keptId: string; reason: string }>;
};

type CurrentUser = {
  id: string;
  email: string;
  role: AppRole;
  legacy?: boolean;
};

type ManagedUser = {
  id: string;
  email: string;
  role: AppRole;
  status: "active" | "disabled";
  last_login_at: string | null;
  disabled_at: string | null;
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
type BlogAuditClaimSourceType = "vast_source" | "client_context" | "external_web" | "missing_source" | "blocked";
type BlogAuditReportStatus = "needs_edits" | "ready_for_editor" | "approved" | "rejected" | "archived";

type BlogAuditExternalEvidenceSummary = {
  status: BlogAuditExternalEvidenceStatus;
  message: string;
  checkedClaims: number;
  supportedClaims: number;
  evidenceUrls: string[];
};

type BlogAuditClientFit = {
  status: "MATCH" | "UNCLEAR" | "MISMATCH";
  message: string;
  signals: string[];
};

type BlogAuditHumanEditCheck = {
  status: "READY" | "NEEDS_EDIT" | "HIGH_RISK";
  score: number;
  message: string;
  signals: Array<{
    label: string;
    severity: "low" | "medium" | "high";
    detail: string;
  }>;
};

type BlogAuditReport = {
  recommendation: "PASS" | "PASS_WITH_EDITS" | "DO_NOT_PUBLISH";
  truthScore: number;
  brandScore: number;
  clientFit?: BlogAuditClientFit;
  humanEditCheck?: BlogAuditHumanEditCheck;
  summary: string;
  claims: Array<{
    claim: string;
    status: BlogAuditClaimStatus;
    reason: string;
    evidence: string[];
    suggestedRewrite: string;
    sourceType?: BlogAuditClaimSourceType;
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
  status: BlogAuditReportStatus;
  report: BlogAuditReport;
};

type BrainContext = {
  id: string;
  user_id: string;
  context_text: string;
  approved_sources_json: string[];
  forbidden_claims_json: string[];
  tone_rules_json: string[];
  tone_profile_json: BrainToneProfile | null;
  created_at: string;
  updated_at: string;
};

type BrainToneProfile = {
  version: 1;
  status: "generated" | "manual";
  summary: string;
  traits: string[];
  do: string[];
  avoid: string[];
  evidenceStyle: string;
  structureStyle: string;
  vocabulary: string[];
  sampleCount: number;
  generatedAt: string | null;
  signals: {
    averageSentenceWords: number;
    sentenceCount: number;
    paragraphCount: number;
    headingCount: number;
    numberDensity: number;
    technicalTermDensity: number;
    hypeTermCount: number;
  };
};

type BrainSavedReport = {
  id: string;
  user_id: string;
  source_label: string;
  status: BlogAuditReportStatus;
  recommendation: BlogAuditReport["recommendation"];
  truth_score: number;
  brand_score: number;
  claim_count: number;
  report_json: BlogAuditReport;
  draft_excerpt: string | null;
  created_at: string;
  updated_at: string;
};

type BrainStateResponse = {
  context: BrainContext;
  reports: BrainSavedReport[];
  storageReady: boolean;
  storageError: string | null;
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

type SocialSurfaceProfile = {
  platform: string;
  url: string;
  status: "ok" | "blocked" | "error";
  httpStatus: number | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  signals: string[];
  error?: string;
};

type SocialSurfaceResult = {
  siteUrl: string;
  checkedAt: string;
  status: "healthy" | "partial" | "blocked" | "failed";
  summary: {
    discoveredProfiles: number;
    checkedProfiles: number;
    blockedProfiles: number;
    issues: number;
  };
  profiles: SocialSurfaceProfile[];
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

type SeoChangeRun = {
  id: string;
  site_url: string;
  site_origin: string;
  status: SeoChangeTrackerResult["status"];
  summary_json: SeoChangeTrackerResult["summary"];
  changes_json: SeoChangeRecord[];
  previous_captured_at: string | null;
  checked_at: string;
  created_at: string;
};

type SeoChangeTrackerState = {
  baseline: SeoChangeTrackerBaseline | null;
  runs: SeoChangeRun[];
  storageReady?: boolean;
  storageError?: string | null;
};

type SeoChangeTrackerRunResponse = {
  result: SeoChangeTrackerResult;
  baseline: SeoChangeTrackerBaseline | null;
  run: SeoChangeRun | null;
  storageReady?: boolean;
  storageError?: string | null;
};

type SeoHealthChecks = {
  openai_api_key?: boolean;
  slack_webhook?: boolean;
};

type VisitorIntelligenceEvent = {
  id: string;
  siteOrigin: string;
  eventType: "request" | "pageview";
  source: string;
  occurredAt: string;
  receivedAt: string;
  pageUrl: string;
  path: string;
  method: string | null;
  statusCode: number | null;
  referrer: string | null;
  userAgent: string | null;
  country: string | null;
  asn: string | null;
  botName: string | null;
  botCategory: "human" | "search" | "ai" | "seo" | "monitoring" | "scanner" | "automation" | "unknown";
  botVerification: "verified" | "self_declared" | "failed" | "unknown" | "not_applicable";
  automationScore: number;
  classificationReasons: string[];
};

type VisitorIntelligenceSummary = {
  storageReady?: boolean;
  storageError?: string | null;
  windowDays: number;
  totalEvents: number;
  requestEvents: number;
  pageviewEvents: number;
  botEvents: number;
  humanEvents: number;
  aiCrawlerEvents: number;
  scannerEvents: number;
  selfDeclaredBots: number;
  verifiedBots: number;
  topBots: Array<{ label: string; count: number }>;
  categories: Array<{ label: string; count: number }>;
  topPages: Array<{ label: string; count: number }>;
  recentEvents: VisitorIntelligenceEvent[];
  contract: {
    endpointPath: string;
    clientHeader: string;
    secretHeader: string;
    secretEnvVar: string;
    maxEventsPerRequest: number;
    mode: string;
  };
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

const featureKeys: FeatureKey[] = ["brain", "overview", "watch", "integrations", "analysis", "insights"];

const defaultFeatureFlags: FeatureFlags = {
  overview: false,
  brain: true,
  watch: false,
  integrations: false,
  analysis: false,
  insights: false,
};

const featureDetails: Record<FeatureKey, { label: string; description: string; audience: "client" | "internal" }> = {
  brain: {
    label: "Br(AI)N",
    description: "Content review and editorial QA with client-specific context.",
    audience: "client",
  },
  overview: {
    label: "Overview",
    description: "Workspace readiness, connector coverage, and reporting summary.",
    audience: "internal",
  },
  watch: {
    label: "Website Watch",
    description: "Surface checks, baseline tracking, visitor evidence, and deeper audit setup.",
    audience: "internal",
  },
  integrations: {
    label: "Tool Setup",
    description: "Credential and metadata setup for connected tools.",
    audience: "internal",
  },
  analysis: {
    label: "Competitive Analysis",
    description: "Competitor crawling and evidence-backed market briefs.",
    audience: "internal",
  },
  insights: {
    label: "Insights",
    description: "AI recommendations from connected data and saved reports.",
    audience: "internal",
  },
};

const featurePresets: Array<{ id: string; label: string; flags: FeatureFlags }> = [
  {
    id: "content",
    label: "Content only",
    flags: { brain: true, overview: false, watch: false, integrations: false, analysis: false, insights: false },
  },
  {
    id: "seo-core",
    label: "SEO core",
    flags: { brain: true, overview: true, watch: true, integrations: false, analysis: false, insights: false },
  },
  {
    id: "full",
    label: "Full dashboard",
    flags: { brain: true, overview: true, watch: true, integrations: true, analysis: true, insights: true },
  },
];

const appRoles: AppRole[] = ["admin", "operator", "viewer"];

const roleDetails: Record<AppRole, { label: string; description: string }> = {
  admin: {
    label: "Admin",
    description: "Can manage logins, roles, client visibility, and dashboard setup.",
  },
  operator: {
    label: "Operator",
    description: "Can use dashboard tools but cannot manage login access.",
  },
  viewer: {
    label: "Viewer",
    description: "Read-focused role for limited dashboard access.",
  },
};

const navItems: Array<{ id: View; label: string; description: string; icon: NavIconName; feature?: FeatureKey }> = [
  { id: "clients", label: "Clients", description: "Choose workspace", icon: "clients" },
  { id: "admin", label: "Admin", description: "Feature visibility", icon: "admin" },
  { id: "brain", label: "Br(AI)N", description: "Content review", icon: "brain", feature: "brain" },
  { id: "overview", label: "Overview", description: "Health and report coverage", icon: "overview", feature: "overview" },
  { id: "watch", label: "Website Watch", description: "Surface checks and audit setup", icon: "watch", feature: "watch" },
  { id: "integrations", label: "Tool Setup", description: "Connect keys and metadata", icon: "tools", feature: "integrations" },
  { id: "analysis", label: "Competitive Analysis", description: "Generate market briefs", icon: "analysis", feature: "analysis" },
  { id: "insights", label: "Insights", description: "Review AI recommendations", icon: "insights", feature: "insights" },
];

const websiteWatchTools: Array<{ id: WebsiteWatchTool; label: string; description: string }> = [
  { id: "surface", label: "Surface Check", description: "Public page review" },
  { id: "tracker", label: "Baseline Watch", description: "Public site changes" },
  { id: "social", label: "Social Surface", description: "Public profile scan" },
  { id: "visitors", label: "Viewership", description: "Visitor and bot telemetry" },
  { id: "jobIndex", label: "Vast Job Index", description: "Automation WIP" },
  { id: "deep", label: "Deep Audit", description: "Protected access setup" },
];

const DEFAULT_CLIENT_ID = "demo-client";
const CLIENT_STORAGE_KEY = "seo-intelligence-client-id";
const COMPETITIVE_REPORTS_PER_PAGE = 1;
const AI_SETUP_MESSAGE =
  "AI analysis is off. Connect an OpenAI API key to generate summaries, severity ratings, and suggested fixes.";
const AI_SETUP_NOTIFICATION: SetupNotification = {
  id: "openai",
  type: "info",
  title: "AI setup needed",
  message: AI_SETUP_MESSAGE,
  actionLabel: "Connect API Key",
};

const productChangelog: ChangelogEntry[] = [
  {
    id: "brain-audit-modal-flow",
    date: "Jul 7, 2026",
    dateTime: "2026-07-07",
    title: "Audit modal workflow",
    summary: "Running audits now open a focused incoming-report modal, completed reports open in a dismissible modal, and admins can clear saved report history.",
    tags: ["Br(AI)N", "Workflow"],
  },
  {
    id: "brain-workbench-layout",
    date: "Jul 7, 2026",
    dateTime: "2026-07-07",
    title: "Cleaner Br(AI)N workbench",
    summary: "The draft review screen now uses a full-width workbench, compact status strip, collapsed context drawer, and toast-based workspace updates.",
    tags: ["Br(AI)N", "UI"],
  },
  {
    id: "brain-editorial-context",
    date: "Jul 7, 2026",
    dateTime: "2026-07-07",
    title: "Client context and tone profiles",
    summary: "Br(AI)N can save editorial notes, approved sources, forbidden claims, tone rules, and generated style profiles for each client workspace.",
    tags: ["Br(AI)N", "Context"],
  },
  {
    id: "brain-report-history",
    date: "Jul 7, 2026",
    dateTime: "2026-07-07",
    title: "Audit history and report workflow",
    summary: "Reports are saved per client with status controls, markdown export, source handling, and a new-audit flow that keeps previous reports available.",
    tags: ["Reports", "Workflow"],
  },
  {
    id: "website-watch-baselines",
    date: "Jun 30, 2026",
    dateTime: "2026-06-30",
    title: "Website Watch baselines",
    summary: "SEO Watch can capture public page baselines, compare future crawls, and keep history for metadata, copy, and technical changes.",
    tags: ["Website Watch", "Internal"],
  },
];

const DEFAULT_WATCH_SITE_URL = "https://vast.ai";
const DEFAULT_PRIORITY_PAGES = ["/", "/pricing", "/services", "/blog", "/contact"];

const EMPTY_VISITOR_INTELLIGENCE_SUMMARY: VisitorIntelligenceSummary = {
  storageReady: false,
  storageError: null,
  windowDays: 7,
  totalEvents: 0,
  requestEvents: 0,
  pageviewEvents: 0,
  botEvents: 0,
  humanEvents: 0,
  aiCrawlerEvents: 0,
  scannerEvents: 0,
  selfDeclaredBots: 0,
  verifiedBots: 0,
  topBots: [],
  categories: [],
  topPages: [],
  recentEvents: [],
  contract: {
    endpointPath: "/api/seo/visitor-intelligence",
    clientHeader: "x-seo-client-id",
    secretHeader: "x-seo-visitor-secret",
    secretEnvVar: "SEO_VISITOR_INGEST_SECRET",
    maxEventsPerRequest: 25,
    mode: "server-to-server",
  },
};

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

function normalizePriorityPageList(value: string) {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const raw of value.split(/[\n,]+/)) {
    const next = raw.trim();
    if (!next) continue;
    const path = next.startsWith("/") ? next : `/${next}`;
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }

  return paths;
}

function priorityPagesText(value: string) {
  return normalizePriorityPageList(value).join("\n");
}

function normalizeFeatureFlags(value: Client["feature_flags_json"] | undefined): FeatureFlags {
  return Object.fromEntries(
    featureKeys.map((key) => [key, typeof value?.[key] === "boolean" ? Boolean(value[key]) : defaultFeatureFlags[key]])
  ) as FeatureFlags;
}

function isViewAvailable(view: View, flags: FeatureFlags) {
  if (view === "clients" || view === "admin") return true;
  return Boolean(flags[view]);
}

function defaultViewForClient(client?: Client) {
  const flags = normalizeFeatureFlags(client?.feature_flags_json);
  if (flags.brain) return "brain" as View;
  const firstEnabled = featureKeys.find((key) => flags[key]);
  return (firstEnabled || "admin") as View;
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
  const [notificationInboxOpen, setNotificationInboxOpen] = useState(false);
  const setupToastIdsRef = useRef(new Set<SetupNotificationId>());
  const [loading, setLoading] = useState(true);
  const [syncingGa4, setSyncingGa4] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [surfaceChecking, setSurfaceChecking] = useState(false);
  const [surfaceResult, setSurfaceResult] = useState<WebsiteSurfaceResult | null>(null);
  const [socialScanning, setSocialScanning] = useState(false);
  const [socialResult, setSocialResult] = useState<SocialSurfaceResult | null>(null);
  const [seoTracking, setSeoTracking] = useState(false);
  const [seoTrackerBaseline, setSeoTrackerBaseline] = useState<SeoChangeTrackerBaseline | null>(null);
  const [seoTrackerResult, setSeoTrackerResult] = useState<SeoChangeTrackerResult | null>(null);
  const [seoChangeRuns, setSeoChangeRuns] = useState<SeoChangeRun[]>([]);
  const [seoTrackerStorageReady, setSeoTrackerStorageReady] = useState(true);
  const [seoTrackerStorageError, setSeoTrackerStorageError] = useState<string | null>(null);
  const [visitorIntelligence, setVisitorIntelligence] = useState<VisitorIntelligenceSummary>(EMPTY_VISITOR_INTELLIGENCE_SUMMARY);
  const [seoHealthChecks, setSeoHealthChecks] = useState<SeoHealthChecks | null>(null);
  const [tourRunning, setTourRunning] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider>("ga4");
  const [activeWatchTool, setActiveWatchTool] = useState<WebsiteWatchTool>("surface");
  const [navPinned, setNavPinned] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [dedupingClients, setDedupingClients] = useState(false);
  const [clientDedupeResult, setClientDedupeResult] = useState<ClientDedupeResult | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUserAccess, setSavingUserAccess] = useState(false);

  const activeClient = clients.find((client) => client.id === clientId);
  const activeFeatureFlags = useMemo(() => normalizeFeatureFlags(activeClient?.feature_flags_json), [activeClient]);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => {
      if (item.id === "admin") return currentUser?.role === "admin";
      return !item.feature || activeFeatureFlags[item.feature];
    }),
    [activeFeatureFlags, currentUser?.role]
  );
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
  const openAiReady = Boolean(latestByProvider.openai || seoHealthChecks?.openai_api_key);
  const setupNotifications = useMemo(
    () => (seoHealthChecks && !openAiReady ? [AI_SETUP_NOTIFICATION] : []),
    [openAiReady, seoHealthChecks]
  );

  function showToastNotice(toast: Omit<ToastNoticeState, "id" | "phase">) {
    setToastNotice({
      ...toast,
      id: Date.now(),
      phase: "open",
    });
  }

  useEffect(() => {
    const nextNotification = setupNotifications.find((notification) => !setupToastIdsRef.current.has(notification.id));
    if (!nextNotification) {
      return;
    }

    setupToastIdsRef.current.add(nextNotification.id);
    showToastNotice({
      type: nextNotification.type,
      title: nextNotification.title,
      message: nextNotification.message,
    });
  }, [setupNotifications]);

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
      const [sessionBody, clientBody] = await Promise.all([
        api<{ user: CurrentUser | null }>(activeClientId, "/api/auth/me").catch(() => ({ user: null })),
        api<{ clients: Client[] }>(activeClientId, "/api/seo/clients"),
      ]);
      setCurrentUser(sessionBody.user);

      if (sessionBody.user?.role !== "admin") {
        setManagedUsers([]);
      }

      setClients(clientBody.clients);

      if (!clientBody.clients.length) {
        setIntegrations([]);
        setInsights([]);
        setCompetitiveAnalyses([]);
        setMetricSnapshots([]);
        setSurfaceResult(null);
        setSocialResult(null);
        setSeoTrackerBaseline(null);
        setSeoTrackerResult(null);
        setSeoChangeRuns([]);
        setSeoTrackerStorageReady(true);
        setSeoTrackerStorageError(null);
        setVisitorIntelligence(EMPTY_VISITOR_INTELLIGENCE_SUMMARY);
        setSeoHealthChecks(null);
        setNotice(null);
        return;
      }

      const resolvedClientId = clientBody.clients.some((client) => client.id === activeClientId) ? activeClientId : clientBody.clients[0].id;
      if (resolvedClientId !== activeClientId) {
        window.localStorage.setItem(CLIENT_STORAGE_KEY, resolvedClientId);
        setClientId(resolvedClientId);
      }

      const [integrationBody, insightBody, competitiveBody, metricBody, watchBody, visitorBody, healthBody] = await Promise.all([
        api<{ integrations: Integration[] }>(resolvedClientId, "/api/seo/integrations"),
        api<{ insights: Insight[] }>(resolvedClientId, "/api/seo/insights"),
        api<{ analyses: CompetitiveAnalysis[] }>(resolvedClientId, "/api/seo/competitive-analysis"),
        api<{ metricSnapshots: MetricSnapshot[] }>(resolvedClientId, "/api/seo/metrics"),
        api<SeoChangeTrackerState>(resolvedClientId, "/api/seo/website-watch/seo-change-tracker").catch((error) => ({
          baseline: null,
          runs: [],
          storageReady: false,
          storageError: error instanceof Error ? error.message : "SEO Watch storage state could not be loaded.",
        })),
        api<VisitorIntelligenceSummary>(resolvedClientId, "/api/seo/visitor-intelligence").catch((error) => ({
          ...EMPTY_VISITOR_INTELLIGENCE_SUMMARY,
          storageReady: false,
          storageError: error instanceof Error ? error.message : "Visitor intelligence state could not be loaded.",
        })),
        api<{ checks: SeoHealthChecks }>(resolvedClientId, "/api/seo/health").catch((): { checks: SeoHealthChecks } => ({ checks: {} })),
      ]);
      setIntegrations(integrationBody.integrations);
      setInsights(insightBody.insights);
      setCompetitiveAnalyses(competitiveBody.analyses);
      setMetricSnapshots(metricBody.metricSnapshots);
      setSeoTrackerBaseline(watchBody.baseline);
      setSeoChangeRuns(watchBody.runs);
      setSeoTrackerStorageReady(watchBody.storageReady !== false);
      setSeoTrackerStorageError(watchBody.storageError || null);
      setVisitorIntelligence(visitorBody);
      setSeoHealthChecks(healthBody.checks);

      if (sessionBody.user?.role === "admin") {
        loadManagedUsers();
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

  useEffect(() => {
    if (!hasClients || !activeClient || isViewAvailable(view, activeFeatureFlags)) {
      return;
    }

    setView(defaultViewForClient(activeClient));
  }, [activeClient, activeFeatureFlags, hasClients, view]);

  useEffect(() => {
    if (view === "admin" && currentUser?.role === "admin" && !managedUsers.length && !loadingUsers) {
      loadManagedUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentUser?.role]);

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
    setView(defaultViewForClient(nextClient));
    setIntegrations([]);
    setInsights([]);
    setMetricSnapshots([]);
    setCompetitiveAnalyses([]);
    setSurfaceResult(null);
    setSocialResult(null);
    setSeoTrackerBaseline(null);
    setSeoTrackerResult(null);
    setSeoChangeRuns([]);
    setSeoTrackerStorageReady(true);
    setSeoTrackerStorageError(null);
    setVisitorIntelligence(EMPTY_VISITOR_INTELLIGENCE_SUMMARY);
    setSeoHealthChecks(null);
    setNotice(null);
    showToastNotice({
      type: "info",
      title: "Workspace changed",
      message: `Viewing ${nextClient?.name || nextClientId}.`,
    });
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
      setView(defaultViewForClient(body.client));
      await loadDashboard(body.client.id);
      setNotice({ type: "success", message: `${body.client.name} client workspace created.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to add client." });
    }
  }

  async function loadManagedUsers() {
    try {
      setLoadingUsers(true);
      const body = await api<{ users: ManagedUser[] }>(clientId, "/api/admin/users");
      setManagedUsers(body.users);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to load login users." });
    } finally {
      setLoadingUsers(false);
    }
  }

  async function createManagedUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || ""),
      role: String(formData.get("role") || "operator") as AppRole,
    };

    try {
      setSavingUserAccess(true);
      const body = await api<{ user: ManagedUser }>(clientId, "/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setManagedUsers((current) => {
        const exists = current.some((user) => user.id === body.user.id);
        return exists
          ? current.map((user) => (user.id === body.user.id ? body.user : user))
          : [...current, body.user].sort((a, b) => a.email.localeCompare(b.email));
      });
      form.reset();
      setNotice({ type: "success", message: `${body.user.email} login saved.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save login user." });
    } finally {
      setSavingUserAccess(false);
    }
  }

  async function updateManagedUser(userId: string, payload: Partial<{ role: AppRole; password: string; disabled: boolean }>) {
    try {
      setSavingUserAccess(true);
      const body = await api<{ user: ManagedUser }>(clientId, `/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setManagedUsers((current) => current.map((user) => (user.id === body.user.id ? body.user : user)));
      setNotice({ type: "success", message: `${body.user.email} access updated.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to update login user." });
    } finally {
      setSavingUserAccess(false);
    }
  }

  async function saveClientFeatures(targetClientId: string, featureFlags: FeatureFlags) {
    try {
      setSavingFeatures(true);
      const body = await api<{ client: Client }>(clientId, `/api/seo/clients/${targetClientId}`, {
        method: "PATCH",
        body: JSON.stringify({ featureFlags }),
      });
      setClients((current) => current.map((client) => (client.id === body.client.id ? body.client : client)));
      setNotice({ type: "success", message: `${body.client.name} feature visibility updated.` });
      if (targetClientId === clientId && !isViewAvailable(view, normalizeFeatureFlags(body.client.feature_flags_json))) {
        setView(defaultViewForClient(body.client));
      }
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save feature visibility." });
    } finally {
      setSavingFeatures(false);
    }
  }

  async function dedupeClientShells() {
    try {
      setDedupingClients(true);
      const body = await api<{ result: ClientDedupeResult }>(clientId, "/api/seo/clients/dedupe", { method: "POST" });
      setClientDedupeResult(body.result);
      await loadDashboard(clientId);
      setNotice({
        type: body.result.removed.length ? "success" : "info",
        message: body.result.removed.length
          ? `Removed ${body.result.removed.length} duplicate client shell${body.result.removed.length === 1 ? "" : "s"}.`
          : "No empty duplicate client shells were removed.",
      });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to deduplicate clients." });
    } finally {
      setDedupingClients(false);
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

  async function runSocialSurfaceScan(payload: { siteUrl: string; profileUrls: string }) {
    try {
      setSocialScanning(true);
      const body = await api<{ result: SocialSurfaceResult }>(clientId, "/api/seo/website-watch/social-surface", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSocialResult(body.result);
      setNotice({
        type: body.result.status === "failed" || body.result.status === "blocked" ? "error" : body.result.status === "partial" ? "info" : "success",
        message: `Social Surface checked ${body.result.summary.checkedProfiles} profile${body.result.summary.checkedProfiles === 1 ? "" : "s"} with ${body.result.summary.issues} issue${body.result.summary.issues === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to run Social Surface scan." });
    } finally {
      setSocialScanning(false);
    }
  }

  async function runSeoChangeTracker(payload: { siteUrl: string; pages: string }) {
    try {
      setSeoTracking(true);
      const body = await api<SeoChangeTrackerRunResponse>(clientId, "/api/seo/website-watch/seo-change-tracker", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSeoTrackerResult(body.result);
      setSeoTrackerBaseline(body.baseline || body.result.baseline);
      setSeoTrackerStorageReady(body.storageReady !== false);
      setSeoTrackerStorageError(body.storageError || null);
      if (body.run) {
        const persistedRun = body.run;
        setSeoChangeRuns((current) => [persistedRun, ...current.filter((run) => run.id !== persistedRun.id)].slice(0, 8));
      }
      setNotice({
        type: body.storageReady === false ? "info" : body.result.status === "changed" ? "info" : "success",
        message: body.storageReady === false
          ? body.storageError || "Baseline Watch ran temporarily, but storage is not ready yet."
          : body.result.status === "baseline"
            ? `Public baseline captured for ${body.result.summary.pagesChecked} page${body.result.summary.pagesChecked === 1 ? "" : "s"}.`
            : `Baseline Watch scanned ${body.result.summary.pagesChecked} page${body.result.summary.pagesChecked === 1 ? "" : "s"} and found ${body.result.summary.changedPages} changed page${body.result.summary.changedPages === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to run SEO change tracker." });
    } finally {
      setSeoTracking(false);
    }
  }

  async function resetSeoTrackerBaseline() {
    const siteUrl = seoTrackerBaseline?.siteUrl || seoTrackerResult?.siteUrl;
    if (!siteUrl) {
      setSeoTrackerBaseline(null);
      setSeoTrackerResult(null);
      return;
    }

    if (!seoTrackerStorageReady) {
      setSeoTrackerBaseline(null);
      setSeoTrackerResult(null);
      setNotice({
        type: "info",
        message: "Temporary Baseline Watch state cleared. Saved baseline reset will work after Website Watch storage is installed.",
      });
      return;
    }

    try {
      const body = await api<{ ok: boolean; deletedCount: number; storageReady?: boolean; storageError?: string | null }>(
        clientId,
        `/api/seo/website-watch/seo-change-tracker?siteUrl=${encodeURIComponent(siteUrl)}`,
        { method: "DELETE" }
      );
      setSeoTrackerStorageReady(body.storageReady !== false);
      setSeoTrackerStorageError(body.storageError || null);
      setSeoTrackerBaseline(null);
      setSeoTrackerResult(null);
      setNotice({
        type: body.storageReady === false ? "info" : "success",
        message: body.storageReady === false
          ? body.storageError || "SEO Watch storage is not ready yet."
          : "SEO baseline reset. The next tracker run will capture a fresh baseline.",
      });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to reset SEO baseline." });
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

  function openOpenAiSetup() {
    setActiveProvider("openai");
    setView("integrations");
    setNotice(null);
    setNotificationInboxOpen(false);
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

        <NotificationInbox
          changelogEntries={productChangelog}
          notifications={setupNotifications}
          onConnectOpenAi={openOpenAiSetup}
          onToggle={() => setNotificationInboxOpen((current) => !current)}
          open={notificationInboxOpen}
          variant="sidebar"
        />

        {hasClients ? (
          <nav className="side-nav" data-tour="side-nav" aria-label="Primary">
            {visibleNavItems.map((item) => (
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
      <NotificationInbox
        changelogEntries={productChangelog}
        notifications={setupNotifications}
        onConnectOpenAi={openOpenAiSetup}
        onToggle={() => setNotificationInboxOpen((current) => !current)}
        open={notificationInboxOpen}
        variant="mobile"
      />

      <div className="dashboard" aria-live="polite">
        {notice ? (
          <div className="alert" data-type={notice.type} role="status">
            <span>{notice.message}</span>
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

            {view === "admin" ? (
              <AdminView
                clients={clients}
                clientDedupeResult={clientDedupeResult}
                currentUser={currentUser}
                dedupingClients={dedupingClients}
                loadingUsers={loadingUsers}
                managedUsers={managedUsers}
                onCreateUser={createManagedUser}
                onDedupeClients={dedupeClientShells}
                onReloadUsers={loadManagedUsers}
                onSaveClientFeatures={saveClientFeatures}
                onUpdateUser={updateManagedUser}
                savingFeatures={savingFeatures}
                savingUserAccess={savingUserAccess}
              />
            ) : null}

            {view === "brain" ? <BrainView activeClient={activeClient} clientId={clientId} currentUser={currentUser} /> : null}

            {view === "watch" ? (
              <WebsiteWatchView
                activeTool={activeWatchTool}
                activeClient={activeClient}
                latestSiteUrl={competitiveAnalyses.find((analysis) => analysis.website_url)?.website_url || ""}
                aiAnalysisConnected={Boolean(latestByProvider.openai || seoHealthChecks?.openai_api_key)}
                onResetSeoTrackerBaseline={resetSeoTrackerBaseline}
                onRunSeoChangeTracker={runSeoChangeTracker}
                onRunSocialSurfaceScan={runSocialSurfaceScan}
                onRunSurfaceCheck={runWebsiteSurfaceCheck}
                onSelectTool={setActiveWatchTool}
                onConnectApiKey={openOpenAiSetup}
                seoChangeRuns={seoChangeRuns}
                visitorIntelligence={visitorIntelligence}
                slackConnected={Boolean(seoHealthChecks?.slack_webhook)}
                socialResult={socialResult}
                socialScanning={socialScanning}
                seoTrackerStorageError={seoTrackerStorageError}
                seoTrackerStorageReady={seoTrackerStorageReady}
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

function NotificationInbox({
  changelogEntries,
  notifications,
  onConnectOpenAi,
  onToggle,
  open,
  variant,
}: {
  changelogEntries: ChangelogEntry[];
  notifications: SetupNotification[];
  onConnectOpenAi: () => void;
  onToggle: () => void;
  open: boolean;
  variant: "sidebar" | "mobile";
}) {
  if (!notifications.length && !changelogEntries.length) {
    return null;
  }

  const panelId = `dashboard-inbox-${variant}`;
  const updateCountLabel = `${changelogEntries.length} update${changelogEntries.length === 1 ? "" : "s"}`;
  const openItemLabel = `${notifications.length} setup item${notifications.length === 1 ? "" : "s"}`;
  const itemCountLabel = notifications.length ? `${openItemLabel}, ${updateCountLabel}` : updateCountLabel;

  return (
    <div className={`notification-inbox notification-inbox-${variant}`} data-open={open}>
      <button
        className="notification-inbox-trigger"
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${open ? "Collapse" : "Expand"} dashboard inbox, ${itemCountLabel}`}
        title={open ? "Collapse dashboard inbox" : "Expand dashboard inbox"}
        onClick={onToggle}
      >
        <span className="notification-inbox-trigger-label" aria-hidden="true">
          Inbox
        </span>
        <span className="notification-inbox-trigger-meta" aria-hidden="true">
          <strong>{notifications.length || changelogEntries.length}</strong>
          <span className="notification-inbox-caret" />
        </span>
      </button>
      {open ? (
        <section className="notification-inbox-panel" id={panelId} role="dialog" aria-label="Dashboard inbox">
          <div className="notification-inbox-heading">
            <span className="eyebrow">Dashboard inbox</span>
            <strong>{notifications.length ? openItemLabel : "Product changelog"}</strong>
            <p>{notifications.length ? "Handle setup items first, then review recent product updates." : "Recent changes shipped to this dashboard."}</p>
          </div>
          {notifications.length ? (
            <div className="notification-inbox-list" aria-label="Setup items">
              {notifications.map((notification) => (
                <article className="notification-inbox-item" data-type={notification.type} key={notification.id}>
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                  </div>
                  {notification.id === "openai" ? (
                    <button className="button button-compact" type="button" onClick={onConnectOpenAi}>
                      {notification.actionLabel}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
          {changelogEntries.length ? (
            <div className="changelog-list" aria-label="Product changelog">
              <div className="changelog-list-heading">
                <span className="eyebrow">Product changelog</span>
                <small>{updateCountLabel}</small>
              </div>
              {changelogEntries.map((entry, index) => (
                <article className="changelog-item" data-latest={index === 0} key={entry.id}>
                  <div className="changelog-marker" aria-hidden="true" />
                  <div className="changelog-copy">
                    <div className="changelog-meta">
                      <time dateTime={entry.dateTime}>{entry.date}</time>
                      {index === 0 ? <span>Latest</span> : null}
                    </div>
                    <strong>{entry.title}</strong>
                    <p>{entry.summary}</p>
                    <div className="changelog-tags" aria-label="Change tags">
                      {entry.tags.map((tag) => (
                        <span key={`${entry.id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
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
      {name === "admin" ? (
        <>
          <path {...common} d="M12 3.5 19 6.5v5.2c0 4.1-2.9 7.4-7 8.8-4.1-1.4-7-4.7-7-8.8V6.5l7-3Z" />
          <path {...common} d="M9.5 12.2 11.2 14l3.5-4" />
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
  if (view === "admin") return "Admin";
  if (view === "brain") return "Br(AI)N";
  if (view === "watch") return "Website Watch";
  if (view === "integrations") return providerDetails[provider].title;
  if (view === "analysis") return "Competitive Analysis";
  if (view === "insights") return "Insights";
  return "Overview";
}

function viewDescription(view: View, clientName: string, provider: Provider) {
  if (view === "clients") return "Choose or create the active client workspace.";
  if (view === "admin") return "Manage logins, roles, and client feature visibility.";
  if (view === "brain") return `${clientName}: review drafts for truth, evidence, brand fit, and client-specific context.`;
  if (view === "watch") return `${clientName}: internal surface checks and deeper audit setup.`;
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

function duplicateClientGroups(clients: Client[]) {
  const groups = new Map<string, Client[]>();

  for (const client of clients) {
    const key = client.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), client]);
  }

  return [...groups.values()].filter((group) => group.length > 1);
}

function featureAccessLabel(flags: FeatureFlags) {
  const presetId = featurePresetId(flags);
  const preset = featurePresets.find((item) => item.id === presetId);
  return preset?.label || `${enabledFeatureCount(flags)} enabled`;
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
  const duplicateGroups = duplicateClientGroups(clients);
  const duplicateIds = new Set(duplicateGroups.flatMap((group) => group.map((client) => client.id)));
  const activeFeatureFlags = activeClient ? normalizeFeatureFlags(activeClient.feature_flags_json) : defaultFeatureFlags;
  const activeFeatureLabel = activeClient ? featureAccessLabel(activeFeatureFlags) : "No workspace";
  const activeIsDuplicate = activeClient ? duplicateIds.has(activeClient.id) : false;
  const inspectorRows = [
    {
      label: "Client id",
      value: activeClient?.id || (loading ? "Loading" : "Not selected"),
      helper: "Used by reports, tools, and saved audit history.",
    },
    {
      label: "Feature access",
      value: activeFeatureLabel,
      helper: activeClient ? `${enabledFeatureCount(activeFeatureFlags)} dashboard areas enabled.` : "Select a workspace to see enabled areas.",
    },
    {
      label: "Scope",
      value: "Isolated",
      helper: "Connectors, reports, insights, and watch results follow this workspace.",
    },
  ];

  return (
    <PageWorkspace className="client-workspace">
      <section className="panel client-command-panel" aria-label="Client workspace control">
        <div className="client-command-copy">
          <span className="eyebrow">Clients</span>
          <h3>Pick the workspace.</h3>
          <p>Selecting a client scopes reports, connectors, audits, and saved work before anything runs.</p>
        </div>
        <div className="client-command-actions">
          <div className="client-active-chip">
            <span>Active</span>
            <strong>{activeClient?.name || (loading ? "Loading" : "None")}</strong>
            <small>{activeClient?.id || "Select a workspace"}</small>
          </div>
          {hasClients ? (
            <button className="button" type="button" onClick={() => setMode(showForm ? "list" : "create")}>
              {showForm ? "Show Clients" : "New Client"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="client-page client-module-grid" aria-labelledby="client-selection-title">
        <div className="dashboard-client-selection" data-tour="client-switcher">
          <div className="dashboard-client-topline">
            <div>
              <p className="eyebrow">Workspaces</p>
              <h2 id="client-selection-title">{showForm ? "Create workspace" : "Saved clients"}</h2>
              <span>{loading ? "Loading clients..." : `${clients.length} saved workspace${clients.length === 1 ? "" : "s"}`}</span>
            </div>
            {duplicateIds.size ? <span className="client-duplicate-badge">{duplicateGroups.length} duplicate group{duplicateGroups.length === 1 ? "" : "s"}</span> : null}
          </div>

          {loading ? <p className="client-selection-empty">Loading clients...</p> : null}

          {!loading && hasClients && !showForm ? (
            <div className="dashboard-client-list" aria-label="Available clients">
              {clients.map((client) => {
                const isActive = client.id === clientId;
                const flags = normalizeFeatureFlags(client.feature_flags_json);
                const isDuplicate = duplicateIds.has(client.id);

                return (
                  <button
                    className="dashboard-client-option"
                    data-active={isActive}
                    key={client.id}
                    type="button"
                    onClick={() => onSwitchClient(client.id)}
                  >
                    <ClientLogo client={client} />
                    <span className="client-option-main">
                      <strong>{client.name}</strong>
                      <small>{client.id}</small>
                    </span>
                    <span className="client-option-meta">
                      <span>{featureAccessLabel(flags)}</span>
                      {isDuplicate ? <em>Duplicate name</em> : null}
                    </span>
                    <span className="client-option-action">{isActive ? "Active" : "Select"}</span>
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
          <div className="client-inspector-heading">
            <span className="eyebrow">Selected workspace</span>
            <h3>{activeClient?.name || (loading ? "Loading" : "No client selected")}</h3>
            <p>Use this panel to confirm the workspace before opening tools or reports.</p>
          </div>
          <div className="client-scope-list">
            {inspectorRows.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <small>{row.helper}</small>
              </div>
            ))}
          </div>
          {activeIsDuplicate ? (
            <div className="client-scope-warning">
              <strong>Duplicate name</strong>
              <span>This workspace shares a name with another client. Check the id before saving work.</span>
            </div>
          ) : null}
        </aside>
      </section>
    </PageWorkspace>
  );
}

function AdminView({
  clients,
  clientDedupeResult,
  currentUser,
  dedupingClients,
  loadingUsers,
  managedUsers,
  onCreateUser,
  onDedupeClients,
  onReloadUsers,
  onSaveClientFeatures,
  onUpdateUser,
  savingFeatures,
  savingUserAccess,
}: {
  clients: Client[];
  clientDedupeResult: ClientDedupeResult | null;
  currentUser: CurrentUser | null;
  dedupingClients: boolean;
  loadingUsers: boolean;
  managedUsers: ManagedUser[];
  onCreateUser: (event: FormEvent<HTMLFormElement>) => void;
  onDedupeClients: () => void;
  onReloadUsers: () => void;
  onSaveClientFeatures: (clientId: string, featureFlags: FeatureFlags) => void;
  onUpdateUser: (userId: string, payload: Partial<{ role: AppRole; password: string; disabled: boolean }>) => void;
  savingFeatures: boolean;
  savingUserAccess: boolean;
}) {
  const activeUsers = managedUsers.filter((user) => user.status === "active");
  const adminUsers = activeUsers.filter((user) => user.role === "admin");
  const disabledUsers = managedUsers.filter((user) => user.status === "disabled");
  const duplicateGroups = duplicateClientGroups(clients);

  return (
    <PageWorkspace className="admin-workspace">
      <PageHero
        eyebrow="Admin control"
        title="Keep client access narrow."
        description="Default to Br(AI)N content review. Turn on broader SEO, audit, and reporting tools only when that workspace needs them."
        stats={[
          { label: "signed in", value: currentUser?.role || "unknown", helper: currentUser?.email },
          { label: "active logins", value: loadingUsers ? "..." : String(activeUsers.length) },
          { label: "duplicate groups", value: String(duplicateGroups.length), helper: "safe cleanup only" },
        ]}
      />

      <div className="dashboard-status-strip" aria-label="Admin status">
        <DashboardStatusPill label="Your role" value={currentUser?.role || "Unknown"} state={currentUser?.role === "admin" ? "ready" : "missing"} />
        <DashboardStatusPill label="Managed users" value={loadingUsers ? "Loading" : String(managedUsers.length)} state={managedUsers.length ? "ready" : "idle"} />
        <DashboardStatusPill label="Active admins" value={loadingUsers ? "Loading" : String(adminUsers.length)} state={adminUsers.length ? "ready" : "missing"} />
        <DashboardStatusPill label="Disabled" value={loadingUsers ? "Loading" : String(disabledUsers.length)} state={disabledUsers.length ? "idle" : "ready"} />
      </div>

      <section className="admin-layout" aria-label="Admin management">
        <section className="panel admin-access-panel" aria-labelledby="admin-users-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Login access</span>
              <h3 id="admin-users-title">Users and roles</h3>
            </div>
            <button className="button" type="button" onClick={onReloadUsers} disabled={loadingUsers}>
              Refresh
            </button>
          </div>

          <form className="admin-user-form" onSubmit={onCreateUser}>
            <label>
              Email
              <input name="email" type="email" placeholder="operator@example.com" required autoComplete="email" />
            </label>
            <label>
              Temporary password
              <input name="password" type="password" minLength={8} placeholder="At least 8 characters" required autoComplete="new-password" />
            </label>
            <label>
              Role
              <select name="role" defaultValue="operator">
                {appRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleDetails[role].label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary" type="submit" disabled={savingUserAccess}>
              Create Login
            </button>
          </form>

          <div className="admin-role-reference" aria-label="Role reference">
            {appRoles.map((role) => (
              <div key={role}>
                <span className="priority" data-priority={role === "admin" ? "high" : role === "operator" ? "medium" : "low"}>
                  {roleDetails[role].label}
                </span>
                <p>{roleDetails[role].description}</p>
              </div>
            ))}
          </div>

          <div className="admin-user-list" aria-busy={loadingUsers}>
            {loadingUsers ? <p className="client-selection-empty">Loading login users...</p> : null}
            {!loadingUsers && !managedUsers.length ? <p className="client-selection-empty">No app-managed logins found yet.</p> : null}
            {managedUsers.map((user) => (
              <ManagedUserCard
                currentUserId={currentUser?.id || ""}
                key={user.id}
                onUpdateUser={onUpdateUser}
                saving={savingUserAccess}
                user={user}
              />
            ))}
          </div>
        </section>

        <aside className="panel admin-maintenance-panel" aria-labelledby="admin-maintenance-title">
          <span className="eyebrow">Maintenance</span>
          <h3 id="admin-maintenance-title">Client controls</h3>
          <p>Feature visibility belongs to each client workspace. Cleanup removes empty duplicate shells and skips anything with saved work.</p>
          <div className="admin-principle-list">
            <div>
              <strong>Client-facing first</strong>
              <span>Br(AI)N content review and editorial QA.</span>
            </div>
            <div>
              <strong>Internal until ready</strong>
              <span>SEO Watch, metrics, technical audits, integrations, and competitive analysis.</span>
            </div>
          </div>
          <button className="button" type="button" onClick={onDedupeClients} disabled={dedupingClients || !duplicateGroups.length}>
            {dedupingClients ? "Checking..." : "Remove Empty Duplicates"}
          </button>
          {duplicateGroups.length ? (
            <div className="duplicate-client-list">
              {duplicateGroups.map((group) => (
                <article key={group.map((client) => client.id).join("-")}>
                  <strong>{group[0].name}</strong>
                  <span>{group.length} matching workspaces</span>
                  <small>{group.map((client) => client.id).join(", ")}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No duplicate client names found.</div>
          )}
          {clientDedupeResult ? (
            <div className="admin-dedupe-result">
              <strong>{clientDedupeResult.removed.length} removed</strong>
              <span>{clientDedupeResult.skipped.length} skipped</span>
              {clientDedupeResult.skipped.length ? <p>{clientDedupeResult.skipped.length} duplicate has saved work and needs manual review.</p> : null}
            </div>
          ) : null}
        </aside>
      </section>

      <section className="panel admin-feature-panel" aria-labelledby="admin-feature-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Client visibility</span>
            <h3 id="admin-feature-title">Feature access by workspace</h3>
          </div>
          <span className="badge">{clients.length} clients</span>
        </div>
        <ClientFeatureAccessMatrix
          clients={clients}
          duplicateGroups={duplicateGroups}
          onSaveClientFeatures={onSaveClientFeatures}
          saving={savingFeatures}
        />
      </section>
    </PageWorkspace>
  );
}

function ManagedUserCard({
  currentUserId,
  onUpdateUser,
  saving,
  user,
}: {
  currentUserId: string;
  onUpdateUser: (userId: string, payload: Partial<{ role: AppRole; password: string; disabled: boolean }>) => void;
  saving: boolean;
  user: ManagedUser;
}) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const isCurrentUser = user.id === currentUserId;

  function rotatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = passwordRef.current?.value || "";
    onUpdateUser(user.id, { password });
    if (passwordRef.current) {
      passwordRef.current.value = "";
    }
  }

  return (
    <article className="admin-user-card" data-status={user.status}>
      <div className="admin-user-main">
        <div>
          <strong>{user.email}</strong>
          <span>{user.id}</span>
        </div>
        <div className="admin-user-badges">
          <span className="priority" data-priority={user.role === "admin" ? "high" : user.role === "operator" ? "medium" : "low"}>
            {user.role}
          </span>
          <span className="badge">{user.status}</span>
        </div>
      </div>

      <div className="admin-user-meta">
        <span>Created {new Date(user.created_at).toLocaleDateString()}</span>
        <span>{user.last_login_at ? `Last login ${new Date(user.last_login_at).toLocaleString()}` : "No login recorded"}</span>
      </div>

      <div className="admin-user-controls">
        <label>
          Role
          <select
            value={user.role}
            onChange={(event) => onUpdateUser(user.id, { role: event.target.value as AppRole })}
            disabled={saving || isCurrentUser}
          >
            {appRoles.map((role) => (
              <option key={role} value={role}>
                {roleDetails[role].label}
              </option>
            ))}
          </select>
        </label>

        <form className="admin-password-form" onSubmit={rotatePassword}>
          <label>
            New password
            <input ref={passwordRef} type="password" minLength={8} placeholder="Rotate password" autoComplete="new-password" />
          </label>
          <button className="button" type="submit" disabled={saving}>
            Update Password
          </button>
        </form>

        <button
          className="button"
          type="button"
          disabled={saving || isCurrentUser}
          onClick={() => onUpdateUser(user.id, { disabled: user.status !== "disabled" })}
        >
          {user.status === "disabled" ? "Enable" : "Disable"}
        </button>
      </div>
    </article>
  );
}

function sameFeatureFlags(left: FeatureFlags, right: FeatureFlags) {
  return featureKeys.every((key) => left[key] === right[key]);
}

function featurePresetId(flags: FeatureFlags) {
  return featurePresets.find((preset) => sameFeatureFlags(preset.flags, flags))?.id || "custom";
}

function enabledFeatureCount(flags: FeatureFlags) {
  return featureKeys.filter((key) => flags[key]).length;
}

function changedFeatureCount(left: FeatureFlags, right: FeatureFlags) {
  return featureKeys.filter((key) => left[key] !== right[key]).length;
}

function ClientFeatureAccessMatrix({
  clients,
  duplicateGroups,
  onSaveClientFeatures,
  saving,
}: {
  clients: Client[];
  duplicateGroups: Client[][];
  onSaveClientFeatures: (clientId: string, featureFlags: FeatureFlags) => void;
  saving: boolean;
}) {
  const [draftFlagsById, setDraftFlagsById] = useState<Record<string, FeatureFlags>>({});
  const duplicateIds = useMemo(() => new Set(duplicateGroups.flatMap((group) => group.map((client) => client.id))), [duplicateGroups]);

  useEffect(() => {
    setDraftFlagsById((current) =>
      Object.fromEntries(
        clients.map((client) => {
          const savedFlags = normalizeFeatureFlags(client.feature_flags_json);
          const currentFlags = current[client.id];
          return [client.id, currentFlags && sameFeatureFlags(currentFlags, savedFlags) ? currentFlags : currentFlags || savedFlags];
        })
      )
    );
  }, [clients]);

  const rows = clients.map((client) => {
    const savedFlags = normalizeFeatureFlags(client.feature_flags_json);
    const draftFlags = draftFlagsById[client.id] || savedFlags;
    const changedCount = changedFeatureCount(savedFlags, draftFlags);
    return { client, savedFlags, draftFlags, changedCount };
  });
  const dirtyRows = rows.filter((row) => row.changedCount > 0);

  function updateClientFlag(clientId: string, key: FeatureKey, value: boolean) {
    setDraftFlagsById((current) => ({
      ...current,
      [clientId]: {
        ...(current[clientId] || normalizeFeatureFlags(clients.find((client) => client.id === clientId)?.feature_flags_json)),
        [key]: value,
      },
    }));
  }

  function applyPreset(clientId: string, presetId: string) {
    const preset = featurePresets.find((item) => item.id === presetId);
    if (!preset) return;
    setDraftFlagsById((current) => ({ ...current, [clientId]: { ...preset.flags } }));
  }

  function resetDrafts() {
    setDraftFlagsById(Object.fromEntries(clients.map((client) => [client.id, normalizeFeatureFlags(client.feature_flags_json)])));
  }

  function saveAll() {
    for (const row of dirtyRows) {
      onSaveClientFeatures(row.client.id, row.draftFlags);
    }
  }

  return (
    <div className="admin-feature-matrix">
      <div className="admin-feature-toolbar">
        <div>
          <strong>{dirtyRows.length ? `${dirtyRows.length} workspace${dirtyRows.length === 1 ? "" : "s"} changed` : "All access saved"}</strong>
          <span>
            {duplicateIds.size ? `${duplicateIds.size} duplicate workspaces need review.` : "Presets keep feature access consistent across clients."}
          </span>
        </div>
        <div className="admin-feature-toolbar-actions">
          <button className="button" type="button" onClick={resetDrafts} disabled={saving || !dirtyRows.length}>
            Discard
          </button>
          <button className="button button-primary" type="button" onClick={saveAll} disabled={saving || !dirtyRows.length}>
            Save All Changes
          </button>
        </div>
      </div>

      <div className="admin-feature-reference" aria-label="Feature reference">
        {featureKeys.map((key) => (
          <div key={key}>
            <strong>{featureDetails[key].label}</strong>
            <span>{featureDetails[key].description}</span>
          </div>
        ))}
      </div>

      <div className="admin-feature-table-wrap">
        <table className="admin-feature-table">
          <thead>
            <tr>
              <th scope="col">Workspace</th>
              <th scope="col">Preset</th>
              {featureKeys.map((key) => (
                <th key={key} scope="col" title={featureDetails[key].description}>
                  {featureDetails[key].label}
                </th>
              ))}
              <th scope="col">Status</th>
              <th scope="col">Save</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ client, draftFlags, savedFlags, changedCount }) => (
              <tr key={client.id} data-dirty={changedCount > 0} data-duplicate={duplicateIds.has(client.id)}>
                <th scope="row">
                  <strong>{client.name}</strong>
                  <span>{client.id}</span>
                </th>
                <td>
                  <select
                    aria-label={`Preset for ${client.name}`}
                    value={featurePresetId(draftFlags)}
                    onChange={(event) => applyPreset(client.id, event.target.value)}
                    disabled={saving}
                  >
                    <option value="custom">Custom</option>
                    {featurePresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </td>
                {featureKeys.map((key) => (
                  <td key={`${client.id}-${key}`} data-changed={savedFlags[key] !== draftFlags[key]}>
                    <label className="matrix-toggle" title={`${featureDetails[key].label}: ${featureDetails[key].description}`}>
                      <input
                        type="checkbox"
                        checked={draftFlags[key]}
                        onChange={(event) => updateClientFlag(client.id, key, event.target.checked)}
                        disabled={saving}
                      />
                      <span>{draftFlags[key] ? "On" : "Off"}</span>
                    </label>
                  </td>
                ))}
                <td>
                  <span className="matrix-status" data-state={changedCount ? "dirty" : duplicateIds.has(client.id) ? "warning" : "saved"}>
                    {changedCount ? `${changedCount} change${changedCount === 1 ? "" : "s"}` : duplicateIds.has(client.id) ? "Duplicate" : `${enabledFeatureCount(draftFlags)} on`}
                  </span>
                </td>
                <td>
                  <button className="button button-compact" type="button" onClick={() => onSaveClientFeatures(client.id, draftFlags)} disabled={saving || !changedCount}>
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
  const ga4SnapshotCount = metricSnapshots.filter((item) => item.provider === "ga4").length;
  const openAiStatus = latestByProvider.openai?.status;

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

      <div className="dashboard-status-strip" aria-label="Overview workspace status">
        <DashboardStatusPill
          label="Readiness"
          value={`${readiness}%`}
          state={readiness >= 70 ? "ready" : readiness > 0 ? "idle" : "missing"}
        />
        <DashboardStatusPill
          label="Connected tools"
          value={`${connectedCount}/5`}
          state={connectedCount ? "ready" : "missing"}
        />
        <DashboardStatusPill
          label="OpenAI"
          value={openAiStatus ? statusLabel(openAiStatus) : "Not connected"}
          state={openAiStatus === "connected" ? "ready" : openAiStatus === "error" ? "missing" : "idle"}
        />
        <DashboardStatusPill
          label="GA4 snapshots"
          value={String(ga4SnapshotCount)}
          state={ga4SnapshotCount ? "ready" : "idle"}
        />
      </div>

      <section className="panel page-command-panel" aria-labelledby="overview-command-title">
        <div className="page-command-copy">
          <span className="eyebrow">Workspace command</span>
          <h3 id="overview-command-title">Check coverage, then refresh analytics.</h3>
          <p>Use this page to confirm the workspace has enough signal before running audits, reports, or recommendations.</p>
        </div>
        <div className="page-command-actions">
          <button className="button button-primary" type="button" disabled={syncingGa4} onClick={onSyncGa4}>
            {syncingGa4 ? "Syncing..." : "Sync GA4"}
          </button>
        </div>
      </section>

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

function BrainView({ activeClient, clientId, currentUser }: { activeClient?: Client; clientId: string; currentUser: CurrentUser | null }) {
  const [auditReport, setAuditReport] = useState<BlogAuditReport | null>(null);
  const [auditHistory, setAuditHistory] = useState<BlogAuditHistoryItem[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [loadingBrainState, setLoadingBrainState] = useState(true);
  const [savingContext, setSavingContext] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<BlogAuditReportStatus>("needs_edits");
  const [contextText, setContextText] = useState("");
  const [approvedSources, setApprovedSources] = useState("");
  const [forbiddenClaims, setForbiddenClaims] = useState("");
  const [toneRules, setToneRules] = useState("");
  const [toneSampleText, setToneSampleText] = useState("");
  const [toneProfile, setToneProfile] = useState<BrainToneProfile | null>(null);
  const [generatingToneProfile, setGeneratingToneProfile] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [clearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false);
  const [clearHistoryConfirm, setClearHistoryConfirm] = useState("");
  const [clearingReports, setClearingReports] = useState(false);
  const auditFormRef = useRef<HTMLFormElement | null>(null);
  const auditTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    let cancelled = false;

    async function loadBrainState() {
      try {
        setLoadingBrainState(true);
        setAuditError(null);
        const body = await api<BrainStateResponse>(clientId, "/api/blog-audit");
        if (cancelled) return;
        setStorageReady(body.storageReady);
        setStorageError(body.storageError);
        setContextText(body.context.context_text || "");
        setApprovedSources(listToTextarea(body.context.approved_sources_json));
        setForbiddenClaims(listToTextarea(body.context.forbidden_claims_json));
        setToneRules(listToTextarea(body.context.tone_rules_json));
        setToneProfile(body.context.tone_profile_json || null);
        setToneSampleText("");
        setAuditHistory(body.reports.map(savedReportToHistoryItem));
      } catch (error) {
        if (cancelled) return;
        setStorageReady(false);
        setStorageError(error instanceof Error ? error.message : "Unable to load Br(AI)N history.");
      } finally {
        if (!cancelled) {
          setLoadingBrainState(false);
        }
      }
    }

    setAuditReport(null);
    setActiveReportId(null);
    setReportNotice(null);
    setReportModalOpen(false);
    setClearHistoryDialogOpen(false);
    setClearHistoryConfirm("");
    loadBrainState();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

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
      setActiveReportId(null);
      setReportNotice(null);
      const response = await fetch("/api/blog-audit", {
        method: "POST",
        headers: {
          "x-seo-client-id": clientId,
        },
        body: formData,
      });
      const text = await response.text();
      let body: {
        error?: string;
        report?: BlogAuditReport;
        savedReport?: BrainSavedReport | null;
        storageReady?: boolean;
        storageError?: string | null;
      } = {};

      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text.slice(0, 220) || `Audit failed with HTTP ${response.status}.`);
      }

      if (!response.ok) {
        throw new Error(body.error || "Unable to audit blog draft.");
      }

      const nextReport = (body.report || body) as BlogAuditReport;
      const savedReport = body.savedReport as BrainSavedReport | null | undefined;
      const historyItem: BlogAuditHistoryItem = {
        id: savedReport?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: savedReport?.created_at || new Date().toISOString(),
        sourceLabel: savedReport?.source_label || sourceLabel,
        status: savedReport?.status || (nextReport.recommendation === "PASS" ? "ready_for_editor" : "needs_edits"),
        report: nextReport,
      };

      setAuditReport(nextReport);
      setActiveReportId(historyItem.id);
      setReportStatus(historyItem.status);
      setStorageReady(typeof body.storageReady === "boolean" ? body.storageReady : true);
      setStorageError(typeof body.storageError === "string" ? body.storageError : null);
      setAuditHistory((items) => [historyItem, ...items.filter((item) => item.id !== historyItem.id)].slice(0, 12));
      setReportModalOpen(true);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to audit blog draft.");
    } finally {
      setAuditing(false);
    }
  }

  function startAnotherAudit() {
    setAuditReport(null);
    setAuditError(null);
    setActiveReportId(null);
    setReportNotice(null);
    setReportModalOpen(false);
    setSelectedFileName(null);
    auditFormRef.current?.reset();
    window.setTimeout(() => auditTextareaRef.current?.focus(), 0);
  }

  async function clearReportHistory() {
    if (!isAdmin || clearHistoryConfirm.trim().toUpperCase() !== "CLEAR") {
      return;
    }

    try {
      setClearingReports(true);
      setAuditError(null);
      const body = await api<{ ok: boolean; deletedCount: number }>(clientId, "/api/blog-audit/reports", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "CLEAR" }),
      });
      setAuditHistory([]);
      setAuditReport(null);
      setActiveReportId(null);
      setReportModalOpen(false);
      setClearHistoryDialogOpen(false);
      setClearHistoryConfirm("");
      setReportNotice(`Cleared ${body.deletedCount} saved report${body.deletedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to clear report history.");
    } finally {
      setClearingReports(false);
    }
  }

  async function saveContext() {
    try {
      setSavingContext(true);
      setAuditError(null);
      const body = await api<{ context: BrainContext }>(clientId, "/api/blog-audit/context", {
        method: "POST",
        body: JSON.stringify({
          contextText,
          approvedSources,
          forbiddenClaims,
          toneRules,
          toneProfile,
        }),
      });
      setContextText(body.context.context_text || "");
      setApprovedSources(listToTextarea(body.context.approved_sources_json));
      setForbiddenClaims(listToTextarea(body.context.forbidden_claims_json));
      setToneRules(listToTextarea(body.context.tone_rules_json));
      setToneProfile(body.context.tone_profile_json || null);
      setStorageReady(true);
      setStorageError(null);
      setReportNotice("Client context saved.");
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to save client context.");
    } finally {
      setSavingContext(false);
    }
  }

  async function generateToneProfile() {
    try {
      setGeneratingToneProfile(true);
      setAuditError(null);
      setReportNotice(null);
      const body = await api<{
        profile: BrainToneProfile;
        context: BrainContext | null;
        storageReady: boolean;
        storageError: string | null;
      }>(clientId, "/api/blog-audit/tone-profile", {
        method: "POST",
        body: JSON.stringify({
          sampleText: toneSampleText,
          toneRules,
        }),
      });

      setToneProfile(body.profile);
      if (body.context) {
        setToneRules(listToTextarea(body.context.tone_rules_json));
      }
      setStorageReady(body.storageReady);
      setStorageError(body.storageError);
      setReportNotice(body.storageReady ? "Tone profile generated and saved." : "Tone profile generated for this session.");
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to generate tone profile.");
    } finally {
      setGeneratingToneProfile(false);
    }
  }

  function clearToneProfile() {
    setToneProfile(null);
    setReportNotice("Tone profile cleared. Save context to persist the change.");
  }

  async function updateActiveReportStatus(nextStatus: BlogAuditReportStatus) {
    setReportStatus(nextStatus);

    if (!activeReportId || !storageReady) {
      return;
    }

    try {
      const body = await api<{ report: BrainSavedReport }>(clientId, `/api/blog-audit/reports/${activeReportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      const nextItem = savedReportToHistoryItem(body.report);
      setAuditHistory((items) => items.map((item) => (item.id === nextItem.id ? nextItem : item)));
      setReportNotice("Report status updated.");
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Unable to update report status.");
    }
  }

  async function copyCurrentReport() {
    if (!auditReport) return;

    try {
      await navigator.clipboard.writeText(reportToMarkdown(auditReport));
      setReportNotice("Report copied as Markdown.");
    } catch {
      setReportNotice("Copy failed. Browser clipboard access is unavailable.");
    }
  }

  return (
    <PageWorkspace className="brain-workspace">
      <section className="panel brain-brief-panel" aria-label="Vast Blog Audit">
        <div className="brain-brief-copy">
          <span className="eyebrow">Content Review</span>
          <h3>Client-specific edits before publishing.</h3>
          <p>Checks draft claims, brand fit, weak logic, and evidence gaps before a writer or editor sends content forward.</p>
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

      <div className="dashboard-status-strip brain-status-strip" aria-label="Br(AI)N audit status">
        <DashboardStatusPill
          label="Current report"
          value={auditing ? "Running" : auditReport ? "Ready" : "Not run"}
          state={auditReport ? "ready" : auditing ? "idle" : "missing"}
        />
        <DashboardStatusPill
          label="History"
          value={loadingBrainState ? "Loading" : `${auditHistory.length} saved`}
          state={auditHistory.length ? "ready" : loadingBrainState ? "idle" : "missing"}
        />
        <DashboardStatusPill
          label="Storage"
          value={storageReady ? "Connected" : "Setup needed"}
          state={storageReady ? "ready" : "missing"}
        />
      </div>

      <section className="panel blog-audit-panel" aria-labelledby="blog-audit-form-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Draft input</span>
            <h3 id="blog-audit-form-title">Upload or paste a blog draft.</h3>
          </div>
        </div>

        <form className="blog-audit-form" ref={auditFormRef} onSubmit={runAudit}>
          <details className="brain-context-editor">
            <summary>
              <span>
                <strong>Client context</strong>
                <small>Sources, rules, tone profile, and claims Br(AI)N should respect.</small>
              </span>
              <span>{storageReady ? "Saved workspace" : "Temporary"}</span>
            </summary>
            <div className="brain-context-fields">
              <label>
                Editorial context
                <textarea
                  name="clientContext"
                  value={contextText}
                  onChange={(event) => setContextText(event.currentTarget.value)}
                  rows={4}
                  placeholder="Positioning notes, client-specific facts, approved language, audience context."
                />
              </label>
              <label>
                Approved sources
                <textarea
                  name="approvedSources"
                  value={approvedSources}
                  onChange={(event) => setApprovedSources(event.currentTarget.value)}
                  rows={3}
                  placeholder="One approved URL or source note per line."
                />
              </label>
              <div className="brain-context-grid">
                <label>
                  Forbidden claims
                  <textarea
                    name="forbiddenClaims"
                    value={forbiddenClaims}
                    onChange={(event) => setForbiddenClaims(event.currentTarget.value)}
                    rows={3}
                    placeholder="Claims that should never ship without review."
                  />
                </label>
                <label>
                  Tone rules
                  <textarea
                    name="toneRules"
                    value={toneRules}
                    onChange={(event) => setToneRules(event.currentTarget.value)}
                    rows={3}
                    placeholder="Plainspoken, no hype, cite current data, etc."
                  />
                </label>
              </div>
              <div className="tone-profile-builder">
                <div className="tone-profile-header">
                  <div>
                    <span className="eyebrow">Tone profile</span>
                    <strong>{toneProfile ? "Generated from approved samples" : "Learn from approved samples"}</strong>
                    <small>
                      Paste approved blog excerpts. Separate multiple samples with <code>---</code>.
                    </small>
                  </div>
                  {toneProfile ? (
                    <button className="button" type="button" onClick={clearToneProfile}>
                      Clear profile
                    </button>
                  ) : null}
                </div>
                {toneProfile ? <ToneProfileSummary profile={toneProfile} /> : null}
                <label>
                  Approved samples
                  <textarea
                    value={toneSampleText}
                    onChange={(event) => setToneSampleText(event.currentTarget.value)}
                    rows={5}
                    placeholder="Paste two or more approved posts or excerpts here. Br(AI)N will infer common voice, structure, evidence style, and words to avoid."
                  />
                </label>
                <div className="actions">
                  <button className="button" type="button" onClick={generateToneProfile} disabled={generatingToneProfile || toneSampleText.trim().length < 120}>
                    {generatingToneProfile ? "Generating..." : toneProfile ? "Regenerate profile" : "Generate tone profile"}
                  </button>
                  <span className="context-storage-note">This creates an editable style guide. It does not train a model.</span>
                </div>
              </div>
              <div className="actions">
                <button className="button" type="button" onClick={saveContext} disabled={savingContext || !storageReady}>
                  {savingContext ? "Saving..." : "Save context"}
                </button>
                {!storageReady ? <span className="context-storage-note">Context will run with this audit, but will not persist yet.</span> : null}
              </div>
            </div>
          </details>

          <input name="toneProfile" type="hidden" value={toneProfile ? JSON.stringify(toneProfile) : ""} />
          <input name="clientName" type="hidden" value={activeClient?.name || clientId} />

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
              {auditing ? "Audit running" : "Audit Draft"}
            </button>
            {auditReport ? (
              <button className="button" type="button" onClick={() => setReportModalOpen(true)}>
                Open latest report
              </button>
            ) : null}
          </div>
        </form>

        {auditError ? (
          <div className="alert" data-type="error" role="status">
            {auditError}
          </div>
        ) : null}
        {storageError ? (
          <div className="alert" data-type={storageReady ? "info" : "error"} role="status">
            {storageError}
          </div>
        ) : null}
        {reportNotice ? (
          <div className="alert" data-type="success" role="status">
            {reportNotice}
          </div>
        ) : null}
      </section>

      {auditHistory.length ? (
        <div className="audit-output-column" data-mode="history">
          <AuditHistoryPanel
            activeReportId={activeReportId}
            canClearReports={isAdmin}
            clearingReports={clearingReports}
            items={auditHistory}
            onClearReports={() => setClearHistoryDialogOpen(true)}
            onSelectReport={(item) => {
              setAuditReport(item.report);
              setActiveReportId(item.id);
              setReportStatus(item.status);
              setReportNotice(null);
              setReportModalOpen(true);
            }}
          />
        </div>
      ) : null}

      {auditing ? <AuditRunningModal sourceLabel={selectedFileName || "Draft audit"} /> : null}

      {auditReport && reportModalOpen ? (
        <AuditReportModal
          activeReportId={activeReportId}
          onClose={() => setReportModalOpen(false)}
          onCopyCurrentReport={copyCurrentReport}
          onNewAudit={startAnotherAudit}
          onUpdateStatus={updateActiveReportStatus}
          report={auditReport}
          reportNotice={reportNotice}
          reportStatus={reportStatus}
          storageReady={storageReady}
        />
      ) : null}

      {clearHistoryDialogOpen ? (
        <ClearReportHistoryModal
          clientName={activeClient?.name || clientId}
          confirmValue={clearHistoryConfirm}
          disabled={clearingReports || clearHistoryConfirm.trim().toUpperCase() !== "CLEAR"}
          onCancel={() => {
            setClearHistoryDialogOpen(false);
            setClearHistoryConfirm("");
          }}
          onChangeConfirm={setClearHistoryConfirm}
          onConfirm={clearReportHistory}
          reportCount={auditHistory.length}
        />
      ) : null}
    </PageWorkspace>
  );
}

function AuditHistoryPanel({
  activeReportId,
  canClearReports,
  clearingReports,
  items,
  onClearReports,
  onSelectReport,
}: {
  activeReportId: string | null;
  canClearReports: boolean;
  clearingReports: boolean;
  items: BlogAuditHistoryItem[];
  onClearReports: () => void;
  onSelectReport: (item: BlogAuditHistoryItem) => void;
}) {
  return (
    <section className="panel audit-history-panel" aria-labelledby="audit-history-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Audit history</span>
          <h3 id="audit-history-title">Previous reports</h3>
        </div>
        {canClearReports ? (
          <button className="button button-danger" type="button" onClick={onClearReports} disabled={clearingReports || !items.length}>
            {clearingReports ? "Clearing..." : "Clear history"}
          </button>
        ) : null}
      </div>

      <div className="audit-history-list">
        {items.map((item) => (
          <button
            className="audit-history-item"
            data-active={activeReportId === item.id}
            key={item.id}
            type="button"
            onClick={() => onSelectReport(item)}
          >
            <span className="audit-history-copy">
              <strong>{item.sourceLabel}</strong>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
            </span>
            <span className="audit-history-meta" aria-label="Report scores">
              <span>{formatReportStatus(item.status)}</span>
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

function AuditRunningModal({ sourceLabel }: { sourceLabel: string }) {
  return (
    <div className="modal-backdrop audit-modal-backdrop" role="presentation">
      <section
        aria-busy="true"
        aria-live="polite"
        aria-modal="true"
        aria-labelledby="audit-running-title"
        className="audit-modal audit-running-modal"
        role="dialog"
      >
        <div className="audit-modal-header">
          <div>
            <span className="eyebrow">Incoming report</span>
            <h3 id="audit-running-title">Audit is running.</h3>
          </div>
          <span className="audit-live-badge">Live</span>
        </div>
        <div className="audit-report-loader" aria-hidden="true">
          <div className="audit-loader-topline">
            <span />
            <span />
          </div>
          <div className="audit-loader-card" />
          <div className="audit-loader-grid">
            <span />
            <span />
            <span />
          </div>
          <div className="audit-loader-lines">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="audit-modal-progress">
          <span />
        </div>
        <p>
          Building the structured report for <strong>{sourceLabel}</strong>. Br(AI)N is checking claims, evidence, tone, and publish risk.
        </p>
      </section>
    </div>
  );
}

function AuditReportModal({
  activeReportId,
  onClose,
  onCopyCurrentReport,
  onNewAudit,
  onUpdateStatus,
  report,
  reportNotice,
  reportStatus,
  storageReady,
}: {
  activeReportId: string | null;
  onClose: () => void;
  onCopyCurrentReport: () => void;
  onNewAudit: () => void;
  onUpdateStatus: (status: BlogAuditReportStatus) => void;
  report: BlogAuditReport;
  reportNotice: string | null;
  reportStatus: BlogAuditReportStatus;
  storageReady: boolean;
}) {
  return (
    <div className="modal-backdrop audit-modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-modal="true"
        aria-labelledby="blog-audit-report-title"
        className="audit-modal audit-result-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="audit-modal-header">
          <div>
            <span className="eyebrow">Structured report</span>
            <h3 id="blog-audit-report-title">Audit result</h3>
          </div>
          <button aria-label="Dismiss audit result" className="modal-close-button" onClick={onClose} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="audit-modal-toolbar">
          <label className="report-status-control">
            Status
            <select
              value={reportStatus}
              onChange={(event) => onUpdateStatus(event.currentTarget.value as BlogAuditReportStatus)}
              disabled={!activeReportId || !storageReady}
            >
              <option value="needs_edits">Needs edits</option>
              <option value="ready_for_editor">Ready for editor</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div className="report-actions">
            <button className="button" type="button" onClick={onCopyCurrentReport}>
              Copy Markdown
            </button>
            <button className="button" type="button" onClick={onNewAudit}>
              New audit
            </button>
          </div>
        </div>

        <AuditReportView report={report} />
        {reportNotice ? (
          <div className="alert" data-type="success" role="status">
            {reportNotice}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ClearReportHistoryModal({
  clientName,
  confirmValue,
  disabled,
  onCancel,
  onChangeConfirm,
  onConfirm,
  reportCount,
}: {
  clientName: string;
  confirmValue: string;
  disabled: boolean;
  onCancel: () => void;
  onChangeConfirm: (value: string) => void;
  onConfirm: () => void;
  reportCount: number;
}) {
  return (
    <div className="modal-backdrop audit-modal-backdrop" onClick={onCancel} role="presentation">
      <section
        aria-modal="true"
        aria-labelledby="clear-report-history-title"
        className="audit-modal clear-history-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="audit-modal-header">
          <div>
            <span className="eyebrow">Admin cleanup</span>
            <h3 id="clear-report-history-title">Clear saved Br(AI)N reports?</h3>
          </div>
          <button aria-label="Cancel clearing report history" className="modal-close-button" onClick={onCancel} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p>
          This deletes {reportCount} saved report{reportCount === 1 ? "" : "s"} for <strong>{clientName}</strong>. Client context and tone profiles stay in place.
        </p>
        <label>
          Type CLEAR to confirm
          <input value={confirmValue} onChange={(event) => onChangeConfirm(event.currentTarget.value)} placeholder="CLEAR" autoFocus />
        </label>
        <div className="report-actions">
          <button className="button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button button-danger" type="button" onClick={onConfirm} disabled={disabled}>
            Clear reports
          </button>
        </div>
      </section>
    </div>
  );
}

function ToneProfileSummary({ profile }: { profile: BrainToneProfile }) {
  return (
    <div className="tone-profile-summary">
      <div>
        <span>Profile</span>
        <strong>{profile.summary}</strong>
        <small>
          {profile.sampleCount || 0} sample{profile.sampleCount === 1 ? "" : "s"} · {profile.signals.averageSentenceWords || 0} avg words/sentence
        </small>
      </div>
      <div className="tone-profile-chips" aria-label="Tone traits">
        {profile.traits.slice(0, 4).map((trait) => (
          <span key={trait}>{trait}</span>
        ))}
      </div>
      {profile.do.length || profile.avoid.length ? (
        <div className="tone-profile-rules">
          {profile.do.length ? (
            <div>
              <span>Do</span>
              <ul>
                {profile.do.slice(0, 3).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {profile.avoid.length ? (
            <div>
              <span>Avoid</span>
              <ul>
                {profile.avoid.slice(0, 3).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type AuditClaimStatusFilter = "ALL" | BlogAuditClaimStatus;
type AuditClaimSourceFilter = "all" | BlogAuditClaimSourceType;

const claimStatusFilters: Array<{ label: string; value: AuditClaimStatusFilter }> = [
  { label: "All", value: "ALL" },
  { label: "Passed", value: "PASS" },
  { label: "Failed", value: "FAIL" },
  { label: "Unsupported", value: "UNSUPPORTED" },
  { label: "Stale risk", value: "STALE_RISK" },
  { label: "Blocked", value: "BLOCKED" },
];

const claimSourceFilters: Array<{ label: string; value: AuditClaimSourceFilter }> = [
  { label: "All sources", value: "all" },
  { label: "External web", value: "external_web" },
  { label: "Vast source", value: "vast_source" },
  { label: "Client context", value: "client_context" },
  { label: "Needs source", value: "missing_source" },
  { label: "Blocked", value: "blocked" },
];

function AuditReportView({ report }: { report: BlogAuditReport }) {
  const [statusFilter, setStatusFilter] = useState<AuditClaimStatusFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<AuditClaimSourceFilter>("all");
  const claimsWithSource = useMemo(
    () =>
      report.claims.map((claim) => ({
        ...claim,
        resolvedSourceType: claim.sourceType || sourceTypeFromClaim(claim),
      })),
    [report.claims]
  );
  const statusCounts = useMemo(
    () =>
      claimsWithSource.reduce<Record<AuditClaimStatusFilter, number>>(
        (counts, claim) => {
          counts.ALL += 1;
          counts[claim.status] += 1;
          return counts;
        },
        { ALL: 0, PASS: 0, FAIL: 0, UNSUPPORTED: 0, STALE_RISK: 0, BLOCKED: 0 }
      ),
    [claimsWithSource]
  );
  const sourceCounts = useMemo(
    () =>
      claimsWithSource.reduce<Record<AuditClaimSourceFilter, number>>(
        (counts, claim) => {
          counts.all += 1;
          counts[claim.resolvedSourceType] += 1;
          return counts;
        },
        { all: 0, vast_source: 0, client_context: 0, external_web: 0, missing_source: 0, blocked: 0 }
      ),
    [claimsWithSource]
  );
  const filteredClaims = claimsWithSource.filter((claim) => {
    const statusMatches = statusFilter === "ALL" || claim.status === statusFilter;
    const sourceMatches = sourceFilter === "all" || claim.resolvedSourceType === sourceFilter;
    return statusMatches && sourceMatches;
  });

  function resetClaimFilters() {
    setStatusFilter("ALL");
    setSourceFilter("all");
  }

  return (
    <div className="audit-report">
      <div className="audit-score-grid">
        <ScoreBlock label="Recommendation" value={formatRecommendation(report.recommendation)} tone={report.recommendation} />
        <ScoreBlock label="Truth score" value={`${report.truthScore}`} />
        <ScoreBlock label="Brand score" value={`${report.brandScore}`} />
        <ScoreBlock label="Claims" value={`${report.claims.length}`} />
      </div>

      <ExternalEvidenceSummary evidence={report.externalEvidence} />
      <ClientFitSummary brandFindings={report.brandFindings} fit={report.clientFit} />
      <HumanEditSummary check={report.humanEditCheck} />

      <p className="audit-summary">{report.summary}</p>

      <div className="audit-section">
        <div className="audit-section-header">
          <div>
            <h4>Claims</h4>
            <p>
              Showing {filteredClaims.length} of {claimsWithSource.length} claim{claimsWithSource.length === 1 ? "" : "s"}.
            </p>
          </div>
          {statusFilter !== "ALL" || sourceFilter !== "all" ? (
            <button className="button" type="button" onClick={resetClaimFilters}>
              Reset filters
            </button>
          ) : null}
        </div>
        <div className="audit-filter-panel" aria-label="Claim filters">
          <div className="audit-filter-group" aria-label="Filter by claim status">
            <span>Status</span>
            <div>
              {claimStatusFilters.map((filter) => (
                <button
                  className="audit-filter-button"
                  data-active={statusFilter === filter.value}
                  key={filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  type="button"
                >
                  {filter.label}
                  <strong>{statusCounts[filter.value]}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="audit-filter-group" aria-label="Filter by source type">
            <span>Sourcing</span>
            <div>
              {claimSourceFilters.map((filter) => (
                <button
                  className="audit-filter-button"
                  data-active={sourceFilter === filter.value}
                  key={filter.value}
                  onClick={() => setSourceFilter(filter.value)}
                  type="button"
                >
                  {filter.label}
                  <strong>{sourceCounts[filter.value]}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="audit-claim-list">
          {report.claims.length ? (
            filteredClaims.length ? (
              filteredClaims.map((claim, index) => (
              <article className="audit-claim" data-status={claim.status} key={`${claim.claim}-${index}`}>
                <div className="card-top">
                  <span className="claim-badge-group">
                    <span className="audit-status" data-status={claim.status}>
                      {claim.status.replace(/_/g, " ")}
                    </span>
                    <SourceTypePill type={claim.resolvedSourceType} />
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
              <div className="empty-state">
                No claims match those filters.
                <button className="button" type="button" onClick={resetClaimFilters}>
                  Show all claims
                </button>
              </div>
            )
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

function ClientFitSummary({ brandFindings, fit }: { brandFindings: BlogAuditReport["brandFindings"]; fit?: BlogAuditClientFit }) {
  const status = fit?.status || "UNCHECKED";
  const label =
    status === "MATCH" ? "Client match" : status === "MISMATCH" ? "Wrong client framing" : status === "UNCLEAR" ? "Needs framing review" : "Not checked";
  const message = fit?.message || "Re-run the audit to check whether the draft is framed for the selected client and saved tone rules.";
  const toneFindingCount = brandFindings.filter((finding) => /tone|hype|vocabulary|sentence|framing|client/i.test(finding.issue)).length;
  const signals = [...(fit?.signals || []), `${toneFindingCount} tone/framing finding${toneFindingCount === 1 ? "" : "s"}`];

  return (
    <div className="client-fit-summary" data-status={status}>
      <div>
        <span>Tone and framing</span>
        <strong>{label}</strong>
        <p>{message}</p>
      </div>
      {signals.length ? (
        <ul>
          {signals.slice(0, 4).map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function HumanEditSummary({ check }: { check?: BlogAuditHumanEditCheck }) {
  const status = check?.status || "UNCHECKED";
  const label =
    status === "READY"
      ? "Editor-ready signal"
      : status === "HIGH_RISK"
        ? "Rewrite risk"
        : status === "NEEDS_EDIT"
          ? "Needs human pass"
          : "Not checked";
  const message = check?.message || "Re-run the audit to check AI-likeness risk, generic language, evidence density, and client-specific framing.";
  const signals = check?.signals || [];

  return (
    <div className="human-edit-summary" data-status={status}>
      <div>
        <span>Human Edit Check</span>
        <strong>{label}</strong>
        <p>{message} This is not a definitive AI detector.</p>
      </div>
      <div className="human-edit-score">
        <span>Score</span>
        <strong>{check ? check.score : "—"}</strong>
      </div>
      {signals.length ? (
        <ul>
          {signals.slice(0, 4).map((signal) => (
            <li data-severity={signal.severity} key={`${signal.label}-${signal.detail}`}>
              <strong>{signal.label}</strong>
              <span>{signal.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
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

function SourceTypePill({ type }: { type: BlogAuditClaimSourceType }) {
  return (
    <span className="source-type-pill" data-source-type={type}>
      {formatSourceType(type)}
    </span>
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

function listToTextarea(items: string[]) {
  return Array.isArray(items) ? items.join("\n") : "";
}

function savedReportToHistoryItem(item: BrainSavedReport): BlogAuditHistoryItem {
  return {
    id: item.id,
    createdAt: item.created_at,
    sourceLabel: item.source_label,
    status: item.status,
    report: item.report_json,
  };
}

function sourceTypeFromClaim(claim: BlogAuditReport["claims"][number]): BlogAuditClaimSourceType {
  if (claim.status === "BLOCKED") return "blocked";
  if (claim.evidence?.some((url) => url.startsWith("client-context://"))) return "client_context";
  if (claim.evidence?.some((url) => /^https?:\/\//i.test(url) && !/vast\.ai/i.test(url))) return "external_web";
  if (claim.evidence?.length) return "vast_source";
  return "missing_source";
}

function formatSourceType(type: BlogAuditClaimSourceType) {
  if (type === "vast_source") return "Vast source";
  if (type === "client_context") return "Client context";
  if (type === "external_web") return "External web";
  if (type === "blocked") return "Blocked";
  return "Needs source";
}

function formatClientFitStatus(status: BlogAuditClientFit["status"]) {
  if (status === "MATCH") return "Client match";
  if (status === "MISMATCH") return "Wrong client framing";
  return "Needs framing review";
}

function formatReportStatus(status: BlogAuditReportStatus) {
  return status.replace(/_/g, " ");
}

function reportToMarkdown(report: BlogAuditReport) {
  const lines = [
    `# Br(AI)N Audit Result`,
    "",
    `Recommendation: ${formatRecommendation(report.recommendation)}`,
    `Truth score: ${report.truthScore}`,
    `Brand score: ${report.brandScore}`,
    `Claims: ${report.claims.length}`,
    report.clientFit ? `Client fit: ${formatClientFitStatus(report.clientFit.status)} - ${report.clientFit.message}` : "",
    report.humanEditCheck
      ? `Human edit check: ${formatHumanEditStatus(report.humanEditCheck.status)} (${report.humanEditCheck.score}) - ${report.humanEditCheck.message}`
      : "",
    "",
    report.summary,
    "",
    "## Claims",
    ...report.claims.flatMap((claim, index) => [
      "",
      `${index + 1}. ${claim.claim}`,
      `Status: ${claim.status.replace(/_/g, " ")}`,
      `Source type: ${formatSourceType(claim.sourceType || sourceTypeFromClaim(claim))}`,
      `Reason: ${claim.reason}`,
      claim.suggestedRewrite && claim.suggestedRewrite !== "No rewrite required."
        ? `Suggested rewrite: ${claim.suggestedRewrite}`
        : "",
      claim.evidence.length
        ? `Sources: ${claim.evidence.filter((url) => /^https?:\/\//i.test(url)).join(", ") || "Client context"}`
        : "",
    ]),
  ];

  if (report.brandFindings.length) {
    lines.push("", "## Brand Findings", ...report.brandFindings.map((item) => `- ${item.severity}: ${item.issue} ${item.suggestedRewrite}`));
  }

  if (report.missingEvidence.length) {
    lines.push("", "## Missing Evidence", ...report.missingEvidence.map((item) => `- ${item}`));
  }

  if (report.publishRisks.length) {
    lines.push("", "## Publish Risks", ...report.publishRisks.map((item) => `- ${item}`));
  }

  return lines.filter((line, index) => line || lines[index - 1]).join("\n");
}

function formatHumanEditStatus(status: BlogAuditHumanEditCheck["status"]) {
  if (status === "READY") return "Editor-ready signal";
  if (status === "HIGH_RISK") return "Rewrite risk";
  return "Needs human pass";
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
  aiAnalysisConnected,
  latestSiteUrl,
  onConnectApiKey,
  onResetSeoTrackerBaseline,
  onRunSeoChangeTracker,
  onRunSocialSurfaceScan,
  onRunSurfaceCheck,
  onSelectTool,
  seoChangeRuns,
  slackConnected,
  socialResult,
  socialScanning,
  visitorIntelligence,
  seoTrackerBaseline,
  seoTrackerStorageError,
  seoTrackerStorageReady,
  seoTrackerResult,
  seoTracking,
  surfaceChecking,
  surfaceResult,
}: {
  activeTool: WebsiteWatchTool;
  activeClient?: Client;
  aiAnalysisConnected: boolean;
  latestSiteUrl: string;
  onConnectApiKey: () => void;
  onResetSeoTrackerBaseline: () => void;
  onRunSeoChangeTracker: (payload: { siteUrl: string; pages: string }) => void;
  onRunSocialSurfaceScan: (payload: { siteUrl: string; profileUrls: string }) => void;
  onRunSurfaceCheck: (payload: { siteUrl: string; pages: string; expectedText: string }) => void;
  onSelectTool: (tool: WebsiteWatchTool) => void;
  seoChangeRuns: SeoChangeRun[];
  slackConnected: boolean;
  socialResult: SocialSurfaceResult | null;
  socialScanning: boolean;
  visitorIntelligence: VisitorIntelligenceSummary;
  seoTrackerBaseline: SeoChangeTrackerBaseline | null;
  seoTrackerStorageError: string | null;
  seoTrackerStorageReady: boolean;
  seoTrackerResult: SeoChangeTrackerResult | null;
  seoTracking: boolean;
  surfaceChecking: boolean;
  surfaceResult: WebsiteSurfaceResult | null;
}) {
  const [accessMethod, setAccessMethod] = useState<DeepAuditAccess>("public");
  const [watchSiteUrl, setWatchSiteUrl] = useState(latestSiteUrl || DEFAULT_WATCH_SITE_URL);
  const [priorityPages, setPriorityPages] = useState(DEFAULT_PRIORITY_PAGES.join("\n"));
  const [customPriorityPage, setCustomPriorityPage] = useState("");
  const [socialProfileUrls, setSocialProfileUrls] = useState("");
  const guidance = deepAuditGuidance[accessMethod];
  const normalizedPriorityPages = priorityPagesText(priorityPages) || DEFAULT_PRIORITY_PAGES.join("\n");
  const lastRunAt = seoChangeRuns[0]?.checked_at || seoTrackerResult?.checkedAt || socialResult?.checkedAt || surfaceResult?.checkedAt || null;
  const baselineStatus = !seoTrackerStorageReady
    ? "Setup needed"
    : seoTrackerBaseline
      ? "Captured"
      : "Missing";
  const visitorStatus = visitorIntelligence.storageReady === false
    ? "Setup needed"
    : visitorIntelligence.totalEvents
      ? `${visitorIntelligence.totalEvents} events`
      : "No events";

  useEffect(() => {
    if (!latestSiteUrl) return;
    setWatchSiteUrl((current) => (current === DEFAULT_WATCH_SITE_URL ? latestSiteUrl : current));
  }, [latestSiteUrl]);

  function handleSurfaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onRunSurfaceCheck({
      siteUrl: String(formData.get("siteUrl") || watchSiteUrl),
      pages: priorityPagesText(String(formData.get("pages") || normalizedPriorityPages)),
      expectedText: String(formData.get("expectedText") || ""),
    });
  }

  function handleTrackerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onRunSeoChangeTracker({
      siteUrl: String(formData.get("siteUrl") || watchSiteUrl),
      pages: priorityPagesText(String(formData.get("pages") || normalizedPriorityPages)),
    });
  }

  function handleSocialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onRunSocialSurfaceScan({
      siteUrl: String(formData.get("siteUrl") || watchSiteUrl),
      profileUrls: String(formData.get("profileUrls") || socialProfileUrls),
    });
  }

  function runSurfaceFromCommand() {
    onSelectTool("surface");
    onRunSurfaceCheck({
      siteUrl: watchSiteUrl,
      pages: normalizedPriorityPages,
      expectedText: activeClient?.name || "",
    });
  }

  function runBaselineFromCommand() {
    onSelectTool("tracker");
    onRunSeoChangeTracker({
      siteUrl: watchSiteUrl,
      pages: normalizedPriorityPages,
    });
  }

  function runSocialFromCommand() {
    onSelectTool("social");
    onRunSocialSurfaceScan({
      siteUrl: watchSiteUrl,
      profileUrls: socialProfileUrls,
    });
  }

  function addPriorityPage(path: string) {
    const nextPath = path.trim();
    if (!nextPath) return;
    setPriorityPages(priorityPagesText(`${priorityPages}\n${nextPath}`));
    if (path === customPriorityPage) {
      setCustomPriorityPage("");
    }
  }

  return (
    <PageWorkspace className="website-watch">
      {!aiAnalysisConnected ? (
        <section className="panel watch-setup-banner" aria-label="AI setup">
          <div>
            <strong>AI analysis is off.</strong>
            <span>Connect an OpenAI API key to generate summaries, severity ratings, and suggested fixes.</span>
          </div>
          <button className="button" type="button" onClick={onConnectApiKey}>
            Connect API Key
          </button>
        </section>
      ) : null}

      <PageHero
        eyebrow="Website monitoring"
        title="Check what changed or broke."
        description="Run fast public checks, capture public baselines, and prepare deeper audits or Vast Job Index automation when the runner is ready."
      />

      <div className="watch-status-strip" aria-label="Website Watch setup status">
        <WatchStatusPill label="AI Analysis" value={aiAnalysisConnected ? "Connected" : "Off"} state={aiAnalysisConnected ? "ready" : "missing"} />
        <WatchStatusPill label="Slack" value={slackConnected ? "Connected" : "Not Connected"} state={slackConnected ? "ready" : "missing"} />
        <WatchStatusPill label="Baseline" value={baselineStatus} state={seoTrackerBaseline && seoTrackerStorageReady ? "ready" : "missing"} />
        <WatchStatusPill
          label="Social"
          value={socialResult ? socialResult.status : "Not run"}
          state={socialResult ? (socialResult.status === "healthy" ? "ready" : "missing") : "idle"}
        />
        <WatchStatusPill label="Viewership" value={visitorStatus} state={visitorIntelligence.totalEvents ? "ready" : visitorIntelligence.storageReady === false ? "missing" : "idle"} />
        <WatchStatusPill label="Job Index" value="WIP" state="idle" />
        <WatchStatusPill label="Last Run" value={lastRunAt ? new Date(lastRunAt).toLocaleString() : "Never"} state={lastRunAt ? "ready" : "idle"} />
      </div>

      <section className="panel watch-command-panel" aria-labelledby="watch-command-title">
        <div className="watch-command-copy">
          <span className="eyebrow">Website Watch</span>
          <h3 id="watch-command-title">Launch a public site check</h3>
          <p>Run fast public checks, capture baselines, and send issue reports to Slack.</p>
        </div>
        <div className="watch-command-controls">
          <label>
            Site URL
            <input
              type="url"
              value={watchSiteUrl}
              onChange={(event) => setWatchSiteUrl(event.target.value)}
              placeholder="https://example.com"
              required
            />
          </label>
          <div className="watch-command-actions">
            <button className="button button-primary" type="button" onClick={runSurfaceFromCommand} disabled={surfaceChecking}>
              {surfaceChecking ? "Checking..." : "Run Surface Check"}
            </button>
            <button className="button" type="button" onClick={runBaselineFromCommand} disabled={seoTracking}>
              {seoTracking ? "Capturing..." : "Capture Baseline"}
            </button>
            <button className="button" type="button" onClick={runSocialFromCommand} disabled={socialScanning}>
              {socialScanning ? "Scanning..." : "Scan Social"}
            </button>
            <button className="button" type="button" disabled title="Scheduling needs the next backend runner connection.">
              Schedule Watch
            </button>
          </div>
          <p>Surface Check scans public pages now. Baseline Watch compares future crawls against today&apos;s version.</p>
        </div>
      </section>

      <div className="watch-mode-grid" aria-label="Website Watch modes">
        <WatchModeCard
          active={activeTool === "surface"}
          title="Surface Check"
          subtitle="Fast public crawl"
          description="Find obvious breakage on public pages."
          cta={surfaceChecking ? "Running..." : "Run now"}
          onClick={runSurfaceFromCommand}
          disabled={surfaceChecking}
        />
        <WatchModeCard
          active={activeTool === "tracker"}
          title="Baseline Watch"
          subtitle="Track public changes"
          description="Capture today's page state and compare future changes."
          cta={seoTracking ? "Capturing..." : "Capture baseline"}
          onClick={runBaselineFromCommand}
          disabled={seoTracking}
        />
        <WatchModeCard
          active={activeTool === "social"}
          title="Social Surface"
          subtitle="Public social crawl"
          description="Find crawlable profile metadata and blocked public social surfaces."
          cta={socialScanning ? "Scanning..." : "Open scanner"}
          onClick={() => onSelectTool("social")}
          disabled={socialScanning}
        />
        <WatchModeCard
          active={activeTool === "visitors"}
          title="Viewership"
          subtitle="Visitor contract"
          description="Receive signed request events from tracked sites."
          cta="Review contract"
          onClick={() => onSelectTool("visitors")}
        />
        <WatchModeCard
          active={activeTool === "jobIndex"}
          title="Vast Job Index"
          subtitle="Automation WIP"
          description="Define the watched job-index feed before enabling a runner."
          cta="Review setup"
          onClick={() => onSelectTool("jobIndex")}
        />
        <WatchModeCard
          active={activeTool === "deep"}
          title="Deep Audit"
          subtitle="Authenticated QA setup"
          description="Protected pages, CMS, screenshots, Lighthouse, repo checks, and logged-in flows."
          cta="Set up deep audit"
          onClick={() => onSelectTool("deep")}
        />
      </div>

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
                <input
                  name="siteUrl"
                  type="url"
                  placeholder="https://example.com"
                  value={watchSiteUrl}
                  onChange={(event) => setWatchSiteUrl(event.target.value)}
                  required
                />
              </label>
              <label>
                Key pages
                <textarea
                  name="pages"
                  value={priorityPages}
                  onBlur={(event) => setPriorityPages(priorityPagesText(event.target.value))}
                  onChange={(event) => setPriorityPages(event.target.value)}
                  rows={6}
                />
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
          <>
            <section className="panel watch-run-panel seo-tracker-panel" aria-labelledby="seo-tracker-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Public Site Baseline</span>
                  <h3 id="seo-tracker-title">Capture today&apos;s public pages</h3>
                  <p>Capture today&apos;s public pages so future changes, breakage, and copy shifts are easy to detect.</p>
                </div>
                {seoTrackerBaseline ? (
                  <button className="button" type="button" onClick={onResetSeoTrackerBaseline}>
                    {seoTrackerStorageReady ? "Reset baseline" : "Clear temporary baseline"}
                  </button>
                ) : null}
              </div>

              <form className="watch-form" onSubmit={handleTrackerSubmit}>
                <label>
                  Site URL
                  <input
                    name="siteUrl"
                    type="url"
                    placeholder="https://example.com"
                    value={watchSiteUrl}
                    onChange={(event) => setWatchSiteUrl(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Priority pages
                  <span className="field-helper">Choose common paths or paste one path per line.</span>
                  <div className="priority-chip-row" aria-label="Common priority pages">
                    {DEFAULT_PRIORITY_PAGES.map((path) => (
                      <button className="priority-chip" type="button" key={path} onClick={() => addPriorityPage(path)}>
                        {path}
                      </button>
                    ))}
                  </div>
                  <div className="priority-add-row">
                    <input
                      type="text"
                      value={customPriorityPage}
                      onChange={(event) => setCustomPriorityPage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addPriorityPage(customPriorityPage);
                        }
                      }}
                      placeholder="/new-page"
                    />
                    <button className="button" type="button" onClick={() => addPriorityPage(customPriorityPage)}>
                      Add page
                    </button>
                  </div>
                  <span className="field-helper">Or paste paths below:</span>
                  <textarea
                    name="pages"
                    placeholder={"/\n/pricing\n/services\n/blog\n/contact"}
                    value={priorityPages}
                    onBlur={(event) => setPriorityPages(priorityPagesText(event.target.value))}
                    onChange={(event) => setPriorityPages(event.target.value)}
                    rows={6}
                  />
                </label>
                <div className="baseline-settings-grid" aria-label="Baseline settings">
                  <div>
                    <span>Send results to</span>
                    <strong>{slackConnected ? "Slack connected" : "Slack not connected"}</strong>
                  </div>
                  <div>
                    <span>AI summary</span>
                    <strong>{aiAnalysisConnected ? "Enabled" : "Off"}</strong>
                  </div>
                  <div>
                    <span>Crawl options</span>
                    <strong>Sitemap first, then homepage links</strong>
                  </div>
                </div>
                <div className="tracker-baseline-note" data-ready={Boolean(seoTrackerBaseline) && seoTrackerStorageReady}>
                  <strong>{seoTrackerStorageReady ? (seoTrackerBaseline ? "Baseline active" : "No baseline yet") : "Storage setup needed"}</strong>
                  <span>
                    {!seoTrackerStorageReady
                      ? seoTrackerStorageError || "Scans can run temporarily, but saved baselines and history need the SEO Watch storage migration."
                      : seoTrackerBaseline
                      ? `Last captured ${new Date(seoTrackerBaseline.capturedAt).toLocaleString()} from ${seoTrackerBaseline.pages.length} page${seoTrackerBaseline.pages.length === 1 ? "" : "s"}.`
                      : "No baseline captured yet. Capture a public baseline to create the comparison point for future checks."}
                  </span>
                </div>
                <button className="button button-primary" type="submit" disabled={seoTracking}>
                  {seoTracking
                    ? "Scanning SEO changes..."
                    : !seoTrackerStorageReady
                      ? "Run Temporary SEO Scan"
                      : seoTrackerBaseline
                        ? "Scan for SEO Changes"
                        : "Capture Public Baseline"}
                </button>
              </form>
            </section>
            <SeoChangeRunHistory runs={seoChangeRuns} storageError={seoTrackerStorageError} storageReady={seoTrackerStorageReady} />
          </>
        ) : null}

        {activeTool === "social" ? (
          <section className="panel watch-run-panel social-surface-panel" aria-labelledby="social-surface-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Social Surface</span>
                <h3 id="social-surface-title">Scan public social profiles</h3>
                <p>Discover supported social links from the homepage, then check whether public metadata is visible or blocked.</p>
              </div>
            </div>

            <form className="watch-form" onSubmit={handleSocialSubmit}>
              <label>
                Site URL
                <input
                  name="siteUrl"
                  type="url"
                  placeholder="https://example.com"
                  value={watchSiteUrl}
                  onChange={(event) => setWatchSiteUrl(event.target.value)}
                  required
                />
              </label>
              <label>
                Social profile URLs
                <span className="field-helper">Optional. Leave blank to discover supported social links from the homepage.</span>
                <textarea
                  name="profileUrls"
                  value={socialProfileUrls}
                  onChange={(event) => setSocialProfileUrls(event.target.value)}
                  placeholder={"https://x.com/example\nhttps://www.linkedin.com/company/example"}
                  rows={5}
                />
              </label>
              <div className="tracker-baseline-note" data-ready={Boolean(socialResult)}>
                <strong>{socialResult ? "Latest social scan available" : "Public-only scan"}</strong>
                <span>
                  {socialResult
                    ? `Last checked ${socialResult.summary.checkedProfiles} profile${socialResult.summary.checkedProfiles === 1 ? "" : "s"} at ${new Date(socialResult.checkedAt).toLocaleString()}.`
                    : "This does not log into social platforms. Blocked or JavaScript-heavy profiles are reported as partial coverage."}
                </span>
              </div>
              <button className="button button-primary" type="submit" disabled={socialScanning}>
                {socialScanning ? "Scanning social profiles..." : "Run Social Surface Scan"}
              </button>
            </form>
          </section>
        ) : null}

        {activeTool === "jobIndex" ? <VastJobIndexAutomationPanel onOpenBaseline={() => onSelectTool("tracker")} /> : null}

        {activeTool === "visitors" ? (
          <VisitorIntelligencePanel
            activeClient={activeClient}
            clientId={activeClient?.id || DEFAULT_CLIENT_ID}
            summary={visitorIntelligence}
          />
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
      {activeTool === "social" && socialResult ? <SocialSurfaceResults result={socialResult} /> : null}
    </PageWorkspace>
  );
}

function DashboardStatusPill({
  label,
  state,
  value,
}: {
  label: string;
  state: "ready" | "missing" | "idle";
  value: string;
}) {
  return (
    <div className="watch-status-pill" data-state={state}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const WatchStatusPill = DashboardStatusPill;

function WatchModeCard({
  active,
  cta,
  description,
  disabled,
  onClick,
  subtitle,
  title,
}: {
  active: boolean;
  cta: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <article className="watch-mode-card" data-active={active}>
      <div>
        <span>{subtitle}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <button className="button" type="button" onClick={onClick} disabled={disabled}>
        {cta}
      </button>
    </article>
  );
}

function SeoChangeRunHistory({
  runs,
  storageError,
  storageReady,
}: {
  runs: SeoChangeRun[];
  storageError: string | null;
  storageReady: boolean;
}) {
  return (
    <section className="panel seo-run-history" aria-labelledby="seo-run-history-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Saved history</span>
          <h3 id="seo-run-history-title">Recent baseline runs</h3>
          <p>
            {storageReady
              ? "Stored per client and site URL. Each new scan compares against the latest saved baseline."
              : "Saved history will appear after the SEO Watch storage migration is applied."}
          </p>
        </div>
      </div>

      {runs.length ? (
        <div className="seo-run-list">
          {runs.map((run) => {
            const changeCount = Array.isArray(run.changes_json) ? run.changes_json.length : 0;
            return (
              <article className="seo-run-row" data-status={run.status} key={run.id}>
                <div>
                  <strong>{seoChangeStatusLabel(run.status)}</strong>
                  <span>{run.site_url}</span>
                </div>
                <dl>
                  <div>
                    <dt>Checked</dt>
                    <dd>{new Date(run.checked_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Changed pages</dt>
                    <dd>{run.summary_json.changedPages}</dd>
                  </div>
                  <div>
                    <dt>Changes</dt>
                    <dd>{changeCount}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          {storageReady ? "No runs yet. Run a Surface Check or capture a baseline to see results here." : storageError || "SEO Watch storage is not ready yet."}
        </div>
      )}
    </section>
  );
}

function VisitorIntelligencePanel({
  activeClient,
  clientId,
  summary,
}: {
  activeClient?: Client;
  clientId: string;
  summary: VisitorIntelligenceSummary;
}) {
  const endpoint =
    typeof window === "undefined"
      ? summary.contract.endpointPath
      : `${window.location.origin}${summary.contract.endpointPath}`;
  const samplePayload = `await fetch("${endpoint}", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "${summary.contract.clientHeader}": "${clientId}",
    "${summary.contract.secretHeader}": process.env.${summary.contract.secretEnvVar}
  },
  body: JSON.stringify({
    events: [{
      eventType: "request",
      source: "edge",
      siteOrigin: "https://example.com",
      pageUrl: "https://example.com/pricing",
      method: "GET",
      statusCode: 200,
      userAgent: request.headers.get("user-agent"),
      visitorIp: request.headers.get("x-forwarded-for")?.split(",")[0],
      country: request.headers.get("x-vercel-ip-country")
    }]
  })
});`;

  return (
    <section className="panel visitor-contract-panel" aria-labelledby="visitor-contract-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Viewership contract</span>
          <h3 id="visitor-contract-title">Receive visitor and bot evidence.</h3>
          <p>
            The tracked site forwards request events to this dashboard. The dashboard stores observed visits, classifies
            likely bots, and keeps the claim separate from GA4 or crawl checks.
          </p>
        </div>
        <span className="job-index-badge">{summary.storageReady === false ? "Setup needed" : "Read-only"}</span>
      </div>

      <div className="visitor-metric-grid" aria-label="Visitor intelligence summary">
        <div>
          <span>Total events</span>
          <strong>{summary.totalEvents}</strong>
        </div>
        <div>
          <span>Bot-like</span>
          <strong>{summary.botEvents}</strong>
        </div>
        <div>
          <span>AI crawlers</span>
          <strong>{summary.aiCrawlerEvents}</strong>
        </div>
        <div>
          <span>Pageviews</span>
          <strong>{summary.pageviewEvents}</strong>
        </div>
      </div>

      <div className="visitor-contract-grid">
        <article>
          <span>Inputs</span>
          <p>Path, method, status, User-Agent, visitor IP, country, ASN, and safe request headers.</p>
        </article>
        <article>
          <span>Processing</span>
          <p>Hash IPs, classify User-Agents, flag scanner paths, and keep reasons with each event.</p>
        </article>
        <article>
          <span>Outputs</span>
          <p>Client-scoped viewership, top bots, top pages, recent requests, and automation score.</p>
        </article>
        <article>
          <span>Boundary</span>
          <p>Use edge or server forwarding for bots. Browser-only beacons prove JavaScript ran, not total visitation.</p>
        </article>
      </div>

      {summary.storageReady === false ? (
        <div className="tracker-baseline-note" data-ready="false">
          <strong>Storage setup needed</strong>
          <span>{summary.storageError || "Apply the Visitor Intelligence migration before saving events."}</span>
        </div>
      ) : null}

      <div className="visitor-setup-grid">
        <div className="visitor-contract-copy">
          <span className="eyebrow">Tracked site setup</span>
          <h4>{activeClient?.name || clientId}</h4>
          <dl>
            <div>
              <dt>Endpoint</dt>
              <dd>{endpoint}</dd>
            </div>
            <div>
              <dt>Client header</dt>
              <dd>{summary.contract.clientHeader}: {clientId}</dd>
            </div>
            <div>
              <dt>Secret env</dt>
              <dd>{summary.contract.secretEnvVar}</dd>
            </div>
          </dl>
        </div>
        <pre className="contract-code" aria-label="Visitor telemetry contract example">
          <code>{samplePayload}</code>
        </pre>
      </div>

      <div className="visitor-observation-grid">
        <VisitorCountList title="Top bots" rows={summary.topBots} empty="No bot-like requests observed yet." />
        <VisitorCountList title="Top pages" rows={summary.topPages} empty="No page requests observed yet." />
      </div>

      <div className="visitor-event-list" aria-label="Recent visitor events">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Recent evidence</span>
            <h4>Latest observed requests</h4>
          </div>
        </div>
        {summary.recentEvents.length ? (
          summary.recentEvents.map((event) => (
            <article className="visitor-event-row" key={event.id} data-category={event.botCategory}>
              <div>
                <strong>{event.botName || visitorCategoryLabel(event.botCategory)}</strong>
                <span>{event.path}</span>
              </div>
              <dl>
                <div>
                  <dt>Score</dt>
                  <dd>{event.automationScore}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{event.source}</dd>
                </div>
                <div>
                  <dt>Seen</dt>
                  <dd>{new Date(event.receivedAt).toLocaleString()}</dd>
                </div>
              </dl>
              <p>{event.classificationReasons[0] || "No classification reason recorded."}</p>
            </article>
          ))
        ) : (
          <div className="empty-state">No visitor events yet. Connect a tracked site to start observing real traffic.</div>
        )}
      </div>
    </section>
  );
}

function VisitorCountList({ empty, rows, title }: { empty: string; rows: Array<{ label: string; count: number }>; title: string }) {
  return (
    <div className="visitor-count-list">
      <h4>{title}</h4>
      {rows.length ? (
        rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.count}</strong>
          </div>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function visitorCategoryLabel(category: VisitorIntelligenceEvent["botCategory"]) {
  if (category === "human") return "Likely human";
  if (category === "ai") return "AI crawler";
  if (category === "seo") return "SEO crawler";
  if (category === "search") return "Search crawler";
  if (category === "monitoring") return "Monitoring bot";
  if (category === "scanner") return "Likely scanner";
  if (category === "automation") return "Automation";
  return "Unknown automation";
}

function VastJobIndexAutomationPanel({ onOpenBaseline }: { onOpenBaseline: () => void }) {
  const automationFlow = [
    {
      title: "Inputs",
      detail: "Exact Vast job-index URL, watched fields, expected refresh cadence, and any required allowlist.",
    },
    {
      title: "Processing",
      detail: "Fetch the public job index, normalize the rows, compare against the last snapshot, then classify material changes.",
    },
    {
      title: "Outputs",
      detail: "Dashboard status, saved history, and Slack alerts when index shape, availability, or key job signals change.",
    },
    {
      title: "Dependencies",
      detail: "Reviewed runner, durable storage, Slack webhook, and a rollback path that disables only this automation.",
    },
  ];

  const activationSteps = [
    "Confirm the exact public source and fields the automation should watch.",
    "Add a read-only runner endpoint or scheduled workflow.",
    "Persist snapshots separately from the current page baseline tables.",
    "Add a dry-run result before enabling Slack alerts.",
  ];

  return (
    <section className="panel job-index-panel" aria-labelledby="job-index-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Vast Job Index automation</span>
          <h3 id="job-index-title">Track job-index drift without claiming it is live.</h3>
          <p>This is a WIP control surface. It shows the automation contract, but it does not run a job-index crawler yet.</p>
        </div>
        <span className="job-index-badge">WIP</span>
      </div>

      <div className="job-index-readiness" aria-label="Job index readiness">
        <div>
          <span>Runner</span>
          <strong>Not connected</strong>
        </div>
        <div>
          <span>Storage</span>
          <strong>Not defined</strong>
        </div>
        <div>
          <span>Alerts</span>
          <strong>Hold until dry run</strong>
        </div>
      </div>

      <div className="job-index-flow-grid" aria-label="Job index system breakdown">
        {automationFlow.map((item) => (
          <article key={item.title}>
            <span>{item.title}</span>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="job-index-checklist" aria-label="Activation checklist">
        <h4>Activation checklist</h4>
        <ol>
          {activationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="job-index-actions">
        <button className="button button-primary" type="button" disabled title="The Vast Job Index runner is not connected yet.">
          Runner not connected yet
        </button>
        <button className="button" type="button" onClick={onOpenBaseline}>
          Open Baseline Watch
        </button>
      </div>
    </section>
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

function SocialSurfaceResults({ result }: { result: SocialSurfaceResult }) {
  const topIssues = result.issues.slice(0, 8);

  return (
    <section className="panel social-results" aria-labelledby="social-results-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Latest social scan</span>
          <h3 id="social-results-title">{socialSurfaceStatusLabel(result.status)}</h3>
          <p>
            Checked {result.summary.checkedProfiles} public profile{result.summary.checkedProfiles === 1 ? "" : "s"} at{" "}
            {new Date(result.checkedAt).toLocaleString()}.
          </p>
        </div>
        <span className="social-status" data-status={result.status}>
          {result.status}
        </span>
      </div>

      <div className="social-score-grid" aria-label="Social scan counts">
        <div>
          <span>Discovered</span>
          <strong>{result.summary.discoveredProfiles}</strong>
        </div>
        <div>
          <span>Checked</span>
          <strong>{result.summary.checkedProfiles}</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{result.summary.blockedProfiles}</strong>
        </div>
        <div>
          <span>Issues</span>
          <strong>{result.summary.issues}</strong>
        </div>
      </div>

      <div className="social-result-grid">
        <div className="social-profile-list">
          <h4>Profiles checked</h4>
          {result.profiles.length ? (
            result.profiles.map((profile) => (
              <article className="social-profile-row" data-status={profile.status} key={profile.url}>
                <div className="card-top">
                  <span className="source-type-pill">{profile.platform}</span>
                  <small>{profile.httpStatus || profile.status}</small>
                </div>
                <strong>{profile.title || profile.url}</strong>
                <p>{profile.description || profile.error || "No public description was exposed."}</p>
                <small>{profile.url}</small>
                {profile.signals.length ? (
                  <div className="social-signal-row">
                    {profile.signals.slice(0, 3).map((signal) => (
                      <span key={signal}>{signal}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-state">No supported public social profiles were found.</div>
          )}
        </div>

        <div className="social-issue-list">
          <h4>Coverage notes</h4>
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
            <div className="empty-state">No social surface issues were found in this run.</div>
          )}
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

function socialSurfaceStatusLabel(status: SocialSurfaceResult["status"]) {
  if (status === "healthy") return "Social surfaces look healthy";
  if (status === "blocked") return "Social scan was blocked";
  if (status === "failed") return "No social profile coverage found";
  return "Social surface has partial coverage";
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
  const savedToolCount = Object.values(latestByProvider).filter(Boolean).length;
  const connectedToolCount = Object.values(latestByProvider).filter((integration) => integration?.status === "connected").length;

  return (
    <PageWorkspace className="integrations-workspace" tourId="integration-hub">
      <PageHero
        eyebrow="Tool setup"
        title="Connect one tool at a time."
        description="Choose one tool, save its setup data, then test it. Secrets are encrypted and never returned."
        stats={[
          { label: "active page", value: providerLabels[activeProvider] },
          { label: "saved tools", value: String(savedToolCount) },
          { label: "status", value: statusLabel(activeIntegration?.status) },
        ]}
      />

      <div className="dashboard-status-strip" aria-label="Tool setup status">
        <DashboardStatusPill label="Active tool" value={providerLabels[activeProvider]} state="ready" />
        <DashboardStatusPill
          label="Tool status"
          value={statusLabel(activeIntegration?.status)}
          state={activeIntegration?.status === "connected" ? "ready" : activeIntegration?.status === "error" ? "missing" : "idle"}
        />
        <DashboardStatusPill
          label="Connected"
          value={`${connectedToolCount}/5`}
          state={connectedToolCount ? "ready" : "missing"}
        />
        <DashboardStatusPill
          label="Saved tools"
          value={String(savedToolCount)}
          state={savedToolCount ? "ready" : "idle"}
        />
      </div>

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

      <div className="dashboard-status-strip" aria-label="Competitive analysis status">
        <DashboardStatusPill
          label="Reports"
          value={String(competitiveAnalyses.length)}
          state={competitiveAnalyses.length ? "ready" : "missing"}
        />
        <DashboardStatusPill
          label="Latest sources"
          value={String(latestSourceCount)}
          state={latestSourceCount ? "ready" : "idle"}
        />
        <DashboardStatusPill
          label="Pages reviewed"
          value={String(latestEvidenceCount)}
          state={latestEvidenceCount ? "ready" : "idle"}
        />
        <DashboardStatusPill
          label="Runner"
          value={analyzing ? "Generating" : "Ready"}
          state={analyzing ? "idle" : "ready"}
        />
      </div>

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
  const savedSignalCount = Object.values(latestByProvider).filter(Boolean).length;
  const openAiStatus = latestByProvider.openai?.status;

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

      <div className="dashboard-status-strip" aria-label="Insight feed status">
        <DashboardStatusPill
          label="OpenAI"
          value={openAiStatus ? statusLabel(openAiStatus) : "Not connected"}
          state={openAiStatus === "connected" ? "ready" : openAiStatus === "error" ? "missing" : "idle"}
        />
        <DashboardStatusPill
          label="Saved insights"
          value={String(insights.length)}
          state={insights.length ? "ready" : "idle"}
        />
        <DashboardStatusPill
          label="Signal sources"
          value={String(savedSignalCount)}
          state={savedSignalCount ? "ready" : "missing"}
        />
        <DashboardStatusPill
          label="Runner"
          value={generating ? "Generating" : "Ready"}
          state={generating ? "idle" : "ready"}
        />
      </div>

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
  const uniqueUrls = Array.from(new Set(urls.filter((url) => /^https?:\/\//i.test(url)))).slice(0, 5);
  const hasClientContext = urls.some((url) => url.startsWith("client-context://"));

  if (!uniqueUrls.length) {
    return <span className="source-links">{hasClientContext ? "Client context" : "No source links attached"}</span>;
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
