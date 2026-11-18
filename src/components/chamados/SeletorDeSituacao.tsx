"use client";

import { Ban, CheckCircle2, ChevronDown, LoaderCircle } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { COR_DO_TOM, type TomDoSelo } from "@/components/ui/Selo";
import { ROTULOS, type Status } from "@/lib/chamados/regras";
import { TOM_DA_SITUACAO } from "@/lib/chamados/tons";

/** A bolinha da situação, na cor do selo da lista. */
const PONTO: Record<TomDoSelo, string> = { neutro: "bg-fg-muted", marca: "bg-brand", atencao: "bg-warning", perigo: "bg-danger", sucesso: "bg-success" };
// Agrupadas pelo efeito no prazo (o desenho da alternativa C, 18/11/2026).
const GRUPOS: { titulo: string; situacoes: Status[] }[] = [
  { titulo: "Seguir atendendo", situacoes: ["ABERTO", "NA_FILA", "EM_ANDAMENTO"] },
  { titulo: "Pausar o prazo", situacoes: ["AGUARDANDO_USUARIO", "AGUARDANDO_REQUERENTE", "AGUARDANDO_APROVACAO", "STANDBY"] },
];
const DESCRICAO: Partial<Record<Status, string>> = {
  NA_FILA: "Entra no fim da fila do setor",
  EM_ANDAMENTO: "O prazo corre",
  AGUARDANDO_USUARIO: "Quem pediu pode responder; o prazo fica parado",
  AGUARDANDO_REQUERENTE: "Quem pediu pode responder; o prazo fica parado",
  AGUARDANDO_APROVACAO: "O prazo fica parado até a decisão",
  STANDBY: "O prazo fica parado; quem pediu não responde",
};
const ITEM = "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand";

const CAIXA = "inline-flex h-8 max-w-full items-center gap-2 rounded-md border px-3 text-button-sm font-semibold max-sm:h-10";

export function PontoDaSituacao({ status }: { status: Status }) {
  return <span aria-hidden className={`mt-[0.4em] size-2 shrink-0 rounded-full ${PONTO[TOM_DA_SITUACAO[status]]}`} />;
}
/** A situação só para ler (quem pediu, chamado encerrado ou em triagem): o mesmo desenho do seletor, sem a seta. */
export function SeloDaSituacao({ status }: { status: Status }) {
  return <span className={`${CAIXA} ${COR_DO_TOM[TOM_DA_SITUACAO[status]]}`}><span aria-hidden className={`size-2 shrink-0 rounded-full ${PONTO[TOM_DA_SITUACAO[status]]}`} /><span className="sr-only">Situação: </span><span className="truncate">{ROTULOS[status]}</span></span>;
}

/**
 * A situação num seletor (18/11/2026, melhoria-782), no lugar dos nove botões
 * do cartão: o botão com a situação atual, na cor dela, abre só as trocas que o
 * servidor aceita (`situacoesDoSeletor`). Resolver e Cancelar vêm à parte e
 * seguem pedindo confirmação (`onEncerrar`).
 */
export function SeletorDeSituacao({ atual, opcoes, aprovacaoPendente, salvando, onTrocar, onEncerrar }: {
  atual: Status; opcoes: Status[]; aprovacaoPendente: boolean; salvando: boolean;
  onTrocar: (s: Status) => void; onEncerrar: (s: "RESOLVIDO" | "CANCELADO") => void;
}) {
  const grupos = GRUPOS.map(g => ({ ...g, situacoes: g.situacoes.filter(s => opcoes.includes(s)) })).filter(g => g.situacoes.length);
  const resolver = opcoes.includes("RESOLVIDO"), cancelar = opcoes.includes("CANCELADO");
  return <Popover align="right" width={300} aria-label="Mudar a situação" trigger={({ open, toggle }) =>
    <button type="button" onClick={toggle} disabled={salvando || !opcoes.length} aria-expanded={open} aria-busy={salvando || undefined}
      aria-label={`Situação: ${ROTULOS[atual]}${salvando ? ". Salvando" : ". Mudar a situação"}`}
      className={`${CAIXA} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand enabled:cursor-pointer enabled:hover:brightness-95 disabled:cursor-default ${COR_DO_TOM[TOM_DA_SITUACAO[atual]]}`}>
      {salvando ? <LoaderCircle size={14} aria-hidden className="shrink-0 animate-spin motion-reduce:animate-none" /> : <span aria-hidden className={`size-2 shrink-0 rounded-full ${PONTO[TOM_DA_SITUACAO[atual]]}`} />}
      <span className="truncate">{salvando ? "Salvando…" : ROTULOS[atual]}</span>
      {!salvando && <ChevronDown size={15} aria-hidden className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />}
    </button>}>
    {({ close }) => <div className="space-y-2">
      {grupos.map(g => <div key={g.titulo} className="space-y-0.5">
        <p className="c41-rotulo px-2 pb-0.5">{g.titulo}</p>
        {g.situacoes.map(s => <button key={s} type="button" onClick={() => { close(); onTrocar(s); }} className={`${ITEM} hover:bg-surface-hover focus-visible:bg-surface-hover`}>
          <PontoDaSituacao status={s} />
          <span className="flex min-w-0 flex-col"><span className="text-dropdown font-medium text-fg">{ROTULOS[s]}</span>{DESCRICAO[s] && <span className="text-fs-2 leading-snug text-fg-secondary">{DESCRICAO[s]}</span>}</span>
        </button>)}
      </div>)}
      {(resolver || cancelar) && <div className={`space-y-0.5 ${grupos.length ? "border-t border-border pt-2" : ""}`}>
        {resolver && <button type="button" onClick={() => { close(); onEncerrar("RESOLVIDO"); }} className={`${ITEM} text-success-fg hover:bg-success/8 focus-visible:bg-success/8`}>
          <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0" /><span className="flex min-w-0 flex-col"><span className="text-dropdown font-medium">Resolver o chamado</span><span className="text-fs-2 leading-snug text-fg-secondary">Pede confirmação e avisa quem pediu</span></span>
        </button>}
        {cancelar && <button type="button" onClick={() => { close(); onEncerrar("CANCELADO"); }} className={`${ITEM} text-danger hover:bg-danger/8 focus-visible:bg-danger/8`}>
          <Ban size={16} aria-hidden className="mt-0.5 shrink-0" /><span className="flex min-w-0 flex-col"><span className="text-dropdown font-medium">Cancelar o chamado</span><span className="text-fs-2 leading-snug text-fg-secondary">Pede confirmação; sai da fila</span></span>
        </button>}
      </div>}
      {aprovacaoPendente && <p className="border-t border-border px-2 pt-2 text-fs-2 leading-snug text-fg-secondary">As outras situações voltam depois da decisão da aprovação, no aviso do alto da página.</p>}
    </div>}
  </Popover>;
}
