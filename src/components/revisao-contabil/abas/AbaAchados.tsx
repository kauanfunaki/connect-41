import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { AcompanharAchado } from "@/components/revisao-contabil/AcompanharAchado";
import { tomDaGravidade, tomDoEstado } from "@/components/revisao-contabil/tons";
import { GRAVIDADES, NATUREZAS } from "@/lib/revisao-contabil/regras-da-tela";
import type { Achado } from "@/lib/revisao-contabil/motor/tipos";
import { formatarReaisDeCentavos } from "@/lib/format";

type AchadoNaTela = Achado & { nota: string };
export type FiltrosDosAchados = { q?: string; gravidade?: string; natureza?: string };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O filtro do original: busca por conta, tema ou responsável, gravidade e natureza. */
export function filtrarAchados<T extends AchadoNaTela>(achados: T[], f: FiltrosDosAchados): T[] {
  const q = semAcento(f.q?.trim() ?? "");
  return achados.filter(
    (a) =>
      (!q || [a.id, a.title, a.area, a.owner, a.fact, a.source, a.nota].some((s) => semAcento(String(s ?? "")).includes(q))) &&
      (!f.gravidade || a.severity === f.gravidade) &&
      (!f.natureza || a.kind === f.natureza),
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-micro uppercase tracking-wide text-fg-muted">{rotulo}</dt>
      <dd className="break-words text-ui text-fg">{children}</dd>
    </div>
  );
}

/**
 * As inconsistências da última execução, com o acompanhamento da equipe.
 * Valor sob revisão não é perda confirmada, e o plano de ação não manda
 * mensagem nem altera a escrituração (avisos do original).
 */
export function AbaAchados({
  fechamentoId,
  execucaoId,
  achados,
  filtros,
  podeAgir,
}: {
  fechamentoId: string;
  execucaoId: string | null;
  achados: AchadoNaTela[];
  filtros: FiltrosDosAchados;
  podeAgir: boolean;
}) {
  if (!execucaoId) return <EmptyState title="Ainda não analisado" description="Os achados aparecem aqui depois da primeira análise." />;
  if (achados.length === 0)
    return (
      <EmptyState
        icon={<CircleCheck size={28} aria-hidden />}
        title="Sem divergências nos testes executados"
        description="Isso não equivale a aprovação: confira na aba Análise os testes não executados e na aba Manual os itens de conferência manual."
      />
    );
  const visiveis = filtrarAchados(achados, filtros);
  return (
    <div className="flex flex-col gap-3">
      <FormularioDeFiltro className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="aba" value="achados" />
        <div className="min-w-56 flex-1">
          <CampoDeBusca name="q" defaultValue={filtros.q ?? ""} placeholder="Buscar por conta, tema ou responsável…" aria-label="Buscar inconsistências" compact />
        </div>
        <Select name="gravidade" defaultValue={filtros.gravidade ?? ""} aria-label="Filtrar gravidade" compact className="w-auto">
          <option value="">Todas as gravidades</option>
          {GRAVIDADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Select name="natureza" defaultValue={filtros.natureza ?? ""} aria-label="Filtrar natureza" compact className="w-auto">
          <option value="">Todas as naturezas</option>
          {NATUREZAS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
        <span className="ml-auto text-ui font-semibold text-fg">
          {visiveis.length === achados.length ? `${achados.length} achados` : `${visiveis.length} de ${achados.length} achados`}
        </span>
      </FormularioDeFiltro>

      {visiveis.length === 0 && <EmptyState title="Nenhum achado com estes filtros" description="Limpe a busca ou escolha outra gravidade." />}

      {visiveis.map((a) => (
        <Card as="section" key={a.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-label font-semibold text-fg">
              {a.id} · {a.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Selo tom={tomDaGravidade(a.severity)}>{a.severity}</Selo>
              <Selo tom={tomDoEstado(a.status)}>{a.status}</Selo>
              {podeAgir && (
                <AcompanharAchado fechamentoId={fechamentoId} execucaoId={execucaoId} achadoId={a.id} titulo={a.title} responsavel={a.owner} estado={a.status} nota={a.nota} />
              )}
            </div>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Natureza">{a.kind}</Campo>
            <Campo rotulo="Valor sob revisão">{a.value ? formatarReaisDeCentavos(Math.round(a.value * 100)) : "Não quantificado"}</Campo>
            <Campo rotulo="Conta ou área">{a.area}</Campo>
            <Campo rotulo="Responsável">{a.owner}</Campo>
          </dl>
          <dl className="mt-3 grid gap-3 lg:grid-cols-2">
            <Campo rotulo="Fato">{a.fact}</Campo>
            <Campo rotulo="Fonte">{a.source}</Campo>
            {a.meaning && <Campo rotulo="O que significa">{a.meaning}</Campo>}
            <Campo rotulo="Providência">{a.action}</Campo>
            <Campo rotulo="Efeito">{a.impact}</Campo>
            {a.nota && <Campo rotulo="Anotação">{a.nota}</Campo>}
          </dl>
        </Card>
      ))}
    </div>
  );
}
