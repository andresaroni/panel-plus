import { NextResponse } from "next/server";

import { getRequestsVersion } from "@/lib/request-version";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  return NextResponse.json(
    { version: await getRequestsVersion() },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
