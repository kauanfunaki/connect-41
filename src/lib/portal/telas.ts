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
  /** Aparece também com este módulo, mesmo sem o próprio. */
  ouCom?: string;
};

export const SECOES_DO_PORTAL: readonly SecaoDoPortal[] = ["Financeiro", "Societário", "Com a equipe"];

// Cada tela aparece só se o módulo que a sustenta está ligado no tenant. O
// acervo fiscal não tem gate de módulo no portal desde que nasceu, e segue sem.
//
// O Início vem primeiro desde 05/10, em `/portal`; os documentos fiscais, que
// moravam lá, ganharam `/portal/documentos`.
export const TELAS_DO_PORTAL: readonly TelaDoPortal[] = [
  {
    href: "/portal",
    rotulo: "Início",
    modulo: null,
    secao: null,
    descricao: "O que precisa de você e o resumo das suas empresas.",
  },
  {
    href: "/portal/documentos",
    rotulo: "Documentos fiscais",
    modulo: null,
    secao: null,
    descricao: "Notas emitidas e recebidas pelas suas empresas.",
  },
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
    descricao: "Peça documentos, alterações ou o que precisar do escritório, com prazo de resposta.",
  },
  {
    href: "/portal/comunicados",
    rotulo: "Comunicados",
    modulo: "portal_solicitacoes",
    secao: "Com a equipe",
    descricao: "Avisos do escritório para você: recesso, prazos, orientações.",
  },
  // Os envios ao cliente (08/10/2026), que até então só chegavam por link no
  // e-mail. "Documentos do escritório", e não "Envios": é o nome do lado de
  // quem recebe — o portal chama a 41 de "escritório" em todo canto —, e
  // separa estes dos "Documentos fiscais", que são as notas das empresas.
  {
    href: "/portal/envios",
    rotulo: "Documentos do escritório",
    modulo: "portal_solicitacoes",
    secao: "Com a equipe",
    descricao: "Documentos que o escritório mandou para você ler, baixar e, quando pedido, dar o aceite.",
  },
  // Os Arquivos (09/10/2026): as pastas que o escritório compartilhou com o
  // cliente, e "Enviados pelo cliente" para ele mandar os dele.
  {
    href: "/portal/arquivos",
    rotulo: "Arquivos",
    modulo: "arquivos",
    secao: "Com a equipe",
    descricao: "Pastas que o escritório compartilhou com você, e onde você manda os seus arquivos.",
  },
  {
    href: "/portal/pendencias",
    rotulo: "Pendências",
    modulo: "bpo_pendencias",
    secao: "Com a equipe",
    descricao: "O que a equipe precisa de você.",
    // Desde 01/10 qualquer setor pede ao cliente, com o canal do portal ligado.
    ouCom: "portal_solicitacoes",
  },
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
    (t) =>
      (t.modulo === null || modulos.has(t.modulo) || (!!t.ouCom && modulos.has(t.ouCom))) &&
      !(t.ocultaCom && modulos.has(t.ocultaCom))
  );
}
