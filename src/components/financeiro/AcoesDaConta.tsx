"use client";

import { useState, useTransition } from "react";
import { Check, Undo2, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AcaoDeContaState } from "@/lib/financeiro/acoes";
import type { SituacaoDaConta } from "@/lib/financeiro/contas";

type Acoes = {
  conferir: (entryId: string) => Promise<AcaoDeContaState>;
  pagar: (entryId: string, dataISO: string) => Promise<AcaoDeContaState>;
  desfazer: (entryId: string) => Promise<AcaoDeContaState>;
};

export function AcoesDaConta({
  entryId,
  situacao,
  status,
  hojeISO,
  acoes,
  aPagar,
}: {
  entryId: string;
  situacao: SituacaoDaConta;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  /** Hoje em São Paulo, calculado no servidor — o relógio do navegador pode estar em outro fuso. */
  hojeISO: string;
  acoes: Acoes;
  aPagar: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [abrindoBaixa, setAbrindoBaixa] = useState(false);
  const [data, setData] = useState(hojeISO);
  const [pendente, startTransition] = useTransition();

  function executar(fn: () => Promise<AcaoDeContaState>, aoTerminar?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErro(r.error);
      else aoTerminar?.();
    });
  }

  if (situacao === "CANCELADA") {
    return <span className="text-[11px] text-fg-muted">—</span>;
  }

  if (situacao === "PAGA") {
    return (
      <div className="flex flex-col gap-1 items-start">
        <Button
          variant="linkMuted"
          size="xs"
          disabled={pendente}
          onClick={() => executar(() => acoes.desfazer(entryId))}
          className="text-[11px]"
        >
          <Undo2 size={11} /> Desfazer baixa
        </Button>
        {erro && <span className="text-[11px] text-danger">{erro}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      {!abrindoBaixa ? (
        <div className="flex items-center gap-1.5">
          {/* Conferir só aparece enquanto há o que conferir — botão que sempre
              recusa é ruído em toda linha. */}
          {status === "PROVISORIO" && (
            <Button
              variant="secondary"
              size="xs"
              disabled={pendente}
              onClick={() => executar(() => acoes.conferir(entryId))}
            >
              <Check size={11} /> Conferir
            </Button>
          )}
          <Button variant="secondary" size="xs" onClick={() => setAbrindoBaixa(true)}>
            <CircleDollarSign size={11} /> {aPagar ? "Pagar" : "Receber"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Input
            compact
            type="date"
            value={data}
            max={hojeISO}
            onChange={(e) => setData(e.target.value)}
            className="max-w-[150px]"
            aria-label="Data do pagamento"
          />
          <Button
            variant="secondary"
            size="xs"
            disabled={pendente}
            onClick={() =>
              executar(
                () => acoes.pagar(entryId, data),
                () => setAbrindoBaixa(false)
              )
            }
          >
            Confirmar
          </Button>
          <Button
            variant="linkMuted"
            size="xs"
            onClick={() => {
              setAbrindoBaixa(false);
              setErro(null);
            }}
            className="text-[11px]"
          >
            Cancelar
          </Button>
        </div>
      )}
      {erro && <span className="text-[11px] text-danger max-w-[260px]">{erro}</span>}
    </div>
  );
}
