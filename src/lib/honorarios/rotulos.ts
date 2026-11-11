// As palavras das telas de "Contratos e honorários" — as mesmas do Aditiva
// Pronto, que a Controladoria e o Societário já conhecem. Arquivo puro: serve à
// página (servidor) e aos componentes do navegador.

import type { TomDoSelo } from "@/components/ui/Selo";
import { formatCalendarDate, formatInstantDate, formatInstantDateTime } from "@/lib/format";
import type { AlertaHonorario, ComparacaoAcessorias, EstadoTexto, SituacaoHonorario } from "./regras/honorariosRegras";
import type { MotivoStatusContrato, StatusContrato } from "./regras/auditContratosStatus";
import type { StatusAditivo } from "./regras/auditAditivosStatus";
import type { SinalAssinatura } from "./regras/auditAditivosClassificador";

// ── Honorários ─────────────────────────────────────────────────────

export const ROTULO_SITUACAO: Record<SituacaoHonorario, string> = {
  CONFERIR: "Conferir",
  DIGITALIZADO: "Digitalizado",
  SEM_VALOR: "Sem valor",
  AGUARDANDO_LEITURA: "Aguardando leitura",
  SEM_DOCUMENTO: "Sem documento",
  LIDO: "Lido",
  MANUAL: "Informado",
  DISTRATO: "Distrato",
};

export const TOM_SITUACAO: Record<SituacaoHonorario, TomDoSelo> = {
  CONFERIR: "atencao",
  DIGITALIZADO: "atencao",
  SEM_VALOR: "perigo",
  AGUARDANDO_LEITURA: "neutro",
  SEM_DOCUMENTO: "perigo",
  LIDO: "sucesso",
  MANUAL: "marca",
  DISTRATO: "neutro",
};

export const ROTULO_ALERTA: Record<AlertaHonorario, string> = {
  minuta: "Valor tirado de minuta",
  sem_assinatura: "Documento sem assinatura",
  mencao: "Valor fora da cláusula de honorário",
  acordo_comercial: "Valor de acordo comercial, não de contrato",
  valor_condicional: "Valor depende do faturamento",
  valores_diferentes: "Documentos da mesma data com valores diferentes",
  documento_mais_novo_sem_valor: "Há contrato mais novo sem valor lido",
  mais_recente_digitalizado: "O arquivo mais recente é foto ou escaneado: confira o valor nele",
  documento_depois_do_informado: "Chegou documento com outro valor depois do valor informado",
  sem_data: "Sem data no texto: usou a data do arquivo",
  leitura_incompleta: "O robô ainda está lendo documentos desta empresa",
  documento_sem_cnpj: "Há documento mais novo, sem o CNPJ da empresa, com outro valor (pasta de grupo?)",
  cnpj_diferente: "O documento cita outro CNPJ: outra empresa ou erro de digitação no contrato",
};

export const ROTULO_COMPARACAO: Record<ComparacaoAcessorias, string> = {
  NAO_CONFERIDO: "Não conferido",
  NAO_ENCONTRADA: "Não está no Acessórias",
  SEM_VALOR_NO_APP: "",
  IGUAL: "Igual",
  DIFERENTE: "Diferente",
};

export const ROTULO_ESTADO_DO_TEXTO: Record<EstadoTexto, string> = {
  ok: "Lido",
  sem_texto: "Sem texto (digitalizado)",
  erro: "Erro na leitura",
  pendente: "Aguardando o robô",
  imagem: "Imagem (digitalizado)",
};

export const ROTULO_TIPO_DOCUMENTO: Record<"contrato" | "aditivo" | "outro", string> = {
  contrato: "Contrato",
  aditivo: "Aditivo",
  outro: "Outro",
};

// ── Contratos ──────────────────────────────────────────────────────

export const ROTULO_STATUS_CONTRATO: Record<StatusContrato, string> = {
  NAO_LOCALIZADO: "Não localizado",
  MINUTA: "Minuta",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  REVISAR: "Revisar",
  ASSINADO: "Assinado",
  DISTRATO: "Distrato",
};

export const TOM_STATUS_CONTRATO: Record<StatusContrato, TomDoSelo> = {
  NAO_LOCALIZADO: "perigo",
  MINUTA: "atencao",
  AGUARDANDO_ASSINATURA: "atencao",
  REVISAR: "atencao",
  ASSINADO: "sucesso",
  DISTRATO: "neutro",
};

export const ROTULO_MOTIVO_CONTRATO: Record<MotivoStatusContrato, string> = {
  SEM_VINCULO: "Sem pasta vinculada",
  SEM_PASTA_CONTRATO: "Sem subpasta de contrato",
  SEM_CONTRATO_SERVICO: "Contrato de prestação de serviços não localizado",
  MULTIPLOS_CONTRATOS_ATUAIS: "Múltiplos contratos diferentes",
  SOMENTE_CONTRATO_ANTIGO: "Somente contrato marcado como antigo",
  CONTRATO_ASSINADO_PELO_NOME: "Assinado pela indicação no nome",
  ARQUIVO_NAO_IDENTIFICADO: "PDF ou imagem exige identificação manual",
  PDF_NAO_ANALISADO: "PDF não analisado tecnicamente pelo coletor",
  FORMATO_EXIGE_REVISAO: "Formato exige conferência manual",
  CONTRATO_DIGITAL_ASSINADO: "Assinatura digital detectada",
  PDF_SEM_ASSINATURA: "PDF sem assinatura digital",
  APENAS_MINUTA: "Somente arquivo editável ou minuta",
  DISTRATO_PRESTACAO: "Distrato da prestação de serviços",
};

// ── Aditivos ───────────────────────────────────────────────────────

export const ROTULO_STATUS_ADITIVO: Record<StatusAditivo, string> = {
  SEM_VINCULO: "Sem pasta vinculada",
  SEM_PASTA_CONTRATO: "Sem subpasta de contrato",
  SEM_ADITIVO: "Sem aditivo do ano",
  SO_DOCX: "Só o Word",
  PDF_SEM_ASSINATURA: "PDF sem assinatura",
  ASSINADO_PELO_NOME: "Assinado (pelo nome)",
  ASSINADO_DIGITAL: "Assinado digitalmente",
  DISTRATO: "Distrato",
};

export const TOM_STATUS_ADITIVO: Record<StatusAditivo, TomDoSelo> = {
  SEM_VINCULO: "perigo",
  SEM_PASTA_CONTRATO: "perigo",
  SEM_ADITIVO: "perigo",
  SO_DOCX: "atencao",
  PDF_SEM_ASSINATURA: "atencao",
  ASSINADO_PELO_NOME: "sucesso",
  ASSINADO_DIGITAL: "sucesso",
  DISTRATO: "neutro",
};

/** O termo de 13º na coluna própria (rótulo curto). */
export const ROTULO_DECIMO: Partial<Record<StatusAditivo, string>> = {
  ASSINADO_DIGITAL: "Assinado",
  ASSINADO_PELO_NOME: "Assinado (nome)",
  PDF_SEM_ASSINATURA: "Sem assinatura",
  SO_DOCX: "Só o Word",
};

export const ROTULO_ASSINATURA: Record<SinalAssinatura, string> = {
  digital: "Assinatura digital",
  pelo_nome: "Assinado (pelo nome)",
  declarada_sem: "“Sem assinatura” no nome",
  nenhuma: "Sem assinatura",
  nao_se_aplica: "Word (rascunho)",
};

// ── Formatos ───────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const moeda = (v: number | null | undefined) => (v === null || v === undefined ? "—" : BRL.format(v));

/** "AAAA-MM-DD" (data do texto, sem fuso) ou um instante → "dd/mm/aaaa". */
export function dataCurta(d: string | Date | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return formatCalendarDate(new Date(`${d}T00:00:00Z`));
  return formatInstantDate(new Date(d));
}

export function dataHora(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return formatInstantDateTime(new Date(d));
}

/** "agora há pouco", "há 5 min", "há 3 h" ou "em 11/11/2026 14:30". */
export function tempoRelativo(d: Date, agora = new Date()): string {
  const min = Math.floor((agora.getTime() - new Date(d).getTime()) / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  return `em ${dataHora(d)}`;
}

/** Busca sem acento e sem maiúscula; com 3+ dígitos, casa também o CNPJ. */
export function casaBusca(busca: string | undefined, textos: (string | null | undefined)[], cnpj?: string): boolean {
  const termo = (busca ?? "").trim();
  if (!termo) return true;
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = sem(termo);
  if (textos.some((x) => x && sem(x).includes(t))) return true;
  const digitos = termo.replace(/\D/g, "");
  return !!cnpj && digitos.length >= 3 && cnpj.replace(/\D/g, "").includes(digitos);
}
