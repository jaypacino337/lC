import type { Metadata } from "next";
import { Bubbles } from "@/components/goo/Bubbles";
import { BrewForm } from "@/components/vat/BrewForm";
import { VatFooter } from "@/components/vat/VatFooter";
import { VatNav } from "@/components/vat/VatNav";

export const metadata: Metadata = {
  title: "Brew a coin",
  description: "Drop the ingredients in the vat (name, ticker, image, dev buy) and pour a real pump.fun coin, signed by your own Phantom wallet.",
};

export default function BrewPage() {
  return (
    <>
      <VatNav />
      <main className="relative isolate overflow-hidden px-4 pt-10 pb-32 sm:pt-16">
        <div aria-hidden="true" className="absolute -top-40 left-1/2 -z-10 size-[60rem] -translate-x-1/2 animate-blob rounded-full bg-brand/8 blur-[120px]" />
        <BrewForm />
        <Bubbles rise={200} count={18} className="-z-10 opacity-70" pool="var(--color-surface)" />
      </main>
      <VatFooter />
    </>
  );
}
