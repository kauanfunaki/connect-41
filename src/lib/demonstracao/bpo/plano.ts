// Demonstração do BPO e das telas gerais, para a apresentação ao setor —
// combinada em 15/10/2026 (ver `scripts/dados-de-demonstracao.ts`).
//
// Aqui só se MONTA o que vai para o banco — sem banco e sem relógio próprio:
// recebe "agora" e devolve sempre a mesma coisa para o mesmo dia. Quem grava é
// `gravar.ts`; quem apaga, `limpeza.ts`.
//
// ─── A história ─────────────────────────────────────────────────────────────
//
// Uma padaria de Curitiba com duas lojas, cliente do BPO da 41: a matriz
// produz e vende, as filiais (Centro e Batel) vendem. Seis meses de histórico
// (o mês atual e os cinco anteriores — a janela do Fluxo de caixa) e o que
// vence até dois meses à frente. Os números batem entre as telas porque saem
// todos dos mesmos lançamentos:
//
// - todo lançamento pago tem a transação conciliada no extrato, no mesmo dia;
// - o saldo de cada extrato é a abertura mais o que entrou e saiu até ali;
// - a competência de tudo o que vence no futuro é a do mês atual ou de antes —
//   a DRE econômica e as Análises abrem no último mês com lançamento, e assim
//   abrem no mês atual;
// - categoria, centro de custo e contraparte são de cada empresa (a filial
//   não enxerga os da matriz), e nenhuma categoria vai para o plano do
//   escritório.
//
// As situações de história do roteiro (`SITUACOES`), todas relativas a hoje:
// a conta a pagar que vence hoje esperando aprovação, a pendência atrasada, a
// transação do extrato com sugestão de conciliação, o acordo com parcela em
// aberto e o mês da DRE com uma categoria sem classificação.
//
// ─── O que não tem ──────────────────────────────────────────────────────────
//
// Nenhum e-mail de verdade (contraparte sem e-mail não entra na régua de
// cobrança; o acesso do portal é @exemplo.invalido, com senha que ninguém
// conhece), nenhum arquivo (os Arquivos guardam os bytes no disco do servidor,
// e o script roda na máquina de quem o chama), nenhuma importação do Omie (um
// mês importado faz a DRE ignorar os lançamentos e deixar de bater com as
// outras telas) e nenhuma emissão em andamento (só estados finais: o cron do
// Omie não pega nenhuma).

import { diaDaSemana, diasNoMes, hojeIso, somarDias, somarMeses } from "@/lib/datas/calendario";
import { moeda } from "@/lib/financeiro/formato";
import { DOMINIO_FICTICIO, cnpjDaPadaria, cnpjDeContraparte, cnpjFormatado } from "./documentos";

export const MARCA = "[demo]";
/** `Company.source` das empresas desta demonstração — a segunda trava, além do prefixo. */
export const FONTE_DA_DEMO = "demonstracao-bpo";
export const SETOR = "bpo";
export const SLUG_DO_TENANT = "41tech";
/** O mês atual e os cinco anteriores: a janela do "Realizado" do Fluxo de caixa. */
export const MESES_DE_HISTORICO = 6;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type ChaveDaEmpresa = "matriz" | "centro" | "batel";
/** Quem figura: quem apresenta (o "meu" da tela cai nele) ou um segundo administrador. */
export type Quem = "apresentador" | "outro";
/** Quem responde por um card: quem apresenta, o segundo administrador ou alguém da equipe fictícia (`equipe:ana`…). */
export type Responsavel = Quem | `equipe:${string}`;
/** As pessoas fictícias da equipe do BPO, para o "Meu time" ter gente (decisão do Kauan, 15/10/2026). */
export type MembroDaEquipe = { chave: `equipe:${string}`; name: string; email: string };
export type Autor = Quem | "portal";
type Tipo = "PAGAR" | "RECEBER";

export type EmpresaDoPlano = {
  chave: ChaveDaEmpresa;
  name: string;
  displayName: string;
  tradeName: string;
  cnpj: string;
  cnaePrincipal: string;
  taxRegime: string;
  matriz: ChaveDaEmpresa | null;
  zipCode: string;
  addressStreet: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  stateCode: "PR";
};

export type CategoriaDoPlano = { chave: string; empresa: ChaveDaEmpresa; name: string; kind: Tipo; dreGroup: string | null };
export type CentroDoPlano = { chave: string; empresa: ChaveDaEmpresa; name: string; code: string };
export type ContraparteDoPlano = {
  chave: string;
  empresa: ChaveDaEmpresa;
  name: string;
  document: string | null;
  categoria: string | null;
  centro: string | null;
};
export type ContaDoPlano = {
  chave: ChaveDaEmpresa;
  empresa: ChaveDaEmpresa;
  nickname: string;
  bankCode: string;
  agency: string;
  accountNumber: string;
  accountDigits: string;
  aberturaCentavos: number;
  /** Dia 1 do primeiro mês do histórico. */
  aberturaEm: string;
};

export type Aprovacao = "NAO_REQUER" | "AGUARDANDO" | "APROVADO" | "REPROVADO";

export type LancamentoDoPlano = {
  chave: string;
  empresa: ChaveDaEmpresa;
  kind: Tipo;
  status: "CONFERIDO" | "PAGO" | "CANCELADO";
  contraparte: string;
  categoria: string | null;
  centro: string | null;
  competence: string;
  /** Datas de calendário "AAAA-MM-DD" (gravadas ao meio-dia de São Paulo, como o app grava). */
  vencimento: string;
  pagoEm: string | null;
  centavos: number;
  descricao: string;
  criadoPor: Quem;
  criadoEm: string;
  aprovacao: Aprovacao;
  aprovadoEm: string | null;
  /** Título original renegociado num acordo. */
  renegociadoNo: string | null;
  /** Parcela de um acordo. */
  parcelaDo: string | null;
};

export type EventoDeAprovacao = { lancamento: string; decisao: "ENVIADO" | "APROVADO" | "REPROVADO"; quem: Autor; motivo: string | null; quando: string };
export type AcordoDoPlano = {
  chave: string;
  empresa: ChaveDaEmpresa;
  contraparte: string;
  originalCentavos: number;
  acordadoCentavos: number;
  parcelas: number;
  primeiroVencimento: string;
  acordadoEm: string;
  notas: string;
};
export type ContatoDeCobranca = {
  lancamento: string;
  quando: string;
  canal: "TELEFONE" | "WHATSAPP" | "EMAIL" | "PRESENCIAL" | "OUTRO";
  resultado: "SEM_RESPOSTA" | "PROMETEU_PAGAR" | "CONTESTOU" | "NEGOCIANDO" | "OUTRO";
  notas: string;
  proximaAcao: string | null;
  quem: Quem;
};

export type ExtratoDoPlano = { chave: string; conta: ChaveDaEmpresa; fileName: string; inicio: string; fim: string; saldoCentavos: number; transacoes: number };
export type TransacaoDoPlano = {
  chave: string;
  conta: ChaveDaEmpresa;
  extrato: string;
  fitId: string;
  data: string;
  /** Com sinal: saída negativa, entrada positiva. */
  centavos: number;
  memo: string;
  status: "PENDENTE" | "CONCILIADA" | "IGNORADA";
  lancamentos: string[];
  motivoIgnorada: string | null;
};

export type MensagemDoPlano = { quem: Autor; body: string; quando: string };
export type PendenciaDoPlano = {
  chave: string;
  empresa: ChaveDaEmpresa;
  kind: "DOCUMENTO" | "INFORMACAO" | "CONFIRMACAO";
  title: string;
  description: string;
  vencimento: string;
  status: "ABERTA" | "RESPONDIDA" | "RESOLVIDA";
  criadoEm: string;
  resolvidoEm: string | null;
  lancamento: string | null;
  mensagens: MensagemDoPlano[];
};
export type ConversaDoPlano = MensagemDoPlano & { empresa: ChaveDaEmpresa };
export type OrcamentoDoPlano = { empresa: ChaveDaEmpresa; ano: number; nome: string; aprovadoEm: string; linhas: { grupo: string; mes: number; centavos: number }[] };
export type EmissaoDoPlano = {
  empresa: ChaveDaEmpresa;
  estado: "AUTORIZADA" | "REJEITADA" | "CANCELADA";
  tomadorCodigo: string;
  tomadorNome: string;
  tomadorDocumento: string | null;
  servicoCodigo: string;
  servicoDescricao: string;
  centavos: number;
  competencia: string;
  descricao: string;
  numeroOS: string;
  nfseNumero: string | null;
  mensagem: string | null;
  quando: string;
  faturadaEm: string | null;
  canceladaEm: string | null;
};
export type SenhaDoPlano = { empresa: ChaveDaEmpresa; title: string; username: string; url: string; notes: string };
export type ManualDoPlano = { title: string; icon: string; paginas: { title: string; content: string }[] };
export type SolicitacaoDoPlano = {
  chave: string;
  empresa: ChaveDaEmpresa;
  status: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA";
  description: string;
  /** Instante ISO. */
  prazoDeResposta: string;
  primeiraRespostaEm: string | null;
  concluidaEm: string | null;
  criadoEm: string;
  responsavel: Quem;
  mensagens: (MensagemDoPlano & { interna: boolean })[];
};
export type ComunicadoDoPlano = { title: string; body: string; empresas: ChaveDaEmpresa[]; quando: string };

export type EtapaDoPlano = { chave: string; name: string; type: "NOT_STARTED" | "IN_PROGRESS" | "PENDING" | "DONE"; color: string };
export type ListaDoPlano = { chave: string; name: string; pasta: string | null; color: string; etapas: EtapaDoPlano[] };
export type AtividadeDoPlano = { tipo: "CREATED" | "NOTE" | "STATUS_CHANGE" | "COMPLETED"; quem: Responsavel; content: string | null; quando: string; respostaA: number | null };
export type CardDoPlano = {
  chave: string;
  lista: string;
  etapa: string;
  title: string;
  description: string;
  empresa: ChaveDaEmpresa;
  prioridade: 0 | 1 | 2;
  inicio: string | null;
  /** Instante ISO: 20h de São Paulo do dia do prazo (ver `prazoDoCard`). */
  prazo: string | null;
  estimativaMinutos: number | null;
  responsaveis: Responsavel[];
  etiquetas: string[];
  checklist: { text: string; done: boolean }[];
  pai: string | null;
  ordem: number;
  criadoEm: string;
  atualizadoEm: string;
  atividades: AtividadeDoPlano[];
  horas: { quem: Responsavel; minutos: number; nota: string; dia: string }[];
};
export type QuadroDoPlano = {
  espaco: { name: string; color: string };
  pastas: { chave: string; name: string }[];
  listas: ListaDoPlano[];
  etiquetas: { name: string; color: string }[];
  cards: CardDoPlano[];
};
export type ReuniaoDoPlano = { chave: string; title: string; empresa: ChaveDaEmpresa; inicio: string; fim: string; participantes: Quem[]; card: string | null };
export type PastaDoPlano = { chave: string; name: string; pai: string | null; empresa: ChaveDaEmpresa | null };
export type AvisoDoPlano = {
  quem: Quem;
  type: string;
  message: string;
  /** Para onde o aviso leva. */
  alvo: { tipo: "card"; chave: string } | { tipo: "pendencia"; chave: string } | { tipo: "solicitacao"; chave: string } | { tipo: "empresa"; chave: ChaveDaEmpresa } | null;
  lida: boolean;
  quando: string;
  ator: Quem | null;
};

export type PlanoDoBpo = {
  hoje: string;
  meses: string[];
  empresas: EmpresaDoPlano[];
  acessoDoPortal: { name: string; email: string; empresa: ChaveDaEmpresa; alcadaCentavos: number };
  categorias: CategoriaDoPlano[];
  centros: CentroDoPlano[];
  contrapartes: ContraparteDoPlano[];
  contas: ContaDoPlano[];
  lancamentos: LancamentoDoPlano[];
  aprovacoes: EventoDeAprovacao[];
  acordos: AcordoDoPlano[];
  contatos: ContatoDeCobranca[];
  extratos: ExtratoDoPlano[];
  transacoes: TransacaoDoPlano[];
  pendencias: PendenciaDoPlano[];
  conversa: ConversaDoPlano[];
  orcamentos: OrcamentoDoPlano[];
  emissoes: EmissaoDoPlano[];
  senhas: SenhaDoPlano[];
  manual: ManualDoPlano;
  solicitacoes: SolicitacaoDoPlano[];
  comunicado: ComunicadoDoPlano;
  quadro: QuadroDoPlano;
  reunioes: ReuniaoDoPlano[];
  pastas: PastaDoPlano[];
  avisos: AvisoDoPlano[];
  equipe: MembroDaEquipe[];
};

// ─── Utilidades ─────────────────────────────────────────────────────────────

/** FNV-1a: o mesmo texto dá sempre o mesmo número — variação sem sorteio. */
function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** O valor-base variado em até ±pct%, pelo texto da chave; em centavos inteiros. */
export function variar(base: number, chave: string, pct: number): number {
  if (pct === 0) return base;
  const passo = (hash(chave) % (2 * pct * 10 + 1)) - pct * 10; // décimos de ponto percentual
  return Math.round(base * (1 + passo / 1000));
}

/** Fim de semana vai para a segunda: banco não compensa sábado nem domingo. */
export function diaUtil(iso: string): string {
  const d = diaDaSemana(iso);
  return d === 5 ? somarDias(iso, 2) : d === 6 ? somarDias(iso, 1) : iso;
}

/** Fim de semana volta para a sexta. */
export function diaUtilAntes(iso: string): string {
  const d = diaDaSemana(iso);
  return d === 5 ? somarDias(iso, -1) : d === 6 ? somarDias(iso, -2) : iso;
}

const mesDe = (iso: string) => iso.slice(0, 7);
function diaDoMes(competencia: string, dia: number): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  return `${competencia}-${String(Math.min(dia, diasNoMes(ano, mes))).padStart(2, "0")}`;
}
function mesSomado(competencia: string, n: number): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  const r = somarMeses(ano, mes, n);
  return `${r.ano}-${String(r.mes).padStart(2, "0")}`;
}
const NOMES_DOS_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (competencia: string) => NOMES_DOS_MESES[Number(competencia.slice(5, 7)) - 1]!;

/** Prazo de card às 20h de São Paulo: o Meu dia conta os dias com `floor`, e meia-noite do dia viraria "atrasado 1 dia". */
export function prazoDoCard(iso: string): string {
  return new Date(`${iso}T20:00:00-03:00`).toISOString();
}

/** Um instante de hoje, horas antes de agora — nada nasce no futuro. */
function horasAtras(agora: Date, horas: number): string {
  return new Date(agora.getTime() - horas * 3600_000).toISOString();
}
/** Um instante num dia passado, num horário de expediente. */
function noDia(iso: string, hora = "10:00"): string {
  return new Date(`${iso}T${hora}:00-03:00`).toISOString();
}

// ─── Cadastros ──────────────────────────────────────────────────────────────

const REGIME = "Simples Nacional - Comércio ou Serviço - Com Pró-labore - Com Funcionários";

export const EMPRESAS: readonly EmpresaDoPlano[] = [
  {
    chave: "matriz",
    name: `${MARCA} Padaria Pão de Ouro Ltda`,
    displayName: `${MARCA} Padaria Pão de Ouro`,
    tradeName: "Padaria Pão de Ouro",
    cnpj: cnpjDaPadaria(1),
    cnaePrincipal: "1091-1/02",
    taxRegime: REGIME,
    matriz: null,
    zipCode: "80530-000",
    addressStreet: "R MATEUS LEME",
    addressNumber: "2100",
    neighborhood: "SÃO FRANCISCO",
    city: "Curitiba",
    stateCode: "PR",
  },
  {
    chave: "centro",
    name: `${MARCA} Padaria Pão de Ouro — Filial Centro`,
    displayName: `${MARCA} Padaria Pão de Ouro — Filial Centro`,
    tradeName: "Padaria Pão de Ouro Centro",
    cnpj: cnpjDaPadaria(2),
    cnaePrincipal: "4721-1/02",
    taxRegime: REGIME,
    matriz: "matriz",
    zipCode: "80020-000",
    addressStreet: "R XV DE NOVEMBRO",
    addressNumber: "870",
    neighborhood: "CENTRO",
    city: "Curitiba",
    stateCode: "PR",
  },
  {
    chave: "batel",
    name: `${MARCA} Padaria Pão de Ouro — Filial Batel`,
    displayName: `${MARCA} Padaria Pão de Ouro — Filial Batel`,
    tradeName: "Padaria Pão de Ouro Batel",
    cnpj: cnpjDaPadaria(3),
    cnaePrincipal: "4721-1/02",
    taxRegime: REGIME,
    matriz: "matriz",
    zipCode: "80420-090",
    addressStreet: "AV DO BATEL",
    addressNumber: "1550",
    neighborhood: "BATEL",
    city: "Curitiba",
    stateCode: "PR",
  },
];

/** A categoria de cada empresa: nome próprio, para não colidir com o plano padrão do escritório. */
const CATEGORIAS: readonly { apelido: string; name: string; kind: Tipo; dreGroup: string | null; so?: ChaveDaEmpresa }[] = [
  { apelido: "insumos", name: "Insumos de produção (farinha, fermento, gás)", kind: "PAGAR", dreGroup: "cmv" },
  { apelido: "revenda", name: "Laticínios e frios para revenda", kind: "PAGAR", dreGroup: "cmv" },
  { apelido: "embalagens", name: "Embalagens e sacolas", kind: "PAGAR", dreGroup: "cmv" },
  { apelido: "folha-producao", name: "Folha da produção (padeiros e confeiteiros)", kind: "PAGAR", dreGroup: "mao_de_obra" },
  { apelido: "folha-balcao", name: "Folha do balcão e caixa", kind: "PAGAR", dreGroup: "pessoal" },
  { apelido: "prolabore", name: "Pró-labore dos sócios", kind: "PAGAR", dreGroup: "diretoria" },
  { apelido: "aluguel", name: "Aluguel da loja", kind: "PAGAR", dreGroup: "administrativas" },
  { apelido: "energia", name: "Energia elétrica da loja", kind: "PAGAR", dreGroup: "administrativas" },
  { apelido: "agua", name: "Água e esgoto da loja", kind: "PAGAR", dreGroup: "administrativas" },
  { apelido: "contabilidade", name: "Honorários de contabilidade e BPO", kind: "PAGAR", dreGroup: "administrativas" },
  { apelido: "manutencao", name: "Manutenção de fornos e equipamentos", kind: "PAGAR", dreGroup: "administrativas" },
  { apelido: "maquininha", name: "Taxas da maquininha de cartão", kind: "PAGAR", dreGroup: "financeiras" },
  { apelido: "tarifas", name: "Tarifas do banco", kind: "PAGAR", dreGroup: "financeiras" },
  { apelido: "das", name: "DAS — Simples Nacional", kind: "PAGAR", dreGroup: "impostos" },
  { apelido: "divulgacao", name: "Divulgação e redes sociais", kind: "PAGAR", dreGroup: "comerciais" },
  { apelido: "forno", name: "Forno turbo novo (parcelas)", kind: "PAGAR", dreGroup: "investimentos" },
  // A categoria sem classificação de propósito — só na matriz, só num mês (ver SITUACOES).
  { apelido: "delivery", name: "Taxas dos aplicativos de delivery", kind: "PAGAR", dreGroup: null, so: "matriz" },
  { apelido: "balcao", name: "Vendas no balcão", kind: "RECEBER", dreGroup: "receita_bruta" },
  { apelido: "encomendas", name: "Encomendas e eventos", kind: "RECEBER", dreGroup: "receita_bruta" },
  { apelido: "cafeterias", name: "Fornecimento a cafeterias", kind: "RECEBER", dreGroup: "receita_bruta" },
  { apelido: "rendimento", name: "Rendimento da aplicação automática", kind: "RECEBER", dreGroup: "outras_receitas" },
];

const CENTROS: Record<ChaveDaEmpresa, { name: string; code: string }[]> = {
  matriz: [
    { name: "Produção", code: "PROD" },
    { name: "Loja", code: "LOJA" },
    { name: "Administrativo", code: "ADM" },
  ],
  centro: [
    { name: "Loja", code: "LOJA" },
    { name: "Administrativo", code: "ADM" },
  ],
  batel: [
    { name: "Loja", code: "LOJA" },
    { name: "Administrativo", code: "ADM" },
  ],
};

/** As contrapartes, com o número do CNPJ fictício (null = sem documento). Nenhuma tem e-mail: a régua de cobrança só procura quem tem. */
const CONTRAPARTES: readonly { apelido: string; name: string; doc: number | null; categoria: string | null; centro: string | null; so?: ChaveDaEmpresa[] }[] = [
  { apelido: "moinho", name: "Moinho Campos Gerais Ltda", doc: 1, categoria: "insumos", centro: "PROD", so: ["matriz"] },
  { apelido: "gas", name: "Gás Forte Distribuidora Ltda", doc: 2, categoria: "insumos", centro: "PROD", so: ["matriz"] },
  { apelido: "laticinios", name: "Laticínios Campo Verde Ltda", doc: 3, categoria: "revenda", centro: "LOJA" },
  { apelido: "embalagens", name: "Embalagens Araucária Ltda", doc: 4, categoria: "embalagens", centro: null },
  { apelido: "imobiliaria", name: "Imobiliária Pinheiros Administração", doc: 5, categoria: "aluguel", centro: "ADM" },
  { apelido: "energia", name: "Energia Sul Distribuidora S.A.", doc: 6, categoria: "energia", centro: null },
  { apelido: "saneamento", name: "Saneamento Curitiba S.A.", doc: 7, categoria: "agua", centro: "ADM", so: ["matriz"] },
  { apelido: "contabil", name: "Escritório de Contabilidade e BPO", doc: 8, categoria: "contabilidade", centro: "ADM", so: ["matriz"] },
  { apelido: "assistencia", name: "TecForno Assistência Técnica Ltda", doc: 9, categoria: "manutencao", centro: "PROD", so: ["matriz"] },
  { apelido: "fornos", name: "Fornos Paraná Equipamentos Ltda", doc: 10, categoria: "forno", centro: "PROD", so: ["matriz"] },
  { apelido: "agencia", name: "Agência Fermento Digital", doc: 11, categoria: "divulgacao", centro: "LOJA", so: ["matriz"] },
  { apelido: "delivery", name: "Aplicativo de Entregas Rápidas", doc: 12, categoria: "delivery", centro: "LOJA", so: ["matriz"] },
  { apelido: "adquirente", name: "Adquirente de cartões (repasse e taxas)", doc: 13, categoria: null, centro: "LOJA" },
  { apelido: "banco", name: "Banco (tarifas e aplicação)", doc: null, categoria: null, centro: "ADM" },
  { apelido: "folha", name: "Folha de pagamento", doc: null, categoria: null, centro: null },
  { apelido: "socios", name: "Sócios (pró-labore)", doc: null, categoria: "prolabore", centro: "ADM", so: ["matriz"] },
  { apelido: "receita", name: "Receita Federal (DAS)", doc: null, categoria: "das", centro: "ADM", so: ["matriz"] },
  { apelido: "aroma", name: "Café Aroma do Batel", doc: 21, categoria: "cafeterias", centro: "PROD", so: ["matriz"] },
  { apelido: "graofino", name: "Cafeteria Grão Fino", doc: 22, categoria: "cafeterias", centro: "PROD", so: ["matriz"] },
  { apelido: "buffet", name: "Buffet Sabor & Festa", doc: 23, categoria: "encomendas", centro: "PROD", so: ["matriz"] },
  { apelido: "colegio", name: "Colégio Santa Clara", doc: 24, categoria: "encomendas", centro: "PROD", so: ["matriz"] },
  { apelido: "hotel", name: "Hotel Ipê Curitiba", doc: 25, categoria: "encomendas", centro: "PROD", so: ["matriz"] },
  { apelido: "encomenda", name: "Clientes de encomenda (PIX)", doc: null, categoria: "encomendas", centro: "PROD", so: ["matriz"] },
];

/**
 * A equipe fictícia do BPO: contas de acesso **inativas** (não entram no
 * Connect nem aparecem para receber tarefa), e-mail @exemplo.invalido e senha
 * que ninguém conhece. O "Meu time" mostra a carga delas pelo nome — a tela não
 * olha se a conta está ativa. Saem na limpeza pelas três marcas juntas: nome
 * "[demo]", e-mail fictício e conta inativa.
 */
export const EQUIPE: readonly MembroDaEquipe[] = [
  { chave: "equipe:ana", name: `${MARCA} Ana Souza`, email: `ana.souza${DOMINIO_FICTICIO}` },
  { chave: "equipe:bruno", name: `${MARCA} Bruno Lima`, email: `bruno.lima${DOMINIO_FICTICIO}` },
  { chave: "equipe:carla", name: `${MARCA} Carla Mendes`, email: `carla.mendes${DOMINIO_FICTICIO}` },
  { chave: "equipe:diego", name: `${MARCA} Diego Rocha`, email: `diego.rocha${DOMINIO_FICTICIO}` },
];

// ─── Montagem do financeiro ─────────────────────────────────────────────────

type Recorrente = {
  apelido: string;
  kind: Tipo;
  contraparte: string;
  categoria: string;
  centro: string | null;
  dia: number;
  base: number;
  pct: number;
  /** "anterior": o salário de setembro, pago em 5 de outubro, é de setembro. */
  competencia: "mesmo" | "anterior";
  descricao: (competencia: string) => string;
  /** Atraso de pagamento possível (dias), para o "atraso médio" das Análises não ser zero. */
  atrasa?: boolean;
};

const doMes = (texto: string) => (c: string) => `${texto} — ${nomeDoMes(c)}`;

const RECORRENTES: Record<ChaveDaEmpresa, readonly Recorrente[]> = {
  matriz: [
    { apelido: "folha-producao", kind: "PAGAR", contraparte: "folha", categoria: "folha-producao", centro: "PROD", dia: 5, base: 1_620_000, pct: 3, competencia: "anterior", descricao: doMes("Folha da produção") },
    { apelido: "folha-balcao", kind: "PAGAR", contraparte: "folha", categoria: "folha-balcao", centro: "LOJA", dia: 5, base: 940_000, pct: 3, competencia: "anterior", descricao: doMes("Folha do balcão") },
    { apelido: "prolabore", kind: "PAGAR", contraparte: "socios", categoria: "prolabore", centro: "ADM", dia: 5, base: 600_000, pct: 0, competencia: "anterior", descricao: doMes("Pró-labore") },
    { apelido: "aluguel", kind: "PAGAR", contraparte: "imobiliaria", categoria: "aluguel", centro: "ADM", dia: 10, base: 750_000, pct: 0, competencia: "mesmo", descricao: doMes("Aluguel do galpão da produção") },
    { apelido: "contabilidade", kind: "PAGAR", contraparte: "contabil", categoria: "contabilidade", centro: "ADM", dia: 10, base: 145_000, pct: 0, competencia: "anterior", descricao: doMes("Honorários de contabilidade e BPO") },
    { apelido: "energia", kind: "PAGAR", contraparte: "energia", categoria: "energia", centro: "PROD", dia: 12, base: 330_000, pct: 12, competencia: "anterior", descricao: doMes("Conta de energia"), atrasa: true },
    { apelido: "agua", kind: "PAGAR", contraparte: "saneamento", categoria: "agua", centro: "ADM", dia: 20, base: 62_000, pct: 10, competencia: "anterior", descricao: doMes("Conta de água"), atrasa: true },
    { apelido: "das", kind: "PAGAR", contraparte: "receita", categoria: "das", centro: "ADM", dia: 20, base: 460_000, pct: 8, competencia: "anterior", descricao: doMes("DAS do Simples Nacional") },
    { apelido: "farinha-1", kind: "PAGAR", contraparte: "moinho", categoria: "insumos", centro: "PROD", dia: 8, base: 690_000, pct: 10, competencia: "mesmo", descricao: doMes("Farinha e fermento — 1ª quinzena"), atrasa: true },
    { apelido: "farinha-2", kind: "PAGAR", contraparte: "moinho", categoria: "insumos", centro: "PROD", dia: 22, base: 690_000, pct: 10, competencia: "mesmo", descricao: doMes("Farinha e fermento — 2ª quinzena"), atrasa: true },
    { apelido: "laticinios-1", kind: "PAGAR", contraparte: "laticinios", categoria: "revenda", centro: "LOJA", dia: 3, base: 340_000, pct: 12, competencia: "mesmo", descricao: doMes("Laticínios e frios — 1ª quinzena") },
    { apelido: "laticinios-2", kind: "PAGAR", contraparte: "laticinios", categoria: "revenda", centro: "LOJA", dia: 18, base: 340_000, pct: 12, competencia: "mesmo", descricao: doMes("Laticínios e frios — 2ª quinzena") },
    { apelido: "embalagens", kind: "PAGAR", contraparte: "embalagens", categoria: "embalagens", centro: "PROD", dia: 25, base: 210_000, pct: 10, competencia: "mesmo", descricao: doMes("Embalagens e sacolas") },
    { apelido: "maquininha", kind: "PAGAR", contraparte: "adquirente", categoria: "maquininha", centro: "LOJA", dia: 28, base: 145_000, pct: 8, competencia: "mesmo", descricao: doMes("Taxas da maquininha") },
    { apelido: "tarifas", kind: "PAGAR", contraparte: "banco", categoria: "tarifas", centro: "ADM", dia: 1, base: 8_990, pct: 0, competencia: "mesmo", descricao: doMes("Pacote de tarifas do banco") },
    { apelido: "divulgacao", kind: "PAGAR", contraparte: "agencia", categoria: "divulgacao", centro: "LOJA", dia: 25, base: 80_000, pct: 0, competencia: "mesmo", descricao: doMes("Gestão das redes sociais") },
    { apelido: "rendimento", kind: "RECEBER", contraparte: "banco", categoria: "rendimento", centro: "ADM", dia: 1, base: 5_400, pct: 25, competencia: "mesmo", descricao: doMes("Rendimento da aplicação automática") },
  ],
  centro: [
    { apelido: "folha-balcao", kind: "PAGAR", contraparte: "folha", categoria: "folha-balcao", centro: "LOJA", dia: 5, base: 690_000, pct: 3, competencia: "anterior", descricao: doMes("Folha da loja") },
    { apelido: "aluguel", kind: "PAGAR", contraparte: "imobiliaria", categoria: "aluguel", centro: "ADM", dia: 10, base: 420_000, pct: 0, competencia: "mesmo", descricao: doMes("Aluguel da loja") },
    { apelido: "energia", kind: "PAGAR", contraparte: "energia", categoria: "energia", centro: null, dia: 12, base: 125_000, pct: 12, competencia: "anterior", descricao: doMes("Conta de energia") },
    { apelido: "revenda", kind: "PAGAR", contraparte: "laticinios", categoria: "revenda", centro: "LOJA", dia: 18, base: 280_000, pct: 12, competencia: "mesmo", descricao: doMes("Laticínios e frios") },
    { apelido: "embalagens", kind: "PAGAR", contraparte: "embalagens", categoria: "embalagens", centro: "LOJA", dia: 25, base: 60_000, pct: 10, competencia: "mesmo", descricao: doMes("Embalagens e sacolas") },
    { apelido: "maquininha", kind: "PAGAR", contraparte: "adquirente", categoria: "maquininha", centro: "LOJA", dia: 28, base: 62_000, pct: 8, competencia: "mesmo", descricao: doMes("Taxas da maquininha") },
    { apelido: "tarifas", kind: "PAGAR", contraparte: "banco", categoria: "tarifas", centro: "ADM", dia: 1, base: 5_990, pct: 0, competencia: "mesmo", descricao: doMes("Pacote de tarifas do banco") },
  ],
  batel: [
    { apelido: "folha-balcao", kind: "PAGAR", contraparte: "folha", categoria: "folha-balcao", centro: "LOJA", dia: 5, base: 760_000, pct: 3, competencia: "anterior", descricao: doMes("Folha da loja") },
    { apelido: "aluguel", kind: "PAGAR", contraparte: "imobiliaria", categoria: "aluguel", centro: "ADM", dia: 10, base: 510_000, pct: 0, competencia: "mesmo", descricao: doMes("Aluguel da loja") },
    { apelido: "energia", kind: "PAGAR", contraparte: "energia", categoria: "energia", centro: null, dia: 12, base: 138_000, pct: 12, competencia: "anterior", descricao: doMes("Conta de energia") },
    { apelido: "revenda", kind: "PAGAR", contraparte: "laticinios", categoria: "revenda", centro: "LOJA", dia: 18, base: 310_000, pct: 12, competencia: "mesmo", descricao: doMes("Laticínios e frios") },
    { apelido: "embalagens", kind: "PAGAR", contraparte: "embalagens", categoria: "embalagens", centro: "LOJA", dia: 25, base: 68_000, pct: 10, competencia: "mesmo", descricao: doMes("Embalagens e sacolas") },
    { apelido: "maquininha", kind: "PAGAR", contraparte: "adquirente", categoria: "maquininha", centro: "LOJA", dia: 28, base: 70_000, pct: 8, competencia: "mesmo", descricao: doMes("Taxas da maquininha") },
    { apelido: "tarifas", kind: "PAGAR", contraparte: "banco", categoria: "tarifas", centro: "ADM", dia: 1, base: 5_990, pct: 0, competencia: "mesmo", descricao: doMes("Pacote de tarifas do banco") },
  ],
};

/** O repasse semanal das vendas no cartão, toda segunda. */
const BALCAO: Record<ChaveDaEmpresa, number> = { matriz: 1_520_000, centro: 640_000, batel: 710_000 };
const ABERTURA: Record<ChaveDaEmpresa, number> = { matriz: 4_200_000, centro: 1_100_000, batel: 1_350_000 };

/** O memo como o banco escreve: é dele que a conciliação tira CNPJ e nome. */
function memoDo(l: LancamentoDoPlano, contraparte: ContraparteDoPlano): string {
  const doc = contraparte.document ? ` ${cnpjFormatado(contraparte.document)}` : "";
  const nome = contraparte.name.toUpperCase();
  const apelido = contraparte.chave.split(":")[1];
  if (l.kind === "RECEBER") {
    if (apelido === "adquirente") return "REPASSE VENDAS CARTOES ADQUIRENTE";
    if (apelido === "banco") return "REND PAGO APLIC AUT";
    return `PIX RECEBIDO ${nome}${doc}`;
  }
  if (apelido === "folha") return "SISPAG SALARIOS";
  if (apelido === "socios") return "PIX ENVIADO PRO-LABORE SOCIOS";
  if (apelido === "receita") return "PAGTO DAS SIMPLES NACIONAL";
  if (apelido === "banco") return "TAR PACOTE SERVICOS";
  if (apelido === "adquirente") return `DEB TAXAS ADQUIRENTE${doc}`;
  return `SISPAG FORNECEDORES ${nome}${doc}`;
}

type Financeiro = Pick<PlanoDoBpo, "lancamentos" | "aprovacoes" | "acordos" | "contatos" | "extratos" | "transacoes">;

function montarFinanceiro(hoje: string, meses: string[], contrapartes: Map<string, ContraparteDoPlano>, contas: ContaDoPlano[]): Financeiro {
  const ontem = somarDias(hoje, -1);
  const mesAtual = meses[meses.length - 1]!;
  const limiteFuturo = somarDias(hoje, 60);
  const lancamentos: LancamentoDoPlano[] = [];
  const aprovacoes: EventoDeAprovacao[] = [];
  const contatos: ContatoDeCobranca[] = [];
  /** Lançamentos que NÃO viram transação conciliada (as histórias do extrato, o original renegociado). */
  const foraDoExtrato = new Set<string>();

  const criado = (vencimento: string) => {
    const c = somarDias(vencimento, -7);
    return c < ontem ? c : ontem;
  };

  function lancar(
    l: Omit<LancamentoDoPlano, "criadoPor" | "criadoEm" | "aprovacao" | "aprovadoEm" | "renegociadoNo" | "parcelaDo" | "status" | "pagoEm"> &
      Partial<Pick<LancamentoDoPlano, "criadoPor" | "criadoEm" | "aprovacao" | "aprovadoEm" | "renegociadoNo" | "parcelaDo" | "status" | "pagoEm">> & { atrasa?: boolean }
  ): LancamentoDoPlano {
    const { atrasa, ...resto } = l;
    // Pago se venceu antes de hoje; às vezes com uns dias de atraso, nunca hoje nem no futuro.
    let pagoEm: string | null = null;
    if (l.pagoEm !== undefined) pagoEm = l.pagoEm;
    else if (l.vencimento < hoje) {
      const atraso = atrasa ? [0, 0, 1, 2, 3][hash(l.chave) % 5]! : 0;
      const dia = diaUtil(somarDias(l.vencimento, atraso));
      pagoEm = dia < hoje ? dia : l.vencimento;
    }
    const lancamento: LancamentoDoPlano = {
      criadoPor: "apresentador",
      criadoEm: criado(l.vencimento),
      aprovacao: "NAO_REQUER",
      aprovadoEm: null,
      renegociadoNo: null,
      parcelaDo: null,
      ...resto,
      status: l.status ?? (pagoEm ? "PAGO" : "CONFERIDO"),
      pagoEm,
    };
    lancamentos.push(lancamento);
    return lancamento;
  }

  for (const conta of contas) {
    const e = conta.empresa;
    const cp = (apelido: string) => `${e}:${apelido}`;
    const cat = (apelido: string) => `${e}:${apelido}`;
    const cc = (code: string | null) => (code ? `${e}:${code}` : null);

    // ── Recorrentes: os meses do histórico e o próximo — no próximo, só o que é
    // do mês atual (competência "anterior"), para nada abrir a DRE no futuro.
    for (const r of RECORRENTES[e]) {
      for (const m of [...meses, mesSomado(mesAtual, 1)]) {
        const competencia = r.competencia === "anterior" ? mesSomado(m, -1) : m;
        if (competencia > mesAtual || competencia < meses[0]!) continue;
        const vencimento = diaUtil(diaDoMes(m, r.dia));
        if (vencimento > limiteFuturo) continue;
        const chave = `${e}:${r.apelido}:${m}`;
        lancar({
          chave,
          empresa: e,
          kind: r.kind,
          contraparte: cp(r.contraparte),
          categoria: cat(r.categoria),
          centro: cc(r.centro),
          competence: competencia,
          vencimento,
          centavos: variar(r.base, chave, r.pct),
          descricao: r.descricao(competencia),
          atrasa: r.atrasa,
        });
      }
    }

    // ── Repasse semanal do cartão (vendas no balcão): toda segunda do histórico.
    let segunda = conta.aberturaEm;
    while (diaDaSemana(segunda) !== 0) segunda = somarDias(segunda, 1);
    for (; mesDe(segunda) <= mesAtual; segunda = somarDias(segunda, 7)) {
      const chave = `${e}:balcao:${segunda}`;
      lancar({
        chave,
        empresa: e,
        kind: "RECEBER",
        contraparte: cp("adquirente"),
        categoria: cat("balcao"),
        centro: cc("LOJA"),
        competence: mesDe(segunda),
        vencimento: segunda,
        centavos: variar(BALCAO[e], chave, 9),
        descricao: `Repasse das vendas no cartão — semana de ${segunda.slice(8, 10)}/${segunda.slice(5, 7)}`,
      });
    }
  }

  // ── Só da matriz ──────────────────────────────────────────────────────────
  const m = "matriz" as const;
  const cpM = (a: string) => `matriz:${a}`;

  // Cafeterias: a nota do mês sai no fim do mês e vence no dia 10 do seguinte.
  for (const comp of meses) {
    for (const [apelido, base] of [["aroma", 520_000], ["graofino", 410_000]] as const) {
      const vencimento = diaUtil(diaDoMes(mesSomado(comp, 1), 10));
      if (vencimento > limiteFuturo) continue;
      const chave = `matriz:${apelido}:${comp}`;
      lancar({
        chave,
        empresa: m,
        kind: "RECEBER",
        contraparte: cpM(apelido),
        categoria: "matriz:cafeterias",
        centro: "matriz:PROD",
        competence: comp,
        vencimento,
        centavos: variar(base, chave, 10),
        descricao: `Fornecimento de pães e salgados — ${nomeDoMes(comp)}`,
        atrasa: true,
      });
    }
    // Encomendas pagas no PIX, no dia.
    for (const [i, dia] of [7, 16, 24].entries()) {
      const vencimento = diaUtil(diaDoMes(comp, dia));
      if (vencimento >= hoje) continue;
      const chave = `matriz:encomenda:${comp}:${i}`;
      const quem = ["encomenda", "colegio", "encomenda"][i]!;
      lancar({
        chave,
        empresa: m,
        kind: "RECEBER",
        contraparte: cpM(quem),
        categoria: "matriz:encomendas",
        centro: "matriz:PROD",
        competence: comp,
        vencimento,
        centavos: variar([240_000, 310_000, 180_000][i]!, chave, 30),
        descricao: ["Encomenda — bolos e doces de aniversário", "Lanches da semana do colégio", "Encomenda — kit café da manhã corporativo"][i]!,
      });
    }
  }

  // Forno turbo novo: dez parcelas desde o dia 15 de três meses atrás; a
  // compra inteira na competência dela (o caixa vê as parcelas, a competência
  // vê o investimento de uma vez).
  const mesDoForno = meses[meses.length - 4]!;
  for (let i = 0; i < 10; i++) {
    const vencimento = diaUtil(diaDoMes(mesSomado(mesDoForno, i), 15));
    lancar({
      chave: `matriz:forno:${i + 1}`,
      empresa: m,
      kind: "PAGAR",
      contraparte: cpM("fornos"),
      categoria: "matriz:forno",
      centro: "matriz:PROD",
      competence: mesDoForno,
      vencimento,
      centavos: 220_000,
      descricao: `Forno turbo novo — parcela ${i + 1}/10`,
    });
  }

  // A categoria sem classificação: só no mês passado, duas cobranças do aplicativo.
  const mesPassado = meses[meses.length - 2]!;
  for (const [i, dia] of [10, 25].entries()) {
    const vencimento = diaUtil(diaDoMes(mesPassado, dia));
    lancar({
      chave: `matriz:delivery:${i + 1}`,
      empresa: m,
      kind: "PAGAR",
      contraparte: cpM("delivery"),
      categoria: "matriz:delivery",
      centro: "matriz:LOJA",
      competence: mesPassado,
      vencimento,
      pagoEm: vencimento < hoje ? vencimento : null,
      centavos: [38_640, 41_290][i]!,
      descricao: `Taxas do aplicativo de entregas — ${i === 0 ? "1ª" : "2ª"} quinzena de ${nomeDoMes(mesPassado)}`,
    });
  }

  // ── As histórias do roteiro ───────────────────────────────────────────────

  // 1. Conta a pagar que vence hoje, esperando a aprovação do cliente (acima da alçada).
  const masseira = lancar({
    chave: "historia:masseira",
    empresa: m,
    kind: "PAGAR",
    contraparte: cpM("assistencia"),
    categoria: "matriz:manutencao",
    centro: "matriz:PROD",
    competence: mesAtual,
    vencimento: hoje,
    centavos: 485_000,
    descricao: "Conserto da masseira espiral (troca do motor)",
    criadoPor: "outro",
    criadoEm: somarDias(hoje, -2),
    aprovacao: "AGUARDANDO",
  });
  aprovacoes.push({ lancamento: masseira.chave, decisao: "ENVIADO", quem: "outro", motivo: null, quando: noDia(somarDias(hoje, -2), "11:20") });

  // Mais duas na fila de aprovações: uma esperando, dentro da alçada; uma recusada.
  const uniformes = lancar({
    chave: "aprovacao:uniformes",
    empresa: m,
    kind: "PAGAR",
    contraparte: cpM("embalagens"),
    categoria: "matriz:embalagens",
    centro: "matriz:LOJA",
    competence: mesAtual,
    vencimento: diaUtil(somarDias(hoje, 7)),
    centavos: 198_000,
    descricao: "Uniformes e aventais da equipe do balcão",
    criadoPor: "outro",
    criadoEm: somarDias(hoje, -1),
    aprovacao: "AGUARDANDO",
  });
  aprovacoes.push({ lancamento: uniformes.chave, decisao: "ENVIADO", quem: "outro", motivo: null, quando: noDia(somarDias(hoje, -1), "15:05") });
  const cadeiras = lancar({
    chave: "aprovacao:cadeiras",
    empresa: m,
    kind: "PAGAR",
    contraparte: cpM("assistencia"),
    categoria: "matriz:manutencao",
    centro: "matriz:LOJA",
    competence: mesAtual,
    vencimento: diaUtil(somarDias(hoje, 12)),
    centavos: 215_000,
    descricao: "Reforma das cadeiras do salão",
    criadoPor: "outro",
    criadoEm: somarDias(hoje, -6),
    aprovacao: "REPROVADO",
  });
  aprovacoes.push(
    { lancamento: cadeiras.chave, decisao: "ENVIADO", quem: "outro", motivo: null, quando: noDia(somarDias(hoje, -6), "09:40") },
    { lancamento: cadeiras.chave, decisao: "REPROVADO", quem: "portal", motivo: "Vamos esperar a promoção do fornecedor em novembro.", quando: noDia(somarDias(hoje, -5), "18:12") }
  );
  // Uma aprovada e já paga, para o histórico da tela.
  const balcaoRefrigerado = lancar({
    chave: "aprovacao:balcao-refrigerado",
    empresa: m,
    kind: "PAGAR",
    contraparte: cpM("assistencia"),
    categoria: "matriz:manutencao",
    centro: "matriz:LOJA",
    competence: mesSomado(mesAtual, -2),
    vencimento: diaUtil(diaDoMes(mesSomado(mesAtual, -2), 18)),
    centavos: 360_000,
    descricao: "Troca do compressor do balcão refrigerado",
    criadoPor: "outro",
    aprovacao: "APROVADO",
  });
  balcaoRefrigerado.aprovadoEm = somarDias(balcaoRefrigerado.vencimento, -3);
  aprovacoes.push(
    { lancamento: balcaoRefrigerado.chave, decisao: "ENVIADO", quem: "outro", motivo: null, quando: noDia(somarDias(balcaoRefrigerado.vencimento, -4), "10:00") },
    { lancamento: balcaoRefrigerado.chave, decisao: "APROVADO", quem: "portal", motivo: null, quando: noDia(balcaoRefrigerado.aprovadoEm, "08:30") }
  );

  // Uma vencida, sem aprovação, para a tela de contas a pagar pintar de vermelho.
  lancar({
    chave: "vencida:camara-fria",
    empresa: m,
    kind: "PAGAR",
    contraparte: cpM("assistencia"),
    categoria: "matriz:manutencao",
    centro: "matriz:PROD",
    competence: mesAtual,
    vencimento: diaUtilAntes(somarDias(hoje, -6)),
    pagoEm: null,
    centavos: 96_000,
    descricao: "Manutenção da câmara fria",
  });

  // 3. A transação com sugestão de conciliação: o gás foi pago no banco ontem
  // e o lançamento continua em aberto. O extrato traz o CNPJ do fornecedor e o
  // valor exato — a conciliação sugere o par sozinha.
  const diaDoExtrato = diaUtilAntes(ontem);
  const gas = lancar({
    chave: "historia:gas",
    empresa: m,
    kind: "PAGAR",
    contraparte: cpM("gas"),
    categoria: "matriz:insumos",
    centro: "matriz:PROD",
    competence: mesDe(diaDoExtrato),
    vencimento: diaUtilAntes(somarDias(diaDoExtrato, -2)),
    pagoEm: null,
    centavos: 128_437,
    descricao: "Recarga de gás GLP do forno",
  });
  foraDoExtrato.add(gas.chave);
  // A do outro lado: o PIX da cafeteria chegou e a nota segue em aberto.
  const festival = lancar({
    chave: "historia:festival",
    empresa: m,
    kind: "RECEBER",
    contraparte: cpM("aroma"),
    categoria: "matriz:cafeterias",
    centro: "matriz:PROD",
    competence: mesDe(diaDoExtrato),
    vencimento: diaUtilAntes(somarDias(diaDoExtrato, -3)),
    pagoEm: null,
    centavos: 187_500,
    descricao: "Fornecimento extra para o festival de cafés",
  });
  foraDoExtrato.add(festival.chave);

  // 4. Cobrança: dois títulos vencidos (um com promessa de pagamento) e um acordo.
  const hotel = lancar({
    chave: "cobranca:hotel",
    empresa: m,
    kind: "RECEBER",
    contraparte: cpM("hotel"),
    categoria: "matriz:encomendas",
    centro: "matriz:PROD",
    competence: mesDe(diaUtilAntes(somarDias(hoje, -22))),
    vencimento: diaUtilAntes(somarDias(hoje, -22)),
    pagoEm: null,
    centavos: 430_000,
    descricao: "Café da manhã do congresso — 3 dias",
  });
  contatos.push({
    lancamento: hotel.chave,
    quando: noDia(diaUtilAntes(somarDias(hoje, -5)), "14:30"),
    canal: "TELEFONE",
    resultado: "PROMETEU_PAGAR",
    notas: "Falei com o financeiro do hotel: prometeram pagar até sexta.",
    proximaAcao: diaUtil(somarDias(hoje, 2)),
    quem: "apresentador",
  });
  const colegio = lancar({
    chave: "cobranca:colegio",
    empresa: m,
    kind: "RECEBER",
    contraparte: cpM("colegio"),
    categoria: "matriz:encomendas",
    centro: "matriz:PROD",
    competence: mesDe(diaUtilAntes(somarDias(hoje, -9))),
    vencimento: diaUtilAntes(somarDias(hoje, -9)),
    pagoEm: null,
    centavos: 185_000,
    descricao: "Lanches da festa da família",
  });
  contatos.push({
    lancamento: colegio.chave,
    quando: noDia(diaUtilAntes(somarDias(hoje, -2)), "10:15"),
    canal: "WHATSAPP",
    resultado: "SEM_RESPOSTA",
    notas: "Mensagem para a secretaria, sem resposta.",
    proximaAcao: diaUtil(somarDias(hoje, 1)),
    quem: "apresentador",
  });

  const acordadoEm = diaUtilAntes(somarDias(hoje, -40));
  const original = lancar({
    chave: "acordo:original",
    empresa: m,
    kind: "RECEBER",
    contraparte: cpM("buffet"),
    categoria: "matriz:encomendas",
    centro: "matriz:PROD",
    competence: mesDe(diaUtilAntes(somarDias(hoje, -48))),
    vencimento: diaUtilAntes(somarDias(hoje, -48)),
    pagoEm: null,
    status: "CANCELADO",
    centavos: 900_000,
    descricao: "Salgados e doces de um casamento",
    renegociadoNo: "acordo:buffet",
  });
  foraDoExtrato.add(original.chave);
  const acordo: AcordoDoPlano = {
    chave: "acordo:buffet",
    empresa: m,
    contraparte: cpM("buffet"),
    originalCentavos: 900_000,
    acordadoCentavos: 810_000,
    parcelas: 3,
    primeiroVencimento: diaUtil(somarDias(hoje, -10)),
    acordadoEm,
    notas: "Desconto de 10% para quitar em três parcelas mensais.",
  };
  for (let i = 0; i < 3; i++) {
    const vencimento = i === 0 ? acordo.primeiroVencimento : diaUtil(somarDias(hoje, -10 + 30 * i));
    lancar({
      chave: `acordo:parcela:${i + 1}`,
      empresa: m,
      kind: "RECEBER",
      contraparte: cpM("buffet"),
      categoria: "matriz:encomendas",
      centro: "matriz:PROD",
      competence: mesDe(acordadoEm),
      vencimento,
      centavos: 270_000,
      descricao: `Parcela ${i + 1}/3 do acordo com o Buffet Sabor & Festa`,
      parcelaDo: acordo.chave,
    });
  }

  // Encomenda futura (sinal já combinado, saldo na entrega).
  lancar({
    chave: "futuro:encomenda",
    empresa: m,
    kind: "RECEBER",
    contraparte: cpM("encomenda"),
    categoria: "matriz:encomendas",
    centro: "matriz:PROD",
    competence: mesAtual,
    vencimento: diaUtil(somarDias(hoje, 9)),
    centavos: 268_000,
    descricao: "Encomenda — bolo e doces da festa de 15 anos",
  });

  // ── O extrato: cada lançamento pago vira uma transação conciliada no dia ──
  const extratos: ExtratoDoPlano[] = [];
  const transacoes: TransacaoDoPlano[] = [];
  const sequencia = new Map<string, number>();
  const fitId = (conta: ChaveDaEmpresa, dia: string) => {
    const k = `${conta}:${dia}`;
    const n = (sequencia.get(k) ?? 0) + 1;
    sequencia.set(k, n);
    return `DEMO${dia.replace(/-/g, "")}${String(n).padStart(3, "0")}`;
  };
  const extratoDe = (conta: ChaveDaEmpresa, dia: string) => `${conta}:${mesDe(dia)}`;

  for (const l of lancamentos) {
    if (!l.pagoEm || foraDoExtrato.has(l.chave)) continue;
    const c = contrapartes.get(l.contraparte)!;
    transacoes.push({
      chave: `tx:${l.chave}`,
      conta: l.empresa,
      extrato: extratoDe(l.empresa, l.pagoEm),
      fitId: fitId(l.empresa, l.pagoEm),
      data: l.pagoEm,
      centavos: l.kind === "PAGAR" ? -l.centavos : l.centavos,
      memo: memoDo(l, c),
      status: "CONCILIADA",
      lancamentos: [l.chave],
      motivoIgnorada: null,
    });
  }

  // O que está no extrato da matriz e ainda não foi conciliado.
  const gasCp = contrapartes.get(gas.contraparte)!;
  const aromaCp = contrapartes.get(festival.contraparte)!;
  transacoes.push(
    {
      chave: "tx:historia:gas",
      conta: m,
      extrato: extratoDe(m, diaDoExtrato),
      fitId: fitId(m, diaDoExtrato),
      data: diaDoExtrato,
      centavos: -gas.centavos,
      memo: memoDo(gas, gasCp),
      status: "PENDENTE",
      lancamentos: [],
      motivoIgnorada: null,
    },
    {
      chave: "tx:historia:festival",
      conta: m,
      extrato: extratoDe(m, diaDoExtrato),
      fitId: fitId(m, diaDoExtrato),
      data: diaDoExtrato,
      centavos: festival.centavos,
      memo: memoDo(festival, aromaCp),
      status: "PENDENTE",
      lancamentos: [],
      motivoIgnorada: null,
    },
    {
      chave: "tx:devolucao",
      conta: m,
      extrato: extratoDe(m, diaDoExtrato),
      fitId: fitId(m, diaDoExtrato),
      data: diaDoExtrato,
      centavos: 31_240,
      memo: `TED RECEBIDA LATICINIOS CAMPO VERDE LTDA ${cnpjFormatado(cnpjDeContraparte(3))} DEVOLUCAO`,
      status: "PENDENTE",
      lancamentos: [],
      motivoIgnorada: null,
    }
  );
  const diaDaAplicacao = diaUtilAntes(somarDias(hoje, -8));
  transacoes.push({
    chave: "tx:aplicacao",
    conta: m,
    extrato: extratoDe(m, diaDaAplicacao),
    fitId: fitId(m, diaDaAplicacao),
    data: diaDaAplicacao,
    centavos: -500_000,
    memo: "APLICACAO AUTOMATICA CDB DI",
    status: "IGNORADA",
    lancamentos: [],
    motivoIgnorada: "Aplicação automática do banco — dinheiro guardado, não é despesa.",
  });

  // Um extrato por conta e por mês, com o saldo do banco no fim do período.
  for (const conta of contas) {
    const daConta = transacoes.filter((t) => t.conta === conta.chave).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    let saldo = conta.aberturaCentavos;
    for (const mes of meses) {
      const doMesTx = daConta.filter((t) => mesDe(t.data) === mes);
      saldo += doMesTx.reduce((s, t) => s + t.centavos, 0);
      const fimDoMes = diaDoMes(mes, 31);
      const fim = fimDoMes < hoje ? fimDoMes : ontem;
      extratos.push({
        chave: `${conta.chave}:${mes}`,
        conta: conta.chave,
        fileName: `${MARCA} extrato-itau-${conta.chave}-${mes}.ofx`,
        inicio: `${mes}-01`,
        fim,
        saldoCentavos: saldo,
        transacoes: doMesTx.length,
      });
    }
  }

  return { lancamentos, aprovacoes, acordos: [acordo], contatos, extratos, transacoes };
}

// ─── Telas gerais ───────────────────────────────────────────────────────────

function montarQuadro(hoje: string, agora: Date): QuadroDoPlano {
  const etapas = (prefixo: string): EtapaDoPlano[] => [
    { chave: `${prefixo}:fazer`, name: "A fazer", type: "NOT_STARTED", color: "#94a3b8" },
    { chave: `${prefixo}:fazendo`, name: "Fazendo", type: "IN_PROGRESS", color: "#3b82f6" },
    { chave: `${prefixo}:cliente`, name: "Esperando o cliente", type: "PENDING", color: "#f59e0b" },
    { chave: `${prefixo}:feito`, name: "Concluído", type: "DONE", color: "#22c55e" },
  ];
  const dias = (n: number) => diaUtil(somarDias(hoje, n));
  const antes = (n: number) => diaUtilAntes(somarDias(hoje, -n));
  const criado = (tipo: AtividadeDoPlano["tipo"], quem: Responsavel, quando: string, content: string | null = null, respostaA: number | null = null): AtividadeDoPlano => ({
    tipo,
    quem,
    content,
    quando,
    respostaA,
  });
  const mesPassado = nomeDoMes(somarDias(`${hoje.slice(0, 7)}-01`, -1).slice(0, 7));
  const mesAtual = nomeDoMes(hoje.slice(0, 7));

  const cards: CardDoPlano[] = [
    {
      chave: "card:conciliar",
      lista: "lista:fechamento",
      etapa: "fechamento:fazendo",
      title: `Conciliar o extrato de ${mesAtual}`,
      description: "Conciliar as três contas (matriz e filiais) até o dia 20. Na matriz há uma sugestão de conciliação esperando — o gás do forno.",
      empresa: "matriz",
      prioridade: 1,
      inicio: antes(3),
      prazo: prazoDoCard(dias(2)),
      estimativaMinutos: 180,
      responsaveis: ["apresentador"],
      etiquetas: [`${MARCA} Fechamento`],
      checklist: [
        { text: "Importar o OFX das três contas", done: true },
        { text: "Conciliar a matriz", done: false },
        { text: "Conciliar as filiais", done: false },
      ],
      pai: null,
      ordem: 0,
      criadoEm: noDia(antes(5), "09:00"),
      atualizadoEm: horasAtras(agora, 3),
      atividades: [
        criado("CREATED", "apresentador", noDia(antes(5), "09:00")),
        criado("NOTE", "outro", noDia(antes(1), "16:40"), "O extrato da filial Batel só chega amanhã, o banco mudou o layout do OFX."),
        criado("NOTE", "apresentador", horasAtras(agora, 3), "Combinado, concilio a matriz hoje e as filiais amanhã.", 1),
      ],
      horas: [{ quem: "apresentador", minutos: 45, nota: "Importação e conferência dos saldos", dia: antes(1) }],
    },
    {
      chave: "card:conciliar:matriz",
      lista: "lista:fechamento",
      etapa: "fechamento:feito",
      title: "Matriz — importar o extrato",
      description: "",
      empresa: "matriz",
      prioridade: 0,
      inicio: null,
      prazo: null,
      estimativaMinutos: null,
      responsaveis: ["apresentador"],
      etiquetas: [],
      checklist: [],
      pai: "card:conciliar",
      ordem: 0,
      criadoEm: noDia(antes(5), "09:05"),
      atualizadoEm: noDia(antes(1), "11:00"),
      atividades: [criado("CREATED", "apresentador", noDia(antes(5), "09:05"))],
      horas: [],
    },
    {
      chave: "card:conciliar:filiais",
      lista: "lista:fechamento",
      etapa: "fechamento:fazer",
      title: "Filiais — conciliar Centro e Batel",
      description: "",
      empresa: "centro",
      prioridade: 0,
      inicio: null,
      prazo: null,
      estimativaMinutos: null,
      responsaveis: ["apresentador"],
      etiquetas: [],
      checklist: [],
      pai: "card:conciliar",
      ordem: 1,
      criadoEm: noDia(antes(5), "09:06"),
      atualizadoEm: noDia(antes(5), "09:06"),
      atividades: [criado("CREATED", "apresentador", noDia(antes(5), "09:06"))],
      horas: [],
    },
    {
      chave: "card:dre",
      lista: "lista:fechamento",
      etapa: "fechamento:fazendo",
      title: `Fechar a DRE de ${mesPassado}`,
      description: "Falta classificar as taxas do aplicativo de delivery (categoria nova, sem grupo da DRE).",
      empresa: "matriz",
      prioridade: 2,
      inicio: antes(4),
      prazo: prazoDoCard(hoje),
      estimativaMinutos: 120,
      responsaveis: ["apresentador"],
      etiquetas: [`${MARCA} Fechamento`, `${MARCA} Prioridade do cliente`],
      checklist: [
        { text: "Conferir os lançamentos sem categoria", done: true },
        { text: "Classificar as categorias novas", done: false },
        { text: "Mandar o resumo para o cliente", done: false },
      ],
      pai: null,
      ordem: 1,
      criadoEm: noDia(antes(6), "10:30"),
      atualizadoEm: horasAtras(agora, 5),
      atividades: [criado("CREATED", "apresentador", noDia(antes(6), "10:30")), criado("STATUS_CHANGE", "apresentador", noDia(antes(4), "08:50"))],
      horas: [{ quem: "apresentador", minutos: 90, nota: "Revisão das categorias do mês", dia: antes(2) }],
    },
    {
      chave: "card:cartao",
      lista: "lista:fechamento",
      etapa: "fechamento:cliente",
      title: `Cobrar o extrato do cartão de crédito de ${mesPassado}`,
      description: "Sem o extrato do cartão não dá para lançar as compras do mês. Pedido aberto como pendência para o cliente.",
      empresa: "matriz",
      prioridade: 1,
      inicio: antes(12),
      prazo: prazoDoCard(antes(3)),
      estimativaMinutos: 15,
      responsaveis: ["apresentador"],
      etiquetas: [`${MARCA} Esperando o cliente`],
      checklist: [],
      pai: null,
      ordem: 2,
      criadoEm: noDia(antes(12), "14:00"),
      atualizadoEm: noDia(antes(5), "09:30"),
      atividades: [criado("CREATED", "apresentador", noDia(antes(12), "14:00")), criado("STATUS_CHANGE", "apresentador", noDia(antes(5), "09:30"))],
      horas: [],
    },
    {
      chave: "card:notas",
      lista: "lista:fechamento",
      etapa: "fechamento:fazer",
      title: "Lançar as notas de compra da semana",
      description: "Notas do moinho e do laticínio que chegaram por e-mail.",
      empresa: "matriz",
      prioridade: 0,
      inicio: null,
      prazo: prazoDoCard(dias(4)),
      estimativaMinutos: 60,
      responsaveis: ["outro"],
      etiquetas: [],
      checklist: [],
      pai: null,
      ordem: 3,
      criadoEm: noDia(antes(2), "08:45"),
      atualizadoEm: noDia(antes(2), "08:45"),
      atividades: [criado("CREATED", "outro", noDia(antes(2), "08:45"))],
      horas: [],
    },
    {
      chave: "card:folha",
      lista: "lista:fechamento",
      etapa: "fechamento:fazer",
      title: `Conferir a folha de ${mesAtual} antes do pagamento`,
      description: "Bater a folha com o DP antes de agendar no banco.",
      empresa: "matriz",
      prioridade: 0,
      inicio: null,
      prazo: prazoDoCard(dias(12)),
      estimativaMinutos: 45,
      responsaveis: ["outro"],
      etiquetas: [],
      checklist: [],
      pai: null,
      ordem: 4,
      criadoEm: noDia(antes(1), "17:10"),
      atualizadoEm: noDia(antes(1), "17:10"),
      atividades: [criado("CREATED", "outro", noDia(antes(1), "17:10"))],
      horas: [],
    },
    {
      chave: "card:relatorio",
      lista: "lista:fechamento",
      etapa: "fechamento:feito",
      title: `Relatório mensal para o cliente — ${mesPassado}`,
      description: "DRE, fluxo de caixa e contas em aberto, enviados ao seu Joaquim.",
      empresa: "matriz",
      prioridade: 0,
      inicio: antes(6),
      prazo: prazoDoCard(antes(2)),
      estimativaMinutos: 60,
      responsaveis: ["apresentador"],
      etiquetas: [],
      checklist: [],
      pai: null,
      ordem: 5,
      criadoEm: noDia(antes(8), "09:00"),
      atualizadoEm: noDia(antes(2), "17:30"),
      atividades: [criado("CREATED", "apresentador", noDia(antes(8), "09:00")), criado("COMPLETED", "apresentador", noDia(antes(2), "17:30"))],
      horas: [{ quem: "apresentador", minutos: 50, nota: "Montagem do relatório", dia: antes(2) }],
    },
    {
      chave: "card:omie",
      lista: "lista:melhorias",
      etapa: "melhorias:fazendo",
      title: "Cadastrar a filial Batel no Omie",
      description: "Esperando o certificado digital da filial para terminar o cadastro.",
      empresa: "batel",
      prioridade: 0,
      inicio: antes(15),
      prazo: null,
      estimativaMinutos: 90,
      responsaveis: ["apresentador"],
      etiquetas: [],
      checklist: [
        { text: "Dados cadastrais", done: true },
        { text: "Certificado digital", done: false },
      ],
      pai: null,
      ordem: 0,
      // Parado há mais de dez dias de propósito: aparece em "Parados" no Meu dia.
      criadoEm: noDia(antes(15), "10:00"),
      atualizadoEm: noDia(antes(12), "16:00"),
      atividades: [criado("CREATED", "apresentador", noDia(antes(15), "10:00")), criado("STATUS_CHANGE", "apresentador", noDia(antes(12), "16:00"))],
      horas: [],
    },
    {
      chave: "card:acordo",
      lista: "lista:melhorias",
      etapa: "melhorias:feito",
      title: "Renegociar a dívida do Buffet Sabor & Festa",
      description: "Acordo fechado em três parcelas, com 10% de desconto.",
      empresa: "matriz",
      prioridade: 1,
      inicio: null,
      prazo: null,
      estimativaMinutos: null,
      responsaveis: ["apresentador"],
      etiquetas: [],
      checklist: [],
      pai: null,
      ordem: 1,
      criadoEm: noDia(antes(45), "11:00"),
      atualizadoEm: noDia(antes(40), "15:00"),
      atividades: [criado("CREATED", "apresentador", noDia(antes(45), "11:00")), criado("COMPLETED", "apresentador", noDia(antes(40), "15:00"))],
      horas: [],
    },
  ];

  // A rotina da equipe fictícia: o "Meu time" do coordenador mostra a carga de
  // cada pessoa (atrasados, parados, vencendo, em dia), os feitos da semana e
  // o que está sem responsável.
  const daEquipe = (
    chave: string,
    quem: Responsavel | null,
    etapa: "fazer" | "fazendo" | "cliente" | "feito",
    title: string,
    empresa: ChaveDaEmpresa,
    prazo: string | null,
    criadoHaDias: number,
    movidoEm: string,
    ordem: number,
    extra: Partial<CardDoPlano> = {}
  ): CardDoPlano => ({
    chave: `card:equipe:${chave}`,
    lista: "lista:equipe",
    etapa: `equipe:${etapa}`,
    title,
    description: "",
    empresa,
    prioridade: 0,
    inicio: null,
    prazo: prazo ? prazoDoCard(prazo) : null,
    estimativaMinutos: null,
    responsaveis: quem ? [quem] : [],
    etiquetas: [],
    checklist: [],
    pai: null,
    ordem,
    criadoEm: noDia(antes(criadoHaDias), "08:30"),
    atualizadoEm: movidoEm,
    atividades: [
      criado("CREATED", quem ?? "apresentador", noDia(antes(criadoHaDias), "08:30")),
      ...(etapa === "feito" ? [criado("COMPLETED", quem ?? "apresentador", movidoEm)] : etapa !== "fazer" ? [criado("STATUS_CHANGE", quem ?? "apresentador", movidoEm)] : []),
    ],
    horas: [],
    ...extra,
  });
  cards.push(
    daEquipe("centro-conciliar", "equipe:ana", "fazendo", "Conciliar a filial Centro", "centro", dias(1), 6, noDia(antes(1), "15:20"), 0, {
      horas: [{ quem: "equipe:ana", minutos: 70, nota: "Conciliação da primeira quinzena", dia: antes(1) }],
    }),
    daEquipe("centro-cartao", "equipe:ana", "fazer", "Lançar as despesas do cartão da filial Centro", "centro", antes(2), 8, noDia(antes(8), "08:30"), 1),
    daEquipe("centro-caixa", "equipe:ana", "fazer", "Conferir o fechamento de caixa da loja Centro", "centro", dias(6), 2, noDia(antes(2), "08:30"), 2),
    daEquipe("pagamentos", "equipe:bruno", "fazendo", "Agendar os pagamentos da semana", "matriz", hoje, 3, horasAtras(agora, 4), 3, { prioridade: 1 }),
    daEquipe("boletos", "equipe:bruno", "fazer", "Cadastrar os boletos novos do moinho", "matriz", antes(4), 9, noDia(antes(9), "08:30"), 4),
    // Parado de propósito: em andamento, sem movimento há mais de dez dias.
    daEquipe("categorias", "equipe:bruno", "fazendo", "Revisar as categorias do plano de contas", "matriz", null, 20, noDia(antes(13), "11:00"), 5),
    daEquipe("hotel", "equipe:carla", "cliente", "Cobrar o Hotel Ipê (promessa para sexta)", "matriz", dias(2), 5, noDia(antes(5), "14:40"), 6),
    daEquipe("notas-cafeterias", "equipe:carla", "fazer", "Emitir as notas das cafeterias", "matriz", dias(3), 1, noDia(antes(1), "08:30"), 7),
    daEquipe("regua", "equipe:carla", "feito", "Revisar os contatos de cobrança da Padaria", "matriz", antes(3), 10, noDia(antes(3), "16:10"), 8),
    daEquipe("relatorio-batel", "equipe:diego", "fazendo", "Montar o relatório mensal da filial Batel", "batel", dias(8), 4, noDia(antes(2), "10:00"), 9, {
      horas: [{ quem: "equipe:diego", minutos: 40, nota: "Gráficos do mês", dia: antes(2) }],
    }),
    daEquipe("orcamento", "equipe:diego", "fazer", "Primeira versão do orçamento do ano que vem", "matriz", null, 2, noDia(antes(2), "08:30"), 10),
    // Sem responsável: o "Meu time" conta à parte.
    daEquipe("plano-batel", null, "fazer", "Revisar o plano de contas da filial Batel", "batel", dias(10), 1, noDia(antes(1), "08:30"), 11)
  );

  return {
    espaco: { name: `${MARCA} Padaria Pão de Ouro`, color: "#b45309" },
    pastas: [{ chave: "pasta:rotina", name: "Rotina mensal" }],
    listas: [
      { chave: "lista:fechamento", name: "Fechamento do mês", pasta: "pasta:rotina", color: "#2563eb", etapas: etapas("fechamento") },
      { chave: "lista:equipe", name: "Rotina da equipe", pasta: "pasta:rotina", color: "#0d9488", etapas: etapas("equipe") },
      { chave: "lista:melhorias", name: "Implantação e melhorias", pasta: null, color: "#7c3aed", etapas: etapas("melhorias") },
    ],
    etiquetas: [
      { name: `${MARCA} Fechamento`, color: "#2563eb" },
      { name: `${MARCA} Prioridade do cliente`, color: "#dc2626" },
      { name: `${MARCA} Esperando o cliente`, color: "#d97706" },
    ],
    cards,
  };
}

// ─── Montagem ───────────────────────────────────────────────────────────────

export function montarDemonstracaoDoBpo(agora: Date): PlanoDoBpo {
  const hoje = hojeIso(agora);
  const mesAtual = hoje.slice(0, 7);
  const meses = Array.from({ length: MESES_DE_HISTORICO }, (_, i) => mesSomado(mesAtual, i - (MESES_DE_HISTORICO - 1)));

  const categorias: CategoriaDoPlano[] = EMPRESAS.flatMap((e) =>
    CATEGORIAS.filter((c) => !c.so || c.so === e.chave).map((c) => ({ chave: `${e.chave}:${c.apelido}`, empresa: e.chave, name: c.name, kind: c.kind, dreGroup: c.dreGroup }))
  );
  const centros: CentroDoPlano[] = EMPRESAS.flatMap((e) => CENTROS[e.chave].map((c) => ({ chave: `${e.chave}:${c.code}`, empresa: e.chave, name: c.name, code: c.code })));
  const contrapartes: ContraparteDoPlano[] = EMPRESAS.flatMap((e) =>
    CONTRAPARTES.filter((c) => !c.so || c.so.includes(e.chave)).map((c) => ({
      chave: `${e.chave}:${c.apelido}`,
      empresa: e.chave,
      name: c.name,
      document: c.doc === null ? null : cnpjDeContraparte(c.doc),
      categoria: c.categoria ? `${e.chave}:${c.categoria}` : null,
      centro: c.centro && CENTROS[e.chave].some((x) => x.code === c.centro) ? `${e.chave}:${c.centro}` : null,
    }))
  );
  const contas: ContaDoPlano[] = EMPRESAS.map((e, i) => ({
    chave: e.chave,
    empresa: e.chave,
    nickname: `Itaú — ${e.chave === "matriz" ? "movimento da matriz" : e.chave === "centro" ? "loja Centro" : "loja Batel"}`,
    bankCode: "341",
    agency: "3870",
    accountNumber: `${41020 + i}-${i + 3}`,
    accountDigits: `${41020 + i}${i + 3}`,
    aberturaCentavos: ABERTURA[e.chave],
    aberturaEm: `${meses[0]}-01`,
  }));

  const financeiro = montarFinanceiro(hoje, meses, new Map(contrapartes.map((c) => [c.chave, c])), contas);

  const d = (n: number) => diaUtilAntes(somarDias(hoje, -n));
  const mesPassado = meses[meses.length - 2]!;

  const pendencias: PendenciaDoPlano[] = [
    {
      // 2. A pendência atrasada.
      chave: "pendencia:cartao",
      empresa: "matriz",
      kind: "DOCUMENTO",
      title: `Enviar o extrato do cartão de crédito de ${nomeDoMes(mesPassado)}`,
      description: "Precisamos do extrato completo (PDF) para lançar as compras feitas no cartão.",
      vencimento: d(5),
      status: "ABERTA",
      criadoEm: noDia(d(12), "14:05"),
      resolvidoEm: null,
      lancamento: null,
      mensagens: [{ quem: "apresentador", body: "Seu Joaquim, conseguimos o extrato até sexta? Sem ele o fechamento atrasa.", quando: noDia(d(3), "09:30") }],
    },
    {
      chave: "pendencia:notas",
      empresa: "matriz",
      kind: "DOCUMENTO",
      title: "Notas fiscais de compra da semana",
      description: "As notas do moinho e do laticínio desta semana.",
      vencimento: diaUtil(somarDias(hoje, 3)),
      status: "ABERTA",
      criadoEm: noDia(d(1), "16:20"),
      resolvidoEm: null,
      lancamento: null,
      mensagens: [],
    },
    {
      chave: "pendencia:aluguel",
      empresa: "matriz",
      kind: "CONFIRMACAO",
      title: "Confirmar o reajuste do aluguel a partir do mês que vem",
      description: "A imobiliária mandou o boleto com reajuste de 4,5%. Está certo?",
      vencimento: d(1),
      status: "RESPONDIDA",
      criadoEm: noDia(d(4), "10:00"),
      resolvidoEm: null,
      lancamento: null,
      mensagens: [
        { quem: "apresentador", body: "O boleto do aluguel veio 4,5% maior. Podemos agendar assim?", quando: noDia(d(4), "10:00") },
        { quem: "portal", body: "Pode sim, o reajuste está no contrato (IGP-M).", quando: noDia(d(2), "19:42") },
      ],
    },
    {
      chave: "pendencia:funcionaria",
      empresa: "matriz",
      kind: "INFORMACAO",
      title: "Dados da nova funcionária do balcão",
      description: "Nome completo, CPF e data de admissão, para incluir na folha.",
      vencimento: d(10),
      status: "RESOLVIDA",
      criadoEm: noDia(d(14), "11:30"),
      resolvidoEm: noDia(d(8), "15:10"),
      lancamento: null,
      mensagens: [{ quem: "portal", body: "Mandei pelo WhatsApp do escritório.", quando: noDia(d(9), "18:00") }],
    },
    {
      chave: "pendencia:masseira",
      empresa: "matriz",
      kind: "DOCUMENTO",
      title: "Orçamento do conserto da masseira",
      description: "Para anexar à conta que está esperando a sua aprovação.",
      vencimento: diaUtil(somarDias(hoje, 1)),
      status: "ABERTA",
      criadoEm: noDia(d(2), "11:25"),
      resolvidoEm: null,
      lancamento: "historia:masseira",
      mensagens: [],
    },
  ];

  const conversa: ConversaDoPlano[] = [
    { empresa: "matriz", quem: "portal", body: "Bom dia! O fechamento de setembro já saiu?", quando: noDia(d(6), "08:15") },
    { empresa: "matriz", quem: "apresentador", body: "Bom dia, seu Joaquim! Sai até sexta, só falta o extrato do cartão.", quando: noDia(d(6), "09:02") },
    { empresa: "matriz", quem: "portal", body: "Vou pedir para a minha filha baixar hoje.", quando: noDia(d(6), "09:10") },
    { empresa: "matriz", quem: "apresentador", body: "Perfeito. E a conta do conserto da masseira está esperando a sua aprovação no portal.", quando: noDia(d(1), "11:30") },
  ];

  // Orçamento só do maio em diante: com janeiro a abril vazios no realizado, o
  // acumulado do ano mostraria um estouro que não existe.
  const ano = Number(mesAtual.slice(0, 4));
  // Histórico que começa no ano anterior: o orçamento deste ano vem de janeiro.
  const primeiroMes = meses[0]!.startsWith(String(ano)) ? Number(meses[0]!.slice(5, 7)) : 1;
  const porGrupo: Record<string, number> = {
    receita_bruta: 8_200_000,
    impostos: 470_000,
    cmv: 2_350_000,
    mao_de_obra: 1_600_000,
    pessoal: 950_000,
    diretoria: 600_000,
    administrativas: 1_300_000,
    financeiras: 160_000,
    comerciais: 90_000,
    investimentos: 250_000,
  };
  const orcamentos: OrcamentoDoPlano[] = [
    {
      empresa: "matriz",
      ano,
      nome: `${MARCA} Orçamento ${ano}`,
      aprovadoEm: `${meses[0]}-02`,
      linhas: Object.entries(porGrupo).flatMap(([grupo, centavos]) =>
        Array.from({ length: 12 - primeiroMes + 1 }, (_, i) => ({ grupo, mes: primeiroMes + i, centavos }))
      ),
    },
  ];

  const tomador = (apelido: string) => contrapartes.find((c) => c.chave === `matriz:${apelido}`)!;
  const emissoes: EmissaoDoPlano[] = [
    { estado: "AUTORIZADA", apelido: "buffet", servico: "Serviço de buffet para evento", valor: 900_000, n: 3, nfse: "2026000141", dias: 50 },
    { estado: "AUTORIZADA", apelido: "hotel", servico: "Serviço de café da manhã para evento", valor: 430_000, n: 2, nfse: "2026000156", dias: 24 },
    { estado: "AUTORIZADA", apelido: "colegio", servico: "Serviço de lanches para evento escolar", valor: 185_000, n: 1, nfse: "2026000163", dias: 11 },
    { estado: "REJEITADA", apelido: "aroma", servico: "Serviço de buffet para evento", valor: 187_500, n: 4, nfse: null, dias: 6 },
    { estado: "CANCELADA", apelido: "graofino", servico: "Serviço de buffet para evento", valor: 95_000, n: 5, nfse: "2026000149", dias: 33 },
  ].map((x) => {
    const c = tomador(x.apelido);
    const quando = d(x.dias);
    return {
      empresa: "matriz" as const,
      estado: x.estado as EmissaoDoPlano["estado"],
      tomadorCodigo: `90000${x.n}`,
      tomadorNome: c.name,
      tomadorDocumento: c.document,
      servicoCodigo: "SRV-BUFFET",
      servicoDescricao: x.servico,
      centavos: x.valor,
      competencia: mesDe(quando),
      descricao: `${x.servico} — ${c.name}`,
      numeroOS: `${1200 + x.n}`,
      nfseNumero: x.estado === "REJEITADA" ? null : x.nfse,
      mensagem: x.estado === "REJEITADA" ? "Código de serviço não permitido para o município do prestador. Corrija o cadastro do serviço no Omie." : null,
      quando: noDia(quando, "15:00"),
      faturadaEm: x.estado === "REJEITADA" ? null : noDia(quando, "15:04"),
      canceladaEm: x.estado === "CANCELADA" ? noDia(d(x.dias - 1), "10:20") : null,
    };
  });

  const senhas: SenhaDoPlano[] = [
    { empresa: "matriz", title: "Internet banking da matriz", username: "padaria.paodeouro", url: "https://exemplo.invalido/banco", notes: `${MARCA} Acesso fictício, só para a apresentação.` },
    { empresa: "matriz", title: "Prefeitura — emissão de NFS-e", username: "41000010000180", url: "https://exemplo.invalido/nfse", notes: `${MARCA} Acesso fictício, só para a apresentação.` },
    { empresa: "centro", title: "Maquininha — portal do lojista (Centro)", username: "loja.centro", url: "https://exemplo.invalido/lojista", notes: `${MARCA} Acesso fictício, só para a apresentação.` },
  ];

  const manual: ManualDoPlano = {
    title: `${MARCA} Rotina do BPO — passo a passo`,
    icon: "📘",
    paginas: [
      {
        title: "Como conciliar o extrato",
        content:
          "<p>1. Em <strong>Conciliação</strong>, escolha a empresa e importe o OFX do banco.</p><p>2. As transações com par sugerido aparecem com o lançamento ao lado: confira o valor e a data e confirme.</p><p>3. O que não tem par vira lançamento novo ou é ignorado com motivo (aplicação, transferência entre contas).</p><p>4. No fim, o saldo calculado tem de bater com o saldo do banco.</p>",
      },
      {
        title: "Como lançar uma conta a pagar",
        content:
          "<p>Em <strong>Lançamentos</strong>, escolha a empresa, a contraparte, a categoria e o centro de custo. Acima da alçada do cliente, a conta vai para aprovação no portal antes de ser paga.</p>",
      },
      {
        title: "Como pedir um documento ao cliente",
        content:
          "<p>Em <strong>Solicitações › Pedidos ao cliente</strong>, abra um pedido com prazo. O cliente vê no portal e responde por lá; a conversa fica guardada no pedido.</p>",
      },
      {
        title: "Fechamento do mês",
        content:
          "<p>Conciliar as contas, classificar as categorias novas na DRE, conferir as contas em aberto e mandar o relatório ao cliente até o dia 10.</p>",
      },
    ],
  };

  const solicitacoes: SolicitacaoDoPlano[] = [
    {
      chave: "solicitacao:fornecedor",
      empresa: "matriz",
      status: "ABERTA",
      description: "Podem pagar hoje o boleto do moinho? O vencimento é amanhã e eu mandei o boleto pelo WhatsApp.",
      prazoDeResposta: new Date(`${diaUtil(somarDias(hoje, 1))}T18:00:00-03:00`).toISOString(),
      primeiraRespostaEm: null,
      concluidaEm: null,
      criadoEm: horasAtras(agora, 2),
      responsavel: "apresentador",
      mensagens: [{ quem: "portal", body: "Podem pagar hoje o boleto do moinho? O vencimento é amanhã e eu mandei o boleto pelo WhatsApp.", interna: false, quando: horasAtras(agora, 2) }],
    },
    {
      chave: "solicitacao:resultado",
      empresa: "matriz",
      status: "EM_ANDAMENTO",
      description: "Quero entender por que o resultado de setembro caiu em relação a agosto.",
      prazoDeResposta: new Date(`${d(1)}T18:00:00-03:00`).toISOString(),
      primeiraRespostaEm: noDia(d(1), "10:20"),
      concluidaEm: null,
      criadoEm: noDia(d(2), "17:45"),
      responsavel: "apresentador",
      mensagens: [
        { quem: "portal", body: "Quero entender por que o resultado de setembro caiu em relação a agosto.", interna: false, quando: noDia(d(2), "17:45") },
        { quem: "apresentador", body: "Seu Joaquim, já estamos olhando: a energia subiu e entraram as taxas do aplicativo de delivery. Mando o detalhe amanhã.", interna: false, quando: noDia(d(1), "10:20") },
        { quem: "outro", body: "Lembrar de mostrar o comparativo das Análises (mês anterior).", interna: true, quando: noDia(d(1), "10:35") },
      ],
    },
    {
      chave: "solicitacao:banco",
      empresa: "matriz",
      status: "CONCLUIDA",
      description: "O banco pediu um relatório de contas a receber para renovar o limite. Conseguem mandar?",
      prazoDeResposta: new Date(`${d(6)}T18:00:00-03:00`).toISOString(),
      primeiraRespostaEm: noDia(d(6), "09:15"),
      concluidaEm: noDia(d(4), "16:00"),
      criadoEm: noDia(d(7), "15:30"),
      responsavel: "apresentador",
      mensagens: [
        { quem: "portal", body: "O banco pediu um relatório de contas a receber para renovar o limite. Conseguem mandar?", interna: false, quando: noDia(d(7), "15:30") },
        { quem: "apresentador", body: "Mandamos o relatório por e-mail para o gerente, com cópia para o senhor.", interna: false, quando: noDia(d(4), "16:00") },
      ],
    },
  ];

  const comunicado: ComunicadoDoPlano = {
    title: `${MARCA} Expediente do BPO no feriado de 2 de novembro`,
    body: "No feriado de Finados não haverá expediente. Pagamentos com vencimento no dia 2 serão agendados para o dia útil anterior.",
    empresas: ["matriz"],
    quando: noDia(d(3), "09:00"),
  };

  const quadro = montarQuadro(hoje, agora);
  const amanha = diaUtil(somarDias(hoje, 1));
  const reunioes: ReuniaoDoPlano[] = [
    {
      chave: "reuniao:fechamento",
      title: `Fechamento de ${nomeDoMes(mesPassado)} com o seu Joaquim`,
      empresa: "matriz",
      inicio: new Date(`${amanha}T10:00:00-03:00`).toISOString(),
      fim: new Date(`${amanha}T10:45:00-03:00`).toISOString(),
      participantes: ["apresentador", "outro"],
      card: "card:dre",
    },
    {
      chave: "reuniao:alinhamento",
      title: "Alinhamento semanal da carteira — Padaria Pão de Ouro",
      empresa: "matriz",
      inicio: new Date(`${hoje}T16:00:00-03:00`).toISOString(),
      fim: new Date(`${hoje}T16:30:00-03:00`).toISOString(),
      participantes: ["apresentador", "outro"],
      card: null,
    },
    {
      chave: "reuniao:onboarding",
      title: "Implantação da filial Batel",
      empresa: "batel",
      inicio: new Date(`${d(6)}T14:00:00-03:00`).toISOString(),
      fim: new Date(`${d(6)}T15:00:00-03:00`).toISOString(),
      participantes: ["apresentador"],
      card: "card:omie",
    },
  ];

  const pastas: PastaDoPlano[] = [
    { chave: "pasta:modelos", name: `${MARCA} Modelos do BPO`, pai: null, empresa: null },
    { chave: "pasta:modelos:procedimentos", name: "Procedimentos", pai: "pasta:modelos", empresa: null },
    { chave: "pasta:modelos:relatorios", name: "Relatórios para clientes", pai: "pasta:modelos", empresa: null },
    { chave: "pasta:padaria:extratos", name: `Extratos bancários ${ano}`, pai: null, empresa: "matriz" },
    { chave: "pasta:padaria:contratos", name: "Contratos e aditivos", pai: null, empresa: "matriz" },
  ];

  const avisos: AvisoDoPlano[] = [
    {
      quem: "apresentador",
      type: "COMMENT",
      message: `${MARCA} Novo comentário em "Conciliar o extrato de ${nomeDoMes(mesAtual)}"`,
      alvo: { tipo: "card", chave: "card:conciliar" },
      lida: false,
      quando: noDia(d(1), "16:41"),
      ator: "outro",
    },
    {
      quem: "apresentador",
      type: "SOLICITACAO_NOVA",
      message: `${MARCA} Nova solicitação da Padaria Pão de Ouro: pagar o boleto do moinho`,
      alvo: { tipo: "solicitacao", chave: "solicitacao:fornecedor" },
      lida: false,
      quando: horasAtras(agora, 2),
      ator: null,
    },
    {
      quem: "apresentador",
      type: "client_request_answered",
      message: `${MARCA} A Padaria Pão de Ouro respondeu: confirmar o reajuste do aluguel`,
      alvo: { tipo: "pendencia", chave: "pendencia:aluguel" },
      lida: false,
      quando: noDia(d(2), "19:43"),
      ator: null,
    },
    {
      quem: "apresentador",
      type: "COMPANY_MESSAGE",
      message: `${MARCA} Mensagem da Padaria Pão de Ouro: "Vou pedir para a minha filha baixar hoje."`,
      alvo: { tipo: "empresa", chave: "matriz" },
      lida: true,
      quando: noDia(d(6), "09:11"),
      ator: null,
    },
    {
      quem: "apresentador",
      type: "FINANCE_CONTAS_DIA",
      message: `${MARCA} Contas do dia na Padaria Pão de Ouro: o conserto da masseira vence hoje e espera aprovação`,
      alvo: null,
      lida: false,
      quando: horasAtras(agora, 1),
      ator: null,
    },
  ];

  return {
    hoje,
    meses,
    empresas: [...EMPRESAS],
    acessoDoPortal: { name: `${MARCA} Joaquim Pereira (Padaria Pão de Ouro)`, email: `joaquim.padaria${DOMINIO_FICTICIO}`, empresa: "matriz", alcadaCentavos: 300_000 },
    categorias,
    centros,
    contrapartes,
    contas,
    ...financeiro,
    pendencias,
    conversa,
    orcamentos,
    emissoes,
    senhas,
    manual,
    solicitacoes,
    comunicado,
    quadro,
    reunioes,
    pastas,
    avisos,
    equipe: [...EQUIPE],
  };
}

// ─── Resumos ────────────────────────────────────────────────────────────────

export function contagemDoPlano(p: PlanoDoBpo) {
  return {
    empresas: p.empresas.length,
    categorias: p.categorias.length,
    centros: p.centros.length,
    contrapartes: p.contrapartes.length,
    contas: p.contas.length,
    lancamentos: p.lancamentos.length,
    pagos: p.lancamentos.filter((l) => l.status === "PAGO").length,
    emAberto: p.lancamentos.filter((l) => l.status === "CONFERIDO").length,
    extratos: p.extratos.length,
    transacoes: p.transacoes.length,
    conciliadas: p.transacoes.filter((t) => t.status === "CONCILIADA").length,
    pendencias: p.pendencias.length,
    mensagens: p.conversa.length + p.pendencias.reduce((s, x) => s + x.mensagens.length, 0),
    emissoes: p.emissoes.length,
    senhas: p.senhas.length,
    paginasDoManual: p.manual.paginas.length,
    solicitacoes: p.solicitacoes.length,
    cards: p.quadro.cards.length,
    reunioes: p.reunioes.length,
    pastas: p.pastas.length,
    avisos: p.avisos.length,
    equipe: p.equipe.length,
  };
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Onde estão as situações de história — o que o roteiro mostra em cada tela. */
export function situacoesDoPlano(p: PlanoDoBpo): string[] {
  const l = (chave: string) => p.lancamentos.find((x) => x.chave === chave)!;
  const masseira = l("historia:masseira");
  const gas = l("historia:gas");
  const festival = l("historia:festival");
  const cartao = p.pendencias.find((x) => x.chave === "pendencia:cartao")!;
  const acordo = p.acordos[0]!;
  const parcelas = p.lancamentos.filter((x) => x.parcelaDo === acordo.chave);
  const delivery = p.lancamentos.filter((x) => x.categoria === "matriz:delivery");
  const mesDelivery = delivery[0]!.competence;
  return [
    `Aprovações e Contas a pagar: "${masseira.descricao}", ${moeda(masseira.centavos)}, vence hoje (${dataBr(masseira.vencimento)}) e espera a aprovação do cliente (alçada de ${moeda(p.acessoDoPortal.alcadaCentavos)}).`,
    `Pedidos ao cliente: "${cartao.title}", venceu em ${dataBr(cartao.vencimento)} e segue em aberto.`,
    `Conciliação (matriz): a transação de ${dataBr(p.transacoes.find((t) => t.chave === "tx:historia:gas")!.data)} de ${moeda(gas.centavos)} sugere "${gas.descricao}"; o PIX de ${moeda(festival.centavos)} sugere "${festival.descricao}".`,
    `Cobrança: acordo com o Buffet Sabor & Festa (${moeda(acordo.originalCentavos)} → ${moeda(acordo.acordadoCentavos)} em ${acordo.parcelas}×), parcela 1 paga, parcelas 2 e 3 em aberto (${parcelas
      .slice(1)
      .map((x) => dataBr(x.vencimento))
      .join(" e ")}); Hotel Ipê e Colégio Santa Clara vencidos.`,
    `DRE (matriz, ${nomeDoMes(mesDelivery)}): "Taxas dos aplicativos de delivery" sem classificação, ${moeda(delivery.reduce((s, x) => s + x.centavos, 0))} no mês.`,
  ];
}
