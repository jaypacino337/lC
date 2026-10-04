import { getSessionWallet } from "@/lib/auth/session";
import { json } from "@/lib/http";

export async function GET() {
  return json({ wallet: await getSessionWallet() });
}
