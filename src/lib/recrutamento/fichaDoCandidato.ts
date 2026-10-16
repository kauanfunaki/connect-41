// A ficha do candidato (Recrutamento › Candidatos › ficha), redesenhada em
// 14/10/2026 a partir das escolhas do Kauan na página de alternativas (aba
// "Candidato"): duas colunas — o processo à esquerda, a pessoa à direita —,
// candidaturas em cartão com as etapas, o currículo num bloco próprio,
// documentos recolhidos com o resumo na linha e a edição no próprio bloco.
//
// Aqui fica o que é regra, sem banco nem tela: a marcação das cinco etapas, o
// resumo da linha dos documentos, a idade, o endereço numa linha e os campos
// de cada bloco editável.

import type { DocumentCategory, ProcessoSeletivoStatus } from "@/generated/prisma/enums";
import type { TomDoSelo } from "@/components/ui/Selo";
import { CATEGORY_LABEL } from "@/lib/document-categories";
import { formatCep, formatInstantDate } from "@/lib/format";
import { pick, pickDate } from "@/lib/forms";
import { STAGE_LABEL, STAGE_ORDER, stageIndex, type Stage } from "@/lib/recruitmentFunnel";
import { validatePersonFields } from "@/lib/validation/person";

// ─── Etapas da candidatura ──────────────────────────────────────────────────

/**
 * - `feita`: a pessoa passou por ela;
 * - `atual`: está nela agora (candidatura em andamento);
 * - `parou`: a candidatura saiu do processo nesta etapa (reprovada, desistiu, encerrada);
 * - `futura`: ainda não chegou.
 */
export type EstadoDaEtapa = "feita" | "atual" | "parou" | "futura";

export type EtapaMarcada = { chave: Stage; rotulo: string; estado: EstadoDaEtapa };

export type ResumoDaEtapa = {
  etapas: EtapaMarcada[];
  /** Em andamento: o nome da etapa, em destaque ("Entrevista"). Fora do andamento: null. */
  etapaAtual: string | null;
  /** O complemento na mesma linha: "etapa 2 de 5", "na Triagem". */
  detalhe: string | null;
  /** A situação, quando a candidatura saiu do andamento ("Reprovado"). */
  selo: { texto: string; tom: TomDoSelo } | null;
  /** A frase inteira, para o leitor de tela e a dica: "Reprovado na Triagem". */
  descricao: string;
};

/** "na Triagem", mas "no Teste". */
const NA_ETAPA: Record<Stage, string> = {
  TRIAGEM: "na Triagem",
  ENTREVISTA: "na Entrevista",
  TESTE: "no Teste",
  PROPOSTA: "na Proposta",
  CONTRATADO: "no Contratado",
};

const SAIU: Partial<Record<ProcessoSeletivoStatus, { texto: string; tom: TomDoSelo }>> = {
  REPROVADO: { texto: "Reprovado", tom: "neutro" },
  DESISTENTE: { texto: "Desistiu", tom: "neutro" },
  ENCERRADO: { texto: "Encerrado", tom: "neutro" },
};

/**
 * As cinco etapas do funil com a da candidatura marcada. O `stage` fica onde a
 * pessoa estava quando a candidatura foi reprovada ou encerrada (ver
 * recruitmentFunnel.ts), então dá para dizer "Reprovado na Triagem".
 */
export function etapasDaCandidatura(stage: string, status: ProcessoSeletivoStatus): ResumoDaEtapa {
  const atual = stageIndex(stage);
  const total = STAGE_ORDER.length;
  const rotuloAtual = STAGE_LABEL[STAGE_ORDER[atual]];
  const naEtapa = NA_ETAPA[STAGE_ORDER[atual]];
  const marcar = (estadoNa: (i: number) => EstadoDaEtapa): EtapaMarcada[] =>
    STAGE_ORDER.map((chave, i) => ({ chave, rotulo: STAGE_LABEL[chave], estado: estadoNa(i) }));

  if (status === "CONTRATADO") {
    return {
      etapas: marcar(() => "feita"),
      etapaAtual: null,
      detalhe: null,
      selo: { texto: "Contratado", tom: "sucesso" },
      descricao: "Contratado",
    };
  }

  if (status === "APROVADO") {
    return {
      etapas: marcar((i) => (i <= atual ? "feita" : "futura")),
      etapaAtual: null,
      detalhe: naEtapa,
      selo: { texto: "Aprovado", tom: "sucesso" },
      descricao: `Aprovado ${naEtapa}`,
    };
  }

  const saiu = SAIU[status];
  if (saiu) {
    return {
      etapas: marcar((i) => (i < atual ? "feita" : i === atual ? "parou" : "futura")),
      etapaAtual: null,
      detalhe: naEtapa,
      selo: saiu,
      descricao: `${saiu.texto} ${naEtapa}`,
    };
  }

  // Em andamento.
  return {
    etapas: marcar((i) => (i < atual ? "feita" : i === atual ? "atual" : "futura")),
    etapaAtual: rotuloAtual,
    detalhe: `etapa ${atual + 1} de ${total}`,
    selo: null,
    descricao: `${rotuloAtual}, etapa ${atual + 1} de ${total}`,
  };
}

/** A origem da candidatura para gente ler: "PORTAL" é o portal de vagas; o resto foi digitado. */
export function rotuloDaOrigem(origin: string | null | undefined): string | null {
  const o = origin?.trim();
  if (!o) return null;
  if (o.toUpperCase() === "PORTAL") return "Portal de vagas";
  return o;
}

/** "04/10" no ano corrente; "04/10/2025" em outro ano (o dia sozinho ficaria ambíguo). */
export function dataCurta(data: Date, agora: Date): string {
  const ano = (d: Date) => formatInstantDate(d, { year: "numeric" });
  const mesmoAno = ano(data) === ano(agora);
  return formatInstantDate(data, { day: "2-digit", month: "2-digit", ...(mesmoAno ? {} : { year: "numeric" }) });
}

/**
 * "e-mail, cidade e UF" — os campos que a leitura do currículo preencheu, numa
 * frase. Sigla (UF) fica em maiúsculas; o resto vai em minúsculas.
 */
export function listaNatural(itens: readonly string[]): string {
  const nomes = itens.map((i) => (i.length > 1 && i === i.toUpperCase() ? i : i.toLowerCase()));
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

// ─── Documentos ─────────────────────────────────────────────────────────────

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * A linha do bloco fechado: "3 arquivos · Currículo, Admissão · 1 sensível".
 * As categorias na ordem em que aparecem (a lista vem do mais novo), até três.
 */
export function resumoDosDocumentos(
  documentos: readonly { category: DocumentCategory; sensitive: boolean; expired?: boolean }[]
): string {
  if (documentos.length === 0) return "Nenhum arquivo";
  const categorias = [...new Set(documentos.map((d) => CATEGORY_LABEL[d.category]))];
  const partes = [plural(documentos.length, "arquivo", "arquivos")];
  partes.push(categorias.length > 3 ? `${categorias.slice(0, 3).join(", ")} e mais ${categorias.length - 3}` : categorias.join(", "));
  const sensiveis = documentos.filter((d) => d.sensitive).length;
  if (sensiveis > 0) partes.push(plural(sensiveis, "sensível", "sensíveis"));
  const vencidos = documentos.filter((d) => d.expired).length;
  if (vencidos > 0) partes.push(plural(vencidos, "vencido", "vencidos"));
  return partes.join(" · ");
}

// ─── Dados pessoais ─────────────────────────────────────────────────────────

/** Ano, mês e dia de hoje em Brasília. */
function hojeEmBrasilia(agora: Date): { ano: number; mes: number; dia: number } {
  const [dia, mes, ano] = formatInstantDate(agora, { day: "2-digit", month: "2-digit", year: "numeric" }).split("/").map(Number);
  return { ano, mes, dia };
}

/**
 * Idade completa. A data de nascimento é data-calendário (meia-noite UTC, como
 * todas do sistema); "hoje" é o dia em Brasília. Data no futuro ou absurda
 * (mais de 120 anos) não vira idade.
 */
export function idadeEm(nascimento: Date, agora: Date): number | null {
  const hoje = hojeEmBrasilia(agora);
  const ano = nascimento.getUTCFullYear();
  const mes = nascimento.getUTCMonth() + 1;
  const dia = nascimento.getUTCDate();
  let idade = hoje.ano - ano;
  if (hoje.mes < mes || (hoje.mes === mes && hoje.dia < dia)) idade--;
  return idade >= 0 && idade <= 120 ? idade : null;
}

export type EnderecoDaPessoa = {
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
  zipCode: string | null;
};

/** "Rua Mal. Floriano, 1820, Apto 34 · Rebouças · Curitiba/PR · CEP 80230-110", ou null sem nada. */
export function enderecoEmUmaLinha(p: EnderecoDaPessoa): string | null {
  const limpo = (v: string | null) => v?.trim() || null;
  const rua = [limpo(p.addressStreet), limpo(p.addressNumber), limpo(p.addressComplement)].filter(Boolean).join(", ");
  const cidade = [limpo(p.city), limpo(p.stateCode)].filter(Boolean).join("/");
  const cep = limpo(p.zipCode);
  const partes = [rua, limpo(p.neighborhood), cidade, cep ? `CEP ${formatCep(cep)}` : null].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

// ─── Edição no próprio bloco ────────────────────────────────────────────────

export const SECOES_DA_FICHA = ["identificacao", "contato", "endereco"] as const;
export type SecaoDaFicha = (typeof SECOES_DA_FICHA)[number];

export function ehSecaoDaFicha(v: unknown): v is SecaoDaFicha {
  return typeof v === "string" && (SECOES_DA_FICHA as readonly string[]).includes(v);
}

/** Os campos que cada bloco grava — o que vier a mais no formulário é ignorado. */
export const CAMPOS_DA_SECAO = {
  identificacao: ["name", "birthDate", "cpf", "rg", "education"],
  contato: ["email", "phone"],
  endereco: ["zipCode", "addressStreet", "addressNumber", "addressComplement", "neighborhood", "city", "stateCode"],
} as const satisfies Record<SecaoDaFicha, readonly string[]>;

/**
 * A mesma validação do formulário inteiro de candidato (`validatePersonForm`),
 * só com os campos do bloco: Nome obrigatório, CPF e data válidos na
 * Identificação; e-mail válido no Contato. O Endereço não tem regra.
 */
export function validarSecao(secao: SecaoDaFicha, form: FormData): string | null {
  if (secao === "identificacao") return validatePersonFields(form, ["name", "cpf", "birthDate"]);
  if (secao === "contato") return validatePersonFields(form, ["email"]);
  return null;
}

type CampoDeTexto = Exclude<(typeof CAMPOS_DA_SECAO)[SecaoDaFicha][number], "name" | "birthDate">;
export type DadosDaSecao = { name?: string; birthDate?: Date | null } & Partial<Record<CampoDeTexto, string | null>>;

/** O `data` do update, do mesmo jeito que o formulário inteiro monta (`candidatoData`). */
export function dadosDaSecao(secao: SecaoDaFicha, form: FormData): DadosDaSecao {
  const dados: DadosDaSecao = {};
  for (const campo of CAMPOS_DA_SECAO[secao]) {
    if (campo === "name") dados.name = (form.get("name") as string | null)?.trim() ?? "";
    else if (campo === "birthDate") dados.birthDate = pickDate(form, "birthDate");
    else dados[campo] = pick(form, campo);
  }
  return dados;
}
