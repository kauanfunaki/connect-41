// A conexão HTTPS com o Serpro, com o certificado do contratante (mTLS).
//
// Separada do cliente para o teste trocar por uma resposta pronta: sem contrato
// não há ambiente de teste do Serpro com dado real, e o fluxo inteiro (token,
// chamada, registro, teto) precisa rodar mesmo assim.
//
// Desde 20/10/2026 a resposta traz três cabeçalhos: o 204 do Sitfis manda o
// novo tempo de espera no ETag, e o 304 (Sitfis, termo de autorização) manda o
// que está em cache no ETag, sem corpo. Na demonstração não há certificado, e
// a conexão sai sem mTLS.

import https from "node:https";

export type RequisicaoHttps = {
  url: string;
  cabecalhos: Record<string, string>;
  corpo: string;
  /** null = sem mTLS (a demonstração do Serpro). */
  pfx: Buffer | null;
  senha: string;
  timeoutMs: number;
};
/** Os cabeçalhos da resposta que o Integra Contador usa, quando vieram. */
export type CabecalhosDaResposta = Partial<Record<"etag" | "cache-control" | "expires", string>>;
export type RespostaHttps = { status: number; corpo: string; cabecalhos: CabecalhosDaResposta };
export type Transporte = (r: RequisicaoHttps) => Promise<RespostaHttps>;

const CABECALHOS_LIDOS = ["etag", "cache-control", "expires"] as const;

export function lerCabecalhos(h: Record<string, string | string[] | undefined>): CabecalhosDaResposta {
  const saida: CabecalhosDaResposta = {};
  for (const nome of CABECALHOS_LIDOS) {
    const v = h[nome];
    if (v !== undefined) saida[nome] = Array.isArray(v) ? v.join(", ") : v;
  }
  return saida;
}

export const transporteHttps: Transporte = (r) =>
  new Promise((resolve, reject) => {
    const u = new URL(r.url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: { ...r.cabecalhos, "Content-Length": Buffer.byteLength(r.corpo) },
        ...(r.pfx ? { pfx: r.pfx, passphrase: r.senha } : {}),
        timeout: r.timeoutMs,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c: Buffer) => partes.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString("utf8"), cabecalhos: lerCabecalhos(res.headers) })
        );
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    req.end(r.corpo);
  });
