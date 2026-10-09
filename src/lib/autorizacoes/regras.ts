// Autorização de Acesso da Receita Federal por cliente — regras puras.
//
// A procuração eletrônica do e-CAC virou "Autorização de Acesso" em dez/2025.
// O cliente cadastra no Portal de Serviços da RFB (Controle de Acesso › Minhas
// Autorizações de Acesso), escolhe os serviços e a validade (até 5 anos), e o
// escritório tem 30 dias para validar na aba "Recebidas" — sem validação, ela é
// cancelada sozinha. O Integra Contador do Serpro confere essa autorização em
// cada chamada feita em nome do cliente, e cobra o 403 de quem não tem: por
// isso o Fiscal começa a pedir antes do contrato (09/10/2026). Estudo no vault:
// Projects/Connect-41/Integra-Contador-Viabilidade-2026-10-09.
//
// Datas aqui são "AAAA-MM-DD" (src/lib/datas/calendario.ts), nunca `Date`.

import { documentoDaEmpresa, type EmpresaIdentificavel } from "@/lib/companyTaxId";
import { isValidCNPJ, isValidCPF } from "@/lib/validation/common";
import { lerIso, somarDias, somarMesesNaData } from "@/lib/datas/calendario";

export const MODULO_AUTORIZACOES = "fiscal_autorizacoes";

/** O escritório valida em até 30 dias do cadastro do cliente, ou ela cai. */
export const DIAS_PARA_VALIDAR = 30;
/** Validade máxima que o cliente pode escolher no Portal. */
export const ANOS_DE_VALIDADE_MAXIMA = 5;
/** A partir de quantos dias do fim da validade ela entra em "a renovar". */
export const DIAS_PARA_RENOVAR = 60;

export const STATUS = ["REQUESTED", "PENDING_VALIDATION", "ACTIVE", "CANCELLED", "NOT_APPLICABLE"] as const;
export type StatusDaAutorizacao = (typeof STATUS)[number];

export const ROTULO_DO_STATUS: Record<StatusDaAutorizacao, string> = {
  REQUESTED: "Pedida ao cliente",
  PENDING_VALIDATION: "Cliente cadastrou (falta validar)",
  ACTIVE: "Validada",
  CANCELLED: "Cancelada",
  NOT_APPLICABLE: "Não se aplica",
};

// ─── Chave: raiz do CNPJ ou CPF ─────────────────────────────────────────────

/**
 * A chave da autorização de uma empresa: raiz do CNPJ (8 dígitos) ou o CPF.
 * A autorização dada pela matriz vale para as filiais, então todas as empresas
 * da mesma raiz leem o mesmo registro. `null` = sem documento válido, e sem
 * documento não há o que autorizar.
 */
export function chaveDaAutorizacao(empresa: EmpresaIdentificavel): string | null {
  const doc = documentoDaEmpresa(empresa);
  if (!doc) return null;
  return doc.tipo === "CNPJ" ? doc.digitos.slice(0, 8) : doc.digitos;
}

/** A chave como aparece na tela: "12.345.678" (raiz) ou "123.456.789-01". */
export function formatarChave(chave: string): string {
  if (chave.length === 8) return `${chave.slice(0, 2)}.${chave.slice(2, 5)}.${chave.slice(5)}`;
  if (chave.length === 11) return `${chave.slice(0, 3)}.${chave.slice(3, 6)}.${chave.slice(6, 9)}-${chave.slice(9)}`;
  return chave;
}

/**
 * CNPJs e CPFs de um texto colado — a lista copiada do Portal, de uma planilha
 * ou de um e-mail, um por linha ou não, com ou sem pontuação. Devolve as
 * chaves (raiz ou CPF), sem repetir, e o que parecia documento mas não é válido.
 */
export function lerListaDeDocumentos(texto: string): { chaves: string[]; invalidos: string[] } {
  const chaves = new Set<string>();
  const invalidos: string[] = [];
  const achados = texto.matchAll(/(?<![\d./-])(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?![\d./-]*\d)/g);
  for (const [bruto] of achados) {
    const digitos = bruto.replace(/\D/g, "");
    if (digitos.length === 14 && isValidCNPJ(digitos)) chaves.add(digitos.slice(0, 8));
    else if (digitos.length === 11 && isValidCPF(digitos)) chaves.add(digitos);
    else invalidos.push(bruto);
  }
  return { chaves: [...chaves], invalidos };
}

// ─── Situação ────────────────────────────────────────────────────────────────

export type RegistroDaAutorizacao = {
  status: StatusDaAutorizacao;
  requestedAt: string | null;
  receivedAt: string | null;
  validatedAt: string | null;
  expiresAt: string | null;
};

export type Situacao =
  | "falta_pedir"
  | "pedida"
  | "validar"
  | "caiu"
  | "ativa"
  | "a_renovar"
  | "vencida"
  | "cancelada"
  | "nao_se_aplica";

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  falta_pedir: "Falta pedir",
  pedida: "Com o cliente",
  validar: "Validar no Portal",
  caiu: "Caiu sem validação",
  ativa: "Ativa",
  a_renovar: "A renovar",
  vencida: "Vencida",
  cancelada: "Cancelada",
  nao_se_aplica: "Não se aplica",
};

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Dias de `de` até `ate` (negativo quando `ate` já passou). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** Último dia para o escritório validar no Portal. */
export function prazoParaValidar(receivedAt: string): string {
  return somarDias(receivedAt, DIAS_PARA_VALIDAR);
}

export function situacaoDaAutorizacao(r: RegistroDaAutorizacao | null, hoje: string): Situacao {
  if (!r) return "falta_pedir";
  switch (r.status) {
    case "REQUESTED":
      return "pedida";
    case "PENDING_VALIDATION":
      return r.receivedAt && diasEntre(hoje, prazoParaValidar(r.receivedAt)) < 0 ? "caiu" : "validar";
    case "ACTIVE": {
      if (!r.expiresAt) return "ativa";
      const dias = diasEntre(hoje, r.expiresAt);
      if (dias < 0) return "vencida";
      return dias <= DIAS_PARA_RENOVAR ? "a_renovar" : "ativa";
    }
    case "CANCELLED":
      return "cancelada";
    case "NOT_APPLICABLE":
      return "nao_se_aplica";
  }
}

/**
 * Precisa de um pedido novo ao cliente: nunca pedida, ou pedida e perdida
 * (caiu nos 30 dias, cancelada, vencida). Na tela, tudo isso é "Falta pedir".
 */
export function precisaDePedido(s: Situacao): boolean {
  return s === "falta_pedir" || s === "caiu" || s === "cancelada" || s === "vencida";
}

/** Os recortes da lista, na ordem do filtro. O primeiro é o padrão. */
export const RECORTES = [
  { chave: "pendentes", rotulo: "Pendentes" },
  { chave: "pedir", rotulo: "Falta pedir" },
  { chave: "pedida", rotulo: "Com o cliente" },
  { chave: "validar", rotulo: "Validar no Portal" },
  { chave: "a_renovar", rotulo: "A renovar" },
  { chave: "ativa", rotulo: "Ativas" },
  { chave: "nao_se_aplica", rotulo: "Não se aplica" },
  { chave: "todas", rotulo: "Todas" },
] as const;
export type Recorte = (typeof RECORTES)[number]["chave"];

export function noRecorte(s: Situacao, recorte: Recorte): boolean {
  switch (recorte) {
    case "pendentes":
      return precisaDePedido(s) || s === "pedida" || s === "validar" || s === "a_renovar";
    case "pedir":
      return precisaDePedido(s);
    case "ativa":
      return s === "ativa" || s === "a_renovar";
    case "todas":
      return true;
    default:
      return s === recorte;
  }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O andamento numa frase: o que aconteceu por último e o prazo que corre. */
export function andamentoDaAutorizacao(
  situacao: Situacao,
  r: Pick<RegistroDaAutorizacao, "requestedAt" | "receivedAt" | "expiresAt"> & { allServices: boolean; services: string | null; notes: string | null; atualizadaEm: string } | null,
  hoje: string
): string {
  if (!r) return "—";
  switch (situacao) {
    case "pedida":
      return r.requestedAt ? `Pedida em ${dataBr(r.requestedAt)} (há ${plural(diasEntre(r.requestedAt, hoje), "dia", "dias")})` : "Pedida";
    case "validar": {
      const prazo = prazoParaValidar(r.receivedAt ?? hoje);
      const dias = diasEntre(hoje, prazo);
      return `Validar até ${dataBr(prazo)} (${dias === 0 ? "hoje" : plural(dias, "dia", "dias")})`;
    }
    case "caiu":
      return `Caiu em ${dataBr(prazoParaValidar(r.receivedAt ?? hoje))}`;
    case "ativa":
    case "a_renovar":
    case "vencida":
      return (r.expiresAt ? `Válida até ${dataBr(r.expiresAt)}` : "Validade não informada") + (r.allServices ? "" : ` · só ${r.services}`);
    case "cancelada":
      return `Cancelada em ${dataBr(r.atualizadaEm.slice(0, 10))}`;
    default:
      return r.notes ?? "—";
  }
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

/** Marcos do aviso de validação: faltando 10 e 3 dias, e no último dia. */
export const FAIXAS_DA_VALIDACAO = [10, 3, 0] as const;
/** Marcos do aviso de vencimento: 60, 30 e 7 dias antes, e no dia. */
export const FAIXAS_DO_VENCIMENTO = [60, 30, 7, 0] as const;

/**
 * A faixa de aviso de hoje: a menor que ainda cobre os dias que faltam.
 * Com 5 dias e faixas [10, 3, 0], a faixa é 10 — quem cadastrou tarde não
 * recebe três avisos de uma vez. Depois do prazo, "passou"; longe, `null`.
 */
export function faixaDeAviso(diasQueFaltam: number, faixas: readonly number[]): number | "passou" | null {
  if (diasQueFaltam < 0) return "passou";
  const cobre = faixas.filter((f) => diasQueFaltam <= f);
  return cobre.length ? Math.min(...cobre) : null;
}


export function textoDoAvisoDeValidacao(nome: string, prazo: string, hoje: string): string {
  const dias = diasEntre(hoje, prazo);
  const quando =
    dias < 0
      ? `caiu em ${dataBr(prazo)} sem validação — peça de novo ao cliente`
      : dias === 0
        ? "precisa ser validada hoje no Portal da Receita, ou cai"
        : `precisa ser validada no Portal da Receita até ${dataBr(prazo)} (${dias} dia${dias === 1 ? "" : "s"})`;
  return `Autorização de acesso de ${nome} ${quando}.`.slice(0, 255);
}

export function textoDoAvisoDeVencimento(nome: string, venceEm: string, hoje: string): string {
  const dias = diasEntre(hoje, venceEm);
  const quando =
    dias < 0 ? `venceu em ${dataBr(venceEm)}` : dias === 0 ? "vence hoje" : `vence em ${dias} dia${dias === 1 ? "" : "s"}, ${dataBr(venceEm)}`;
  return `Autorização de acesso de ${nome} ${quando}.`.slice(0, 255);
}

// ─── O que o setor grava ─────────────────────────────────────────────────────

export type EntradaDaAutorizacao = {
  status: string;
  requestedAt?: string | null;
  receivedAt?: string | null;
  validatedAt?: string | null;
  expiresAt?: string | null;
  allServices?: boolean;
  services?: string | null;
  notes?: string | null;
};

export type AutorizacaoValidada = {
  status: StatusDaAutorizacao;
  requestedAt: string | null;
  receivedAt: string | null;
  validatedAt: string | null;
  expiresAt: string | null;
  allServices: boolean;
  services: string | null;
  notes: string | null;
};

/** Códigos de serviço do Portal (5 dígitos, ex.: 00146), sem repetir, separados por vírgula. */
export function lerCodigosDeServico(texto: string | null | undefined): string | null {
  const codigos = [...new Set((texto ?? "").match(/\b\d{5}\b/g) ?? [])];
  return codigos.length ? codigos.join(", ").slice(0, 500) : null;
}

const vazio = (s: string | null | undefined) => !s || !s.trim();

/**
 * Confere o que o setor marcou e completa o que dá para completar: o dia de
 * cada passo é hoje quando não foi informado. Os dias que vêm de antes ficam
 * quando o status avança (pedida → cadastrou → validada), para o histórico.
 */
export function validarAutorizacao(
  e: EntradaDaAutorizacao,
  hoje: string,
  anterior?: Pick<AutorizacaoValidada, "requestedAt" | "receivedAt"> | null
): { ok: true; dados: AutorizacaoValidada } | { ok: false; erro: string } {
  if (!(STATUS as readonly string[]).includes(e.status)) return { ok: false, erro: "Escolha a situação." };
  const status = e.status as StatusDaAutorizacao;

  const datas: Record<"requestedAt" | "receivedAt" | "validatedAt" | "expiresAt", string | null> = {
    requestedAt: null,
    receivedAt: null,
    validatedAt: null,
    expiresAt: null,
  };
  for (const campo of Object.keys(datas) as (keyof typeof datas)[]) {
    const v = e[campo];
    if (vazio(v)) continue;
    if (!lerIso(v!.trim())) return { ok: false, erro: "Data inválida." };
    datas[campo] = v!.trim();
  }
  for (const campo of ["requestedAt", "receivedAt", "validatedAt"] as const) {
    if (datas[campo] && datas[campo]! > hoje) return { ok: false, erro: "Data no futuro: informe o dia em que aconteceu." };
  }

  const dados: AutorizacaoValidada = {
    status,
    requestedAt: datas.requestedAt ?? anterior?.requestedAt ?? null,
    receivedAt: null,
    validatedAt: null,
    expiresAt: null,
    allServices: e.allServices !== false,
    services: null,
    notes: vazio(e.notes) ? null : e.notes!.trim().slice(0, 2000),
  };

  if (status === "REQUESTED") {
    dados.requestedAt = datas.requestedAt ?? hoje;
  }
  if (status === "PENDING_VALIDATION" || status === "ACTIVE") {
    dados.receivedAt = datas.receivedAt ?? anterior?.receivedAt ?? (status === "PENDING_VALIDATION" ? hoje : null);
  }
  if (status === "PENDING_VALIDATION" && diasEntre(hoje, prazoParaValidar(dados.receivedAt!)) < 0) {
    return { ok: false, erro: "Passaram mais de 30 dias do cadastro: ela já caiu no Portal. Peça de novo ao cliente." };
  }
  if (status === "ACTIVE") {
    dados.validatedAt = datas.validatedAt ?? hoje;
    if (datas.expiresAt) {
      if (datas.expiresAt < hoje) return { ok: false, erro: "A validade já passou. Confira a data no Portal." };
      // Um pouco de folga além dos 5 anos: a contagem do Portal pode começar no dia do cadastro.
      if (datas.expiresAt > somarDias(somarMesesNaData(hoje, ANOS_DE_VALIDADE_MAXIMA * 12), 31)) {
        return { ok: false, erro: "A validade vai até 5 anos. Confira a data no Portal." };
      }
      dados.expiresAt = datas.expiresAt;
    }
    if (!dados.allServices) {
      dados.services = lerCodigosDeServico(e.services);
      if (!dados.services) return { ok: false, erro: "Informe os códigos dos serviços autorizados (ex.: 00146, 00103) ou marque “Todos”." };
    }
  }
  return { ok: true, dados };
}

// ─── O pedido ao cliente ─────────────────────────────────────────────────────

/**
 * Quem recebe as autorizações: nome e CNPJ do escritório contábil. Só CNPJ —
 * no Serpro quem pede os dados é o escritório, e a autorização é conferida
 * entre ele e o cliente.
 */
export function validarQuemRecebe(nome: string, cnpj: string): { ok: true; nome: string; cnpj: string } | { ok: false; erro: string } {
  const n = nome.trim().replace(/\s+/g, " ");
  if (n.length < 2) return { ok: false, erro: "Informe o nome do escritório." };
  if (n.length > 120) return { ok: false, erro: "Nome longo demais (até 120 caracteres)." };
  const digitos = cnpj.replace(/\D/g, "");
  if (digitos.length !== 14 || !isValidCNPJ(digitos)) return { ok: false, erro: "CNPJ inválido." };
  return { ok: true, nome: n, cnpj: digitos };
}

/**
 * O passo a passo que o setor manda ao cliente (WhatsApp, e-mail), com o CNPJ
 * de quem recebe. Pede o CNPJ, e não o CPF de alguém da equipe: a autorização
 * para uma pessoa sai junto com ela quando ela deixa o escritório.
 */
export function textoDoPedido(quemRecebe: { nome: string; cnpj: string }, empresa?: string): string {
  return [
    `Olá! Para acompanharmos ${empresa ?? "a sua empresa"} na Receita Federal sem precisar da sua senha, precisamos de uma Autorização de Acesso. Leva uns 5 minutos:`,
    "",
    "1. Entre em servicos.receitafederal.gov.br com a conta gov.br (nível prata ou ouro) do responsável pela empresa.",
    "2. Se entrou com o CPF do responsável, clique em “Representar” e escolha o CNPJ da empresa.",
    "3. Abra Controle de Acesso › Minhas Autorizações de Acesso e clique em “Nova Autorização”.",
    `4. Em quem vai receber a autorização, informe o CNPJ ${quemRecebe.cnpj} (${quemRecebe.nome}).`,
    "5. Nos serviços, marque “Todos”.",
    "6. Na validade, escolha o prazo mais longo (até 5 anos).",
    "7. Confirme e nos avise: a autorização só passa a valer depois que nós validamos, em até 30 dias.",
  ].join("\n");
}
