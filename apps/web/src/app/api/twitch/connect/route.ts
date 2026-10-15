import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getTwitchBotConfig, TWITCH_BOT_SCOPES } from "@ellie/database";
import { getAppUser } from "@/lib/session";
import { appUrl } from "@/lib/url";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "ellie_twitch_state";

/** Démarre la connexion OAuth du compte bot Twitch (protection CSRF par paramètre `state`). */
export async function GET() {
  const user = await getAppUser();
  if (user?.role !== "owner") return NextResponse.redirect(appUrl("/login"));
  const config = await getTwitchBotConfig();
  if (!config.clientId) return NextResponse.redirect(appUrl("/dashboard/twitch/settings?error=client"));

  const state = randomBytes(24).toString("hex");
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", appUrl("/api/twitch/callback"));
  url.searchParams.set("scope", TWITCH_BOT_SCOPES.join(" "));
  url.searchParams.set("force_verify", "true");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: appUrl("/").startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/twitch",
  });
  return response;
}
