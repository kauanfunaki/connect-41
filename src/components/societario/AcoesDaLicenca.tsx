"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
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
    <div className="flex items-center justify-end gap-3">
      <Button variant="link" size="xs" type="button" onClick={() => setEditando(true)}>
        Editar
      </Button>
      {licenca.revogada ? (
        <Button variant="link" size="xs" type="button" onClick={reativar}>
          Reativar
        </Button>
      ) : (
        <Button variant="linkMuted" size="xs" type="button" onClick={revogar}>
          Revogar
        </Button>
      )}
      <LicencaModal open={editando} onClose={() => setEditando(false)} orgaos={orgaos} licenca={licenca} />
      {dialog}
    </div>
  );
}
