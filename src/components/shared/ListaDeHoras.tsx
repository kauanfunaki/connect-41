"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { IconButton } from "@/components/ui/IconButton";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { useConfirm } from "@/components/ui/useConfirm";
import { duracaoDoLancamento, type EstadoDaEdicaoDeHoras } from "@/lib/horas/edicao";

export type LinhaDeHoras = {
  id: string;
  quem: string;
  minutos: number;
  /** O dia como a lista mostra ("13/10/2026"). */
  dia: string;
  /** O dia para o campo de edição ("2026-10-13"). */
  diaDoCampo: string;
  nota: string | null;
  podeEditar: boolean;
  podeExcluir: boolean;
};

/**
 * A lista de lançamentos de horas com "Editar" na linha (13/10/2026) — no card
 * do Kanban e no processo do Societário.
 *
 * Corrigir é de quem lançou (e, no card, do gestor do setor); apagar ficou só
 * com o administrador. A lixeira só aparece para quem pode apagar.
 */
export function ListaDeHoras({
  linhas,
  editar,
  excluir,
}: {
  linhas: LinhaDeHoras[];
  editar: (entryId: string, prev: EstadoDaEdicaoDeHoras, form: FormData) => Promise<EstadoDaEdicaoDeHoras>;
  excluir?: (entryId: string) => Promise<EstadoDaEdicaoDeHoras>;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const { dialog, requestConfirm } = useConfirm();

  if (linhas.length === 0) return null;

  return (
    <>
      <ul className="flex flex-col divide-y divide-border text-fs-2">
        {linhas.map((l) =>
          editando === l.id ? (
            <li key={l.id} className="py-2">
              <EdicaoDaLinha linha={l} editar={editar} onFechar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-fg-secondary min-w-0">
                <span className="text-fg tabular-nums">{duracaoDoLancamento(l.minutos)}</span> · {l.quem} · {l.dia}
                {l.nota && ` · ${l.nota}`}
              </span>
              {(l.podeEditar || (l.podeExcluir && excluir)) && (
                <span className="flex flex-shrink-0 items-center gap-1">
                  {l.podeEditar && (
                    <IconButton aria-label="Editar lançamento" title="Editar" onClick={() => setEditando(l.id)}>
                      <Pencil size={14} />
                    </IconButton>
                  )}
                  {l.podeExcluir && excluir && (
                    <IconButton
                      aria-label="Apagar lançamento"
                      title="Apagar"
                      onClick={() =>
                        requestConfirm(
                          {
                            title: `Apagar ${duracaoDoLancamento(l.minutos)} de ${l.quem}?`,
                            description: "O lançamento sai das horas de operação da Gestão. Para corrigir a duração ou o dia, use o Editar.",
                            confirmLabel: "Apagar",
                            destructive: true,
                          },
                          async () => {
                            const r = await excluir(l.id);
                            if (r && "error" in r) throw new Error(r.error);
                          },
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                </span>
              )}
            </li>
          ),
        )}
      </ul>
      {dialog}
    </>
  );
}

function EdicaoDaLinha({
  linha,
  editar,
  onFechar,
}: {
  linha: LinhaDeHoras;
  editar: (entryId: string, prev: EstadoDaEdicaoDeHoras, form: FormData) => Promise<EstadoDaEdicaoDeHoras>;
  onFechar: () => void;
}) {
  const [estado, enviar, enviando] = useActionState(async (prev: EstadoDaEdicaoDeHoras, form: FormData) => {
    const r = await editar(linha.id, prev, form);
    if (r && "ok" in r) onFechar();
    return r;
  }, null);
  const horas = Math.floor(linha.minutos / 60);
  const minutos = linha.minutos % 60;
  const base = `editar-horas-${linha.id}`;

  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-md bg-surface-2 p-3" aria-label={`Editar lançamento de ${linha.quem}`}>
      <FieldGrid columns="sm:grid-cols-[4.5rem_4.5rem_minmax(0,11rem)]">
        <CampoForm label="Horas" htmlFor={`${base}-horas`}>
          <Input id={`${base}-horas`} name="horas" inputMode="decimal" defaultValue={String(horas)} className="tabular-nums" />
        </CampoForm>
        <CampoForm label="Minutos" htmlFor={`${base}-minutos`}>
          <Input id={`${base}-minutos`} name="minutos" inputMode="numeric" defaultValue={String(minutos)} className="tabular-nums" />
        </CampoForm>
        <CampoForm label="Dia" htmlFor={`${base}-dia`}>
          <CampoData id={`${base}-dia`} name="dia" defaultValue={linha.diaDoCampo} />
        </CampoForm>
      </FieldGrid>
      <CampoForm label="O que foi feito" htmlFor={`${base}-nota`}>
        <Input id={`${base}-nota`} name="nota" maxLength={280} defaultValue={linha.nota ?? ""} placeholder="Opcional" />
      </CampoForm>
      {estado && "error" in estado && <Aviso>{estado.error}</Aviso>}
      <FormFooter pending={enviando} size="sm" onCancel={onFechar} semDivisoria />
    </form>
  );
}
