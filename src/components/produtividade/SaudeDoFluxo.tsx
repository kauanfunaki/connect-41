import Link from "next/link";
import { CircleCheck, Hourglass, Ruler, RotateCcw, TriangleAlert, Wrench } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ROTA_TECH_INTERNO, SITUACOES } from "@/lib/tech-interno/regras";
import { DIAS_PARADO, type ItemDoFluxo, type SaudeDoFluxo as Saude } from "@/lib/tech-interno/produtividade";

// A saúde do fluxo (05/11/2026, a Produtividade da Tech): para quem coordena,
// o que trava o time agora. Não depende do período — é a foto de hoje —, só a
// média de voltas, que é das entregas do período. Cada bloco diz o número, o
// que ele é e quais itens são, com link para o item no Controle interno.
// Problema vem com ícone e texto, nunca só pela cor.

const NUMERO = new Intl.NumberFormat("pt-BR");
const DECIMAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MOSTRAR = 5;
const dias = (n: number) => (n === 1 ? "1 dia" : `${NUMERO.format(n)} dias`);

function Bloco({
  id,
  titulo,
  icone,
  valor,
  alerta,
  resumo,
  children,
  href,
}: {
  id: string;
  titulo: string;
  icone: React.ReactNode;
  valor: string;
  /** Pede atenção: o número ganha a cor e o ícone de atenção, e o resumo diz por quê. */
  alerta: boolean;
  resumo: string;
  children?: React.ReactNode;
  href?: { rotulo: string; para: string };
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <h3 id={id} className="flex items-center gap-2 text-ui font-semibold text-fg">
        <span className="text-fg-muted [&>svg]:size-4" aria-hidden>
          {icone}
        </span>
        {titulo}
      </h3>
      <p className="flex items-baseline gap-2">
        <span className={`font-display text-metric font-bold leading-none tnum ${alerta ? "text-warning-fg" : "text-fg"}`}>{valor}</span>
        {alerta ? (
          <><TriangleAlert size={16} className="self-center text-warning-fg" aria-hidden /><span className="sr-only">Pede atenção</span></>
        ) : (
          <><CircleCheck size={16} className="self-center text-success-fg" aria-hidden /><span className="sr-only">Em dia</span></>
        )}
      </p>
      <p className="text-fs-2 text-fg-muted">{resumo}</p>
      {children}
      {href && (
        <Link href={href.para} className="mt-auto self-start rounded-sm text-fs-2 font-medium text-fg-secondary underline-offset-2 hover:text-brand hover:underline">
          {href.rotulo}
        </Link>
      )}
    </section>
  );
}

function Itens({ itens, detalhe }: { itens: ItemDoFluxo[]; detalhe: (i: ItemDoFluxo) => string }) {
  if (!itens.length) return null;
  return (
    <ul className="flex flex-col divide-y divide-border-soft text-fs-2">
      {itens.slice(0, MOSTRAR).map((i) => (
        <li key={i.id} className="flex min-w-0 items-baseline justify-between gap-3 py-1.5">
          <Link href={`${ROTA_TECH_INTERNO}/${i.id}`} className="min-w-0 truncate rounded-sm font-medium text-fg underline-offset-2 hover:text-brand hover:underline" title={i.title}>
            {i.title}
          </Link>
          <span className="shrink-0 text-fg-muted tnum">{detalhe(i)}</span>
        </li>
      ))}
      {itens.length > MOSTRAR && <li className="py-1.5 text-fg-muted">e mais {NUMERO.format(itens.length - MOSTRAR)}</li>}
    </ul>
  );
}

export function SaudeDoFluxo({ saude }: { saude: Saude }) {
  const { semTamanho, parados, esperandoValidacao, emAndamentoPorPessoa } = saude;
  const maiorAndamento = Math.max(1, ...emAndamentoPorPessoa.map((p) => p.total));
  const totalAndamento = emAndamentoPorPessoa.reduce((s, p) => s + p.total, 0);
  return (
    <Card as="section" aria-labelledby="saude-do-fluxo" className="p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="saude-do-fluxo" className="text-section font-semibold text-fg">
          Saúde do fluxo
        </h2>
        <p className="text-fs-2 text-fg-muted">Para quem coordena: o que está travando o time hoje. Só a média de voltas depende do período.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Bloco
          id="fluxo-sem-tamanho"
          titulo="Itens sem tamanho"
          icone={<Ruler />}
          valor={NUMERO.format(semTamanho.total)}
          alerta={semTamanho.total > 0}
          resumo={
            semTamanho.total === 0
              ? "Todo item em aberto tem tamanho."
              : semTamanho.comecados > 0
                ? `${NUMERO.format(semTamanho.comecados)} já começaram sem tamanho e não vão somar pontos.`
                : "Defina antes de começar: o tamanho trava quando o item sai de Pendente."
          }
        >
          <Itens itens={semTamanho.itens} detalhe={(i) => SITUACOES[i.status]} />
        </Bloco>
        <Bloco
          id="fluxo-parados"
          titulo={`Parados há mais de ${DIAS_PARADO} dias`}
          icone={<Hourglass />}
          valor={NUMERO.format(parados.total)}
          alerta={parados.total > 0}
          resumo={parados.total === 0 ? "Tudo o que está em andamento ou em validação mexeu nesta semana." : "Em andamento ou em validação sem edição, mudança de situação ou comentário."}
        >
          <Itens itens={parados.itens} detalhe={(i) => dias(i.dias)} />
        </Bloco>
        <Bloco
          id="fluxo-validacao"
          titulo="Esperando validação"
          icone={<CircleCheck />}
          valor={NUMERO.format(esperandoValidacao.total)}
          alerta={esperandoValidacao.total > 0 && (esperandoValidacao.maisAntigoDias ?? 0) > DIAS_PARADO}
          resumo={
            esperandoValidacao.total === 0
              ? "Nada esperando validação."
              : `O mais antigo espera há ${dias(esperandoValidacao.maisAntigoDias ?? 0)}.`
          }
          href={esperandoValidacao.total > 0 ? { rotulo: "Ver no Controle interno", para: `${ROTA_TECH_INTERNO}?situacao=VALIDATION` } : undefined}
        >
          <Itens itens={esperandoValidacao.itens} detalhe={(i) => dias(i.dias)} />
        </Bloco>
        <Bloco
          id="fluxo-andamento"
          titulo="Em andamento por pessoa"
          icone={<Wrench />}
          valor={NUMERO.format(totalAndamento)}
          alerta={false}
          resumo={totalAndamento === 0 ? "Ninguém com item em andamento." : "Quanto cada pessoa tem aberto ao mesmo tempo."}
          href={totalAndamento > 0 ? { rotulo: "Ver no Controle interno", para: `${ROTA_TECH_INTERNO}?situacao=IN_PROGRESS` } : undefined}
        >
          {emAndamentoPorPessoa.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-fs-2">
              {emAndamentoPorPessoa.map((p) => (
                <li key={p.chave} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2">
                  <span className="truncate text-fg-secondary" title={p.nome}>
                    {p.nome}
                  </span>
                  <span className="block h-2 rounded-full bg-surface-hover" aria-hidden>
                    <span className="block h-full rounded-full bg-[var(--c41-grafico-neutro)]" style={{ width: `${(p.total / maiorAndamento) * 100}%` }} />
                  </span>
                  <span className="font-medium tnum text-fg">{NUMERO.format(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
        <Bloco
          id="fluxo-voltas"
          titulo="Média de voltas da validação"
          icone={<RotateCcw />}
          valor={saude.mediaDeVoltas === null ? "—" : DECIMAL.format(saude.mediaDeVoltas)}
          alerta={(saude.mediaDeVoltas ?? 0) >= 1}
          resumo={
            saude.entregas === 0
              ? "Nenhuma entrega no período."
              : `${NUMERO.format(saude.voltas)} ${saude.voltas === 1 ? "volta" : "voltas"} em ${NUMERO.format(saude.entregas)} ${saude.entregas === 1 ? "entrega" : "entregas"} do período. Uma por entrega ou mais pede conversa sobre o critério de pronto.`
          }
        />
      </div>
    </Card>
  );
}
