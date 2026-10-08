"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { FormFooter } from "@/components/ui/FormFooter";
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
  tamanho = "xs",
  acao,
}: {
  rotulo: React.ReactNode;
  titulo: string;
  descricao: string;
  confirmar: string;
  motivoObrigatorio?: boolean;
  ajuda?: string;
  variante?: "secondary" | "danger";
  /** `sm` quando divide a linha com outros botões `sm` — na ficha do título, ao lado de "Criar acordo". */
  tamanho?: "xs" | "sm";
  acao: (motivo: string) => Promise<{ error: string } | { ok: true }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button variant={variante} size={tamanho} onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title={titulo} maxWidth="max-w-md">
        <form
          className="flex flex-col gap-4"
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
          <p className="text-ui text-fg-secondary">{descricao}</p>
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
          {/* "Voltar", e não "Cancelar": ao lado de "Desfazer acordo" ou
              "Baixar por perda", "Cancelar" se lê como mais uma decisão. */}
          <FormFooter
            pending={pendente}
            submitLabel={confirmar}
            submitVariant={variante === "danger" ? "danger" : "primary"}
            cancelLabel="Voltar"
            onCancel={() => setAberto(false)}
            erro={erro}
          />
        </form>
      </Modal>
    </>
  );
}
