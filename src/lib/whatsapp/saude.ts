// A saúde de uma conexão de WhatsApp, para a tela.
//
// ─── O problema que isto resolve ────────────────────────────────────────────
//
// Número caído não avisa. A Evolution para de entregar webhook, o candidato
// escreve e não recebe nada, e o setor descobre dias depois, pelo silêncio. Esta
// regra junta os sinais que o Connect tem — o estado que o provedor informa, a
// última falha de envio e as conversas que o robô deveria ter respondido e não
// respondeu — num veredito que cabe num olhar.
//
// Função pura: a consulta ao provedor e ao banco é de `data.ts`, e o relógio
// entra por parâmetro.

import type { EstadoDaConexao } from "./provedores/tipos";

/** O robô responde em segundos. Passado isto, mensagem sem resposta é sinal de algo parado. */
export const MINUTOS_SEM_RESPOSTA_DO_ROBO = 10;

/** Falha de envio mais antiga que isto já não diz nada sobre agora. */
export const HORAS_DE_FALHA_RECENTE = 2;

export type NivelDeSaude = "ok" | "atencao" | "problema";

export type SinaisDaConexao = {
  /** Ligada na vitrine de integrações. */
  ligada: boolean;
  /** O que o provedor informou. `null` = o provedor não tem consulta de estado. */
  estado: EstadoDaConexao | null;
  ultimaFalha: { em: Date; erro: string | null } | null;
  /** Conversas com o robô cuja última mensagem é do candidato e está sem resposta há tempo demais. */
  esperandoRobo: number;
};

export type SaudeDaConexao = {
  nivel: NivelDeSaude;
  titulo: string;
  motivos: string[];
};

const PESO: Record<NivelDeSaude, number> = { ok: 0, atencao: 1, problema: 2 };

export function avaliarConexao(s: SinaisDaConexao, agora: Date): SaudeDaConexao {
  const achados: { nivel: NivelDeSaude; titulo: string; motivo: string }[] = [];

  if (!s.ligada) {
    achados.push({
      nivel: "problema",
      titulo: "Conexão desligada",
      motivo: "O assistente não responde enquanto a conexão estiver desligada na tela de integrações.",
    });
  }

  if (s.estado) {
    if (s.estado.estado === "desconectado") {
      achados.push({
        nivel: "problema",
        titulo: "Número desconectado",
        motivo: "O WhatsApp saiu da instância: leia o QR code de novo no Manager da Evolution.",
      });
    } else if (s.estado.estado === "indisponivel") {
      achados.push({
        nivel: "problema",
        titulo: "Provedor não respondeu",
        motivo: `Não deu para consultar o número${s.estado.detalhe ? `: ${s.estado.detalhe}` : "."}`,
      });
    } else if (s.estado.estado === "conectando") {
      achados.push({
        nivel: "atencao",
        titulo: "Número reconectando",
        motivo: "A instância está tentando reconectar. Se não passar em alguns minutos, leia o QR code de novo.",
      });
    }
  }

  if (s.ultimaFalha && agora.getTime() - s.ultimaFalha.em.getTime() <= HORAS_DE_FALHA_RECENTE * 3_600_000) {
    achados.push({
      nivel: "atencao",
      titulo: "Envio falhou",
      motivo: `A última falha de envio foi há pouco${s.ultimaFalha.erro ? `: ${s.ultimaFalha.erro}` : "."}`,
    });
  }

  if (s.esperandoRobo > 0) {
    achados.push({
      nivel: "atencao",
      titulo: "Candidatos sem resposta",
      motivo:
        s.esperandoRobo === 1
          ? `1 conversa com o assistente está sem resposta há mais de ${MINUTOS_SEM_RESPOSTA_DO_ROBO} minutos.`
          : `${s.esperandoRobo} conversas com o assistente estão sem resposta há mais de ${MINUTOS_SEM_RESPOSTA_DO_ROBO} minutos.`,
    });
  }

  if (achados.length === 0) {
    return {
      nivel: "ok",
      titulo: s.estado ? "Conectado" : "Ligada",
      motivos: s.estado ? [] : ["Este provedor não informa o estado do número."],
    };
  }

  // O título é o do achado mais grave; os motivos vêm todos, do mais grave ao
  // mais leve — quem olha precisa saber de tudo, mas lê primeiro o que para.
  const ordenados = [...achados].sort((a, b) => PESO[b.nivel] - PESO[a.nivel]);
  return {
    nivel: ordenados[0]!.nivel,
    titulo: ordenados[0]!.titulo,
    motivos: ordenados.map((a) => a.motivo),
  };
}

/**
 * Quantas conversas o robô deveria ter respondido e não respondeu.
 *
 * Conta só as que estão **com o robô** (sem transferência nem opt-out): as
 * transferidas esperam uma pessoa, e isso a lista de conversas já mostra.
 */
export function contarEsperandoRobo(
  conversas: {
    handoffAt: Date | null;
    optedOutAt: Date | null;
    ultimaEntradaEm: Date | null;
    ultimaSaidaEm: Date | null;
  }[],
  agora: Date
): number {
  const limite = agora.getTime() - MINUTOS_SEM_RESPOSTA_DO_ROBO * 60_000;
  return conversas.filter((c) => {
    if (c.handoffAt || c.optedOutAt || !c.ultimaEntradaEm) return false;
    if (c.ultimaEntradaEm.getTime() > limite) return false;
    return !c.ultimaSaidaEm || c.ultimaSaidaEm.getTime() < c.ultimaEntradaEm.getTime();
  }).length;
}
