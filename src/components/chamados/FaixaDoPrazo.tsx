import { AlertTriangle, Ban, CheckCircle2, CircleCheck, OctagonAlert, Pause, Timer } from "lucide-react";
import type { PainelDoPrazo, TomDoPrazo } from "@/lib/chamados/painelDoPrazo";
import { STATUS, ROTULOS, fechado, type Status } from "@/lib/chamados/regras";

// A cor da barra e do rótulo por tom. O rótulo ("No prazo", "Atrasado"…) e o
// ícone vão sempre junto da barra: a cor reforça, nunca é a única pista.
const BARRA: Record<TomDoPrazo, string> = { ok: "bg-success", atencao: "bg-warning", perigo: "bg-danger", pausado: "bg-fg-muted", resolvido: "bg-success" };
const TEXTO: Record<TomDoPrazo, string> = { ok: "text-success-fg", atencao: "text-warning-fg", perigo: "text-danger", pausado: "text-fg-secondary", resolvido: "text-success-fg" };
const ICONE: Record<TomDoPrazo, typeof Timer> = { ok: CircleCheck, atencao: AlertTriangle, perigo: OctagonAlert, pausado: Pause, resolvido: CheckCircle2 };

/**
 * A faixa no alto do cartão "Atendimento" (05/11/2026, opção A da tela do
 * chamado): na cor da área da tela (o `data-grupo` que o AppShell põe — Chamados
 * é do Escritório), com o prazo de resolução como a coisa maior do cartão.
 */
export function FaixaDoPrazo({ painel, ciclo, idDoTitulo }: { painel: PainelDoPrazo; ciclo: number | null; idDoTitulo: string }) {
  const Icone = ICONE[painel.tom];
  const pct = painel.usado === null ? null : Math.round(painel.usado * 100);
  return <div className="space-y-2 border-b border-grupo/25 bg-grupo/8 px-5 py-4">
    <div className="flex items-center gap-2">
      <Timer size={15} aria-hidden className="shrink-0 text-grupo" />
      <h2 id={idDoTitulo} className="text-card-title font-semibold text-grupo-fg">Atendimento</h2>
      {ciclo !== null && ciclo > 1 && <span className="ml-auto text-helper text-fg-muted">Ciclo de SLA {ciclo}</span>}
    </div>
    <p className="font-display text-title font-semibold leading-tight text-fg tabular-nums">{painel.titulo}</p>
    {painel.restante && <p className={`text-ui font-medium tabular-nums ${painel.tom === "perigo" || painel.tom === "atencao" ? TEXTO[painel.tom] : "text-fg-secondary"}`}>{painel.restante}</p>}
    {painel.primeiraResposta && <p className="text-ui text-fg-secondary tabular-nums">{painel.primeiraResposta.charAt(0).toUpperCase() + painel.primeiraResposta.slice(1)}</p>}
    {pct !== null && <div className="flex items-center gap-3 pt-1">
      <div role="progressbar" aria-label="Prazo de resolução usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% do prazo usado. ${painel.rotulo}.`} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${BARRA[painel.tom]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <span aria-hidden className={`inline-flex shrink-0 items-center gap-1 text-helper font-semibold ${TEXTO[painel.tom]}`}><Icone size={13} />{painel.rotulo}</span>
    </div>}
    {pct === null && <p className={`inline-flex items-center gap-1 text-helper font-semibold ${TEXTO[painel.tom]}`}><Icone size={13} aria-hidden />{painel.rotulo}</p>}
  </div>;
}

const EM_CURSO = STATUS.filter(s => !fechado(s));
const BOTAO = "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-button-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-[var(--c41-disabled-op)] max-sm:h-10";
// O ativo no desenho do `SegmentedControl tone="brand"`: o segmento grava um
// dado do chamado, e a borda por dentro é o que mostra qual está escolhido.
const ATIVO = "cursor-default border-brand bg-brand-subtle text-brand";
const INATIVO = "cursor-pointer border-border-strong bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg";

/**
 * A situação em botões (05/11/2026), no lugar do <select>. São nove situações:
 * numa caixa segmentada só não cabem na coluna, então as em curso quebram em
 * linhas, e as duas que encerram ficam à parte, com ícone — Resolvido e
 * Cancelado seguem pedindo confirmação (o `onEncerrar` abre o ConfirmDialog).
 */
export function SituacaoEmBotoes({ atual, disabled, onTrocar, onEncerrar }: { atual: string; disabled: boolean; onTrocar: (s: Status) => void; onEncerrar: (s: "RESOLVIDO" | "CANCELADO") => void }) {
  const botao = (s: Status, extra = "", icone: React.ReactNode = null) => {
    const ativo = s === atual;
    return <button key={s} type="button" aria-pressed={ativo} disabled={disabled}
      onClick={() => { if (ativo) return; if (s === "RESOLVIDO" || s === "CANCELADO") onEncerrar(s); else onTrocar(s); }}
      className={`${BOTAO} ${ativo ? ATIVO : `${INATIVO} ${extra}`}`}>{icone}{ROTULOS[s]}</button>;
  };
  return <div role="group" aria-labelledby="situacao-do-chamado" className="space-y-2">
    <h3 id="situacao-do-chamado" className="text-helper font-semibold text-fg-secondary">Situação</h3>
    <div className="flex flex-wrap gap-1.5">{EM_CURSO.map(s => botao(s))}</div>
    <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-border pt-2">
      <span className="mr-1 text-helper text-fg-muted">Encerrar</span>
      {botao("RESOLVIDO", "hover:border-success/50 hover:text-success-fg", <CheckCircle2 size={13} aria-hidden />)}
      {botao("CANCELADO", "hover:border-danger/50 hover:text-danger", <Ban size={13} aria-hidden />)}
    </div>
  </div>;
}
