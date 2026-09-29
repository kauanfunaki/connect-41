// A varredura de pendências do Societário — a função "Detector de pendências"
// do protótipo do Marcos, trazida para o Connect em 29/09.
//
// ─── Quem acha, quem ordena ──────────────────────────────────────────────────
//
// O que conta como pendência é decidido AQUI, em código, e não pela IA: é o
// mesmo desenho do protótipo, e é o que impede a IA de inventar pendência.
// A IA recebe a lista pronta, ordena pela urgência e escreve o próximo passo —
// e a chave de cada item é conferida de volta (`lerAvaliacao`), então ela não
// consegue acrescentar item que o código não achou.
//
// ─── O que ficou diferente do protótipo (decisões de 28/09) ─────────────────
//
// - O protótipo abria um processo novo de "Regularização" para cada exigência
//   vencida — mas a exigência já pertence a um processo aberto. Aqui, aprovar
//   **sobe a prioridade do processo que já existe** e avisa o responsável.
// - "Empresa sem CNAE principal" ficou de fora: em 29/09 as 397 empresas ativas
//   estavam sem CNAE no cadastro. Seria um alerta por empresa, todo dia — é
//   lacuna de cadastro, não pendência do setor.
// - Roda por botão, não sozinha.

export type TipoDeSinal =
  | "EXIGENCIA_VENCIDA"
  | "PRAZO_VENCIDO"
  | "PROCESSO_PARADO"
  | "LICENCA_VENCIDA"
  | "LICENCA_VENCENDO";

export type Urgencia = "ALTA" | "MEDIA" | "BAIXA";

export type Sinal = {
  /** Chave estável: é o que a IA devolve e o que a pessoa marca. */
  chave: string;
  tipo: TipoDeSinal;
  /** Uma linha para a tela: "Alteração contratual — BLD Logística". */
  titulo: string;
  /** O fato, escrito pelo código: "exigência vencida há 5 dias: …". */
  detalhe: string;
  processoId: string | null;
  licencaId: string | null;
  /** Dias de atraso (ou, na licença vencendo, dias até vencer). */
  dias: number;
  /** A urgência que o código daria sozinho — a IA pode subir ou descer. */
  urgenciaBase: Urgencia;
};

export type ProcessoParaVarrer = {
  id: string;
  nome: string;
  status: string;
  dueAt: Date | null;
  /** A última vez que algo aconteceu no processo — etapa, protocolo, edição. */
  ultimaMovimentacao: Date;
};

export type ExigenciaParaVarrer = {
  id: string;
  descricao: string;
  dueAt: Date;
  processo: { id: string; nome: string };
};

export type LicencaParaVarrer = {
  id: string;
  tipo: string;
  empresa: string;
  expiresAt: Date;
};

/** Situações em que o processo ainda depende de alguém fazer algo. */
const ATIVOS_COM_TRABALHO = new Set(["EM_ANDAMENTO", "EM_EXIGENCIA"]);
/** Esperando o órgão: parado só depois de bem mais tempo. */
const ESPERANDO_ORGAO = "AGUARDANDO_ORGAO";
/** Estas não entram: encerrados, ou parados de propósito com motivo registrado. */
const FORA = new Set(["CONCLUIDO", "CANCELADO", "INDEFERIDO", "SUSPENSO", "AGUARDANDO_CLIENTE"]);

export const DIAS_PARADO = 10;
export const DIAS_PARADO_NO_ORGAO = 30;
export const DIAS_AVISO_LICENCA = 30;

const DIA = 24 * 60 * 60 * 1000;

/** Dias corridos inteiros entre duas datas (b depois de a dá positivo). */
function diasEntre(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DIA);
}

function recorte(texto: string, max: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

/**
 * As pendências, na ordem em que o código as colocaria. Função pura: recebe o
 * que o servidor leu e o "agora", devolve a lista.
 */
export function sinaisDaVarredura(
  dados: { processos: ProcessoParaVarrer[]; exigencias: ExigenciaParaVarrer[]; licencas: LicencaParaVarrer[] },
  agora: Date,
  /** O limite de parado do setor, o mesmo dos alertas da Gestão (`Sector.alertStalledDays`). */
  diasParado = DIAS_PARADO
): Sinal[] {
  const sinais: Sinal[] = [];

  for (const e of dados.exigencias) {
    const dias = diasEntre(e.dueAt, agora);
    if (dias < 1) continue;
    sinais.push({
      chave: `exig:${e.id}`,
      tipo: "EXIGENCIA_VENCIDA",
      titulo: e.processo.nome,
      detalhe: `Exigência do órgão vencida há ${dias} ${dias === 1 ? "dia" : "dias"}: ${recorte(e.descricao, 160)}`,
      processoId: e.processo.id,
      licencaId: null,
      dias,
      urgenciaBase: "ALTA",
    });
  }

  for (const p of dados.processos) {
    if (FORA.has(p.status)) continue;
    if (p.dueAt) {
      const dias = diasEntre(p.dueAt, agora);
      if (dias >= 1) {
        sinais.push({
          chave: `prazo:${p.id}`,
          tipo: "PRAZO_VENCIDO",
          titulo: p.nome,
          detalhe: `Prazo combinado com o cliente vencido há ${dias} ${dias === 1 ? "dia" : "dias"}.`,
          processoId: p.id,
          licencaId: null,
          dias,
          urgenciaBase: dias >= 7 ? "ALTA" : "MEDIA",
        });
      }
    }
    const limite =
      p.status === ESPERANDO_ORGAO ? Math.max(diasParado, DIAS_PARADO_NO_ORGAO) : ATIVOS_COM_TRABALHO.has(p.status) ? diasParado : null;
    if (limite !== null) {
      const dias = diasEntre(p.ultimaMovimentacao, agora);
      if (dias >= limite) {
        sinais.push({
          chave: `parado:${p.id}`,
          tipo: "PROCESSO_PARADO",
          titulo: p.nome,
          detalhe:
            p.status === ESPERANDO_ORGAO
              ? `Esperando o órgão há ${dias} dias, sem nenhuma movimentação.`
              : `Sem nenhuma movimentação há ${dias} dias.`,
          processoId: p.id,
          licencaId: null,
          dias,
          urgenciaBase: dias >= limite * 2 ? "ALTA" : "MEDIA",
        });
      }
    }
  }

  for (const l of dados.licencas) {
    const dias = diasEntre(agora, l.expiresAt);
    if (dias < 0) {
      sinais.push({
        chave: `lic:${l.id}`,
        tipo: "LICENCA_VENCIDA",
        titulo: `${l.tipo} — ${l.empresa}`,
        detalhe: `Licença vencida há ${-dias} ${dias === -1 ? "dia" : "dias"}.`,
        processoId: null,
        licencaId: l.id,
        dias: -dias,
        urgenciaBase: "ALTA",
      });
    } else if (dias <= DIAS_AVISO_LICENCA) {
      sinais.push({
        chave: `lic:${l.id}`,
        tipo: "LICENCA_VENCENDO",
        titulo: `${l.tipo} — ${l.empresa}`,
        detalhe: dias === 0 ? "Licença vence hoje." : `Licença vence em ${dias} ${dias === 1 ? "dia" : "dias"}.`,
        processoId: null,
        licencaId: l.id,
        dias,
        urgenciaBase: dias <= 7 ? "ALTA" : "MEDIA",
      });
    }
  }

  const peso: Record<Urgencia, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  return sinais.sort((a, b) => peso[a.urgenciaBase] - peso[b.urgenciaBase] || b.dias - a.dias);
}

// ─── O que a IA devolve ──────────────────────────────────────────────────────

export type ItemAvaliado = { chave: string; urgencia: Urgencia; recomendacao: string };
export type AvaliacaoDaVarredura = { confianca: Urgencia; itens: ItemAvaliado[] };

/** O schema da resposta, no modo estrito da OpenAI. As chaves vêm em `enum`. */
export function schemaDaAvaliacao(chaves: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      confianca: {
        type: "string",
        enum: ["ALTA", "MEDIA", "BAIXA"],
        description: "Quão segura a avaliação está, dado o que foi informado",
      },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chave: { type: "string", enum: chaves },
            urgencia: { type: "string", enum: ["ALTA", "MEDIA", "BAIXA"] },
            recomendacao: {
              type: "string",
              description: "O próximo passo, em uma frase curta e prática, em português, sem repetir o fato",
            },
          },
          required: ["chave", "urgencia", "recomendacao"],
          additionalProperties: false,
        },
      },
    },
    required: ["confianca", "itens"],
    additionalProperties: false,
  };
}

const URGENCIAS = new Set<Urgencia>(["ALTA", "MEDIA", "BAIXA"]);

/**
 * Confere a resposta da IA contra a lista do código. Chave que o código não
 * achou é descartada; chave que a IA esqueceu volta com a urgência do código
 * e sem recomendação. Resultado: exatamente um item por sinal, sempre.
 */
export function lerAvaliacao(bruto: unknown, sinais: Sinal[]): AvaliacaoDaVarredura {
  const obj = (bruto && typeof bruto === "object" ? bruto : {}) as { confianca?: unknown; itens?: unknown };
  const porChave = new Map<string, ItemAvaliado>();
  if (Array.isArray(obj.itens)) {
    for (const i of obj.itens) {
      const it = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
      const chave = typeof it.chave === "string" ? it.chave : "";
      if (!sinais.some((s) => s.chave === chave) || porChave.has(chave)) continue;
      const urgencia = URGENCIAS.has(it.urgencia as Urgencia) ? (it.urgencia as Urgencia) : null;
      const recomendacao = typeof it.recomendacao === "string" ? recorte(it.recomendacao, 300) : "";
      const base = sinais.find((s) => s.chave === chave)!;
      porChave.set(chave, { chave, urgencia: urgencia ?? base.urgenciaBase, recomendacao });
    }
  }
  const itens = sinais.map((s) => porChave.get(s.chave) ?? { chave: s.chave, urgencia: s.urgenciaBase, recomendacao: "" });
  const peso: Record<Urgencia, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  const ordem = new Map(sinais.map((s, i) => [s.chave, i]));
  itens.sort((a, b) => peso[a.urgencia] - peso[b.urgencia] || ordem.get(a.chave)! - ordem.get(b.chave)!);
  const confianca = URGENCIAS.has(obj.confianca as Urgencia) ? (obj.confianca as Urgencia) : "MEDIA";
  return { confianca, itens };
}

/** Aprovar sobe a prioridade até ALTA; URGENTE continua URGENTE. */
export function prioridadeDepois(atual: "BAIXA" | "NORMAL" | "ALTA" | "URGENTE"): "ALTA" | "URGENTE" {
  return atual === "URGENTE" ? "URGENTE" : "ALTA";
}

/** O texto que vai para a IA: os fatos, sem nome de pessoa nem dado de cliente além do nome da empresa. */
export function textoParaAIa(sinais: Sinal[], agora: Date): string {
  const hoje = agora.toISOString().slice(0, 10);
  const linhas = sinais.map((s) => `- ${s.chave} | ${s.tipo} | ${s.titulo} | ${s.detalhe}`);
  return `Hoje é ${hoje}. Pendências encontradas no Societário (uma por linha: chave | tipo | processo ou licença | fato):\n${linhas.join("\n")}`;
}

export const SISTEMA_DA_VARREDURA =
  "Você ajuda a coordenação do setor Societário de um escritório de contabilidade a decidir por onde começar. " +
  "Recebe uma lista de pendências já confirmadas pelo sistema (exigência de órgão vencida, prazo combinado com o cliente vencido, " +
  "processo sem movimentação, licença vencida ou perto de vencer). Para CADA chave, dê a urgência (ALTA, MEDIA ou BAIXA) e o próximo " +
  "passo em uma frase prática. Use só as chaves recebidas; não crie pendência nova e não repita o fato na recomendação. " +
  "Exigência vencida e licença vencida costumam ser ALTA, porque o órgão pode arquivar o processo ou multar. Escreva em português simples.";
