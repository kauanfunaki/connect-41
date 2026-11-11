"use client";

import { Fragment } from "react";
import { modeloDoCodigo } from "@/lib/dre/estrutura";
import { linhaAoLongoDoAno, type DreAnual } from "@/lib/dre/anual";
import { rotuloEconomico } from "@/lib/dre/economica";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";
import { RotuloDaCategoria, RotuloDaLinha, useLinhasAbertas } from "@/components/dre/LinhaQueAbre";
import { BotaoDaDica } from "@/components/dre/BotaoDaDica";
import { Accordion } from "@/components/ui/Accordion";
import { Cartao } from "@/components/shared/ListaResponsiva";
import { dicaDaLinha } from "@/lib/dre/dicasDaDre";

const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

type Props = {
  anual: DreAnual;
  /**
   * Competência: as linhas de "caixa" com o nome de leitura de competência
   * (`rotuloEconomico`), como a DRE do mês faz com `comRotulosEconomicos` —
   * o ano inteiro da aba Competência do portal (14/10/2026).
   */
  regime?: "caixa" | "competencia";
  /**
   * A DRE do cliente (11/11/2026): no celular, um cartão por linha em vez da
   * grade de quatorze colunas (P18), e a dica do que é cada linha (P16). A
   * equipe segue com a grade em toda largura.
   */
  noPortal?: boolean;
};

type Linha = ReturnType<typeof modeloDoCodigo>["linhas"][number];

/**
 * As quatorze colunas, com a primeira fixa.
 *
 * A tabela é larga por natureza e rola na horizontal dentro do próprio
 * container — a página nunca rola de lado. O nome da linha fica grudado à
 * esquerda porque, rolando até dezembro, saber de que linha é o número é a
 * única coisa que não pode sumir.
 *
 * As linhas de grupo abrem nas categorias, com os valores nas mesmas quatorze
 * colunas (13/10/2026) — o mesmo abre e fecha da DRE do mês (`LinhaQueAbre`).
 */
export function RelatorioAnual({ anual, regime = "caixa", noPortal = false }: Props) {
  const { aberta, alternar } = useLinhasAbertas();
  const temDetalhe = Object.keys(anual.detalhe).length > 0;
  // As linhas do modelo do DRE da empresa (21/10/2026).
  const LINHAS = modeloDoCodigo(anual.modelo).linhas;
  const rotuloDe = (linha: Linha) => (regime === "competencia" ? rotuloEconomico(linha.code, linha.label) : linha.label);

  const grade = (
    <div className={`overflow-x-auto border border-border rounded-lg bg-surface shadow-xs ${noPortal ? "hidden md:block" : ""}`.trim()}>
      <table className="w-full text-fs-2 border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface-2 text-left font-medium text-micro uppercase tracking-wide text-fg-muted px-3 py-2 border-b border-border min-w-[16rem]">
              Linha
            </th>
            {anual.colunas.map((c, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-right font-medium text-micro uppercase tracking-wide border-b border-border whitespace-nowrap ${
                  c.mes === null ? "bg-surface-2 text-fg" : "bg-surface-2 text-fg-muted"
                }`}
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINHAS.map((linha) => {
            const valores = linhaAoLongoDoAno(anual, linha.code);
            const ehPct = linha.tipo === "percentual";
            const destaque = linha.tipo === "subtotal" && linha.destaque;
            const categorias = linha.tipo === "grupo" ? (anual.detalhe[linha.grupo] ?? []) : [];
            const abrir = linha.tipo === "grupo" && aberta(linha.code);
            const rotulo = rotuloDe(linha);
            // A dica do que é a linha, só no portal (P16). O nome sublinhado em
            // pontinhos avisa que tem explicação; o de grupo é o botão que abre.
            const dica = noPortal ? dicaDaLinha(linha.code) : undefined;

            return (
              <Fragment key={linha.code}>
                <tr className={destaque ? "bg-surface-hover" : ehPct ? "" : "border-t border-border-soft"}>
                  <th
                    scope="row"
                    data-dica={dica}
                    className={`sticky left-0 z-10 text-left px-3 ${ehPct ? "py-0.5" : "py-1.5"} ${
                      destaque
                        ? "bg-surface-hover font-semibold text-fg"
                        : ehPct
                          ? "bg-surface text-micro text-fg-muted font-normal"
                          : "bg-surface font-normal text-fg-secondary"
                    }`}
                  >
                    {temDetalhe && linha.tipo === "grupo" ? (
                      <RotuloDaLinha
                        rotulo={rotulo}
                        categorias={categorias.length}
                        aberta={abrir}
                        onAlternar={() => alternar(linha.code)}
                      />
                    ) : dica ? (
                      <span className="cursor-help underline decoration-dotted decoration-fg-muted underline-offset-2">{rotulo}</span>
                    ) : (
                      rotulo
                    )}
                  </th>
                  {valores.map((v, i) => {
                    const fundo = fundoDaColuna(i);
                    if (ehPct) {
                      return (
                        <td key={i} className={`px-3 py-0.5 text-right text-micro text-fg-muted tabular-nums ${fundo}`}>
                          {v?.fracao === null || v === null ? "—" : PCT.format(v.fracao)}
                        </td>
                      );
                    }
                    const centavos = v?.centavos ?? 0;
                    return (
                      <td
                        key={i}
                        className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${fundo} ${
                          destaque ? "font-semibold" : ""
                        } ${centavos < 0 ? "text-danger" : "text-fg"}`}
                      >
                        <Valor centavos={centavos} />
                      </td>
                    );
                  })}
                </tr>
                {abrir &&
                  categorias.map((c) => (
                    <tr key={`${linha.code}:${c.categoria}`} className="border-t border-border-soft">
                      {/* Fundo opaco na coluna fixa: o que rola por baixo dela
                          não pode aparecer através do nome. */}
                      <th scope="row" className="sticky left-0 z-10 bg-surface-2 text-left font-normal px-3 py-1">
                        <RotuloDaCategoria nome={c.categoria} />
                      </th>
                      {c.valores.map((centavos, i) => (
                        <td
                          key={i}
                          className={`px-3 py-1 text-right tabular-nums whitespace-nowrap ${fundoDaColuna(i)} ${
                            centavos < 0 ? "text-danger" : "text-fg-secondary"
                          }`}
                        >
                          <Valor centavos={centavos} />
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (!noPortal) return grade;

  // No celular (P18): a grade era de quatorze colunas com a primeira de 256px,
  // e o cliente rolava de lado para achar o total. Aqui, um cartão por linha
  // com o que se lê primeiro — o ano e a média, e o percentual das vendas
  // quando a linha tem — e os meses num recolhível que começa fechado. As
  // linhas de percentual entram no cartão da linha delas, e não como cartão.
  const cartoes = LINHAS.filter((l) => l.tipo !== "percentual").map((linha) => {
    const valores = linhaAoLongoDoAno(anual, linha.code);
    const pct = LINHAS.find((p) => p.tipo === "percentual" && p.numerador === linha.code);
    const fracaoDoAno = pct ? (linhaAoLongoDoAno(anual, pct.code)[INDICE_DO_ANO]?.fracao ?? null) : null;
    return { linha, valores, fracaoDoAno };
  });

  return (
    <>
      <ul className="md:hidden flex flex-col gap-2">
        {cartoes.map(({ linha, valores, fracaoDoAno }) => {
          const rotulo = rotuloDe(linha);
          const dica = dicaDaLinha(linha.code);
          const destaque = linha.tipo === "subtotal" && linha.destaque;
          return (
            <li key={linha.code}>
              <Cartao className={destaque ? "border-border-strong" : ""}>
                <div className="flex items-start justify-between gap-2">
                  <p className={`min-w-0 break-words text-ui ${destaque ? "font-semibold text-fg" : "font-medium text-fg-secondary"}`}>{rotulo}</p>
                  {dica && <BotaoDaDica rotulo={rotulo} dica={dica} />}
                </div>
                <dl className={`mt-2 grid gap-2 ${fracaoDoAno !== null ? "grid-cols-3" : "grid-cols-2"}`}>
                  <ParDoCartao rotulo="No ano" centavos={valores[INDICE_DO_ANO]?.centavos ?? 0} forte />
                  <ParDoCartao rotulo="Média por mês" centavos={valores[INDICE_DA_MEDIA]?.centavos ?? 0} />
                  {fracaoDoAno !== null && (
                    <div className="min-w-0">
                      <dt className="text-ui text-fg-muted">Das vendas</dt>
                      <dd className="text-ui tabular-nums text-fg">{PCT.format(fracaoDoAno)}</dd>
                    </div>
                  )}
                </dl>
                <Accordion
                  titulo="Mês a mês"
                  className="mt-2 border-t border-border-soft pt-1"
                  classeDoCabecalho="w-full py-2 text-ui font-medium text-fg-secondary"
                  classeDoConteudo="pb-1"
                >
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {anual.colunas.slice(0, INDICE_DA_MEDIA).map((c, i) => {
                      const centavos = valores[i]?.centavos ?? 0;
                      return (
                        <div key={c.rotulo} className="flex items-baseline justify-between gap-2">
                          <dt className="text-ui text-fg-muted">{c.rotulo}</dt>
                          <dd className={`text-ui tabular-nums ${centavos < 0 ? "text-danger" : "text-fg"}`}>
                            <Valor centavos={centavos} />
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </Accordion>
              </Cartao>
            </li>
          );
        })}
      </ul>
      {grade}
    </>
  );
}

// As duas últimas colunas do ano: média e soma (`montarAnual`).
const INDICE_DA_MEDIA = 12;
const INDICE_DO_ANO = 13;

function ParDoCartao({ rotulo, centavos, forte = false }: { rotulo: string; centavos: number; forte?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ui text-fg-muted">{rotulo}</dt>
      <dd className={`text-ui tabular-nums ${forte ? "font-semibold" : ""} ${centavos < 0 ? "text-danger" : "text-fg"}`}>
        <Valor centavos={centavos} />
      </dd>
    </div>
  );
}

/** Zero vira traço: uma coluna de doze meses com metade zerada vira parede de "R$ 0,00" e some o que importa. */
function Valor({ centavos }: { centavos: number }) {
  return centavos === 0 ? <span className="text-fg-muted">—</span> : <>{moeda(centavos)}</>;
}

/** As duas últimas colunas — média e ano — ganham fundo, para não se perderem. */
function fundoDaColuna(i: number): string {
  return i >= 12 ? "bg-surface-2/60" : "";
}
