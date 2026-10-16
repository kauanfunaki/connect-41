// Passa para o CMV a categoria "Impostos Retidos Serviços Tomados
// (PIS/COFINS/CSLL/IRRF)" onde ela está nos impostos sobre a receita.
//
//   npx tsx --env-file=.env scripts/dre-impostos-retidos-para-cmv.ts                            # simulação
//   npx tsx --env-file=.env scripts/dre-impostos-retidos-para-cmv.ts --ensaio --email=<e-mail>  # grava e desfaz
//   npx tsx --env-file=.env scripts/dre-impostos-retidos-para-cmv.ts --aplicar --email=<e-mail> # grava
//
// `--email` é o de quem roda: é o nome que a auditoria mostra em cada troca.
//
// Pedido do Kauan, 14/10/2026: "ela não pode ficar junto com os impostos sobre
// a receita; ela fica junto com as categorias CMV SOBRE RECEITA BRUTA". O plano
// padrão da 41 já nasce assim, mas "Carregar o plano padrão" só completa linha
// **vazia** — não troca o que o escritório já tem. Por isso o que entrou em
// 28/09 precisa deste script.
//
// O nome casa sem diferença de acento, caixa e espaço, com ou sem as siglas no
// fim (a regra está em `src/lib/dre/impostosRetidosNoCmv.ts`). O que procura,
// o que muda e como grava é comum às correções de linha da DRE:
// `scripts/dre/corrigirLinhaDaCategoria.ts`.

import { IMPOSTOS_RETIDOS_NO_CMV } from "../src/lib/dre/impostosRetidosNoCmv";
import { corrigirLinhaDaCategoria } from "./dre/corrigirLinhaDaCategoria";

void corrigirLinhaDaCategoria({
  correcao: IMPOSTOS_RETIDOS_NO_CMV,
  descricao: 'Categoria: "Impostos Retidos Serviços Tomados", com ou sem "(PIS/COFINS/CSLL/IRRF)", sem diferença de acento ou caixa.',
  // "Retidos" tem "etid"; "RETIDOS", "ETID".
  trechosNoImport: ["etid", "ETID"],
  efeitoNaTela: [
    'Em cada mês abaixo, "Impostos sobre Receita Bruta" fica menor e "CMV sobre Receita Bruta" fica maior pelo mesmo valor.',
    "Na tela, a Receita Líquida sobe por esse valor, e Margem de Contribuição, Gerador de Caixa e Fluxo de",
    "Caixa Livre caem por ele — o imposto sobre a receita fica fora do resultado, e o CMV entra.",
  ],
});
