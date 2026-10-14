"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Popover } from "@/components/ui/Popover";

type Tag = { id: string; name: string; color: string };

type Props = {
  todas: Tag[];
  marcadas: string[];
  alternar: (tagId: string, marcado: boolean) => Promise<void>;
  podeEditar: boolean;
};

/** A etiqueta colorida, no desenho das tags do Kanban (`TagToggleList`). */
function Etiqueta({ tag, children }: { tag: Tag; children?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-2.5 text-fs-2 font-medium has-[button]:pr-1"
      style={{ background: `${tag.color}1A`, color: tag.color, borderColor: `${tag.color}40` }}
    >
      <span aria-hidden className="size-1.5 flex-shrink-0 rounded-full" style={{ background: tag.color }} />
      {tag.name}
      {children}
    </span>
  );
}

/**
 * As tags do candidato no banco de talentos, na coluna da direita da ficha
 * (escolha 1A do Kauan, 14/10/2026): as marcadas à vista e um "+ tag" que abre
 * a busca. Antes a lista inteira de tags disponíveis ficava aberta no topo da
 * ficha. Mesmo catálogo e mesma ação de antes (Administração › Tags, setor
 * Recrutamento).
 */
export function TagsDoCandidato({ todas, marcadas, alternar, podeEditar }: Props) {
  const [selecionadas, setSelecionadas] = useState(() => new Set(marcadas));
  const [busca, setBusca] = useState("");
  const [, startTransition] = useTransition();

  function trocar(tagId: string, marcado: boolean) {
    setSelecionadas((antes) => {
      const depois = new Set(antes);
      if (marcado) depois.add(tagId);
      else depois.delete(tagId);
      return depois;
    });
    startTransition(() => alternar(tagId, marcado));
  }

  const termo = busca.trim().toLowerCase();
  const daPessoa = useMemo(() => todas.filter((t) => selecionadas.has(t.id)), [todas, selecionadas]);
  const disponiveis = useMemo(
    () => todas.filter((t) => !selecionadas.has(t.id) && (termo === "" || t.name.toLowerCase().includes(termo))),
    [todas, selecionadas, termo]
  );

  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-fg">Tags</h2>
      <p className="mb-3 text-helper text-fg-muted">Deixam o candidato fácil de achar no banco de talentos.</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {daPessoa.map((t) => (
          <Etiqueta key={t.id} tag={t}>
            {podeEditar && (
              <button
                type="button"
                onClick={() => trocar(t.id, false)}
                aria-label={`Tirar a tag ${t.name}`}
                className="inline-flex size-4 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
              >
                <X size={11} />
              </button>
            )}
          </Etiqueta>
        ))}

        {daPessoa.length === 0 && !podeEditar && <p className="text-ui text-fg-muted">Nenhuma tag.</p>}

        {podeEditar && (
          <Popover
            width={260}
            aria-label="Adicionar tag"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-fs-2 font-medium transition-colors ${
                  open ? "border-brand/50 bg-brand-subtle text-fg" : "border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
                }`}
              >
                <Plus size={12} /> tag
              </button>
            )}
          >
            {todas.length === 0 ? (
              <p className="text-fs-2 text-fg-muted">Nenhuma tag cadastrada para o Recrutamento. Cadastre em Administração › Tags.</p>
            ) : (
              <div className="space-y-2.5">
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar tag…"
                  icon={<Search size={14} />}
                  compact
                  autoFocus
                  aria-label="Buscar tag"
                />
                <div className="flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
                  {disponiveis.length === 0 ? (
                    <p className="py-1 text-fs-2 text-fg-muted">{termo ? "Nenhuma tag encontrada." : "Todas as tags já estão no candidato."}</p>
                  ) : (
                    disponiveis.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => trocar(t.id, true)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-fs-2 font-medium text-fg-muted transition-colors hover:text-fg hover:bg-surface-hover"
                      >
                        <span aria-hidden className="size-1.5 flex-shrink-0 rounded-full" style={{ background: t.color }} />
                        {t.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </Popover>
        )}
      </div>
    </Card>
  );
}
