// Outubro de 2025 da Irriga, somado por categoria direto da planilha
// `10-DRE Irriga_2025_010.xlsx` (abas PAGAMENTOS OUT e RECEBIMENTOS OUT).
//
// Existe para um teste só, e é o teste que importa: **o cálculo do Connect
// reproduz o mês que o BPO entregou**, linha a linha. Enquanto isso for
// verdade, a migração é conferível; quando deixar de ser, alguém mudou uma
// regra e o teste diz qual.
//
// Gerado por script, não digitado. Valores em centavos inteiros.

export type LancamentoBruto = {
  categoria: string | null;
  valorCentavos: number;
  origem: "recebimento" | "pagamento";
};

export const OUTUBRO_2025: LancamentoBruto[] = [
  { categoria: "recebimento indevido", valorCentavos: 6180271, origem: "recebimento" },
  { categoria: "Clientes - Venda de Mercadoria Fabricadas", valorCentavos: 88775198, origem: "recebimento" },
  { categoria: "Entrada de Transferência", valorCentavos: 241000, origem: "recebimento" },
  { categoria: "Clientes - Venda de sucata", valorCentavos: 1258800, origem: "recebimento" },
  { categoria: "Devolução de Pagamento Indevido", valorCentavos: 245329, origem: "recebimento" },
  { categoria: "Pró-labore", valorCentavos: -1100737, origem: "pagamento" },
  { categoria: "Comissões  Produção", valorCentavos: -704962, origem: "pagamento" },
  { categoria: "Tarifas Bancárias", valorCentavos: -95392, origem: "pagamento" },
  { categoria: "compra de matéria prima - anéisdeaço", valorCentavos: -93091, origem: "pagamento" },
  { categoria: "Compra de Materia Prima", valorCentavos: -1174211, origem: "pagamento" },
  { categoria: "Frete", valorCentavos: -5032793, origem: "pagamento" },
  { categoria: "Compra de consumiveis", valorCentavos: -4176585, origem: "pagamento" },
  { categoria: "Compra de combustível", valorCentavos: -60327, origem: "pagamento" },
  { categoria: "Saída de Transferência", valorCentavos: -241000, origem: "pagamento" },
  { categoria: "Compra de Matéria Prima - Chapa de aço", valorCentavos: -14956013, origem: "pagamento" },
  { categoria: "Compra de Matéria Prima - Tubo Helicoidal", valorCentavos: -3348572, origem: "pagamento" },
  { categoria: "Compra de embalagens", valorCentavos: -131013, origem: "pagamento" },
  { categoria: "Serviço de terceiro - Galvanização", valorCentavos: -12853567, origem: "pagamento" },
  { categoria: "Compra de Materia Prima - Tubo de aço", valorCentavos: -6168279, origem: "pagamento" },
  { categoria: "IOF", valorCentavos: -133947, origem: "pagamento" },
  { categoria: "Serviço de terceiro - Frete Interno", valorCentavos: -1487000, origem: "pagamento" },
  { categoria: "Compra de Consumíveis - Gas de solda", valorCentavos: -1684200, origem: "pagamento" },
  { categoria: "Comissões de Vendas", valorCentavos: -847700, origem: "pagamento" },
  { categoria: "Folha de pagamento Produção", valorCentavos: -521292, origem: "pagamento" },
  { categoria: "Compra de Serviços", valorCentavos: -253000, origem: "pagamento" },
  { categoria: "Compra de consumiveis - gás empilhadeira", valorCentavos: -164000, origem: "pagamento" },
  { categoria: "Pagamento de Empréstimos", valorCentavos: -588397, origem: "pagamento" },
  { categoria: "Folha de pagamento Comercial", valorCentavos: -235668, origem: "pagamento" },
  { categoria: "Alimentação/Almoço", valorCentavos: -2038943, origem: "pagamento" },
  { categoria: "Compra de material para uso e consumo", valorCentavos: -207488, origem: "pagamento" },
  { categoria: "Compra de Materia Prima - Parafusos", valorCentavos: -3463756, origem: "pagamento" },
  { categoria: "Manutenção Predial", valorCentavos: -652856, origem: "pagamento" },
  { categoria: "Compra de Matéria Prima - Borracha", valorCentavos: -424800, origem: "pagamento" },
  { categoria: "Uniformes e EPIs", valorCentavos: -1132343, origem: "pagamento" },
  { categoria: "Seguro de Vida", valorCentavos: -57274, origem: "pagamento" },
  { categoria: "Serviços de terceiros", valorCentavos: -155000, origem: "pagamento" },
  { categoria: "Despesas de Viagens", valorCentavos: -119763, origem: "pagamento" },
  { categoria: "Cursos e Treinamentos", valorCentavos: -93688, origem: "pagamento" },
  { categoria: "Energia Elétrica", valorCentavos: -180805, origem: "pagamento" },
  { categoria: "Aluguel", valorCentavos: -256235, origem: "pagamento" },
  { categoria: "Aluguel de Equipamentos", valorCentavos: -230576, origem: "pagamento" },
  { categoria: "Sindicatos", valorCentavos: -43000, origem: "pagamento" },
  { categoria: "Máquinas e Equipamentos", valorCentavos: -3280521, origem: "pagamento" },
  { categoria: "Material de Escritório", valorCentavos: -82009, origem: "pagamento" },
  { categoria: "Contabilidade", valorCentavos: -168552, origem: "pagamento" },
  { categoria: "Equipamentos de Informática", valorCentavos: -65194, origem: "pagamento" },
  { categoria: "Softwares - Licença e aluguel", valorCentavos: -694804, origem: "pagamento" },
  { categoria: "Consultoria", valorCentavos: -624700, origem: "pagamento" },
  { categoria: "Pagamento Indevido", valorCentavos: -5699055, origem: "pagamento" },
  { categoria: "Medicina ocupacional e Segurança do Trabalho", valorCentavos: -20353, origem: "pagamento" },
  { categoria: "Telefonia", valorCentavos: -3000, origem: "pagamento" },
  { categoria: "Compra de ativo imobilizado", valorCentavos: -100900, origem: "pagamento" },
  { categoria: "Compra de Matéria Prima - Bobina", valorCentavos: -3515807, origem: "pagamento" },
  { categoria: "Internet", valorCentavos: -9999, origem: "pagamento" },
  { categoria: "Convenio Depen", valorCentavos: -3294313, origem: "pagamento" },
  { categoria: "Devolução de Venda", valorCentavos: -16696, origem: "pagamento" },
  { categoria: "Adiantamento", valorCentavos: -760000, origem: "pagamento" },
  { categoria: "Distribuição de Lucros - Sócios", valorCentavos: -7135327, origem: "pagamento" },
  { categoria: "Manutenção de maquinas e equipamentos", valorCentavos: -60000, origem: "pagamento" },
  { categoria: "Instalações de Máquinas e Equipamentos", valorCentavos: -226500, origem: "pagamento" },
  { categoria: "Serviços de Correção de Produção", valorCentavos: -260000, origem: "pagamento" },
  { categoria: "Vale Transporte", valorCentavos: -122000, origem: "pagamento" },
  { categoria: "Serviço de terceiro - Tornearia", valorCentavos: -487800, origem: "pagamento" },
  { categoria: "Benefícios alimentação - sócios", valorCentavos: -299263, origem: "pagamento" },
  { categoria: "Vale Refeição", valorCentavos: -274000, origem: "pagamento" },
  { categoria: "Impostos Parcelados", valorCentavos: -1341253, origem: "pagamento" },
  { categoria: "Impostos Federais - IRPJ", valorCentavos: -1607633, origem: "pagamento" },
  { categoria: "Impostos Federais - CSSL", valorCentavos: -3007245, origem: "pagamento" },
  { categoria: "Aluguel de veículos", valorCentavos: -149434, origem: "pagamento" },
  { categoria: "Manutenção de móveis/utensilios", valorCentavos: -46000, origem: "pagamento" },
];

/** O que a planilha mostra em outubro/2025, em centavos. Coluna K. */
export const ESPERADO_OUTUBRO_2025: Record<string, number> = {
  receita_bruta: 90033998,
  impostos: -4614878,
  receita_liquida: 85419120,
  cmv: -45040880,
  mao_de_obra: -18537680,
  comerciais: -2313762,
  margem_contribuicao: 24141676,
  pessoal: -4905852,
  diretoria: -1400000,
  administrativas: -2313399,
  financeiras: -229339,
  total_despesas_fixas: -8848590,
  gerador_de_caixa: 15293085,
  investimentos: -4006121,
  fluxo_apos_investimentos: 11286964,
  outras_receitas: 245329,
  outras_despesas: -14857720,
  fluxo_de_caixa_livre: -3325427,
};
