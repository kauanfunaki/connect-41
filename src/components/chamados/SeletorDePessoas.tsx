"use client";

import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Input } from "@/components/ui/Input";
import { Avatar } from "./LinhaDoTempo";

type Pessoa = { id: string; name: string };
// Responsáveis e participantes como fichas (26/10/2026): o "+" abre a lista com
// busca, escolher grava na hora e o "x" da ficha retira. No lugar das caixas de
// marcar com "Salvar" e do botão "Assumir chamado".
export function SeletorDePessoas({ titulo, selecionados, opcoes, nome, vazio, disabled, onAdicionar, onRetirar }: { titulo: string; selecionados: string[]; opcoes: Pessoa[]; nome: (id: string) => string; vazio: string; disabled: boolean; onAdicionar?: (id: string) => void; onRetirar?: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const disponiveis = opcoes.filter(u => !selecionados.includes(u.id) && u.name.toLocaleLowerCase("pt-BR").includes(termo));
  return <div className="space-y-2">
    <h3 className="text-helper font-semibold text-fg-secondary">{titulo}</h3>
    <ul className="flex flex-wrap items-center gap-1.5">
      {selecionados.map(id => <li key={id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-hover py-0.5 pl-0.5 pr-2 text-helper text-fg">
        <Avatar nome={nome(id)} className="size-6 text-micro" /><span className="min-w-0 truncate">{nome(id)}</span>
        {onRetirar && <button type="button" disabled={disabled} aria-label={`Retirar ${nome(id)} de ${titulo.toLocaleLowerCase("pt-BR")}`} onClick={() => onRetirar(id)} className="-mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-[var(--c41-disabled-op)]"><X size={12} /></button>}
      </li>)}
      {!selecionados.length && <li className="text-helper text-fg-muted">{vazio}</li>}
      {onAdicionar && !!opcoes.filter(u => !selecionados.includes(u.id)).length && <li><Popover width={260} aria-label={`Adicionar a ${titulo.toLocaleLowerCase("pt-BR")}`} trigger={({ open, toggle }) => <button type="button" disabled={disabled} aria-expanded={open} aria-label={`Adicionar a ${titulo.toLocaleLowerCase("pt-BR")}`} onClick={() => { setBusca(""); toggle(); }} className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 text-helper font-medium text-fg-secondary transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-[var(--c41-disabled-op)]"><Plus size={13} aria-hidden />Adicionar</button>}>
        {({ close }) => <div className="space-y-2">
          {opcoes.length > 6 && <Input compact autoFocus icon={<Search />} aria-label="Buscar pessoa" placeholder="Buscar pessoa…" value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && disponiveis[0]) { e.preventDefault(); close(); onAdicionar(disponiveis[0].id); } }} />}
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">{disponiveis.map((u, i) => <li key={u.id}><button type="button" autoFocus={opcoes.length <= 6 && i === 0} onClick={() => { close(); onAdicionar(u.id); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui text-fg-secondary hover:bg-surface-hover hover:text-fg focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand"><Avatar nome={u.name} className="size-6 text-micro" /><span className="min-w-0 truncate">{u.name}</span></button></li>)}
            {!disponiveis.length && <li className="px-2 py-1.5 text-helper text-fg-muted">Ninguém encontrado.</li>}</ul>
        </div>}
      </Popover></li>}
    </ul>
  </div>;
}
