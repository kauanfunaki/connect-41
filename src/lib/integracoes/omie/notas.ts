// Nota do Omie → linha do acervo fiscal (Fase 1b da integração).
//
// Escrito a partir da resposta real de `produtos/nfconsultar` `ListarNF`, vista
// na prévia da BLD em 23/09 — não só da documentação:
//   { pagina, total_de_paginas, registros, total_de_registros, nfCadastro: [ {
//       compl: { cChaveNFe, nIdNF },
//       ide: { nNF: "000006014", serie, dEmi: "dd/mm/aaaa", hEmi: "hh:mm:ss",
//              tpNF: "0"|"1", mod: "55", tpAmb, dCan, cDeneg },
//       nfDestInt: { cRazao, cnpj_cpf: "00.000.000/0000-00" },
//       total: { ICMSTot: { vNF } } } ] }
//
// Só entra nota **emitida pela empresa** (`tpNF = "1"`, saída). A de entrada
// — compra do cliente — já chega pelo SPED, com o XML; trazer pelo Omie também
// seria a mesma nota por dois caminhos. E a conferência é pelo CNPJ dentro da
// chave: nota com chave de outro emitente não é da empresa desta conta.

import { chaveDeDeduplicacao } from "@/lib/fiscal/documentos";
import type { FiscalDocumentSituation } from "@/generated/prisma/enums";

export type NotaDoOmie = {
  dedupKey: string;
  tipo: "NFE" | "NFCE";
  chaveAcesso: string;
  numero: string;
  serie: string | null;
  emitidoEm: Date;
  competencia: string;
  emitenteDocumento: string;
  destinatarioNome: string | null;
  destinatarioDocumento: string | null;
  valor: number | null;
  situacao: FiscalDocumentSituation;
  omieIdNF: string | null;
};

/** Por que a nota ficou de fora — vira contador da execução, não erro. */
export type MotivoDeFora =
  | "entrada" // tpNF 0: compra, chega pelo SPED
  | "homologacao" // ambiente de teste do Omie
  | "denegada" // SEFAZ recusou: não existe como nota
  | "outro_modelo" // nem 55 nem 65
  | "sem_chave"
  | "outro_emitente" // chave de outro CNPJ
  | "data_invalida";

/** Como cada motivo aparece na mensagem da importação. */
const MOTIVO_NA_MENSAGEM: Record<MotivoDeFora, string> = {
  entrada: "entradas (chegam pelo SPED)",
  homologacao: "de homologação",
  denegada: "denegadas",
  outro_modelo: "de outro modelo",
  sem_chave: "sem chave de acesso",
  outro_emitente: "de outro CNPJ emitente (filial não cadastrada no Connect?)",
  data_invalida: "com data inválida",
};

/**
 * O resumo de uma importação, para gente. Diz o motivo de cada nota que ficou
 * de fora — "709 de fora" sem motivo parece erro quando é só compra.
 */
export function mensagemDaImportacao(c: Record<string, number>): string {
  const n = (k: string) => c[k] ?? 0;
  const partes = [
    `${n("novas")} novas no acervo`,
    n("reconhecidas") ? `${n("reconhecidas")} já estavam (SPED)` : null,
    n("atualizadas") ? `${n("atualizadas")} atualizadas` : null,
    n("de_filiais") ? `${n("de_filiais")} delas de filiais, gravadas na filial` : null,
    ...(Object.keys(MOTIVO_NA_MENSAGEM) as MotivoDeFora[])
      .filter((m) => n(`fora_${m}`) > 0)
      .map((m) => `${n(`fora_${m}`)} ${MOTIVO_NA_MENSAGEM[m]}`),
  ].filter(Boolean);
  const semSaida = n("lidas") > 0 && n("novas") + n("reconhecidas") + n("atualizadas") === 0;
  return (
    `${n("lidas")} notas lidas em ${n("paginas")} página(s): ${partes.join(", ")}.` +
    (semSaida ? " Nenhuma nota de saída emitida pela empresa nesta conta." : "")
  );
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const digitos = (v: unknown): string => texto(v).replace(/\D/g, "");

/**
 * "dd/mm/aaaa" + "hh:mm:ss" no horário de Brasília → instante. O Omie manda
 * data e hora soltas, sem fuso; o fuso é o do emitente, e o Brasil não tem
 * horário de verão desde 2019, então -03:00 fixo. Hora ausente vira meio-dia.
 */
export function instanteDoOmie(data: unknown, hora: unknown): Date | null {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(data));
  if (!d) return null;
  const h = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto(hora));
  const hms = h ? `${h[1]}:${h[2]}:${h[3] ?? "00"}` : "12:00:00";
  const instante = new Date(`${d[3]}-${d[2]}-${d[1]}T${hms}-03:00`);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

/** Valor em reais: número como veio, ou texto com vírgula ou ponto decimal. */
function valorDe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Traduz uma nota da lista, ou diz por que ela não entra.
 *
 * `cnpjs` são os CNPJs (só dígitos) das empresas que esta conta do Omie
 * alimenta: a da conta e as filiais cadastradas dela no Connect. Matriz e
 * filiais costumam dividir a mesma base do Omie (25/09: Multi, BLD), e a nota
 * da filial é da filial — quem chama escolhe a empresa pelo `emitenteDocumento`.
 */
export function mapearNotaOmie(item: unknown, cnpjs: string | ReadonlySet<string>): NotaDoOmie | { fora: MotivoDeFora } {
  const doGrupo = typeof cnpjs === "string" ? new Set([cnpjs]) : cnpjs;
  const nota = obj(item);
  const ide = obj(nota.ide);
  const compl = obj(nota.compl);

  if (texto(ide.tpNF) !== "1") return { fora: "entrada" };
  if (texto(ide.tpAmb) === "2") return { fora: "homologacao" };
  if (texto(ide.cDeneg) && texto(ide.cDeneg) !== "N") return { fora: "denegada" };

  const modelo = texto(ide.mod);
  const tipo = modelo === "55" || modelo === "" ? "NFE" : modelo === "65" ? "NFCE" : null;
  if (!tipo) return { fora: "outro_modelo" };

  const chaveAcesso = digitos(compl.cChaveNFe);
  if (chaveAcesso.length !== 44) return { fora: "sem_chave" };
  // Posições 7 a 20 da chave são o CNPJ do emitente.
  const emitenteDocumento = chaveAcesso.slice(6, 20);
  if (!doGrupo.has(emitenteDocumento)) return { fora: "outro_emitente" };

  const emitidoEm = instanteDoOmie(ide.dEmi, ide.hEmi);
  if (!emitidoEm) return { fora: "data_invalida" };
  // Mês da data como o Omie escreve (horário de Brasília), e não do instante em
  // UTC: nota das 22h do último dia do mês é daquele mês.
  const [, mes, ano] = texto(ide.dEmi).split("/");
  const competencia = `${ano}-${mes}`;

  // Número sem os zeros à esquerda do Omie ("000006014"), como o SPED grava.
  const numero = texto(ide.nNF).replace(/^0+(?=\d)/, "");
  const serie = texto(ide.serie) || null;
  const dedupKey = chaveDeDeduplicacao({ tipo, chaveAcesso, emitenteDocumento, serie, numero, competencia });
  if (!dedupKey) return { fora: "sem_chave" };

  const dest = obj(nota.nfDestInt);
  const idNF = texto(compl.nIdNF);
  return {
    dedupKey,
    tipo,
    chaveAcesso,
    numero: numero || chaveAcesso.slice(25, 34).replace(/^0+(?=\d)/, ""),
    serie,
    emitidoEm,
    competencia,
    emitenteDocumento,
    destinatarioNome: texto(dest.cRazao) || null,
    destinatarioDocumento: digitos(dest.cnpj_cpf) || null,
    valor: valorDe(obj(obj(nota.total).ICMSTot).vNF),
    // Data de cancelamento é nota cancelada — fato de fora, como no SPED. Só
    // data de verdade conta: campo vazio ou zerado não cancela nada.
    situacao: instanteDoOmie(ide.dCan, null) ? "CANCELADA" : "AUTORIZADA",
    omieIdNF: idNF && idNF !== "0" ? idNF : null,
  };
}

/** A página da resposta de `ListarNF`: as notas e quantas páginas há. */
export function paginaDoListarNF(corpo: unknown): { notas: unknown[]; totalDePaginas: number } {
  const o = obj(corpo);
  const notas = Array.isArray(o.nfCadastro) ? o.nfCadastro : [];
  const total = Number(o.total_de_paginas);
  return { notas, totalDePaginas: Number.isFinite(total) && total > 0 ? Math.floor(total) : 1 };
}
