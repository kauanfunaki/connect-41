"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, ListChecks } from "lucide-react";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { CustomFieldsSection, type CustomFieldInput } from "@/components/shared/CustomFieldsSection";
import { moverNaLista } from "@/lib/camposCustomizados/ordem";
import type { CampoState } from "@/app/(app)/admin/campos/actions";

export type CampoDoConstrutor = {
  id: string;
  label: string;
  fieldType: CustomFieldInput["fieldType"];
  options: string[];
  required: boolean;
  /** Em quantas fichas o campo está preenchido. */
  preenchidos: number;
  /** Excluir, já preso ao campo; ausente para quem não pode excluir. */
  excluir?: () => Promise<void>;
};

/** O setor dos campos: trocar leva à lista dele, na mesma ficha. */
export function EscolhaDoSetorDosCampos({
  atual,
  opcoes,
  hrefDoSetor,
}: {
  atual: string;
  opcoes: { value: string; label: string }[];
  /** O endereço da tela, faltando só o código do setor. */
  hrefDoSetor: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-label font-medium text-fg">
      Setor
      <Select
        compact
        value={atual}
        onChange={(e) => router.push(`${hrefDoSetor}${encodeURIComponent(e.target.value)}`, { scroll: false })}
        className="w-64 max-w-full"
      >
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

const TIPO: Record<CustomFieldInput["fieldType"], string> = {
  TEXT: "Texto curto",
  TEXTAREA: "Texto longo",
  NUMBER: "Número",
  DATE: "Data",
  SELECT: "Seleção",
  BOOLEAN: "Sim / Não",
};

/**
 * O construtor dos campos customizados (escolha 5A dos Ajustes de 15/10,
 * 20/10/2026): à esquerda os campos de uma ficha num setor, na ordem em que
 * aparecem, para arrastar (ou mover pelas setas, com o foco na alça); à
 * direita a prévia de como ficam na ficha de uma empresa ou pessoa de verdade.
 * Era uma lista com o nome, o tipo e a chave técnica, e a ordem era um número
 * digitado na edição de cada campo.
 *
 * A ordem grava na hora; se o servidor recusar (a tela estava velha), volta a
 * de antes. A página remonta este componente quando a lista muda (`key`).
 */
export function ConstrutorDeCampos({
  campos,
  total,
  ficha,
  exemplo,
  editarHref,
  reordenar,
}: {
  campos: CampoDoConstrutor[];
  /** Quantas fichas deste tipo o setor tem: o "de N" do preenchimento. */
  total: number;
  ficha: "empresa" | "pessoa";
  /** A ficha de verdade que a prévia mostra, com os valores dela. */
  exemplo: { nome: string; valores: Record<string, string | null> } | null;
  /** O endereço do painel de edição, faltando só o id do campo. */
  editarHref: string;
  reordenar: (ids: string[]) => Promise<CampoState>;
}) {
  const [ordem, setOrdem] = useState(() => campos.map((c) => c.id));
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [focar, setFocar] = useState<string | null>(null);
  const inicioDoArraste = useRef<string[] | null>(null);
  const alcas = useRef(new Map<string, HTMLButtonElement>());
  const [, startTransition] = useTransition();
  const toast = useToast();

  const porId = new Map(campos.map((c) => [c.id, c]));
  const visiveis = ordem.map((id) => porId.get(id)).filter((c): c is CampoDoConstrutor => Boolean(c));
  const fichas = ficha === "empresa" ? "empresas" : "pessoas";

  // Mover pelas setas tira a linha do lugar no DOM; o foco volta à alça dela.
  useEffect(() => {
    if (focar) alcas.current.get(focar)?.focus();
  }, [ordem, focar]);

  function gravar(nova: string[], anterior: string[]) {
    startTransition(async () => {
      const r = await reordenar(nova);
      if (r?.error) {
        setOrdem(anterior);
        toast.error(r.error);
      }
    });
  }

  function moverPeloTeclado(e: React.KeyboardEvent, id: string) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const de = ordem.indexOf(id);
    const para = e.key === "ArrowUp" ? de - 1 : de + 1;
    if (para < 0 || para >= ordem.length) return;
    const nova = moverNaLista(ordem, de, para);
    setOrdem(nova);
    setFocar(id);
    setAviso(`${porId.get(id)?.label ?? "Campo"}: posição ${para + 1} de ${nova.length}.`);
    gravar(nova, ordem);
  }

  if (campos.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ListChecks />}
          title={`Nenhum campo a mais na ficha da ${ficha} deste setor`}
          description="Use “+ Novo campo”, no alto da tela, para criar o primeiro."
        />
      </Card>
    );
  }

  const preenchimento = (n: number) =>
    total > 0 ? `preenchido em ${n} de ${total} ${fichas}` : `preenchido em ${n} ${n === 1 ? "ficha" : "fichas"}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <Card as="section" aria-labelledby="campos-da-ficha" className="overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <h2 id="campos-da-ficha" className="text-card-title font-semibold text-fg">
            Campos, na ordem da ficha
          </h2>
          <p className="text-fs-2 text-fg-muted mt-0.5">Arraste pela alça para mudar a ordem, ou use as setas com ela selecionada.</p>
        </div>
        <ol className="divide-y divide-border border-t border-border">
          {visiveis.map((c) => (
            <li
              key={c.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                inicioDoArraste.current = ordem;
                setArrastando(c.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!arrastando || arrastando === c.id) return;
                setOrdem((atual) => moverNaLista(atual, atual.indexOf(arrastando), atual.indexOf(c.id)));
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => {
                const anterior = inicioDoArraste.current;
                inicioDoArraste.current = null;
                setArrastando(null);
                if (anterior && anterior.join() !== ordem.join()) gravar(ordem, anterior);
              }}
              className={`flex items-center gap-3 bg-surface px-3 py-2.5 transition-opacity ${arrastando === c.id ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                ref={(el) => {
                  if (el) alcas.current.set(c.id, el);
                  else alcas.current.delete(c.id);
                }}
                onKeyDown={(e) => moverPeloTeclado(e, c.id)}
                onBlur={() => setFocar(null)}
                aria-label={`Mudar a ordem de ${c.label}: setas para cima e para baixo`}
                className="inline-flex size-7 flex-shrink-0 cursor-grab items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg active:cursor-grabbing"
              >
                <GripVertical size={16} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-fs-3 font-medium text-fg">
                  {c.label}
                  {c.required && <span className="text-danger"> *</span>}
                </p>
                <p className="text-fs-1 text-fg-muted">
                  {TIPO[c.fieldType]}
                  {c.required ? " · obrigatório" : ""} · {preenchimento(c.preenchidos)}
                </p>
              </div>
              {/* Editar abre o painel ao lado (2B); Excluir vai no "⋯". */}
              <AcoesDoItem
                className="flex-shrink-0"
                editar={`${editarHref}${c.id}`}
                excluir={
                  c.excluir
                    ? {
                        action: c.excluir,
                        titulo: `Excluir o campo "${c.label}"?`,
                        descricao: "Todos os valores preenchidos nele serão perdidos.",
                      }
                    : undefined
                }
              />
            </li>
          ))}
        </ol>
        <p className="sr-only" aria-live="polite">
          {aviso}
        </p>
      </Card>

      <Card as="section" aria-labelledby="previa-da-ficha" className="p-5 lg:sticky lg:top-4">
        <h2 id="previa-da-ficha" className="text-card-title font-semibold text-fg">
          Prévia na ficha da {ficha}
        </h2>
        <p className="text-fs-2 text-fg-muted mt-0.5 mb-4">
          {exemplo
            ? `Como aparece em ${exemplo.nome}, com o que já está preenchido.`
            : `Com os campos vazios: ainda não há ${ficha} ligada a este setor.`}
        </p>
        {/* Só para ver: os campos desabilitados, fora de qualquer formulário. */}
        <fieldset disabled className="min-w-0">
          <CustomFieldsSection
            fields={visiveis.map((c) => ({
              id: c.id,
              label: c.label,
              fieldType: c.fieldType,
              options: c.options,
              required: c.required,
              value: exemplo?.valores[c.id] ?? null,
            }))}
          />
        </fieldset>
      </Card>
    </div>
  );
}
