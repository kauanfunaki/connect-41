// Onde cada certificado é usado e o que para se ele vencer (05/11/2026, opção A
// da tela Certificados) — a regra, sem banco.
//
// A queixa era que importar os certificados e olhar o vencimento numa tabela
// não servia para mais nada: o Connect não sabia que o robô do Societário, o
// Integra Contador (Serpro) e o SIMA dependem de certificado, nem de qual. Aqui
// cada uso tem um código, o selo da coluna "Usado por" e o impacto escrito do
// "Se vencer, para…", que também vai no aviso de vencimento.
//
// O uso é do **documento** (CNPJ/CPF), não do arquivo: renovar gera outro
// certificado do mesmo CNPJ, e o robô passa a usar o novo. Assim o certificado
// novo herda os usos e o antigo ("substituído") deixa de importar.
//
// Dois jeitos de um uso existir:
// - registrado: o sistema viu o certificado em ação (a tarefa do robô voltou
//   com ele, o Serpro chamou com ele) — tem último uso e contagem por dia;
// - declarado: quem coordena marcou à mão no "Usado por" (a NFS-e ainda não
//   emite pelo Connect; a procuração no e-CAC é feita fora dele).

import { diasAte } from "@/lib/societario/licencas";
import type { SituacaoDoCertificado } from "./certificados";

/** Uso registrado há mais que isto, e não declarado, deixa de contar. */
export const DIAS_SEM_USO = 90;
/** A janela da contagem de usos. */
export const DIAS_DA_CONTAGEM = 30;

type DefinicaoDoUso = {
  /** O selo da coluna "Usado por". */
  rotulo: string;
  /** Completa "Se vencer, para…". */
  impacto: string;
  /** O impacto curto, para o aviso (que para em 255 caracteres). */
  curto: string;
};

/**
 * Os usos que o Connect conhece, na ordem em que aparecem. O robô entra por
 * tipo de tarefa (`robo:<tipo>`, o mesmo nome de `robo/tarefas.ts`): a tarefa
 * do SIMA é do robô, mas para quem lê a tela ela é "o SIMA".
 */
export const USOS = {
  serpro: { rotulo: "e-CAC (Serpro)", impacto: "as consultas ao e-CAC pelo Integra Contador", curto: "e-CAC (Serpro)" },
  "robo:vigiar_ie": { rotulo: "Robô · IE", impacto: "a leitura da inscrição estadual pelo robô", curto: "robô da IE" },
  "robo:observar_sima": { rotulo: "SIMA", impacto: "o acompanhamento dos protocolos do SIMA", curto: "SIMA" },
  "robo:imprimir_alvara": { rotulo: "Robô · alvará", impacto: "a impressão do alvará pelo robô", curto: "robô do alvará" },
  nfse: { rotulo: "NFS-e", impacto: "a emissão de NFS-e", curto: "NFS-e" },
  procuracao_ecac: { rotulo: "Procuração e-CAC", impacto: "a autorização de acesso (procuração) no e-CAC", curto: "procuração no e-CAC" },
} as const satisfies Record<string, DefinicaoDoUso>;

export type UsoConhecido = keyof typeof USOS;
/** O uso livre, declarado à mão com um texto. */
export const USO_OUTRO = "outro";
/** Máximo do texto do uso "outro" (coluna `descricao`). */
export const MAXIMO_DA_DESCRICAO = 80;

const ORDEM: string[] = [...Object.keys(USOS), USO_OUTRO];

export function ehUsoConhecido(uso: string): uso is UsoConhecido {
  return Object.prototype.hasOwnProperty.call(USOS, uso);
}

/** O código do uso de uma tarefa do robô. */
export function usoDaTarefa(tipo: string): string {
  return `robo:${tipo}`;
}

/** O que quem coordena pode marcar no "Usado por". */
export const USOS_DECLARAVEIS: { uso: string; rotulo: string }[] = [
  ...Object.entries(USOS).map(([uso, d]) => ({ uso, rotulo: d.rotulo })),
  { uso: USO_OUTRO, rotulo: "Outro" },
];

export type UsoDoDocumento = {
  uso: string;
  descricao: string | null;
  declarado: boolean;
  ultimoUsoAt: Date | null;
  /** Usos registrados nos últimos 30 dias. */
  vezes30?: number;
};

export function rotuloDoUso(u: Pick<UsoDoDocumento, "uso" | "descricao">): string {
  if (ehUsoConhecido(u.uso)) return USOS[u.uso].rotulo;
  if (u.uso === USO_OUTRO) return u.descricao?.trim() || "Outro uso";
  // Tarefa nova do robô que ainda não ganhou rótulo aqui.
  if (u.uso.startsWith("robo:")) return "Robô do Societário";
  return u.uso;
}

function impactoDoUso(u: Pick<UsoDoDocumento, "uso" | "descricao">, curto: boolean): string {
  if (ehUsoConhecido(u.uso)) return curto ? USOS[u.uso].curto : USOS[u.uso].impacto;
  if (u.uso === USO_OUTRO) return u.descricao?.trim() || "outro uso declarado";
  if (u.uso.startsWith("robo:")) return curto ? "robô do Societário" : "uma tarefa do robô do Societário";
  return u.uso;
}

/** Usado há no máximo `DIAS_SEM_USO` dias? */
export function usadoRecentemente(ultimoUsoAt: Date | null, agora: Date): boolean {
  return ultimoUsoAt !== null && agora.getTime() - ultimoUsoAt.getTime() <= DIAS_SEM_USO * 86_400_000;
}

/**
 * Os usos que valem hoje, na ordem do catálogo: os declarados e os registrados
 * nos últimos 90 dias. Um uso registrado que parou há meses (a tarefa saiu do
 * robô, o Serpro trocou de certificado) não segura mais a renovação.
 */
export function usosQueContam<T extends UsoDoDocumento>(usos: T[], agora: Date): T[] {
  const pos = (u: string) => {
    const i = ORDEM.indexOf(u);
    return i < 0 ? ORDEM.length : i;
  };
  return usos.filter((u) => u.declarado || usadoRecentemente(u.ultimoUsoAt, agora)).sort((a, b) => pos(a.uso) - pos(b.uso) || a.uso.localeCompare(b.uso));
}

function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** "Se vencer, para…": o impacto escrito, ou null quando nada depende dele. */
export function seVencerPara(usos: UsoDoDocumento[], agora: Date): string | null {
  const valem = usosQueContam(usos, agora);
  if (!valem.length) return null;
  return juntar([...new Set(valem.map((u) => impactoDoUso(u, false)))]);
}

/** O mesmo, curto, para o aviso. */
export function seVencerParaCurto(usos: UsoDoDocumento[], agora: Date): string | null {
  const valem = usosQueContam(usos, agora);
  if (!valem.length) return null;
  return juntar([...new Set(valem.map((u) => impactoDoUso(u, true)))]);
}

/** O último uso registrado de qualquer tipo; null = nunca registrado. */
export function ultimoUso(usos: Pick<UsoDoDocumento, "ultimoUsoAt">[]): Date | null {
  let ultimo: Date | null = null;
  for (const u of usos) if (u.ultimoUsoAt && (!ultimo || u.ultimoUsoAt > ultimo)) ultimo = u.ultimoUsoAt;
  return ultimo;
}

/**
 * Candidato a não renovar: nenhum uso declarado e nenhum registrado nos
 * últimos 90 dias.
 */
export function semUsoHa90Dias(usos: UsoDoDocumento[], agora: Date): boolean {
  return usosQueContam(usos, agora).length === 0;
}

export type UsoDeclarado = { uso: string; descricao: string | null };

/** Confere o que veio do formulário do "Usado por". null = inválido. */
export function validarUsosDeclarados(bruto: unknown): UsoDeclarado[] | null {
  if (!Array.isArray(bruto) || bruto.length > USOS_DECLARAVEIS.length) return null;
  const validos = new Set(USOS_DECLARAVEIS.map((u) => u.uso));
  const vistos = new Map<string, UsoDeclarado>();
  for (const item of bruto) {
    if (!item || typeof item !== "object") return null;
    const uso = String((item as { uso?: unknown }).uso ?? "");
    if (!validos.has(uso)) return null;
    const descricao = String((item as { descricao?: unknown }).descricao ?? "").trim().slice(0, MAXIMO_DA_DESCRICAO) || null;
    if (uso === USO_OUTRO && !descricao) return null;
    vistos.set(uso, { uso, descricao: uso === USO_OUTRO ? descricao : null });
  }
  return [...vistos.values()];
}

// ─── O aviso de vencimento ─────────────────────────────────────────────────

/**
 * O texto do aviso de 60/30/15/7/0 dias (`checkCertificadosVencendo` em
 * alerts.ts), agora dizendo o que para. A notificação guarda 255 caracteres:
 * o impacto encolhe antes do resto.
 */
export function mensagemDoAviso(p: { titular: string; expiresAt: Date; agora: Date; impactoCurto: string | null }): string {
  const dias = diasAte(p.expiresAt, p.agora);
  const data = p.expiresAt.toISOString().slice(0, 10).split("-").reverse().join("/");
  const quando = dias < 0 ? `venceu em ${data}` : dias === 0 ? "vence hoje" : `vence em ${dias} dia(s), ${data}`;
  const base = `Certificado digital de ${p.titular} ${quando}.`;
  if (!p.impactoCurto) return base.slice(0, 255);
  const verbo = dias < 0 ? "Parou" : "Se vencer, para";
  const resto = 255 - base.length - verbo.length - 4; // " " + ": " + "."
  if (resto < 12) return base.slice(0, 255);
  const impacto = p.impactoCurto.length > resto ? `${p.impactoCurto.slice(0, resto - 1).trimEnd()}…` : p.impactoCurto;
  return `${base} ${verbo}: ${impacto}.`;
}

// ─── A renovação ───────────────────────────────────────────────────────────

export const STATUS_DA_RENOVACAO = ["A_PEDIR", "PEDIDO", "COMPRADO", "NAO_RENOVAR"] as const;
export type StatusDaRenovacao = (typeof STATUS_DA_RENOVACAO)[number];

export const ROTULO_DA_RENOVACAO: Record<StatusDaRenovacao, string> = {
  A_PEDIR: "A pedir",
  PEDIDO: "Pedido",
  COMPRADO: "Comprado",
  NAO_RENOVAR: "Não renovar",
};

export const PAGA_QUEM = ["CLIENTE", "ESCRITORIO"] as const;
export type PagaQuem = (typeof PAGA_QUEM)[number];
export const ROTULO_DE_QUEM_PAGA: Record<PagaQuem, string> = { CLIENTE: "paga o cliente", ESCRITORIO: "paga a 41" };

export function ehStatusDaRenovacao(v: unknown): v is StatusDaRenovacao {
  return typeof v === "string" && (STATUS_DA_RENOVACAO as readonly string[]).includes(v);
}

/**
 * Em que pé está a renovação, para a coluna: o que alguém marcou, ou "A pedir"
 * quando o certificado já entrou na faixa de renovar e ninguém mexeu. Longe de
 * vencer e sem marca: nada (a coluna mostra "—").
 */
export function statusDaRenovacao(gravado: string | null, situacao: SituacaoDoCertificado): StatusDaRenovacao | null {
  if (ehStatusDaRenovacao(gravado)) return gravado;
  return situacao === "vencido" || situacao === "a_renovar" ? "A_PEDIR" : null;
}

/** "190", "190,00", "R$ 1.140,50" → centavos. Vazio = null; inválido = undefined. */
export function lerCusto(texto: string | null | undefined): number | null | undefined {
  const limpo = (texto ?? "").replace(/R\$|\s/g, "");
  if (!limpo) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return undefined;
  const [inteiro, decimal = ""] = limpo.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return centavos <= 100_000_000 ? centavos : undefined;
}

export type RenovacaoValidada = {
  status: StatusDaRenovacao | null;
  responsavelId: string | null;
  custoCentavos: number | null;
  pagaQuem: PagaQuem | null;
};

/** Valida o formulário da renovação. */
export function validarRenovacao(o: { status?: unknown; responsavelId?: unknown; custo?: unknown; pagaQuem?: unknown }): { ok: true; dados: RenovacaoValidada } | { ok: false; erro: string } {
  const status = o.status === "" || o.status == null ? null : o.status;
  if (status !== null && !ehStatusDaRenovacao(status)) return { ok: false, erro: "Situação da renovação inválida." };
  const custo = lerCusto(typeof o.custo === "string" ? o.custo : o.custo == null ? "" : String(o.custo));
  if (custo === undefined) return { ok: false, erro: "Custo inválido: use um valor em reais, como 190 ou 1.140,00." };
  const paga = o.pagaQuem === "" || o.pagaQuem == null ? null : o.pagaQuem;
  if (paga !== null && !(PAGA_QUEM as readonly unknown[]).includes(paga)) return { ok: false, erro: "Escolha quem paga: o cliente ou a 41." };
  const resp = typeof o.responsavelId === "string" && o.responsavelId.trim() ? o.responsavelId.trim() : null;
  if (resp !== null && !/^[0-9a-zA-Z-]{1,64}$/.test(resp)) return { ok: false, erro: "Responsável inválido." };
  return { ok: true, dados: { status: status as StatusDaRenovacao | null, responsavelId: resp, custoCentavos: custo, pagaQuem: paga as PagaQuem | null } };
}

// ─── Os totais pelo risco ──────────────────────────────────────────────────

export type LinhaParaTotais = {
  situacao: SituacaoDoCertificado;
  expiresAt: Date;
  usos: UsoDoDocumento[];
  renovacaoStatus: string | null;
  renovacaoCustoCentavos: number | null;
};

/** Mês civil de Brasília, "AAAA-MM". */
export function mesDeBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
}

export type Recorte = "30-dias" | "param" | "sem-uso" | "mes";

/** Em qual recorte de risco a linha cai (os quatro cartões de totais). */
export function noRecorte(r: Recorte, l: LinhaParaTotais, agora: Date): boolean {
  if (l.situacao === "substituido") return false;
  const dias = diasAte(l.expiresAt, agora);
  if (r === "30-dias") return dias <= 30;
  if (r === "param") return (l.situacao === "vencido" || l.situacao === "a_renovar") && usosQueContam(l.usos, agora).length > 0;
  if (r === "sem-uso") return semUsoHa90Dias(l.usos, agora);
  // Renovação do mês: vence neste mês civil e não foi marcado "não renovar".
  return mesDeBrasilia(l.expiresAt) === mesDeBrasilia(agora) && l.renovacaoStatus !== "NAO_RENOVAR";
}

export type TotaisPorRisco = {
  vencem30: number;
  vencidos: number;
  aRenovar: number;
  paramAlgo: number;
  semUso: number;
  doMes: number;
  custoDoMesCentavos: number;
  doMesSemCusto: number;
};

export function totaisPorRisco(linhas: LinhaParaTotais[], agora: Date): TotaisPorRisco {
  const t: TotaisPorRisco = { vencem30: 0, vencidos: 0, aRenovar: 0, paramAlgo: 0, semUso: 0, doMes: 0, custoDoMesCentavos: 0, doMesSemCusto: 0 };
  for (const l of linhas) {
    if (l.situacao === "substituido") continue;
    if (l.situacao === "vencido") t.vencidos++;
    if (l.situacao === "vencido" || l.situacao === "a_renovar") t.aRenovar++;
    if (noRecorte("30-dias", l, agora)) t.vencem30++;
    if (noRecorte("param", l, agora)) t.paramAlgo++;
    if (noRecorte("sem-uso", l, agora)) t.semUso++;
    if (noRecorte("mes", l, agora)) {
      t.doMes++;
      if (l.renovacaoCustoCentavos === null) t.doMesSemCusto++;
      else t.custoDoMesCentavos += l.renovacaoCustoCentavos;
    }
  }
  return t;
}
