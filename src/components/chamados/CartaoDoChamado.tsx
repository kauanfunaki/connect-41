import Link from "next/link";
import { BellRing, CircleCheck, CirclePause, CircleX, Hourglass, Inbox, ListOrdered, LoaderCircle, MessageSquareText, ScanSearch, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { MoverNaFila } from "@/components/chamados/MoverNaFila";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { tempoRelativo } from "@/lib/notificacoes/tempo";
import { idadeDaAtividade, prazoRelativo, type Atividade } from "@/lib/chamados/atividade";
import { ROTULOS, ROTULOS_PRIORIDADE, fechado, type Prioridade, type Status } from "@/lib/chamados/regras";
import { enderecoDe } from "@/lib/enderecoCurto";
import { TOM_DA_PRIORIDADE, TOM_DA_SITUACAO } from "@/lib/chamados/tons";

// O cartão da lista de chamados (proposta C, escolhida em 03/11/2026): à
// esquerda, a situação e a atividade recente num painel só, na cor da
// situação; à direita, o chamado, quando foi a última atividade e os dados
// (prioridade, prazo, equipe, abertura, fila). O papel de quem agiu
// ("Suporte", "Requerente") entra no lugar do nome; o comentário aparece na
// dica do balão ao lado de "comentou".

const ICONE_DA_SITUACAO: Record<Status, LucideIcon> = {
  AGUARDANDO_TRIAGEM: ScanSearch, ABERTO: Inbox, NA_FILA: ListOrdered, EM_ANDAMENTO: LoaderCircle,
  AGUARDANDO_USUARIO: Hourglass, AGUARDANDO_APROVACAO: Hourglass, AGUARDANDO_REQUERENTE: Hourglass,
  STANDBY: CirclePause, RESOLVIDO: CircleCheck, CANCELADO: CircleX,
};
const PAINEL_DO_TOM: Record<TomDoSelo, string> = {
  marca: "bg-brand/[0.06] border-brand/20 text-brand",
  atencao: "bg-warning/10 border-warning/25 text-warning-fg",
  perigo: "bg-danger/10 border-danger/25 text-danger",
  sucesso: "bg-success/10 border-success/25 text-success-fg",
  neutro: "bg-surface-2 border-border text-fg-muted",
};
const TEXTO_DO_TOM: Record<TomDoSelo, string> = {
  marca: "text-brand", atencao: "text-warning-fg", perigo: "text-danger", sucesso: "text-success-fg", neutro: "text-fg-secondary",
};
const TOM_DA_IDADE = { recente: "sucesso", normal: "neutro", parada: "atencao" } as const;

type Props = {
  /** `numero`: o link vai pelo endereço curto, /chamados/chamado-45 (10/11/2026). */
  id: string; numero?: number; titulo: string; status: string; prioridade: string; version: number; criadoEm: Date;
  categoria: string; corCategoria: string; setor: { rotulo: string; cor: string };
  responsaveis: { id: string; nome: string }[];
  prazo?: { vence: Date; pausado: boolean; atrasado: boolean };
  fila?: { posicao: number; total: number; reordenar: boolean };
  /** Do mais novo para o mais antigo. */
  atividades: Atividade[]; ultimaAtividade: Date;
  suaVez: boolean; agora: Date;
};

export function CartaoDoChamado(p: Props) {
  const status = p.status as Status, tom = TOM_DA_SITUACAO[status];
  const Icone = p.suaVez ? BellRing : ICONE_DA_SITUACAO[status];
  const tomDaPrioridade = TOM_DA_PRIORIDADE[p.prioridade as Prioridade];
  const tomDaAtividade = fechado(status) ? "neutro" : TOM_DA_IDADE[idadeDaAtividade(p.ultimaAtividade, p.agora)];
  const painel = p.suaVez ? PAINEL_DO_TOM.atencao : PAINEL_DO_TOM[tom];
  const nomes = p.responsaveis.map(r => r.nome).join(", ");
  return <Card className={`relative grid overflow-hidden transition-colors hover:bg-surface-hover/40 md:grid-cols-[264px_minmax(0,1fr)] ${p.suaVez ? "ring-2 ring-warning/60" : ""}`}>
    <div className={`flex flex-col gap-3 border-b p-4 md:border-b-0 md:border-r ${painel}`}>
      <div className="flex items-center gap-2">
        <Icone size={18} aria-hidden className="shrink-0" />
        <span className="text-ui font-bold">{p.suaVez ? "Aguardando sua resposta" : ROTULOS[status]}</span>
        {p.prazo?.atrasado && <Selo tom="perigo" className="ml-auto font-semibold">Atrasado</Selo>}
      </div>
      <ol aria-label="Atividade recente" className="border-t border-current/15 pt-3">
        {p.atividades.map((a, i) => <li key={a.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5">
          <span aria-hidden className="flex flex-col items-center">
            <span className={`mt-1 size-2.5 rounded-full border-2 border-current ${i === 0 ? "bg-current" : "bg-surface opacity-50"}`} />
            {i < p.atividades.length - 1 && <span className="min-h-2.5 w-0.5 flex-1 bg-current opacity-20" />}
          </span>
          <span className="flex flex-col gap-px pb-2">
            <span className={`flex items-center gap-1.5 text-helper leading-snug ${i === 0 ? "font-semibold text-fg" : "text-fg-secondary"}`}>
              {a.texto}
              {a.comentario && <button type="button" data-dica={a.comentario} aria-label={`Comentário: ${a.comentario}`} className="relative z-10 inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><MessageSquareText size={14} aria-hidden /></button>}
            </span>
            <span className="text-micro text-fg-muted tabular-nums">{formatInstantDateTime(a.quando, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          </span>
        </li>)}
        {!p.atividades.length && <li className="text-helper text-fg-muted">Nenhuma atividade registrada.</li>}
      </ol>
    </div>
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={enderecoDe("chamado", { id: p.id, number: p.numero })} className="min-w-0 break-words text-label font-semibold text-fg after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:text-brand hover:underline">{p.titulo}</Link>
        <span data-dica={`Última atividade em ${formatInstantDateTime(p.ultimaAtividade)}`} className="relative z-10 shrink-0"><Selo tom={tomDaAtividade} className="font-semibold">{tempoRelativo(p.ultimaAtividade, p.agora)}</Selo></span>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-helper">
        <span aria-label="Grupo e categoria" className="inline-flex items-center rounded-md border px-2 py-0.5 font-medium" style={{ color: p.corCategoria, borderColor: `color-mix(in srgb, ${p.corCategoria} 32%, transparent)`, backgroundColor: `color-mix(in srgb, ${p.corCategoria} 10%, var(--c41-surface))` }}>{p.categoria}</span>
        <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5" style={{ color: p.setor.cor, backgroundColor: `color-mix(in srgb, ${p.setor.cor} 10%, var(--c41-surface))` }}><span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: p.setor.cor }} />{p.setor.rotulo}</span>
      </p>
      <dl className="mt-auto flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-3 text-helper">
        <div className="flex flex-col gap-0.5">
          <dt className="text-micro text-fg-muted">Prioridade</dt>
          <dd className={`inline-flex items-center gap-1.5 font-semibold ${TEXTO_DO_TOM[tomDaPrioridade]}`}><span aria-hidden className="size-2 rounded-[2px] bg-current" />{ROTULOS_PRIORIDADE[p.prioridade as Prioridade]}</dd>
        </div>
        {p.prazo && <div className="flex flex-col gap-0.5">
          <dt className="text-micro text-fg-muted">Prazo{p.prazo.pausado ? " · SLA pausado" : ""}</dt>
          <dd className="tabular-nums text-fg">{formatInstantDate(p.prazo.vence)} <span className={`font-semibold ${p.prazo.atrasado ? "text-danger" : "text-fg-secondary"}`}>· {prazoRelativo(p.prazo.vence, p.agora)}</span></dd>
        </div>}
        <div className="flex flex-col gap-0.5">
          <dt className="text-micro text-fg-muted">Equipe</dt>
          <dd>{p.responsaveis.length ? <span role="img" aria-label={`Responsáveis: ${nomes}`} data-dica={nomes} className="relative z-10 flex -space-x-1.5">{p.responsaveis.map(r => <AvatarImage key={r.id} src={null} name={r.nome} size={22} />)}</span> : <span className="italic text-fg-muted">Sem responsável</span>}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-micro text-fg-muted">Aberto em</dt>
          <dd className="tabular-nums text-fg">{formatInstantDate(p.criadoEm)}</dd>
        </div>
        {p.fila && <div className="flex flex-col gap-0.5">
          <dt className="text-micro text-fg-muted">Fila</dt>
          <dd className="flex items-center gap-2 tabular-nums text-fg">Posição {p.fila.posicao} de {p.fila.total}{p.fila.reordenar && <span className="relative z-10"><MoverNaFila id={p.id} version={p.version} posicao={p.fila.posicao} total={p.fila.total} titulo={p.titulo} /></span>}</dd>
        </div>}
      </dl>
    </div>
  </Card>;
}
