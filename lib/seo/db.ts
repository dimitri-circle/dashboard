import { MongoClient, ServerApiVersion, type Collection, type Db } from "mongodb";
import type {
  SeoAuditEvent,
  SeoAppUser,
  SeoClient,
  SeoCompetitiveAnalysis,
  SeoInsight,
  SeoIntegration,
  SeoMetricSnapshot,
} from "./types";

let clientPromise: Promise<MongoClient> | null = null;
let dbInstance: Db | null = null;

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required for SEO Intelligence storage.");
  }
  return uri;
}

export async function getMongoClient() {
  if (!clientPromise) {
    const client = new MongoClient(getMongoUri(), {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      dbInstance = null;
      throw error;
    });
  }

  return clientPromise;
}

export async function getSeoDb() {
  if (!dbInstance) {
    const client = await getMongoClient();
    dbInstance = client.db(process.env.MONGODB_DB || "seo_intelligence");
  }

  return dbInstance;
}

export async function pingSeoDb() {
  const client = await getMongoClient();
  await client.db(process.env.MONGODB_DB || "seo_intelligence").command({ ping: 1 });
  return true;
}

export async function getSeoCollections(): Promise<{
  integrations: Collection<SeoIntegration>;
  insights: Collection<SeoInsight>;
  metricSnapshots: Collection<SeoMetricSnapshot>;
  competitiveAnalyses: Collection<SeoCompetitiveAnalysis>;
  clients: Collection<SeoClient>;
  auditEvents: Collection<SeoAuditEvent>;
  appUsers: Collection<SeoAppUser>;
}> {
  const db = await getSeoDb();
  return {
    integrations: db.collection<SeoIntegration>("seo_integrations"),
    insights: db.collection<SeoInsight>("seo_insights"),
    metricSnapshots: db.collection<SeoMetricSnapshot>("seo_metric_snapshots"),
    competitiveAnalyses: db.collection<SeoCompetitiveAnalysis>("seo_competitive_analyses"),
    clients: db.collection<SeoClient>("seo_clients"),
    auditEvents: db.collection<SeoAuditEvent>("seo_audit_events"),
    appUsers: db.collection<SeoAppUser>("seo_app_users"),
  };
}

export async function ensureSeoIndexes() {
  const { clients, integrations, insights, metricSnapshots, competitiveAnalyses, auditEvents, appUsers } =
    await getSeoCollections();

  await Promise.all([
    appUsers.createIndex({ email: 1 }, { unique: true, name: "seo_app_users_email_unique" }),
    clients.createIndex({ id: 1 }, { unique: true, name: "seo_clients_id_unique" }),
    clients.createIndex({ name: 1 }, { name: "seo_clients_name" }),
    integrations.createIndex({ user_id: 1, provider: 1 }, { name: "seo_integrations_client_provider" }),
    integrations.createIndex({ user_id: 1, id: 1 }, { unique: true, name: "seo_integrations_client_id_unique" }),
    integrations.createIndex({ user_id: 1, status: 1 }, { name: "seo_integrations_client_status" }),
    insights.createIndex({ user_id: 1, created_at: -1 }, { name: "seo_insights_client_created" }),
    metricSnapshots.createIndex(
      { user_id: 1, provider: 1, captured_at: -1 },
      { name: "seo_metric_snapshots_client_provider_captured" }
    ),
    metricSnapshots.createIndex(
      { user_id: 1, metric_name: 1, captured_at: -1 },
      { name: "seo_metric_snapshots_client_metric_captured" }
    ),
    competitiveAnalyses.createIndex(
      { user_id: 1, created_at: -1 },
      { name: "seo_competitive_analyses_client_created" }
    ),
    auditEvents.createIndex({ user_id: 1, created_at: -1 }, { name: "seo_audit_events_client_created" }),
    auditEvents.createIndex({ action: 1, created_at: -1 }, { name: "seo_audit_events_action_created" }),
  ]);

  return { ok: true };
}
