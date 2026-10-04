import { err, json, requireOwner } from "@/lib/http";
import { removeAccount } from "@/lib/services/accounts";
import { getConnector } from "@/lib/social";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; platform: string }> }) {
  const { id, platform } = await ctx.params;
  if (!getConnector(platform)) return err("Unknown platform", 404);
  const o = await requireOwner(id);
  if (o instanceof Response) return o;
  await removeAccount(o.d, o.inf.id, platform);
  return json({ ok: true });
}
