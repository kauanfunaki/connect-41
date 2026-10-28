"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import type { EstadoDosQuadros } from "@/app/(app)/setor/[code]/quadros-actions";

/**
 * O interruptor do coordenador nos Quadros do setor (28/10/2026): ligado (o
 * padrão), os colaboradores criam tarefas e atividades e editam as colunas;
 * desligado, só quem coordena. Grava na hora.
 */
export function QuadrosDosColaboradores({
  sectorCode,
  liberado: inicial,
  alterar,
}: {
  sectorCode: string;
  liberado: boolean;
  alterar: (sectorCode: string, liberado: boolean) => Promise<EstadoDosQuadros>;
}) {
  const [liberado, setLiberado] = useState(inicial);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();

  return (
    <div className="flex flex-col gap-1">
      <Switch
        checked={liberado}
        disabled={pendente}
        rotulo="Colaboradores criam e editam tarefas"
        onCheckedChange={(novo) => {
          setLiberado(novo);
          startTransition(async () => {
            const r = await alterar(sectorCode, novo);
            if (r && "erro" in r) {
              setLiberado(!novo);
              toast.error(r.erro);
              return;
            }
            toast.success(novo ? "Os colaboradores criam e editam tarefas." : "Só quem coordena cria e edita tarefas.");
          });
        }}
      />
      <p className="text-helper text-fg-muted max-w-[46ch]">
        {liberado
          ? "Ligado: quem é do setor cria tarefas e atividades e mexe nas colunas. Espaços, pastas e exclusões seguem com a coordenação."
          : "Desligado: só quem coordena cria tarefas e atividades e mexe nas colunas. Os colaboradores seguem movendo e comentando."}
      </p>
    </div>
  );
}
