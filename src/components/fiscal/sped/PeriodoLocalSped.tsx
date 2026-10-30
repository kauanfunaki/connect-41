"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoMes } from "@/components/ui/CampoMes";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function PeriodoLocalSped({ competencia, mensal }: { competencia: string; mensal: boolean }) {
  const router = useRouter(), caminho = usePathname(), params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  function navegar(valor: string) { const q = new URLSearchParams(params); q.set("competencia", valor); q.delete("pagina"); iniciar(() => router.push(`${caminho}?${q}`)); }
  return <div className="flex flex-wrap items-center gap-2" aria-busy={pendente}>
    <span className="c41-rotulo">Período</span>
    {!mensal && <Select compact aria-label="Tipo do período" className="w-28" value={competencia.length === 4 ? "ano" : "mes"} onChange={e => navegar(e.target.value === "ano" ? competencia.slice(0, 4) : `${competencia}-01`)}><option value="mes">Mensal</option><option value="ano">Anual</option></Select>}
    {competencia.length === 4 && !mensal ? <Input compact type="number" aria-label="Ano" className="w-24" min={2000} max={2100} defaultValue={competencia} onBlur={e => { if (/^20\d{2}$/.test(e.target.value) && e.target.value !== competencia) navegar(e.target.value); }} /> : <CampoMes compact className="w-40" aria-label="Competência" value={competencia.length === 7 ? competencia : `${competencia}-01`} onChange={v => { if (v && v !== competencia) navegar(v); }} />}
  </div>;
}
