"use client";

import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";

type Destino = { value: string; label: string; cor?: string };

/**
 * "Mover para…" de um módulo (escolha 4A dos Ajustes de 15/10, 20/10/2026):
 * os setores ativos, cada um com a sua cor, num menu. Era um seletor cinza com
 * o setor atual em toda linha de Módulos — o "seletor simplório" do pedido.
 * A confirmação é a de antes: mover tira o acesso de quem é só do setor atual.
 */
export function MoverModuloPara({
  nome,
  destinos,
  action,
}: {
  nome: string;
  /** Os setores ativos, fora o que opera o módulo hoje. */
  destinos: Destino[];
  action: (sectorCode: string) => Promise<void>;
}) {
  const { dialog, requestConfirm } = useConfirm();
  if (destinos.length === 0) return null;

  function pedir(destino: Destino) {
    requestConfirm(
      {
        title: `Mover "${nome}" para ${destino.label}?`,
        description:
          "O módulo passa a aparecer no menu desse setor, e só quem é dele (ou administrador) consegue abrir. Quem é só do setor atual perde o acesso. Os dados não mudam.",
        confirmLabel: "Mover",
      },
      () => action(destino.value)
    );
  }

  return (
    <>
      <Popover
        align="right"
        width={220}
        aria-label={`Mover ${nome} para outro setor`}
        trigger={({ open, toggle }) => (
          <Button variant="secondary" size="xs" onClick={toggle} aria-expanded={open} className="whitespace-nowrap">
            <ArrowRightLeft size={12} /> Mover
          </Button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col gap-0.5">
            {destinos.map((d) => (
              <ItemDoMenu
                key={d.value}
                icone={<span className="block size-2.5 rounded-full" style={{ background: d.cor ?? "var(--c41-fg-muted)" }} />}
                onClick={() => {
                  close();
                  pedir(d);
                }}
              >
                {d.label}
              </ItemDoMenu>
            ))}
          </div>
        )}
      </Popover>
      {dialog}
    </>
  );
}
