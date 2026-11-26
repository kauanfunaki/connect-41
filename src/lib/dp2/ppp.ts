// Histórico PPP do colaborador (26/11/2026, funcionalidade-761, entrega 3).
//
// O Perfil Profissiográfico Previdenciário é eletrônico desde 2023: o próprio
// eSocial o monta dos eventos S-2240 (condições ambientais) e S-2220 (ASO).
// Este histórico junta os mesmos eventos que o DP 2 gerou, para conferir antes
// do envio e para entregar ao colaborador o histórico de exposição em papel
// (como a Domínio faz em Processos › Histórico - PPP).
//
// Cada S-2240 abre um período, que vai até a véspera do próximo (ou até o
// desligamento). Gerado de novo para a mesma data, vale o mais recente.
// Eventos excluídos ou retificados no eSocial ficam de fora.
//
// Puro, sem banco (o PDF sai em memória).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { TIPOS_DE_EXAME } from "./esocial/sst";

export type EventoDeSst = { tipo: string; xml: string; situacao: string; createdAt: Date };

export type PeriodoDoPpp = { inicio: string; fim: string | null; setor: string; atividade: string; agentes: string[]; epc: string; epi: string; situacao: string };
export type ExameDoPpp = { data: string; tipo: string; resultado: "Apto" | "Inapto"; medico: string; situacao: string };

const FORA = new Set(["EXCLUIDO", "RETIFICADO"]);
const SEM_AGENTE = "09.01.001";

const desfaz = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tag = (xml: string, nome: string) => {
  const m = xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`));
  return m ? desfaz(m[1]).trim() : null;
};
const todas = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<${nome}>([^<]*)</${nome}>`, "g"))].map((m) => desfaz(m[1]).trim());
const vespera = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function historicoDoPpp(eventos: readonly EventoDeSst[], desligamento: string | null = null): { periodos: PeriodoDoPpp[]; exames: ExameDoPpp[] } {
  const validos = eventos.filter((e) => !FORA.has(e.situacao)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // S-2240: o mais recente de cada data de início.
  const porInicio = new Map<string, PeriodoDoPpp>();
  for (const e of validos.filter((e) => e.tipo === "S-2240")) {
    const inicio = tag(e.xml, "dtIniCondicao");
    if (!inicio) continue;
    const agentes = todas(e.xml, "codAgNoc").filter((c) => c !== SEM_AGENTE);
    porInicio.set(inicio, {
      inicio,
      fim: null,
      setor: tag(e.xml, "dscSetor") ?? "",
      atividade: tag(e.xml, "dscAtivDes") ?? "",
      agentes,
      epc: tag(e.xml, "utilizEPC") ?? "0",
      epi: tag(e.xml, "utilizEPI") ?? "0",
      situacao: e.situacao,
    });
  }
  const periodos = [...porInicio.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
  periodos.forEach((p, i) => {
    p.fim = i + 1 < periodos.length ? vespera(periodos[i + 1].inicio) : desligamento;
  });
  // S-2220: um por data e tipo (o mais recente).
  const exames = new Map<string, ExameDoPpp>();
  for (const e of validos.filter((e) => e.tipo === "S-2220")) {
    const data = tag(e.xml, "dtAso");
    if (!data) continue;
    const tipo = tag(e.xml, "tpExameOcup") ?? "";
    const crm = tag(e.xml, "nrCRM");
    const uf = tag(e.xml, "ufCRM");
    exames.set(`${data}|${tipo}`, {
      data,
      tipo: TIPOS_DE_EXAME.find(([k]) => k === tipo)?.[1] ?? tipo,
      resultado: tag(e.xml, "resAso") === "2" ? "Inapto" : "Apto",
      medico: [tag(e.xml, "nmMed"), crm ? `CRM ${crm}${uf ? `/${uf}` : ""}` : null].filter(Boolean).join(" · "),
      situacao: e.situacao,
    });
  }
  return { periodos, exames: [...exames.values()].sort((a, b) => a.data.localeCompare(b.data)) };
}

const EPC_EPI: Record<string, string> = { "0": "Não se aplica", "1": "Não utiliza", "2": "Utiliza" };
const SITUACAO: Record<string, string> = { PENDENCIA: "Com pendência", PRONTO: "Não enviado", ENVIADO: "Enviado", ACEITO: "Aceito", REJEITADO: "Rejeitado", REABERTO: "Reaberto" };
const limpo = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");

export type DadosDoPpp = {
  empresa: string;
  documentoDaEmpresa: string | null;
  colaborador: string;
  cpf: string | null;
  pis: string | null;
  admissao: string | null;
  cargo: string | null;
  cbo: string | null;
  responsavelAmbiental: string | null;
  medicoDoPcmso: string | null;
};

/** O histórico em PDF (A4): dados do trabalhador, períodos de exposição, exames e responsáveis. */
export async function pdfDoPpp(h: { periodos: PeriodoDoPpp[]; exames: ExameDoPpp[] }, d: DadosDoPpp): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cor = rgb(0.08, 0.1, 0.16);
  const cinza = rgb(0.4, 0.42, 0.48);
  const m = 48;
  let page: PDFPage = pdf.addPage([595.28, 841.89]);
  const largura = page.getWidth() - 2 * m;
  let y = page.getHeight() - m;
  const quebra = (precisa: number) => {
    if (y - precisa < m) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - m;
    }
  };
  const linhas = (t: string, tamanho: number, fonte: PDFFont, larg: number) => {
    const saida: string[] = [];
    let linha = "";
    for (const w of limpo(t).split(/\s+/).filter(Boolean)) {
      const tenta = linha ? `${linha} ${w}` : w;
      if (fonte.widthOfTextAtSize(tenta, tamanho) > larg && linha) {
        saida.push(linha);
        linha = w;
      } else linha = tenta;
    }
    if (linha) saida.push(linha);
    return saida.length ? saida : [""];
  };
  const escrever = (t: string, tamanho = 10, fonte = normal, c = cor) => {
    for (const l of linhas(t, tamanho, fonte, largura)) {
      quebra(tamanho + 4);
      page.drawText(l, { x: m, y, size: tamanho, font: fonte, color: c });
      y -= tamanho + 4;
    }
  };
  const titulo = (t: string) => {
    y -= 8;
    quebra(30);
    escrever(t, 11, negrito);
    page.drawLine({ start: { x: m, y: y + 9 }, end: { x: m + largura, y: y + 9 }, thickness: 0.5, color: cor });
    y -= 6;
  };

  escrever("HISTÓRICO DO PERFIL PROFISSIOGRÁFICO PREVIDENCIÁRIO (PPP)", 13, negrito);
  escrever("Montado dos eventos S-2240 e S-2220 gerados no DP 2. O PPP oficial é o do eSocial; este documento serve para conferência e entrega ao trabalhador.", 8, normal, cinza);
  y -= 4;
  titulo("Seção I - Dados administrativos");
  escrever(`Empresa: ${d.empresa}${d.documentoDaEmpresa ? ` · CNPJ/CPF ${d.documentoDaEmpresa}` : ""}`);
  escrever(`Trabalhador(a): ${d.colaborador}${d.cpf ? ` · CPF ${d.cpf}` : ""}${d.pis ? ` · NIS ${d.pis}` : ""}`);
  escrever(`Admissão: ${d.admissao ? br(d.admissao) : "-"} · Cargo: ${d.cargo ?? "-"}${d.cbo ? ` · CBO ${d.cbo}` : ""}`);

  titulo("Seção II - Registros ambientais (S-2240)");
  if (h.periodos.length === 0) escrever("Nenhum S-2240 gerado para este trabalhador.", 10, normal, cinza);
  for (const p of h.periodos) {
    y -= 2;
    escrever(`${br(p.inicio)} a ${p.fim ? br(p.fim) : "atual"} · ${p.setor || "Setor não informado"} · ${SITUACAO[p.situacao] ?? p.situacao}`, 10, negrito);
    if (p.atividade) escrever(`Atividade: ${p.atividade}`, 9);
    escrever(`Agentes nocivos (Tabela 24): ${p.agentes.length ? p.agentes.join(", ") : "ausência de agente nocivo (09.01.001)"}`, 9);
    if (p.agentes.length) escrever(`EPC: ${EPC_EPI[p.epc] ?? p.epc} · EPI: ${EPC_EPI[p.epi] ?? p.epi}`, 9);
  }

  titulo("Seção III - Monitoração biológica (S-2220)");
  if (h.exames.length === 0) escrever("Nenhum ASO gerado para este trabalhador.", 10, normal, cinza);
  for (const e of h.exames) escrever(`${br(e.data)} · ${e.tipo} · ${e.resultado}${e.medico ? ` · ${e.medico}` : ""} · ${SITUACAO[e.situacao] ?? e.situacao}`, 9);

  titulo("Seção IV - Responsáveis");
  escrever(`Registros ambientais: ${d.responsavelAmbiental ?? "não informado (Configuração da empresa)"}`, 9);
  escrever(`Monitoração biológica (PCMSO): ${d.medicoDoPcmso ?? "não informado (Configuração da empresa)"}`, 9);

  y -= 50;
  quebra(30);
  page.drawLine({ start: { x: m, y }, end: { x: m + 230, y }, thickness: 0.6, color: cor });
  page.drawLine({ start: { x: m + 270, y }, end: { x: m + largura, y }, thickness: 0.6, color: cor });
  y -= 13;
  page.drawText("Representante legal da empresa", { x: m, y, size: 9, font: normal, color: cor });
  page.drawText(limpo("Trabalhador(a) - recebi uma via"), { x: m + 270, y, size: 9, font: normal, color: cor });
  return pdf.save();
}
