// XML fiscal recusado pelo leitor — a parte pura (06/11/2026).
//
// O `lerXmlFiscal` (./xml.ts) lê as duas famílias de NFS-e que cobrem quase
// tudo, ABRASF e o padrão nacional, e recusa o resto com um motivo. A recusa
// aparecia para quem enviou e se perdia: ninguém sabia quantas notas caem fora
// do padrão, nem de quais municípios. Este módulo tira do XML recusado as
// **pistas** que permitem contar — o tipo provável e o município — sem tentar
// lê-lo. Ler o resíduo é o passo seguinte, com IA e revisão de gente; chutar
// campo aqui seria o mesmo erro que o leitor evita.
//
// Tudo por expressão regular, e não por parser: o arquivo recusado pode nem ser
// XML bem formado, e é justamente o que precisa ser contado.

import type { MotivoRecusa } from "./xml";

export type TipoProvavel = "nfse" | "nfe" | "cte" | "desconhecido";

export type PistasDoXml = {
  /** O nome da primeira tag, sem o prefixo de namespace. */
  raiz: string | null;
  tipoProvavel: TipoProvavel;
  /** Código IBGE de 7 dígitos: o do órgão que emitiu primeiro, depois o do prestador. É pista, não leitura. */
  municipio: string | null;
};

/** Acima disso o XML não é guardado — a linha fica, sem o conteúdo. */
export const TAMANHO_MAXIMO_GUARDADO = 1024 * 1024;

export const ROTULO_DO_TIPO: Record<TipoProvavel, string> = {
  nfse: "NFS-e",
  nfe: "NF-e",
  cte: "CT-e",
  desconhecido: "Não identificado",
};

export const ROTULO_DO_MOTIVO: Record<MotivoRecusa, string> = {
  xml_invalido: "XML inválido",
  documento_desconhecido: "Layout não reconhecido",
  chave_ausente: "Sem chave de acesso",
  chave_invalida: "Chave de acesso inválida",
  campo_obrigatorio_ausente: "Campo obrigatório ausente",
};

export function rotuloDoMotivo(motivo: string): string {
  return (ROTULO_DO_MOTIVO as Record<string, string>)[motivo] ?? motivo;
}

// Os dois primeiros dígitos do código IBGE são a UF.
const UF_DO_IBGE: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

export function codigoDeMunicipioValido(codigo: string): boolean {
  return /^\d{7}$/.test(codigo) && codigo.slice(0, 2) in UF_DO_IBGE;
}

/** "PR · 4106902". Sem a tabela de nomes do IBGE no Connect, a UF já situa. */
export function rotuloDoMunicipio(codigo: string | null): string {
  if (!codigo) return "Sem município no XML";
  const uf = UF_DO_IBGE[codigo.slice(0, 2)];
  return uf ? `${uf} · ${codigo}` : codigo;
}

// Prefixo de namespace opcional antes do nome da tag.
const NS = "(?:[A-Za-z_][\\w.-]*:)?";

function raizDoXml(xml: string): string | null {
  const m = xml.replace(/^﻿/, "").match(/<(?![?!])(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)/);
  return m ? m[1].slice(0, 80) : null;
}

const RAIZ_NFE = /^(nfeProc|NFe|procNFe)$/i;
const RAIZ_CTE = /^(cteProc|CTe|CTeOS|cteOSProc|procCTe)$/i;
// Nomes de tag que só aparecem em NFS-e, nas famílias que se conhece e nas
// variações municipais mais comuns (RPS, "NotaFiscalServico", a DPS nacional).
const TAG_DE_NFSE = new RegExp(`<${NS}(?:[\\w.-]*nfse[\\w.-]*|[\\w.-]*nfs-e[\\w.-]*|rps|[\\w.-]*Rps|infRps|NotaFiscalServico[\\w.-]*|NotaFiscalEletronicaServico[\\w.-]*|NotasFiscais|DPS|infDPS)[\\s>/]`, "i");

function tipoDoXml(xml: string, raiz: string | null): TipoProvavel {
  if (raiz && RAIZ_NFE.test(raiz)) return "nfe";
  if (raiz && RAIZ_CTE.test(raiz)) return "cte";
  if (TAG_DE_NFSE.test(xml)) return "nfse";
  // Raiz desconhecida mas com o envelope da NF-e ou do CT-e dentro (lote, retorno de consulta).
  if (new RegExp(`<${NS}infNFe[\\s>]`).test(xml)) return "nfe";
  if (new RegExp(`<${NS}infCte[\\s>]`, "i").test(xml)) return "cte";
  return "desconhecido";
}

/** O primeiro código IBGE válido dentro da tag `bloco`, nas tags de município. */
function municipioNoBloco(xml: string, bloco: string): string | null {
  const abre = new RegExp(`<${NS}${bloco}\\b[^>]*>`, "ig");
  for (let m = abre.exec(xml); m; m = abre.exec(xml)) {
    const fecha = new RegExp(`</${NS}${bloco}\\s*>`, "i").exec(xml.slice(m.index + m[0].length));
    const trecho = fecha ? xml.slice(m.index + m[0].length, m.index + m[0].length + fecha.index) : xml.slice(m.index, m.index + 5000);
    const achado = primeiroCodigo(trecho, /^(CodigoMunicipio|codigoMunicipio|CodMunicipio|codMunicipio|cMun|cMunicipio|MunicipioIbge|CodigoIbge|codigoIbge)$/i);
    if (achado) return achado;
  }
  return null;
}

/** O primeiro código IBGE válido numa tag cujo nome passa em `nome`. */
function primeiroCodigo(xml: string, nome: RegExp): string | null {
  const par = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b[^>]*>\s*(\d{7})\s*<\//g;
  for (let m = par.exec(xml); m; m = par.exec(xml)) {
    if (nome.test(m[1]) && codigoDeMunicipioValido(m[2])) return m[2];
  }
  return null;
}

/**
 * O município do XML, na ordem em que ele diz quem **emitiu** — é o sistema da
 * prefeitura emissora que define o layout, e é por ele que o resíduo se agrupa:
 * 1. o órgão gerador do ABRASF; 2. o `cLocEmi` do padrão nacional e nomes
 * parecidos; 3. o endereço do prestador; 4. qualquer tag de município.
 */
function municipioDoXml(xml: string): string | null {
  return (
    municipioNoBloco(xml, "OrgaoGerador") ??
    primeiroCodigo(xml, /^(cLocEmi|CodigoMunicipioGerador|MunicipioGerador|cMunEmi|CodMunicipioEmissor|MunicipioEmissor)$/i) ??
    municipioNoBloco(xml, "(?:PrestadorServico|Prestador|prest|emit)") ??
    primeiroCodigo(xml, /mun|ibge|cLoc/i)
  );
}

export function pistasDoXml(xml: string): PistasDoXml {
  const raiz = raizDoXml(xml);
  return { raiz, tipoProvavel: tipoDoXml(xml, raiz), municipio: municipioDoXml(xml) };
}

export type LinhaPorMunicipio = { municipio: string | null; motivo: string; quantidade: number; ultima: Date };

export type ResumoDoMunicipio = {
  municipio: string | null;
  arquivos: number;
  ultima: Date;
  /** O motivo que mais apareceu; o leitor costuma recusar o mesmo layout pelo mesmo campo. */
  motivoPrincipal: string;
};

/** Junta as contagens por (município, motivo) em uma linha por município, a maior primeiro. */
export function resumirPorMunicipio(linhas: LinhaPorMunicipio[]): ResumoDoMunicipio[] {
  const porMunicipio = new Map<string, { municipio: string | null; arquivos: number; ultima: Date; motivos: Map<string, number> }>();
  for (const l of linhas) {
    const chave = l.municipio ?? "";
    const atual = porMunicipio.get(chave) ?? { municipio: l.municipio, arquivos: 0, ultima: l.ultima, motivos: new Map<string, number>() };
    atual.arquivos += l.quantidade;
    if (l.ultima > atual.ultima) atual.ultima = l.ultima;
    atual.motivos.set(l.motivo, (atual.motivos.get(l.motivo) ?? 0) + l.quantidade);
    porMunicipio.set(chave, atual);
  }
  return [...porMunicipio.values()]
    .map(({ municipio, arquivos, ultima, motivos }) => ({
      municipio,
      arquivos,
      ultima,
      motivoPrincipal: [...motivos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    // Sem município vai para o fim: é o que menos ajuda a decidir por onde começar.
    .sort((a, b) => (a.municipio === null ? 1 : 0) - (b.municipio === null ? 1 : 0) || b.arquivos - a.arquivos || (a.municipio ?? "").localeCompare(b.municipio ?? ""));
}
