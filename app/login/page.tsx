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
      <section className="login-card" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">SEO Intelligence</p>
          <h1 id="login-title">Sign in</h1>
          <p>Use your workspace email and password to access client analytics, encrypted tools, and AI reports.</p>
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
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
