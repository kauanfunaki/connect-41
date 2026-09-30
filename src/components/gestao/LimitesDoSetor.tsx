"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AcaoDaGestao } from "@/app/(app)/gestao/actions";

/**
 * Uma linha da tabela de limites: dias para "parado" e antecedência do aviso de prazo.
 * Vive no casco padrão (`.c41-tabela`), que dá o respiro e centraliza as células.
 *
 * Campos `compact` (32px), a altura do "Salvar" `sm` da mesma linha — eram de
 * formulário (36px), e o botão ficava 4px mais baixo que eles.
 */
export function LimitesDoSetor({
  setor,
  rotulo,
  diasParado,
  diasAvisoPrazo,
  padrao,
  podeEditar,
  salvar,
}: {
  setor: string;
  rotulo: string;
  diasParado: number | null;
  diasAvisoPrazo: number | null;
  padrao: { diasParado: number; diasAvisoPrazo: number };
  podeEditar: boolean;
  salvar: (setor: string, diasParado: string, diasAvisoPrazo: string) => Promise<AcaoDaGestao>;
}) {
  const router = useRouter();
  const [parado, setParado] = useState(diasParado === null ? "" : String(diasParado));
  const [aviso, setAviso] = useState(diasAvisoPrazo === null ? "" : String(diasAvisoPrazo));
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const mudou = parado !== (diasParado === null ? "" : String(diasParado)) || aviso !== (diasAvisoPrazo === null ? "" : String(diasAvisoPrazo));

  return (
    <tr className="border-b border-border">
      <td className="px-3 font-medium text-fg">{rotulo}</td>
      <td className="px-3">
        <Input
          aria-label={`Dias para parado em ${rotulo}`}
          inputMode="numeric"
          value={parado}
          placeholder={`${padrao.diasParado} (padrão)`}
          disabled={!podeEditar}
          onChange={(e) => setParado(e.target.value)}
          compact
          className="w-32 tabular-nums"
        />
      </td>
      <td className="px-3">
        <Input
          aria-label={`Aviso de prazo em ${rotulo}`}
          inputMode="numeric"
          value={aviso}
          placeholder={`${padrao.diasAvisoPrazo} (padrão)`}
          disabled={!podeEditar}
          onChange={(e) => setAviso(e.target.value)}
          compact
          className="w-32 tabular-nums"
        />
      </td>
      <td className="px-3 whitespace-nowrap">
        {podeEditar && mudou && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pendente}
            onClick={() =>
              startTransition(async () => {
                const r = await salvar(setor, parado, aviso);
                if ("error" in r) setMsg({ tipo: "erro", texto: r.error });
                else {
                  setMsg({ tipo: "ok", texto: "Salvo." });
                  router.refresh();
                }
              })
            }
          >
            Salvar
          </Button>
        )}
        {msg && <span className={`ml-2 text-[12px] ${msg.tipo === "erro" ? "text-danger" : "text-success"}`}>{msg.texto}</span>}
      </td>
    </tr>
  );
}
