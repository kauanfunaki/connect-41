import { Pagination } from "@/components/shared/Pagination";
import { formatCalendarDate, formatarCompetencia } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { TIPO_LABEL } from "@/lib/fiscal/rotulos";
import { direcaoDoLancamento } from "@/lib/fiscal/documentos";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
import type { LinhaDoAcervo } from "@/lib/fiscal/data";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A mesma tabela do acervo interno, menos o que é assunto do escritório.
 *
 * Ficam de fora **situação** e **destino**: o cliente não precisa saber que uma
 * nota está "pendente de decisão" no BPO — é trabalho interno, e mostrar isso
 * geraria pergunta sobre um estado que não é dele. O que ele vê é o documento.
 *
 * Dentro do `CascoDaTabela` desde 07/10/2026, como o acervo da equipe: a
 * contagem e o "Filtros" na barra, e a paginação embaixo, fora do casco
 * (`PaginacaoDosDocumentos`).
 */
export function PortalDocumentosTable({ documentos }: { documentos: LinhaDoAcervo[] }) {
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
    <>
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
              emitida em {formatCalendarDate(d.issuedAt)} · {formatarCompetencia(d.competence)}
            </InfoDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {/* Centralizada, como o casco (02/10). Sem funil por coluna: a lista é
          paginada (50 por página), e filtrar só a página na tela enganaria. */}
      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[760px] text-ui">
          <colgroup>
            <col className="w-[88px]" />
            <col className="w-[124px]" />
            <col />
            <col className="w-[124px]" />
            <col className="w-[132px]" />
          </colgroup>
          <thead>
            <tr>
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
                      <p className="text-micro text-fg-muted truncate">{nomeExibicao(d.company)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">
                    <p>{formatCalendarDate(d.issuedAt)}</p>
                    <p className="text-micro text-fg-muted">{formatarCompetencia(d.competence)}</p>
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
    </>
  );
}

type PropsDaPaginacao = {
  total: number;
  /** A contagem parou no teto — ver `TETO_DA_CONTAGEM` em src/lib/fiscal/data.ts. */
  totalLimitado: boolean;
  temProxima: boolean;
  pagina: number;
  porPagina: number;
  filtrosDaUrl: Record<string, string | undefined>;
};

/**
 * A paginação dos documentos, no `shared/Pagination` (07/10/2026): ele passou a
 * aceitar a última página desconhecida (`temProxima`), que era o motivo de o
 * portal ter uma cópia própria.
 */
export function PaginacaoDosDocumentos({ total, totalLimitado, temProxima, pagina, porPagina, filtrosDaUrl }: PropsDaPaginacao) {
  // Com a contagem no teto não se sabe qual é a última página — só se existe a
  // próxima. Quem tem mais de mil documentos navega pela competência.
  const ultimaPagina = totalLimitado ? null : Math.max(1, Math.ceil(total / porPagina));

  // O link leva os filtros da URL junto: paginar e perder a competência faria
  // a lista parecer outra.
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filtrosDaUrl)) {
      if (k !== "pagina" && v) q.set(k, v);
    }
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/portal/documentos?${s}` : "/portal/documentos";
  };

  return (
    <Pagination
      page={pagina}
      totalPages={ultimaPagina ?? undefined}
      temProxima={temProxima}
      buildHref={hrefDaPagina}
      total={total}
      totalAproximado={totalLimitado}
      rotulo="documentos"
    />
  );
}
