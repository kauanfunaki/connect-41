import Link from "next/link";
import { Selo } from "@/components/ui/Selo";
import { Reatribuir } from "@/components/gestao/Reatribuir";
import type { Classificacao, ItemDeTrabalho, Origem } from "@/lib/gestao/regras";
import type { AcaoDaGestao } from "@/app/(app)/gestao/actions";

export const ORIGEM: Record<Origem, string> = {
  PROCESSO: "Processo",
  CARD: "Tarefa",
  PENDENCIA: "Pendência",
  TRANSFERENCIA: "Transferência",
  SOLICITACAO: "Solicitação",
};

/**
 * Os selos do que pede atenção num item. É situação, então é o `Selo` — era o
 * `Badge`, a pílula de categoria (auditoria DRG-05, 07/10/2026).
 */
export function SelosDoItem({ c }: { c: Classificacao }) {
  return (
    <>
      {c.prazo?.situacao === "VENCIDO" && (
        <Selo tom="perigo">
          Prazo vencido há {c.prazo.dias} {c.prazo.dias === 1 ? "dia" : "dias"}
        </Selo>
      )}
      {c.prazo?.situacao === "VENCENDO" && <Selo tom="atencao">{c.prazo.dias === 0 ? "Vence hoje" : `Vence em ${c.prazo.dias} ${c.prazo.dias === 1 ? "dia" : "dias"}`}</Selo>}
      {c.parado !== null && <Selo tom="atencao">Parado há {c.parado} dias</Selo>}
      {c.paradoDeProposito && <Selo tom="marca">Esperando</Selo>}
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
        {/* O hover e o peso do link de item das outras listas (DRG-35). */}
        <Link href={item.href} className="text-ui font-semibold text-fg hover:text-brand transition-colors break-words">
          {item.titulo}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-fs-2 text-fg-muted">
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
