// O chamado do Connect também no Hub (17/11/2026, funcionalidade-711). As
// regras sem banco e sem rede, para o teste conferir: a configuração, o que vai
// no envio e quando tentar de novo. Quem envia é ./hub-servidor.ts.
//
// Decidido com o Kauan:
// - só ida: o Connect abre a cópia no Hub e guarda o número e o link de lá; a
//   equipe continua atendendo no Connect;
// - a rota do Hub é /api/integrations/connect41/tickets, com o mesmo token de
//   integração da tela de login (HUB_SERVICE_TOKEN, escopo connect41);
// - de-para pelo nome: categoria e setor que pediu com o mesmo nome no Hub,
//   senão os padrões de lá (quem decide é o Hub);
// - Hub fora: o chamado abre normal no Connect, fica marcado como pendente, e
//   o motor de alertas (a cada 15 minutos) tenta de novo.
//
// Desligado por padrão: só envia com HUB_API_URL, HUB_SERVICE_TOKEN e
// HUB_CHAMADOS_ESCRITORIO (o slug do escritório que manda os chamados, ex.:
// "41tech") no ambiente. Os outros escritórios do Connect não têm Hub.

export type ConfigDoHub = { url: string; token: string; escritorio: string };

export function configDoHub(env: Record<string, string | undefined>): ConfigDoHub | null {
  const url = (env.HUB_API_URL ?? "").trim().replace(/\/+$/, "");
  const token = (env.HUB_SERVICE_TOKEN ?? "").trim();
  const escritorio = (env.HUB_CHAMADOS_ESCRITORIO ?? "").trim();
  if (!url || !token || !escritorio || !/^https?:\/\//.test(url)) return null;
  return { url, token, escritorio };
}

/** O endereço da rota de chamados do Hub. */
export const rotaDoHub = (c: ConfigDoHub) => `${c.url}/api/integrations/connect41/tickets`;

/** Quantas vezes o Connect tenta mandar o mesmo chamado. Com o motor a cada 15 minutos, cobre umas duas horas. */
export const TENTATIVAS_NO_HUB = 8;

export type EnvioAoHub = {
  connectTicketId: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  categoria?: string;
  setorSolicitante?: string;
  setorQueAtende?: string;
  prioridade: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
  solicitante?: { nome: string; email?: string };
  connectUrl?: string;
};

/** A categoria que o Connect usa para "a equipe classifica": não vai como nome, o Hub usa a padrão dele. */
export function montarEnvio(c: {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  categoria: string | null;
  setorSolicitante: string | null;
  setorQueAtende: string | null;
  prioridade: EnvioAoHub["prioridade"];
  solicitante: { nome: string; email: string | null } | null;
  connectUrl: string | null;
}): EnvioAoHub {
  const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
  return {
    connectTicketId: c.id,
    protocolo: c.protocolo,
    titulo: corta(c.titulo.trim() || c.protocolo, 255),
    descricao: corta(c.descricao.trim() || c.titulo.trim() || c.protocolo, 20000),
    ...(c.categoria ? { categoria: corta(c.categoria, 255) } : {}),
    ...(c.setorSolicitante ? { setorSolicitante: corta(c.setorSolicitante, 120) } : {}),
    ...(c.setorQueAtende ? { setorQueAtende: corta(c.setorQueAtende, 120) } : {}),
    prioridade: c.prioridade,
    ...(c.solicitante ? { solicitante: { nome: corta(c.solicitante.nome, 180), ...(c.solicitante.email ? { email: corta(c.solicitante.email, 180) } : {}) } } : {}),
    ...(c.connectUrl && /^https?:\/\//.test(c.connectUrl) ? { connectUrl: corta(c.connectUrl, 500) } : {}),
  };
}

/** A resposta do Hub: o id e o link do chamado de lá. Null quando não veio o que se espera. */
export function lerRespostaDoHub(corpo: unknown): { id: string; url: string | null } | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const { ticketId, ticketUrl } = corpo as { ticketId?: unknown; ticketUrl?: unknown };
  if (typeof ticketId !== "string" || !ticketId.trim() || ticketId.length > 64) return null;
  const url = typeof ticketUrl === "string" && /^https?:\/\//.test(ticketUrl) && ticketUrl.length <= 500 ? ticketUrl : null;
  return { id: ticketId, url };
}

/** O motivo da falha, curto, para guardar no chamado e para o log. */
export function motivoDaFalhaNoHub(status: number | null, corpo: unknown, erro?: unknown): string {
  if (status === null) {
    const msg = erro instanceof Error ? (erro.name === "TimeoutError" || erro.name === "AbortError" ? "o Hub não respondeu a tempo" : erro.message) : "falha de rede";
    return `Sem resposta do Hub: ${msg}`.slice(0, 300);
  }
  const detalhe = typeof corpo === "object" && corpo !== null && typeof (corpo as { error?: unknown }).error === "string" ? `: ${(corpo as { error: string }).error}` : "";
  return `O Hub respondeu ${status}${detalhe}`.slice(0, 300);
}
