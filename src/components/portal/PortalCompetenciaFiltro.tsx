"use client";

import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { competenciaLegivel } from "@/lib/fiscal/rotulos";

type Props = { competencias: string[] };

/**
 * Filtro único do portal: a competência.
 *
 * Só ela, e é escolha: o cliente procura pelo mês que está conferindo, não por
 * tipo de documento nem por destino. O painel de filtros do acervo interno tem
 * quatro campos porque o fiscal trabalha ali — copiá-lo aqui seria mobiliar a
 * tela do cliente com as ferramentas de outra pessoa.
 *
 * Desde 30/09 no botão "Filtros", com busca — a regra das telas internas:
 * competência nunca num `<select>` comprido nem numa fileira de botões.
 *
 * O respiro de baixo é dele (`mb-4`), como o "Filtros" das outras telas do
 * portal — não da tabela nem do vazio que vêm depois.
 */
export function PortalCompetenciaFiltro({ competencias }: Props) {
  return (
    <FiltrosDaTela
      className="mb-4"
      campos={[
        {
          chave: "competencia",
          rotulo: "Competência",
          vazioLabel: "Todas",
          opcoes: competencias.map((c) => ({ value: c, label: competenciaLegivel(c) })),
        },
      ]}
    />
  );
}
