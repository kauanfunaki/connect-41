import { Crown, Gift, TrendingUp } from "lucide-react";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { mesPorExtensoLongo } from "@/lib/academia/regras";
import { CATEGORIAS_DO_HALL, CATEGORIA_DA_EVOLUCAO, ROTULO_DA_CATEGORIA, type CategoriaDoHall } from "@/lib/academia/hall";
import type { CampeaoNaTela, MesDoHall, ParabensDeQuemOlha } from "@/lib/academia/tipos";
import { BotaoDeParabens } from "./BotaoDeParabens";
import { IconeDoTeste } from "./IconeDoTeste";

const MEDALHA = ["", "bg-warning/15 text-warning-fg", "bg-surface-2 text-fg-secondary", "bg-brand-subtle text-brand"];

function Linha({ c, mes, parabens }: { c: CampeaoNaTela; mes: string; parabens: ParabensDeQuemOlha }) {
  const chave = `${mes}:${c.categoria}`;
  return (
    <li className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${c.eu ? "bg-brand-subtle" : ""}`} aria-current={c.eu ? "true" : undefined}>
      <span className={`inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full text-helper font-semibold tabular-nums ${MEDALHA[c.posicao] ?? MEDALHA[2]}`}>
        {c.categoria === CATEGORIA_DA_EVOLUCAO ? <TrendingUp size={14} aria-label="Maior evolução" /> : `${c.posicao}º`}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-ui">
        <AvatarImage src={c.fotoUrl} name={c.nome} size={24} fontSize={10} />
        <span className="min-w-0">
          <span className={`block truncate text-fg ${c.eu ? "font-semibold" : ""}`}>
            {c.nome} {c.eu && <Selo tom="marca">Você</Selo>}
          </span>
          <span className="block truncate text-helper text-fg-muted tabular-nums">{c.valor}</span>
        </span>
      </span>
      {!c.eu && <BotaoDeParabens paraUserId={c.userId} nome={c.nome} parabens={{ mes, tipo: c.categoria, podeMandar: parabens.podeMandar, enviados: parabens.enviados[chave] ?? [] }} />}
    </li>
  );
}

/**
 * O Hall dos campeões (Fase 2, 11/11/2026): cada mês encerrado com o pódio de
 * cada teste e a maior evolução, e o prêmio como estava quando o mês fechou.
 */
export function HallDosCampeoes({ meses, parabens }: { meses: MesDoHall[]; parabens: ParabensDeQuemOlha }) {
  return (
    <div className="flex flex-col gap-4">
      {meses.map(({ mes, campeoes }) => {
        const de = (cat: CategoriaDoHall) => campeoes.filter((c) => c.categoria === cat);
        const premios = [...new Set(campeoes.filter((c) => c.categoria !== CATEGORIA_DA_EVOLUCAO).map((c) => c.premio).filter(Boolean))];
        const premioDaEvolucao = de(CATEGORIA_DA_EVOLUCAO)[0]?.premio ?? null;
        const tituloId = `hall-${mes}`;
        return (
          <Card as="section" key={mes} aria-labelledby={tituloId} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={tituloId} className="flex items-center gap-2 text-body font-semibold text-fg first-letter:uppercase">
                <Crown size={16} aria-hidden className="text-warning-fg" /> {mesPorExtensoLongo(mes)}
              </h2>
              {(premios.length > 0 || premioDaEvolucao) && (
                <p className="flex items-start gap-1.5 text-helper text-fg-secondary">
                  <Gift size={13} aria-hidden className="mt-0.5 flex-shrink-0 text-brand" />
                  <span>
                    {premios.length > 0 && <>Prêmio: {premios.join(" · ")}</>}
                    {premios.length > 0 && premioDaEvolucao && " · "}
                    {premioDaEvolucao && <>Maior evolução: {premioDaEvolucao}</>}
                  </span>
                </p>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {CATEGORIAS_DO_HALL.map((cat) => {
                const lista = de(cat);
                if (lista.length === 0) return null;
                return (
                  <div key={cat} className="rounded-md border border-border-soft p-2">
                    <h3 className="mb-1 flex items-center gap-1.5 px-2 text-label font-medium text-fg-secondary [&>svg]:size-3.5">
                      {cat === CATEGORIA_DA_EVOLUCAO ? <TrendingUp aria-hidden /> : <IconeDoTeste teste={cat} />}
                      {ROTULO_DA_CATEGORIA[cat]}
                    </h3>
                    <ol className="flex flex-col gap-0.5" aria-label={`${ROTULO_DA_CATEGORIA[cat]} em ${mesPorExtensoLongo(mes)}`}>
                      {lista.map((c) => (
                        <Linha key={`${c.categoria}-${c.posicao}`} c={c} mes={mes} parabens={parabens} />
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
