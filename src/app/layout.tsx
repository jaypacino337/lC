import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "700", "800"] });
const dm = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

export const metadata: Metadata = {
  title: { default: "GlowPad - turn any token into an AI influencer", template: "%s · GlowPad" },
  description: "Launch or paste a Solana memecoin, describe a character in one sentence, and GlowPad runs its AI influencer on X. Graduate from the bonding curve and it glows up onto TikTok and Instagram.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0c0a17", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${dm.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <Nav />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
