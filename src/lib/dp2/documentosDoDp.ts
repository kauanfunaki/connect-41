// Documentos do DP em PDF (25/11/2026, funcionalidade-776, entrega 1): a ficha
// de registro de empregado e o contrato de experiência, a partir do cadastro
// da pessoa e do contrato do DP 2.
//
// Puro, sem banco (o PDF sai em memória, com o pdf-lib, como o holerite).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type DadosDoDocumento = {
  empresa: string;
  documentoDaEmpresa: string | null;
  enderecoDaEmpresa: string | null;
  cidade: string | null;
  colaborador: string;
  cpf: string | null;
  rg: string | null;
  pis: string | null;
  ctps: string | null;
  nascimento: string | null;
  endereco: string | null;
  escolaridade: string | null;
  admissao: string | null;
  cargo: string | null;
  cbo: string | null;
  salario: number;
  tipoSalario: "MENSAL" | "HORISTA";
  horasMensais: number;
  jornada: string | null;
  matricula: string | null;
  categoria: string | null;
  /** Fim do contrato por prazo determinado ("AAAA-MM-DD"). */
  dataTermino: string | null;
  dependentes: readonly { nome: string; parentesco: string; nascimento: string | null }[];
};

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const limpo = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");
const DIA = 86_400_000;

/** Os dias do contrato de experiência, da admissão ao término, contando os dois (máximo 90, CLT art. 445). */
export function diasDaExperiencia(admissao: string | null, termino: string | null): number | null {
  if (!admissao || !termino) return null;
  const d = Math.round((Date.parse(`${termino}T00:00:00Z`) - Date.parse(`${admissao}T00:00:00Z`)) / DIA) + 1;
  return d > 0 ? d : null;
}

/** O que falta no cadastro para o documento sair completo. */
export function faltasDoDocumento(tipo: "FICHA" | "EXPERIENCIA", d: DadosDoDocumento): string[] {
  const f: string[] = [];
  if (!d.cpf) f.push("CPF");
  if (!d.admissao) f.push("data de admissão");
  if (!d.cargo) f.push("cargo");
  if (tipo === "FICHA") {
    if (!d.ctps) f.push("CTPS");
    if (!d.pis) f.push("PIS");
  }
  if (tipo === "EXPERIENCIA") {
    const dias = diasDaExperiencia(d.admissao, d.dataTermino);
    if (!d.dataTermino) f.push("data de término do contrato (dados do eSocial no contrato)");
    else if (dias !== null && dias > 90) f.push(`prazo de ${dias} dias: a experiência vai até 90 (CLT art. 445)`);
  }
  return f;
}

class Escritor {
  page: PDFPage;
  y: number;
  readonly m = 50;
  constructor(
    private pdf: PDFDocument,
    private normal: PDFFont,
    private negrito: PDFFont
  ) {
    this.page = pdf.addPage([595.28, 841.89]);
    this.y = this.page.getHeight() - this.m;
  }
  get largura() {
    return this.page.getWidth() - 2 * this.m;
  }
  private espaco(altura: number) {
    if (this.y - altura < this.m) {
      this.page = this.pdf.addPage([595.28, 841.89]);
      this.y = this.page.getHeight() - this.m;
    }
  }
  paragrafo(texto: string, tamanho = 10, negrito = false) {
    const fonte = negrito ? this.negrito : this.normal;
    let linha = "";
    const sai = () => {
      this.espaco(tamanho + 5);
      this.page.drawText(linha, { x: this.m, y: this.y, size: tamanho, font: fonte, color: rgb(0.08, 0.1, 0.16) });
      this.y -= tamanho + 5;
    };
    for (const w of limpo(texto).split(/\s+/)) {
      const tenta = linha ? `${linha} ${w}` : w;
      if (fonte.widthOfTextAtSize(tenta, tamanho) > this.largura && linha) {
        sai();
        linha = w;
      } else linha = tenta;
    }
    if (linha) sai();
  }
  campo(rotulo: string, valor: string | null) {
    this.espaco(15);
    this.page.drawText(limpo(rotulo), { x: this.m, y: this.y, size: 8, font: this.normal, color: rgb(0.4, 0.42, 0.46) });
    this.page.drawText(limpo(valor || "—").slice(0, 90), { x: this.m + 140, y: this.y, size: 10, font: this.normal, color: rgb(0.08, 0.1, 0.16) });
    this.y -= 15;
  }
  pular(px: number) {
    this.y -= px;
  }
  assinaturas(rotulos: readonly string[]) {
    this.espaco(80);
    this.y -= 40;
    rotulos.forEach((r, i) => {
      const x = this.m + (i % 2) * 260;
      if (i > 0 && i % 2 === 0) this.y -= 55;
      this.page.drawLine({ start: { x, y: this.y }, end: { x: x + 220, y: this.y }, thickness: 0.6, color: rgb(0.08, 0.1, 0.16) });
      this.page.drawText(limpo(r), { x, y: this.y - 12, size: 8, font: this.normal, color: rgb(0.08, 0.1, 0.16) });
    });
  }
}

async function novo() {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { pdf, e: new Escritor(pdf, normal, negrito) };
}

const salarioPorExtenso = (d: DadosDoDocumento) => (d.tipoSalario === "HORISTA" ? `${REAIS.format(d.salario)} por hora` : `${REAIS.format(d.salario)} por mês`);

/** A ficha de registro de empregado (CLT art. 41). */
export async function pdfDaFichaDeRegistro(d: DadosDoDocumento): Promise<Uint8Array> {
  const { pdf, e } = await novo();
  e.paragrafo("FICHA DE REGISTRO DE EMPREGADO", 14, true);
  e.paragrafo("(art. 41 da CLT)", 8);
  e.pular(6);
  e.paragrafo("Empregador", 10, true);
  e.campo("Razão social", d.empresa);
  e.campo("CNPJ/CPF", d.documentoDaEmpresa);
  e.campo("Endereço", d.enderecoDaEmpresa);
  e.pular(6);
  e.paragrafo("Empregado", 10, true);
  e.campo("Nome", d.colaborador);
  e.campo("Matrícula", d.matricula);
  e.campo("CPF", d.cpf);
  e.campo("RG", d.rg);
  e.campo("PIS/NIS", d.pis);
  e.campo("CTPS", d.ctps);
  e.campo("Nascimento", br(d.nascimento));
  e.campo("Escolaridade", d.escolaridade);
  e.campo("Endereço", d.endereco);
  e.pular(6);
  e.paragrafo("Contrato", 10, true);
  e.campo("Admissão", br(d.admissao));
  e.campo("Cargo", d.cargo);
  e.campo("CBO", d.cbo);
  e.campo("Categoria (eSocial)", d.categoria);
  e.campo("Salário", salarioPorExtenso(d));
  e.campo("Horas por mês", String(d.horasMensais));
  e.campo("Jornada", d.jornada);
  e.campo("Término (prazo determinado)", d.dataTermino ? br(d.dataTermino) : null);
  e.pular(6);
  e.paragrafo("Dependentes", 10, true);
  if (d.dependentes.length === 0) e.paragrafo("Nenhum dependente no cadastro.", 9);
  for (const dep of d.dependentes) e.campo(dep.parentesco, `${dep.nome} · nascimento ${br(dep.nascimento)}`);
  e.assinaturas(["Empregador", "Empregado(a)"]);
  return pdf.save();
}

/** O contrato individual de trabalho a título de experiência (CLT arts. 443 e 445). */
export async function pdfDoContratoDeExperiencia(d: DadosDoDocumento): Promise<Uint8Array> {
  const { pdf, e } = await novo();
  const dias = diasDaExperiencia(d.admissao, d.dataTermino);
  e.paragrafo("CONTRATO DE TRABALHO A TÍTULO DE EXPERIÊNCIA", 14, true);
  e.pular(6);
  e.paragrafo(
    `Pelo presente instrumento, ${d.empresa}${d.documentoDaEmpresa ? `, inscrita sob ${d.documentoDaEmpresa}` : ""}${d.enderecoDaEmpresa ? `, com sede em ${d.enderecoDaEmpresa}` : ""}, doravante EMPREGADORA, e ${d.colaborador}${d.cpf ? `, CPF ${d.cpf}` : ""}${d.ctps ? `, CTPS ${d.ctps}` : ""}, doravante EMPREGADO(A), celebram o presente contrato de experiência, nas condições abaixo.`
  );
  e.pular(4);
  const clausulas = [
    `O(A) EMPREGADO(A) exercerá a função de ${d.cargo ?? "________________"}${d.cbo ? ` (CBO ${d.cbo})` : ""}, obrigando-se a prestar os serviços compatíveis com a função.`,
    `O contrato vigorará por ${dias ?? "___"} dias, de ${br(d.admissao)} a ${br(d.dataTermino)}, a título de experiência (CLT arts. 443, § 2º, "c", e 445, parágrafo único), podendo ser prorrogado uma única vez, sem que a soma ultrapasse 90 dias.`,
    `A remuneração será de ${salarioPorExtenso(d)}, paga até o 5º dia útil do mês seguinte ao trabalhado, com os descontos legais.`,
    `A jornada de trabalho será: ${d.jornada ?? `${d.horasMensais} horas mensais`}; as horas podem ser compensadas nos termos da lei e da convenção coletiva.`,
    "Vencido o prazo sem manifestação das partes, o contrato passa a vigorar por prazo indeterminado. A rescisão antecipada observará os arts. 479 a 481 da CLT.",
    "O(A) EMPREGADO(A) declara conhecer e aceitar o regulamento interno da EMPREGADORA.",
  ];
  clausulas.forEach((c, i) => {
    e.paragrafo(`Cláusula ${i + 1}ª. ${c}`);
    e.pular(3);
  });
  e.pular(6);
  e.paragrafo(`${d.cidade ? `${d.cidade}, ` : ""}${br(d.admissao)}.`);
  e.assinaturas(["Empregadora", "Empregado(a)", "Testemunha 1 (nome e CPF)", "Testemunha 2 (nome e CPF)"]);
  e.pular(70);
  e.paragrafo("Termo de prorrogação", 10, true);
  e.paragrafo("Por mútuo acordo, o presente contrato de experiência fica prorrogado até ____/____/________, sem que a soma dos dois períodos passe de 90 dias.");
  e.assinaturas(["Empregadora", "Empregado(a)"]);
  return pdf.save();
}

// ─── Ficha de atualização da CTPS (26/11/2026, funcionalidade-776) ──────────

/**
 * As anotações do contrato depois da admissão, como a Domínio emite em
 * Relatórios › Outros › Ficha de Atualização da CTPS: alterações salariais,
 * férias, afastamentos, contribuições sindicais e transferências. Com a CTPS
 * digital, a ficha serve para conferir com o eSocial e entregar ao empregado.
 */
export type AnotacoesDaCtps = {
  alteracoes: { data: string; de: number | null; para: number; motivo: string }[];
  ferias: { aquisitivoInicio: string; aquisitivoFim: string; inicio: string; dias: number; abono: number }[];
  afastamentos: { inicio: string; fim: string | null; motivo: string }[];
  contribuicoes: { competencia: string; valor: number }[];
  transferencias: { data: string; texto: string }[];
};

const somarDias = (iso: string, dias: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

export async function pdfDaFichaDaCtps(d: DadosDoDocumento, a: AnotacoesDaCtps): Promise<Uint8Array> {
  const { pdf, e } = await novo();
  e.paragrafo("FICHA DE ATUALIZAÇÃO DA CTPS", 14, true);
  e.paragrafo("Anotações do contrato depois da admissão, para conferir com a CTPS digital (eSocial).", 8);
  e.pular(6);
  e.campo("Empregador", `${d.empresa}${d.documentoDaEmpresa ? ` · CNPJ/CPF ${d.documentoDaEmpresa}` : ""}`);
  e.campo("Empregado", d.colaborador);
  e.campo("CPF", d.cpf);
  e.campo("CTPS", d.ctps);
  e.campo("Admissão", br(d.admissao));
  e.campo("Cargo", d.cargo);
  e.pular(6);
  e.paragrafo("Alterações salariais", 10, true);
  if (a.alteracoes.length === 0) e.paragrafo("Nenhuma alteração salarial registrada.", 9);
  for (const x of a.alteracoes) e.campo(br(x.data), `${x.de !== null ? `${REAIS.format(x.de)} → ` : ""}${REAIS.format(x.para)} · ${x.motivo}`);
  e.pular(6);
  e.paragrafo("Férias", 10, true);
  if (a.ferias.length === 0) e.paragrafo("Nenhuma férias gravada.", 9);
  for (const f of a.ferias) {
    e.campo(
      `Período ${br(f.aquisitivoInicio)} a ${br(f.aquisitivoFim)}`,
      `gozo de ${br(f.inicio)} a ${br(somarDias(f.inicio, f.dias - 1))} (${f.dias} dias)${f.abono ? ` · abono de ${f.abono} dias` : ""}`
    );
  }
  e.pular(6);
  e.paragrafo("Afastamentos", 10, true);
  if (a.afastamentos.length === 0) e.paragrafo("Nenhum afastamento registrado.", 9);
  for (const x of a.afastamentos) e.campo(`${br(x.inicio)} a ${x.fim ? br(x.fim) : "—"}`, x.motivo);
  e.pular(6);
  e.paragrafo("Contribuição sindical", 10, true);
  if (a.contribuicoes.length === 0) e.paragrafo("Nenhuma contribuição sindical descontada.", 9);
  for (const c of a.contribuicoes) e.campo(c.competencia.split("-").reverse().join("/"), REAIS.format(c.valor));
  if (a.transferencias.length) {
    e.pular(6);
    e.paragrafo("Transferências", 10, true);
    for (const t of a.transferencias) e.campo(br(t.data), t.texto);
  }
  e.assinaturas(["Empregador", "Empregado(a)"]);
  return pdf.save();
}

// ─── Movimentação de empregados (26/11/2026, funcionalidade-776) ────────────

/** Uma linha da movimentação do período: entrada, saída ou afastamento. */
export type MovimentoDeEmpregado = { data: string; nome: string; tipo: "ADMISSAO" | "DESLIGAMENTO" | "TRANSFERIDO_PARA" | "VEIO_DE" | "AFASTAMENTO" | "RETORNO"; detalhe: string };

const NOME_DO_MOVIMENTO: Record<MovimentoDeEmpregado["tipo"], string> = {
  ADMISSAO: "Admissão",
  DESLIGAMENTO: "Desligamento",
  TRANSFERIDO_PARA: "Transferido para",
  VEIO_DE: "Transferido de",
  AFASTAMENTO: "Afastamento",
  RETORNO: "Retorno",
};

/** O resumo do período: quantos entraram, saíram e a posição no fim. */
export function resumoDaMovimentacao(movimentos: readonly MovimentoDeEmpregado[], ativosNoInicio: number) {
  const entraram = movimentos.filter((m) => m.tipo === "ADMISSAO" || m.tipo === "VEIO_DE").length;
  const sairam = movimentos.filter((m) => m.tipo === "DESLIGAMENTO" || m.tipo === "TRANSFERIDO_PARA").length;
  return { ativosNoInicio, entraram, sairam, ativosNoFim: ativosNoInicio + entraram - sairam };
}

/** O relatório da movimentação de empregados da empresa no período (Domínio, Relatórios › Outros). */
export async function pdfDaMovimentacao(
  e0: { empresa: string; documento: string | null; de: string; ate: string },
  movimentos: readonly MovimentoDeEmpregado[],
  ativosNoInicio: number
): Promise<Uint8Array> {
  const { pdf, e } = await novo();
  e.paragrafo("MOVIMENTAÇÃO DE EMPREGADOS", 14, true);
  e.paragrafo(`${e0.empresa}${e0.documento ? ` · CNPJ/CPF ${e0.documento}` : ""} · de ${br(e0.de)} a ${br(e0.ate)}`, 9);
  e.pular(6);
  const r = resumoDaMovimentacao(movimentos, ativosNoInicio);
  e.campo("Ativos no início", String(r.ativosNoInicio));
  e.campo("Entradas", String(r.entraram));
  e.campo("Saídas", String(r.sairam));
  e.campo("Ativos no fim", String(r.ativosNoFim));
  e.pular(6);
  e.paragrafo("Movimentos", 10, true);
  if (movimentos.length === 0) e.paragrafo("Nenhuma movimentação no período.", 9);
  for (const m of [...movimentos].sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR"))) {
    e.campo(`${br(m.data)} · ${NOME_DO_MOVIMENTO[m.tipo]}`, `${m.nome}${m.detalhe ? ` · ${m.detalhe}` : ""}`);
  }
  return pdf.save();
}
