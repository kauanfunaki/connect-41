import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/Badge";
import { formatCalendarDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { TIPO_LABEL_PORTAL, TIPO_SIGLA_PORTAL, competenciaPorExtenso } from "@/lib/fiscal/rotulos";
import { direcaoDoLancamento } from "@/lib/fiscal/documentos";
import { ladoNoPortal, temPdfNoPortal, type LadoNoPortal } from "@/lib/fiscal/documentoNoPortal";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { BaixarDocumentoFiscal } from "@/components/portal/BaixarDocumentoFiscal";
import type { LinhaDoAcervo } from "@/lib/fiscal/data";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const SEM_ARQUIVO_DICA = "O arquivo desta nota não está guardado no portal. Se precisar dele, peça à equipe.";

/**
 * Venda ou compra, com seta e palavra — nunca só a cor (11/11/2026). A seta
 * diz o sentido da nota: a venda sai da empresa, a compra entra.
 */
function SeloDoLado({ selo }: { selo: LadoNoPortal["selo"] }) {
  if (!selo) return null;
  const venda = selo === "Venda";
  const Icone = venda ? ArrowUpRight : ArrowDownLeft;
  return (
    <Badge variant={venda ? "success" : "info"} className="gap-1">
      <Icone size={12} aria-hidden className="shrink-0" />
      {selo}
    </Badge>
  );
}

/** O tipo em palavras, com a sigla na dica e para o leitor de tela. */
function TipoDaNota({ tipo }: { tipo: LinhaDoAcervo["type"] }) {
  return (
    <span data-dica={TIPO_SIGLA_PORTAL[tipo]}>
      {TIPO_LABEL_PORTAL[tipo]}
      <span className="sr-only"> ({TIPO_SIGLA_PORTAL[tipo]})</span>
    </span>
  );
}

const numeroDaNota = (d: LinhaDoAcervo) => `${d.number}${d.series ? `/${d.series}` : ""}`;

/**
 * A mesma tabela do acervo interno, menos o que é assunto do escritório.
 *
 * Ficam de fora **situação** e **destino**: o cliente não precisa saber que uma
 * nota está "pendente de decisão" no BPO — é trabalho interno, e mostrar isso
 * geraria pergunta sobre um estado que não é dele. O que ele vê é o documento.
 *
 * Desde 11/11/2026, o que o cliente faz com a nota: o selo de venda ou compra,
 * o nome certo da outra ponta ("Cliente" ou "Fornecedor", e não "Fornecedor ou
 * cliente" para todas), o tipo em palavras e o "Baixar" do PDF — só onde há
 * arquivo (`temPdfNoPortal`); onde não há, o motivo no lugar do botão.
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
      lado: ladoNoPortal(direcao),
      contraparte: direcao === "PAGAR" ? d.issuerName : direcao === "RECEBER" ? d.recipientName : d.issuerName,
      temPdf: temPdfNoPortal(d),
      rotuloDoBaixar: `Baixar o PDF: ${TIPO_LABEL_PORTAL[d.type]} nº ${numeroDaNota(d)}`,
    };
  });
  // O cliente sabe quem ele é: o que ele procura numa nota é com quem foi. A
  // empresa dele só aparece quando o acesso cobre mais de uma — até 30/09 toda
  // linha abria com o nome dela, repetido, e a contraparte vinha miúda embaixo.
  const variasEmpresas = new Set(documentos.map((d) => nomeExibicao(d.company))).size > 1;

  return (
    <>
      <CartoesNoCelular>
        {linhas.map(({ d, lado, contraparte, temPdf, rotuloDoBaixar }) => (
          <Cartao key={d.id}>
            <TopoDoCartao
              nome={
                <>
                  <span className="block text-ui font-normal text-fg-muted">{lado.rotuloDaContraparte}</span>
                  {contraparte ?? "—"}
                </>
              }
              valor={d.amount === null ? "—" : MOEDA.format(Number(d.amount))}
            />
            <InfoDoCartao className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 tabular-nums">
              <SeloDoLado selo={lado.selo} />
              <span>
                <TipoDaNota tipo={d.type} /> nº {numeroDaNota(d)}
              </span>
            </InfoDoCartao>
            {variasEmpresas && <InfoDoCartao>{nomeExibicao(d.company)}</InfoDoCartao>}
            <InfoDoCartao className="tabular-nums">
              emitida em {formatCalendarDate(d.issuedAt)} · referente a {competenciaPorExtenso(d.competence)}
            </InfoDoCartao>
            <PeDoCartao>
              {temPdf ? (
                <BaixarDocumentoFiscal id={d.id} rotulo={rotuloDoBaixar} className="max-md:h-11 max-md:px-4 max-md:text-ui" />
              ) : (
                <span className="text-ui text-fg-muted">Sem arquivo no portal. Se precisar dele, peça à equipe.</span>
              )}
            </PeDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {/* Centralizada, como o casco (02/10). Sem funil por coluna: a lista é
          paginada (50 por página), e filtrar só a página na tela enganaria. */}
      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[880px] text-ui">
          <colgroup>
            <col className="w-[156px]" />
            <col className="w-[108px]" />
            <col />
            <col className="w-[148px]" />
            <col className="w-[132px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5">Número</th>
              <th className="px-4 py-2.5">Cliente ou fornecedor</th>
              <th className="px-4 py-2.5">Emissão</th>
              <th className="px-4 py-2.5">Valor</th>
              <th className="px-4 py-2.5">Arquivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {linhas.map(({ d, lado, contraparte, temPdf, rotuloDoBaixar }) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 text-fg-secondary">
                    <div className="flex flex-col items-center gap-1">
                      <SeloDoLado selo={lado.selo} />
                      <TipoDaNota tipo={d.type} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg tnum whitespace-nowrap">
                    {d.number}
                    {d.series ? <span className="text-fg-muted">/{d.series}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-fg truncate" title={contraparte ?? undefined}>
                      {contraparte ?? "—"}
                    </p>
                    <p className="text-micro text-fg-muted truncate">
                      {lado.rotuloDaContraparte}
                      {variasEmpresas ? ` · ${nomeExibicao(d.company)}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">
                    <p>{formatCalendarDate(d.issuedAt)}</p>
                    <p className="text-micro text-fg-muted">{competenciaPorExtenso(d.competence)}</p>
                  </td>
                  <td className="px-4 py-3 tnum whitespace-nowrap">
                    {d.amount === null ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <span className="text-fg">{MOEDA.format(Number(d.amount))}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {temPdf ? (
                      <BaixarDocumentoFiscal id={d.id} rotulo={rotuloDoBaixar} />
                    ) : (
                      // Focável para a dica abrir também no teclado; o motivo inteiro vai junto para o leitor de tela.
                      <span tabIndex={0} data-dica={SEM_ARQUIVO_DICA} className="text-fg-muted rounded-sm focus-visible:outline-2 focus-visible:outline-brand">
                        Sem arquivo
                        <span className="sr-only">: {SEM_ARQUIVO_DICA}</span>
                      </span>
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
  /** Sem `total`, a contagem ainda não chegou (10/11/2026): vale só o "tem próxima". */
  total?: number;
  /** A contagem parou no teto — ver `TETO_DA_CONTAGEM` em src/lib/fiscal/data.ts. */
  totalLimitado?: boolean;
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
  // próxima. Desde 10/11/2026 a contagem só para no teto com busca por texto.
  const ultimaPagina = total === undefined || totalLimitado ? null : Math.max(1, Math.ceil(total / porPagina));

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
