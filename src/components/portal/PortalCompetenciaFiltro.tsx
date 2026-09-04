"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { competenciaLegivel } from "@/lib/fiscal/rotulos";

type Props = { competencias: string[] };

/**
 * Filtro único do portal: a competência.
 *
 * Só ela, e é escolha: o cliente procura pelo mês que está conferindo, não por
 * tipo de documento nem por destino. O painel de filtros do acervo interno tem
 * quatro campos porque o fiscal trabalha ali — copiá-lo aqui seria mobiliar a
 * tela do cliente com as ferramentas de outra pessoa.
 */
export function PortalCompetenciaFiltro({ competencias }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function aplicar(valor: string) {
    const q = new URLSearchParams(params.toString());
    if (valor) q.set("competencia", valor);
    else q.delete("competencia");
    // Trocar de mês volta para a primeira página: manter a página abriria a
    // tela vazia quando o mês novo tem menos documentos.
    q.delete("pagina");
    router.push(`?${q.toString()}`);
  }

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="competencia" className="text-[length:var(--fs-ui)] text-fg-muted">
        Competência
      </label>
      <Select
        id="competencia"
        className="max-w-[200px]"
        value={params.get("competencia") ?? ""}
        onChange={(e) => aplicar(e.target.value)}
      >
        <option value="">Todas</option>
        {competencias.map((c) => (
          <option key={c} value={c}>
            {competenciaLegivel(c)}
          </option>
        ))}
      </Select>
    </div>
  );
}
