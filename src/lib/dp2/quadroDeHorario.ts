// Quadro de horário de trabalho (26/11/2026, funcionalidade-776, entrega 2).
//
// O quadro que a empresa afixa no local de trabalho (CLT art. 74): os
// empregados com o horário de cada um — dias, entrada, saída, intervalo e
// descanso semanal —, tirado do horário de trabalho do contrato no DP 2
// (funcionalidade-752). Quem não tem horário no contrato aparece no fim,
// para o DP completar.
//
// Puro, sem banco (o PDF sai em memória).

import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { NOMES_DOS_DIAS, horasDoHorario, type Horario } from "./horarios";

export type PessoaDoQuadro = { nome: string; cargo: string | null; horario: Horario | null };
export type LinhaDoQuadro = { nome: string; cargo: string; dias: string; entrada: string; saida: string; intervalo: string; descanso: string; semanais: string };

const intervaloPorExtenso = (min: number) => (min === 0 ? "Sem intervalo" : min % 60 === 0 ? `${min / 60} h` : `${min} min`);

/** O descanso semanal: os dias em que o horário não trabalha ("Domingo", "Sábado e domingo"). */
export function descansoDoHorario(dias: string): string {
  const folgas = [...dias.padEnd(7, "0")].map((d, i) => (d === "1" ? null : NOMES_DOS_DIAS[i])).filter((d): d is (typeof NOMES_DOS_DIAS)[number] => d !== null);
  if (folgas.length === 0) return "Escala (sem folga fixa)";
  const t = folgas.length === 1 ? folgas[0] : `${folgas.slice(0, -1).join(", ")} e ${folgas[folgas.length - 1]}`;
  return t[0].toUpperCase() + t.slice(1);
}

/** As linhas do quadro, por nome; quem não tem horário fica no fim. */
export function linhasDoQuadro(pessoas: readonly PessoaDoQuadro[]): { linhas: LinhaDoQuadro[]; semHorario: string[] } {
  const linhas: LinhaDoQuadro[] = [];
  const semHorario: string[] = [];
  for (const p of [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    if (!p.horario) {
      semHorario.push(p.nome);
      continue;
    }
    const h = horasDoHorario(p.horario);
    linhas.push({
      nome: p.nome,
      cargo: p.cargo ?? "-",
      dias: h.descricao.split(",")[0],
      entrada: p.horario.entrada,
      saida: p.horario.saida,
      intervalo: intervaloPorExtenso(p.horario.intervaloMinutos),
      descanso: p.horario.tipoJornada === "2" ? "12 x 36" : descansoDoHorario(p.horario.dias),
      semanais: `${String(h.semanais).replace(".", ",")} h`,
    });
  }
  return { linhas, semHorario };
}

const limpo = (t: string) => t.replace(/›/g, ">").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");

/** O quadro em PDF (A4 deitado), com o cabeçalho da empresa e a assinatura. */
export async function pdfDoQuadroDeHorario(
  q: { linhas: LinhaDoQuadro[]; semHorario: string[] },
  e: { empresa: string; documento: string | null; endereco: string | null; cidade: string | null; data: string }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cor = rgb(0.08, 0.1, 0.16);
  const cinza = rgb(0.4, 0.42, 0.48);
  const m = 40;
  const A4 = [841.89, 595.28] as [number, number];
  let page: PDFPage = pdf.addPage(A4);
  const largura = A4[0] - 2 * m;
  let y = A4[1] - m;
  const texto = (t: string, x: number, tamanho = 9, fonte = normal, c = cor, max?: number) => {
    let s = limpo(t);
    if (max) while (s.length > 1 && fonte.widthOfTextAtSize(s, tamanho) > max) s = `${s.slice(0, -2)}…`;
    page.drawText(s, { x, y, size: tamanho, font: fonte, color: c });
  };
  // Colunas: nome, cargo, dias, entrada, saída, intervalo, descanso, horas/semana.
  const cols = [
    { t: "Empregado", w: 170 },
    { t: "Cargo", w: 120 },
    { t: "Dias", w: 110 },
    { t: "Entrada", w: 50 },
    { t: "Saída", w: 50 },
    { t: "Intervalo", w: 60 },
    { t: "Descanso semanal", w: 130 },
    { t: "Horas/semana", w: 70 },
  ];
  const xs = cols.reduce<number[]>((acc, c, i) => [...acc, i === 0 ? m : acc[i - 1] + cols[i - 1].w], []);
  const cabecalho = () => {
    texto("QUADRO DE HORÁRIO DE TRABALHO", m, 14, negrito);
    y -= 16;
    texto(`${e.empresa}${e.documento ? ` · CNPJ/CPF ${e.documento}` : ""}`, m, 10);
    y -= 13;
    if (e.endereco) {
      texto(e.endereco, m, 9, normal, cinza);
      y -= 12;
    }
    y -= 8;
    cols.forEach((c, i) => texto(c.t, xs[i], 9, negrito));
    y -= 5;
    page.drawLine({ start: { x: m, y }, end: { x: m + largura, y }, thickness: 0.6, color: cor });
    y -= 13;
  };
  cabecalho();
  for (const l of q.linhas) {
    if (y < m + 70) {
      page = pdf.addPage(A4);
      y = A4[1] - m;
      cabecalho();
    }
    const v = [l.nome, l.cargo, l.dias, l.entrada, l.saida, l.intervalo, l.descanso, l.semanais];
    v.forEach((t, i) => texto(t, xs[i], 9, normal, cor, cols[i].w - 6));
    y -= 15;
  }
  if (q.linhas.length === 0) {
    texto("Nenhum empregado com horário de trabalho no contrato.", m, 9, normal, cinza);
    y -= 15;
  }
  if (q.semHorario.length) {
    y -= 6;
    texto(`Sem horário no contrato (completar em DP 2 › Colaboradores): ${q.semHorario.join(", ")}`, m, 8, normal, cinza, largura);
    y -= 12;
  }
  y -= 36;
  if (y < m + 20) {
    page = pdf.addPage(A4);
    y = A4[1] - m - 36;
  }
  texto(`${e.cidade ? `${e.cidade}, ` : ""}${e.data.split("-").reverse().join("/")}`, m, 9);
  page.drawLine({ start: { x: m + 420, y }, end: { x: m + largura, y }, thickness: 0.6, color: cor });
  y -= 13;
  texto("Empregador", m + 420, 9);
  return pdf.save();
}
