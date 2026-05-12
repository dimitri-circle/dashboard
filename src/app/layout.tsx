import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CircleClick Competitive Analysis",
  description: "Evidence-backed competitive analysis for startups and agencies.",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Script src="/dot-ribbon.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
