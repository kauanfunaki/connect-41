"use client";

import { Select } from "@/components/ui/Select";

type Option = { value: string; label: string };

type Props = {
  users: Option[];
  actions: Option[];
  entityTypes: Option[];
  userId: string;
  action: string;
  entityType: string;
};

// Mesmo padrão do CompanyFilterSelect (navega direto ao trocar) aplicado aos
// 3 filtros de Auditoria — sem botão "Aplicar" pra manter consistência com o
// resto do app.
function navigate(paramName: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(paramName, value);
  else url.searchParams.delete(paramName);
  url.searchParams.delete("page");
  window.location.href = url.toString();
}

export function AuditoriaFilters({ users, actions, entityTypes, userId, action, entityType }: Props) {
  const hasFilters = userId || action || entityType;

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <Select
        className="w-auto min-w-[160px]"
        defaultValue={userId}
        onChange={(e) => navigate("userId", e.target.value)}
      >
        <option value="">Todos os usuários</option>
        {users.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </Select>

      <Select
        className="w-auto min-w-[160px]"
        defaultValue={action}
        onChange={(e) => navigate("action", e.target.value)}
      >
        <option value="">Todas as ações</option>
        {actions.map((a) => (
          <option key={a.value} value={a.value}>{a.label}</option>
        ))}
      </Select>

      <Select
        className="w-auto min-w-[160px]"
        defaultValue={entityType}
        onChange={(e) => navigate("entityType", e.target.value)}
      >
        <option value="">Todas as entidades</option>
        {entityTypes.map((e) => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </Select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => { window.location.href = window.location.pathname; }}
          className="text-[12px] text-fg-muted hover:text-fg transition-colors"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
