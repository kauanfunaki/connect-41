"use client";

import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { formatarCompetencia } from "@/lib/format";

type Props = {
  competencias: string[];
  /** As empresas do cliente; com mais de uma, o filtro ganha o campo Empresa (05/10). */
  empresas?: { id: string; nome: string }[];
  /** Na barra do `CascoDaTabela` (07/10/2026), como no acervo da equipe. */
  naBarra?: boolean;
};

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
 * Fora do casco, o respiro de baixo é dele (`mb-4`) — não da tabela nem do
 * vazio que vêm depois. Na barra do casco, a barra cuida do espaço.
 *
 * A competência sai no formato único da interface (`formatarCompetencia`,
 * "Out/26"), o mesmo do Relatório e do Fluxo de caixa — era "out/2026" aqui.
 *
 * A empresa entrou em 05/10, só para quem tem mais de uma: é a escolha que o
 * Início leva adiante no atalho dos documentos.
 */
export function PortalCompetenciaFiltro({ competencias, empresas = [], naBarra = false }: Props) {
  return (
    <FiltrosDaTela
      naBarra={naBarra}
      className={naBarra ? "" : "mb-4"}
      campos={[
        {
          chave: "competencia",
          rotulo: "Competência",
          vazioLabel: "Todas",
          opcoes: competencias.map((c) => ({ value: c, label: formatarCompetencia(c) })),
        },
        ...(empresas.length > 1
          ? [{ chave: "empresa", rotulo: "Empresa", vazioLabel: "Todas", opcoes: empresas.map((e) => ({ value: e.id, label: e.nome })) }]
          : []),
      ]}
    />
  );
}
