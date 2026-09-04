import Link from "next/link";
import { formatCalendarDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { TIPO_LABEL, competenciaLegivel } from "@/lib/fiscal/rotulos";
import { direcaoDoLancamento } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import type { LinhaDoAcervo } from "@/lib/fiscal/data";

type Props = {
  documentos: LinhaDoAcervo[];
  total: number;
  pagina: number;
  porPagina: number;
  filtrosDaUrl: Record<string, string | undefined>;
};

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A mesma tabela do acervo interno, menos o que é assunto do escritório.
 *
 * Ficam de fora **situação** e **destino**: o cliente não precisa saber que uma
 * nota está "pendente de decisão" no BPO — é trabalho interno, e mostrar isso
 * geraria pergunta sobre um estado que não é dele. O que ele vê é o documento.
 */
export function PortalDocumentosTable({ documentos, total, pagina, porPagina, filtrosDaUrl }: Props) {
  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div className="mt-4">
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full table-fixed min-w-[760px] text-[length:var(--fs-ui)]">
          <colgroup>
            <col className="w-[88px]" />
            <col className="w-[124px]" />
            <col />
            <col className="w-[124px]" />
            <col className="w-[132px]" />
          </colgroup>
          <thead className="bg-surface-2">
            <tr className="text-[11px] font-medium text-fg-muted uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Tipo</th>
              <th className="px-4 py-2.5 text-left">Número</th>
              <th className="px-4 py-2.5 text-left">Empresa / contraparte</th>
              <th className="px-4 py-2.5 text-left">Emissão</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {documentos.map((d) => {
              const doc = documentoDaEmpresa(d.company);
              const direcao = direcaoDoLancamento(doc?.digitos ?? null, {
                emitenteDocumento: d.issuerDocument,
                destinatarioDocumento: d.recipientDocument,
              });
              const contraparte =
                direcao === "PAGAR" ? d.issuerName : direcao === "RECEBER" ? d.recipientName : d.issuerName;

              return (
                <tr key={d.id}>
                  <td className="px-4 py-3 text-fg-secondary">{TIPO_LABEL[d.type]}</td>
                  <td className="px-4 py-3 text-fg tnum whitespace-nowrap">
                    {d.number}
                    {d.series ? <span className="text-fg-muted">/{d.series}</span> : null}
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
                    {d.amount === null ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <span className="text-fg">{MOEDA.format(Number(d.amount))}</span>
                    )}
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
            <Pagina n={pagina - 1} desabilitado={pagina <= 1} filtros={filtrosDaUrl}>
              Anterior
            </Pagina>
            <Pagina n={pagina + 1} desabilitado={pagina >= ultimaPagina} filtros={filtrosDaUrl}>
              Próxima
            </Pagina>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagina({
  n,
  desabilitado,
  filtros,
  children,
}: {
  n: number;
  desabilitado: boolean;
  filtros: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  if (desabilitado) {
    return <span className="px-3 py-1.5 rounded-md border border-border opacity-50">{children}</span>;
  }
  const query: Record<string, string> = { pagina: String(n) };
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
