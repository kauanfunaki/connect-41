"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";

/** Troca a empresa do Contábil Core mantendo a aba aberta. */
export function SeletorDeEmpresa({ empresas, atual, aba }: { empresas: Opcao[]; atual: string; aba: string }) {
  const router = useRouter();
  return (
    <SearchableSelect
      name="empresa"
      aria-label="Empresa"
      options={empresas}
      defaultValue={atual}
      onChange={(id) => id && router.push(`/contabil-core?empresa=${id}&aba=${aba}`)}
      placeholder="Escolha a empresa"
    />
  );
}
