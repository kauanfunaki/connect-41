"use client";

import { Fragment } from "react";
import { LINHAS } from "@/lib/dre/estrutura";
import { linhaAoLongoDoAno, type DreAnual } from "@/lib/dre/anual";
import { rotuloEconomico } from "@/lib/dre/economica";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";
import { RotuloDaCategoria, RotuloDaLinha, useLinhasAbertas } from "@/components/dre/LinhaQueAbre";

const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

type Props = {
  anual: DreAnual;
  /**
   * Competência: as linhas de "caixa" com o nome de leitura de competência
   * (`rotuloEconomico`), como a DRE do mês faz com `comRotulosEconomicos` —
   * o ano inteiro da aba Competência do portal (14/10/2026).
   */
  regime?: "caixa" | "competencia";
};

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
export function RelatorioAnual({ anual, regime = "caixa" }: Props) {
  const { aberta, alternar } = useLinhasAbertas();
  const temDetalhe = Object.keys(anual.detalhe).length > 0;

  return (
    <div className="overflow-x-auto border border-border rounded-lg bg-surface">
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
            const rotulo = regime === "competencia" ? rotuloEconomico(linha.code, linha.label) : linha.label;

            return (
              <Fragment key={linha.code}>
                <tr className={destaque ? "bg-surface-hover" : ehPct ? "" : "border-t border-border-soft"}>
                  <th
                    scope="row"
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
}

/** Zero vira traço: uma coluna de doze meses com metade zerada vira parede de "R$ 0,00" e some o que importa. */
function Valor({ centavos }: { centavos: number }) {
  return centavos === 0 ? <span className="text-fg-muted">—</span> : <>{moeda(centavos)}</>;
}

/** As duas últimas colunas — média e ano — ganham fundo, para não se perderem. */
function fundoDaColuna(i: number): string {
  return i >= 12 ? "bg-surface-2/60" : "";
}
