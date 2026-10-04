import { cronAuthorized, cronNow, db, err, json } from "@/lib/http";
import { runGraduationCheck } from "@/lib/services/graduation";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return err("Unauthorized", 401);
  return json({ ok: true, report: await runGraduationCheck(await db(), fetch, cronNow(req)) });
}
export const POST = GET;
