import path from "path";
import { NextResponse } from "next/server";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

export const dynamic = "force-dynamic";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:5000";

export async function GET() {
  try {
    const resp = await fetch(`${ORCHESTRATOR}/orchestrator-wallet`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Orchestrator ${resp.status}`);
    return NextResponse.json(await resp.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}

export async function POST() {
  try {
    const resp = await fetch(`${ORCHESTRATOR}/orchestrator-wallet/faucet`, { method: "POST", cache: "no-store" });
    if (!resp.ok) throw new Error(`Orchestrator ${resp.status}`);
    return NextResponse.json(await resp.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
