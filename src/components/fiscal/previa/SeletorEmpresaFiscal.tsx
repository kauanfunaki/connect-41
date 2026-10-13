"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Check, ChevronDown, Search, Star } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { buscarEmpresas, indexarEmpresas } from "@/lib/fiscal/previa/empresasFavoritas";
import type { Cenario } from "@/lib/fiscal/previa/cenario";

type Props = {
  empresas: Cenario["empresas"];
  value: string;
  favoritas: string[];
  disabled?: boolean;
  onChange: (id: string) => void;
  onFavoritar: (id: string) => void;
};

function ListaDeEmpresas({ indice, value, favoritas, onChange, onFavoritar, close }: Omit<Props, "empresas" | "disabled"> & { indice: ReturnType<typeof indexarEmpresas>; close: () => void }) {
  const [busca, setBusca] = useState("");
  const termo = useDeferredValue(busca);
  const resultado = useMemo(() => buscarEmpresas(indice, termo, favoritas), [indice, termo, favoritas]);
  return <div className="space-y-3">
    <Input autoFocus compact icon={<Search />} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CNPJ da empresa" aria-label="Buscar empresa por nome ou CNPJ" />
    <p className="text-helper text-fg-muted">Use a estrela para manter suas empresas favoritas no topo.</p>
    <ul aria-label="Empresas encontradas" aria-busy={termo !== busca} className="scroll-y max-h-64 overflow-y-auto space-y-1">
      {resultado.empresas.map((empresa) => {
        const favorita = favoritas.includes(empresa.id);
        return <li key={empresa.id} className={`flex items-center gap-1 rounded-md ${value === empresa.id ? "bg-selected-bg" : "hover:bg-surface-hover"}`}>
          <button type="button" aria-pressed={value === empresa.id} onClick={() => { onChange(empresa.id); close(); }} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2.5 text-left text-ui text-fg">
            <span className="min-w-0 flex-1 break-words">{empresa.nome}</span>{value === empresa.id && <Check size={15} aria-hidden className="shrink-0 text-brand" />}
          </button>
          <IconButton title={`${favorita ? "Remover dos favoritos" : "Favoritar"}: ${empresa.nome}`} aria-pressed={favorita} className={favorita ? "mr-1 text-warning-fg" : "mr-1"} onClick={() => onFavoritar(empresa.id)}><Star size={16} fill={favorita ? "currentColor" : "none"} /></IconButton>
        </li>;
      })}
      {resultado.total === 0 && <li className="px-2 py-4 text-ui text-fg-secondary">Nenhuma empresa encontrada.</li>}
    </ul>
    {resultado.total > resultado.empresas.length && <p className="text-helper text-fg-muted">Mostrando {resultado.empresas.length} de {resultado.total} empresas. Refine a busca para encontrar as demais.</p>}
  </div>;
}

export function SeletorEmpresaFiscal({ empresas, disabled, ...props }: Props) {
  const indice = useMemo(() => indexarEmpresas(empresas), [empresas]);
  const atual = empresas.find((e) => e.id === props.value);
  return <div className="[&>span]:w-full"><Popover width={420} aria-label="Selecionar empresa" trigger={({ open, toggle }) => <button id="fiscal-empresa" type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={toggle} className="mt-1.5 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-input-bg px-3 text-left text-input text-fg disabled:cursor-not-allowed disabled:opacity-[var(--c41-disabled-op)]">
    <span className="truncate">{atual?.nome ?? "Selecionar empresa"}</span><ChevronDown aria-hidden size={15} className="shrink-0 text-fg-muted" />
  </button>}>
    {({ close }) => <ListaDeEmpresas {...props} indice={indice} close={close} />}
  </Popover></div>;
}
