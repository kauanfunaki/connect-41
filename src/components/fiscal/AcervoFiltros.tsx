"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { nomeExibicao } from "@/lib/companyName";
import { TIPO_LABEL, DESTINO_LABEL, competenciaLegivel } from "@/lib/fiscal/rotulos";

type Empresa = { id: string; name: string; displayName: string | null };

type Props = {
  empresas: Empresa[];
  competencias: string[];
};

/**
 * A busca e o botão "Filtros" do acervo.
 *
 * Até 30/09 o painel do FilterButton tinha quatro campos, e a competência era um
 * `<select>` sem busca — com 36 meses na lista, achar um era rolar. Pela regra
 * da conferência, os quatro recortes (empresa, competência, tipo e destino)
 * foram para o `FiltrosDaTela`, que busca em lista longa; a busca por texto
 * continua fora, ao lado dele, porque se digita.
 */
export function AcervoFiltros({ empresas, competencias }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function buscar(valor: string) {
    const q = new URLSearchParams(params.toString());
    if (valor) q.set("q", valor);
    else q.delete("q");
    // Trocar de filtro sempre volta para a página 1: manter a página faria a
    // tela abrir vazia quando o novo filtro tem menos resultados que a página
    // em que a pessoa estava.
    q.delete("pagina");
    router.push(`?${q.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <form
        className="flex-1 min-w-[240px] max-w-[520px]"
        onSubmit={(e) => {
          e.preventDefault();
          const valor = new FormData(e.currentTarget).get("q");
          buscar(typeof valor === "string" ? valor.trim() : "");
        }}
      >
        {/* `key` no valor da URL: sem isto, voltar no navegador deixaria a
            busca antiga escrita na caixa, com a lista já sem ela. */}
        <Input
          key={params.get("q") ?? ""}
          name="q"
          type="search"
          compact
          icon={<Search />}
          defaultValue={params.get("q") ?? ""}
          placeholder="Número, contraparte ou chave de acesso"
          aria-label="Buscar documento"
        />
      </form>

      <FiltrosDaTela
        campos={[
          {
            chave: "empresa",
            rotulo: "Empresa",
            vazioLabel: "Todas",
            opcoes: empresas.map((e) => ({ value: e.id, label: nomeExibicao(e) })),
          },
          {
            chave: "competencia",
            rotulo: "Competência",
            vazioLabel: "Todas",
            opcoes: competencias.map((c) => ({ value: c, label: competenciaLegivel(c) })),
          },
          {
            chave: "tipo",
            rotulo: "Tipo",
            vazioLabel: "Todos",
            opcoes: Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            chave: "destino",
            rotulo: "Destino",
            vazioLabel: "Todos",
            opcoes: Object.entries(DESTINO_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
      />
    </div>
  );
}
