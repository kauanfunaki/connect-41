// A ficha da vaga (Vagas › uma vaga), nas escolhas do Kauan de 14/10/2026 —
// página "Telas do Recrutamento", aba Vaga:
//
// - Vaga · 1 B, "Faixa de fatos": cargo, vagas, prioridade, abertura, contrato e
//   salário numa faixa só, no lugar da linha de rótulo e valor de "Detalhes".
// - Vaga · 2 B, "Faixa do portal": a vaga publicada ganha uma faixa azul-clara
//   com Abrir, Copiar e WhatsApp; a não publicada, uma linha discreta dizendo
//   por quê.
//
// Funções puras: a página monta, aqui só se decide o que aparece. Regra da
// casa (a mesma do 41 Carreiras): fato sem valor some — nada de "—" nem "A
// combinar".

import type { VagaContrato, VagaModalidade, VagaPrioridade, VagaStatus } from "@/generated/prisma/enums";
import { CONTRATO_LABEL, MODALIDADE_LABEL, hojeEmBrasilia } from "@/lib/carreiras/portal";
import { dataCompleta, linksDeCompartilhamento, localLegivel } from "@/lib/carreiras/apresentacao";
import { formatInstantDate } from "@/lib/format";

const DIA = 86_400_000;

export const ROTULO_DA_PRIORIDADE: Record<VagaPrioridade, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
};

export type ChaveDoFatoDaFicha = "cargo" | "vagas" | "prioridade" | "abertura" | "contrato" | "salario";

export type FatoDaFicha = {
  chave: ChaveDoFatoDaFicha;
  rotulo: string;
  valor: string;
  /** A linha pequena embaixo do valor ("1 preenchida", "há 12 dias"). */
  detalhe?: string;
  /** Pede atenção: a prioridade alta. */
  destaque?: boolean;
};

/** "hoje", "ontem", "há 12 dias" — em dias de calendário de Brasília. Não para de contar: vaga velha é informação. */
export function abertaHa(abertaEm: Date, agora: Date): string {
  const dias = Math.round((hojeEmBrasilia(agora).getTime() - hojeEmBrasilia(abertaEm).getTime()) / DIA);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** A faixa salarial cadastrada, mostrada ou não no portal; null sem valor nenhum. */
export function faixaCadastrada(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return min === max ? REAIS.format(min) : `${REAIS.format(min)} a ${REAIS.format(max)}`;
  if (min !== null) return `A partir de ${REAIS.format(min)}`;
  if (max !== null) return `Até ${REAIS.format(max)}`;
  return null;
}

export type VagaDaFicha = {
  cargo: string | null;
  quantidade: number;
  /** Candidaturas contratadas — as vagas preenchidas. */
  contratadas: number;
  prioridade: VagaPrioridade;
  abertaEm: Date;
  encerradaEm: Date | null;
  contrato: VagaContrato | null;
  modalidade: VagaModalidade | null;
  /** O local já resolvido (`localDaVaga`: a cidade da vaga ou a da empresa). */
  cidade: string | null;
  uf: string | null;
  salarioMin: number | null;
  salarioMax: number | null;
  mostrarSalario: boolean;
};

/** Os fatos da faixa, na ordem da tela, só os que têm valor. */
export function fatosDaFicha(v: VagaDaFicha, agora: Date): FatoDaFicha[] {
  const fatos: FatoDaFicha[] = [];
  if (v.cargo?.trim()) fatos.push({ chave: "cargo", rotulo: "Cargo", valor: v.cargo.trim() });

  fatos.push({
    chave: "vagas",
    rotulo: v.quantidade === 1 ? "Vaga" : "Vagas",
    valor: String(v.quantidade),
    detalhe:
      v.contratadas === 0 ? "nenhuma preenchida" : v.contratadas === 1 ? "1 preenchida" : `${v.contratadas} preenchidas`,
  });

  fatos.push({
    chave: "prioridade",
    rotulo: "Prioridade",
    valor: ROTULO_DA_PRIORIDADE[v.prioridade],
    destaque: v.prioridade === "ALTA",
  });

  fatos.push({
    chave: "abertura",
    rotulo: "Aberta em",
    valor: formatInstantDate(v.abertaEm, { day: "2-digit", month: "2-digit", year: "numeric" }),
    detalhe: v.encerradaEm
      ? `encerrada em ${formatInstantDate(v.encerradaEm, { day: "2-digit", month: "2-digit", year: "numeric" })}`
      : abertaHa(v.abertaEm, agora),
  });

  const contrato = [v.contrato ? CONTRATO_LABEL[v.contrato] : null, v.modalidade ? MODALIDADE_LABEL[v.modalidade] : null]
    .filter(Boolean)
    .join(" · ");
  const local = localLegivel(v.cidade, v.uf)?.replace(" – ", "/") ?? null;
  if (contrato) {
    fatos.push({ chave: "contrato", rotulo: v.contrato ? "Contrato" : "Modalidade", valor: contrato, ...(local ? { detalhe: local } : {}) });
  } else if (local) {
    fatos.push({ chave: "contrato", rotulo: "Local", valor: local });
  }

  const salario = faixaCadastrada(v.salarioMin, v.salarioMax);
  if (salario) {
    fatos.push({ chave: "salario", rotulo: "Salário", valor: salario, ...(v.mostrarSalario ? {} : { detalhe: "não aparece no portal" }) });
  }
  return fatos;
}

// ─── O portal ───────────────────────────────────────────────────────────────

export type SituacaoNoPortal =
  | { publicada: true }
  | { publicada: false; motivo: "nao_marcada" }
  | { publicada: false; motivo: "fora_do_ar"; status: VagaStatus }
  | { publicada: false; motivo: "prazo_vencido"; prazo: string };

/**
 * A vaga está no portal agora? A mesma regra da lista do portal
 * (`whereDasVagasDoPortal`): marcada para o portal, Aberta e dentro do prazo.
 * Marcada mas fora do ar diz o porquê — senão o recrutador vê "publicada" e o
 * candidato não acha a vaga.
 */
export function situacaoNoPortal(
  v: { isPublic: boolean; status: VagaStatus; applicationDeadline: Date | null },
  agora: Date
): SituacaoNoPortal {
  if (!v.isPublic) return { publicada: false, motivo: "nao_marcada" };
  if (v.status !== "ABERTA") return { publicada: false, motivo: "fora_do_ar", status: v.status };
  if (v.applicationDeadline && v.applicationDeadline.getTime() < hojeEmBrasilia(agora).getTime()) {
    return { publicada: false, motivo: "prazo_vencido", prazo: dataCompleta(v.applicationDeadline) };
  }
  return { publicada: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O endereço para ler na faixa, sem o "https://" e com o id da vaga cortado:
 * "41carreiras.com.br/vagas/8c2f…". O endereço inteiro vai no botão de copiar.
 */
export function enderecoCurto(url: string): string {
  const semProtocolo = url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const partes = semProtocolo.split("/");
  const ultima = partes.at(-1) ?? "";
  if (partes.length > 1 && UUID.test(ultima)) partes[partes.length - 1] = `${ultima.slice(0, 4)}…`;
  return partes.join("/");
}

/**
 * O "WhatsApp" da faixa: abre o WhatsApp com a mensagem pronta e o link, para
 * o recrutador escolher o contato ou o grupo. A mesma mensagem do botão de
 * compartilhar da página da vaga no 41 Carreiras.
 */
export function linkDoWhatsApp(url: string, titulo: string, empresa: string): string {
  return linksDeCompartilhamento(url, titulo, empresa).whatsapp;
}
