"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Check } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { FORA_DO_RESULTADO, modeloDoCodigo, type CodigoDoModelo } from "@/lib/dre/estrutura";
import { moverCategoria } from "@/app/(app)/dre/actions";

/**
 * O "Mover" de uma categoria aberta na DRE da equipe (28/10/2026, pedido da
 * coordenação do BPO): leva a categoria para outra linha só nesta empresa —
 * o IPTU que caiu nos impostos sobre a receita vai para as despesas
 * administrativas deste cliente, e o dos outros fica onde está.
 *
 * Fica discreto até o mouse ou o teclado chegarem na linha; escolher a linha
 * já grava, como a fila de classificação, e o relatório atrás recalcula. O
 * "Voltar ao padrão" fica no painel de classificação, nas exceções.
 */
export function MoverCategoria({
  companyId,
  modelo: codigoDoModelo,
  nome,
  origem,
  grupoAtual,
}: {
  companyId: string;
  modelo: CodigoDoModelo;
  nome: string;
  origem: "pagamento" | "recebimento";
  /** O grupo da linha onde a categoria está — sai da lista. */
  grupoAtual: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [movida, setMovida] = useState(false);
  const [pendente, startTransition] = useTransition();
  const grupos = modeloDoCodigo(codigoDoModelo).grupos.filter((g) => g.origem === origem && g.code !== grupoAtual);

  if (movida) {
    return (
      <span className="inline-flex items-center gap-1 text-fs-1 text-success whitespace-nowrap">
        <Check size={12} aria-hidden /> Movida
      </span>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Mover ${nome} para outra linha nesta empresa`}
        data-dica="Mudar a linha só nesta empresa"
        className="inline-flex items-center gap-1 rounded-sm px-1 text-fs-1 text-fg-muted opacity-0 transition-opacity group-hover/linha:opacity-100 focus-visible:opacity-100 hover:text-fg"
      >
        <ArrowRightLeft size={12} aria-hidden /> Mover
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        compact
        autoFocus
        aria-label={`Nova linha da DRE para ${nome}`}
        value=""
        disabled={pendente}
        onBlur={() => !pendente && setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false);
        }}
        onChange={(e) => {
          const grupo = e.target.value;
          if (!grupo) return;
          setErro(null);
          startTransition(async () => {
            let r: Awaited<ReturnType<typeof moverCategoria>>;
            try {
              r = await moverCategoria(companyId, nome, origem, grupo);
            } catch {
              r = { error: "Não consegui gravar. Tente de novo." };
            }
            if (r && "error" in r) setErro(r.error);
            else setMovida(true);
          });
        }}
        className="w-56"
      >
        <option value="">{pendente ? "Movendo…" : "Mover para…"}</option>
        {grupos.map((g) => (
          <option key={g.code} value={g.code}>
            {g.label}
          </option>
        ))}
        <optgroup label="Fora do DRE">
          {FORA_DO_RESULTADO.map((f) => (
            <option key={f.code} value={f.code}>
              {f.label}
            </option>
          ))}
        </optgroup>
      </Select>
      {erro && <p className="text-fs-1 text-danger max-w-56 text-right">{erro}</p>}
    </div>
  );
}
