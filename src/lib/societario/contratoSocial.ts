// Leitura do contrato social pela IA — a "importação" do protótipo do Marcos,
// trazida em 29/09 no recorte decidido em 28/09: **contrato social → sócios**.
//
// Por que só isso: o cadastro da empresa já vem da Receita pelo CNPJ, e o
// quadro de sócios também (`qsa.ts`) — mas a Receita não informa participação,
// quotas nem capital de cada sócio. É exatamente o que está no contrato, e é
// o que a viabilidade e o distrato precisam.
//
// A IA só lê. O que ela leu vira proposta na fila do setor; o coordenador
// revisa linha a linha e aprova. Este arquivo é a parte pura: o formato da
// resposta, a conferência do que veio, e o plano contra o cadastro atual.

import { lerDocumentoFiscal } from "@/lib/companyTaxId";
import { nomeComparavel } from "@/lib/societario/qsa";

const DUAS_CASAS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ATE_DUAS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const ATE_QUATRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const INTEIRO = new Intl.NumberFormat("pt-BR");

export type SocioLido = {
  nome: string;
  /** Só dígitos, e só se for CPF ou CNPJ válido. */
  documento: string | null;
  participacao: number | null;
  quotas: number | null;
  capital: number | null;
  administrador: boolean;
  qualificacao: string | null;
  /** AAAA-MM-DD, quando o contrato diz. */
  entrada: string | null;
};

export type LeituraDoContrato = {
  tipoDoDocumento: string | null;
  dataDoDocumento: string | null;
  capitalSocial: number | null;
  socios: SocioLido[];
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  /** O que a pessoa precisa saber antes de aprovar — escrito pelo código. */
  avisos: string[];
};

const campo = (descricao: string) => ({ type: "string", description: descricao });
const numeroOuNulo = (descricao: string) => ({ type: ["number", "null"], description: descricao });

export const SCHEMA_DO_CONTRATO: Record<string, unknown> = {
  type: "object",
  properties: {
    tipoDoDocumento: campo("Contrato social, alteração contratual, consolidação, requerimento de empresário etc. Vazio se não souber"),
    dataDoDocumento: campo("Data do documento no formato AAAA-MM-DD. Vazio se não houver"),
    capitalSocial: numeroOuNulo("Capital social total em reais, depois das mudanças deste documento"),
    socios: {
      type: "array",
      description: "Os sócios DEPOIS das mudanças deste documento. Quem saiu não entra",
      items: {
        type: "object",
        properties: {
          nome: campo("Nome completo, como está no documento"),
          documento: campo("CPF ou CNPJ só com números, se o documento trouxer. Vazio se não trouxer"),
          participacao: numeroOuNulo("Percentual do capital, de 0 a 100"),
          quotas: { type: ["integer", "null"], description: "Número de quotas" },
          capital: numeroOuNulo("Valor das quotas deste sócio em reais"),
          administrador: { type: "boolean", description: "Se o documento diz que este sócio administra a sociedade" },
          qualificacao: campo("Como o documento o chama: sócio, sócio administrador, titular… Vazio se não houver"),
          entrada: campo("Data de entrada na sociedade, AAAA-MM-DD, se o documento disser. Vazio se não"),
        },
        required: ["nome", "documento", "participacao", "quotas", "capital", "administrador", "qualificacao", "entrada"],
        additionalProperties: false,
      },
    },
    confianca: {
      type: "string",
      enum: ["ALTA", "MEDIA", "BAIXA"],
      description: "BAIXA se o documento estiver ilegível, incompleto ou não for um contrato social",
    },
  },
  required: ["tipoDoDocumento", "dataDoDocumento", "capitalSocial", "socios", "confianca"],
  additionalProperties: false,
};

export const SISTEMA_DO_CONTRATO =
  "Você lê contratos sociais e alterações contratuais de empresas brasileiras para o setor Societário de um escritório de contabilidade. " +
  "Devolva o quadro de sócios como fica DEPOIS das mudanças do documento: quem entrou fica, quem saiu não entra, e as participações, " +
  "quotas e valores são os finais. Copie nomes e números exatamente como estão; não calcule nem invente o que o documento não diz — " +
  "campo sem informação fica vazio ou nulo. CPF e CNPJ só com números. Se o arquivo não for um contrato social, devolva a lista de sócios vazia e confiança BAIXA.";

function numero(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

function data(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[0]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0] ? null : m[0];
}

function textoCurto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Confere o que a IA devolveu. Documento com dígito errado é descartado (um CPF
 * errado no cadastro é pior que um vazio), número fora da faixa vira nulo, e o
 * que não fecha vira aviso para a pessoa — nunca correção silenciosa.
 */
export function lerContrato(bruto: unknown): LeituraDoContrato {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const avisos: string[] = [];
  const socios: SocioLido[] = [];
  let documentosDescartados = 0;

  for (const item of Array.isArray(o.socios) ? o.socios : []) {
    const s = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const nome = textoCurto(s.nome, 180);
    if (!nome) continue;
    let documento: string | null = null;
    const docBruto = textoCurto(s.documento, 30);
    if (docBruto) {
      const doc = lerDocumentoFiscal(docBruto);
      if (doc) documento = doc.digitos;
      else documentosDescartados++;
    }
    const quotas = numero(s.quotas, 0, 1e12);
    socios.push({
      nome,
      documento,
      participacao: numero(s.participacao, 0, 100),
      quotas: quotas === null ? null : Math.round(quotas),
      capital: (() => {
        const c = numero(s.capital, 0, 1e13);
        return c === null ? null : Math.round(c * 100) / 100;
      })(),
      administrador: s.administrador === true,
      qualificacao: textoCurto(s.qualificacao, 80),
      entrada: data(s.entrada),
    });
  }

  if (documentosDescartados > 0) {
    avisos.push(
      `${documentosDescartados} ${documentosDescartados === 1 ? "documento lido não é um CPF ou CNPJ válido e ficou de fora" : "documentos lidos não são CPF ou CNPJ válidos e ficaram de fora"} — confira no contrato.`
    );
  }
  const comParticipacao = socios.filter((s) => s.participacao !== null);
  if (comParticipacao.length === socios.length && socios.length > 0) {
    const soma = comParticipacao.reduce((t, s) => t + (s.participacao ?? 0), 0);
    if (Math.abs(soma - 100) > 0.5) avisos.push(`As participações somam ${ATE_DUAS.format(soma)}%, e não 100%.`);
  }
  const capitalSocial = (() => {
    const c = numero(o.capitalSocial, 0, 1e13);
    return c === null ? null : Math.round(c * 100) / 100;
  })();
  const comCapital = socios.filter((s) => s.capital !== null);
  if (capitalSocial !== null && comCapital.length === socios.length && socios.length > 0) {
    const soma = comCapital.reduce((t, s) => t + (s.capital ?? 0), 0);
    if (Math.abs(soma - capitalSocial) > 1) {
      avisos.push(
        `O capital de cada sócio soma R$ ${DUAS_CASAS.format(soma)}, e o capital social é R$ ${DUAS_CASAS.format(capitalSocial)}.`
      );
    }
  }
  if (socios.length === 0) avisos.push("Nenhum sócio foi lido. O arquivo pode não ser um contrato social, ou estar ilegível.");

  const confianca = o.confianca === "ALTA" || o.confianca === "BAIXA" ? o.confianca : "MEDIA";
  return {
    tipoDoDocumento: textoCurto(o.tipoDoDocumento, 120),
    dataDoDocumento: data(o.dataDoDocumento),
    capitalSocial,
    socios,
    confianca: socios.length === 0 ? "BAIXA" : confianca,
    avisos,
  };
}

// ─── O plano contra o cadastro ───────────────────────────────────────────────

export type SocioNoCadastro = {
  id: string;
  name: string;
  document: string | null;
  documentMasked: string | null;
  exitDate: Date | null;
  sharePercent: number | null;
  quotas: number | null;
  capitalAmount: number | null;
  administrator: boolean;
  qualification: string | null;
  entryDate: Date | null;
};

export type Mudanca = { campo: string; de: string; para: string };

export type PlanoDoContrato = {
  novos: SocioLido[];
  atualizar: { id: string; nomeNoCadastro: string; lido: SocioLido; mudancas: Mudanca[] }[];
  iguais: { id: string; nomeNoCadastro: string }[];
  /** Atuais no cadastro e fora do contrato: provável saída — ninguém sai sozinho. */
  foraDoContrato: { id: string; nome: string }[];
};

const digitos = (s: string) => s.replace(/\D/g, "");

/** O mesmo sócio? Pelo CPF inteiro, pelos seis dígitos públicos + nome, ou só pelo nome. */
export function mesmoSocioDoContrato(c: SocioNoCadastro, lido: SocioLido): boolean {
  if (lido.documento) {
    if (c.document) return c.document === lido.documento;
    if (c.documentMasked && lido.documento.length === 11) {
      const meio = digitos(c.documentMasked);
      if (meio.length === 6) return meio === lido.documento.slice(3, 9) && nomeComparavel(c.name) === nomeComparavel(lido.nome);
    }
  }
  return nomeComparavel(c.name) === nomeComparavel(lido.nome);
}

const reais = (n: number | null) => (n === null ? "—" : `R$ ${DUAS_CASAS.format(n)}`);
const pct = (n: number | null) => (n === null ? "—" : `${ATE_QUATRO.format(n)}%`);
const inteiro = (n: number | null) => (n === null ? "—" : INTEIRO.format(n));

/**
 * O que aprovar faria. O contrato manda em participação, quotas, capital e em
 * quem administra; documento, qualificação e data de entrada só preenchem o que
 * está vazio — o que alguém já digitou não é trocado.
 */
export function planejarContrato(cadastrados: SocioNoCadastro[], lidos: SocioLido[]): PlanoDoContrato {
  const plano: PlanoDoContrato = { novos: [], atualizar: [], iguais: [], foraDoContrato: [] };
  const usados = new Set<string>();
  for (const lido of lidos) {
    const par = cadastrados.find((c) => !usados.has(c.id) && c.exitDate === null && mesmoSocioDoContrato(c, lido));
    if (!par) {
      plano.novos.push(lido);
      continue;
    }
    usados.add(par.id);
    const m: Mudanca[] = [];
    if (lido.participacao !== null && par.sharePercent !== lido.participacao) m.push({ campo: "Participação", de: pct(par.sharePercent), para: pct(lido.participacao) });
    if (lido.quotas !== null && par.quotas !== lido.quotas) m.push({ campo: "Quotas", de: inteiro(par.quotas), para: inteiro(lido.quotas) });
    if (lido.capital !== null && par.capitalAmount !== lido.capital) m.push({ campo: "Capital", de: reais(par.capitalAmount), para: reais(lido.capital) });
    if (par.administrator !== lido.administrador) m.push({ campo: "Administra", de: par.administrator ? "sim" : "não", para: lido.administrador ? "sim" : "não" });
    if (!par.document && lido.documento) m.push({ campo: "Documento", de: "—", para: lido.documento });
    if (!par.qualification && lido.qualificacao) m.push({ campo: "Qualificação", de: "—", para: lido.qualificacao });
    if (!par.entryDate && lido.entrada) m.push({ campo: "Entrada", de: "—", para: lido.entrada });
    if (m.length) plano.atualizar.push({ id: par.id, nomeNoCadastro: par.name, lido, mudancas: m });
    else plano.iguais.push({ id: par.id, nomeNoCadastro: par.name });
  }
  plano.foraDoContrato = cadastrados.filter((c) => !usados.has(c.id) && c.exitDate === null).map((c) => ({ id: c.id, nome: c.name }));
  return plano;
}
