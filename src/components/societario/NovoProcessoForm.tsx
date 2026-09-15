"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import type { ProcessoState } from "@/app/(app)/processos/actions";
import { CamposDoProcesso } from "./CamposDoProcesso";

type Props = {
  empresas: Opcao[];
  tipos: { id: string; name: string; prazo: string }[];
  responsaveis: { id: string; name: string }[];
  /** Quem abre fica como responsável, a menos que escolha outro. */
  responsavelPadrao: string;
  abrirAction: (prev: ProcessoState, form: FormData) => Promise<ProcessoState>;
};

export function NovoProcessoForm({ empresas, tipos, responsaveis, responsavelPadrao, abrirAction }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, action, isPending] = useActionState(abrirAction, null);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setAberto(true)}>
        <Plus size={14} /> Abrir processo
      </Button>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Abrir processo" maxWidth="max-w-lg">
        <form action={action} className="flex flex-col gap-4">
          <CampoForm label="Empresa" htmlFor="companyId" required>
            {/* Busca e não select nativo: são centenas de empresas desde a
                importação do Acessórias. */}
            <SearchableSelect id="companyId" name="companyId" options={empresas} placeholder="Buscar empresa…" />
          </CampoForm>

          <CampoForm label="Tipo de processo" htmlFor="typeId" required>
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
          </CampoForm>

          <CamposDoProcesso
            prefixo="novo"
            responsaveis={responsaveis}
            valores={{ titulo: "", responsavelId: responsavelPadrao, prioridade: "NORMAL", prazoCombinado: "" }}
          />

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
