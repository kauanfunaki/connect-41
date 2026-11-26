// Cadastros de saúde e segurança do DP 2 (26/11/2026, funcionalidade-761,
// entrega 1): ambientes de trabalho e EPI.
//
// - Ambiente de trabalho: o setor, a atividade, os agentes nocivos (Tabela 24
//   do eSocial) e o uso de EPC e EPI, como estão no LTCAT. O S-2240 do
//   colaborador sai do ambiente escolhido, sem digitar tudo de novo.
// - EPI: o equipamento com o número do CA (Certificado de Aprovação) e a
//   validade dele; a entrega a cada colaborador (data e quantidade) forma a
//   ficha de controle de EPI, impressa para assinatura (NR-6, 6.5.1 "h").
//
// Puro, sem banco (o PDF sai em memória).

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { lerAgentes } from "./esocial/sst";

const ehData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const EPC_EPI = ["0", "1", "2"];

// ─── Ambiente de trabalho ───────────────────────────────────────────────────

export type Ambiente = { nome: string; atividade: string | null; agentes: string[]; usaEpc: string; usaEpi: string };

export function lerAmbiente(e: { nome: string; atividade: string; agentes: string; usaEpc: string; usaEpi: string }): { ok: true; ambiente: Ambiente } | { ok: false; erro: string } {
  const nome = e.nome.trim().slice(0, 100);
  if (!nome) return { ok: false, erro: "Informe o nome do ambiente (o setor, como está no LTCAT)." };
  const invalidos = e.agentes
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter((c) => c && !/^\d{2}\.\d{2}\.\d{3}$/.test(c));
  if (invalidos.length) return { ok: false, erro: `Código da Tabela 24 inválido: ${invalidos.join(", ")}. O formato é 01.18.001.` };
  return {
    ok: true,
    ambiente: {
      nome,
      atividade: e.atividade.trim().slice(0, 999) || null,
      agentes: lerAgentes(e.agentes),
      usaEpc: EPC_EPI.includes(e.usaEpc) ? e.usaEpc : "0",
      usaEpi: EPC_EPI.includes(e.usaEpi) ? e.usaEpi : "0",
    },
  };
}

// ─── EPI e entrega ──────────────────────────────────────────────────────────

export type Epi = { nome: string; ca: string; validadeCa: string | null };

export function lerEpi(e: { nome: string; ca: string; validadeCa: string }): { ok: true; epi: Epi } | { ok: false; erro: string } {
  const nome = e.nome.trim().slice(0, 120);
  if (!nome) return { ok: false, erro: "Informe o nome do EPI." };
  const ca = e.ca.replace(/\D/g, "");
  if (!ca || ca.length > 10) return { ok: false, erro: "Informe o número do CA (só números, até 10 dígitos)." };
  return { ok: true, epi: { nome, ca, validadeCa: ehData(e.validadeCa) ? e.validadeCa : null } };
}

/** A validade do CA na data: "sem" (não informada), "vencido", "vence" (em até 30 dias) ou "ok". */
export function situacaoDoCa(validade: string | null, hoje: string): { tom: "sem" | "vencido" | "vence" | "ok"; texto: string } {
  if (!validade) return { tom: "sem", texto: "Validade do CA não informada" };
  if (validade < hoje) return { tom: "vencido", texto: `CA vencido em ${br(validade)}` };
  const dias = Math.round((Date.parse(`${validade}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000);
  if (dias <= 30) return { tom: "vence", texto: `CA vence em ${dias} dia(s) (${br(validade)})` };
  return { tom: "ok", texto: `CA válido até ${br(validade)}` };
}

export type EntregaDeEpi = { data: string; quantidade: number };

export function lerEntregaDeEpi(e: { data: string; quantidade: string }, epi: { validadeCa: string | null }): { ok: true; entrega: EntregaDeEpi } | { ok: false; erro: string } {
  if (!ehData(e.data)) return { ok: false, erro: "Informe a data da entrega." };
  const quantidade = Number(e.quantidade || "1");
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 999) return { ok: false, erro: "A quantidade vai de 1 a 999." };
  // A NR-6 só admite EPI com CA válido: não registra entrega com o CA já vencido na data.
  if (epi.validadeCa && epi.validadeCa < e.data) return { ok: false, erro: `O CA deste EPI venceu em ${br(epi.validadeCa)}: cadastre o CA novo antes de registrar a entrega.` };
  return { ok: true, entrega: { data: e.data, quantidade } };
}

// ─── Ficha de controle de EPI (PDF) ─────────────────────────────────────────

const limpo = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");

/** A ficha de controle de entrega de EPI do colaborador (A4), com a declaração e a assinatura. */
export async function pdfDaFichaDeEpi(
  linhas: readonly { data: string; epi: string; ca: string; quantidade: number }[],
  p: { colaborador: string; cpf: string | null; empresa: string; documentoDaEmpresa: string | null; funcao: string | null }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cor = rgb(0.08, 0.1, 0.16);
  const m = 48;
  let page = pdf.addPage([595.28, 841.89]);
  let y = page.getHeight() - m;
  const largura = page.getWidth() - 2 * m;
  const texto = (t: string, x: number, tamanho = 10, fonte = normal) => page.drawText(limpo(t), { x, y, size: tamanho, font: fonte, color: cor });
  const paragrafo = (t: string, tamanho = 10) => {
    let linha = "";
    for (const w of limpo(t).split(/\s+/)) {
      const tenta = linha ? `${linha} ${w}` : w;
      if (normal.widthOfTextAtSize(tenta, tamanho) > largura && linha) {
        texto(linha, m, tamanho);
        y -= tamanho + 4;
        linha = w;
      } else linha = tenta;
    }
    if (linha) {
      texto(linha, m, tamanho);
      y -= tamanho + 4;
    }
  };
  texto("FICHA DE CONTROLE DE ENTREGA DE EPI", m, 14, negrito);
  y -= 20;
  texto(`${p.empresa}${p.documentoDaEmpresa ? ` · CNPJ/CPF ${p.documentoDaEmpresa}` : ""}`, m);
  y -= 14;
  texto(`Colaborador(a): ${p.colaborador}${p.cpf ? ` · CPF ${p.cpf}` : ""}${p.funcao ? ` · ${p.funcao}` : ""}`, m);
  y -= 22;
  paragrafo(
    "Declaro ter recebido os equipamentos de proteção individual abaixo, em perfeito estado, e ter sido orientado(a) sobre o uso correto, a guarda e a conservação. Comprometo-me a usá-los apenas para a finalidade a que se destinam e a comunicar qualquer alteração que os torne impróprios para uso (NR-6)."
  );
  y -= 10;
  const colunas = [m, m + 70, m + 330, m + 400];
  const cabecalho = () => {
    ["Data", "EPI", "CA", "Qtd.", "Assinatura"].forEach((c, i) => texto(c, i < 4 ? colunas[i] : m + 440, 9, negrito));
    y -= 6;
    page.drawLine({ start: { x: m, y }, end: { x: m + largura, y }, thickness: 0.6, color: cor });
    y -= 14;
  };
  cabecalho();
  for (const l of linhas) {
    if (y < m + 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - m;
      cabecalho();
    }
    texto(br(l.data), colunas[0], 9);
    texto(l.epi.length > 48 ? `${l.epi.slice(0, 47)}…` : l.epi, colunas[1], 9);
    texto(l.ca, colunas[2], 9);
    texto(String(l.quantidade), colunas[3], 9);
    page.drawLine({ start: { x: m + 440, y: y - 2 }, end: { x: m + largura, y: y - 2 }, thickness: 0.4, color: cor });
    y -= 20;
  }
  if (linhas.length === 0) {
    texto("Nenhuma entrega registrada.", m, 9);
    y -= 20;
  }
  y -= 40;
  if (y < m + 30) {
    page = pdf.addPage([595.28, 841.89]);
    y = page.getHeight() - m - 40;
  }
  page.drawLine({ start: { x: m, y }, end: { x: m + 230, y }, thickness: 0.6, color: cor });
  y -= 13;
  texto("Colaborador(a)", m, 9);
  return pdf.save();
}
