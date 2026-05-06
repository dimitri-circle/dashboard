import Script from "next/script";
import type { CSSProperties } from "react";
import { SeoDashboard } from "@/components/SeoDashboard";

export default function Home() {
  return (
    <>
      <Script src="/reactive-dot-ribbon.js" strategy="afterInteractive" />
      <main className="app-shell">
        <section className="hero" data-tour="hero" aria-labelledby="page-title">
          <reactive-dot-ribbon
            aria-label="Interactive SEO intelligence dot ribbon"
            className="hero-ribbon"
            hint="Move through the dots"
            source="/dots-pattern.webp"
            style={
              {
                "--dot-ribbon-aspect": "auto",
                "--dot-ribbon-min-height": "100%",
                "--dot-ribbon-radius": "30px",
                "--dot-ribbon-hint-right": "78px",
                "--dot-ribbon-hint-bottom": "34px",
              } as CSSProperties
            }
          />
          <div className="hero-copy">
            <p className="eyebrow">SEO Intelligence</p>
            <h1 id="page-title">Connect analytics signals and turn them into decisions.</h1>
            <p>
              A Vercel-ready Next.js and MongoDB MVP for GA4, GTM, Hotjar, OpenAI, and remote HTTP
              MCP connectors.
            </p>
          </div>
        </section>

        <SeoDashboard />
      </main>
    </>
  );
}
