// A conexão HTTPS com o Serpro, com o certificado do contratante (mTLS).
//
// Separada do cliente para o teste trocar por uma resposta pronta: sem contrato
// não há ambiente de teste do Serpro com dado real, e o fluxo inteiro (token,
// chamada, registro, teto) precisa rodar mesmo assim.

import https from "node:https";

export type RequisicaoHttps = {
  url: string;
  cabecalhos: Record<string, string>;
  corpo: string;
  pfx: Buffer;
  senha: string;
  timeoutMs: number;
};
export type RespostaHttps = { status: number; corpo: string };
export type Transporte = (r: RequisicaoHttps) => Promise<RespostaHttps>;

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
        pfx: r.pfx,
        passphrase: r.senha,
        timeout: r.timeoutMs,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c: Buffer) => partes.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString("utf8") }));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    req.end(r.corpo);
  });
