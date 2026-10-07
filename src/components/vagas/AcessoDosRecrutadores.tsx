"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { salvarAcessoDosRecrutadores } from "@/app/(app)/vagas/[id]/acesso-actions";

type Recrutador = { id: string; name: string };

type Props = {
  vagaId: string;
  restrita: boolean;
  escolhidos: string[];
  recrutadores: Recrutador[];
  /** Coordenador em assinatura somente leitura vê a regra, mas não muda. */
  podeEditar: boolean;
};

type Modo = "todos" | "escolhidos";

// Só aparece para o coordenador do Recrutamento. Por padrão todo recrutador vê
// a vaga; aqui ele restringe a quem escolher — ou a ninguém.
export function AcessoDosRecrutadores({ vagaId, restrita, escolhidos, recrutadores, podeEditar }: Props) {
  const [modo, setModo] = useState<Modo>(restrita ? "escolhidos" : "todos");
  const [marcados, setMarcados] = useState<Set<string>>(new Set(escolhidos));
  const [salvando, startTransition] = useTransition();
  const toast = useToast();

  const mudou =
    (modo === "escolhidos") !== restrita ||
    marcados.size !== escolhidos.length ||
    escolhidos.some((id) => !marcados.has(id));

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function salvar() {
    startTransition(async () => {
      const r = await salvarAcessoDosRecrutadores(vagaId, modo === "escolhidos", [...marcados]);
      if ("error" in r) toast.error(r.error);
      else toast.success("Acesso do Recrutamento salvo.");
    });
  }

  const resumo =
    modo === "todos"
      ? "Todo recrutador vê esta vaga."
      : marcados.size === 0
        ? "Nenhum recrutador vê esta vaga — só o setor que contrata e a coordenação do Recrutamento."
        : `Só ${marcados.size === 1 ? "1 recrutador vê" : `${marcados.size} recrutadores veem`} esta vaga.`;

  return (
    <Card className="p-5 mb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Quem do Recrutamento vê esta vaga</h2>
          <p className="text-[12px] text-fg-muted mt-0.5">{resumo}</p>
        </div>
        <SegmentedControl<Modo>
          label="Quem do Recrutamento vê esta vaga"
          active={modo}
          onChange={(k) => podeEditar && setModo(k)}
          items={[
            { key: "todos", label: "Todos os recrutadores", disabled: !podeEditar },
            { key: "escolhidos", label: "Só os escolhidos", disabled: !podeEditar },
          ]}
        />
      </div>

      {modo === "escolhidos" &&
        (recrutadores.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Não há recrutadores ativos no setor.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-1">
            {recrutadores.map((r) => (
              <Checkbox
                key={r.id}
                id={`recrutador-${r.id}`}
                label={r.name}
                checked={marcados.has(r.id)}
                disabled={!podeEditar}
                onChange={() => alternar(r.id)}
              />
            ))}
          </div>
        ))}

      {podeEditar && mudou && (
        <div className="flex justify-end mt-3">
          <Button variant="primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}
    </Card>
  );
}
