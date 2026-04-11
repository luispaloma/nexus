import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// ----------------------------------------------------------------------------
// Fonts
// ----------------------------------------------------------------------------

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// ----------------------------------------------------------------------------
// Metadata
// ----------------------------------------------------------------------------

export const metadata: Metadata = {
  title: {
    default: "Nexus - AI Workflow Automation",
    template: "%s | Nexus",
  },
  description:
    "Automate complex business workflows with AI. Build, run, and monitor intelligent automations powered by Claude.",
  keywords: [
    "AI workflow automation",
    "business process automation",
    "Claude AI",
    "no-code automation",
    "workflow builder",
  ],
  authors: [{ name: "Nexus Team" }],
  creator: "Nexus",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Nexus",
    title: "Nexus - AI Workflow Automation",
    description: "Automate complex business workflows with AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus - AI Workflow Automation",
    description: "Automate complex business workflows with AI",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
};

// ----------------------------------------------------------------------------
// Root Layout
// ----------------------------------------------------------------------------

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={inter.variable}>
        <body className="min-h-screen bg-background font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
