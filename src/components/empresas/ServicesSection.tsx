"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import type { ServiceState } from "@/app/(app)/empresas/actions";
import type { ServiceStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";

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
      <h2 className="text-section font-semibold text-fg mb-4">Serviços contratados</h2>

      {services.length === 0 ? (
        <p className="text-body text-fg-muted mb-4">Nenhum serviço cadastrado.</p>
      ) : (
        // Linhas com a altura do Select (min-h-9): quem só lê o responsável
        // (texto) e quem pode trocar (Select) ficam com o mesmo ritmo.
        <div className="divide-y divide-border mb-4">
          {services.map((s) => {
            const canManageThis = manageableSectors.some((m) => m.code === s.sectorCode);
            const options = usersBySector[s.sectorCode] ?? [];
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 flex-wrap min-h-9 py-2 first:pt-0 last:pb-0">
                <span className="inline-flex items-center gap-1.5 bg-surface-hover border border-border text-fg-secondary text-fs-2 font-medium px-2.5 py-1 rounded-full">
                  <span
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{ background: s.status === "ACTIVE" ? (sectorColors[s.sectorCode] ?? "var(--c41-fg-muted)") : "var(--c41-fg-muted)" }}
                  />
                  {sectorLabels[s.sectorCode] ?? s.sectorCode}
                  {s.status !== "ACTIVE" && " · inativo"}
                </span>

                {canManageThis ? (
                  <div className="w-full sm:w-56">
                    <Select
                      aria-label={`Responsável — ${sectorLabels[s.sectorCode] ?? s.sectorCode}`}
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
                  <span className="text-helper text-fg-muted">
                    {options.find((u) => u.id === s.responsibleUserId)?.name ?? "Sem responsável"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {availableToAdd.length > 0 && (
        // Select e botão no mesmo tamanho (h-9): o botão era `sm` (h-8) ao
        // lado de um Select de formulário, 4px mais baixo.
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
          <div className="w-full sm:w-56">
            <Select
              aria-label="Setor a adicionar"
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
          <Button
            variant="secondary"
            onClick={handleAdd}
            disabled={pending || !addingSector}
          >
            <Plus size={14} />
            Adicionar
          </Button>
        </div>
      )}
    </Card>
  );
}
