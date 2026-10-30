import { XMLParser } from "fast-xml-parser";
import { lerXmlFiscal } from "@/lib/fiscal/xml";
import { apoioSchema, decimal, documentoSchema, somar, unidades, type DocumentoFiscal, type ItemFiscal } from "./dominio";

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true, processEntities: false });
type Objeto = Record<string, unknown>;
const obj = (v: unknown): Objeto => v && typeof v === "object" && !Array.isArray(v) ? v as Objeto : {};
const s = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "";
const lista = (v: unknown): unknown[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
const caminho = (v: unknown, ...p: string[]): unknown => p.reduce<unknown>((n, k) => obj(n)[k], v);
const tributoVazio = () => ({ cst: "", base: null, aliquota: null, valor: null });
const dinheiroXml = (v: unknown): string | null => /^\d+(\.\d+)?$/.test(s(v)) ? decimal(unidades(s(v))) : null;
export function lerDocumentoXml(xml: string): DocumentoFiscal {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com entidades externas não é aceito.");
  const l = lerXmlFiscal(xml); if (!l.ok) throw new Error(l.detalhe);
  const d = l.documento, arvore = obj(parser.parse(xml));
  const nfe = obj(caminho(arvore, "nfeProc", "NFe", "infNFe") ?? caminho(arvore, "NFe", "infNFe"));
  const cte = obj(caminho(arvore, "cteProc", "CTe", "infCte") ?? caminho(arvore, "CTe", "infCte"));
  function imposto(v: unknown, nome: string) {
    const g = obj(obj(v)[nome]); const detalhe = obj(Object.values(g).find(x => x && typeof x === "object"));
    const t = Object.keys(detalhe).length ? detalhe : g;
    const sufixo = nome === "COFINS" ? "COFINS" : nome;
    return { cst: s(t.CST ?? t.CSOSN), base: dinheiroXml(t.vBC), aliquota: s(t[`p${sufixo}`]) || null, valor: dinheiroXml(t[`v${sufixo}`] ?? (nome === "ICMS" ? t.vCredICMSSN : undefined)) };
  }
  let itens: ItemFiscal[] = [];
  if (Object.keys(nfe).length) itens = lista(nfe.det).map((v, i) => {
    const p = obj(obj(v).prod), imp = obj(obj(v).imposto);
    const valor = somar([s(p.vProd) || "0", s(p.vFrete) || "0", s(p.vSeg) || "0", s(p.vOutro) || "0"]);
    return { ordem: i + 1, codigo: s(p.cProd), descricao: s(p.xProd), ncm: s(p.NCM), cfop: s(p.CFOP) || null, tipoItem: "99", quantidade: s(p.qCom) || "1", valor: decimal(unidades(valor) - unidades(s(p.vDesc) || "0")), icms: imposto(imp, "ICMS"), ipi: imposto(imp, "IPI"), pis: imposto(imp, "PIS"), cofins: imposto(imp, "COFINS") };
  });
  else if (Object.keys(cte).length) itens = [{ ordem: 1, codigo: "SERVICO_TRANSPORTE", descricao: "Serviço de transporte", ncm: "", cfop: s(caminho(cte, "ide", "CFOP")) || null, tipoItem: "09", quantidade: "1", valor: d.valorTotal, icms: imposto(cte.imp, "ICMS"), ipi: { ...tributoVazio(), valor: "0.00", base: "0.00" }, pis: tributoVazio(), cofins: tributoVazio() }];
  else itens = [{ ordem: 1, codigo: "SERVICO", descricao: `Serviço da NFS-e ${d.numero}`, ncm: "", cfop: null, tipoItem: "09", quantidade: "1", valor: d.valorTotal, icms: { ...tributoVazio(), valor: "0.00", base: "0.00" }, ipi: { ...tributoVazio(), valor: "0.00", base: "0.00" }, pis: tributoVazio(), cofins: tributoVazio() }];
  return documentoSchema.parse({ identidade: d.chaveAcesso ?? `NFSE:${d.emitente.documento}:${d.serie}:${d.numero}:${d.competenciaDeclarada ?? d.emitidoEm.toISOString().slice(0, 7)}`, tipo: d.tipo, numero: d.numero, serie: d.serie, emitente: d.emitente.documento ?? "", destinatario: d.destinatario.documento ?? "", nomeEmitente: d.emitente.nome ?? "", nomeDestinatario: d.destinatario.nome ?? "", emitidoEm: d.emitidoEm.toISOString().slice(0, 10), competencia: d.competenciaDeclarada ?? d.emitidoEm.toISOString().slice(0, 7), valor: d.valorTotal, cancelado: d.cancelada, fonte: "xml", completo: itens.length > 0, itens });
}
const doSped = (v = "") => v ? decimal(unidades(v.replace(",", "."))) : "0.00";
/** Carrega documentos, nunca usa E110/M para substituir o cálculo. Campos irrecuperáveis ficam nulos. */
export function lerDocumentosTxt(texto: string, cnpj: string): DocumentoFiscal[] {
  const documentos: DocumentoFiscal[] = [], participantes = new Map<string, string>(), produtos = new Map<string, string[]>();
  let atual: DocumentoFiscal | null = null, sentido = "entrada", competencia = "", cnpjArquivo = "";
  for (const linha of texto.split(/\r?\n/)) {
    const c = linha.split("|").slice(1), reg = c[0];
    if (reg === "0000") {
      const data = c.find(v => /^\d{8}$/.test(v));
      competencia = `${data?.slice(4, 8)}-${data?.slice(2, 4)}`;
      cnpjArquivo = c.find(v => /^\d{14}$/.test(v)) ?? "";
      if (cnpjArquivo !== cnpj) throw new Error("O CNPJ do TXT não corresponde à empresa selecionada.");
    }
    if (reg === "0150") participantes.set(c[1], c[4] || c[5]);
    if (reg === "0200") produtos.set(c[1], c);
    if (["C100", "D100", "A100"].includes(reg)) {
      const a = reg === "A100", d = reg === "D100";
      sentido = c[1] === "0" ? "entrada" : "saida";
      const parceiro = participantes.get(c[3]) ?? (/^\d{14}$/.test(c[3]) ? c[3] : "");
      const chave = !a ? c[d ? 9 : 8] : "";
      const numero = c[d ? 8 : 7] ?? "";
      atual = documentoSchema.parse({ identidade: /^\d{44}$/.test(chave) ? chave : `TXT:${cnpj}:${competencia}:${reg}:${c[6]}:${numero}`, tipo: d ? "CTE" : a ? "NFSE" : "NFE", numero, serie: c[6] ?? "", emitente: sentido === "entrada" ? parceiro : cnpj, destinatario: sentido === "entrada" ? cnpj : parceiro, nomeEmitente: parceiro, competencia, emitidoEm: `${competencia}-01`, valor: doSped(c[a ? 11 : d ? 14 : 11]), cancelado: ["02", "03", "04", "05"].includes(c[5]), fonte: "txt", completo: false, itens: [], referencias: {} });
      documentos.push(atual);
    }
    if (atual && reg === "C170") {
      const p = produtos.get(c[2]);
      atual.itens.push({ ordem: Number(c[1]), codigo: c[2].replace(/^\d{14}-/, ""), descricao: p?.[2] ?? c[3] ?? c[2], ncm: p?.[7] ?? "", tipoItem: p?.[6] ?? "99", quantidade: c[4].replace(",", "."), cfop: c[10] || null, valor: decimal(unidades(doSped(c[6])) - unidades(doSped(c[7]))), icms: { cst: c[9], base: doSped(c[12]), aliquota: c[13]?.replace(",", ".") || null, valor: doSped(c[14]) }, ipi: { cst: c[20] ?? "", base: c[22] ? doSped(c[22]) : null, aliquota: c[23]?.replace(",", ".") || null, valor: c[24] ? doSped(c[24]) : null }, pis: { cst: c[25] ?? "", base: c[26] ? doSped(c[26]) : null, aliquota: c[27]?.replace(",", ".") || null, valor: c[30] ? doSped(c[30]) : null }, cofins: { cst: c[31] ?? "", base: c[32] ? doSped(c[32]) : null, aliquota: c[33]?.replace(",", ".") || null, valor: c[36] ? doSped(c[36]) : null } });
      atual.completo = true;
    }
    if (atual && ["C190", "D190"].includes(reg) && !atual.itens.some(i => !i.codigo.startsWith("ANALITICO:"))) {
      atual.itens.push({ ordem: atual.itens.length + 1, codigo: `ANALITICO:${c[1]}:${c[2]}:${c[3]}`, descricao: "Registro analítico; itens não disponíveis no TXT", ncm: "", tipoItem: "99", quantidade: "1", cfop: c[2] || null, valor: doSped(c[4]), icms: { cst: c[1], base: doSped(c[5]), aliquota: c[3]?.replace(",", ".") || null, valor: doSped(c[6]) }, ipi: tributoVazio(), pis: tributoVazio(), cofins: tributoVazio() });
    }
    if (atual && ["E110", "E111", "M100", "M200", "M500", "M600"].includes(reg)) atual.referencias[`${reg}:${Object.keys(atual.referencias).length}`] = linha;
  }
  if (!cnpjArquivo || !documentos.length) throw new Error("TXT SPED sem cabeçalho ou documentos suportados.");
  return documentos.map(d => documentoSchema.parse(d));
}
export const COLUNAS_APOIO = ["identidade", "competencia", "categoria", "documento", "nome", "dataPagamento", "bruto", "liquido"] as const;
export function lerLinhasApoio(linhas: string[][]) {
  if (!linhas.length || COLUNAS_APOIO.some((c, i) => linhas[0][i] !== c)) throw new Error("Use o modelo de importação do Connect, com as colunas na ordem fornecida.");
  return linhas.slice(1).filter(l => l.some(Boolean)).map((l, i) => {
    const dados = Object.fromEntries(COLUNAS_APOIO.map((c, j) => [c, l[j] || null]));
    const r = apoioSchema.safeParse(dados);
    if (!r.success) throw new Error(`Linha ${i + 2}: ${r.error.issues[0]?.message}`);
    return r.data;
  });
}
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = []; let linha: string[] = [], campo = "", aspas = false;
  const limpo = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (c === '"') { if (aspas && limpo[i + 1] === '"') { campo += '"'; i++; } else aspas = !aspas; }
    else if (!aspas && (c === ";" || c === "\n")) { linha.push(campo.replace(/\r$/, "")); campo = ""; if (c === "\n") { linhas.push(linha); linha = []; } }
    else campo += c;
  }
  if (aspas) throw new Error("CSV com aspas não fechadas.");
  if (campo || linha.length) { linha.push(campo.replace(/\r$/, "")); linhas.push(linha); }
  return linhas;
}
