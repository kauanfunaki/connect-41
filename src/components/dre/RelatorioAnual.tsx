import { LINHAS } from "@/lib/dre/estrutura";
import { linhaAoLongoDoAno, type DreAnual } from "@/lib/dre/anual";
import { moeda } from "./RelatorioDoDre";

const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

type Props = { anual: DreAnual };

/**
 * As quatorze colunas, com a primeira fixa.
 *
 * A tabela é larga por natureza e rola na horizontal dentro do próprio
 * container — a página nunca rola de lado. O nome da linha fica grudado à
 * esquerda porque, rolando até dezembro, saber de que linha é o número é a
 * única coisa que não pode sumir.
 */
export function RelatorioAnual({ anual }: Props) {
  return (
    <div className="overflow-x-auto border border-border rounded-lg bg-surface">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface-2 text-left font-medium text-[11px] uppercase tracking-wide text-fg-muted px-3 py-2 border-b border-border min-w-[16rem]">
              Linha
            </th>
            {anual.colunas.map((c, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-right font-medium text-[11px] uppercase tracking-wide border-b border-border whitespace-nowrap ${
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

            return (
              <tr
                key={linha.code}
                className={destaque ? "bg-surface-hover" : ehPct ? "" : "border-t border-border-soft"}
              >
                <th
                  scope="row"
                  className={`sticky left-0 z-10 text-left px-3 ${ehPct ? "py-0.5" : "py-1.5"} ${
                    destaque
                      ? "bg-surface-hover font-semibold text-fg"
                      : ehPct
                        ? "bg-surface text-[10px] text-fg-muted font-normal"
                        : "bg-surface font-normal text-fg-secondary"
                  }`}
                >
                  {linha.label}
                </th>
                {valores.map((v, i) => {
                  const fundo = fundoDaColuna(i);
                  if (ehPct) {
                    return (
                      <td
                        key={i}
                        className={`px-3 py-0.5 text-right text-[10px] text-fg-muted tabular-nums ${fundo}`}
                      >
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
                      {/* Zero vira traço: uma coluna de doze meses com metade
                          zerada vira parede de "R$ 0,00" e some o que importa. */}
                      {centavos === 0 ? <span className="text-fg-muted">—</span> : moeda(centavos)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** As duas últimas colunas — média e ano — ganham fundo, para não se perderem. */
function fundoDaColuna(i: number): string {
  return i >= 12 ? "bg-surface-2/60" : "";
}
