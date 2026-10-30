"use client";

import { useState } from "react";
import { Ban, Bot, Pencil, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";
import { imprimirAlvaraPeloRobo, revogarLicenca, reativarLicenca } from "@/app/(app)/licencas/actions";
import { LicencaModal, type LicencaParaEditar, type OrgaoDaLicenca } from "./LicencaForm";

type Props = {
  /** `alvara`: o robô do Societário sabe imprimir (30/10/2026). */
  licenca: LicencaParaEditar & { revogada: boolean; alvara?: boolean };
  orgaos: OrgaoDaLicenca[];
};

export function AcoesDaLicenca({ licenca, orgaos }: Props) {
  const [editando, setEditando] = useState(false);
  const { dialog, requestConfirm } = useConfirm();
  const toast = useToast();

  function imprimirPeloRobo() {
    requestConfirm(
      {
        title: "Pedir ao robô a impressão do alvará?",
        description:
          "A máquina do TI abre o site da prefeitura com a inscrição municipal da empresa, marca o aceite de acessibilidade em nome do cliente e guarda o PDF em Arquivos › Societário. O aceite fica registrado na trilha.",
        confirmLabel: "Pedir ao robô",
      },
      async () => {
        const r = await imprimirAlvaraPeloRobo(licenca.id);
        if ("error" in r) throw new Error(r.error);
        toast.success(r.texto);
      }
    );
  }

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
        <Pencil size={12} /> Editar
      </Button>
      <MenuDeMaisAcoes align="right" width={200} aria-label="Mais ações da licença">
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
            <>
              {licenca.alvara && (
                <ItemDoMenu
                  icone={<Bot />}
                  onClick={() => {
                    close();
                    imprimirPeloRobo();
                  }}
                >
                  Imprimir pelo robô
                </ItemDoMenu>
              )}
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
            </>
          )
        }
      </MenuDeMaisAcoes>
      <LicencaModal open={editando} onClose={() => setEditando(false)} orgaos={orgaos} licenca={licenca} />
      {dialog}
    </div>
  );
}
