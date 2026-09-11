// Leitura do envelope de webhook da Meta.
//
// O formato é fundo e cheio de arrays que quase sempre têm um item:
// `entry[].changes[].value.messages[]`. Ler isso inline no handler é como se
// acumula `?.[0]?.[0]` até ninguém mais saber o que acontece quando a Meta
// manda dois — e ela manda, em lote, quando o webhook fica fora do ar.
//
// Então aqui a leitura é exaustiva: **todas** as mensagens de todas as
// mudanças, achatadas numa lista. Perder a segunda mensagem de um lote é
// perder a pergunta do candidato sem ninguém notar.

/** Uma mensagem recebida, já sem o envelope. */
export type MensagemRecebida = {
  /** Id da Meta. É a chave de idempotência. */
  waMessageId: string;
  /** E.164 sem "+". */
  de: string;
  /** O número do Connect que recebeu — confere com a conexão. */
  paraPhoneNumberId: string;
  texto: string;
  /** Quando a Meta diz que chegou. */
  recebidaEm: Date;
  /** O nome do perfil do WhatsApp, quando vem. Não é cadastro — é o que a
   *  pessoa pôs no próprio perfil. */
  nomeDoPerfil: string | null;
};

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Extrai as mensagens de texto de um webhook.
 *
 * **Só texto.** Áudio, imagem, documento e localização são ignorados aqui de
 * propósito: responder a um áudio com um robô que não o ouviu é pior que não
 * responder. Eles aparecem em `ignoradas`, para a conversa ser transferida a
 * uma pessoa em vez de sumir.
 */
export function lerMensagens(payload: unknown): {
  mensagens: MensagemRecebida[];
  /** Mensagens que chegaram mas não são texto: id e tipo. */
  ignoradas: { waMessageId: string; tipo: string; de: string }[];
} {
  const mensagens: MensagemRecebida[] = [];
  const ignoradas: { waMessageId: string; tipo: string; de: string }[] = [];

  const raiz = obj(payload);
  if (!raiz) return { mensagens, ignoradas };

  for (const entrada of arr(raiz.entry)) {
    const e = obj(entrada);
    if (!e) continue;
    for (const mudanca of arr(e.changes)) {
      const c = obj(mudanca);
      const valor = c ? obj(c.value) : null;
      if (!valor) continue;

      const phoneNumberId = str(obj(valor.metadata)?.phone_number_id) ?? "";

      // `contacts` traz o nome do perfil, pareado por wa_id.
      const nomePorWaId = new Map<string, string>();
      for (const contato of arr(valor.contacts)) {
        const ct = obj(contato);
        const waId = ct ? str(ct.wa_id) : null;
        const nome = ct ? str(obj(ct.profile)?.name) : null;
        if (waId && nome) nomePorWaId.set(waId, nome);
      }

      for (const mensagem of arr(valor.messages)) {
        const m = obj(mensagem);
        if (!m) continue;
        const id = str(m.id);
        const de = str(m.from);
        if (!id || !de) continue;

        const tipo = str(m.type) ?? "desconhecido";
        if (tipo !== "text") {
          ignoradas.push({ waMessageId: id, tipo, de });
          continue;
        }

        const texto = str(obj(m.text)?.body);
        if (!texto) {
          ignoradas.push({ waMessageId: id, tipo: "texto vazio", de });
          continue;
        }

        // `timestamp` vem em segundos, como string. Data inválida cai para
        // agora: a hora exata importa menos que não perder a mensagem.
        const segundos = Number(str(m.timestamp));
        const recebidaEm = Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : new Date();

        mensagens.push({
          waMessageId: id,
          de,
          paraPhoneNumberId: phoneNumberId,
          texto,
          recebidaEm,
          nomeDoPerfil: nomePorWaId.get(de) ?? null,
        });
      }
    }
  }

  return { mensagens, ignoradas };
}

/**
 * O webhook trouxe só atualização de status (entregue, lido)?
 *
 * A Meta manda isso o tempo todo, e é a maior parte do volume. Distinguir
 * evita tratar "sua mensagem foi lida" como se fosse pergunta de candidato.
 */
export function apenasStatus(payload: unknown): boolean {
  const { mensagens, ignoradas } = lerMensagens(payload);
  if (mensagens.length > 0 || ignoradas.length > 0) return false;

  const raiz = obj(payload);
  if (!raiz) return false;
  for (const entrada of arr(raiz.entry)) {
    for (const mudanca of arr(obj(entrada)?.changes)) {
      const valor = obj(obj(mudanca)?.value);
      if (valor && arr(valor.statuses).length > 0) return true;
    }
  }
  return false;
}
