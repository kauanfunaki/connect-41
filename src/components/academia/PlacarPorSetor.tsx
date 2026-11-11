import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { ROTULO_DO_TESTE, mesPorExtensoLongo } from "@/lib/academia/regras";
import { MINIMO_DE_PESSOAS_NO_PLACAR, numeroDoMesEmTexto } from "@/lib/academia/evolucao";
import type { PlacarNaTela } from "@/lib/academia/tipos";

/**
 * O placar por setor (Fase 2, 11/11/2026): a média do melhor de cada pessoa
 * do setor no mês. Só os setores com pelo menos 3 pessoas — com menos, a média
 * seria a nota de uma pessoa só.
 */
export function PlacarPorSetor({ placar }: { placar: PlacarNaTela }) {
  const { teste, mes, linhas } = placar;
  const regra = `A média do número de cada pessoa do setor em ${mesPorExtensoLongo(mes)} (o mesmo do ranking geral). Só entram os setores com pelo menos ${MINIMO_DE_PESSOAS_NO_PLACAR} pessoas no mês.`;
  if (placar.foraDoRanking) {
    return (
      <p className="rounded-lg border border-border bg-surface p-4 text-ui text-fg-muted shadow-xs">
        Você escolheu não aparecer no ranking, e por isso também não vê o placar dos setores. Ligue “Aparecer no ranking” para participar.
      </p>
    );
  }
  return (
    <section aria-labelledby="placar-titulo" className="flex flex-col gap-3">
      <div>
        <h2 id="placar-titulo" className="text-body font-semibold text-fg">
          Placar por setor em {ROTULO_DO_TESTE[teste]} · {mesPorExtensoLongo(mes)}
        </h2>
        <p className="text-helper text-fg-muted">{regra}</p>
      </div>
      {linhas.length === 0 ? (
        <EmptyState icon={<Users />} title="Nenhum setor no placar ainda" description={`Um setor entra quando ${MINIMO_DE_PESSOAS_NO_PLACAR} pessoas dele fazem o teste valendo no mês.`} />
      ) : (
        <ol className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-2" aria-label={`Placar por setor em ${ROTULO_DO_TESTE[teste]}`}>
          {linhas.map((l) => (
            <li key={l.sectorCode} className={`flex items-center gap-2.5 rounded-md px-2 py-2 ${l.meu ? "bg-brand-subtle" : ""}`}>
              <span className={`inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full text-helper font-semibold tabular-nums ${l.posicao <= 3 ? "bg-brand-subtle text-brand" : "bg-surface-2 text-fg-secondary"}`}>
                {l.posicao}º
              </span>
              <span className="min-w-0 flex-1 truncate text-ui text-fg">
                {l.setor} {l.meu && <Selo tom="marca">Seu setor</Selo>}
              </span>
              <span className="text-right text-ui tabular-nums">
                <span className="block font-semibold text-fg">{numeroDoMesEmTexto(teste, l.media)}</span>
                <span className="block text-helper text-fg-muted">{l.pessoas} {l.pessoas === 1 ? "pessoa" : "pessoas"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {placar.setoresDeFora > 0 && (
        <p className="text-helper text-fg-muted">
          {placar.setoresDeFora === 1 ? "1 setor ficou" : `${placar.setoresDeFora} setores ficaram`} de fora por ter menos de {MINIMO_DE_PESSOAS_NO_PLACAR} pessoas no mês.
        </p>
      )}
    </section>
  );
}
