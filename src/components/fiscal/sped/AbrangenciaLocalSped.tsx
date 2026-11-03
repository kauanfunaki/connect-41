"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";

// Fica na fileira da empresa, ao lado do período: é o recorte da empresa escolhida
// (só ela ou o grupo pela raiz do CNPJ), e não um segundo lugar para trocar de empresa.
export function AbrangenciaLocalSped({ raiz, consolidado }: { raiz: string; consolidado: boolean }) {
  const router = useRouter(), caminho = usePathname(), params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  function navegar(valor: string) { const q = new URLSearchParams(params); q.set("escopo", valor); q.delete("pagina"); iniciar(() => router.push(`${caminho}?${q}`)); }
  return <div className="flex flex-wrap items-center gap-2" aria-busy={pendente}>
    <span className="c41-rotulo">Abrangência</span>
    <Select compact aria-label="Abrangência" title="Só a empresa escolhida ou a soma da matriz e das filiais com a mesma raiz de CNPJ" className="w-64" value={consolidado ? "raiz" : "empresa"} onChange={e => navegar(e.target.value)}>
      <option value="empresa">Só esta empresa</option>
      <option value="raiz">Matriz e filiais (raiz {formatarRaiz(raiz)})</option>
    </Select>
  </div>;
}

export const formatarRaiz = (raiz: string) => raiz.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3");
