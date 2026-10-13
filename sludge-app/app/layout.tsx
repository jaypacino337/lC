import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One, JetBrains_Mono, Rubik } from "next/font/google";
import { ScrollProgress, SmoothScroll } from "@/components/fx";
import { GooDefs } from "@/components/goo/GooDefs";
import { site } from "@/lib/site";
import "./globals.css";

const bagel = Bagel_Fat_One({ subsets: ["latin"], weight: "400", variable: "--font-bagel" });
const rubik = Rubik({ subsets: ["latin"], variable: "--font-rubik" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

const title = `${site.name}: ${site.tagline.replace(/\.$/, "")}`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: title, template: `%s · ${site.name}` },
  description: site.description,
  icons: { icon: "/icon.svg" },
  openGraph: { title, description: site.description, images: [{ url: "/og.png", width: 1200, height: 630, alt: "SLUDGE: the vat launches coins" }], type: "website", siteName: site.name },
  twitter: { card: "summary_large_image", title, description: site.description, images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#050704" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bagel.variable} ${rubik.variable} ${mono.variable}`}>
      <body className="noise min-h-svh overflow-x-clip bg-bg font-sans text-fg">
        <GooDefs />
        <SmoothScroll />
        <ScrollProgress />
        {children}
      </body>
    </html>
  );
}
