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
      ? "Login is not configured. Add SEO_APP_EMAIL, SEO_APP_PASSWORD, and SEO_APP_SESSION_TOKEN in Vercel."
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
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand-lockup">
          <CircleClickLogo className="login-brand-mark" />
          <div>
            <p className="eyebrow">CircleClick SEO</p>
            <h1 id="login-title">Sign in to continue.</h1>
            <p>Use your workspace account to open client analytics, encrypted tools, and AI reports.</p>
          </div>
        </div>

        {message ? (
          <div className="alert" data-type="error" role="status">
            {message}
          </div>
        ) : null}

        <form className="login-form" action="/api/auth/login" method="post">
          <input name="next" type="hidden" value={nextPath} />
          <label>
            Email
            <input name="email" type="email" placeholder="dimitri@circleclick.com" required autoComplete="email" />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="Enter password" required autoComplete="current-password" />
          </label>
          <button className="button button-primary" type="submit">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
