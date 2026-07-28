"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { MODULE_CATALOG } from "@/lib/module-catalog";

type Props = {
  planId: string;
  allowedModuleCodes: string[] | null; // null = plano libera todos os módulos
  action: (planId: string, moduleCodes: string[] | null) => Promise<void>;
};

// Editor inline dos módulos que um plano libera — o plano é o teto (ver
// src/lib/modules.ts), TenantModule por tenant só consegue restringir mais
// dentro do que aqui é permitido, nunca liberar além.
export function PlanModulesEditor({ planId, allowedModuleCodes, action }: Props) {
  const [open, setOpen] = useState(false);
  const [restricted, setRestricted] = useState(allowedModuleCodes !== null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(allowedModuleCodes ?? MODULE_CATALOG.map((m) => m.code))
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(code: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      await action(planId, restricted ? Array.from(selected) : null);
      setSaved(true);
    });
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-brand hover:underline"
      >
        {open ? "Fechar módulos" : "Módulos deste plano"}
      </button>

      {open && (
        <div className="mt-2 border border-border rounded-md p-3 space-y-2.5 max-w-md">
          <Checkbox
            checked={restricted}
            onChange={(e) => { setRestricted(e.target.checked); setSaved(false); }}
            label="Restringir módulos deste plano (desmarcado libera o catálogo inteiro)"
          />

          {restricted && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 max-h-56 overflow-y-auto pl-1">
              {MODULE_CATALOG.map((m) => (
                <Checkbox
                  key={m.code}
                  checked={selected.has(m.code)}
                  onChange={() => toggle(m.code)}
                  label={m.label}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="h-7 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Salvar"}
            </button>
            {saved && !isPending && <span className="text-[11px] text-success">Salvo.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
