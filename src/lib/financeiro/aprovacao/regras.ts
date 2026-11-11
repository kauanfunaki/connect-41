// Aprovação por alçada das contas a pagar. Funções puras.
//
// ─── O que entra ─────────────────────────────────────────────────────────────
//
// Conta a PAGAR criada **em aberto** numa empresa com ao menos uma alçada
// ativa. O que já nasce pago (baixa registrada no lançamento manual, lançamento
// criado a partir do extrato) não entra: aprovar um pagamento que já saiu da
// conta é teatro, e bloquear a baixa de algo já baixado não tem o que bloquear.
// Não é retroativo — o que existia fica `NAO_REQUER`, e a equipe envia à mão.
//
// ─── Quem decide ─────────────────────────────────────────────────────────────
//
// Usuário do portal com alçada ativa na empresa e teto que cobre o valor, ou
// a coordenação do setor (sem teto). **Quem criou o lançamento não decide**:
// segregação de funções — quem lança a conta não pode ser quem libera o
// pagamento dela, senão a aprovação vira um segundo clique da mesma pessoa.
//
// ─── O que bloqueia ──────────────────────────────────────────────────────────
//
// `AGUARDANDO` e `REPROVADO` não podem ser baixados, por caminho nenhum: baixa
// manual, conciliação. Cancelar continua permitido — é o fim natural de uma
// conta reprovada que não vai ser paga.

export type StatusDeAprovacao = "NAO_REQUER" | "AGUARDANDO" | "APROVADO" | "REPROVADO";
export type StatusDoLancamento = "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
export type TipoDoLancamento = "PAGAR" | "RECEBER";

export const ROTULO_DA_APROVACAO: Record<StatusDeAprovacao, string> = {
  NAO_REQUER: "Sem aprovação",
  AGUARDANDO: "Aguardando aprovação",
  APROVADO: "Aprovada",
  REPROVADO: "Reprovada",
};

/**
 * O lançamento que está nascendo entra em aprovação?
 *
 * `moduloLigado` entra na regra porque, com o módulo desligado, ninguém
 * consegue aprovar — nem no portal, nem na equipe — e a conta ficaria presa
 * para sempre sem baixa.
 */
export function entraEmAprovacao(novo: {
  kind: TipoDoLancamento;
  status: StatusDoLancamento;
  empresaTemAlcadaAtiva: boolean;
  moduloLigado: boolean;
}): boolean {
  if (!novo.moduloLigado || !novo.empresaTemAlcadaAtiva) return false;
  if (novo.kind !== "PAGAR") return false;
  return novo.status === "PROVISORIO" || novo.status === "CONFERIDO";
}

export function statusInicialDeAprovacao(novo: Parameters<typeof entraEmAprovacao>[0]): "AGUARDANDO" | "NAO_REQUER" {
  return entraEmAprovacao(novo) ? "AGUARDANDO" : "NAO_REQUER";
}

/** Aprovação que ainda pesa sobre a conta. Cancelada encerra: não há mais o que aprovar. */
export function aprovacaoEmCurso(conta: { approvalStatus: StatusDeAprovacao; status: StatusDoLancamento }): boolean {
  return conta.status !== "CANCELADO" && (conta.approvalStatus === "AGUARDANDO" || conta.approvalStatus === "REPROVADO");
}

/**
 * A lista de contas mostra o selo da aprovação?
 *
 * Enquanto ela pesa sobre a conta, ou aprovada ainda em aberto — é o "pode
 * pagar" que quem olha a lista quer saber. Paga ou cancelada, a aprovação vira
 * histórico. Uma regra só para a equipe (`ContasTable`) e o cliente
 * (`/portal/pagar`) lerem o mesmo selo na mesma conta.
 */
export function seloDeAprovacaoVisivel(conta: { approvalStatus: StatusDeAprovacao; status: StatusDoLancamento }): boolean {
  if (aprovacaoEmCurso(conta)) return true;
  return conta.approvalStatus === "APROVADO" && conta.status !== "PAGO" && conta.status !== "CANCELADO";
}

/**
 * Por que esta conta não pode ser baixada — ou `null` se a aprovação não impede.
 *
 * Uma função só para todos os caminhos de baixa (tela de contas, conciliação),
 * para a mensagem ser a mesma onde quer que a pessoa esbarre nela.
 */
export function motivoDoBloqueioDeBaixa(conta: { approvalStatus: StatusDeAprovacao }): string | null {
  if (conta.approvalStatus === "AGUARDANDO") {
    return "Aguardando aprovação — a baixa só é liberada depois que a conta for aprovada.";
  }
  if (conta.approvalStatus === "REPROVADO") {
    return "Conta reprovada — reenvie para aprovação ou cancele o lançamento; reprovada não é baixada.";
  }
  return null;
}

/**
 * Por que a decisão foi recusada, numa chave (11/11/2026). `motivo` é o texto
 * da equipe; o portal fala com o cliente com outras palavras ("limite de
 * aprovação", e não "teto" e "alçada"), e as escolhe pela chave em
 * `motivoParaOCliente` — o texto da equipe não muda.
 */
export type RecusaDaDecisao =
  | "CANCELADA"
  | "NAO_AGUARDA"
  | "SO_COORDENACAO"
  | "QUEM_LANCOU"
  | "SEM_LIMITE"
  | "ACIMA_DO_LIMITE"
  | "SEM_MOTIVO"
  | "MOTIVO_LONGO";

export type Veredito = { pode: true } | { pode: false; motivo: string; recusa?: RecusaDaDecisao };

/**
 * A equipe pode enviar (ou reenviar) esta conta para aprovação?
 *
 * Primeiro envio parte de `NAO_REQUER` (o lançamento anterior à alçada); o
 * reenvio parte de `REPROVADO`. Aprovada não volta: a aprovação vale para o
 * valor aprovado, e não há edição de valor que justifique pedir de novo.
 */
export function podeEnviarParaAprovacao(conta: {
  kind: TipoDoLancamento;
  status: StatusDoLancamento;
  paidAt: Date | null;
  approvalStatus: StatusDeAprovacao;
}): Veredito {
  if (conta.kind !== "PAGAR") return { pode: false, motivo: "Só conta a pagar passa por aprovação." };
  if (conta.status === "CANCELADO") return { pode: false, motivo: "Lançamento cancelado." };
  if (conta.status === "PAGO" || conta.paidAt !== null) return { pode: false, motivo: "Conta já paga não passa por aprovação." };
  if (conta.approvalStatus === "AGUARDANDO") return { pode: false, motivo: "Já está aguardando aprovação." };
  if (conta.approvalStatus === "APROVADO") return { pode: false, motivo: "Já está aprovada." };
  return { pode: true };
}

export type Decisao = "APROVAR" | "REPROVAR";

export type QuemDecide =
  | { tipo: "EQUIPE"; userId: string; gerenciaOSetor: boolean }
  /** `tetoCentavos` da alçada **ativa** do usuário nesta empresa; `null` sem alçada. */
  | { tipo: "PORTAL"; tetoCentavos: number | null };

export const TAMANHO_MINIMO_DO_MOTIVO = 3;
export const TAMANHO_MAXIMO_DO_MOTIVO = 1_000;

/** O motivo da reprovação, limpo — ou o erro. Reprovar sem dizer por quê deixa a equipe sem o que corrigir. */
export function validarMotivo(
  motivo: string | null | undefined
): { ok: true; motivo: string } | { ok: false; erro: string; recusa: "SEM_MOTIVO" | "MOTIVO_LONGO" } {
  const m = (motivo ?? "").trim();
  if (m.length < TAMANHO_MINIMO_DO_MOTIVO) return { ok: false, erro: "Diga o motivo da reprovação.", recusa: "SEM_MOTIVO" };
  if (m.length > TAMANHO_MAXIMO_DO_MOTIVO) {
    return { ok: false, erro: `Motivo com mais de ${TAMANHO_MAXIMO_DO_MOTIVO} caracteres.`, recusa: "MOTIVO_LONGO" };
  }
  return { ok: true, motivo: m };
}

/** O teto cobre o valor? Igual ao teto passa: "até R$ 5.000" inclui os R$ 5.000. */
export function dentroDoTeto(tetoCentavos: number | null, valorCentavos: number): boolean {
  return tetoCentavos !== null && valorCentavos <= tetoCentavos;
}

/** Esta pessoa pode aprovar ou reprovar esta conta agora? */
export function podeDecidir(
  conta: { status: StatusDoLancamento; approvalStatus: StatusDeAprovacao; valorCentavos: number; createdById: string | null },
  quem: QuemDecide,
  decisao: Decisao,
  motivo?: string | null
): Veredito {
  if (conta.status === "CANCELADO") return { pode: false, motivo: "Lançamento cancelado — não há o que aprovar.", recusa: "CANCELADA" };
  if (conta.approvalStatus !== "AGUARDANDO") {
    return { pode: false, motivo: "Só se aprova ou reprova conta que está aguardando aprovação.", recusa: "NAO_AGUARDA" };
  }

  if (quem.tipo === "EQUIPE") {
    if (!quem.gerenciaOSetor) return { pode: false, motivo: "Só a coordenação do setor aprova pela equipe.", recusa: "SO_COORDENACAO" };
    if (conta.createdById !== null && conta.createdById === quem.userId) {
      return { pode: false, motivo: "Quem lançou a conta não pode aprová-la nem reprová-la.", recusa: "QUEM_LANCOU" };
    }
  } else {
    if (quem.tetoCentavos === null) {
      return { pode: false, motivo: "Você não tem alçada de aprovação nesta empresa.", recusa: "SEM_LIMITE" };
    }
    if (!dentroDoTeto(quem.tetoCentavos, conta.valorCentavos)) {
      return { pode: false, motivo: "O valor passa do seu teto de aprovação nesta empresa.", recusa: "ACIMA_DO_LIMITE" };
    }
  }

  if (decisao === "REPROVAR") {
    const v = validarMotivo(motivo);
    if (!v.ok) return { pode: false, motivo: v.erro, recusa: v.recusa };
  }
  return { pode: true };
}

/**
 * O porquê da recusa nas palavras do cliente (11/11/2026, P04): "limite de
 * aprovação", e não "teto" nem "alçada"; "conta", e não "lançamento". As
 * recusas que só a equipe encontra (coordenação, quem lançou) ficam numa frase
 * neutra — o portal não chega nelas, mas, se chegar, não fala de dentro.
 */
const RECUSA_PARA_O_CLIENTE: Record<RecusaDaDecisao, string> = {
  CANCELADA: "Esta conta foi cancelada pela equipe — não há o que aprovar.",
  NAO_AGUARDA: "Esta conta já foi decidida e não está mais esperando aprovação.",
  SO_COORDENACAO: "Você não pode decidir esta conta.",
  QUEM_LANCOU: "Você não pode decidir esta conta.",
  SEM_LIMITE: "Você não tem limite de aprovação nesta empresa.",
  ACIMA_DO_LIMITE: "O valor passa do seu limite de aprovação nesta empresa.",
  SEM_MOTIVO: "Diga o motivo da reprovação.",
  MOTIVO_LONGO: `O motivo passa de ${new Intl.NumberFormat("pt-BR").format(TAMANHO_MAXIMO_DO_MOTIVO)} caracteres. Escreva mais curto.`,
};

/** O texto da recusa para o portal; sem chave, o texto que veio (o da equipe). */
export function motivoParaOCliente(recusa: { motivo: string; recusa?: RecusaDaDecisao }): string {
  return recusa.recusa ? RECUSA_PARA_O_CLIENTE[recusa.recusa] : recusa.motivo;
}

export type AlcadaParaAviso = { portalUserId: string; companyId: string; tetoCentavos: number; email: string; nome: string };

/**
 * Quem avisar, e de quantas contas, quando contas entram em aprovação.
 *
 * Um aviso por aprovador com a contagem dele — não um por conta: a importação
 * de uma planilha com cem títulos não pode virar cem e-mails para a mesma
 * pessoa. Cada aprovador conta só o que o teto dele cobre, na empresa dele:
 * avisar alguém de uma conta que ele não pode aprovar é mandar trabalho que
 * ele não consegue fazer.
 */
export function avisosPorAprovador(
  contas: { companyId: string; valorCentavos: number }[],
  alcadas: AlcadaParaAviso[]
): { portalUserId: string; email: string; nome: string; quantidade: number }[] {
  const porAprovador = new Map<string, { portalUserId: string; email: string; nome: string; quantidade: number }>();
  for (const conta of contas) {
    // Um usuário com duas alçadas (duas empresas) conta a conta uma vez só:
    // alçada é por empresa, e a conta é de uma empresa.
    for (const a of alcadas) {
      if (a.companyId !== conta.companyId || !dentroDoTeto(a.tetoCentavos, conta.valorCentavos)) continue;
      const atual = porAprovador.get(a.portalUserId) ?? { portalUserId: a.portalUserId, email: a.email, nome: a.nome, quantidade: 0 };
      atual.quantidade++;
      porAprovador.set(a.portalUserId, atual);
    }
  }
  return [...porAprovador.values()];
}

/**
 * Do lote que o cliente marcou, o que ele pode aprovar de fato.
 *
 * "Aprovar em lote" leva só o que está dentro do teto e aguardando; o resto
 * volta como ignorado com o motivo, em vez de derrubar o lote inteiro por uma
 * conta acima do teto.
 */
export function separarLote<T extends { id: string; status: StatusDoLancamento; approvalStatus: StatusDeAprovacao; valorCentavos: number; companyId: string }>(
  contas: T[],
  tetoPorEmpresa: Map<string, number>
): { aprovaveis: T[]; ignoradas: { id: string; motivo: string; recusa?: RecusaDaDecisao }[] } {
  const aprovaveis: T[] = [];
  const ignoradas: { id: string; motivo: string; recusa?: RecusaDaDecisao }[] = [];
  for (const c of contas) {
    const v = podeDecidir({ ...c, createdById: null }, { tipo: "PORTAL", tetoCentavos: tetoPorEmpresa.get(c.companyId) ?? null }, "APROVAR");
    if (v.pode) aprovaveis.push(c);
    else ignoradas.push({ id: c.id, motivo: v.motivo, recusa: v.recusa });
  }
  return { aprovaveis, ignoradas };
}

/** Valor de alçada digitado ("5.000,00", "5000") em centavos, ou erro. */
export function lerTeto(texto: string): { ok: true; centavos: number } | { ok: false; erro: string } {
  const t = texto.trim().replace(/^R\$\s*/i, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) {
    return { ok: false, erro: "Informe o teto em reais, ex.: 5.000,00." };
  }
  const [inteira, decimal = ""] = t.replace(/\./g, "").split(",");
  const centavos = Number(inteira) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos) || centavos <= 0) return { ok: false, erro: "O teto precisa ser maior que zero." };
  // Decimal(12,2): dez dígitos inteiros.
  if (centavos > 999_999_999_999) return { ok: false, erro: "Teto grande demais." };
  return { ok: true, centavos };
}
