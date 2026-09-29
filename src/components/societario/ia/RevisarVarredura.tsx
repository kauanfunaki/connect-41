"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { RejeitarProposta } from "./RejeitarProposta";
import type { AcaoDaIa } from "@/app/(app)/societario/ia/actions";
import type { Sinal, ItemAvaliado, Urgencia } from "@/lib/societario/varredura";

const URGENCIA: Record<Urgencia, { rotulo: string; variante: "danger" | "warning" | "info" }> = {
  ALTA: { rotulo: "Urgência alta", variante: "danger" },
  MEDIA: { rotulo: "Urgência média", variante: "warning" },
  BAIXA: { rotulo: "Urgência baixa", variante: "info" },
};

const TIPO: Record<Sinal["tipo"], string> = {
  EXIGENCIA_VENCIDA: "Exigência vencida",
  PRAZO_VENCIDO: "Prazo combinado vencido",
  PROCESSO_PARADO: "Processo parado",
  LICENCA_VENCIDA: "Licença vencida",
  LICENCA_VENCENDO: "Licença vencendo",
};

/**
 * A revisão da varredura. Tudo vem marcado; o coordenador desmarca o que não
 * quer encaminhar. Aplicar sobe a prioridade dos processos marcados e avisa o
 * responsável de cada um com o próximo passo.
 */
export function RevisarVarredura({
  propostaId,
  itens,
  sinais,
  podeAplicar,
  acoes,
}: {
  propostaId: string;
  itens: ItemAvaliado[];
  sinais: Sinal[];
  podeAplicar: boolean;
  acoes: {
    aplicar: (id: string, chaves: string[]) => Promise<AcaoDaIa>;
    rejeitar: (id: string, motivo: string) => Promise<AcaoDaIa>;
  };
}) {
  const router = useRouter();
  const sinalDa = new Map(sinais.map((s) => [s.chave, s]));
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(itens.map((i) => i.chave)));
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {itens.map((i) => {
          const s = sinalDa.get(i.chave);
          if (!s) return null;
          const u = URGENCIA[i.urgencia];
          return (
            <li key={i.chave} className="flex gap-3 p-4">
              {podeAplicar && (
                <Checkbox
                  id={`p-${i.chave}`}
                  aria-label={`Encaminhar: ${s.titulo}`}
                  checked={marcadas.has(i.chave)}
                  onChange={() =>
                    setMarcadas((m) => {
                      const n = new Set(m);
                      if (n.has(i.chave)) n.delete(i.chave);
                      else n.add(i.chave);
                      return n;
                    })
                  }
                  className="mt-1"
                />
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={u.variante}>{u.rotulo}</Badge>
                  <span className="text-[12px] text-fg-muted">{TIPO[s.tipo]}</span>
                </div>
                <p className="text-[14px] font-medium text-fg">
                  {s.processoId ? (
                    <Link href={`/processos/${s.processoId}`} className="hover:underline">
                      {s.titulo}
                    </Link>
                  ) : (
                    s.titulo
                  )}
                </p>
                <p className="text-[13px] text-fg-secondary">{s.detalhe}</p>
                {i.recomendacao && (
                  <p className="text-[13px] text-fg">
                    <span className="text-fg-muted">Próximo passo sugerido: </span>
                    {i.recomendacao}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {msg && <p className={`text-[13px] ${msg.tipo === "erro" ? "text-danger" : "text-success"}`}>{msg.texto}</p>}

      {podeAplicar && (
        <div className="flex flex-wrap items-start justify-end gap-2">
          <RejeitarProposta propostaId={propostaId} rejeitar={acoes.rejeitar} />
          <Button
            variant="primary"
            disabled={pendente || marcadas.size === 0}
            onClick={() =>
              startTransition(async () => {
                setMsg(null);
                const r = await acoes.aplicar(propostaId, [...marcadas]);
                if ("error" in r) setMsg({ tipo: "erro", texto: r.error });
                else {
                  setMsg({ tipo: "ok", texto: r.mensagem ?? "Aplicado." });
                  router.refresh();
                }
              })
            }
          >
            {pendente ? "Aplicando…" : `Encaminhar ${marcadas.size} ${marcadas.size === 1 ? "pendência" : "pendências"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
