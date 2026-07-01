// Integração com o 41-Tech-Hub: abre um chamado real lá quando alguém sem acesso
// ao Connect 41 pede redefinição de senha ou criação de acesso na tela de login.
// Autenticado por token de serviço (mesmo padrão do endpoint de Ops Center/n8n do
// Hub) — não usa sessão de usuário, porque quem está pedindo isso ainda não tem uma.

export type AccessRequestTipo = "SENHA" | "ACESSO";

export type AccessRequestInput = {
  tipo: AccessRequestTipo;
  nome: string;
  email: string;
  telefone?: string;
  mensagem?: string;
};

export type AccessRequestResult =
  | { ok: true; ticketId: string; ticketUrl: string | null }
  | { ok: false; error: string };

export async function createHubAccessRequest(input: AccessRequestInput): Promise<AccessRequestResult> {
  const baseUrl = process.env.HUB_API_URL;
  const token = process.env.HUB_SERVICE_TOKEN;

  if (!baseUrl || !token) {
    console.error("[createHubAccessRequest] HUB_API_URL/HUB_SERVICE_TOKEN não configurados");
    return { ok: false, error: "Integração com o Hub não configurada. Fale diretamente com o TI." };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/integrations/connect41/access-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        origem: "connect41",
        tipo: input.tipo,
        nome: input.nome,
        email: input.email,
        telefone: input.telefone || undefined,
        mensagem: input.mensagem || undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("[createHubAccessRequest] Hub retornou erro", res.status, body);
      return { ok: false, error: "Não foi possível abrir o chamado no Hub. Tente novamente em instantes." };
    }

    const data = (await res.json()) as { ticketId: string; ticketUrl?: string };
    return { ok: true, ticketId: data.ticketId, ticketUrl: data.ticketUrl ?? null };
  } catch (err) {
    console.error("[createHubAccessRequest]", err);
    return { ok: false, error: "Não foi possível falar com o Hub agora. Tente novamente em instantes." };
  }
}
