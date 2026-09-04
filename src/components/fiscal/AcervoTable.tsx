import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatCalendarDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import {
  TIPO_LABEL,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
  DESTINO_LABEL,
  DESTINO_VARIANTE,
  competenciaLegivel,
} from "@/lib/fiscal/rotulos";
import { direcaoDoLancamento, precisaDeEstorno } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import type { LinhaDoAcervo } from "@/lib/fiscal/data";

type Props = {
  documentos: LinhaDoAcervo[];
  total: number;
  pagina: number;
  porPagina: number;
  /** Filtros da URL, para a paginação não jogá-los fora. */
  filtrosDaUrl: Record<string, string | undefined>;
};

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AcervoTable({ documentos, total, pagina, porPagina, filtrosDaUrl }: Props) {
  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div className="mt-4">
      {/* `table-fixed` + colgroup, e não largura automática: sem isso as colunas
          se recalculam a cada filtro aplicado e a tabela "dança" — foi o mesmo
          defeito corrigido na listagem de empresas em 02/09. */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full table-fixed min-w-[1080px] text-[length:var(--fs-ui)]">
          <colgroup>
            <col className="w-[92px]" />
            <col className="w-[132px]" />
            <col />
            <col className="w-[112px]" />
            <col className="w-[132px]" />
            <col className="w-[96px]" />
            <col className="w-[172px]" />
          </colgroup>
          <thead className="bg-surface-2">
            <tr className="text-[11px] font-medium text-fg-muted uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Tipo</th>
              <th className="px-4 py-2.5 text-left">Número</th>
              <th className="px-4 py-2.5 text-left">Empresa / contraparte</th>
              <th className="px-4 py-2.5 text-left">Emissão</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
              <th className="px-4 py-2.5 text-left">Direção</th>
              <th className="px-4 py-2.5 text-left">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {documentos.map((d) => {
              const doc = documentoDaEmpresa(d.company);
              const direcao = direcaoDoLancamento(doc?.digitos ?? null, {
                emitenteDocumento: d.issuerDocument,
                destinatarioDocumento: d.recipientDocument,
              });
              // A contraparte é o outro lado: se a empresa recebeu, mostra quem
              // emitiu; se emitiu, mostra quem recebeu. Mostrar sempre o
              // emitente faria metade das linhas exibir a própria empresa.
              const contraparte =
                direcao === "PAGAR" ? d.issuerName : direcao === "RECEBER" ? d.recipientName : d.issuerName;
              const estorno = precisaDeEstorno({ situacao: d.situation, destino: d.destination });

              return (
                <tr key={d.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-fg-secondary">{TIPO_LABEL[d.type]}</span>
                  </td>
                  <td className="px-4 py-3 tnum whitespace-nowrap">
                    <Link href={`/documentos-fiscais/${d.id}`} className="text-fg hover:text-brand hover:underline">
                      {d.number}
                      {d.series ? <span className="text-fg-muted">/{d.series}</span> : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-fg truncate">{nomeExibicao(d.company)}</p>
                    <p className="text-[length:var(--fs-micro)] text-fg-muted truncate">{contraparte ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">
                    <p>{formatCalendarDate(d.issuedAt)}</p>
                    <p className="text-[length:var(--fs-micro)] text-fg-muted">{competenciaLegivel(d.competence)}</p>
                  </td>
                  <td className="px-4 py-3 text-right tnum whitespace-nowrap">
                    {/* Linha PARCIAL do índice do SPED vem sem valor. Mostrar
                        R$ 0,00 mentiria sobre uma nota que existe — e zero soma
                        no fechamento. */}
                    {d.amount === null ? (
                      <span className="text-fg-muted" title="Valor não veio do índice do SPED">
                        sem valor
                      </span>
                    ) : (
                      <span className="text-fg">{MOEDA.format(Number(d.amount))}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">
                    {direcao === "PAGAR" ? "A pagar" : direcao === "RECEBER" ? "A receber" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Situação e destino aparecem juntos porque são eixos
                          independentes: "cancelada" + "lançado" é o estado que
                          pede estorno, e some se a tela mostrar só um deles. */}
                      {d.situation === "CANCELADA" && (
                        <Badge variant={SITUACAO_VARIANTE[d.situation]}>{SITUACAO_LABEL[d.situation]}</Badge>
                      )}
                      <Badge variant={DESTINO_VARIANTE[d.destination]}>{DESTINO_LABEL[d.destination]}</Badge>
                      {estorno && (
                        <span className="text-[length:var(--fs-micro)] font-semibold text-danger">estornar</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ultimaPagina > 1 && (
        <div className="flex items-center justify-between mt-3 text-[length:var(--fs-ui)] text-fg-muted">
          <span className="tnum">
            {total} documento{total === 1 ? "" : "s"} · página {pagina} de {ultimaPagina}
          </span>
          <div className="flex items-center gap-2">
            <PaginaLink pagina={pagina - 1} desabilitado={pagina <= 1} filtros={filtrosDaUrl}>
              Anterior
            </PaginaLink>
            <PaginaLink pagina={pagina + 1} desabilitado={pagina >= ultimaPagina} filtros={filtrosDaUrl}>
              Próxima
            </PaginaLink>
          </div>
        </div>
      )}
    </div>
  );
}

// O link carrega os filtros da URL junto. Paginar e perder o filtro é o jeito
// mais rápido de a pessoa achar que os dados sumiram — `query: { pagina }`
// sozinho substituiria a query inteira.
function PaginaLink({
  pagina,
  desabilitado,
  filtros,
  children,
}: {
  pagina: number;
  desabilitado: boolean;
  filtros: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  if (desabilitado) {
    return <span className="px-3 py-1.5 rounded-md border border-border opacity-50">{children}</span>;
  }
  const query: Record<string, string> = { pagina: String(pagina) };
  for (const [k, v] of Object.entries(filtros)) {
    if (k !== "pagina" && v) query[k] = v;
  }
  return (
    <Link
      href={{ query }}
      className="px-3 py-1.5 rounded-md border border-border text-fg hover:bg-surface-hover transition-colors"
    >
      {children}
    </Link>
  );
}
