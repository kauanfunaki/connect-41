import { Fragment } from "react";
import { CartoesNoCelular, TabelaNoDesktop } from "@/components/shared/ListaResponsiva";
import { ROTULO_CURTO_DO_TESTE, TESTES } from "@/lib/academia/regras";
import { mediaEmTexto } from "@/lib/academia/ranking";
import type { LinhaDaMediaNaTela } from "@/lib/academia/tipos";
import { Nome, Posicao } from "./TabelaDoRanking";

/** "3 de 4 testes". */
export const testesEmTexto = (l: Pick<LinhaDaMediaNaTela, "testesFeitos" | "testesNoMes">) =>
  `${l.testesFeitos} de ${l.testesNoMes} ${l.testesNoMes === 1 ? "teste" : "testes"}`;

/**
 * A "Média de todos os testes" na tela (melhoria-823, 25/11/2026): a média e,
 * em cada teste, o percentual do líder do mês — o "—" é o teste que a pessoa
 * não fez, que vale 0 na média. O topo e a linha de quem olha, como no ranking
 * de um teste.
 */
export function TabelaDaMedia({ topo, eu, rotulo }: { topo: LinhaDaMediaNaTela[]; eu: LinhaDaMediaNaTela | null; rotulo: string }) {
  const linhas = eu ? [...topo, eu] : topo;
  const pct = (v: number | undefined) => (v === undefined ? "—" : mediaEmTexto(v));
  return (
    <>
      <TabelaNoDesktop padrao>
        <table className="w-full min-w-[760px]" aria-label={rotulo}>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 w-16">Posição</th>
              <th scope="col" className="py-2 pr-3">Pessoa</th>
              <th scope="col" className="py-2 pr-3">Setor</th>
              {TESTES.map((t) => (
                <th key={t} scope="col" className="py-2 pr-3 text-right">{ROTULO_CURTO_DO_TESTE[t]}</th>
              ))}
              <th scope="col" className="py-2 pr-3 text-right">Média</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr
                key={l.userId}
                className={`border-b border-border-soft ${l.eu ? "bg-brand-subtle" : ""} ${eu && i === topo.length ? "border-t-2 border-t-border-strong" : ""}`}
                aria-current={l.eu ? "true" : undefined}
              >
                <td className="py-2.5 pr-3"><Posicao l={l} /></td>
                <td className="py-2.5 pr-3 text-ui"><Nome l={l} /></td>
                <td className="py-2.5 pr-3 text-ui text-fg-secondary">{l.setor ?? "—"}</td>
                {TESTES.map((t) => (
                  <td key={t} className="py-2.5 pr-3 text-right text-ui tabular-nums text-fg-secondary">{pct(l.porTeste[t])}</td>
                ))}
                <td className="py-2.5 pr-3 text-right text-ui font-semibold tabular-nums">{mediaEmTexto(l.media)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
      <CartoesNoCelular>
        <div className="rounded-lg border border-border bg-surface p-2">
          <ol className="flex flex-col gap-0.5" aria-label={rotulo}>
            {linhas.map((l, i) => (
              <Fragment key={l.userId}>
                {eu && i === topo.length && <li aria-hidden className="px-2 text-center text-helper text-fg-muted">⋯</li>}
                <li className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${l.eu ? "bg-brand-subtle" : ""}`} aria-current={l.eu ? "true" : undefined}>
                  <Posicao l={l} />
                  <span className="min-w-0 flex-1 text-ui">
                    <Nome l={l} />
                    {l.setor && <span className="block truncate pl-8 text-helper text-fg-muted">{l.setor}</span>}
                  </span>
                  <span className="text-right text-ui tabular-nums">
                    <span className="block font-semibold text-fg">{mediaEmTexto(l.media)}</span>
                    <span className="block text-helper text-fg-muted">{testesEmTexto(l)}</span>
                  </span>
                </li>
              </Fragment>
            ))}
          </ol>
        </div>
      </CartoesNoCelular>
    </>
  );
}
