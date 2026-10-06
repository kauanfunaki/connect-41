import Link from "next/link";
import { ArrowUpRight, OctagonAlert } from "lucide-react";
import type { AuthContext } from "@/lib/auth/context";
import { moeda } from "@/lib/financeiro/formato";
import type { HomeWidgetKey } from "@/lib/homeWidgets";
import type { AcessoDoPainel } from "@/lib/home/acessoDosPaineis";
import { numerosDaHome } from "@/lib/home/dadosDosPaineis";
import { escolherDestaques, MAXIMO_DE_DESTAQUES, type Destaque, type NumerosDaHome } from "@/lib/home/destaques";
import { METRICAS } from "@/lib/home/metricas";
import { tendenciasDaHome } from "@/lib/home/historico";
import type { PontoDaLinha } from "@/lib/home/tendencia";
import { Sparkline, numero } from "@/components/shared/Graficos";

// A faixa de destaques da Home (06/10, opção C): acima dos painéis, os três
// números que mais pedem a pessoa, em cartões cheios — azul para o volume,
// vinho para o alerta. Cada cartão leva para a tela de onde o número sai. A
// escolha (o quê, em que ordem) é de `escolherDestaques`, testada; aqui é só
// a moldura.

export type SetorDoDestaque = { rotulo: string; cor: string };

/**
 * Grade que acomoda 1, 2 ou 3 cartões sem rolagem lateral: um embaixo do
 * outro no celular, dois por linha no tablet (o terceiro ocupa a linha
 * inteira) e três lado a lado em tela larga.
 */
const GRADE = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-4";
const TERCEIRO_NA_LINHA_TODA = "sm:[&:nth-child(3)]:col-span-2 xl:[&:nth-child(3)]:col-span-1";

function valorDoDestaque(d: Destaque): string {
  return METRICAS[d.metrica].formato === "moeda" ? moeda(d.valor) : numero(d.valor);
}

function CartaoDeDestaque({
  destaque: d,
  setor,
  ordem,
  linha,
}: {
  destaque: Destaque;
  setor: SetorDoDestaque;
  ordem: number;
  /** A linha das últimas semanas, quando já há histórico (opção A). */
  linha: PontoDaLinha[] | null;
}) {
  const valor = valorDoDestaque(d);
  return (
    <Link
      href={d.href}
      className={`reveal-in group/destaque relative isolate min-w-0 overflow-hidden rounded-lg p-4 sm:p-5 text-white shadow-[var(--c41-shadow-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-safe:transition-[transform,box-shadow] motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 hover:shadow-[var(--c41-shadow-lg)] ${TERCEIRO_NA_LINHA_TODA}`}
      style={{
        backgroundImage: d.alerta
          ? "linear-gradient(135deg, var(--c41-destaque-alerta-de), var(--c41-destaque-alerta-ate))"
          : "linear-gradient(135deg, var(--c41-destaque-de), var(--c41-destaque-ate))",
        animationDelay: `${ordem * 40}ms`,
      }}
      aria-label={`${d.alerta ? "Alerta: " : ""}${setor.rotulo}, ${d.titulo}: ${valor}. ${d.apoio}.`}
    >
      {/* A linha branca translúcida no canto, atrás do texto (`-z-10` dentro
          do `isolate` do cartão): decoração, o número continua na frente. */}
      {linha && (
        <div className="absolute right-4 bottom-3 w-[42%] h-12 -z-10" aria-hidden>
          <Sparkline pontos={linha} variante="faixa" className="size-full" />
        </div>
      )}
      <p className="flex items-center gap-1.5 pr-6 text-[11px] font-semibold uppercase tracking-wider text-white/90 min-w-0">
        {/* No alerta o ícone diz "alerta" sem depender do vermelho. */}
        {d.alerta ? (
          <OctagonAlert className="size-3.5 flex-shrink-0" aria-hidden />
        ) : (
          <span className="size-1.5 rounded-full flex-shrink-0 ring-1 ring-white/60" style={{ background: setor.cor }} aria-hidden />
        )}
        <span className="truncate">
          {setor.rotulo} · {d.titulo}
        </span>
      </p>
      <p className="mt-2.5 font-display text-[length:var(--fs-metric)] font-bold leading-none tracking-tight tnum truncate c41-cortavel">
        {valor}
      </p>
      <p className="mt-2 text-[length:var(--fs-helper)] text-white/90 truncate">{d.apoio}</p>
      <ArrowUpRight
        className="absolute top-4 right-4 size-4 text-white/70 transition-colors group-hover/destaque:text-white"
        aria-hidden
      />
    </Link>
  );
}

export async function FaixaDeDestaques({
  ctx,
  paineis,
  tarefas,
  setores,
}: {
  ctx: AuthContext;
  /** Os painéis de setor que estão na Home desta pessoa (acesso + "Personalizar"). */
  paineis: ReadonlyMap<HomeWidgetKey, AcessoDoPainel>;
  /** Os números do painel de tarefas — `undefined` quando ele não está na Home. */
  tarefas: NumerosDaHome["tarefas"];
  /** Nome e cor do "setor" de cada painel, como no cabeçalho dele. */
  setores: Partial<Record<HomeWidgetKey, SetorDoDestaque>>;
}) {
  const numeros = await numerosDaHome(ctx, paineis, tarefas);
  const visiveis = new Set<HomeWidgetKey>(paineis.keys());
  if (tarefas) visiveis.add("painel-tarefas");
  const destaques = escolherDestaques(numeros, visiveis);
  if (destaques.length === 0) return null;
  // Só lê: a foto de hoje de cada número quem tira é o painel dele, que está
  // na Home (é condição para o número estar aqui).
  const tendencias = await tendenciasDaHome(ctx, Object.fromEntries(destaques.map((d) => [d.metrica, d.valor])), {
    gravar: false,
  });

  return (
    <section aria-label="Destaques" className={GRADE}>
      {destaques.map((d, i) => (
        <CartaoDeDestaque
          key={d.metrica}
          destaque={d}
          ordem={i}
          setor={setores[d.painel] ?? { rotulo: "Connect", cor: "var(--c41-brand)" }}
          linha={tendencias[d.metrica]?.linha ?? null}
        />
      ))}
    </section>
  );
}

/**
 * O lugar da faixa enquanto os painéis carregam: tantos cartões quantos
 * podem vir (até três), na altura do cartão, para a página não pular.
 */
export function FaixaCarregando({ quantos }: { quantos: number }) {
  const n = Math.min(Math.max(quantos, 0), MAXIMO_DE_DESTAQUES);
  if (n === 0) return null;
  return (
    <div className={GRADE} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`h-[118px] rounded-lg bg-surface-hover animate-pulse motion-reduce:animate-none ${TERCEIRO_NA_LINHA_TODA}`} />
      ))}
    </div>
  );
}
