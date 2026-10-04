import { DripEdge } from "@/components/goo/DripEdge";
import { TokenGrid } from "@/components/launchpad/TokenGrid";
import { Batches } from "@/components/vat/Batches";
import { Faq } from "@/components/vat/Faq";
import { HowItBrews } from "@/components/vat/HowItBrews";
import { TokenSection } from "@/components/vat/TokenSection";
import { VatFooter } from "@/components/vat/VatFooter";
import { VatHero } from "@/components/vat/VatHero";
import { VatNav } from "@/components/vat/VatNav";

export default function Home() {
  return (
    <>
      <VatNav />
      <main>
        <VatHero />
        <Batches />
        <DripEdge fill="var(--color-surface)" />
        <TokenGrid />
        <HowItBrews />
        <TokenSection />
        <Faq />
      </main>
      <VatFooter />
    </>
  );
}
