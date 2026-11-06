"use client";

import { Download } from "lucide-react";
import { numeroCurto } from "@/components/shared/Graficos";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import {
  CABECALHO,
  CABECALHO_NUMERO,
  CELULA,
  CELULA_NUMERO,
  PAINEL,
  ROLAGEM_DA_TABELA,
  ROTULO,
  TABELA,
  TEXTO_DE_APOIO,
  TITULO_DO_PAINEL,
} from "@/components/tributario/estilos";
import { brl } from "@/lib/tributario/motor/fiscal";

// Portado do `TransitionChart` do Connect Tributário (05/11/2026). O original
// desenhava com o recharts, que o Connect não tem: aqui é SVG à mão, no jeito
// dos gráficos de `shared/Graficos.tsx` — o SVG estica na largura
// (`preserveAspectRatio="none"`, traço que não escala) e o que não pode
// deformar (pontos, rótulos, grade, a marca do ano) é HTML posicionado em %.
// Mesmos dados, mesmos textos e a mesma tabela de valores do original.

/**
 * A cor de cada regime, na ordem dos cartões (Simples Nacional, Simples
 * híbrido, Lucro Presumido, Lucro Real) — a cor segue o regime, nunca a
 * posição dele no ranking. Tokens do tema; os quatro tons do original (três
 * azuis e um roxo) não passavam no validador do método de dataviz (azul ×
 * roxo ΔE 5,5 para daltonismo, o marinho sumia no escuro). Estes passam em
 * todos os pares, no claro e no escuro (ΔE ≥ 12 para daltonismo, ≥ 16,4 em
 * visão normal); o índigo fica a 2,25:1 sobre o cartão escuro, aceito porque
 * a legenda, a dica e as tabelas (a visível e a `sr-only`) levam os números.
 */
export const CORES_DOS_REGIMES = [
  "var(--c41-brand-400)",
  "var(--c41-sector-contabil)",
  "var(--c41-sector-financeiro)",
  "var(--c41-sector-comercial)",
] as const;

const corDoRegime = (i: number): string => CORES_DOS_REGIMES[i] ?? "var(--c41-grafico-neutro)";

/** "R$ 1,2 mi" — o eixo do original; o valor exato fica na dica e nas tabelas. */
const moedaCurta = (v: number) => `R$ ${numeroCurto(v)}`;

/** Escala "redonda" do eixo, a partir do zero (o `domain={[0,'auto']}` do original). */
function escalaDoEixo(valores: number[]): { min: number; max: number; marcas: number[] } {
  const maior = Math.max(0, ...valores);
  const menor = Math.min(0, ...valores);
  if (maior === menor) return { min: 0, max: 1, marcas: [0] };
  const bruto = (maior - menor) / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  const min = Math.floor(menor / passo) * passo;
  const max = Math.ceil(maior / passo) * passo;
  const quantas = Math.round((max - min) / passo);
  return { min, max, marcas: Array.from({ length: quantas + 1 }, (_, k) => min + k * passo) };
}

/** Uma linha por trecho contínuo: valor ausente abre um vão, não vira zero. */
function tracado(pontos: (number | null)[], x: (j: number) => number, y: (v: number) => number): string {
  let caminho = "";
  let emTrecho = false;
  pontos.forEach((v, j) => {
    if (v === null) {
      emTrecho = false;
      return;
    }
    caminho += `${emTrecho ? "L" : "M"}${x(j).toFixed(2)},${y(v).toFixed(2)} `;
    emTrecho = true;
  });
  return caminho.trim();
}

export function GraficoDaTransicao({
  rows,
  labels,
  exclusions,
  year,
  onYear,
  valid,
  onExport,
  includesPayroll = false,
}: {
  includesPayroll?: boolean;
  rows: { year: number; values: (number | null)[] }[];
  labels: string[];
  exclusions: (string | null)[];
  year: number;
  onYear: (year: string) => void;
  valid: boolean;
  onExport: () => void;
}) {
  // A mesma regra do original para o gráfico e para a tabela: fora do escopo,
  // cenário inválido ou valor não finito não desenha nem escreve número.
  const disponivel = (v: number | null | undefined, i: number): number | null =>
    valid && !exclusions[i] && v !== null && v !== undefined && Number.isFinite(v) ? v : null;

  const series = labels.map((_, i) => rows.map((row) => disponivel(row.values[i], i)));
  const { min, max, marcas } = escalaDoEixo(series.flat().filter((v): v is number => v !== null));
  const n = Math.max(rows.length, 1);
  const x = (j: number) => ((j + 0.5) / n) * 100;
  const y = (v: number) => (1 - (v - min) / (max - min)) * 100;
  const indiceDoAno = rows.findIndex((row) => row.year === year);

  const descricao = `Evolução anual dos tributos${includesPayroll ? " e encargos" : ""} de 2027 a 2033`;
  const dicaDoAno = (j: number, ano: number) =>
    [
      `Projeção ${ano}`,
      ...labels.flatMap((label, i) => {
        const v = series[i]?.[j] ?? null;
        return v === null ? [] : [`${label}: ${brl(v)}`];
      }),
    ].join("\n");

  return (
    <section className={PAINEL}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={ROTULO}>EVOLUÇÃO DA CARGA</p>
          <h2 className={TITULO_DO_PAINEL}>Transição tributária</h2>
        </div>
        <IconButton title="Exportar projeções em CSV" disabled={!valid} onClick={onExport}>
          <Download size={17} aria-hidden />
        </IconButton>
      </div>

      {/* Legenda — a amostra é um traço curto, como a linha. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {labels.map((label, i) => (
          <li key={i} className={`inline-flex items-center gap-1.5 text-fs-2 ${exclusions[i] ? "opacity-55" : ""}`}>
            <span className="h-[3px] w-4 flex-shrink-0 rounded-full" style={{ background: corDoRegime(i) }} aria-hidden />
            <span className="text-fg-secondary">
              {label.replace(" • " + year, "")}
              {exclusions[i] ? " · fora do escopo" : ""}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex gap-2" aria-hidden>
        {/* Eixo dos valores. */}
        <div className="relative h-64 w-16 flex-shrink-0">
          {marcas.map((m) => (
            <span
              key={m}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-micro text-fg-muted tnum"
              style={{ top: `${y(m)}%` }}
            >
              {moedaCurta(m)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Uma faixa por ano, por baixo do desenho: a dica com os valores do
              ano e o clique que escolhe o ano (o teclado usa o seletor abaixo). */}
          {rows.map((row, j) => (
            <button
              key={row.year}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onYear(String(row.year))}
              className="absolute inset-y-0 cursor-pointer rounded-sm transition-colors hover:bg-surface-hover"
              style={{ left: `${(j / n) * 100}%`, width: `${100 / n}%` }}
              data-dica={dicaDoAno(j, row.year)}
              data-dica-rapida=""
            />
          ))}

          <div className="pointer-events-none relative h-64">
            {marcas.map((m) => (
              <span
                key={m}
                className={`absolute inset-x-0 border-t ${m === 0 ? "border-border-strong" : "border-border"}`}
                style={{ top: `${y(m)}%` }}
              />
            ))}
            {indiceDoAno >= 0 && (
              <span
                className="absolute inset-y-0 border-l border-dashed border-border-strong"
                style={{ left: `${x(indiceDoAno)}%` }}
              />
            )}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              {series.map((pontos, i) => (
                <path
                  key={i}
                  d={tracado(pontos, x, y)}
                  fill="none"
                  style={{ stroke: corDoRegime(i) }}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {series.map((pontos, i) =>
              pontos.map((v, j) =>
                v === null ? null : (
                  <span
                    key={`${i}-${j}`}
                    className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
                    style={{
                      left: `${x(j)}%`,
                      top: `${y(v)}%`,
                      borderColor: corDoRegime(i),
                      // No ano escolhido o ponto vem cheio.
                      background: j === indiceDoAno ? corDoRegime(i) : undefined,
                    }}
                  />
                )
              )
            )}
          </div>

          <div className="pointer-events-none mt-2 flex">
            {rows.map((row) => (
              <span
                key={row.year}
                className={`flex-1 text-center text-micro tnum ${row.year === year ? "font-semibold text-fg" : "text-fg-muted"}`}
              >
                {row.year}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Os mesmos números do desenho, para o leitor de tela. `sr-only` no
          invólucro, não na tabela (ver `TabelaOculta` em Graficos.tsx). */}
      <div className="sr-only">
        <table>
          <caption>{descricao}</caption>
          <thead>
            <tr>
              <th scope="col">Ano</th>
              {labels.map((l, i) => (
                <th key={i} scope="col">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, j) => (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                {labels.map((_, i) => {
                  const v = series[i]?.[j] ?? null;
                  return <td key={i}>{v === null ? "—" : brl(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select
          compact
          aria-label="Selecionar ano da projeção"
          className="w-28 flex-shrink-0"
          value={String(year)}
          onChange={(e) => onYear(e.target.value)}
        >
          {rows.map((row) => (
            <option key={row.year} value={String(row.year)}>
              {row.year}
            </option>
          ))}
        </Select>
        <p className={`min-w-0 flex-1 ${TEXTO_DE_APOIO}`}>Receita e premissas constantes. Selecione o ano para atualizar o comparativo.</p>
      </div>

      <BlocoRecolhivel titulo="Ver valores da projeção" classeDoConteudo="pb-2">
        <div className={ROLAGEM_DA_TABELA}>
          <table className={TABELA}>
            <thead>
              <tr>
                <th scope="col" className={CABECALHO}>
                  Ano
                </th>
                {labels.map((l, i) => (
                  <th key={i} scope="col" className={CABECALHO_NUMERO}>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.year}>
                  <td className={`${CELULA} tnum`}>{row.year}</td>
                  {row.values.map((v, i) => {
                    const valor = disponivel(v, i);
                    return (
                      <td key={i} className={CELULA_NUMERO}>
                        {valor === null ? "—" : brl(valor)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BlocoRecolhivel>
    </section>
  );
}
