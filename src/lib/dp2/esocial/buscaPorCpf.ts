// A busca de colaboradores no eSocial por CPF e admissão (13/11/2026,
// funcionalidade-671), como a Domínio faz: o DP informa a lista, o Assinador
// local consulta o eSocial com o certificado de quem está usando, e o que vier
// cai na mesma prévia da importação pelo .zip (importacao.ts).
//
// As regras do eSocial (Manual do Desenvolvedor v1.16, 7.7 e 7.8):
// - até 10 acessos por dia por empregador, somando consulta e download;
// - nenhuma consulta do dia 1 ao 7 de cada mês;
// - a consulta do trabalhador é por CPF e por um período de até 31 dias, e a
//   data é a de RECEPÇÃO do evento, não a de admissão;
// - o download aceita até 50 eventos por pedido.
//
// O S-2200 sai antes do início do trabalho (ou logo depois, em admissão
// atrasada), então a janela da consulta vai de 20 dias antes a 10 dias depois
// da admissão. Quem foi admitido antes de a empresa entrar no eSocial teve o
// S-2200 enviado na carga inicial: nesse caso o DP informa, no lugar da
// admissão, a data em que a empresa começou a enviar (mostrado como dica).
//
// Puro, sem banco.

import { cpfValido, digitos } from "./documentos";

export const LIMITE_DE_ACESSOS_POR_DIA = 10;
export const EVENTOS_POR_DOWNLOAD = 50;

export type SituacaoDaBusca = "PENDENTE" | "ENCONTRADO" | "NAO_ENCONTRADO" | "BAIXADO" | "ERRO";

export type ItemDaBusca = {
  cpf: string;
  /** "AAAA-MM-DD": a admissão (ou a data de envio do S-2200, na carga inicial). */
  admissao: string;
  situacao: SituacaoDaBusca;
  /** Os Id dos eventos achados, para o download. */
  ids: string[];
  mensagem: string | null;
};

/** "AAAA-MM-DD" do dia em Brasília. */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Do dia 1 ao 7 o eSocial não aceita consultas. */
export function consultaBloqueadaHoje(agora = new Date()): boolean {
  return Number(hojeEmBrasilia(agora).slice(8, 10)) <= 7;
}

function dataDaLinha(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return validar(`${m[3]}-${m[2]}-${m[1]}`);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return validar(t);
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (m) return validar(`${m[3]}-${m[2]}-${m[1]}`);
  return null;
}

function validar(iso: string): string | null {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * A lista colada ou enviada (.txt/.csv): uma pessoa por linha, CPF e data de
 * admissão separados por ";", tab, vírgula ou espaço. Cabeçalho e linhas vazias
 * são ignorados; CPF repetido vale uma vez.
 */
export function lerListaDeCpfs(texto: string): { itens: ItemDaBusca[]; erros: string[] } {
  const itens: ItemDaBusca[] = [];
  const erros: string[] = [];
  const vistos = new Set<string>();
  texto.split(/\r?\n/).forEach((linha, i) => {
    const l = linha.trim();
    if (!l) return;
    const partes = l.split(/[;\t,]|\s+/).map((p) => p.trim()).filter(Boolean);
    const cpfBruto = partes.find((p) => digitos(p).length === 11 && !dataDaLinha(p));
    const dataBruta = partes.find((p) => dataDaLinha(p));
    if (!cpfBruto && !dataBruta && i === 0) return; // cabeçalho
    const cpf = digitos(cpfBruto);
    const admissao = dataBruta ? dataDaLinha(dataBruta) : null;
    if (!cpfValido(cpf)) {
      erros.push(`Linha ${i + 1}: CPF inválido.`);
      return;
    }
    if (!admissao) {
      erros.push(`Linha ${i + 1}: falta a data de admissão (dd/mm/aaaa).`);
      return;
    }
    if (vistos.has(cpf)) return;
    vistos.add(cpf);
    itens.push({ cpf, admissao, situacao: "PENDENTE", ids: [], mensagem: null });
  });
  return { itens, erros };
}

/**
 * O período da consulta: de 20 dias antes a 10 dias depois da admissão (31
 * dias no total), com o fim até uma hora antes de agora, como o eSocial exige.
 */
export function janelaDaConsulta(admissao: string, agora = new Date()): { dtIni: string; dtFim: string } {
  const base = new Date(`${admissao}T00:00:00-03:00`);
  const ini = new Date(base.getTime() - 20 * 86_400_000);
  let fim = new Date(base.getTime() + 11 * 86_400_000 - 1000);
  const limite = new Date(agora.getTime() - 60 * 60 * 1000);
  if (fim > limite) fim = limite;
  const local = (d: Date) => {
    const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);
    return p.replace(" ", "T");
  };
  return { dtIni: local(ini), dtFim: local(fim) };
}

export function acessosDoDia(acessos: unknown, dia: string): number {
  const o = (acessos ?? {}) as Record<string, unknown>;
  const n = Number(o[dia] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Quantos acessos ainda cabem hoje. Com eventos achados para baixar, um
 * acesso fica guardado para o download (cada download leva até 50 eventos).
 */
export function acessosLivres(usadosHoje: number) {
  return Math.max(0, LIMITE_DE_ACESSOS_POR_DIA - usadosHoje);
}

/** Os Id ainda não baixados, em pacotes de até 50. */
export function pacotesParaBaixar(itens: ItemDaBusca[]): { cpfs: string[]; ids: string[] }[] {
  const pacotes: { cpfs: string[]; ids: string[] }[] = [];
  let atual = { cpfs: [] as string[], ids: [] as string[] };
  for (const it of itens.filter((x) => x.situacao === "ENCONTRADO" && x.ids.length > 0)) {
    if (atual.ids.length + it.ids.length > EVENTOS_POR_DOWNLOAD && atual.ids.length > 0) {
      pacotes.push(atual);
      atual = { cpfs: [], ids: [] };
    }
    atual.cpfs.push(it.cpf);
    atual.ids.push(...it.ids.slice(0, EVENTOS_POR_DOWNLOAD));
  }
  if (atual.ids.length) pacotes.push(atual);
  return pacotes;
}

export function lerItens(bruto: unknown): ItemDaBusca[] {
  return Array.isArray(bruto) ? (bruto as ItemDaBusca[]).filter((i) => i && typeof i.cpf === "string") : [];
}
