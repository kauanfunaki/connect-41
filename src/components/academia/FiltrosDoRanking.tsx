"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { NIVEIS, ROTULO_DO_NIVEL, mesPorExtensoLongo, type Nivel, type Teste } from "@/lib/academia/regras";

/**
 * Os filtros do ranking (10/11/2026): mês, nível e setor, na URL — o link
 * copiado abre o mesmo recorte. O teste é a fileira de abas acima.
 */
export function FiltrosDoRanking({
  teste,
  mes,
  nivel,
  setor,
  meses,
  setores,
}: {
  teste: Teste;
  mes: string;
  nivel: Nivel | null;
  setor: string | null;
  meses: string[];
  setores: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const id = useId();

  function ir(mudou: { mes?: string; nivel?: string; setor?: string }) {
    const p = new URLSearchParams({ teste, mes: mudou.mes ?? mes });
    const novoNivel = mudou.nivel ?? nivel ?? "";
    const novoSetor = mudou.setor ?? setor ?? "";
    if (novoNivel) p.set("nivel", novoNivel);
    if (novoSetor) p.set("setor", novoSetor);
    iniciar(() => router.push(`/academia/ranking?${p.toString()}`, { scroll: false }));
  }

  const campo = "flex w-full flex-col gap-1 sm:w-auto";
  const rotulo = "text-label font-medium text-fg";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className={campo}>
        <label htmlFor={`${id}-mes`} className={rotulo}>Mês</label>
        <Select id={`${id}-mes`} value={mes} onChange={(e) => ir({ mes: e.target.value })} className="w-full sm:w-52">
          {meses.map((m) => (
            <option key={m} value={m}>
              {mesPorExtensoLongo(m)}
            </option>
          ))}
        </Select>
      </div>
      <div className={campo}>
        <label htmlFor={`${id}-nivel`} className={rotulo}>Nível</label>
        <Select id={`${id}-nivel`} value={nivel ?? ""} onChange={(e) => ir({ nivel: e.target.value })} className="w-full sm:w-44">
          <option value="">Todos os níveis</option>
          {NIVEIS.map((n) => (
            <option key={n} value={n}>
              {ROTULO_DO_NIVEL[n]}
            </option>
          ))}
        </Select>
      </div>
      <div className={campo}>
        <label htmlFor={`${id}-setor`} className={rotulo}>Setor</label>
        <Select id={`${id}-setor`} value={setor ?? ""} onChange={(e) => ir({ setor: e.target.value })} className="w-full sm:w-52">
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
