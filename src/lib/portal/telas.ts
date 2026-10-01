// As telas do portal do cliente: o menu (`PortalShell`) e a ajuda
// (`/portal/ajuda`) leem a mesma lista, para a ajuda nunca falar de uma tela
// que o menu não mostra.

export type SecaoDoPortal = "Financeiro" | "Societário" | "Com a equipe";

export type TelaDoPortal = {
  href: string;
  rotulo: string;
  /** O módulo que sustenta a tela; `null` = sempre visível. */
  modulo: string | null;
  secao: SecaoDoPortal | null;
  /** O que a tela faz, nas palavras do cabeçalho dela. */
  descricao: string;
  /** Some quando este módulo está ligado: a tela foi substituída por outra. */
  ocultaCom?: string;
};

export const SECOES_DO_PORTAL: readonly SecaoDoPortal[] = ["Financeiro", "Societário", "Com a equipe"];

// Cada tela aparece só se o módulo que a sustenta está ligado no tenant. O
// acervo fiscal não tem gate de módulo no portal desde que nasceu, e segue sem.
export const TELAS_DO_PORTAL: readonly TelaDoPortal[] = [
  { href: "/portal", rotulo: "Documentos fiscais", modulo: null, secao: null, descricao: "Notas emitidas e recebidas pelas suas empresas." },
  { href: "/portal/dre", rotulo: "DRE", modulo: "bpo_dre", secao: "Financeiro", descricao: "Demonstrativo de resultado por empresa e mês." },
  {
    href: "/portal/fluxo-de-caixa",
    rotulo: "Fluxo de caixa",
    modulo: "bpo_fluxo_caixa",
    secao: "Financeiro",
    descricao: "O que entrou e saiu nos últimos seis meses, e o que vence daqui para frente.",
  },
  { href: "/portal/relatorios", rotulo: "Relatório", modulo: "bpo_fluxo_caixa", secao: "Financeiro", descricao: "O mês consolidado por empresa." },
  { href: "/portal/pagar", rotulo: "Contas a pagar", modulo: "bpo_contas_pagar", secao: "Financeiro", descricao: "O que suas empresas têm a pagar." },
  { href: "/portal/receber", rotulo: "Contas a receber", modulo: "bpo_contas_receber", secao: "Financeiro", descricao: "O que suas empresas têm a receber." },
  {
    href: "/portal/cobranca",
    rotulo: "Cobrança",
    modulo: "bpo_cobranca",
    secao: "Financeiro",
    descricao: "Contas a receber vencidas das suas empresas, o andamento da cobrança e os acordos.",
  },
  {
    href: "/portal/processos",
    rotulo: "Processos",
    modulo: "societario_processos",
    secao: "Societário",
    descricao: "Abertura, alterações, baixa e licenças das suas empresas.",
  },
  {
    href: "/portal/exigencias",
    rotulo: "Exigências",
    modulo: "societario_processos",
    secao: "Societário",
    descricao: "O que os órgãos pediram nos processos das suas empresas.",
  },
  {
    href: "/portal/solicitacoes",
    rotulo: "Solicitações",
    modulo: "portal_solicitacoes",
    secao: "Com a equipe",
    descricao: "Peça documentos, alterações ou o que precisar da 41, com prazo de resposta.",
  },
  { href: "/portal/pendencias", rotulo: "Pendências", modulo: "bpo_pendencias", secao: "Com a equipe", descricao: "O que a equipe da 41 precisa de você." },
  {
    href: "/portal/aprovacoes",
    rotulo: "Aprovações",
    modulo: "bpo_aprovacoes",
    secao: "Com a equipe",
    descricao: "Contas a pagar que só são pagas depois da sua aprovação.",
  },
  {
    href: "/portal/comunicacao",
    rotulo: "Conversa",
    modulo: "bpo_comunicacao",
    secao: "Com a equipe",
    descricao: "Fale com a equipe e mande arquivos, por empresa.",
    // Decisão de 01/10: com as solicitações, tudo o que o cliente manda tem
    // dono, prazo e situação — a conversa livre sai do menu (o histórico fica
    // na tela interna /comunicacao).
    ocultaCom: "portal_solicitacoes",
  },
];

export function telasVisiveis(modulos: ReadonlySet<string>): TelaDoPortal[] {
  return TELAS_DO_PORTAL.filter(
    (t) => (t.modulo === null || modulos.has(t.modulo)) && !(t.ocultaCom && modulos.has(t.ocultaCom))
  );
}
