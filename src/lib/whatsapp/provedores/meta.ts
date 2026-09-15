// Provedor Meta WhatsApp Cloud API — o número oficial, na BM.
//
// É o código de 11/09 atrás da interface, sem mudança de comportamento: a
// assinatura continua em `../assinatura.ts` e a leitura do envelope em
// `../payload.ts`, com os testes que já tinham.

import { verificarAssinaturaDaMeta, responderDesafio } from "../assinatura";
import { lerMensagens, apenasStatus } from "../payload";
import { JANELA_LIVRE_EM_HORAS, MAX_CARACTERES_DA_MENSAGEM } from "../decisao";
import type { ConfigDoProvedor, ProvedorWhatsapp, ResultadoDoEnvio } from "./tipos";

const VERSAO_DA_API = "v21.0";

async function enviarTexto(config: ConfigDoProvedor, paraE164: string, texto: string): Promise<ResultadoDoEnvio> {
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSAO_DA_API}/${config.phoneNumberId ?? ""}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: paraE164,
        type: "text",
        // `preview_url: false`: link em mensagem de recrutamento não precisa
        // de cartão, e o preview faz a Meta buscar a URL — uma requisição a
        // mais, saindo do nosso número, para um endereço que o modelo pode
        // ter tirado de um texto de terceiro.
        text: { body: texto, preview_url: false },
      }),
    });

    const corpo = await res.text();
    if (!res.ok) {
      return { ok: false, erro: `Meta ${res.status}: ${corpo.slice(0, 400)}` };
    }

    let waMessageId: string | null = null;
    try {
      const json = JSON.parse(corpo) as { messages?: { id?: string }[] };
      waMessageId = json.messages?.[0]?.id ?? null;
    } catch {
      // Enviou e não deu para ler o id: é sucesso sem rastreio, e o `null`
      // registra isso em vez de fingir que falhou.
    }
    return { ok: true, waMessageId };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "falha de rede" };
  }
}

export const provedorMeta: ProvedorWhatsapp = {
  codigo: "whatsapp_recrutamento",
  politica: { janelaLivreHoras: JANELA_LIVRE_EM_HORAS, maxCaracteres: MAX_CARACTERES_DA_MENSAGEM },

  verificarPosse(url, config) {
    const r = responderDesafio({
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
      verifyToken: config.verifyToken ?? "",
    });
    return r.ok ? { ok: true, resposta: r.challenge } : r;
  },

  autenticar({ corpoBruto, cabecalhos }, config) {
    return verificarAssinaturaDaMeta(corpoBruto, cabecalhos.get("x-hub-signature-256"), config.appSecret ?? "");
  },

  lerEvento(payload) {
    if (apenasStatus(payload)) return { mensagens: [], ignoradas: [], somenteStatus: true };
    const { mensagens, ignoradas } = lerMensagens(payload);
    return { mensagens, ignoradas, somenteStatus: false };
  },

  enviarTexto,
};
