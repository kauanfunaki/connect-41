import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/shared/Pagination";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
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

type PropsDaPaginacao = {
  total: number;
  /** A contagem parou no teto — ver `TETO_DA_CONTAGEM` em src/lib/fiscal/data.ts. */
  totalLimitado: boolean;
  temProxima: boolean;
  pagina: number;
  porPagina: number;
  /** Filtros da URL, para a paginação não jogá-los fora. */
  filtrosDaUrl: Record<string, string | undefined>;
};

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O acervo: tabela no computador, cartões no celular.
 *
 * No casco padrão do Connect desde o polimento de 30/09 (centralizada, cabeçalho
 * com fundo). **Sem funil por coluna**, de propósito: o acervo é paginado, e o
 * funil de tabela paginada (`FiltroDaColunaNaUrl`) conta os valores com
 * `groupBy` na base inteira — contar tudo nesta tabela é o que levava 90 s (ver
 * `TETO_DA_CONTAGEM`). Tipo e destino continuam no botão "Filtros", e o
 * destino também nos cartões do topo.
 *
 * Dentro do `CascoDaTabela` desde 07/10/2026; a paginação fica fora do casco,
 * como nas outras listas (`PaginacaoDoAcervo`).
 */
export function AcervoTable({ documentos }: { documentos: LinhaDoAcervo[] }) {
  const linhas = documentos.map((d) => {
    const doc = documentoDaEmpresa(d.company);
    const direcao = direcaoDoLancamento(doc?.digitos ?? null, {
      emitenteDocumento: d.issuerDocument,
      destinatarioDocumento: d.recipientDocument,
    });
    // A contraparte é o outro lado: se a empresa recebeu, mostra quem
    // emitiu; se emitiu, mostra quem recebeu. Mostrar sempre o
    // emitente faria metade das linhas exibir a própria empresa.
    const contraparte = direcao === "PAGAR" ? d.issuerName : direcao === "RECEBER" ? d.recipientName : d.issuerName;
    return {
      d,
      contraparte,
      direcao: direcao === "PAGAR" ? "A pagar" : direcao === "RECEBER" ? "A receber" : "—",
      estorno: precisaDeEstorno({ situacao: d.situation, destino: d.destination }),
    };
  });

  // Linha PARCIAL do índice do SPED vem sem valor. Mostrar R$ 0,00 mentiria
  // sobre uma nota que existe — e zero soma no fechamento.
  const valor = (d: LinhaDoAcervo) =>
    d.amount === null ? (
      <span className="text-fg-muted font-normal" title="Valor não veio do índice do SPED">
        sem valor
      </span>
    ) : (
      MOEDA.format(Number(d.amount))
    );

  // Situação e destino aparecem juntos porque são eixos independentes:
  // "cancelada" + "lançado" é o estado que pede estorno, e some se a tela
  // mostrar só um deles.
  const selos = (d: LinhaDoAcervo, estorno: boolean) => (
    <>
      {d.situation === "CANCELADA" && <Badge variant={SITUACAO_VARIANTE[d.situation]}>{SITUACAO_LABEL[d.situation]}</Badge>}
      <Badge variant={DESTINO_VARIANTE[d.destination]}>{DESTINO_LABEL[d.destination]}</Badge>
      {estorno && <span className="text-[length:var(--fs-micro)] font-semibold text-danger">estornar</span>}
    </>
  );

  const numero = (d: LinhaDoAcervo) => (
    <Link href={`/documentos-fiscais/${d.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
      {d.number}
      {d.series ? <span className="text-fg-muted font-normal">/{d.series}</span> : null}
    </Link>
  );

  return (
    <>
      <CartoesNoCelular>
        {linhas.map(({ d, contraparte, direcao, estorno }) => (
          <Cartao key={d.id}>
            <TopoDoCartao
              nome={
                <>
                  <span className="text-fg-muted font-normal">{TIPO_LABEL[d.type]} </span>
                  {numero(d)}
                </>
              }
              valor={valor(d)}
            />
            <InfoDoCartao>
              {nomeExibicao(d.company)} · {contraparte ?? "—"}
            </InfoDoCartao>
            <InfoDoCartao>
              {formatCalendarDate(d.issuedAt)} · {competenciaLegivel(d.competence)} · {direcao}
            </InfoDoCartao>
            <PeDoCartao>{selos(d, estorno)}</PeDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {/* `table-fixed` + colgroup, e não largura automática: sem isso as colunas
          se recalculam a cada filtro aplicado e a tabela "dança" — foi o mesmo
          defeito corrigido na listagem de empresas em 02/09. */}
      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[1080px] text-[length:var(--fs-ui)]">
          <colgroup>
            <col className="w-[92px]" />
            <col className="w-[132px]" />
            <col />
            <col className="w-[112px]" />
            <col className="w-[132px]" />
            <col className="w-[104px]" />
            <col className="w-[172px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Empresa / contraparte</th>
              <th className="px-4 py-3">Emissão</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Direção</th>
              <th className="px-4 py-3">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ d, contraparte, direcao, estorno }) => (
              <tr key={d.id} className="border-b border-border">
                <td className="px-4 py-3 text-fg-secondary">{TIPO_LABEL[d.type]}</td>
                <td className="px-4 py-3 tnum whitespace-nowrap">{numero(d)}</td>
                <td className="px-4 py-3 min-w-0">
                  <span className="block text-fg truncate" title={nomeExibicao(d.company)}>
                    {nomeExibicao(d.company)}
                  </span>
                  <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate" title={contraparte ?? undefined}>
                    {contraparte ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">
                  <span className="block">{formatCalendarDate(d.issuedAt)}</span>
                  <span className="block text-[length:var(--fs-micro)] text-fg-muted">{competenciaLegivel(d.competence)}</span>
                </td>
                <td className="px-4 py-3 tnum whitespace-nowrap text-fg">{valor(d)}</td>
                <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">{direcao}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">{selos(d, estorno)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
    </>
  );
}

export function PaginacaoDoAcervo({ total, totalLimitado, temProxima, pagina, porPagina, filtrosDaUrl }: PropsDaPaginacao) {
  // Com a contagem no teto não se sabe qual é a última página — só se existe a
  // próxima. Com filtro de empresa e competência ela volta a ser exata.
  const ultimaPagina = totalLimitado ? null : Math.max(1, Math.ceil(total / porPagina));

  // O link carrega os filtros da URL junto. Paginar e perder o filtro é o jeito
  // mais rápido de a pessoa achar que os dados sumiram.
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filtrosDaUrl)) {
      if (k !== "pagina" && v) q.set(k, v);
    }
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/documentos-fiscais?${s}` : "/documentos-fiscais";
  };

  // Contagem no teto: sem a última página, vale o "tem próxima" e o total sai
  // como "mais de N".
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
