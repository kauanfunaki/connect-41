// O leitor de rubricas eSocial x sistema do DP 2 (12/11/2026, fase 3e), pedido
// no questionário do DP. Duas conferências:
//
// 1. Cada rubrica do escritório contra o que vai no eSocial: as incidências
//    marcadas no Connect (INSS, IRRF, FGTS) batem com os códigos de incidência
//    do S-1010? A natureza combina com o tipo (provento × desconto) e com o
//    papel da rubrica no motor?
// 2. A tabela de rubricas que já está no eSocial (os XML do S-1010, baixados do
//    portal ou exportados da Domínio) contra a do Connect: o que só existe de
//    um lado e o que está diferente.
//
// Puro, sem banco: roda no navegador (o XML não sai da máquina) e nos testes.

import { incidencias, type RubricaEsocial } from "./eventos";
import { TABELA_DE_RUBRICAS } from "./leiaute";

export type Gravidade = "erro" | "atencao";

export type Divergencia = { codigo: string; nome: string; campo: string; texto: string; gravidade: Gravidade };

/**
 * A natureza (Tabela 3) de cada papel do motor, só onde o código é inequívoco.
 * Papéis fora daqui (13º parcelado, verbas de rescisão, sem vínculo) dependem
 * de escolha do escritório e não são cobrados.
 */
export const NATUREZA_DO_PAPEL: Readonly<Record<string, string>> = {
  SALARIO: "1000",
  DSR: "1002",
  HE50: "1003",
  HE100: "1003",
  INSALUBRIDADE: "1202",
  PERICULOSIDADE: "1203",
  NOTURNO: "1205",
  SALARIO_FAMILIA: "1409",
  DECIMO_SEGUNDA: "5001",
  AVISO_INDENIZADO: "6001",
  INSS: "9201",
  INSS_DECIMO: "9201",
  IRRF: "9203",
  IRRF_DECIMO: "9203",
  FALTA: "9207",
  PENSAO: "9213",
  VALE_TRANSPORTE: "9216",
};

/** Códigos de incidência que significam "entra na base" (Tabelas 21 a 23). */
const CP_TRIBUTAVEL = new Set(["11", "12", "13", "14", "15", "16"]);
const IRRF_TRIBUTAVEL = new Set(["11", "12", "13", "14", "15"]);
const FGTS_TRIBUTAVEL = new Set(["11", "12", "21"]);

const NOME_DO_TIPO: Record<string, string> = { "1": "provento", "2": "desconto", "3": "informativa", "4": "informativa dedutora" };
const TIPO_DO_SISTEMA: Record<RubricaEsocial["tipo"], string> = { PROVENTO: "1", DESCONTO: "2", INFORMATIVA: "3" };

// ─── 1. O sistema contra o eSocial ──────────────────────────────────────────

export function conferirRubrica(r: RubricaEsocial): Divergencia[] {
  const d: Divergencia[] = [];
  const add = (campo: string, texto: string, gravidade: Gravidade) => d.push({ codigo: r.codigo, nome: r.nome, campo, texto, gravidade });
  const nat = r.naturezaEsocial ?? "";

  if (!/^\d{4}$/.test(nat)) {
    const sugerida = r.papel ? NATUREZA_DO_PAPEL[r.papel] : undefined;
    add("Natureza", `Sem natureza do eSocial (Tabela 3): o S-1010 não sai.${sugerida ? ` Para esta rubrica, a natureza é ${sugerida}.` : ""}`, "erro");
  }
  else {
    if (nat.startsWith("9") && r.tipo === "PROVENTO") add("Natureza", `Natureza ${nat} é de desconto, mas a rubrica é provento.`, "atencao");
    if (/^[1-6]/.test(nat) && r.tipo === "DESCONTO") add("Natureza", `Natureza ${nat} é de remuneração, mas a rubrica é desconto.`, "atencao");
    const esperada = r.papel ? NATUREZA_DO_PAPEL[r.papel] : undefined;
    if (esperada && esperada !== nat) add("Natureza", `Para esta rubrica do motor, o eSocial espera a natureza ${esperada} (está ${nat}).`, "atencao");
  }

  const inc = incidencias(r);
  if (r.incideInss !== CP_TRIBUTAVEL.has(inc.cp) && !(inc.cp === "31" || inc.cp === "32" || inc.cp === "51")) {
    add("INSS", r.incideInss ? `O Connect desconta INSS, mas o código ${inc.cp} diz que não incide.` : `O código ${inc.cp} diz que incide INSS, mas o Connect não desconta.`, "erro");
  }
  if (r.incideIrrf !== IRRF_TRIBUTAVEL.has(inc.irrf) && !["31", "32", "33", "34", "35", "51", "52", "53", "54", "55"].includes(inc.irrf)) {
    add("IRRF", r.incideIrrf ? `O Connect tributa no IRRF, mas o código ${inc.irrf} diz que não.` : `O código ${inc.irrf} diz que é tributável no IRRF, mas o Connect não tributa.`, "erro");
  }
  if (r.incideFgts !== FGTS_TRIBUTAVEL.has(inc.fgts)) {
    add("FGTS", r.incideFgts ? `O Connect recolhe FGTS, mas o código ${inc.fgts} diz que não incide.` : `O código ${inc.fgts} diz que incide FGTS, mas o Connect não recolhe.`, "erro");
  }
  for (const c of inc.conferir) add(c, `Código de ${c} sugerido pelo Connect: confira e grave na rubrica.`, "atencao");
  return d;
}

// ─── 2. A tabela do eSocial contra a do Connect ─────────────────────────────

export type RubricaDoEsocial = {
  codigo: string;
  tabela: string;
  inicio: string | null;
  nome: string;
  natureza: string | null;
  /** 1 provento, 2 desconto, 3 informativa, 4 informativa dedutora. */
  tipo: string | null;
  codIncCP: string | null;
  codIncIRRF: string | null;
  codIncFGTS: string | null;
};

const tag = (xml: string, nome: string) => {
  const m = new RegExp(`<(?:\\w+:)?${nome}>([^<]*)</(?:\\w+:)?${nome}>`).exec(xml);
  return m ? m[1].trim() : null;
};

const entidades = (s: string | null) =>
  s === null ? null : s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * As rubricas de um ou mais S-1010 (evento solto, lote, retorno do download
 * do portal). Cada inclusão ou alteração vira uma linha; a última de cada
 * código vence. Exclusões tiram o código da lista.
 */
export function lerS1010(xml: string): RubricaDoEsocial[] {
  const porChave = new Map<string, RubricaDoEsocial>();
  const blocos = xml.split(/<(?:\w+:)?evtTabRubrica\b/).slice(1);
  for (const bloco of blocos) {
    const exclusao = /<(?:\w+:)?exclusao>/.test(bloco);
    const ide = /<(?:\w+:)?ideRubrica>([\s\S]*?)<\/(?:\w+:)?ideRubrica>/.exec(bloco)?.[1];
    if (!ide) continue;
    const codigo = tag(ide, "codRubr");
    if (!codigo) continue;
    const tabela = tag(ide, "ideTabRubr") ?? "";
    const chave = `${tabela}|${codigo}`;
    if (exclusao) {
      porChave.delete(chave);
      continue;
    }
    const dados = /<(?:\w+:)?dadosRubrica>([\s\S]*?)<\/(?:\w+:)?dadosRubrica>/.exec(bloco)?.[1] ?? "";
    porChave.set(chave, {
      codigo,
      tabela,
      inicio: tag(ide, "iniValid"),
      nome: entidades(tag(dados, "dscRubr")) ?? "",
      natureza: tag(dados, "natRubr"),
      tipo: tag(dados, "tpRubr"),
      codIncCP: tag(dados, "codIncCP"),
      codIncIRRF: tag(dados, "codIncIRRF"),
      codIncFGTS: tag(dados, "codIncFGTS"),
    });
  }
  return [...porChave.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

export type Comparacao = {
  divergencias: Divergencia[];
  soNoSistema: RubricaEsocial[];
  soNoEsocial: RubricaDoEsocial[];
  iguais: number;
  /** As tabelas de rubricas (ideTabRubr) encontradas no eSocial, quando diferentes da do Connect. */
  outrasTabelas: string[];
};

export function compararComEsocial(sistema: readonly RubricaEsocial[], doEsocial: readonly RubricaDoEsocial[]): Comparacao {
  const porCodigo = new Map<string, RubricaDoEsocial>();
  for (const r of doEsocial) if (!porCodigo.has(r.codigo) || r.tabela === TABELA_DE_RUBRICAS) porCodigo.set(r.codigo, r);
  const divergencias: Divergencia[] = [];
  const soNoSistema: RubricaEsocial[] = [];
  let iguais = 0;
  for (const r of sistema) {
    const e = porCodigo.get(r.codigo);
    if (!e) {
      soNoSistema.push(r);
      continue;
    }
    porCodigo.delete(r.codigo);
    const inc = incidencias(r);
    const antes = divergencias.length;
    const add = (campo: string, noSistema: string | null, noEsocial: string | null) =>
      divergencias.push({ codigo: r.codigo, nome: r.nome, campo, texto: `Connect: ${noSistema ?? "vazio"} · eSocial: ${noEsocial ?? "vazio"}`, gravidade: "erro" });
    if ((r.naturezaEsocial ?? null) !== e.natureza) add("Natureza", r.naturezaEsocial, e.natureza);
    const tipo = TIPO_DO_SISTEMA[r.tipo];
    if (e.tipo && e.tipo !== tipo && !(tipo === "3" && e.tipo === "4")) add("Tipo", NOME_DO_TIPO[tipo], NOME_DO_TIPO[e.tipo] ?? e.tipo);
    if (e.codIncCP !== null && e.codIncCP !== inc.cp) add("Incidência INSS", inc.cp, e.codIncCP);
    if (e.codIncIRRF !== null && e.codIncIRRF !== inc.irrf) add("Incidência IRRF", inc.irrf, e.codIncIRRF);
    if (e.codIncFGTS !== null && e.codIncFGTS !== inc.fgts) add("Incidência FGTS", inc.fgts, e.codIncFGTS);
    if (divergencias.length === antes) iguais++;
  }
  const outrasTabelas = [...new Set(doEsocial.map((r) => r.tabela).filter((t) => t && t !== TABELA_DE_RUBRICAS))];
  return { divergencias, soNoSistema, soNoEsocial: [...porCodigo.values()], iguais, outrasTabelas };
}
