import path from "path";
import { NextRequest, NextResponse } from "next/server";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

export const dynamic = "force-dynamic";

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:5000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resp = await fetch(`${ORCHESTRATOR}/plan-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!resp.ok) throw new Error(`Orchestrator ${resp.status}`);
    return NextResponse.json(await resp.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
