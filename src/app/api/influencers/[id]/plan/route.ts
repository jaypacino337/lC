import { json, requireOwner } from "@/lib/http";
import { runPlanner } from "@/lib/services/planner";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const o = await requireOwner((await ctx.params).id);
  if (o instanceof Response) return o;
  const report = await runPlanner(o.d, new Date(), { influencerId: o.inf.id });
  return json({ report });
}
