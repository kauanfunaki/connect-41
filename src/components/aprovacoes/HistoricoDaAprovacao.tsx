import { Badge } from "@/components/ui/Badge";
import { formatInstantDateTime } from "@/lib/format";
import { ROTULO_DA_APROVACAO, type StatusDeAprovacao } from "@/lib/financeiro/aprovacao/regras";

export type EventoDaAprovacao = {
  id: string;
  decisao: "ENVIADO" | "APROVADO" | "REPROVADO";
  autor: string;
  /** Equipe ou cliente — a mesma pessoa pode não ser reconhecível só pelo nome. */
  lado: "equipe" | "cliente";
  motivo: string | null;
  em: Date;
};

const VERBO: Record<EventoDaAprovacao["decisao"], string> = {
  ENVIADO: "enviou para aprovação",
  APROVADO: "aprovou",
  REPROVADO: "reprovou",
};

const VARIANTE: Record<StatusDeAprovacao, "success" | "warning" | "danger" | "info"> = {
  NAO_REQUER: "info",
  AGUARDANDO: "warning",
  APROVADO: "success",
  REPROVADO: "danger",
};

export function SeloDaAprovacao({ status }: { status: StatusDeAprovacao }) {
  if (status === "NAO_REQUER") return null;
  return <Badge variant={VARIANTE[status]}>{ROTULO_DA_APROVACAO[status]}</Badge>;
}

/** O histórico inteiro, recolhido — a linha mostra o estado; quem quer o porquê abre. */
export function HistoricoDaAprovacao({ eventos }: { eventos: EventoDaAprovacao[] }) {
  if (eventos.length === 0) return null;
  return (
    <details className="mt-1 text-[11px]">
      <summary className="cursor-pointer text-fg-muted hover:text-fg">Histórico ({eventos.length})</summary>
      <ol className="mt-1.5 flex flex-col gap-1 border-l border-border pl-2.5">
        {eventos.map((e) => (
          <li key={e.id}>
            <span className="text-fg-muted">{formatInstantDateTime(e.em)}</span> · {e.autor} ({e.lado}) {VERBO[e.decisao]}
            {e.motivo && <span className="block text-fg-secondary whitespace-pre-wrap">“{e.motivo}”</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
