import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCalendarDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { TIPO_LABEL, competenciaLegivel } from "@/lib/fiscal/rotulos";
import { direcaoDoLancamento } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
import type { LinhaDoAcervo } from "@/lib/fiscal/data";

type Props = {
  documentos: LinhaDoAcervo[];
  total: number;
  /** A contagem parou no teto — ver `TETO_DA_CONTAGEM` em src/lib/fiscal/data.ts. */
  totalLimitado: boolean;
  temProxima: boolean;
  pagina: number;
  porPagina: number;
  filtrosDaUrl: Record<string, string | undefined>;
};

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const INTEIRO = new Intl.NumberFormat("pt-BR");

/**
 * A mesma tabela do acervo interno, menos o que é assunto do escritório.
 *
 * Ficam de fora **situação** e **destino**: o cliente não precisa saber que uma
 * nota está "pendente de decisão" no BPO — é trabalho interno, e mostrar isso
 * geraria pergunta sobre um estado que não é dele. O que ele vê é o documento.
 */
export function PortalDocumentosTable({ documentos, total, totalLimitado, temProxima, pagina, porPagina, filtrosDaUrl }: Props) {
  // Com a contagem no teto não se sabe qual é a última página — só se existe a
  // próxima. Quem tem mais de mil documentos navega pela competência.
  const ultimaPagina = totalLimitado ? null : Math.max(1, Math.ceil(total / porPagina));
  const temPaginas = ultimaPagina === null || ultimaPagina > 1;
  // A contraparte sai da direção do lançamento, e a direção sai do documento da
  // empresa: calculada uma vez, serve ao cartão e à tabela.
  const linhas = documentos.map((d) => {
    const doc = documentoDaEmpresa(d.company);
    const direcao = direcaoDoLancamento(doc?.digitos ?? null, {
      emitenteDocumento: d.issuerDocument,
      destinatarioDocumento: d.recipientDocument,
    });
    return {
      d,
      contraparte: direcao === "PAGAR" ? d.issuerName : direcao === "RECEBER" ? d.recipientName : d.issuerName,
    };
  });
  // O cliente sabe quem ele é: o que ele procura numa nota é com quem foi. A
  // empresa dele só aparece quando o acesso cobre mais de uma — até 30/09 toda
  // linha abria com o nome dela, repetido, e a contraparte vinha miúda embaixo.
  const variasEmpresas = new Set(documentos.map((d) => nomeExibicao(d.company))).size > 1;

  return (
    <div>
      <CartoesNoCelular>
        {linhas.map(({ d, contraparte }) => (
          <Cartao key={d.id}>
            <TopoDoCartao nome={contraparte ?? "—"} valor={d.amount === null ? "—" : MOEDA.format(Number(d.amount))} />
            <InfoDoCartao className="tabular-nums">
              {TIPO_LABEL[d.type]} nº {d.number}
              {d.series ? `/${d.series}` : ""}
            </InfoDoCartao>
            {variasEmpresas && <InfoDoCartao>{nomeExibicao(d.company)}</InfoDoCartao>}
            <InfoDoCartao className="tabular-nums">
              emitida em {formatCalendarDate(d.issuedAt)} · {competenciaLegivel(d.competence)}
            </InfoDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {/* Centralizada, como o casco (02/10). Sem funil por coluna: a lista é
          paginada (50 por página), e filtrar só a página na tela enganaria. */}
      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[760px] text-[length:var(--fs-ui)]">
          <colgroup>
            <col className="w-[88px]" />
            <col className="w-[124px]" />
            <col />
            <col className="w-[124px]" />
            <col className="w-[132px]" />
          </colgroup>
          <thead>
            <tr className="text-[length:var(--fs-micro)] font-medium text-fg-muted uppercase tracking-wide">
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5">Número</th>
              <th className="px-4 py-2.5">Fornecedor ou cliente</th>
              <th className="px-4 py-2.5">Emissão</th>
              <th className="px-4 py-2.5">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {linhas.map(({ d, contraparte }) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 text-fg-secondary">{TIPO_LABEL[d.type]}</td>
                  <td className="px-4 py-3 text-fg tnum whitespace-nowrap">
                    {d.number}
                    {d.series ? <span className="text-fg-muted">/{d.series}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-fg truncate" title={contraparte ?? undefined}>
                      {contraparte ?? "—"}
                    </p>
                    {variasEmpresas && (
                      <p className="text-[length:var(--fs-micro)] text-fg-muted truncate">{nomeExibicao(d.company)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">
                    <p>{formatCalendarDate(d.issuedAt)}</p>
                    <p className="text-[length:var(--fs-micro)] text-fg-muted">{competenciaLegivel(d.competence)}</p>
                  </td>
                  <td className="px-4 py-3 tnum whitespace-nowrap">
                    {d.amount === null ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <span className="text-fg">{MOEDA.format(Number(d.amount))}</span>
                    )}
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>

      {/* O desenho do shared/Pagination (botões `sm` com seta, mesma distância da
          tabela), que não serve direto aqui porque a última página pode não
          ser conhecida. Eram links de `py-1.5` feitos à mão, e no celular o
          texto e os botões disputavam uma linha só. */}
      {temPaginas && (
        <nav className="flex flex-wrap items-center justify-between gap-3 mt-4" aria-label="Paginação">
          <span className="text-[length:var(--fs-ui)] text-fg-muted tnum">
            {ultimaPagina === null
              ? `mais de ${INTEIRO.format(total)} documentos · página ${pagina}`
              : `${total} documento${total === 1 ? "" : "s"} · página ${pagina} de ${ultimaPagina}`}
          </span>
          <div className="flex gap-1.5">
            <Pagina n={pagina - 1} desabilitado={pagina <= 1} filtros={filtrosDaUrl}>
              <ChevronLeft size={14} /> Anterior
            </Pagina>
            <Pagina n={pagina + 1} desabilitado={!temProxima} filtros={filtrosDaUrl}>
              Próxima <ChevronRight size={14} />
            </Pagina>
          </div>
        </nav>
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
    return (
      <Button variant="secondary" size="sm" disabled>
        {children}
      </Button>
    );
  }
  const query = new URLSearchParams({ pagina: String(n) });
  for (const [k, v] of Object.entries(filtros)) {
    if (k !== "pagina" && v) query.set(k, v);
  }
  // Só a query, como o `href={{ query }}` de antes: a página segue a mesma.
  return (
    <Button href={`?${query.toString()}`} variant="secondary" size="sm">
      {children}
    </Button>
  );
}
