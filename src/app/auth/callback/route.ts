import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl, client, recoveryCookie, sessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const recovery = searchParams.get("flow") === "recovery" || type === "recovery";
  const db = await client();
  let accepted = false;
  if (tokenHash && (type === "email" || type === "recovery")) {
    const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
    accepted = !error;
  } else if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    accepted = !error;
  }
  if (accepted && recovery) {
    (await cookies()).set(recoveryCookie, "1", { ...sessionCookie(), maxAge: 900 });
  }
  const path = !accepted ? "/login?msg=link" : recovery ? "/nova-senha" : "/app";
  return NextResponse.redirect(new URL(path, appUrl()));
}
