"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { TAMANHO_MAXIMO_DO_MOTIVO } from "@/lib/financeiro/cobranca/regras";

/**
 * Uma decisão da cobrança que pede motivo: baixa por perda (obrigatório),
 * reverter perda, quebrar e desfazer acordo. A action chega por prop, com o id
 * já aplicado — a caixa é a mesma para as quatro.
 */
export function AcaoComMotivo({
  rotulo,
  titulo,
  descricao,
  confirmar,
  motivoObrigatorio = false,
  ajuda,
  variante = "secondary",
  acao,
}: {
  rotulo: React.ReactNode;
  titulo: string;
  descricao: string;
  confirmar: string;
  motivoObrigatorio?: boolean;
  ajuda?: string;
  variante?: "secondary" | "danger";
  acao: (motivo: string) => Promise<{ error: string } | { ok: true }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button variant={variante} size="xs" onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title={titulo} maxWidth="max-w-md">
        <form
          className="flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await acao(motivo);
              if ("error" in r) setErro(r.error);
              else {
                setAberto(false);
                setMotivo("");
              }
            });
          }}
        >
          <p className="text-[13px] text-fg-secondary">{descricao}</p>
          <CampoForm label="Motivo" htmlFor="motivo-da-cobranca" required={motivoObrigatorio} helper={ajuda}>
            <Textarea
              id="motivo-da-cobranca"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={TAMANHO_MAXIMO_DO_MOTIVO}
              required={motivoObrigatorio}
            />
          </CampoForm>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant={variante === "danger" ? "danger" : "primary"} size="sm" disabled={pendente}>
              {pendente ? "Salvando…" : confirmar}
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
