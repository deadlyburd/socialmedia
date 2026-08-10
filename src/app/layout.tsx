import type { Metadata } from "next";
import type React from "react";
import "./globals.css";
import { ClientProviders } from "@/components/client-providers";

export const metadata: Metadata = {
  title: "Social Automations — Agency Content Management Platform",
  description:
    "Manage all your clients' social media content from one dashboard. Upload, schedule, and deliver content — your clients download and post, or connect their accounts to post directly.",
  keywords: [
    "agency content management",
    "social media agency",
    "client content delivery",
    "content calendar",
    "social media management",
    "white-label agency platform",
  ],
  openGraph: {
    title: "Social Automations — Agency Content Management Platform",
    description:
      "Upload content for multiple clients. They download, post, and grow — all from one white-label dashboard.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-background text-foreground">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
