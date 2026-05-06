"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from "react-joyride";

type Provider = "ga4" | "gtm" | "hotjar" | "openai" | "mcp";
type Status = "disconnected" | "connected" | "error";

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

const providerLabels: Record<Provider, string> = {
  ga4: "GA4",
  gtm: "GTM",
  hotjar: "Hotjar",
  openai: "OpenAI",
  mcp: "MCP",
};

const metricPlaceholders = [
  ["Organic sessions", "No GA4 sync"],
  ["Impressions", "No GSC connector"],
  ["CTR", "No search data"],
  ["Conversions", "No key events"],
  ["Behavior events", "No Hotjar sync"],
  ["Connector status", "Waiting for tests"],
];

const DEFAULT_CLIENT_ID = "demo-client";
const CLIENT_STORAGE_KEY = "seo-intelligence-client-id";

const tourSteps: Step[] = [
  {
    target: "[data-tour='hero']",
    title: "Start with the intelligence layer",
    content:
      "This page is built around one workflow: choose a client, connect trusted data, then generate a focused SEO intelligence report.",
    placement: "bottom",
    skipBeacon: true,
  },
  {
    target: "[data-tour='client-sidebar']",
    title: "Choose the right client",
    content:
      "The sidebar is the tenant boundary. Pick a workspace before adding keys so each client keeps separate integrations, metrics, and insights.",
    placement: "right",
  },
  {
    target: "[data-tour='add-client-form']",
    title: "Create a new workspace",
    content:
      "Use the short form to add a client. The client id becomes the stable scope sent to every SEO API request.",
    placement: "right",
  },
  {
    target: "[data-tour='integration-hub']",
    title: "Connect only what you need",
    content:
      "This hub stores connector metadata and encrypted secrets. Start with OpenAI plus one analytics source, then expand.",
    placement: "top",
  },
  {
    target: "[data-tour='status-row']",
    title: "Watch connection health",
    content:
      "These cards show whether GA4, GTM, Hotjar, OpenAI, and MCP are disconnected, connected, or failing validation.",
    placement: "bottom",
  },
  {
    target: "[data-tour='ga4-property']",
    title: "Add GA4 metadata",
    content:
      "Save the GA4 property id here. When Google OAuth is added, this same provider card will support real runReport sync.",
    placement: "top",
  },
  {
    target: "[data-tour='openai-key']",
    title: "Unlock AI insights",
    content:
      "Add the client’s OpenAI token here. It is encrypted on the server before MongoDB storage and never rendered back.",
    placement: "top",
  },
  {
    target: "[data-tour='mcp-card']",
    title: "Use remote MCP safely",
    content:
      "MCP connectors are remote HTTP configurations only. The app never starts local processes or executes untrusted tools.",
    placement: "top",
  },
  {
    target: "[data-tour='metrics-overview']",
    title: "Confirm data coverage",
    content:
      "Metrics stay honest. Until sync jobs pull real data, these cards show setup gaps instead of fake analytics.",
    placement: "left",
  },
  {
    target: "[data-tour='generate-insights']",
    title: "Generate the client report",
    content:
      "After OpenAI is connected, this button creates insight cards from the active client’s connector status and metric snapshots.",
    placement: "left",
  },
  {
    target: "[data-tour='insight-feed']",
    title: "Turn findings into actions",
    content:
      "The feed shows priority, confidence, source, impact, and a concrete recommendation so the next action is clear.",
    placement: "top",
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
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID);
  const [clients, setClients] = useState<Client[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);

  const activeClient = clients.find((client) => client.id === clientId);

  const latestByProvider = useMemo(() => {
    return integrations.reduce<Partial<Record<Provider, Integration>>>((acc, integration) => {
      acc[integration.provider] = integration;
      return acc;
    }, {});
  }, [integrations]);

  async function loadClients(activeClientId = clientId) {
    const body = await api<{ clients: Client[] }>(activeClientId, "/api/seo/clients");
    setClients(body.clients);
    return body.clients;
  }

  async function loadDashboard(activeClientId = clientId) {
    try {
      const [clientBody, integrationBody, insightBody] = await Promise.all([
        api<{ clients: Client[] }>(activeClientId, "/api/seo/clients"),
        api<{ integrations: Integration[] }>(activeClientId, "/api/seo/integrations"),
        api<{ insights: Insight[] }>(activeClientId, "/api/seo/insights"),
      ]);
      setClients(clientBody.clients);
      setIntegrations(integrationBody.integrations);
      setInsights(insightBody.insights);
      if (!integrationBody.integrations.some((item) => item.provider === "openai")) {
        setNotice({ type: "info", message: "Connect a ChatGPT/OpenAI token to unlock AI-generated insights." });
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
      form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => {
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
          buttons: ["back", "skip", "primary"],
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

      <aside className="client-sidebar" data-tour="client-sidebar" aria-label="Client workspaces">
        <div>
          <p className="eyebrow">Clients</p>
          <h2>Workspaces</h2>
          <p>Pick a client before connecting tools. Each workspace keeps separate encrypted keys.</p>
        </div>

        <div className="client-list">
          {clients.map((client) => (
            <button
              className="client-item"
              data-active={client.id === clientId}
              key={client.id}
              type="button"
              onClick={() => switchClient(client.id)}
            >
              <strong>{client.name}</strong>
              <span>{client.id}</span>
            </button>
          ))}
        </div>

        <form className="add-client-form" data-tour="add-client-form" onSubmit={addClient}>
          <h3>Add client</h3>
          <label>
            Client name
            <input name="name" placeholder="Acme Health" required />
          </label>
          <label>
            Client id
            <input name="id" placeholder="acme-health" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}[a-zA-Z0-9]" />
          </label>
          <label>
            Notes
            <textarea name="notes" placeholder="Optional context" rows={3} />
          </label>
          <button className="button button-primary" type="submit">
            Add client
          </button>
        </form>
      </aside>

      <div className="dashboard" aria-live="polite">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">MVP Dashboard</p>
            <h2 id="dashboard-title">SEO Intelligence</h2>
            <p className="active-client">Active client: {activeClient?.name || clientId}</p>
          </div>
          <div className="dashboard-tools">
            <button className="button" type="button" onClick={() => setTourRunning(true)}>
              Start Tutorial
            </button>
            <button
              className="button button-primary"
              data-tour="generate-insights"
              type="button"
              disabled={generating}
              onClick={generateInsights}
            >
              {generating ? "Generating..." : "Generate Insights"}
            </button>
          </div>
        </div>

        {notice ? (
          <div className="alert" data-type={notice.type} role="status">
            {notice.message}
          </div>
        ) : null}

        <div className="status-row" data-tour="status-row" aria-label="Connection status">
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

        <div className="dashboard-grid">
          <section className="panel" data-tour="integration-hub" aria-labelledby="integrations-title">
            <div className="section-heading">
              <h3 id="integrations-title">Integrations Hub</h3>
              <p>Secrets are encrypted server-side and never returned to this browser.</p>
            </div>

            <div className="integration-grid" aria-busy={loading}>
              <ProviderForm provider="ga4" title="Google Analytics 4" onSubmit={saveIntegration} onTest={testProvider}>
                <Field
                  name="propertyId"
                  label="Property ID"
                  placeholder="properties/123456789"
                  required
                  tourId="ga4-property"
                />
                <Field name="authMethod" label="Auth method" placeholder="OAuth placeholder" />
              </ProviderForm>

              <ProviderForm provider="gtm" title="Google Tag Manager" onSubmit={saveIntegration} onTest={testProvider}>
                <Field name="accountId" label="Account ID" placeholder="1234567" required />
                <Field name="containerId" label="Container ID" placeholder="GTM-XXXXXXX" required />
              </ProviderForm>

              <ProviderForm provider="hotjar" title="Hotjar" onSubmit={saveIntegration} onTest={testProvider}>
                <Field name="siteId" label="Site ID" placeholder="1234567" />
                <Field name="apiKey" label="API key or connector token" placeholder="Stored encrypted" type="password" />
                <Field name="baseUrl" label="Connector URL" placeholder="https://connector.example.com" type="url" />
              </ProviderForm>

              <ProviderForm provider="openai" title="ChatGPT / OpenAI Token" onSubmit={saveIntegration} onTest={testProvider}>
                <Field name="apiKey" label="API key" placeholder="sk-..." type="password" required tourId="openai-key" />
              </ProviderForm>

              <ProviderForm
                provider="mcp"
                title="MCP Connectors"
                wide
                tourId="mcp-card"
                onSubmit={saveIntegration}
                onTest={testProvider}
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
            </div>
          </section>

          <aside className="panel" data-tour="metrics-overview" aria-labelledby="metrics-title">
            <div className="section-heading">
              <h3 id="metrics-title">Metrics Overview</h3>
              <p>Live values appear after connector syncs are configured.</p>
            </div>
            <div className="metrics">
              {metricPlaceholders.map(([label, value]) => (
                <article className="metric" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <section className="panel" data-tour="insight-feed" aria-labelledby="insights-title">
          <div className="section-heading">
            <h3 id="insights-title">Insight Feed</h3>
            {!insights.length ? (
              <p>
                {latestByProvider.openai
                  ? "Connect GA4 and Hotjar, then generate your first SEO intelligence report."
                  : "Connect GA4, Hotjar, and OpenAI to generate your first SEO intelligence report."}
              </p>
            ) : null}
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
      </div>
    </section>
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
      <input name={name} placeholder={placeholder} type={type} required={required} autoComplete="off" />
    </label>
  );
}
