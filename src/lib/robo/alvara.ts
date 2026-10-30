// O alvará de Curitiba pelo robô (30/10/2026) — o que fazer com o que a
// máquina devolve. O levantamento da página está em
// `societario/orgaos/alvara-curitiba.ts` (nada pendente desde 24/09); aqui
// mora só a decisão, para ser testada sem navegador.
//
// A máquina devolve o texto da página e, quando achou, o PDF da aba nova. Ela
// não interpreta nada além de "achou o botão de imprimir": a leitura do número
// e da data fica do lado de cá, onde há teste.

import { z } from "zod";
import { ACEITE_ANTES_DE_IMPRIMIR, inscricaoValida, lerObservacoes, normalizarInscricao } from "@/lib/societario/orgaos/alvara-curitiba";
import { arquivar } from "@/lib/societario/arquivamento";

/** Licença que o robô sabe imprimir: o alvará, como o setor escreve o tipo. */
export function ehAlvara(tipoDaLicenca: string): boolean {
  return tipoDaLicenca
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .includes("alvara");
}

/** A cidade do cadastro vazia passa: muita empresa ainda não tem cidade preenchida. */
export function cidadeAceita(cidade: string | null): boolean {
  if (!cidade?.trim()) return true;
  return cidade.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() === "curitiba";
}

export type PedidoDoAlvara =
  | { ok: true; dados: { inscricao: string } }
  | { ok: false; erro: string };

/** Pode pedir ao robô? Confere o que dá para conferir antes de a máquina abrir o site. */
export function pedidoDoAlvara(p: { tipoDaLicenca: string; revogada: boolean; inscricao: string | null; cidade: string | null }): PedidoDoAlvara {
  if (!ehAlvara(p.tipoDaLicenca)) return { ok: false, erro: "O robô só imprime alvará." };
  if (p.revogada) return { ok: false, erro: "A licença está revogada." };
  if (!cidadeAceita(p.cidade)) return { ok: false, erro: "O robô só conhece o alvará de Curitiba, e a empresa é de outra cidade." };
  if (!inscricaoValida(p.inscricao)) {
    return { ok: false, erro: "A empresa não tem inscrição municipal de 8 dígitos no cadastro. Preencha na ficha da empresa e peça de novo." };
  }
  return { ok: true, dados: { inscricao: normalizarInscricao(p.inscricao!) } };
}

/** O que a máquina devolve no `resultado` da tarefa de alvará. */
export const resultadoDoAlvaraSchema = z.object({
  /** O que a máquina viu: o botão de imprimir, a mensagem de não encontrado, ou outra tela. */
  tela: z.enum(["encontrado", "nao_encontrado", "outra"]),
  /** O texto visível da página, para ler número e data e para quem for conferir. */
  texto: z.string().max(20_000).default(""),
  /** O texto do aceite que estava na página, verbatim. */
  aceite: z.string().max(2_000).nullish(),
  /** A máquina marcou o "Li e concordo" e imprimiu. */
  aceiteMarcado: z.boolean().default(false),
});

export type ResultadoDoAlvara = z.infer<typeof resultadoDoAlvaraSchema>;

const espacos = (t: string) => t.replace(/\s+/g, " ").trim();

/** O texto do aceite da página é o que o escritório decidiu aceitar em 15/09? */
export function aceiteConfere(textoDaPagina: string | null | undefined): boolean {
  return !!textoDaPagina && espacos(textoDaPagina).includes(espacos(ACEITE_ANTES_DE_IMPRIMIR));
}

/** O número do alvará no topo da página ("1.700.407"), ou `null`. */
export function numeroDoAlvara(texto: string): string | null {
  const m = /Alvar[áa][^\d]{0,60}?(\d{1,3}(?:\.\d{3})+)/i.exec(texto);
  return m ? m[1]! : null;
}

export type DecisaoDoAlvara =
  | { tipo: "guardar"; numero: string | null; protocolo: string | null; emitidoEm: Date | null }
  | { tipo: "pessoa"; motivo: string };

/**
 * O que fazer com a devolução.
 *
 * Só há um caminho que conclui: a página mostrou o alvará, o aceite era o
 * mesmo texto de 15/09, foi marcado, e o PDF veio. Qualquer outra coisa vai
 * para uma pessoa — "não encontrado" e "sem alvará" são divergência entre a
 * Junta e a prefeitura (decisão de 15/09), e aceite com texto novo precisa de
 * alguém reler antes de o robô assumir a declaração.
 */
export function decidirAlvara(r: ResultadoDoAlvara, temPdf: boolean): DecisaoDoAlvara {
  if (r.tela === "nao_encontrado") {
    return { tipo: "pessoa", motivo: "A prefeitura não achou alvará para esta inscrição. Confira na Junta se o alvará já saiu." };
  }
  if (r.tela === "outra") {
    return { tipo: "pessoa", motivo: "A página do alvará mostrou uma tela que o robô não conhece. Confira à mão." };
  }
  if (!aceiteConfere(r.aceite)) {
    return { tipo: "pessoa", motivo: "O texto do aceite de acessibilidade mudou na página. Alguém precisa reler antes de o robô aceitar em nome do cliente." };
  }
  if (!r.aceiteMarcado || !temPdf) {
    return { tipo: "pessoa", motivo: "O alvará apareceu, mas o PDF não veio. Imprima à mão." };
  }
  const obs = lerObservacoes(r.texto);
  return { tipo: "guardar", numero: numeroDoAlvara(r.texto), protocolo: obs?.protocolo ?? null, emitidoEm: obs ? dataBr(obs.emitidoEm) : null };
}

function dataBr(ddmmaaaa: string): Date | null {
  const [d, m, a] = ddmmaaaa.split("/").map(Number);
  if (!d || !m || !a) return null;
  const data = new Date(Date.UTC(a, m - 1, d, 12));
  return Number.isNaN(data.getTime()) ? null : data;
}

/** O nome do PDF, pela convenção do setor (`<EMPRESA> - Alvará de Funcionamento <ano>.pdf`). */
export function nomeDoPdfDoAlvara(empresaNome: string, ano: number): string {
  return `${arquivar({ empresaNome, ano, tipo: "Alvará de Funcionamento", orgao: "Alvará" }).nome}.pdf`;
}
