import type { Metadata } from "next";
import { CreateWizard } from "./wizard";

export const metadata: Metadata = { title: "Create influencer" };

export default function CreatePage() {
  return (
    <div className="section py-10">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber">Create influencer</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Give your token a face.</h1>
      </div>
      <CreateWizard />
    </div>
  );
}
