// Autenticação do webhook da Meta.
//
// Esta rota é pública — a Meta chama de fora, sem sessão. Quem autentica é a
// assinatura, e só ela: o id na URL não é segredo, e tratá-lo como se fosse é
// como um webhook vira porta aberta para qualquer um inventar candidato,
// mensagem e conversa dentro do Connect.
//
// A Meta assina o corpo BRUTO com HMAC-SHA256 usando o **App Secret** do app
// na BM, e manda em `X-Hub-Signature-256: sha256=<hex>`. Reserializar o JSON
// muda a assinatura — por isso a rota lê `req.text()` antes de qualquer parse.
//
// Diferente do Chatwoot, a Meta **não manda timestamp**. Então não há janela
// anti-replay aqui, e a proteção contra reentrega é outra: o `waMessageId`
// único em `WhatsappMessage`. É o mesmo mecanismo que cobre a reentrega
// legítima (a Meta reenvia quando não recebe 200 rápido), e cobre as duas.

import { createHmac, timingSafeEqual } from "crypto";

export type VerificacaoDeAssinatura = { ok: true } | { ok: false; motivo: string };

export function verificarAssinaturaDaMeta(
  corpoBruto: string,
  cabecalho: string | null,
  appSecret: string
): VerificacaoDeAssinatura {
  if (!cabecalho) return { ok: false, motivo: "Assinatura ausente." };
  if (!appSecret) return { ok: false, motivo: "App Secret não configurado nesta conexão." };

  const esperado = `sha256=${createHmac("sha256", appSecret).update(corpoBruto, "utf8").digest("hex")}`;

  const a = Buffer.from(esperado);
  const b = Buffer.from(cabecalho);
  // Comparar tamanho antes é obrigatório: `timingSafeEqual` lança com buffers
  // de tamanhos diferentes, e um throw aqui viraria 500 — que para a Meta é
  // "tente de novo", e para nós é uma rota que grita a cada lixo recebido.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "Assinatura não confere." };
  }
  return { ok: true };
}

/**
 * A verificação de posse que a Meta faz uma vez, ao cadastrar o webhook.
 *
 * Ela chama com `hub.mode=subscribe`, `hub.verify_token` e `hub.challenge`, e
 * espera o challenge de volta em texto puro. O `verifyToken` é escolhido por
 * quem configura — vive cifrado na integração, como qualquer segredo.
 */
export function responderDesafio(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  verifyToken: string;
}): { ok: true; challenge: string } | { ok: false; motivo: string } {
  if (params.mode !== "subscribe") return { ok: false, motivo: "Modo inesperado." };
  if (!params.challenge) return { ok: false, motivo: "Sem challenge." };
  if (!params.token || !params.verifyToken) return { ok: false, motivo: "Token ausente." };

  // Comparação em tempo constante também aqui: é um segredo compartilhado, e
  // comparar com `===` vaza o prefixo correto por tempo de resposta.
  const a = Buffer.from(params.token);
  const b = Buffer.from(params.verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "Token de verificação não confere." };
  }
  return { ok: true, challenge: params.challenge };
}
