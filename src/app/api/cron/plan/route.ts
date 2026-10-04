import { cronAuthorized, cronNow, db, err, json } from "@/lib/http";
import { runPlanner } from "@/lib/services/planner";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return err("Unauthorized", 401);
  return json({ ok: true, report: await runPlanner(await db(), cronNow(req), { date: new URL(req.url).searchParams.get("date") ?? undefined }) });
}
export const POST = GET;
