"use client";

import { Fragment } from "react";
import type { DetalheDosGrupos, ValorDaLinha } from "@/lib/dre/calculo";
import type { CodigoDoModelo } from "@/lib/dre/estrutura";
import { MoverCategoria } from "@/components/dre/MoverCategoria";
import { formatarReaisDeCentavos } from "@/lib/format";
import { RotuloDaCategoria, RotuloDaLinha, grupoDaLinha, useLinhasAbertas } from "@/components/dre/LinhaQueAbre";
import { dicaDaLinha } from "@/lib/dre/dicasDaDre";

const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 });

/**
 * A DRE de um período em duas colunas, com as linhas de grupo que abrem nas
 * categorias. De cliente desde 13/10/2026, pelo abre e fecha; quem a usa passa
 * por `RelatorioDoDre`, que manda para cá só as linhas e o detalhe — a fila de
 * classificação não viaja para o navegador do portal.
 */
export function TabelaDaDre({
  linhas,
  detalhe,
  mover,
  dicas = false,
}: {
  linhas: ValorDaLinha[];
  detalhe: DetalheDosGrupos;
  /**
   * Só na equipe (28/10/2026): cada categoria aberta ganha o "Mover", que muda
   * a linha dela nesta empresa. O portal do cliente não manda, e não move.
   */
  mover?: { companyId: string; modelo: CodigoDoModelo };
  /**
   * Só no portal (11/11/2026, como a DRE do ano do cliente): a frase do que é
   * cada linha (`dicaDaLinha`) — o nome sublinhado em pontinhos avisa que tem
   * explicação, a dica abre no toque e no mouse, e o leitor de tela lê a frase
   * junto do nome. A equipe não recebe: a tabela dela fica como está.
   */
  dicas?: boolean;
}) {
  const { aberta, alternar } = useLinhasAbertas();
  // O acumulado da DRE econômica sai de totais por grupo, sem categoria: aí
  // nenhuma linha abre, e o rótulo fica sem o recuo da seta.
  const temDetalhe = Object.keys(detalhe).length > 0;

  return (
    <table className="w-full min-w-[520px] text-ui">
      <tbody>
        {linhas.map((l) => {
          const dica = dicas ? dicaDaLinha(l.code) : undefined;
          if (l.tipo === "percentual") {
            return (
              <tr key={l.code} className="border-b border-border-soft">
                <td data-dica={dica} className="py-1 pl-4 pr-3 text-micro text-fg-muted">
                  {dica ? <RotuloComDica rotulo={l.label} dica={dica} /> : l.label}
                </td>
                <td className="py-1 pr-4 text-right text-micro text-fg-muted tabular-nums">
                  {/* Vazio, e não "0%": a planilha escreve IF(x=0,"") e é a
                      leitura certa — "não dá para calcular" não é zero. */}
                  {l.fracao === null ? "—" : PCT.format(l.fracao)}
                </td>
              </tr>
            );
          }

          const grupo = temDetalhe && l.tipo === "grupo" ? grupoDaLinha(l.code) : null;
          const categorias = grupo ? (detalhe[grupo] ?? []) : [];
          const abrir = grupo !== null && aberta(l.code);
          const negativo = (l.centavos ?? 0) < 0;
          return (
            <Fragment key={l.code}>
              <tr className={l.destaque ? "border-b border-border bg-surface-hover" : "border-b border-border-soft"}>
                <td
                  data-dica={dica}
                  className={`py-2 pl-4 pr-3 ${
                    l.destaque ? "font-semibold text-fg" : l.tipo === "subtotal" ? "font-medium text-fg" : "text-fg-secondary"
                  }`}
                >
                  {/* Na linha de grupo o nome é o botão que abre as categorias,
                      como na DRE do ano: a dica fica na célula, e a frase para
                      o leitor de tela vem depois do botão, fora do nome dele. */}
                  {grupo ? (
                    <>
                      <RotuloDaLinha
                        rotulo={l.label}
                        categorias={categorias.length}
                        aberta={abrir}
                        onAlternar={() => alternar(l.code)}
                      />
                      {dica && <span className="sr-only">. {dica}</span>}
                    </>
                  ) : dica ? (
                    <RotuloComDica rotulo={l.label} dica={dica} />
                  ) : (
                    l.label
                  )}
                </td>
                <td
                  className={`py-2 pr-4 text-right tabular-nums whitespace-nowrap ${l.destaque ? "font-semibold" : ""} ${
                    negativo ? "text-danger" : "text-fg"
                  }`}
                >
                  {formatarReaisDeCentavos(l.centavos ?? 0)}
                </td>
              </tr>
              {abrir &&
                categorias.map((c) => (
                  <tr key={`${l.code}:${c.categoria}`} className="group/linha border-b border-border-soft bg-surface-2/50">
                    <td className="py-1.5 pl-4 pr-3">
                      {mover && grupo ? (
                        <div className="flex items-start justify-between gap-3">
                          <RotuloDaCategoria nome={c.categoria} />
                          <MoverCategoria {...mover} nome={c.categoria} origem={c.origem} grupoAtual={grupo} />
                        </div>
                      ) : (
                        <RotuloDaCategoria nome={c.categoria} />
                      )}
                    </td>
                    <td
                      className={`py-1.5 pr-4 text-right text-fs-2 tabular-nums whitespace-nowrap ${
                        c.centavos < 0 ? "text-danger" : "text-fg-secondary"
                      }`}
                    >
                      {formatarReaisDeCentavos(c.centavos)}
                    </td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * O nome da linha que tem explicação: sublinhado em pontinhos, o mesmo aviso
 * da DRE do ano do portal. A frase vai também para o leitor de tela, que não
 * lê a dica flutuante.
 */
function RotuloComDica({ rotulo, dica }: { rotulo: string; dica: string }) {
  return (
    <>
      <span className="cursor-help underline decoration-dotted decoration-fg-muted underline-offset-2">{rotulo}</span>
      <span className="sr-only">. {dica}</span>
    </>
  );
}
