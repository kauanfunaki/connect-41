import { AlertTriangle, CheckCircle2, CircleCheck, OctagonAlert, Pause, Timer } from "lucide-react";
import type { PainelDoPrazo, TomDoPrazo } from "@/lib/chamados/painelDoPrazo";

// A cor da barra e do rótulo por tom. O rótulo ("No prazo", "Atrasado"…) e o
// ícone vão sempre junto da barra: a cor reforça, nunca é a única pista.
const BARRA: Record<TomDoPrazo, string> = { ok: "bg-success", atencao: "bg-warning", perigo: "bg-danger", pausado: "bg-fg-muted", resolvido: "bg-success" };
const TEXTO: Record<TomDoPrazo, string> = { ok: "text-success-fg", atencao: "text-warning-fg", perigo: "text-danger", pausado: "text-fg-secondary", resolvido: "text-success-fg" };
const ICONE: Record<TomDoPrazo, typeof Timer> = { ok: CircleCheck, atencao: AlertTriangle, perigo: OctagonAlert, pausado: Pause, resolvido: CheckCircle2 };
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A faixa no alto do cartão do chamado (05/11/2026, opção A da tela do
 * chamado): na cor da área da tela (o `data-grupo` que o AppShell põe — Chamados
 * é do Escritório), com o prazo de resolução como a coisa maior do cartão.
 *
 * Mais baixa desde 18/11/2026 (melhoria-782, alternativa C): a situação foi
 * para o cabeçalho da página, e a faixa fica só com o prazo — o título vira
 * "Prazo", e o que falta e a primeira resposta dividem uma linha. "Ciclo de
 * SLA" virou "Atendimento nº", o nome que quem usa reconhece.
 */
export function FaixaDoPrazo({ painel, ciclo, idDoTitulo }: { painel: PainelDoPrazo; ciclo: number | null; idDoTitulo: string }) {
  const Icone = ICONE[painel.tom];
  const pct = painel.usado === null ? null : Math.round(painel.usado * 100);
  const corDoRestante = painel.tom === "perigo" || painel.tom === "atencao" ? TEXTO[painel.tom] : "text-fg-secondary";
  return <div className="space-y-1.5 border-b border-grupo/25 bg-grupo/8 px-5 py-4">
    <div className="flex items-center gap-2">
      <Timer size={15} aria-hidden className="shrink-0 text-grupo" />
      <h2 id={idDoTitulo} className="text-card-title font-semibold text-grupo-fg">Prazo</h2>
      {ciclo !== null && ciclo > 1 && <span className="ml-auto text-helper text-fg-muted">Atendimento nº {ciclo}</span>}
    </div>
    <p className="font-display text-section font-semibold leading-tight text-fg tabular-nums">{painel.titulo}</p>
    {(painel.restante || painel.primeiraResposta) && <p className="text-ui tabular-nums text-fg-secondary">
      {painel.restante && <span className={`font-medium ${corDoRestante}`}>{painel.restante}</span>}
      {painel.restante && painel.primeiraResposta && <span aria-hidden> · </span>}
      {painel.primeiraResposta && <span>{painel.restante ? painel.primeiraResposta : maiuscula(painel.primeiraResposta)}</span>}
    </p>}
    {pct !== null && <div className="flex items-center gap-3 pt-1">
      <div role="progressbar" aria-label="Prazo de resolução usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% do prazo usado. ${painel.rotulo}.`} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${BARRA[painel.tom]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span aria-hidden className={`inline-flex shrink-0 items-center gap-1 text-helper font-semibold ${TEXTO[painel.tom]}`}><Icone size={13} />{painel.rotulo}</span>
    </div>}
    {pct === null && <p className={`inline-flex items-center gap-1 text-helper font-semibold ${TEXTO[painel.tom]}`}><Icone size={13} aria-hidden />{painel.rotulo}</p>}
  </div>;
}
