"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import type { ProcessoState } from "@/app/(app)/processos/actions";

type Props = {
  empresas: Opcao[];
  tipos: { id: string; name: string; prazo: string }[];
  abrirAction: (prev: ProcessoState, form: FormData) => Promise<ProcessoState>;
};

export function NovoProcessoForm({ empresas, tipos, abrirAction }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, action, isPending] = useActionState(abrirAction, null);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setAberto(true)}>
        <Plus size={14} /> Abrir processo
      </Button>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Abrir processo">
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="companyId" className="text-[12px] font-medium text-fg-secondary">
              Empresa
            </label>
            {/* Busca e não select nativo: são centenas de empresas desde a
                importação do Acessórias. */}
            <SearchableSelect id="companyId" name="companyId" options={empresas} placeholder="Buscar empresa…" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="typeId" className="text-[12px] font-medium text-fg-secondary">
              Tipo de processo
            </label>
            <Select id="typeId" name="typeId" defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.prazo}
                </option>
              ))}
            </Select>
          </div>

          {estado?.error && (
            <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
              {estado.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Abrindo…" : "Abrir"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
