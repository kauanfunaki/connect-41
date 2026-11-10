"use client";

import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";

type UserOption = { id: string; name: string };

type Props = {
  users: UserOption[];
  name?: string;
  label?: string;
  defaultSelectedIds?: string[];
  /** O texto da busca — o padrão fala de responsável (agenda, quadros). */
  placeholder?: string;
  /** Quando a busca não acha ninguém. */
  vazio?: string;
};

// Multi-select pesquisável pra formulários (não persiste por toggle como
// AssigneeToggleList/kanban — só mantém seleção local e emite <input hidden>
// pro form pai capturar no submit). Existe porque a lista de checkboxes
// virava inviável com muitos colaboradores (produção real do cliente).
//
// Também é o seletor de "todos do setor, menos…" do Repositório de senhas
// (10/11/2026, pedido do Kauan) — daí o `placeholder`/`vazio` próprios, o
// rótulo ligado ao campo e o teclado: Enter escolhe a primeira pessoa da
// busca, Esc fecha só a lista (as opções somem quando o foco sai do campo,
// então o Tab não chegava nelas).
export function AttendeePicker({
  users,
  name = "attendeeIds",
  label = "Responsáveis",
  defaultSelectedIds = [],
  placeholder = "Buscar responsável…",
  vazio = "Nenhum responsável encontrado.",
}: Props) {
  const [selected, setSelected] = useState<string[]>(defaultSelectedIds);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputId = useId();

  const selectedUsers = useMemo(() => users.filter((u) => selected.includes(u.id)), [users, selected]);
  const normalizedQuery = query.trim().toLowerCase();
  const availableUsers = useMemo(
    () =>
      users.filter(
        (u) => !selected.includes(u.id) && (normalizedQuery === "" || u.name.toLowerCase().includes(normalizedQuery))
      ),
    [users, selected, normalizedQuery]
  );

  function add(userId: string) {
    setSelected((prev) => [...prev, userId]);
    setQuery("");
    setOpen(false);
  }

  function remove(userId: string) {
    setSelected((prev) => prev.filter((id) => id !== userId));
  }

  if (users.length === 0) return null;

  return (
    <div>
      <label htmlFor={inputId} className="block text-label font-medium text-fg mb-1.5">
        {label}
      </label>

      {selectedUsers.map((u) => (
        <input key={u.id} type="hidden" name={name} value={u.id} />
      ))}

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-brand/[0.06] border border-brand/30 text-fs-2 text-fg"
            >
              {u.name}
              <button
                type="button"
                onClick={() => remove(u.id)}
                className="rounded-full text-fg-muted hover:text-danger transition-colors focus-visible:outline-2 focus-visible:outline-brand"
                aria-label={`Remover ${u.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          id={inputId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            // Com algo digitado, o Enter escolhe a primeira da busca em vez de
            // enviar o formulário; com a busca vazia, segue como antes.
            if (e.key === "Enter" && normalizedQuery && availableUsers[0]) {
              e.preventDefault();
              add(availableUsers[0].id);
            } else if (e.key === "Escape" && open) {
              // O `preventDefault` avisa a pilha de camadas (camadas.ts): este
              // Esc fecha a lista, não a janela em volta.
              e.preventDefault();
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          icon={<Search size={14} />}
          className="h-8 text-fs-2"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {open && (
          <div className="absolute z-20 top-[calc(100%+4px)] left-0 right-0 max-h-[176px] overflow-y-auto bg-surface-elevated border border-border-strong rounded-lg shadow-lg p-1.5">
            {availableUsers.length === 0 ? (
              <p className="text-fs-2 text-fg-muted px-2 py-1.5">
                {normalizedQuery ? vazio : "Todos já foram adicionados."}
              </p>
            ) : (
              availableUsers.slice(0, 30).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(u.id)}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-fs-2 text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
                >
                  {u.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
