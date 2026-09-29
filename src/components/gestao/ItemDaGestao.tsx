import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Reatribuir } from "@/components/gestao/Reatribuir";
import type { Classificacao, ItemDeTrabalho, Origem } from "@/lib/gestao/regras";
import type { AcaoDaGestao } from "@/app/(app)/gestao/actions";

export const ORIGEM: Record<Origem, string> = {
  PROCESSO: "Processo",
  CARD: "Card",
  PENDENCIA: "Pendência",
  TRANSFERENCIA: "Transferência",
};

/** Os selos do que pede atenção num item. */
export function SelosDoItem({ c }: { c: Classificacao }) {
  return (
    <>
      {c.prazo?.situacao === "VENCIDO" && (
        <Badge variant="danger">
          Prazo vencido há {c.prazo.dias} {c.prazo.dias === 1 ? "dia" : "dias"}
        </Badge>
      )}
      {c.prazo?.situacao === "VENCENDO" && <Badge variant="warning">{c.prazo.dias === 0 ? "Vence hoje" : `Vence em ${c.prazo.dias} ${c.prazo.dias === 1 ? "dia" : "dias"}`}</Badge>}
      {c.parado !== null && <Badge variant="warning">Parado há {c.parado} dias</Badge>}
      {c.paradoDeProposito && <Badge variant="info">Esperando</Badge>}
    </>
  );
}

/**
 * Uma linha de item na Gestão. Com `pessoasDoSetor`, o responsável de processo
 * e de card pode ser trocado ali mesmo; os outros tipos mostram só o nome.
 */
export function ItemDaGestao({
  item,
  c,
  rotuloDoSetor,
  nomeDe,
  pessoasDoSetor,
  reatribuir,
}: {
  item: ItemDeTrabalho;
  c: Classificacao;
  rotuloDoSetor: string;
  nomeDe: Map<string, string>;
  pessoasDoSetor?: { id: string; name: string }[];
  reatribuir?: (origem: "PROCESSO" | "CARD", id: string, userId: string) => Promise<AcaoDaGestao>;
}) {
  const nomes = item.responsaveis.map((u) => nomeDe.get(u) ?? "—");
  const trocavel = pessoasDoSetor && reatribuir && (item.origem === "PROCESSO" || item.origem === "CARD");
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex flex-col gap-1">
        <Link href={item.href} className="text-[13px] font-medium text-fg hover:underline break-words">
          {item.titulo}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-muted">
          <span>{ORIGEM[item.origem]}</span>
          <span>· {rotuloDoSetor}</span>
          {!trocavel && <span>· {nomes.length ? nomes.join(", ") : "sem responsável"}</span>}
          <SelosDoItem c={c} />
        </div>
      </div>
      {trocavel && (
        <Reatribuir
          origem={item.origem as "PROCESSO" | "CARD"}
          id={item.id}
          atual={item.responsaveis.length === 1 ? item.responsaveis[0] : null}
          pessoas={pessoasDoSetor}
          reatribuir={reatribuir}
        />
      )}
    </li>
  );
}
