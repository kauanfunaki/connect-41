"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Popover } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";

type Setor = { value: string; label: string; cor?: string; ligado: boolean };

/**
 * "Também em…" de um módulo (21/10/2026): os outros setores que usam a mesma
 * tela, ao lado de "Mover para…". Marcar põe a tela no menu daquele setor e
 * libera quem é dele; desmarcar tira. O setor dono não muda — para isso há o
 * "Mover para…". Grava na hora, com a confirmação de sempre, porque mexe em
 * quem abre a tela.
 */
export function TambemEmSetores({
  nome,
  setores,
  disponivel,
  action,
}: {
  nome: string;
  /** Os setores ativos, fora o dono. */
  setores: Setor[];
  /** `false` quando a tabela ainda não existe (deploy antes da migration). */
  disponivel: boolean;
  action: (sectorCode: string, ligar: boolean) => Promise<void>;
}) {
  const { dialog, requestConfirm } = useConfirm();
  if (setores.length === 0) return null;
  const quantos = setores.filter((s) => s.ligado).length;

  function pedir(setor: Setor) {
    const ligar = !setor.ligado;
    requestConfirm(
      ligar
        ? {
            title: `Mostrar "${nome}" também em ${setor.label}?`,
            description: `A tela entra no menu de ${setor.label}, e quem é desse setor passa a abrir, com a mesma permissão que tem no setor. O endereço e os dados não mudam.`,
            confirmLabel: "Mostrar",
          }
        : {
            title: `Tirar "${nome}" de ${setor.label}?`,
            description: `A tela sai do menu de ${setor.label}, e quem é só desse setor perde o acesso. Os dados não mudam.`,
            confirmLabel: "Tirar",
            destructive: true,
          },
      () => action(setor.value, ligar)
    );
  }

  return (
    <>
      <Popover
        align="right"
        width={240}
        aria-label={`Outros setores que usam ${nome}`}
        trigger={({ open, toggle }) => (
          <Button
            variant="secondary"
            size="xs"
            onClick={toggle}
            aria-expanded={open}
            disabled={!disponivel}
            title={disponivel ? undefined : "Ainda não dá para salvar: falta atualizar o banco (migration)."}
            className="whitespace-nowrap"
          >
            <Share2 size={12} /> {quantos > 0 ? `Compartilhado com ${quantos}` : "Compartilhar"}
          </Button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col gap-1 p-1">
            {setores.map((s) => (
              <Checkbox
                key={s.value}
                id={`tambem-${nome}-${s.value}`}
                checked={s.ligado}
                onChange={() => {
                  close();
                  pedir(s);
                }}
                label={
                  <span className="inline-flex items-center gap-2">
                    <span className="block size-2.5 rounded-full" style={{ background: s.cor ?? "var(--c41-fg-muted)" }} aria-hidden />
                    {s.label}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Popover>
      {dialog}
    </>
  );
}
