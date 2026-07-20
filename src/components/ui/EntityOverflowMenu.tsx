"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

type ActionResult = { error: string } | null | void;

type Props = {
  deleteAction: () => Promise<ActionResult>;
  nome: string;
  deleteDescription?: string;
  /** Itens extras acima do Excluir (opcional) — ex: outras ações raras da ficha. */
  children?: React.ReactNode;
};

// Menu overflow (⋯) pro cabeçalho de fichas (Empresa/Pessoa): esconde ações
// destrutivas raras atrás de um clique extra, em vez de deixar "Excluir"
// permanentemente ao lado de "Editar" — reduz o risco de clique acidental e
// limpa o cabeçalho. Reusa a mesma confirmação do DeleteButton (fonte única
// de comportamento: erro de FK aparece no diálogo, sucesso faz redirect na
// própria action).
export function EntityOverflowMenu({ deleteAction, nome, deleteDescription, children }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAction();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`"${nome}" excluído.`);
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <Dropdown
        align="right"
        width={180}
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Mais ações"
            title="Mais ações"
            className="h-8 w-8 rounded-md border border-border text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center justify-center"
          >
            <MoreHorizontal size={15} />
          </button>
        )}
      >
        {children}
        <DropdownItem
          danger
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
        >
          Excluir
        </DropdownItem>
      </Dropdown>

      <ConfirmDialog
        open={confirmOpen}
        title={`Excluir "${nome}"?`}
        description={deleteDescription ?? "Esta ação não pode ser desfeita."}
        confirmLabel="Excluir"
        destructive
        pending={pending}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
