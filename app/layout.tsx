import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CircleClick SEO Dashboard",
  description: "Connect SEO and analytics tools, store secrets securely, and generate AI insights.",
  icons: {
    icon: [{ url: "/circleclick-icon.svg", type: "image/svg+xml" }],
    shortcut: "/circleclick-icon.svg",
    apple: "/circleclick-icon.svg",
  },
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
