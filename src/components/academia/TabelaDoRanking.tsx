import { AvatarImage } from "@/components/shared/AvatarImage";
import { CartoesNoCelular, TabelaNoDesktop } from "@/components/shared/ListaResponsiva";
import { Selo } from "@/components/ui/Selo";
import { ROTULO_DO_NIVEL, ehDeDigitar, type Teste } from "@/lib/academia/regras";
import { formatarPrecisao, numeroEmTexto } from "@/lib/academia/ranking";
import type { LinhaDaTela } from "@/lib/academia/tipos";
import { BotaoDeParabens, type ParabensDaLinha } from "./BotaoDeParabens";

// O ranking na tela (10/11/2026, pedido do Kauan): o topo e a linha de quem
// olha, quando ela está abaixo — nunca o fim da lista. Duas formas: a lista
// curta (o lado do Início, e o celular) e a tabela da página do ranking.

const numero = (teste: Teste, l: LinhaDaTela) => numeroEmTexto(teste, l);

function Posicao({ l }: { l: LinhaDaTela }) {
  return (
    <span className={`inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full text-helper font-semibold tabular-nums ${l.posicao <= 3 ? "bg-brand-subtle text-brand" : "bg-surface-2 text-fg-secondary"}`}>
      {l.posicao}º
    </span>
  );
}

function Nome({ l }: { l: LinhaDaTela }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AvatarImage src={l.fotoUrl} name={l.nome} size={24} fontSize={10} />
      <span className={`truncate ${l.eu ? "font-semibold text-fg" : "text-fg"}`}>{l.nome}</span>
      {l.eu && <Selo tom="marca">Você</Selo>}
    </span>
  );
}

type PropsDaLista = {
  teste: Teste;
  topo: LinhaDaTela[];
  eu: LinhaDaTela | null;
  rotulo: string;
  /** O "Parabéns" nas linhas dos colegas (Fase 2); sem ele, nenhum botão. */
  parabens?: ParabensDaLinha;
};

/** A lista curta: posição, nome, número e precisão. */
export function ListaDoRanking({ teste, topo, eu, rotulo, parabens }: PropsDaLista) {
  const linha = (l: LinhaDaTela) => (
    <li key={l.userId} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${l.eu ? "bg-brand-subtle" : ""}`} aria-current={l.eu ? "true" : undefined}>
      <Posicao l={l} />
      <span className="min-w-0 flex-1 text-ui">
        <Nome l={l} />
        {l.setor && <span className="block truncate pl-8 text-helper text-fg-muted">{l.setor}</span>}
      </span>
      <span className="text-right text-ui tabular-nums">
        <span className="block font-semibold text-fg">{numero(teste, l)}</span>
        <span className="block text-helper text-fg-muted">{formatarPrecisao(l.precisao)}%</span>
      </span>
      {parabens && !l.eu && <BotaoDeParabens paraUserId={l.userId} nome={l.nome} parabens={parabens} />}
    </li>
  );
  return (
    <ol className="flex flex-col gap-0.5" aria-label={rotulo}>
      {topo.map(linha)}
      {eu && (
        <>
          <li aria-hidden className="px-2 text-center text-helper text-fg-muted">⋯</li>
          {linha(eu)}
        </>
      )}
    </ol>
  );
}

/** A tabela da página do ranking (computador) e a lista no celular. */
export function TabelaDoRanking({ teste, topo, eu, rotulo, parabens }: PropsDaLista) {
  const linhas = eu ? [...topo, eu] : topo;
  return (
    <>
      <TabelaNoDesktop padrao>
        <table className="w-full min-w-[640px]" aria-label={rotulo}>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 w-16">Posição</th>
              <th scope="col" className="py-2 pr-3">Pessoa</th>
              <th scope="col" className="py-2 pr-3">Setor</th>
              <th scope="col" className="py-2 pr-3">Nível</th>
              <th scope="col" className="py-2 pr-3 text-right">{ehDeDigitar(teste) ? "PPM" : "Acertos"}</th>
              <th scope="col" className="py-2 pr-3 text-right">Precisão</th>
              {parabens?.podeMandar && <th scope="col" className="py-2 pr-1 w-28"><span className="sr-only">Parabéns</span></th>}
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
                <td className="py-2.5 pr-3 text-ui text-fg-secondary">{l.niveis.length > 1 ? l.niveis.map((n) => ROTULO_DO_NIVEL[n]).join(", ") : ROTULO_DO_NIVEL[l.nivel]}</td>
                <td className="py-2.5 pr-3 text-right text-ui font-semibold tabular-nums">{numero(teste, l)}</td>
                <td className="py-2.5 pr-3 text-right text-ui tabular-nums">{formatarPrecisao(l.precisao)}%</td>
                {parabens?.podeMandar && (
                  <td className="py-1.5 pr-1 text-right">{!l.eu && <BotaoDeParabens paraUserId={l.userId} nome={l.nome} parabens={parabens} />}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
      <CartoesNoCelular>
        <div className="rounded-lg border border-border bg-surface p-2">
          <ListaDoRanking teste={teste} topo={topo} eu={eu} rotulo={rotulo} parabens={parabens} />
        </div>
      </CartoesNoCelular>
    </>
  );
}
