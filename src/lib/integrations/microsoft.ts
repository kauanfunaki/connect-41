// Integração com Microsoft Teams/Outlook via OAuth2 (Azure AD v2 + Microsoft
// Graph), mesmo espírito do google.ts: fetch cru, sem SDK. Requer
// MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET e MICROSOFT_REDIRECT_URI —
// MICROSOFT_TENANT_ID é opcional, default "common" (contas pessoais + de
// organização).

const TENANT = process.env.MICROSOFT_TENANT_ID || "common";
const AUTH_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const GRAPH_EVENTS_URL = "https://graph.microsoft.com/v1.0/me/events";
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";
const SCOPES = ["offline_access", "openid", "email", "Calendars.ReadWrite", "OnlineMeetings.ReadWrite"].join(" ");

export function isMicrosoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI);
}

export function getMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type MicrosoftTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeMicrosoftCode(code: string): Promise<MicrosoftTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
      grant_type: "authorization_code",
      code,
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao trocar código Microsoft: ${await res.text()}`);
  return res.json();
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao renovar token Microsoft: ${await res.text()}`);
  return res.json();
}

export async function fetchMicrosoftEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GRAPH_ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const me = await res.json();
    return me.mail ?? me.userPrincipalName ?? null;
  } catch {
    return null;
  }
}

export async function createTeamsMeetingEvent(
  accessToken: string,
  input: { title: string; startAt: Date; endAt: Date }
): Promise<{ externalEventId: string; meetingUrl: string }> {
  const res = await fetch(GRAPH_EVENTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: input.title,
      start: { dateTime: input.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: input.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar evento no Microsoft Teams: ${await res.text()}`);
  const event = await res.json();
  const meetingUrl = event.onlineMeeting?.joinUrl;
  if (!meetingUrl) throw new Error("Evento criado, mas a Microsoft não retornou o link do Teams.");
  return { externalEventId: event.id, meetingUrl };
}

// Atualiza título/horário do evento já criado (edição de reunião) — best-effort,
// mesmo racional do updateGoogleMeetEvent.
export async function updateTeamsMeetingEvent(
  accessToken: string,
  externalEventId: string,
  input: { title: string; startAt: Date; endAt: Date }
): Promise<void> {
  const res = await fetch(`${GRAPH_EVENTS_URL}/${externalEventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: input.title,
      start: { dateTime: input.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: input.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
    }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar evento no Microsoft Teams: ${await res.text()}`);
}
