// GERADO por um script a partir de "PLANO DE CONTAS PADRONIZADO_R12_240226.xlsx" (25/09/2026).
// Não editar à mão: o plano de verdade vive no banco, e este arquivo só semeia
// o padrão do escritório pelo botão "Carregar o plano padrão" em /admin/plano-de-contas.
//
// `grupo` é o grupo da planilha; `dre` é a linha da DRE (src/lib/dre/estrutura.ts),
// decidida por grupo e, para as linhas sem grupo ("?") e os empréstimos e
// aplicações, por categoria. "Outros custos Operacionais" foi para Comerciais,
// que é a linha de despesa fixa mais próxima — conferir com o BPO. Cartão de
// Crédito fica sem linha de propósito: a planilha pede para não usar.

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
    "dre": "diretoria"
  },
  {
    "kind": "PAGAR",
    "grupo": null,
    "nome": "Pró-Labore",
    "dre": "diretoria"
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
    "dre": "cmv",
    "obs": "Pagamento antecipado de compras de produtos ou serviços"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Agregados",
    "dre": "cmv",
    "obs": "Agregados: São veículos particulares contratados de forma contínua pela transportadora. Costumam trabalhar exclusivamente ou quase exclusivamente para a empresa. Podem seguir regras específicas, como adesivação do veículo com a marca da transportadora. Têm uma relação mais próxima, mas não são empregados formais."
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Combustivel da Operação",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Comissões dos Motoristas",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Embalagens",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Insumos",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Matéria Prima",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Produtos para Revenda",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Serviços de Industrialização e Tratamentos",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Compra de Serviços de Terceiros",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas com Exportação",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas com Importações",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas de Viagens - Motoristas próprios",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Despesas de Viagens pessoal da Operação",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Frete sobre compras",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Frete sobre vendas",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Fretes Sub-Contratados de Terceiros",
    "dre": "cmv",
    "obs": "Terceiros: São contratados de forma eventual, por demanda específica (fretes pontuais). Não possuem vínculo regular ou exclusividade com a transportadora. Geralmente mantêm sua identidade própria (sem personalização ou exigências específicas da transportadora)."
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Gerenciamento de Riscos",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Monitoramento e segurança de carga",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Pedágio",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Pneus",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Prestador de Serviço eventuais para Operação",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Seguro Aduaneiro",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "CMV / CSV",
    "nome": "Seguro de Carga",
    "dre": "cmv"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "13º Salário pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Abono Salarial pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Adiantamento Salarial ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Alimentação interna pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Assistência Médica - Plano de saúde ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Bonificações pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Cesta básica pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Férias pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "FGTS ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Folha de Pagamento ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Horas Extras pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "INSS ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "IRRF ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Rescisões pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Seguro de vida pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Uniformes e EPIs pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Vale Alimentação pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Vale Refeição pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da ADM",
    "nome": "Vale Transporte pessoal ADM",
    "dre": "pessoal"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "13º Salário pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Abono Salarial pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Adiantamento Salarial OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Alimentação interna pessoal OP",
    "dre": "mao_de_obra",
    "obs": "Quando refeição ou lanches servidos no local"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Aluguel de veículos OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Assistência Médica - Plano de saúde OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Bonificações pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Cesta básica pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Comissões Comerciais",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Cursos e Treinamentos Operação",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Férias pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "FGTS OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Folha de Pagamento OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Horas Extras pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "INSS OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "IRRF OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Rescisões pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Seguro de vida pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Uniformes e EPIs pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Vale Alimentação pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Vale Refeição pessoal OP",
    "dre": "mao_de_obra"
  },
  {
    "kind": "PAGAR",
    "grupo": "Custo pessoal da Operação",
    "nome": "Vale Transporte pessoal OP",
    "dre": "mao_de_obra"
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
    "dre": "impostos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Impostos",
    "nome": "Impostos Parcelados",
    "dre": "impostos"
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
    "dre": "investimentos",
    "obs": "Utilizar para lançar valores de entradas ou quando compra a vista"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Consórcios de automóveis",
    "dre": "investimentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Consórcios de imóveis",
    "dre": "investimentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em equipamentos",
    "dre": "investimentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em Imóveis",
    "dre": "investimentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em Título de Capitalização",
    "dre": "investimentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimento em veículos",
    "dre": "investimentos"
  },
  {
    "kind": "PAGAR",
    "grupo": "Investimentos",
    "nome": "Investimentos Financeiros - Titulos, LCI, LCA, Ações, CDI, CBD",
    "dre": "investimentos"
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
    "dre": "outras_despesas",
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
    "dre": "outras_despesas"
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
    "dre": "outras_despesas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outras despesas totais",
    "nome": "Juros sobre empréstimos",
    "dre": "outras_despesas"
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
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Aluguel de Equipamentos administrativos",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Aluguel de Imóvel",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Aluguel de veículos ADM",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Combustível Adm",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Compra de móveis e utensílios",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Confraternizações",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria em Auditorias",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria Empresarial",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria Financeira",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria Juridica / Advogados",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Consultoria profissionais - diversas",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Contabilidade",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Contribuição Sindical Empresarial",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Correios",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Cursos e Treinamentos Administrativo",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despachantes",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas bancárias - cestas e tarifas em geral",
    "dre": "administrativas",
    "obs": "Utilizar para tarifas de pix, transferências, cestas mensais."
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas com cartórios",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas com Protestos de clientes",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Despesas de Viagens pessoal da Adm",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Energia Elétrica",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Equipamentos de Informática",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Estacionamento pessoal ADM",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "IPTU",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "IPVA e Licenciamento Veículos ADM",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Limpeza",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de equipamentos/móveis/utensilios",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de imobilizado",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de informática",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção de veiculos ADM",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Manutenção Predial",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Material de Escritório, Copa, Cozinha e Limpeza",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Medicina ocupacional e Segurança do Trabalho",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Monitoramento e segurança predial",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Seguro Predial",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Serasa",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Sindicatos",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Softwares - Licença e aluguel",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Tarifas de serviços de cobrança e boletos",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Taxas condominiais",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Taxas e licenças administrativas e profissionais",
    "dre": "administrativas",
    "obs": "CREA"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos administrativos",
    "nome": "Telefone Fixo, Celular, Internet",
    "dre": "administrativas"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Aluguel de Equipamentos para Operação",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Aluguel de pátio, barracão ou armazém",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Consultoria em Marketing",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Despesas com viagens Comerciais",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Despesas em Publicidade, Propaganda e divulgação",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Estacionamento da Operação",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Estacionamento pessoal Operação",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "IPVA e Licenciamento Veículos OP",
    "dre": "comerciais",
    "obs": "AET"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Manutenção de veiculos da OP",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Materiais para Operação",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Peças para manutenção de veículos ou máquinas da operação",
    "dre": "comerciais"
  },
  {
    "kind": "PAGAR",
    "grupo": "Outros custos Operacionais",
    "nome": "Seguro de Veícúlos Frota própria",
    "dre": "comerciais"
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
