// GERADO por um script a partir de "PLANO DE CONTAS PADRONIZADO_R12_240226.xlsx" (25/09/2026).
// Não editar à mão: o plano de verdade vive no banco, e este arquivo só semeia
// o padrão do escritório pelo botão "Carregar o plano padrão" em /admin/plano-de-contas.
//
// `grupo` é o grupo da planilha; `dre` é a linha da DRE (src/lib/dre/estrutura.ts),
// decidida por grupo e, para as linhas sem grupo ("?") e os empréstimos e
// aplicações, por categoria. "Outros custos Operacionais" foi para Comerciais,
// que é a linha de despesa fixa mais próxima — conferir com o BPO. Cartão de
// Crédito fica sem linha de propósito: a planilha pede para não usar.
//
// Ajuste à mão depois de gerado — quem regerar o arquivo tem de repetir:
// - 14/10/2026: "Impostos Retidos Serviços Tomados (PIS/COFINS/CSLL/IRRF)" vai
//   para o CMV (`cmv`), e não para os impostos sobre a receita (pedido do
//   Kauan). O grupo do plano continua "Impostos": é imposto, só não é imposto
//   sobre a receita. O que já estava no banco passa pelo script
//   `scripts/dre-impostos-retidos-para-cmv.ts`.
// - 15/10/2026: "Pedágio" vai para as Despesas Fixas (Administrativas)
//   (`administrativas`), e não para o CMV. O grupo do plano continua
//   "CMV / CSV", como na planilha. O que já estava no banco passa pelo script
//   `scripts/dre-pedagio-para-administrativas.ts`.
// - 20/10/2026: o DRE padrão passou a ser a estrutura da CARGO (sete grupos —
//   ver o cabeçalho de src/lib/dre/estrutura.ts). Os `dre` antigos viraram os
//   novos pelo de-para `GRUPO_DO_ANTIGO`: CMV, mão de obra e comerciais →
//   `custo_operacional`; pessoal, diretoria e administrativas →
//   `custo_administrativo` (as financeiras também); investimentos →
//   `outras_despesas`. O banco migra pela migration `20261020230000_dre_padrao_cargo`.
//   E sete categorias seguem o bloco de financiamentos da CARGO (`financiamentos`):
//   Empréstimos bancários à pagar, Impostos Parcelados, Juros sobre empréstimos,
//   Juros e Encargos limite de crédito / cartão, Juros sobre desconto de títulos e
//   os dois Consórcios — conferir com a Amanda.

import type { FinanceEntryKind } from "@/generated/prisma/enums";

export type CategoriaDoPlanoPadrao = {
  kind: FinanceEntryKind;
  grupo: string | null;
  nome: string;
  dre: string | null;
  obs?: string;
};

export const PLANO_PADRAO_41: CategoriaDoPlanoPadrao[] = [
  {
    "kind": "PAGAR",
    "grupo": null,
    "nome": "Cartão de Crédito",
    "dre": null,
    "obs": "Evitar utilizar, pois precisa existir o desmembramento"
  },
  {
    "kind": "PAGAR",
    "grupo": null,
    "nome": "Distribuição de Lucros - Sócios",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": null,
    "nome": "INSS sobre Pró-Labore",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": null,
    "nome": "Pró-Labore",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": null,
    "nome": "Transferencia entre contas - mesma titularidade",
    "dre": "transferencia"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Adiantamento a Fornecedores",
    "dre": "custo_operacional",
    "obs": "Pagamento antecipado de compras de produtos ou serviços"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Agregados",
    "dre": "custo_operacional",
    "obs": "Agregados: São veículos particulares contratados de forma contínua pela transportadora. Costumam trabalhar exclusivamente ou quase exclusivamente para a empresa. Podem seguir regras específicas, como adesivação do veículo com a marca da transportadora. Têm uma relação mais próxima, mas não são empregados formais."
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Combustivel da Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Comissões dos Motoristas",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Embalagens",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Insumos",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Matéria Prima",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Produtos para Revenda",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Serviços de Industrialização e Tratamentos",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Serviços de Terceiros",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas com Exportação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas com Importações",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas de Viagens - Motoristas próprios",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas de Viagens pessoal da Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Frete sobre compras",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Frete sobre vendas",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Fretes Sub-Contratados de Terceiros",
    "dre": "custo_operacional",
    "obs": "Terceiros: São contratados de forma eventual, por demanda específica (fretes pontuais). Não possuem vínculo regular ou exclusividade com a transportadora. Geralmente mantêm sua identidade própria (sem personalização ou exigências específicas da transportadora)."
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Gerenciamento de Riscos",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Monitoramento e segurança de carga",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Pedágio",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Pneus",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Prestador de Serviço eventuais para Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Seguro Aduaneiro",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Seguro de Carga",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "13º Salário pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Abono Salarial pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Adiantamento Salarial ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Alimentação interna pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Assistência Médica - Plano de saúde ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Bonificações pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Cesta básica pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Férias pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "FGTS ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Folha de Pagamento ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Horas Extras pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "INSS ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "IRRF ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Rescisões pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Seguro de vida pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Uniformes e EPIs pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Vale Alimentação pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Vale Refeição pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Vale Transporte pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "13º Salário pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Abono Salarial pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Adiantamento Salarial OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Alimentação interna pessoal OP",
    "dre": "custo_operacional",
    "obs": "Quando refeição ou lanches servidos no local"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Aluguel de veículos OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Assistência Médica - Plano de saúde OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Bonificações pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Cesta básica pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Comissões Comerciais",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Cursos e Treinamentos Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Férias pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "FGTS OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Folha de Pagamento OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Horas Extras pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "INSS OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "IRRF OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Rescisões pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Seguro de vida pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Uniformes e EPIs pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Vale Alimentação pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Vale Refeição pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Vale Transporte pessoal OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Estaduais - Difal",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Estaduais - ICMS outras UF",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Estaduais - ICMS Próprio",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Federais - COFINS",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Federais - CSSL",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Federais - IPI",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Federais - IRPJ",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Federais - PIS",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Municipais - ISS",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Municipais - IPTU",
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Retidos Serviços Tomados (PIS/COFINS/CSLL/IRRF)",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Parcelados",
    "dre": "financiamentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Aplicação financeira - conta investimento",
    "dre": "transferencia",
    "obs": "Aplicação diária, aquela que zera a conta corrente."
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Compra de Ativos - Veículos",
    "dre": "outras_despesas",
    "obs": "Utilizar para lançar valores de entradas ou quando compra a vista"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Consórcios de automóveis",
    "dre": "financiamentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Consórcios de imóveis",
    "dre": "financiamentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em equipamentos",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em Imóveis",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em Título de Capitalização",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em veículos",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimentos Financeiros - Titulos, LCI, LCA, Ações, CDI, CBD",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Brindes",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Despesas com Protestos de fornecedores",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Doações",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Empréstimos bancários à pagar",
    "dre": "financiamentos",
    "obs": "Parcelas de empréstimos adquiridos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Empréstimos concedidos",
    "dre": "outras_despesas",
    "obs": "Quando a empresa empresta dinheiro para outra empresa do gurpo, para sócios. Valor que vai retornoar para o caixa da empresa."
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Extravio, perdas de mercadorias",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Feiras, Exposições e Eventos",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "IOF",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Juros cheque especial",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Juros e Encargos limite de crédito / cartão",
    "dre": "financiamentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Juros pagos para Fornecedores",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Juros sobre desconto de cheques",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Juros sobre desconto de títulos",
    "dre": "financiamentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Juros sobre empréstimos",
    "dre": "financiamentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Multas de trânsito pessoal ADM",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Multas de trânsito pessoal OP",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Pagamento de Processos ou Acordos Trabalhistas",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Tarifas desconto de cheques",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Tarifas desconto de duplicatas",
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Água e Esgoto",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Aluguel de Equipamentos administrativos",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Aluguel de Imóvel",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Aluguel de veículos ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Combustível Adm",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Compra de móveis e utensílios",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Confraternizações",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria em Auditorias",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria Empresarial",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria Financeira",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria Juridica / Advogados",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria profissionais - diversas",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Contabilidade",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Contribuição Sindical Empresarial",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Correios",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Cursos e Treinamentos Administrativo",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despachantes",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas bancárias - cestas e tarifas em geral",
    "dre": "custo_administrativo",
    "obs": "Utilizar para tarifas de pix, transferências, cestas mensais."
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas com cartórios",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas com Protestos de clientes",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas de Viagens pessoal da Adm",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Energia Elétrica",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Equipamentos de Informática",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Estacionamento pessoal ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "IPTU",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "IPVA e Licenciamento Veículos ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Limpeza",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de equipamentos/móveis/utensilios",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de imobilizado",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de informática",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de veiculos ADM",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção Predial",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Material de Escritório, Copa, Cozinha e Limpeza",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Medicina ocupacional e Segurança do Trabalho",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Monitoramento e segurança predial",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Seguro Predial",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Serasa",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Sindicatos",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Softwares - Licença e aluguel",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Tarifas de serviços de cobrança e boletos",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Taxas condominiais",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Taxas e licenças administrativas e profissionais",
    "dre": "custo_administrativo",
    "obs": "CREA"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Telefone Fixo, Celular, Internet",
    "dre": "custo_administrativo"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Aluguel de Equipamentos para Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Aluguel de pátio, barracão ou armazém",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Consultoria em Marketing",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Despesas com viagens Comerciais",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Despesas em Publicidade, Propaganda e divulgação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Estacionamento da Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Estacionamento pessoal Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "IPVA e Licenciamento Veículos OP",
    "dre": "custo_operacional",
    "obs": "AET"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Manutenção de veiculos da OP",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Materiais para Operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Peças para manutenção de veículos ou máquinas da operação",
    "dre": "custo_operacional"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Seguro de Veícúlos Frota própria",
    "dre": "custo_operacional"
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Entradas",
    "nome": "Devolução de Compra",
    "dre": "outras_receitas",
    "obs": "Efetuou a compra junto ao fornecedor e foi cancelada, fornecedor devolveu o valor."
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Entradas",
    "nome": "Devolução de Serviços Prestados",
    "dre": "outras_receitas",
    "obs": "Efetuou a compra junto ao fornecedor e foi cancelada, fornecedor devolveu o valor."
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Entradas",
    "nome": "Devolução Produtos Vendidos",
    "dre": "outras_receitas",
    "obs": "Efetuou a venda e cliente fez o cancelamento, devolução de valor para o cliente."
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Entradas",
    "nome": "Aporte Societário",
    "dre": "transferencia"
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Entradas",
    "nome": "Empréstimos Adquiridos - Bancários",
    "dre": "transferencia"
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Entradas",
    "nome": "Empréstimos Adquiridos - Fintechs, Fidc",
    "dre": "transferencia"
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Entradas",
    "nome": "Empréstimos Adquiridos - Terceiros",
    "dre": "transferencia"
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Receitas Indiretas",
    "nome": "Lucros e participações em outras Cias",
    "dre": "outras_receitas"
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Receitas Indiretas",
    "nome": "Rendimentos de aplicações financeiras",
    "dre": "outras_receitas"
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Receitas Indiretas",
    "nome": "Resgate de Aplicações Financeiras - Conta Investimento",
    "dre": "transferencia",
    "obs": "Aplicação diária, aquela que zera a conta corrente."
  },
  {
    "kind": "RECEBER",
    "grupo": "Outras Receitas Indiretas",
    "nome": "Venda de Ativo Imobilizado",
    "dre": "outras_receitas"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Serviços Prestados",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Serviços Transporte Intermunicipal - CTE Todos",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Serviços Transporte Intermunicipal - CTE Próprios",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Serviços Transporte Intermunicipal - CTE Agregados",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Serviços Transporte Intermunicipal - CTE Terceiros",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Produtos",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas Revenda",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Sucata",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Serviços Prestados SN",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Produtos SN",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas Revenda SN",
    "dre": "receita_bruta"
  },
  {
    "kind": "RECEBER",
    "grupo": "Receitas Diretas",
    "nome": "Vendas de Sucata SN",
    "dre": "receita_bruta"
  }
];
