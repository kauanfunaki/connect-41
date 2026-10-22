"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { CampoMes } from "@/components/ui/CampoMes";

export type OpcaoDeEstabelecimento = { id: number; rotulo: string };

/**
 * Raiz, estabelecimento e competência do modo real, logo abaixo do cabeçalho —
 * o mesmo lugar do filtro da prévia. Só aparecem os estabelecimentos que a
 * pessoa vê (os que têm empresa no escritório). Trocar o recorte volta a lista
 * para o começo (sai o cursor e o item aberto).
 */
export function FiltroDoMotor({ raizes, raiz, estabelecimentos, estabelecimentoId, competencia, semEstabelecimento = false }: {
  raizes: string[];
  raiz: string;
  estabelecimentos: OpcaoDeEstabelecimento[];
  estabelecimentoId: number | null;
  competencia: string;
  /** Telas por raiz (Contribuições): sem o seletor de estabelecimento. */
  semEstabelecimento?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const trocar = (mudanca: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudanca)) { if (v) q.set(k, v); else q.delete(k); }
    for (const k of ["cursor", "pagina", "execucao", "arquivo"]) q.delete(k);
    router.push(`${pathname}?${q.toString()}`);
  };
  return <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
    {raizes.length > 1 && <div className="flex items-center gap-2">
      <label htmlFor="motor-raiz" className="c41-rotulo flex-shrink-0">Raiz</label>
      <Select id="motor-raiz" compact className="w-40" value={raiz} onChange={(e) => trocar({ raiz: e.target.value, estab: null })}>
        {raizes.map((r) => <option key={r} value={r}>{r}</option>)}
      </Select>
    </div>}
    {!semEstabelecimento && <div className="flex min-w-0 max-w-full items-center gap-2">
      <label htmlFor="motor-estab" className="c41-rotulo flex-shrink-0">Estabelecimento</label>
      <Select id="motor-estab" compact className="w-72 max-w-full" value={estabelecimentoId === null ? "" : String(estabelecimentoId)} onChange={(e) => trocar({ estab: e.target.value || null })}>
        <option value="">Todos os estabelecimentos</option>
        {estabelecimentos.map((e) => <option key={e.id} value={e.id}>{e.rotulo}</option>)}
      </Select>
    </div>}
    <div className="flex items-center gap-2">
      <label htmlFor="motor-competencia" className="c41-rotulo flex-shrink-0">Competência</label>
      <CampoMes id="motor-competencia" compact className="w-40" aria-label="Competência" value={competencia} onChange={(v) => { if (v && v !== competencia) trocar({ competencia: v }); }} />
    </div>
  </div>;
}
