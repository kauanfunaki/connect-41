"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";
import { Select } from "@/components/ui/Select";
import { NIVEIS, ROTULO_DO_NIVEL, mesPorExtensoLongo, type Nivel } from "@/lib/academia/regras";

/**
 * Os filtros do ranking (10/11/2026): mês, nível e setor, na URL — o link
 * copiado abre o mesmo recorte. O teste é a fileira de abas acima.
 *
 * Desde a melhoria-823 (25/11/2026) moram no painel do botão Filtros (rótulo
 * em caixa alta e um seletor por filtro): os três seletores com rótulo
 * chamavam mais atenção que o pódio. Ao lado do botão fica só o recorte em
 * texto curto ("novembro de 2026 · Médio · Fiscal").
 */
export function FiltrosDoRanking({
  teste,
  mes,
  mesAtual,
  nivel,
  setor,
  meses,
  setores,
  visao,
}: {
  /** O teste da URL, ou "media" (a média de todos os testes). */
  teste: string;
  mes: string;
  /** O mês de hoje: escolher outro conta como filtro ligado no botão. */
  mesAtual: string;
  nivel: Nivel | null;
  setor: string | null;
  meses: string[];
  setores: { value: string; label: string }[];
  /** "evolucao", "setores" e a média usam só o mês (o recorte é o ranking geral). */
  visao?: "mes" | "evolucao" | "setores";
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const id = useId();
  const soMes = visao === "evolucao" || visao === "setores" || teste === "media";

  function ir(mudou: { mes?: string; nivel?: string; setor?: string }) {
    const p = new URLSearchParams({ teste, mes: mudou.mes ?? mes });
    if (visao && visao !== "mes") p.set("visao", visao);
    const novoNivel = soMes ? "" : (mudou.nivel ?? nivel ?? "");
    const novoSetor = soMes ? "" : (mudou.setor ?? setor ?? "");
    if (novoNivel) p.set("nivel", novoNivel);
    if (novoSetor) p.set("setor", novoSetor);
    iniciar(() => router.push(`/academia/ranking?${p.toString()}`, { scroll: false }));
  }

  const ativos = (mes !== mesAtual ? 1 : 0) + (!soMes && nivel ? 1 : 0) + (!soMes && setor ? 1 : 0);
  const recorte = [
    mesPorExtensoLongo(mes),
    !soMes && nivel ? ROTULO_DO_NIVEL[nivel] : null,
    !soMes && setor ? (setores.find((s) => s.value === setor)?.label ?? setor) : null,
  ].filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <FilterButton activeCount={ativos} align="left" width={280}>
        <div className="space-y-3">
          <FilterButtonSection label="Mês">
            <Select compact id={`${id}-mes`} aria-label="Mês" value={mes} onChange={(e) => ir({ mes: e.target.value })} className="w-full">
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesPorExtensoLongo(m)}
                </option>
              ))}
            </Select>
          </FilterButtonSection>
          {!soMes && (
            <>
              <FilterButtonSection label="Nível">
                <Select compact id={`${id}-nivel`} aria-label="Nível" value={nivel ?? ""} onChange={(e) => ir({ nivel: e.target.value })} className="w-full">
                  <option value="">Todos os níveis</option>
                  {NIVEIS.map((n) => (
                    <option key={n} value={n}>
                      {ROTULO_DO_NIVEL[n]}
                    </option>
                  ))}
                </Select>
              </FilterButtonSection>
              <FilterButtonSection label="Setor">
                <Select compact id={`${id}-setor`} aria-label="Setor" value={setor ?? ""} onChange={(e) => ir({ setor: e.target.value })} className="w-full">
                  <option value="">Todos os setores</option>
                  {setores.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </FilterButtonSection>
            </>
          )}
        </div>
      </FilterButton>
      <span className="min-w-0 truncate text-ui text-fg-secondary">{recorte}</span>
    </div>
  );
}
