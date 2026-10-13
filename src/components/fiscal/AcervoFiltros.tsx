"use client";

import { useSearchParams } from "next/navigation";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TIPO_LABEL, DESTINO_LABEL } from "@/lib/fiscal/rotulos";
import { formatarCompetencia } from "@/lib/format";

/**
 * A busca e o botão "Filtros" do acervo, cada um na sua vaga da barra do
 * `CascoDaTabela` (07/10/2026) — eram uma fileira própria acima da tabela,
 * fora do casco, enquanto as filas irmãs de 05/10 já tinham contagem, busca e
 * filtros na barra.
 *
 * Até 30/09 o painel do FilterButton tinha quatro campos, e a competência era um
 * `<select>` sem busca — com 36 meses na lista, achar um era rolar. Pela regra
 * da conferência, os quatro recortes (empresa, competência, tipo e destino)
 * foram para o `FiltrosDaTela`, que busca em lista longa; a busca por texto
 * continua ao lado dele, porque se digita.
 */
export function BuscaDoAcervo() {
  const params = useSearchParams();

  function buscar(valor: string) {
    const q = new URLSearchParams(params.toString());
    if (valor) q.set("q", valor);
    else q.delete("q");
    // Trocar de filtro sempre volta para a página 1: manter a página faria a
    // tela abrir vazia quando o novo filtro tem menos resultados que a página
    // em que a pessoa estava.
    q.delete("pagina");
    // Como os cartões e o painel de filtros: faz a consulta completa ao
    // servidor, sem depender de uma árvore de outro recorte no cache RSC.
    window.location.assign(`/documentos-fiscais${q.size ? `?${q.toString()}` : ""}`);
  }

  return (
    <form
      className="max-w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const valor = new FormData(e.currentTarget).get("q");
        buscar(typeof valor === "string" ? valor.trim() : "");
      }}
    >
      {/* `key` no valor da URL: sem isto, voltar no navegador deixaria a
          busca antiga escrita na caixa, com a lista já sem ela. */}
      <CampoDeBusca
        key={params.get("q") ?? ""}
        name="q"
        compact
        defaultValue={params.get("q") ?? ""}
        placeholder="Número, contraparte ou chave de acesso"
        aria-label="Buscar documento"
        className="w-80 max-w-full"
      />
    </form>
  );
}

/**
 * Competência, tipo e destino. A empresa saiu daqui em 13/10/2026: é o
 * seletor da fileira de cima, e o acervo mostra uma empresa por vez.
 */
export function FiltrosDoAcervo({ competencias }: { competencias: string[] }) {
  return (
    <FiltrosDaTela
      naBarra
      campos={[
        {
          chave: "competencia",
          rotulo: "Competência",
          vazioLabel: "Todas",
          opcoes: competencias.map((c) => ({ value: c, label: formatarCompetencia(c) })),
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
  );
}
