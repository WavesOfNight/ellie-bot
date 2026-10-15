import { NextResponse, type NextRequest } from "next/server";
import { getTwitchBotSecrets, saveTwitchBotTokens } from "@ellie/database";
import { getAppUser } from "@/lib/session";
import { appUrl } from "@/lib/url";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "ellie_twitch_state";

function back(query: string) {
  const response = NextResponse.redirect(appUrl(`/dashboard/twitch/settings?${query}`));
  response.cookies.delete({ name: STATE_COOKIE, path: "/api/twitch" });
  return response;
}

/** Retour OAuth Twitch : échange le code contre des jetons, identifie le compte et les stocke chiffrés. */
export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (user?.role !== "owner") return NextResponse.redirect(appUrl("/login"));

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return back("error=state");

  const secrets = await getTwitchBotSecrets();
  if (!secrets.clientId || !secrets.clientSecret) return back("error=client");

  try {
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: secrets.clientId,
        client_secret: secrets.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: appUrl("/api/twitch/callback"),
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) return back("error=token");
    const tokens = (await tokenResponse.json()) as { access_token: string; refresh_token: string; expires_in: number };

    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      headers: { "Client-Id": secrets.clientId, Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (!userResponse.ok) return back("error=user");
    const login = ((await userResponse.json()) as { data: Array<{ login: string }> }).data[0]?.login;
    if (!login) return back("error=user");

    await saveTwitchBotTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      username: login,
    });
    return back("connected=1");
  } catch (error) {
    console.error("[Ellie panel] connexion Twitch :", error instanceof Error ? error.message : error);
    return back("error=network");
  }
}
