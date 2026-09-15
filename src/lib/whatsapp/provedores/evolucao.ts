// Provedor Evolution API — gateway não oficial, self-hosted, num número comum.
//
// Decidido pelo Kauan em 14/09 para os testes do Recrutamento, antes de ir para
// a BM da Meta. O contrato foi conferido no **código** do tag estável 2.3.7, e
// não só na documentação: a doc oficial contradiz o código em pontos que quebram
// integração (o OpenAPI do sendText ainda pede o formato da v1, e os exemplos de
// erro não batem com o que a API devolve).
//
// ─── Três diferenças da Meta que desenham este arquivo ─────────────────────
//
// 1. **Não assina o webhook.** A autenticação é um cabeçalho secreto que nós
//    escolhemos e a Evolution repete em toda entrega — `webhook.headers`,
//    configurado por instância. O webhook global da Evolution não manda
//    cabeçalho customizado, então ele não serve aqui.
// 2. **Entrega o que não é conversa com candidato**: o que o próprio número
//    digita no celular (`fromMe: true`), grupo, status. Responder a isso é o robô
//    falando sozinho ou num grupo — é descartado antes de qualquer outra coisa.
// 3. **Não tem janela de 24h.** Mas número comum pode ser banido por volume, e a
//    documentação não dá limite nenhum: o teto de respostas por hora de
//    `decisao.ts` é o critério nosso.

import { timingSafeEqual } from "crypto";
import { MAX_CARACTERES_DA_MENSAGEM } from "../decisao";
import type {
  ConfigDoProvedor,
  EventoRecebido,
  MensagemIgnorada,
  MensagemRecebida,
  ProvedorWhatsapp,
  ResultadoDoEnvio,
} from "./tipos";

/** O cabeçalho que a instância da Evolution deve mandar em `webhook.headers`. */
export const CABECALHO_DO_SEGREDO = "x-connect-secret";

const TIMEOUT_MS = 20_000;

/**
 * Tipos que não são pergunta de ninguém: reação, apagar/editar mensagem, voto.
 * Transferir por causa de um 👍 encheria a fila de gente sem motivo.
 */
const TIPOS_SEM_CONVERSA = new Set(["reactionMessage", "protocolMessage", "pollUpdateMessage"]);

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * O id que vai para `WhatsappMessage.waMessageId`, que é **único no banco
 * inteiro**.
 *
 * Com prefixo e instância: o id da Evolution é o do WhatsApp, e a mesma
 * mensagem pode chegar por duas instâncias (dois números nossos na mesma
 * conversa). Sem a instância, a segunda passaria por reentrega e seria
 * descartada.
 */
export function idDaMensagem(instancia: string, id: string): string {
  return `evo:${instancia}:${id}`.slice(0, 120);
}

function lerEvento(payload: unknown): EventoRecebido {
  const mensagens: MensagemRecebida[] = [];
  const ignoradas: MensagemIgnorada[] = [];

  const raiz = obj(payload);
  if (!raiz) return { mensagens, ignoradas, somenteStatus: false };

  // `messages.upsert` no envelope; `MESSAGES_UPSERT` é como o evento é nomeado
  // na configuração. Aceitar os dois custa uma linha.
  const evento = str(raiz.event)?.toLowerCase().replace(/_/g, ".");
  if (evento !== "messages.upsert") {
    // `messages.update` (entregue/lido), `connection.update`, `qrcode.updated`:
    // nada disso é mensagem de candidato.
    return { mensagens, ignoradas, somenteStatus: true };
  }

  const instancia = str(raiz.instance) ?? "";
  const itens = Array.isArray(raiz.data) ? raiz.data : [raiz.data];

  for (const item of itens) {
    const d = obj(item);
    const chave = d ? obj(d.key) : null;
    const id = chave ? str(chave.id) : null;
    const jid = chave ? str(chave.remoteJid) : null;
    if (!d || !chave || !id || !jid) continue;

    // O próprio número digitando no celular. Responder seria o robô conversando
    // consigo mesmo.
    if (chave.fromMe === true) continue;
    // Grupo, status e canal não são conversa com um candidato.
    if (jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) continue;

    const de = (jid.split("@")[0] ?? "").replace(/\D/g, "").slice(0, 20);
    if (!de) continue;
    const waMessageId = idDaMensagem(instancia, id);

    // A Evolution troca `@lid` pelo número (`remoteJidAlt`) quando o WhatsApp
    // informa. Quando não informa, não há telefone para responder — e o
    // candidato ficar sem resposta sem ninguém saber é o pior desfecho. Vai
    // para uma pessoa, com o motivo.
    if (jid.endsWith("@lid")) {
      ignoradas.push({ waMessageId, tipo: "contato sem número visível (@lid)", de });
      continue;
    }

    const tipo = str(d.messageType);
    if (tipo && TIPOS_SEM_CONVERSA.has(tipo)) continue;

    const mensagem = obj(d.message);
    // Na 2.3.7 o `extendedTextMessage` já chega convertido em `conversation`;
    // ler os dois protege contra a conversão mudar de versão.
    const texto = str(mensagem?.conversation) ?? str(obj(mensagem?.extendedTextMessage)?.text);
    const ehTexto = tipo === "conversation" || tipo === "extendedTextMessage" || (!tipo && texto !== null);

    if (!ehTexto) {
      ignoradas.push({ waMessageId, tipo: tipo ?? "desconhecido", de });
      continue;
    }
    if (!texto) {
      ignoradas.push({ waMessageId, tipo: "texto vazio", de });
      continue;
    }

    // Segundos, como número. Data inválida cai para agora: a hora exata importa
    // menos que não perder a mensagem.
    const bruto = d.messageTimestamp;
    const segundos = Number(typeof bruto === "object" && bruto !== null ? obj(bruto)?.low : bruto);
    const recebidaEm = Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : new Date();

    mensagens.push({
      waMessageId,
      de,
      texto,
      recebidaEm,
      nomeDoPerfil: str(d.pushName),
    });
  }

  return { mensagens, ignoradas, somenteStatus: false };
}

async function enviarTexto(config: ConfigDoProvedor, paraE164: string, texto: string): Promise<ResultadoDoEnvio> {
  const base = (config.baseUrl ?? "").replace(/\/+$/, "");
  const instancia = config.instance ?? "";
  const apiKey = config.apiKey ?? "";
  if (!base || !instancia || !apiKey) {
    return { ok: false, erro: "Conexão da Evolution incompleta: URL, instância ou apikey." };
  }

  // Timeout próprio: é um servidor nosso, self-hosted, e servidor parado
  // seguraria o webhook até o provedor desistir e reentregar.
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      // `linkPreview: false` pelo mesmo motivo da Meta: o preview faz o número
      // buscar uma URL que o modelo pode ter tirado de texto de terceiro.
      body: JSON.stringify({ number: paraE164, text: texto, linkPreview: false }),
      signal: controle.signal,
      cache: "no-store",
    });

    const corpo = await res.text();
    if (!res.ok) {
      // Número fora do WhatsApp volta 400 com `response.message[].exists: false`
      // — o corpo vai inteiro para o erro, que é o que quem olha precisa ler.
      return { ok: false, erro: `Evolution ${res.status}: ${corpo.slice(0, 400)}` };
    }

    let id: string | null = null;
    try {
      const json = JSON.parse(corpo) as { key?: { id?: string } };
      id = json.key?.id ?? null;
    } catch {
      // Enviou e não deu para ler o id: sucesso sem rastreio, registrado como `null`.
    }
    return { ok: true, waMessageId: id ? idDaMensagem(instancia, id) : null };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    return { ok: false, erro: abortou ? "tempo esgotado ao chamar a Evolution" : err instanceof Error ? err.message : "falha de rede" };
  } finally {
    clearTimeout(relogio);
  }
}

export const provedorEvolucao: ProvedorWhatsapp = {
  codigo: "whatsapp_recrutamento_evolution",
  politica: { janelaLivreHoras: null, maxCaracteres: MAX_CARACTERES_DA_MENSAGEM },

  // Sem `verificarPosse`: a Evolution não faz verificação por GET.

  autenticar({ cabecalhos }, config) {
    const esperado = config.webhookSecret ?? "";
    if (!esperado) return { ok: false, motivo: "Segredo do webhook não configurado nesta conexão." };
    const recebido = cabecalhos.get(CABECALHO_DO_SEGREDO);
    if (!recebido) return { ok: false, motivo: "Segredo ausente." };

    // Tempo constante, e tamanho antes: `timingSafeEqual` lança com buffers de
    // tamanhos diferentes, e exceção aqui viraria 500.
    const a = Buffer.from(esperado);
    const b = Buffer.from(recebido);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, motivo: "Segredo não confere." };
    }
    return { ok: true };
  },

  lerEvento,
  enviarTexto,
};
