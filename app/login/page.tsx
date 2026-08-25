import { createElement } from "react";
import { CircleClickLogo } from "@/components/CircleClickLogo";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params?.error;
  const nextPath = params?.next || "/";
  const message =
    error === "not-configured"
      ? "Login is not configured. Add a dashboard session token or connect the server-side Supabase credentials in Vercel."
      : error === "invalid"
        ? "That email or password did not match."
        : null;

  return (
    <main className="login-page">
      {createElement("reactive-dot-ribbon", {
        "aria-hidden": "true",
        background: "",
        className: "login-background-ribbon",
        source: "/dots-pattern.webp",
      })}
      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-intro">
          <div className="login-brand-lockup">
            <CircleClickLogo className="login-brand-mark" />
            <div>
              <p className="eyebrow">CircleClick SEO</p>
              <p className="login-wordmark">Workspace</p>
            </div>
          </div>

          <div className="login-intro-copy">
            <p className="login-kicker">Private client intelligence</p>
            <h1 id="login-title">Welcome back.</h1>
            <p>Review client analytics, protected tools, and AI-assisted reports from one workspace.</p>
          </div>

          <div className="login-access-note">
            <span aria-hidden="true" />
            <p>
              <strong>Authorized access</strong>
              <small>Use your CircleClick workspace credentials.</small>
            </p>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-heading">
            <p className="eyebrow">Workspace access</p>
            <h2>Sign in</h2>
            <p>Enter your account details to continue.</p>
          </div>

          {message ? (
            <div className="alert" data-type="error" role="status">
              {message}
            </div>
          ) : null}

          <form className="login-form" action="/api/auth/login" method="post">
            <input name="next" type="hidden" value={nextPath} />
            <label>
              <span>Email</span>
              <input
                aria-describedby="login-email-hint"
                autoCapitalize="none"
                autoComplete="username"
                inputMode="email"
                name="email"
                required
                spellCheck={false}
                type="email"
              />
              <small id="login-email-hint">Use your CircleClick workspace email.</small>
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" placeholder="Enter password" required autoComplete="current-password" />
            </label>
            <button className="button button-primary" type="submit">
              Sign in
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
