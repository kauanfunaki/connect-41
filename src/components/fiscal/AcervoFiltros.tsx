"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { FilterButton } from "@/components/ui/FilterButton";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { nomeExibicao } from "@/lib/companyName";
import { TIPO_LABEL, DESTINO_LABEL, competenciaLegivel } from "@/lib/fiscal/rotulos";

type Empresa = { id: string; name: string; displayName: string | null };

type Props = {
  empresas: Empresa[];
  competencias: string[];
};

const CHAVES_DE_FILTRO = ["empresa", "competencia", "tipo", "destino"] as const;

// Componente cliente inteiro, e não só o botão: o painel do FilterButton recebe
// a callback `close()`, que não atravessa a fronteira Server → Client. Mesmo
// motivo do EmpresasFilterButton.
export function AcervoFiltros({ empresas, competencias }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function comFiltro(chave: string, valor: string) {
    const q = new URLSearchParams(params.toString());
    if (valor) q.set(chave, valor);
    else q.delete(chave);
    // Trocar de filtro sempre volta para a página 1: manter a página faria a
    // tela abrir vazia quando o novo filtro tem menos resultados que a página
    // em que a pessoa estava.
    q.delete("pagina");
    return `?${q.toString()}`;
  }

  function aplicar(chave: string, valor: string) {
    router.push(comFiltro(chave, valor));
  }

  const ativos = CHAVES_DE_FILTRO.filter((c) => params.get(c)).length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <form
        className="relative flex-1 min-w-[240px]"
        onSubmit={(e) => {
          e.preventDefault();
          const valor = new FormData(e.currentTarget).get("q");
          aplicar("q", typeof valor === "string" ? valor.trim() : "");
        }}
      >
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
        <Input
          name="q"
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="Número, contraparte ou chave de acesso"
          className="pl-9"
        />
      </form>

      <FilterButton activeCount={ativos} width={280}>
        {() => (
          <div className="space-y-3">
            <CampoForm label="Empresa" htmlFor="f-empresa">
              <Select
                id="f-empresa"
                value={params.get("empresa") ?? ""}
                onChange={(e) => aplicar("empresa", e.target.value)}
              >
                <option value="">Todas</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {nomeExibicao(e)}
                  </option>
                ))}
              </Select>
            </CampoForm>

            <CampoForm label="Competência" htmlFor="f-competencia">
              <Select
                id="f-competencia"
                value={params.get("competencia") ?? ""}
                onChange={(e) => aplicar("competencia", e.target.value)}
              >
                <option value="">Todas</option>
                {competencias.map((c) => (
                  <option key={c} value={c}>
                    {competenciaLegivel(c)}
                  </option>
                ))}
              </Select>
            </CampoForm>

            <CampoForm label="Tipo" htmlFor="f-tipo">
              <Select id="f-tipo" value={params.get("tipo") ?? ""} onChange={(e) => aplicar("tipo", e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(TIPO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </CampoForm>

            <CampoForm label="Destino" htmlFor="f-destino">
              <Select
                id="f-destino"
                value={params.get("destino") ?? ""}
                onChange={(e) => aplicar("destino", e.target.value)}
              >
                <option value="">Todos</option>
                {Object.entries(DESTINO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </div>
        )}
      </FilterButton>
    </div>
  );
}
