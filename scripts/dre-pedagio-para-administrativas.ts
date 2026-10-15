// Passa para as Despesas Fixas (Administrativas) a categoria "Pedágio" onde ela
// está no CMV.
//
//   npx tsx --env-file=.env scripts/dre-pedagio-para-administrativas.ts                            # simulação
//   npx tsx --env-file=.env scripts/dre-pedagio-para-administrativas.ts --ensaio --email=<e-mail>  # grava e desfaz
//   npx tsx --env-file=.env scripts/dre-pedagio-para-administrativas.ts --aplicar --email=<e-mail> # grava
//
// `--email` é o de quem roda: é o nome que a auditoria mostra em cada troca.
//
// Pedido de 15/10/2026: "Pedágio tem que entrar na categoria DESPESAS FIXAS
// (ADMINISTRATIVAS)". O plano padrão da 41 já nasce assim, mas "Carregar o
// plano padrão" só completa linha **vazia** — não troca o que o escritório já
// tem, e o plano carregado antes disto trouxe o Pedágio no CMV.
//
// O nome casa sem diferença de acento, caixa e espaço — "Pedágio" ou
// "Pedágios" (a regra está em `src/lib/dre/pedagioNasAdministrativas.ts`).
// "Vale-pedágio" e afins só aparecem no relatório. O que procura, o que muda e
// como grava é comum às correções de linha da DRE:
// `scripts/dre/corrigirLinhaDaCategoria.ts`.

import { PEDAGIO_NAS_ADMINISTRATIVAS } from "../src/lib/dre/pedagioNasAdministrativas";
import { corrigirLinhaDaCategoria } from "./dre/corrigirLinhaDaCategoria";

void corrigirLinhaDaCategoria({
  correcao: PEDAGIO_NAS_ADMINISTRATIVAS,
  descricao: 'Categoria: "Pedágio" (ou "Pedágios"), sem diferença de acento ou caixa.',
  trechosNoImport: ["edag", "EDAG", "edág", "EDÁG"],
  efeitoNaTela: [
    'Em cada mês abaixo, "CMV sobre Receita Bruta" fica menor e "Despesas Fixas (Administrativas)" fica maior pelo mesmo valor.',
    "Na tela, a Margem de Contribuição sobe por esse valor e o Total de Despesas Fixas cresce por ele; o",
    "Gerador de Caixa e o Fluxo de Caixa Livre não mudam — o valor só troca de linha dentro do operacional.",
  ],
});
