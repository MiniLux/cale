import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Ouvre /api/health pour vérifier que la base de données est bien branchée. */
export async function GET() {
  const result = await healthCheck();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
