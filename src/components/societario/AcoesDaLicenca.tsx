"use client";

import { useState } from "react";
import { Ban, MoreHorizontal, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";
import { revogarLicenca, reativarLicenca } from "@/app/(app)/licencas/actions";
import { LicencaModal, type LicencaParaEditar, type OrgaoDaLicenca } from "./LicencaForm";

type Props = {
  licenca: LicencaParaEditar & { revogada: boolean };
  orgaos: OrgaoDaLicenca[];
};

export function AcoesDaLicenca({ licenca, orgaos }: Props) {
  const [editando, setEditando] = useState(false);
  const { dialog, requestConfirm } = useConfirm();

  function revogar() {
    requestConfirm(
      {
        title: "Revogar esta licença?",
        description:
          "Ela sai da fila de renovação e fica registrada como revogada hoje. O histórico continua na empresa, e dá para reativar se foi engano.",
        confirmLabel: "Revogar",
        destructive: true,
      },
      async () => {
        const r = await revogarLicenca(licenca.id);
        if (r && "error" in r) throw new Error(r.error);
      }
    );
  }

  function reativar() {
    requestConfirm(
      {
        title: "Reativar esta licença?",
        description: "Ela volta para a fila de renovação pela validade cadastrada.",
        confirmLabel: "Reativar",
      },
      async () => {
        const r = await reativarLicenca(licenca.id);
        if (r && "error" in r) throw new Error(r.error);
      }
    );
  }

  return (
    // "Editar" é botão e Revogar/Reativar vai no "⋯" — o mesmo desenho das
    // linhas de Cadastros (polimento de 30/09): eram três links de texto.
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="secondary" size="xs" type="button" onClick={() => setEditando(true)}>
        <Pencil size={11} /> Editar
      </Button>
      <Popover
        align="right"
        width={180}
        aria-label="Mais ações da licença"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Mais ações"
            aria-expanded={open}
            className={`h-7 w-7 rounded-md border inline-flex items-center justify-center transition-colors ${
              open ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
            }`}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      >
        {({ close }) =>
          licenca.revogada ? (
            <ItemDoMenu
              icone={<RotateCcw />}
              onClick={() => {
                close();
                reativar();
              }}
            >
              Reativar
            </ItemDoMenu>
          ) : (
            <ItemDoMenu
              icone={<Ban />}
              danger
              onClick={() => {
                close();
                revogar();
              }}
            >
              Revogar
            </ItemDoMenu>
          )
        }
      </Popover>
      <LicencaModal open={editando} onClose={() => setEditando(false)} orgaos={orgaos} licenca={licenca} />
      {dialog}
    </div>
  );
}
