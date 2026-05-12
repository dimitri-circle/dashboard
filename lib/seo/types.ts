export type SeoProvider = "ga4" | "gtm" | "hotjar" | "openai" | "mcp" | "gsc" | "semrush" | "ahrefs";

export type SeoStatus = "disconnected" | "connected" | "error";

export type SeoPriority = "low" | "medium" | "high";

export type SeoClient = {
  _id?: ObjectId;
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EncryptedSecret = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

export type SeoIntegration = {
  _id?: ObjectId;
  id: string;
  user_id: string;
  provider: SeoProvider;
  display_name: string;
  status: SeoStatus;
  config_json: Record<string, unknown>;
  encrypted_secret: EncryptedSecret | null;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SafeSeoIntegration = Omit<SeoIntegration, "_id" | "encrypted_secret"> & {
  has_secret: boolean;
};

export type SeoInsight = {
  _id?: ObjectId;
  id: string;
  user_id: string;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  priority: SeoPriority;
  confidence_score: number;
  source_provider: string;
  source_payload_json: Record<string, unknown>;
  created_at: string;
};

export type SeoMetricSnapshot = {
  _id?: ObjectId;
  id: string;
  user_id: string;
  provider: SeoProvider;
  page_url: string | null;
  metric_name: string;
  metric_value: number;
  dimensions_json: Record<string, unknown>;
  captured_at: string;
  created_at: string;
};

export type SeoCompetitiveFeatureEvidence = {
  feature: string;
  label: string;
  urls: string[];
};

export type SeoCompetitiveCrawlPage = {
  url: string;
  status: "success" | "skipped" | "timeout" | "invalid_url" | "fetch_error";
  status_code: number | null;
  title: string | null;
  meta_description: string | null;
  headings: string[];
  nav_labels: string[];
  cta_text: string[];
  schema_types: string[];
  page_categories: string[];
  features: SeoCompetitiveFeatureEvidence[];
  error: string | null;
};

export type SeoCompetitiveCrawlSite = {
  site_role: "client" | "competitor";
  name: string;
  url: string | null;
  status: "success" | "skipped" | "partial" | "failed";
  feature_count: number;
  pages: SeoCompetitiveCrawlPage[];
  features: SeoCompetitiveFeatureEvidence[];
  errors: string[];
};

export type SeoCompetitivePattern = {
  feature: string;
  label: string;
  competitors: string[];
  evidence_urls: string[];
};

export type SeoCompetitiveReportSection = {
  heading: string;
  body: string;
  source_urls: string[];
};

export type SeoCompetitiveAnalysis = {
  _id?: ObjectId;
  id: string;
  user_id: string;
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
  missing_from_client: SeoCompetitivePattern[];
  competitor_only_patterns: SeoCompetitivePattern[];
  shared_patterns: SeoCompetitivePattern[];
  client_strengths: SeoCompetitivePattern[];
  crawl_evidence: SeoCompetitiveCrawlSite[];
  top_performers: Array<{ name: string; url: string | null; feature_count: number }>;
  report_draft: SeoCompetitiveReportSection[];
  recommendations: Array<{
    title: string;
    rationale: string;
    priority: SeoPriority;
  }>;
  assumptions: string[];
  confidence_score: number;
  source_payload_json: Record<string, unknown>;
  created_at: string;
};

export type SeoAuditEvent = {
  _id?: ObjectId;
  id: string;
  user_id: string;
  action: string;
  entity_type: "client" | "integration" | "insight" | "sync" | "system";
  entity_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type SeoAppUser = {
  _id?: ObjectId;
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
  updated_at: string;
};
import type { ObjectId } from "mongodb";
