// O que o EFD ICMS/IPI precisa do XML e que o documento escriturado não guarda
// (06/11/2026). O motor gera o arquivo só a partir do pacote, e o pacote v1 não
// trazia endereço e município dos participantes, unidade, origem e valor bruto
// dos itens, nem tomador e municípios do CT-e. Tudo isso está no XML que o
// Connect já guarda de cada documento; este leitor tira só esses campos, sem
// mexer no `lerDocumentoXml` nem no que já foi escriturado. O mapeamento está
// em `docs/CONNECT-PACOTE-ICMS.md`, no repositório do motor.
//
// Puro, sem banco. Diferente do parser da escrituração, decodifica as entidades
// do XML (`&amp;` vira `&`), como o motor faz; DOCTYPE continua recusado.

import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { decimal, unidades } from "./dominio";

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true, processEntities: true });
type Objeto = Record<string, unknown>;
const obj = (v: unknown): Objeto => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : {});
const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const lista = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const caminho = (v: unknown, ...p: string[]): unknown => p.reduce<unknown>((n, k) => obj(n)[k], v);
const dinheiro = (v: unknown): string | null => (/^\d+(\.\d+)?$/.test(s(v)) ? decimal(unidades(s(v))) : null);
/** Ausente no XML é zero confirmado para desconto e ST: o leiaute os traz quando existem. */
const dinheiroOuZero = (v: unknown) => dinheiro(v) ?? "0.00";

export const participanteDaEscrituracaoSchema = z.object({
  documento: z.string().regex(/^(\d{11}|\d{14})$/),
  nome: z.string(), ie: z.string(), codMun: z.string(), endereco: z.string(), numero: z.string(), complemento: z.string(), bairro: z.string(),
});
export const itemDaEscrituracaoSchema = z.object({
  ordem: z.number().int().positive(), unidade: z.string(), origem: z.string(),
  vProd: z.string().nullable(), vDesc: z.string(), vICMSST: z.string(),
});
export const cteDaEscrituracaoSchema = z.object({
  tpCTe: z.string(), chaveRef: z.string().nullable(),
  /** O CNPJ/CPF de quem contratou o frete; nem sempre é o destinatário. */
  tomador: z.string().nullable(),
  munIni: z.string(), munFim: z.string(),
});
export const documentoDaEscrituracaoSchema = z.object({
  id: z.string().min(1).max(191),
  tpNF: z.string().optional(), infCpl: z.string().optional(), vDesc: z.string().optional(),
  itens: z.array(itemDaEscrituracaoSchema).optional(),
  cte: cteDaEscrituracaoSchema.optional(),
});
export const estabelecimentoDaEscrituracaoSchema = z.object({
  razaoSocial: z.string(), nomeFantasia: z.string(), codMun: z.string(), cep: z.string(), endereco: z.string(), numero: z.string(),
  complemento: z.string(), bairro: z.string(), telefone: z.string(), email: z.string(), indPerfil: z.string(), indAtiv: z.string(),
  contador: z.object({ nome: z.string(), cpf: z.string(), crc: z.string() }),
  icms: z.object({ codReceita: z.string(), diaVencimento: z.number().int().min(1).max(31).nullable() }),
  codCta: z.string(), codInf: z.string(),
});
export const escrituracaoSchema = z.object({
  estabelecimento: estabelecimentoDaEscrituracaoSchema,
  participantes: z.array(participanteDaEscrituracaoSchema),
  documentos: z.array(documentoDaEscrituracaoSchema),
});
export type ParticipanteDaEscrituracao = z.infer<typeof participanteDaEscrituracaoSchema>;
export type DocumentoDaEscrituracao = z.infer<typeof documentoDaEscrituracaoSchema>;
export type Escrituracao = z.infer<typeof escrituracaoSchema>;

/** Um participante do XML (emitente, destinatário, remetente…) com o endereço do grupo dele. */
function participante(grupo: unknown, endereco: string): ParticipanteDaEscrituracao | null {
  const g = obj(grupo), e = obj(g[endereco]);
  const documento = s(g.CNPJ) || s(g.CPF);
  if (!/^(\d{11}|\d{14})$/.test(documento)) return null;
  return { documento, nome: s(g.xNome), ie: s(g.IE), codMun: s(e.cMun), endereco: s(e.xLgr), numero: s(e.nro), complemento: s(e.xCpl), bairro: s(e.xBairro) };
}

/** O grupo do ICMS do item (`ICMS00`, `ICMS10`, `ICMSSN101`…), seja qual for. */
const grupoDoIcms = (imposto: unknown) => obj(Object.values(obj(obj(imposto).ICMS)).find((x) => x && typeof x === "object"));

/**
 * Os campos da escrituração de um XML de NF-e ou CT-e, sem o `id` (que é o do
 * documento no pacote). NFS-e e XML que não é documento fiscal: `null`.
 */
export function lerEscrituracaoXml(xml: string): { documento: Omit<DocumentoDaEscrituracao, "id">; participantes: ParticipanteDaEscrituracao[] } | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com entidades externas não é aceito.");
  const arvore = obj(parser.parse(xml));
  const nfe = obj(caminho(arvore, "nfeProc", "NFe", "infNFe") ?? caminho(arvore, "NFe", "infNFe"));
  const cte = obj(caminho(arvore, "cteProc", "CTe", "infCte") ?? caminho(arvore, "CTe", "infCte"));
  const pessoas = (pares: [unknown, string][]) => pares.map(([g, e]) => participante(g, e)).filter((p): p is ParticipanteDaEscrituracao => p !== null);

  if (Object.keys(nfe).length) {
    const itens = lista(nfe.det).map((v, i) => {
      const p = obj(obj(v).prod), icms = grupoDoIcms(obj(v).imposto);
      return { ordem: i + 1, unidade: s(p.uCom), origem: s(icms.orig), vProd: dinheiro(p.vProd), vDesc: dinheiroOuZero(p.vDesc), vICMSST: dinheiroOuZero(icms.vICMSST) };
    });
    return {
      documento: { tpNF: s(caminho(nfe, "ide", "tpNF")), infCpl: s(caminho(nfe, "infAdic", "infCpl")), vDesc: dinheiroOuZero(caminho(nfe, "total", "ICMSTot", "vDesc")), itens },
      participantes: pessoas([[nfe.emit, "enderEmit"], [nfe.dest, "enderDest"]]),
    };
  }

  if (Object.keys(cte).length) {
    const ide = obj(cte.ide);
    const partes = { emit: participante(cte.emit, "enderEmit"), rem: participante(cte.rem, "enderReme"), exped: participante(cte.exped, "enderExped"), receb: participante(cte.receb, "enderReceb"), dest: participante(cte.dest, "enderDest") };
    const toma4 = participante(ide.toma4, "enderToma");
    // toma3/toma: 0 remetente, 1 expedidor, 2 recebedor, 3 destinatário; toma4 é outro, com o próprio cadastro.
    const papel = s(caminho(ide, "toma3", "toma") || caminho(ide, "toma03", "toma"));
    const tomador = toma4 ?? ({ "0": partes.rem, "1": partes.exped, "2": partes.receb, "3": partes.dest } as Record<string, ParticipanteDaEscrituracao | null>)[papel] ?? null;
    const chaveRef = s(caminho(cte, "infCteComp", "chCTe")) || s(caminho(cte, "infCteComp", "chave")) || s(caminho(cte, "infCteNorm", "infCteSub", "chCte")) || s(caminho(cte, "infCteAnu", "chCte")) || null;
    return {
      documento: { cte: { tpCTe: s(ide.tpCTe), chaveRef, tomador: tomador?.documento ?? null, munIni: s(ide.cMunIni), munFim: s(ide.cMunFim) } },
      participantes: [...Object.values(partes), toma4].filter((p): p is ParticipanteDaEscrituracao => p !== null),
    };
  }
  return null;
}

/**
 * Junta os participantes de vários documentos, um por CNPJ/CPF. Fica o
 * cadastro mais completo (o que preenche mais campos): o mesmo fornecedor pode
 * vir com e sem inscrição estadual em notas diferentes.
 */
export function juntarParticipantes(todos: Iterable<ParticipanteDaEscrituracao>): ParticipanteDaEscrituracao[] {
  const preenchidos = (p: ParticipanteDaEscrituracao) => Object.values(p).filter(Boolean).length;
  const porDocumento = new Map<string, ParticipanteDaEscrituracao>();
  for (const p of todos) {
    const atual = porDocumento.get(p.documento);
    if (!atual || preenchidos(p) > preenchidos(atual)) porDocumento.set(p.documento, p);
  }
  return [...porDocumento.values()].sort((a, b) => (a.documento < b.documento ? -1 : a.documento > b.documento ? 1 : 0));
}
