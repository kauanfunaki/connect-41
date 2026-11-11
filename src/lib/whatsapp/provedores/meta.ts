// Provedor Meta WhatsApp Cloud API — o número oficial, na BM.
//
// É o código de 11/09 atrás da interface, sem mudança de comportamento: a
// assinatura continua em `../assinatura.ts` e a leitura do envelope em
// `../payload.ts`, com os testes que já tinham.

import { verificarAssinaturaDaMeta, responderDesafio } from "../assinatura";
import { lerMensagens, apenasStatus } from "../payload";
import { JANELA_LIVRE_EM_HORAS, MAX_CARACTERES_DA_MENSAGEM } from "../decisao";
import type { ConfigDoProvedor, MidiaBaixada, MidiaParaEnviar, ModeloParaEnviar, ProvedorWhatsapp, ResultadoDoEnvio } from "./tipos";

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

// ─── Mídia e modelos (Atendimento do escritório, 11/11/2026) ─────────────────
//
// Só o número do escritório usa: as funções ficam exportadas e entram no
// provedor do Atendimento (`./index.ts`), não no do Recrutamento, que segue
// como estava.

const GRAPH = `https://graph.facebook.com/${VERSAO_DA_API}`;
const TIMEOUT_DA_MIDIA_MS = 40_000;

async function comTempo<T>(trabalho: (sinal: AbortSignal) => Promise<T>, ms = TIMEOUT_DA_MIDIA_MS): Promise<T> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ms);
  try {
    return await trabalho(controle.signal);
  } finally {
    clearTimeout(relogio);
  }
}

/** Baixa a mídia recebida: o id dá a URL temporária, e a URL dá os bytes (as duas com o token). */
export async function baixarMidiaDaMeta(config: ConfigDoProvedor, referencia: unknown): Promise<MidiaBaixada> {
  const id = referencia && typeof referencia === "object" ? (referencia as { id?: unknown }).id : null;
  if (typeof id !== "string" || !id) return { ok: false, erro: "mídia sem id" };
  const auth = { Authorization: `Bearer ${config.accessToken ?? ""}` };
  try {
    return await comTempo(async (signal) => {
      const meta = await fetch(`${GRAPH}/${encodeURIComponent(id)}`, { headers: auth, signal, cache: "no-store" });
      const info = (await meta.json().catch(() => null)) as { url?: string; mime_type?: string } | null;
      if (!meta.ok || !info?.url) return { ok: false as const, erro: `Meta ${meta.status} ao localizar a mídia` };
      const arquivo = await fetch(info.url, { headers: auth, signal, cache: "no-store" });
      if (!arquivo.ok) return { ok: false as const, erro: `Meta ${arquivo.status} ao baixar a mídia` };
      return { ok: true as const, bytes: Buffer.from(await arquivo.arrayBuffer()), mimetype: info.mime_type ?? null, nomeDoArquivo: null };
    });
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "falha de rede" };
  }
}

/** O `type` da mensagem na Meta pelo tipo do arquivo. */
export function tipoDeMidiaDaMeta(mimetype: string): "image" | "video" | "audio" | "document" {
  if (mimetype === "image/jpeg" || mimetype === "image/png") return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "document";
}

/** Manda um arquivo: primeiro sobe para a Meta (`/media`), depois manda a mensagem com o id. */
export async function enviarMidiaPelaMeta(config: ConfigDoProvedor, paraE164: string, midia: MidiaParaEnviar): Promise<ResultadoDoEnvio> {
  const auth = { Authorization: `Bearer ${config.accessToken ?? ""}` };
  try {
    return await comTempo(async (signal) => {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", midia.mimetype);
      form.append("file", new Blob([new Uint8Array(midia.bytes)], { type: midia.mimetype }), midia.nomeDoArquivo);
      const subida = await fetch(`${GRAPH}/${config.phoneNumberId ?? ""}/media`, { method: "POST", headers: auth, body: form, signal, cache: "no-store" });
      const corpoDaSubida = await subida.text();
      if (!subida.ok) return { ok: false as const, erro: `Meta ${subida.status}: ${corpoDaSubida.slice(0, 300)}` };
      const mediaId = (JSON.parse(corpoDaSubida) as { id?: string }).id;
      if (!mediaId) return { ok: false as const, erro: "a Meta não devolveu o id do arquivo" };

      const tipo = tipoDeMidiaDaMeta(midia.mimetype);
      const conteudo: Record<string, unknown> = { id: mediaId };
      // Áudio não leva legenda na Meta; documento leva também o nome do arquivo.
      if (tipo !== "audio" && midia.legenda) conteudo.caption = midia.legenda;
      if (tipo === "document") conteudo.filename = midia.nomeDoArquivo;
      const res = await fetch(`${GRAPH}/${config.phoneNumberId ?? ""}/messages`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: paraE164, type: tipo, [tipo]: conteudo }),
        signal,
        cache: "no-store",
      });
      const corpo = await res.text();
      if (!res.ok) return { ok: false as const, erro: `Meta ${res.status}: ${corpo.slice(0, 300)}` };
      let waMessageId: string | null = null;
      try {
        waMessageId = (JSON.parse(corpo) as { messages?: { id?: string }[] }).messages?.[0]?.id ?? null;
      } catch {
        // sucesso sem rastreio
      }
      return { ok: true as const, waMessageId };
    });
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "falha de rede" };
  }
}

/** Manda um modelo aprovado, com as variáveis do corpo na ordem. */
export async function enviarModeloPelaMeta(config: ConfigDoProvedor, paraE164: string, modelo: ModeloParaEnviar): Promise<ResultadoDoEnvio> {
  try {
    return await comTempo(async (signal) => {
      const res = await fetch(`${GRAPH}/${config.phoneNumberId ?? ""}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.accessToken ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: paraE164,
          type: "template",
          template: {
            name: modelo.nome,
            language: { code: modelo.idioma },
            ...(modelo.parametros.length
              ? { components: [{ type: "body", parameters: modelo.parametros.map((text) => ({ type: "text", text })) }] }
              : {}),
          },
        }),
        signal,
        cache: "no-store",
      });
      const corpo = await res.text();
      if (!res.ok) return { ok: false as const, erro: `Meta ${res.status}: ${corpo.slice(0, 300)}` };
      let waMessageId: string | null = null;
      try {
        waMessageId = (JSON.parse(corpo) as { messages?: { id?: string }[] }).messages?.[0]?.id ?? null;
      } catch {
        // sucesso sem rastreio
      }
      return { ok: true as const, waMessageId };
    }, 20_000);
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
