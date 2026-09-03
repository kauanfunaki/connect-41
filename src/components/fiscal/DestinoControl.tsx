"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { DESTINO_LABEL } from "@/lib/fiscal/rotulos";
import type { FiscalDocumentDestination } from "@/generated/prisma/enums";

type Props = {
  documentoId: string;
  destinoAtual: FiscalDocumentDestination;
  motivoAtual: string | null;
  podeDecidir: boolean;
  action: (
    documentoId: string,
    destino: FiscalDocumentDestination,
    motivo?: string
  ) => Promise<{ error: string } | { ok: true }>;
};

const OPCOES: { valor: FiscalDocumentDestination; ajuda: string }[] = [
  { valor: "PENDENTE", ajuda: "Ainda não decidido" },
  { valor: "LANCADO", ajuda: "Virou conta a pagar ou a receber" },
  { valor: "IGNORADO", ajuda: "Fica fora do financeiro" },
];

export function DestinoControl({ documentoId, destinoAtual, motivoAtual, podeDecidir, action }: Props) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Escolher IGNORADO abre o campo de motivo antes de gravar: pedir a
  // justificativa depois do fato é como ela deixa de ser preenchida.
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState(motivoAtual ?? "");

  if (!podeDecidir) {
    return (
      <div>
        <p className="text-[length:var(--fs-ui)] text-fg">{DESTINO_LABEL[destinoAtual]}</p>
        {motivoAtual && <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">{motivoAtual}</p>}
        <p className="text-[length:var(--fs-micro)] text-fg-muted mt-2">
          Só a coordenação do fiscal altera o destino.
        </p>
      </div>
    );
  }

  function aplicar(destino: FiscalDocumentDestination, razao?: string) {
    setErro(null);
    startTransition(async () => {
      const res = await action(documentoId, destino, razao);
      if ("error" in res) setErro(res.error);
      else setPedindoMotivo(false);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {OPCOES.map((o) => {
          const atual = o.valor === destinoAtual;
          return (
            <button
              key={o.valor}
              type="button"
              disabled={pendente || atual}
              onClick={() => (o.valor === "IGNORADO" ? setPedindoMotivo(true) : aplicar(o.valor))}
              title={o.ajuda}
              className={`px-3 py-1.5 rounded-md border text-[length:var(--fs-ui)] font-medium transition-colors ${
                atual
                  ? "border-brand bg-brand-subtle text-brand cursor-default"
                  : "border-border text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-60"
              }`}
            >
              {DESTINO_LABEL[o.valor]}
            </button>
          );
        })}
      </div>

      {destinoAtual === "IGNORADO" && motivoAtual && !pedindoMotivo && (
        <p className="text-[length:var(--fs-helper)] text-fg-secondary mt-3">
          <span className="text-fg-muted">Motivo:</span> {motivoAtual}
        </p>
      )}

      {pedindoMotivo && (
        <div className="mt-4 space-y-2">
          <CampoForm
            label="Por que fica fora do financeiro?"
            htmlFor="motivo"
            helper="Sem isto, ninguém sabe o motivo três meses depois — e o documento vira lixo silencioso."
          >
            <Textarea
              id="motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: nota de teste do emissor, já lançada manualmente no Omie…"
            />
          </CampoForm>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => aplicar("IGNORADO", motivo)} disabled={pendente || !motivo.trim()}>
              {pendente ? "Salvando…" : "Ignorar documento"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPedindoMotivo(false)} disabled={pendente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {erro && <p className="text-[length:var(--fs-helper)] text-danger mt-3">{erro}</p>}
    </div>
  );
}
