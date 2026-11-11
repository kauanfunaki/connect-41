import { TrendingUp } from "lucide-react";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { ROTULO_DO_TESTE, mesPorExtensoLongo } from "@/lib/academia/regras";
import { MESES_DA_MEDIA_DA_EVOLUCAO, MINIMO_DE_TENTATIVAS_NA_EVOLUCAO, evolucaoEmTexto, numeroDoMesEmTexto } from "@/lib/academia/evolucao";
import type { EvolucaoNaTela, LinhaDaEvolucaoNaTela } from "@/lib/academia/tipos";
import { BotaoDeParabens, type ParabensDaLinha } from "./BotaoDeParabens";

/**
 * O ranking de evolução (Fase 2, 11/11/2026): quem mais melhorou no mês contra
 * a própria média dos 3 meses anteriores. Top 10 e a linha de quem olha, como
 * o ranking do mês; a própria evolução aparece mesmo sem ter melhorado.
 */
export function TabelaDaEvolucao({ evolucao, parabens }: { evolucao: EvolucaoNaTela; parabens?: ParabensDaLinha }) {
  const { teste, mes, topo, eu, minha } = evolucao;
  const regra = `O seu número de ${mesPorExtensoLongo(mes)} contra a média dos seus ${MESES_DA_MEDIA_DA_EVOLUCAO} meses anteriores (os meses em que você fez o teste). Entra quem fez pelo menos ${MINIMO_DE_TENTATIVAS_NA_EVOLUCAO} tentativas valendo no mês e melhorou.`;

  const minhaFrase = minha
    ? `Sua evolução: ${evolucaoEmTexto(minha.evolucao)} (${numeroDoMesEmTexto(teste, minha.atual)} contra a média de ${numeroDoMesEmTexto(teste, minha.media)}).`
    : `Você ainda não entra na evolução de ${ROTULO_DO_TESTE[teste]}: faltam ${MINIMO_DE_TENTATIVAS_NA_EVOLUCAO} tentativas valendo no mês ou um mês anterior para comparar.`;

  if (evolucao.foraDoRanking) {
    return (
      <section aria-labelledby="minha-evolucao-titulo" className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <h2 id="minha-evolucao-titulo" className="text-body font-semibold text-fg">Sua evolução</h2>
        <p className="mt-1 text-ui text-fg-secondary">{minhaFrase}</p>
        <p className="mt-2 text-helper text-fg-muted">Você escolheu não aparecer no ranking, e por isso também não vê a evolução dos colegas.</p>
      </section>
    );
  }

  const linha = (l: LinhaDaEvolucaoNaTela) => (
    <li key={l.userId} className={`flex items-center gap-2.5 rounded-md px-2 py-2 ${l.eu ? "bg-brand-subtle" : ""}`} aria-current={l.eu ? "true" : undefined}>
      <span className={`inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full text-helper font-semibold tabular-nums ${l.posicao <= 3 ? "bg-brand-subtle text-brand" : "bg-surface-2 text-fg-secondary"}`}>
        {l.posicao}º
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-ui">
        <AvatarImage src={l.fotoUrl} name={l.nome} size={24} fontSize={10} />
        <span className="min-w-0">
          <span className={`block truncate ${l.eu ? "font-semibold" : ""} text-fg`}>
            {l.nome} {l.eu && <Selo tom="marca">Você</Selo>}
          </span>
          {l.setor && <span className="block truncate text-helper text-fg-muted">{l.setor}</span>}
        </span>
      </span>
      <span className="text-right text-ui tabular-nums">
        <span className="block font-semibold text-success-fg">{evolucaoEmTexto(l.evolucao)}</span>
        <span className="block text-helper text-fg-muted">
          {numeroDoMesEmTexto(teste, l.media)} → {numeroDoMesEmTexto(teste, l.atual)}
        </span>
      </span>
      {parabens && !l.eu && <BotaoDeParabens paraUserId={l.userId} nome={l.nome} parabens={parabens} />}
    </li>
  );

  return (
    <section aria-labelledby="evolucao-titulo" className="flex flex-col gap-3">
      <div>
        <h2 id="evolucao-titulo" className="text-body font-semibold text-fg">
          Evolução em {ROTULO_DO_TESTE[teste]} · {mesPorExtensoLongo(mes)}
        </h2>
        <p className="text-helper text-fg-muted">{regra}</p>
      </div>
      {topo.length === 0 ? (
        <EmptyState icon={<TrendingUp />} title="Ninguém na evolução ainda" description="Assim que alguém fizer as tentativas do mês e melhorar a própria média, aparece aqui." />
      ) : (
        <ol className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-2" aria-label={`Evolução em ${ROTULO_DO_TESTE[teste]}`}>
          {topo.map(linha)}
          {eu && (
            <>
              <li aria-hidden className="px-2 text-center text-helper text-fg-muted">⋯</li>
              {linha(eu)}
            </>
          )}
        </ol>
      )}
      {!topo.some((l) => l.eu) && !eu && <p className="text-ui text-fg-secondary">{minhaFrase}</p>}
    </section>
  );
}
