import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import { BarraDeSituacao, BarrasRanqueadas, type LinhaRanqueada, type Segmento, type Tom } from "@/components/shared/Graficos";
import {
  faixasDeAtraso,
  rankingDeContrapartes,
  type ChaveDaFaixa,
  type ContaParaAnalise,
  type FaixaCalculada,
  type PosicaoNoRanking,
} from "@/lib/financeiro/analise";
import { moeda, percentual } from "@/lib/financeiro/formato";
import { formatarNumero } from "@/lib/format";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";

/** Quantos nomes o ranking mostra. */
const NO_RANKING = 10;

/**
 * O tom de cada faixa de atraso (08/10/2026, escolha 9A do Kauan na página de
 * decisões: a Análise de contas com os gráficos da Home). "A vencer" no
 * "próximo" da marca, o mesmo do painel de contas da Home — cujo "Abrir" traz
 * para esta tela —; até 30 dias de atraso em atenção, acima disso em crítico.
 * Antes, as cinco faixas vencidas no mesmo vermelho e "a vencer" num azul de
 * aviso que nenhum gráfico usava.
 */
const TOM_DA_FAIXA: Record<ChaveDaFaixa, Tom> = {
  a_vencer: "proximo",
  d1_15: "atencao",
  d16_30: "atencao",
  d31_60: "critico",
  d61_90: "critico",
  acima_90: "critico",
};

/**
 * As faixas como segmentos da `BarraDeSituacao`: o comprimento conta as contas
 * e o R$ vai escrito ao lado, como no painel da Home. Faixa vazia fica neutra
 * — zero não pinta o ícone da legenda de vermelho.
 */
export function segmentosDasFaixas(faixas: FaixaCalculada[]): Segmento[] {
  return faixas.map((f) => ({
    chave: f.chave,
    rotulo: f.rotulo,
    valor: f.quantidade,
    tom: f.quantidade > 0 ? TOM_DA_FAIXA[f.chave] : "neutro",
    detalhe: moeda(f.centavos),
  }));
}

/**
 * O ranking como barras em dinheiro: o comprimento é o que está em aberto, o
 * pedaço vencido em crítico e o resto no "próximo". Vence hoje fica em "a
 * vencer", a mesma régua das faixas.
 */
export function linhasDoRanking(ranking: PosicaoNoRanking[]): LinhaRanqueada[] {
  return ranking.map((r) => ({
    chave: r.contraparteNome,
    rotulo: r.contraparteNome,
    sublabel: `${formatarNumero(r.quantidade, 0)} ${r.quantidade === 1 ? "conta" : "contas"} · ${percentual(r.participacao)} do em aberto`,
    segmentos: [
      { chave: "vencido", rotulo: "Vencido", valor: r.vencido, tom: "critico" },
      { chave: "a_vencer", rotulo: "A vencer", valor: r.emAberto - r.vencido, tom: "proximo" },
    ],
    nota: r.vencido > 0 ? `${moeda(r.vencido)} vencido` : undefined,
  }));
}

/**
 * Faixas de atraso e ranking — a aba de análise de `/pagar` e `/receber`.
 *
 * Recebe as mesmas linhas da lista, no recorte "em aberto": a soma das faixas
 * tem de bater com o número do topo da tela, e só bate se as duas vierem da
 * mesma consulta.
 *
 * Desde 08/10/2026 (escolha 9A), os dois blocos são os gráficos da Home — a
 * `BarraDeSituacao` e as `BarrasRanqueadas` —, com legenda, valor escrito e
 * tabela para leitor de tela. Eram duas tabelas com uma barra de 8px desenhada
 * à mão, sem legenda e escondida do leitor de tela.
 */
export function AnaliseDeContas({ linhas, hojeKey, aPagar }: { linhas: ContaParaAnalise[]; hojeKey: string; aPagar: boolean }) {
  const faixas = faixasDeAtraso(linhas, hojeKey);
  const todos = rankingDeContrapartes(linhas, Number.MAX_SAFE_INTEGER);
  const total = faixas.reduce((n, f) => n + f.centavos, 0);
  const contas = faixas.reduce((n, f) => n + f.quantidade, 0);

  if (total === 0) {
    return <EmptyState title="Nada em aberto para analisar" icon={<BarChart3 />} />;
  }

  const quem = aPagar ? "fornecedores" : "clientes";
  const restantes = todos.length - NO_RANKING;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card as="section" className="p-5 min-w-0">
          <h2 className="text-card-title font-semibold text-fg">Faixas de atraso</h2>
          <p className="text-helper text-fg-muted mt-0.5">
            {moeda(total)} em aberto, em {formatarNumero(contas, 0)} {contas === 1 ? "conta" : "contas"}.
          </p>
          <div className="mt-4">
            <BarraDeSituacao titulo="Contas por dias de atraso" segmentos={segmentosDasFaixas(faixas)} />
          </div>
        </Card>

        <Card as="section" className="p-5 min-w-0">
          <h2 className="text-card-title font-semibold text-fg">{aPagar ? "Maiores fornecedores em aberto" : "Maiores clientes em aberto"}</h2>
          <p className="text-helper text-fg-muted mt-0.5">
            {todos.length > NO_RANKING ? `Os ${NO_RANKING} ${quem} com mais dinheiro em aberto.` : `Os ${quem} com dinheiro em aberto.`}
          </p>
          <div className="mt-4">
            <BarrasRanqueadas
              titulo={aPagar ? "Maiores fornecedores em aberto" : "Maiores clientes em aberto"}
              linhas={linhasDoRanking(todos.slice(0, NO_RANKING))}
              formatar={moeda}
            />
          </div>
          {restantes > 0 && (
            <p className="text-micro text-fg-muted mt-3">
              + {formatarNumero(restantes, 0)} {restantes === 1 ? (aPagar ? "fornecedor" : "cliente") : quem} com menos em aberto
            </p>
          )}
        </Card>
      </div>
      <NotaDeFonte>
        Vence hoje conta como a vencer. Cobrança e régua de inadimplência são outra etapa; esta aba só mostra onde está o
        dinheiro parado.
      </NotaDeFonte>
    </>
  );
}
