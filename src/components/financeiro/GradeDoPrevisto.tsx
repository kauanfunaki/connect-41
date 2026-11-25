"use client";

// A grade do Previsto (25/11/2026, funcionalidade-837): as linhas do fluxo
// direto nas linhas e os períodos nas colunas, como a planilha de 13 semanas
// do cliente. Os grupos começam fechados, com o total na linha (a regra do
// recolhível); abrem nas linhas do fluxo, e cada linha nas categorias do
// cliente. A primeira coluna fica grudada à esquerda, como no DRE do ano: a
// grade rola de lado dentro dela, nunca a página.
//
// Cada valor é um link para as contas daquela célula (`celula=` no endereço):
// a soma delas é o número que a pessoa clicou.

import { Fragment } from "react";
import Link from "next/link";
import { RotuloDaCategoria, RotuloDaLinha, useLinhasAbertas } from "@/components/dre/LinhaQueAbre";
import { celulaParaTexto, type Celula, type Previsto } from "@/lib/fluxoDeCaixa/projecao";

const REAIS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Em reais, sem centavos (o cabeçalho diz "R$"); zero vira um traço. */
function valor(centavos: number): string {
  const r = Math.round(centavos / 100);
  return r === 0 ? "—" : REAIS.format(r).replace("-", "−");
}

type Props = {
  previsto: Previsto;
  /** O endereço da tela com a visão e a empresa; a célula entra como `&celula=`. */
  base: string;
  /** A célula aberta agora, como texto. */
  celulaAtiva: string | null;
};

export function GradeDoPrevisto({ previsto, base, celulaAtiva }: Props) {
  const { aberta, alternar } = useLinhasAbertas();
  const { periodos, grupos } = previsto;

  // Funções que devolvem as células, e não componentes declarados aqui dentro:
  // componente criado a cada render remontaria a linha inteira a cada clique.
  function celulas(celula: Omit<Celula, "periodo">, centavos: number[], { forte = false, apoio = false } = {}) {
    return (
      <>
        {periodos.map((p, i) => {
          const c = centavos[i] ?? 0;
          const texto = celulaParaTexto({ ...celula, periodo: p.chave } as Celula);
          const ativa = celulaAtiva === texto;
          const cor = c < 0 ? "text-danger" : c === 0 ? "text-fg-muted" : apoio ? "text-fg-secondary" : "text-fg";
          return (
            <td key={p.chave} className={`px-2 py-0 text-right tabular-nums whitespace-nowrap ${forte ? "font-semibold" : ""}`}>
              {c === 0 ? (
                <span className={`block px-1 py-1.5 ${cor}`}>—</span>
              ) : (
                <Link
                  href={`${base}&celula=${encodeURIComponent(texto)}`}
                  scroll={false}
                  aria-label={`Ver as contas: ${valor(c)} reais, ${p.rotulo}`}
                  className={`block rounded px-1 py-1.5 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${cor} ${
                    ativa ? "ring-2 ring-brand/60 bg-brand-subtle" : ""
                  }`}
                >
                  {valor(c)}
                </Link>
              )}
            </td>
          );
        })}
      </>
    );
  }

  function linhaDeSaldo(rotulo: string, valores: number[], final = false) {
    return (
      <tr className={final ? "border-t-2 border-border-strong" : "border-b border-border"}>
        <th scope="row" className={`sticky left-0 z-10 text-left px-3 py-2 ${final ? "bg-surface-hover font-semibold text-fg" : "bg-surface font-normal text-fg-secondary"}`}>
          {rotulo}
        </th>
        {valores.map((v, i) => (
          <td
            key={periodos[i]!.chave}
            className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${final ? "font-semibold" : ""} ${
              v < 0 ? "text-danger" : "text-fg"
            } ${final ? (v < 0 ? "bg-danger-bg" : "bg-surface-hover") : ""}`}
          >
            {valor(v)}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div className="overflow-x-auto border border-border rounded-lg bg-surface shadow-xs">
      <table className="w-full text-fs-2 border-collapse">
        <caption className="sr-only">
          Fluxo de caixa previsto por {previsto.granularidade === "dias" ? "dia" : previsto.granularidade === "semanas" ? "semana" : "mês"}, em reais
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-20 bg-surface-2 text-left font-medium text-micro uppercase tracking-wide text-fg-muted px-3 py-2 border-b border-border min-w-[15rem]">
              R$
            </th>
            {periodos.map((p) => (
              <th key={p.chave} scope="col" className="px-3 py-2 text-right font-medium text-micro uppercase tracking-wide border-b border-border whitespace-nowrap bg-surface-2 text-fg-muted">
                {p.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhaDeSaldo(previsto.comSaldo ? "Saldo inicial" : "Saldo inicial (sem o das contas)", previsto.saldoInicial)}
          {grupos.map((g) => {
            const abrirGrupo = aberta(`g:${g.code}`);
            return (
              <Fragment key={g.code}>
                <tr className="border-t border-border bg-surface-2/60">
                  <th scope="row" className="sticky left-0 z-10 bg-surface-2 text-left px-3 py-0 font-semibold text-fg">
                    <RotuloDaLinha rotulo={`Fluxo ${g.label.toLowerCase()}`} categorias={g.linhas.length} aberta={abrirGrupo} onAlternar={() => alternar(`g:${g.code}`)} />
                  </th>
                  {celulas({ nivel: "grupo", code: g.code }, g.valores, { forte: true })}
                </tr>
                {abrirGrupo &&
                  g.linhas.map((l) => {
                    const abrirLinha = aberta(`l:${l.code}`);
                    return (
                      <Fragment key={l.code}>
                        <tr className="border-t border-border-soft">
                          <th scope="row" className="sticky left-0 z-10 bg-surface text-left pl-6 pr-3 py-0 font-normal text-fg">
                            <RotuloDaLinha rotulo={l.label} categorias={l.itens.length} aberta={abrirLinha} onAlternar={() => alternar(`l:${l.code}`)} />
                          </th>
                          {celulas({ nivel: "linha", code: l.code }, l.valores)}
                        </tr>
                        {abrirLinha &&
                          l.itens.map((it) => (
                            <tr key={it.nome} className="border-t border-border-soft">
                              {/* Fundo opaco na coluna fixa: o que rola por baixo não aparece através do nome. */}
                              <th scope="row" className="sticky left-0 z-10 bg-surface-2 text-left pl-9 pr-3 py-0 font-normal">
                                <RotuloDaCategoria nome={it.nome} />
                              </th>
                              {celulas({ nivel: "item", code: l.code, item: it.nome }, it.valores, { apoio: true })}
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
              </Fragment>
            );
          })}
          <tr className="border-t border-border">
            <th scope="row" className="sticky left-0 z-10 bg-surface text-left px-3 py-2 font-medium text-fg">
              Variação do período
            </th>
            {previsto.variacao.map((v, i) => (
              <td key={periodos[i]!.chave} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium ${v < 0 ? "text-danger" : v === 0 ? "text-fg-muted" : "text-fg"}`}>
                {valor(v)}
              </td>
            ))}
          </tr>
          {linhaDeSaldo("Saldo final", previsto.saldoFinal, true)}
        </tbody>
      </table>
    </div>
  );
}
