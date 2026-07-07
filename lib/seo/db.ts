import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  SeoAuditEvent,
  SeoAppUser,
  SeoBrainContext,
  SeoBrainReport,
  SeoChangeRun,
  SeoClient,
  SeoCompetitiveAnalysis,
  SeoInsight,
  SeoIntegration,
  SeoMetricSnapshot,
  SeoWatchBaseline,
} from "./types";

type RowWithId = { id: string; _id?: string };
type SeoTableName =
  | "seo_audit_events"
  | "seo_app_users"
  | "seo_brain_contexts"
  | "seo_brain_reports"
  | "seo_clients"
  | "seo_competitive_analyses"
  | "seo_change_runs"
  | "seo_insights"
  | "seo_integrations"
  | "seo_metric_snapshots"
  | "seo_watch_baselines";

type FilterValue = string | number | boolean | null | { $ne?: unknown; $in?: unknown[] };
type Filter = Record<string, FilterValue>;
type SortSpec = Record<string, 1 | -1>;
type UpdateSpec<T> = {
  $set?: Partial<T>;
  $setOnInsert?: Partial<T>;
};

let supabaseClient: SupabaseClient | null = null;

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL is required for SEO Intelligence storage.");
  }
  return url;
}

function getSupabaseSecretKey() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for SEO Intelligence storage.");
  }
  return key;
}

export function getSupabaseAdminClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return supabaseClient;
}

function cleanRow<T>(row: Partial<T>) {
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).filter(([key, value]) => key !== "_id" && value !== undefined)
  ) as Partial<T>;
}

function plainFilterValues(filter: Filter) {
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => !value || typeof value !== "object"));
}

function applyFilter<T>(query: T, filter: Filter) {
  return Object.entries(filter).reduce((nextQuery, [key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("$ne" in value) {
        return value.$ne === null
          ? (nextQuery as { not: (column: string, operator: string, value: null) => T }).not(key, "is", null)
          : (nextQuery as { neq: (column: string, value: unknown) => T }).neq(key, value.$ne);
      }

      if ("$in" in value) {
        return (nextQuery as { in: (column: string, values: unknown[]) => T }).in(key, value.$in || []);
      }
    }

    return value === null
      ? (nextQuery as { is: (column: string, value: null) => T }).is(key, null)
      : (nextQuery as { eq: (column: string, value: unknown) => T }).eq(key, value);
  }, query);
}

function onConflictFor(tableName: SeoTableName, filter: Filter) {
  if (tableName === "seo_app_users" && "email" in filter) return "email";
  if ("id" in filter) return "id";
  return undefined;
}

function table(tableName: SeoTableName) {
  return getSupabaseAdminClient().from(tableName) as any;
}

class SupabaseFindQuery<T extends RowWithId> {
  private sortSpec: SortSpec | null = null;
  private rowLimit: number | null = null;

  constructor(
    private readonly tableName: SeoTableName,
    private readonly filter: Filter
  ) {}

  sort(sortSpec: SortSpec) {
    this.sortSpec = sortSpec;
    return this;
  }

  limit(rowLimit: number) {
    this.rowLimit = rowLimit;
    return this;
  }

  async toArray() {
    let query = applyFilter(table(this.tableName).select("*"), this.filter);

    if (this.sortSpec) {
      for (const [column, direction] of Object.entries(this.sortSpec)) {
        query = query.order(column, { ascending: direction === 1 });
      }
    }

    if (this.rowLimit !== null) {
      query = query.limit(this.rowLimit);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as T[];
  }
}

class SupabaseCollection<T extends RowWithId> {
  constructor(private readonly tableName: SeoTableName) {}

  async createIndex() {
    return this.tableName;
  }

  find(filter: Filter = {}) {
    return new SupabaseFindQuery<T>(this.tableName, filter);
  }

  async findOne(filter: Filter) {
    const { data, error } = await applyFilter(table(this.tableName).select("*"), filter)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return (data as T | null) || null;
  }

  async insertOne(row: T) {
    const { error } = await table(this.tableName).insert(cleanRow<T>(row));
    if (error) {
      throw new Error(error.message);
    }
    return { insertedId: row.id };
  }

  async insertMany(rows: T[]) {
    if (!rows.length) {
      return { insertedCount: 0 };
    }

    const { error } = await table(this.tableName).insert(rows.map((row) => cleanRow<T>(row)));
    if (error) {
      throw new Error(error.message);
    }
    return { insertedCount: rows.length };
  }

  async updateOne(filter: Filter, update: UpdateSpec<T>, options: { upsert?: boolean } = {}) {
    const set = cleanRow<T>(update.$set || {});
    const setOnInsert = cleanRow<T>(update.$setOnInsert || {});

    if (options.upsert && update.$setOnInsert) {
      const existing = await this.findOne(filter);
      if (existing) {
        return { matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
      }

      const { error } = await table(this.tableName).insert(setOnInsert);
      if (error) {
        throw new Error(error.message);
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }

    if (options.upsert) {
      const row = { ...plainFilterValues(filter), ...set };
      const onConflict = onConflictFor(this.tableName, filter);
      const { error } = await table(this.tableName).upsert(row, onConflict ? { onConflict } : undefined);
      if (error) {
        throw new Error(error.message);
      }
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }

    const { data, error } = await applyFilter(table(this.tableName).update(set).select("id"), filter);
    if (error) {
      throw new Error(error.message);
    }
    return { matchedCount: data?.length || 0, modifiedCount: data?.length || 0 };
  }

  async replaceOne(filter: Filter, replacement: T) {
    const { data, error } = await applyFilter(
      table(this.tableName).update(cleanRow<T>(replacement)).select("id"),
      filter
    );
    if (error) {
      throw new Error(error.message);
    }
    return { matchedCount: data?.length || 0, modifiedCount: data?.length || 0 };
  }

  async deleteOne(filter: Filter) {
    const { data, error } = await applyFilter(table(this.tableName).delete().select("id"), filter);
    if (error) {
      throw new Error(error.message);
    }
    return { deletedCount: Math.min(data?.length || 0, 1) };
  }

  async deleteMany(filter: Filter) {
    const { data, error } = await applyFilter(table(this.tableName).delete().select("id"), filter);
    if (error) {
      throw new Error(error.message);
    }
    return { deletedCount: data?.length || 0 };
  }
}

export async function pingSeoDb() {
  const { error } = await table("seo_clients").select("id").limit(1);
  if (error) {
    throw new Error(error.message);
  }
  return true;
}

export async function getSeoCollections(): Promise<{
  integrations: SupabaseCollection<SeoIntegration>;
  insights: SupabaseCollection<SeoInsight>;
  metricSnapshots: SupabaseCollection<SeoMetricSnapshot>;
  watchBaselines: SupabaseCollection<SeoWatchBaseline>;
  changeRuns: SupabaseCollection<SeoChangeRun>;
  competitiveAnalyses: SupabaseCollection<SeoCompetitiveAnalysis>;
  clients: SupabaseCollection<SeoClient>;
  auditEvents: SupabaseCollection<SeoAuditEvent>;
  appUsers: SupabaseCollection<SeoAppUser>;
  brainContexts: SupabaseCollection<SeoBrainContext>;
  brainReports: SupabaseCollection<SeoBrainReport>;
}> {
  return {
    integrations: new SupabaseCollection<SeoIntegration>("seo_integrations"),
    insights: new SupabaseCollection<SeoInsight>("seo_insights"),
    metricSnapshots: new SupabaseCollection<SeoMetricSnapshot>("seo_metric_snapshots"),
    watchBaselines: new SupabaseCollection<SeoWatchBaseline>("seo_watch_baselines"),
    changeRuns: new SupabaseCollection<SeoChangeRun>("seo_change_runs"),
    competitiveAnalyses: new SupabaseCollection<SeoCompetitiveAnalysis>("seo_competitive_analyses"),
    clients: new SupabaseCollection<SeoClient>("seo_clients"),
    auditEvents: new SupabaseCollection<SeoAuditEvent>("seo_audit_events"),
    appUsers: new SupabaseCollection<SeoAppUser>("seo_app_users"),
    brainContexts: new SupabaseCollection<SeoBrainContext>("seo_brain_contexts"),
    brainReports: new SupabaseCollection<SeoBrainReport>("seo_brain_reports"),
  };
}

export async function ensureSeoStorage() {
  await pingSeoDb();
  return { ok: true };
}
