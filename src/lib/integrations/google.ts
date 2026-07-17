// Integração com Google Calendar/Meet via OAuth2 (authorization code flow) —
// fetch cru, sem SDK (googleapis é pesado pro que precisamos: criar 1 evento
// com Meet e trocar/renovar token). Requer GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI configurados no ambiente — sem
// isso, connect/callback retornam erro claro em vez de falhar silenciosamente.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"].join(" ");

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao trocar código Google: ${await res.text()}`);
  return res.json();
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Falha ao renovar token Google: ${await res.text()}`);
  return res.json();
}

// Decodifica o e-mail da conta a partir do id_token (JWT), sem validar assinatura
// — uso é só exibição ("conectado como fulano@gmail.com"), não autenticação.
export function decodeGoogleEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    return json.email ?? null;
  } catch {
    return null;
  }
}

export async function createGoogleMeetEvent(
  accessToken: string,
  input: { title: string; startAt: Date; endAt: Date }
): Promise<{ externalEventId: string; meetingUrl: string }> {
  const res = await fetch(`${CALENDAR_EVENTS_URL}?conferenceDataVersion=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.title,
      start: { dateTime: input.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: input.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar evento no Google Calendar: ${await res.text()}`);
  const event = await res.json();
  const meetingUrl = event.hangoutLink ?? event.conferenceData?.entryPoints?.[0]?.uri;
  if (!meetingUrl) throw new Error("Evento criado, mas o Google não retornou o link do Meet.");
  return { externalEventId: event.id, meetingUrl };
}

// Atualiza título/horário do evento já criado (edição de reunião) — best-effort,
// chamado só quando o editor tem o próprio token Google válido (normalmente o
// criador da reunião); falha aqui não deve impedir a edição salvar no Connect.
export async function updateGoogleMeetEvent(
  accessToken: string,
  externalEventId: string,
  input: { title: string; startAt: Date; endAt: Date }
): Promise<void> {
  const res = await fetch(`${CALENDAR_EVENTS_URL}/${externalEventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.title,
      start: { dateTime: input.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: input.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
    }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar evento no Google Calendar: ${await res.text()}`);
}
