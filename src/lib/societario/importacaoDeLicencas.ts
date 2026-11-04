// Importar licenças de uma planilha (lote B dos ajustes de 03/11/2026): o
// cliente que chega ao Connect com as licenças numa planilha não precisa
// cadastrar uma a uma. O Connect dá o modelo (`gerarModeloDeLicencas`), a
// pessoa preenche e sobe; a tela mostra o que entra, o que já existe e o que
// tem erro, linha a linha, antes de gravar.
//
// A validação de cada linha é a do formulário (`lerFormularioDeLicenca`): o que
// a planilha aceita é o mesmo que a tela aceita. A empresa vem pelo CNPJ, e o
// órgão pelo nome, quando é um do cadastro — órgão desconhecido não barra a
// linha, só fica sem órgão (o campo é opcional no formulário também).
//
// Sem banco aqui: quem chama passa as empresas, os órgãos e as licenças que já
// existem. Só a leitura do .xlsx (ExcelJS) é assíncrona.

import ExcelJS from "exceljs";
import { lerFormularioDeLicenca, type DadosDaLicenca } from "./licenca-form";

export const ABA_DO_MODELO = "Licenças";
export const MAXIMO_DE_LINHAS = 2000;
/** O arquivo da planilha: bem mais que 2.000 linhas de texto pedem. */
export const TAMANHO_MAXIMO_DA_PLANILHA = 5 * 1024 * 1024;

/** As colunas do modelo, na ordem. `*` = obrigatória. */
export const COLUNAS_DO_MODELO = [
  { nome: "CNPJ da empresa*", chave: "cnpj", largura: 22, ajuda: "O CNPJ (ou CPF) da empresa como está no Connect, com ou sem pontuação." },
  { nome: "Tipo da licença*", chave: "tipo", largura: 30, ajuda: "Alvará de Funcionamento, Licença Sanitária, Licença Ambiental, Bombeiros (CLCB/AVCB)…" },
  { nome: "Órgão", chave: "orgao", largura: 28, ajuda: "O nome do órgão como está no cadastro do Societário. Se não achar, a licença entra sem órgão." },
  { nome: "Número", chave: "numero", largura: 18, ajuda: "O número do documento. Opcional." },
  { nome: "Emissão", chave: "emissao", largura: 12, ajuda: "Data em que foi emitida (dd/mm/aaaa). Opcional." },
  { nome: "Validade", chave: "validade", largura: 12, ajuda: "Até quando vale (dd/mm/aaaa). Sem validade, a licença não entra na fila de renovação." },
  { nome: "Observações", chave: "observacoes", largura: 40, ajuda: "Qualquer anotação. Opcional." },
] as const;

type ChaveDaColuna = (typeof COLUNAS_DO_MODELO)[number]["chave"];

export class PlanilhaInvalida extends Error {}

export type LinhaDaPlanilha = { linha: number } & Record<ChaveDaColuna, string>;

export type EmpresaParaImportar = { id: string; nome: string; documento: string };
export type OrgaoParaImportar = { id: string; nome: string };

export type LinhaConferida = {
  linha: number;
  documento: string;
  empresa: string | null;
  tipo: string;
  validade: string;
  situacao: "nova" | "repetida" | "erro";
  /** O erro (situação "erro") ou por que é repetida. */
  motivo?: string;
  /** Entra, mas com ressalva — o órgão que não foi achado. */
  aviso?: string;
  dados?: DadosDaLicenca;
};

const semAcento = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "");
export const normalizar = (t: string) => semAcento(t).toUpperCase().replace(/\s+/g, " ").trim();
const digitos = (t: string) => t.replace(/\D/g, "");

/** O documento da célula: o Excel guarda CNPJ como número e come o zero da frente. */
export function documentoDaCelula(t: string): string {
  const d = digitos(t);
  if (d.length === 13 || d.length === 12) return d.padStart(14, "0");
  if (d.length === 10) return d.padStart(11, "0");
  return d;
}

/** "AAAA-MM-DD" de uma data da célula: Date do Excel, "dd/mm/aaaa" ou ISO. Texto que não é data volta como está, e a validação recusa. */
export function dataDaCelula(valor: unknown): string {
  if (valor instanceof Date) {
    // O Excel guarda a data à meia-noite UTC: o dia é o da parte UTC.
    return valor.toISOString().slice(0, 10);
  }
  const t = String(valor ?? "").trim();
  if (!t) return "";
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return t;
}

/** O texto de uma célula do ExcelJS: rich text, fórmula, hiperlink e número viram texto. */
function textoDaCelula(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((p) => p.text).join("");
    if ("result" in v) return textoDaCelula(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

/** Lê a aba das licenças: a do modelo, ou a primeira, com o cabeçalho numa das cinco primeiras linhas. */
export async function lerPlanilhaDeLicencas(bytes: Uint8Array): Promise<LinhaDaPlanilha[]> {
  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new PlanilhaInvalida("O arquivo não é uma planilha .xlsx. Use o modelo do Connect (ou salve a sua como .xlsx).");
  }
  const aba = livro.worksheets.find((w) => normalizar(w.name) === normalizar(ABA_DO_MODELO)) ?? livro.worksheets[0];
  if (!aba) throw new PlanilhaInvalida("A planilha está vazia.");

  // O cabeçalho: a primeira linha (das cinco de cima) com uma coluna de CNPJ.
  let linhaDoCabecalho = 0;
  const colunas = new Map<ChaveDaColuna, number>();
  for (let r = 1; r <= Math.min(5, aba.rowCount) && !linhaDoCabecalho; r++) {
    const achadas = new Map<ChaveDaColuna, number>();
    aba.getRow(r).eachCell((cell, col) => {
      const nome = normalizar(textoDaCelula(cell.value)).replace(/\*/g, "");
      const chave: ChaveDaColuna | null = nome.startsWith("CNPJ") || nome.startsWith("CPF")
        ? "cnpj"
        : nome.startsWith("TIPO")
          ? "tipo"
          : nome.startsWith("ORGAO")
            ? "orgao"
            : nome.startsWith("NUMERO") || nome === "N"
              ? "numero"
              : nome.startsWith("EMISSAO")
                ? "emissao"
                : nome.startsWith("VALIDADE") || nome.startsWith("VENCIMENTO")
                  ? "validade"
                  : nome.startsWith("OBSERVA")
                    ? "observacoes"
                    : null;
      if (chave && !achadas.has(chave)) achadas.set(chave, col);
    });
    if (achadas.has("cnpj")) {
      linhaDoCabecalho = r;
      for (const [k, v] of achadas) colunas.set(k, v);
    }
  }
  if (!linhaDoCabecalho) throw new PlanilhaInvalida(`Não achei a coluna "CNPJ da empresa" nas primeiras linhas da aba "${aba.name}". Use o modelo do Connect.`);
  if (!colunas.has("tipo")) throw new PlanilhaInvalida(`Não achei a coluna "Tipo da licença" na aba "${aba.name}".`);

  const linhas: LinhaDaPlanilha[] = [];
  for (let r = linhaDoCabecalho + 1; r <= aba.rowCount; r++) {
    const row = aba.getRow(r);
    const cel = (k: ChaveDaColuna) => (colunas.has(k) ? row.getCell(colunas.get(k)!).value : null);
    const linha: LinhaDaPlanilha = {
      linha: r,
      cnpj: textoDaCelula(cel("cnpj")).trim(),
      tipo: textoDaCelula(cel("tipo")).trim(),
      orgao: textoDaCelula(cel("orgao")).trim(),
      numero: textoDaCelula(cel("numero")).trim(),
      emissao: dataDaCelula(cel("emissao") instanceof Date ? cel("emissao") : textoDaCelula(cel("emissao"))),
      validade: dataDaCelula(cel("validade") instanceof Date ? cel("validade") : textoDaCelula(cel("validade"))),
      observacoes: textoDaCelula(cel("observacoes")).trim(),
    };
    // Linha em branco (ou só com espaço) não é linha.
    if (!linha.cnpj && !linha.tipo && !linha.numero && !linha.validade) continue;
    linhas.push(linha);
    if (linhas.length > MAXIMO_DE_LINHAS) throw new PlanilhaInvalida(`A planilha passa de ${MAXIMO_DE_LINHAS} licenças. Divida em mais de um arquivo.`);
  }
  return linhas;
}

/** A licença que já existe: mesma empresa, mesmo tipo, mesmo número (ou, sem número, mesma validade). */
export function chaveDaLicenca(companyId: string, tipo: string, numero: string | null, validade: Date | null): string {
  const qual = numero ? `n:${normalizar(numero)}` : `v:${validade ? validade.toISOString().slice(0, 10) : "-"}`;
  return `${companyId}|${normalizar(tipo)}|${qual}`;
}

/** Confere cada linha: a empresa pelo documento, o órgão pelo nome, a validação do formulário e se já existe. */
export function conferirLinhas(
  linhas: LinhaDaPlanilha[],
  { empresas, orgaos, existentes }: { empresas: EmpresaParaImportar[]; orgaos: OrgaoParaImportar[]; existentes: ReadonlySet<string> }
): LinhaConferida[] {
  const porDocumento = new Map<string, EmpresaParaImportar>();
  for (const e of empresas) if (e.documento) porDocumento.set(digitos(e.documento), e);
  const porNome = new Map(orgaos.map((o) => [normalizar(o.nome), o]));
  const naPlanilha = new Set<string>();

  return linhas.map((l): LinhaConferida => {
    const documento = documentoDaCelula(l.cnpj);
    const base = { linha: l.linha, documento, tipo: l.tipo, validade: l.validade, empresa: null as string | null };
    if (!documento) return { ...base, situacao: "erro", motivo: "Sem o CNPJ da empresa." };
    const empresa = porDocumento.get(documento);
    if (!empresa) return { ...base, situacao: "erro", motivo: "Nenhuma empresa do Connect com este CNPJ." };
    base.empresa = empresa.nome;

    const orgao = l.orgao ? porNome.get(normalizar(l.orgao)) : undefined;
    const lido = lerFormularioDeLicenca({
      companyId: empresa.id,
      kind: l.tipo,
      organId: orgao?.id ?? "",
      number: l.numero,
      issuedAt: l.emissao,
      expiresAt: l.validade,
      notes: l.observacoes,
    });
    if (!lido.ok) {
      // A mensagem do formulário fala do campo da tela; aqui, da coluna.
      const motivo = /emissão inválida/i.test(lido.erro)
        ? "Emissão não é uma data (use dd/mm/aaaa)."
        : /validade inválida/i.test(lido.erro)
          ? "Validade não é uma data (use dd/mm/aaaa)."
          : lido.erro;
      return { ...base, situacao: "erro", motivo };
    }

    const chave = chaveDaLicenca(empresa.id, lido.dados.kind, lido.dados.number, lido.dados.expiresAt);
    if (existentes.has(chave)) return { ...base, situacao: "repetida", motivo: "Já cadastrada no Connect." };
    if (naPlanilha.has(chave)) return { ...base, situacao: "repetida", motivo: "Repetida na própria planilha." };
    naPlanilha.add(chave);

    return {
      ...base,
      situacao: "nova",
      aviso: l.orgao && !orgao ? `Órgão "${l.orgao}" não está no cadastro: entra sem órgão.` : undefined,
      dados: lido.dados,
    };
  });
}

/** O modelo de planilha do Connect: a aba "Licenças", só com o cabeçalho, e a aba "Como preencher". */
export async function gerarModeloDeLicencas(): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet(ABA_DO_MODELO, { views: [{ state: "frozen", ySplit: 1 }] });
  aba.columns = COLUNAS_DO_MODELO.map((c) => ({ header: c.nome, key: c.chave, width: c.largura }));
  const cabecalho = aba.getRow(1);
  cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecalho.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4FC2" } };
  // CNPJ e número como texto: o Excel não come o zero da frente nem vira notação científica.
  aba.getColumn("cnpj").numFmt = "@";
  aba.getColumn("numero").numFmt = "@";
  aba.getColumn("emissao").numFmt = "dd/mm/yyyy";
  aba.getColumn("validade").numFmt = "dd/mm/yyyy";

  const ajuda = livro.addWorksheet("Como preencher");
  ajuda.columns = [
    { header: "Coluna", key: "coluna", width: 22 },
    { header: "O que vai nela", key: "ajuda", width: 90 },
  ];
  ajuda.getRow(1).font = { bold: true };
  for (const c of COLUNAS_DO_MODELO) ajuda.addRow({ coluna: c.nome, ajuda: c.ajuda });
  ajuda.addRow({});
  ajuda.addRow({ coluna: "Uma licença por linha.", ajuda: "Colunas com * são obrigatórias. Linhas em branco são ignoradas." });
  ajuda.addRow({ coluna: "Antes de gravar", ajuda: "O Connect mostra o que entra, o que já está cadastrado e o que tem erro, linha a linha." });

  return Buffer.from(await livro.xlsx.writeBuffer());
}
