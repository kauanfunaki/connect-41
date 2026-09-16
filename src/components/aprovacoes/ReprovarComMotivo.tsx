"use client";

import { useState, useTransition } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { TAMANHO_MAXIMO_DO_MOTIVO } from "@/lib/financeiro/aprovacao/regras";

/**
 * Reprovar pede motivo, então não cabe no diálogo de confirmação simples.
 * A action chega por prop: a mesma caixa serve a coordenação e o portal.
 */
export function ReprovarComMotivo({
  entryId,
  descricao,
  acao,
  tamanho = "xs",
}: {
  entryId: string;
  /** O que está sendo reprovado, em uma linha — fornecedor e valor. */
  descricao: string;
  acao: (entryId: string, motivo: string) => Promise<{ error: string } | { ok: true }>;
  tamanho?: "xs" | "sm";
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button variant="danger" size={tamanho} onClick={() => setAberto(true)}>
        <XCircle size={12} /> Reprovar
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Reprovar conta" maxWidth="max-w-md">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await acao(entryId, motivo);
              if ("error" in r) setErro(r.error);
              else {
                setAberto(false);
                setMotivo("");
              }
            });
          }}
        >
          <p className="text-[13px] text-fg-secondary">{descricao}</p>
          <CampoForm label="Motivo" htmlFor={`motivo-${entryId}`} required helper="Quem lançou a conta recebe este motivo para corrigir ou cancelar.">
            <Textarea
              id={`motivo-${entryId}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={TAMANHO_MAXIMO_DO_MOTIVO}
              required
            />
          </CampoForm>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={pendente}>
              {pendente ? "Reprovando…" : "Reprovar"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAberto(false)} disabled={pendente}>
              Voltar
            </Button>
            {erro && <span className="text-[12px] text-danger">{erro}</span>}
          </div>
        </form>
      </Modal>
    </>
  );
}
