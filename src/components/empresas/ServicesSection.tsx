"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import type { ServiceState } from "@/app/(app)/empresas/actions";
import type { ServiceStatus } from "@/generated/prisma/enums";

type ServiceRow = {
  id: string;
  sectorCode: string;
  status: ServiceStatus;
  responsibleUserId: string | null;
};

type SectorOption = { code: string; label: string; color: string };
type UserOption = { id: string; name: string };

type Props = {
  companyId: string;
  services: ServiceRow[];
  sectorLabels: Record<string, string>;
  sectorColors: Record<string, string>;
  /** Setores que o usuário atual pode gerenciar (adicionar/atribuir responsável). */
  manageableSectors: SectorOption[];
  /** Usuários elegíveis como responsável, por setor (já filtrado: membros do setor + admins). */
  usersBySector: Record<string, UserOption[]>;
  addAction: (companyId: string, sectorCode: string) => Promise<ServiceState>;
  assignAction: (serviceId: string, userId: string | null) => Promise<ServiceState>;
};

// "Serviços contratados" com responsável por setor (a "tag" do Acessorias) —
// substitui o card estático anterior por um card interativo: adicionar setor +
// atribuir/trocar responsável, sem sair da ficha da empresa.
export function ServicesSection({
  companyId,
  services,
  sectorLabels,
  sectorColors,
  manageableSectors,
  usersBySector,
  addAction,
  assignAction,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [addingSector, setAddingSector] = useState("");
  const toast = useToast();

  const addedCodes = new Set(services.map((s) => s.sectorCode));
  const availableToAdd = manageableSectors.filter((s) => !addedCodes.has(s.code));

  function handleAdd() {
    if (!addingSector) return;
    startTransition(async () => {
      const result = await addAction(companyId, addingSector);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Setor adicionado.");
      setAddingSector("");
    });
  }

  function handleAssign(serviceId: string, userId: string | null) {
    startTransition(async () => {
      const result = await assignAction(serviceId, userId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(userId ? "Responsável atualizado." : "Responsável removido.");
    });
  }

  return (
    <Card className="p-5">
      <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">Serviços contratados</h2>

      {services.length === 0 ? (
        <p className="text-[length:var(--fs-body)] text-fg-muted mb-3">Nenhum serviço cadastrado.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {services.map((s) => {
            const canManageThis = manageableSectors.some((m) => m.code === s.sectorCode);
            const options = usersBySector[s.sectorCode] ?? [];
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-surface-hover border border-border text-fg-secondary text-[12.5px] font-medium px-2.5 py-1 rounded-full">
                  <span
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{ background: s.status === "ACTIVE" ? (sectorColors[s.sectorCode] ?? "var(--c41-fg-muted)") : "var(--c41-fg-muted)" }}
                  />
                  {sectorLabels[s.sectorCode] ?? s.sectorCode}
                  {s.status !== "ACTIVE" && " · inativo"}
                </span>

                {canManageThis ? (
                  <div className="w-52">
                    <Select
                      defaultValue={s.responsibleUserId ?? ""}
                      disabled={pending}
                      onChange={(e) => handleAssign(s.id, e.target.value || null)}
                    >
                      <option value="">Sem responsável</option>
                      {options.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <span className="text-[11.5px] text-fg-muted">
                    {options.find((u) => u.id === s.responsibleUserId)?.name ?? "Sem responsável"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <div className="flex-1 max-w-[220px]">
            <Select
              value={addingSector}
              onChange={(e) => setAddingSector(e.target.value)}
              disabled={pending}
            >
              <option value="">Adicionar setor…</option>
              {availableToAdd.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || !addingSector}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
          >
            <Plus size={13} />
            Adicionar
          </button>
        </div>
      )}
    </Card>
  );
}
