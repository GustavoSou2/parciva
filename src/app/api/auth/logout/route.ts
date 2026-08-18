import { NextResponse, type NextRequest } from "next/server";
import { deleteSession, logout } from "@/modules/identity";
import { SESSION_COOKIE_NAME } from "@/shared/session-cookie";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await logout(token, { deleteSession });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
