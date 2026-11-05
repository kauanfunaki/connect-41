import type { PessoaDoGrafico, SemanaDePontos } from "@/lib/tech-interno/produtividade";
import styles from "./Produtividade.module.css";

// Pontos entregues por semana, por pessoa (05/11/2026, a Produtividade da Tech).
// Colunas empilhadas: a altura é o time na semana, cada parte é uma pessoa.
// Server component, SVG/HTML sem lib de gráfico, como os de `shared/Graficos`:
// dica pelo `DicaFlutuante` (`data-dica`), total em cima da coluna, legenda
// com nome e pontos e tabela `sr-only` — a cor nunca é o único lugar do dado.

const NUMERO = new Intl.NumberFormat("pt-BR");
const MAX_SERIES = 6;
const OUTRAS = "__outras";

/** A cor de cada pessoa pela ordem do nome; da 7ª em diante, "Outras pessoas". */
export function seriesDasPessoas(pessoas: PessoaDoGrafico[]) {
  const series = pessoas.slice(0, MAX_SERIES).map((p, i) => ({ chave: p.chave, nome: p.nome, total: p.total, cor: `var(--serie-${i + 1})` }));
  const resto = pessoas.slice(MAX_SERIES);
  if (resto.length) series.push({ chave: OUTRAS, nome: `Outras pessoas (${resto.length})`, total: resto.reduce((s, p) => s + p.total, 0), cor: "var(--serie-outras)" });
  const serieDe = (chave: string) => (series.some((s) => s.chave === chave) ? chave : OUTRAS);
  return { series, serieDe };
}

export function PontosPorSemana({ titulo, semanas, pessoas }: { titulo: string; semanas: SemanaDePontos[]; pessoas: PessoaDoGrafico[] }) {
  const maior = Math.max(0, ...semanas.map((s) => s.total));
  if (maior === 0) return <p className="text-helper text-fg-muted py-1.5">Nenhuma entrega validada com tamanho no período.</p>;
  const { series, serieDe } = seriesDasPessoas(pessoas);
  const partes = (s: SemanaDePontos) => {
    const soma = new Map<string, number>();
    for (const [chave, pontos] of Object.entries(s.porPessoa)) soma.set(serieDe(chave), (soma.get(serieDe(chave)) ?? 0) + pontos);
    return series.map((serie) => ({ ...serie, pontos: soma.get(serie.chave) ?? 0 }));
  };
  // Com muitas semanas, o rótulo embaixo vai de duas em duas; a dica e a tabela têm todas.
  const passo = semanas.length > 9 ? 2 : 1;

  return (
    <div className={`${styles.serie} min-w-0`}>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3" aria-label="Pessoas no gráfico">
          {series.map((s) => (
            <li key={s.chave} className="inline-flex items-center gap-1.5 text-fs-2">
              <span className="size-2.5 mx-0.5 rounded-[3px] flex-shrink-0" style={{ background: s.cor }} aria-hidden />
              <span className="text-fg-secondary">{s.nome}</span>
              <span className="font-medium tnum text-fg">{NUMERO.format(s.total)}</span>
            </li>
          ))}
        </ul>
      )}
      <div aria-hidden>
        <div className="group/colunas flex items-end gap-[3px] h-44 pt-5 border-b border-border">
          {semanas.map((s) => {
            const visiveis = partes(s).filter((p) => p.pontos > 0);
            return (
              <div
                key={s.chave}
                className="group/col flex-1 h-full flex flex-col justify-end items-center min-w-0 transition-opacity duration-150 group-hover/colunas:opacity-45 hover:opacity-100!"
                data-dica={[`${s.rotuloLongo}: ${NUMERO.format(s.total)} pontos`, ...visiveis.map((p) => `${p.nome}: ${NUMERO.format(p.pontos)}`)].join("\n")}
                data-dica-rapida=""
              >
                {s.total > 0 && <span className="shrink-0 text-micro font-medium text-fg-secondary tnum mb-1">{NUMERO.format(s.total)}</span>}
                {/* De baixo para cima, 2px de superfície entre as partes; só a de cima arredonda. */}
                <div className="flex w-full max-w-9 flex-col-reverse gap-[2px]" style={{ height: `${(s.total / maior) * 100}%` }}>
                  {visiveis.map((p, i) => (
                    <span
                      key={p.chave}
                      className={`block w-full min-h-[3px] ${i === visiveis.length - 1 ? "rounded-t-[4px]" : ""}`}
                      style={{ flexGrow: p.pontos, flexBasis: 0, background: p.cor }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-[3px] mt-1.5">
          {semanas.map((s, i) => (
            <span key={s.chave} className="flex-1 min-w-0 text-center text-micro text-fg-muted truncate">
              {i % passo === 0 ? s.rotulo : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="sr-only">
        <table>
          <caption>{titulo}</caption>
          <thead>
            <tr>
              <th scope="col">Semana</th>
              <th scope="col">Total</th>
              {series.map((s) => (
                <th key={s.chave} scope="col">
                  {s.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => (
              <tr key={s.chave}>
                <th scope="row">{s.rotuloLongo}</th>
                <td>{NUMERO.format(s.total)}</td>
                {partes(s).map((p) => (
                  <td key={p.chave}>{NUMERO.format(p.pontos)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
