"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import type { EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { mesPorExtensoDoPortal } from "@/lib/portal/empresaEscolhida";

type Props = {
  competencias: string[];
  /** As empresas do cliente; com mais de uma, entra o seletor de empresa (05/10). */
  empresas?: (EmpresaParaEscolher & { nome: string })[];
  /**
   * A empresa que a lista está mostrando. Sem ela, vale a da URL (`?empresa=`).
   * A página que lê também a escolha guardada do portal (`empresaDaTela`) a
   * passa aqui, para o seletor dizer a mesma empresa que a lista mostra.
   */
  empresaId?: string | null;
  /** Na barra do `CascoDaTabela` (07/10/2026), como no acervo da equipe. */
  naBarra?: boolean;
};

/**
 * Os filtros dos documentos do portal: a empresa e o mês.
 *
 * Só esses dois, e é escolha: o cliente procura pelo mês que está conferindo,
 * não por tipo de documento nem por destino. O painel de filtros do acervo
 * interno tem quatro campos porque o fiscal trabalha ali — copiá-lo aqui seria
 * mobiliar a tela do cliente com as ferramentas de outra pessoa.
 *
 * O mês fica no botão "Filtros", com busca — a regra das telas internas: mês
 * nunca num `<select>` comprido nem numa fileira de botões. Desde 11/11/2026
 * (P14) chama-se "Mês", e não "Competência", e sai por extenso ("outubro de
 * 2026"): é como o dono da empresa fala do mês. A chave na URL segue
 * `competencia`, que a tabela e a paginação leem.
 *
 * A empresa saiu do painel em 11/11/2026 (P13): era o terceiro desenho de
 * seletor de empresa do portal. Agora é o mesmo seletor das outras telas
 * (`SeletorDeEmpresaQueNavega`), que troca ao escolher, guarda a escolha e
 * leva o mês junto.
 *
 * Fora do casco, o respiro de baixo é dele (`mb-4`) — não da tabela nem do
 * vazio que vêm depois. Na barra do casco, a barra cuida do espaço.
 */
export function PortalCompetenciaFiltro({ competencias, empresas = [], empresaId, naBarra = false }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const daUrl = params.get("empresa");
  const escolhida = empresaId !== undefined ? empresaId : empresas.some((e) => e.id === daUrl) ? daUrl : null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${naBarra ? "" : "mb-4"}`.trim()}>
      {empresas.length > 1 && (
        <SeletorDeEmpresaQueNavega
          acao={pathname}
          empresas={empresas}
          empresaId={escolhida}
          permitirTodas
          manter={{ competencia: params.get("competencia") }}
          compact={naBarra}
          className=""
        />
      )}
      <FiltrosDaTela
        naBarra={naBarra}
        campos={[
          {
            chave: "competencia",
            rotulo: "Mês",
            vazioLabel: "Todos os meses",
            opcoes: competencias.map((c) => ({ value: c, label: mesPorExtensoDoPortal(c) })),
          },
        ]}
      />
    </div>
  );
}
