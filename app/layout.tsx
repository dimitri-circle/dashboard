import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Intelligence Dashboard",
  description: "Connect SEO and analytics tools, store secrets securely, and generate AI insights.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script src="/reactive-dot-ribbon.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
