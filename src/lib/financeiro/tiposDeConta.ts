// Os tipos de conta (lote D, 20/10 — os 13 do Omie). Cada tipo cai num grupo,
// e é o grupo que diz o que a conta faz:
//
// - **banco**: tem extrato (OFX) e concilia; o saldo é o do extrato; entra no
//   saldo bancário e no fluxo de caixa;
// - **caixa**: não tem extrato — o saldo é o inicial mais as baixas feitas por
//   ela —, mas é dinheiro da empresa: entra no saldo e no fluxo de caixa;
// - **fora do caixa**: não é dinheiro da empresa — o adiantamento, o cartão de
//   crédito, o empréstimo, o mútuo, o crediário e o que a administradora de
//   cartões tem a repassar. Sem extrato, fora do saldo bancário e do fluxo; a
//   baixa por ela não é dinheiro andando. O saldo dela também sai das baixas.
//
// O adiantamento e o cartão têm a porta deles, em Contas a pagar e a receber;
// os outros tipos se cadastram em Banco e caixa (a tela da conciliação).

export type GrupoDaConta = "banco" | "caixa" | "fora";

type Definicao = { rotulo: string; grupo: GrupoDaConta; ajuda?: string; portaPropria?: true };

export const TIPOS_DE_CONTA = {
  CORRENTE: { rotulo: "Conta corrente", grupo: "banco" },
  POUPANCA: { rotulo: "Poupança", grupo: "banco" },
  CONTA_PAGAMENTO: { rotulo: "Conta de pagamento", grupo: "banco", ajuda: "Conta digital de recebimento e pagamento, com extrato." },
  CONTA_GARANTIDA: { rotulo: "Conta garantida", grupo: "banco", ajuda: "O limite do banco numa conta à parte, com extrato." },
  APLICACAO: { rotulo: "Aplicação", grupo: "banco", ajuda: "Investimento: a aplicação e o resgate são transferências do banco; o rendimento é receita." },
  CAIXINHA: { rotulo: "Caixinha", grupo: "caixa", ajuda: "Dinheiro em espécie. Sem extrato: o saldo é o inicial mais as baixas feitas por ela." },
  CARTEIRA_VIRTUAL: { rotulo: "Carteira virtual", grupo: "caixa", ajuda: "Carteira digital sem extrato a importar: o saldo é o inicial mais as baixas feitas por ela." },
  EMPRESTIMO: { rotulo: "Empréstimo", grupo: "fora", ajuda: "A dívida com o banco. Fora do caixa: o dinheiro anda quando o empréstimo entra no banco e quando a parcela sai." },
  MUTUO: { rotulo: "Mútuo", grupo: "fora", ajuda: "O que um sócio emprestou à empresa. Fora do caixa, como o empréstimo." },
  CREDIARIO: { rotulo: "Crediário / carnê", grupo: "fora", ajuda: "Compra a prazo na loja. Fora do caixa: o dinheiro anda quando a parcela sai." },
  ADMINISTRADORA_CARTOES: {
    rotulo: "Administradora de cartões",
    grupo: "fora",
    ajuda: "O que a maquininha tem a repassar. Fora do caixa: o dinheiro anda quando o repasse cai no banco.",
  },
  ADIANTAMENTO_FORNECEDOR: { rotulo: "Adiantamento a fornecedores", grupo: "fora", portaPropria: true },
  ADIANTAMENTO_CLIENTE: { rotulo: "Adiantamento de clientes", grupo: "fora", portaPropria: true },
  CARTAO_CREDITO: { rotulo: "Cartão de crédito", grupo: "fora", portaPropria: true },
} as const satisfies Record<string, Definicao>;

export type TipoDeConta = keyof typeof TIPOS_DE_CONTA;

const TODOS = Object.keys(TIPOS_DE_CONTA) as TipoDeConta[];
const definicao = (tipo: string | null | undefined): Definicao | null =>
  typeof tipo === "string" && tipo in TIPOS_DE_CONTA ? TIPOS_DE_CONTA[tipo as TipoDeConta] : null;

export function tipoDeConta(v: unknown): v is TipoDeConta {
  return typeof v === "string" && v in TIPOS_DE_CONTA;
}

export const CARTAO_DE_CREDITO = "CARTAO_CREDITO" as const;

/** Os que não são dinheiro da empresa: fora do saldo bancário e do fluxo de caixa. */
export const TIPOS_FORA_DO_CAIXA: TipoDeConta[] = TODOS.filter((t) => TIPOS_DE_CONTA[t].grupo === "fora");
/** Os que têm extrato: importam OFX e conciliam. */
export const TIPOS_COM_EXTRATO: TipoDeConta[] = TODOS.filter((t) => TIPOS_DE_CONTA[t].grupo === "banco");
/** O adiantamento e o cartão: cadastrados e usados em Contas a pagar e a receber. */
export const TIPOS_COM_PORTA_PROPRIA: TipoDeConta[] = TODOS.filter((t) => "portaPropria" in TIPOS_DE_CONTA[t]);
/** O que o cadastro de Banco e caixa oferece, na ordem do seletor. */
export const TIPOS_DO_CADASTRO: TipoDeConta[] = TODOS.filter((t) => !("portaPropria" in TIPOS_DE_CONTA[t]));

/** A conta não é dinheiro da empresa. A baixa sem conta (`null`) é caixa, como sempre foi. */
export function ehContaForaDoCaixa(tipo: string | null | undefined): boolean {
  return definicao(tipo)?.grupo === "fora";
}

/** Tem extrato: importa OFX, aparece na conciliação, e o saldo é o do banco. */
export function temExtrato(tipo: string | null | undefined): boolean {
  return definicao(tipo)?.grupo === "banco";
}

export function temPortaPropria(tipo: string | null | undefined): boolean {
  return Boolean(definicao(tipo)?.portaPropria);
}

export function ehCartaoDeCredito(tipo: string | null | undefined): tipo is typeof CARTAO_DE_CREDITO {
  return tipo === CARTAO_DE_CREDITO;
}

export function rotuloDoTipo(tipo: string | null | undefined): string {
  return definicao(tipo)?.rotulo ?? "Conta";
}

export function grupoDoTipo(tipo: string | null | undefined): GrupoDaConta {
  return definicao(tipo)?.grupo ?? "banco";
}

export function ajudaDoTipo(tipo: string | null | undefined): string | null {
  return definicao(tipo)?.ajuda ?? null;
}
