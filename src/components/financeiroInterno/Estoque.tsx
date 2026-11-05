"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoData } from "@/components/ui/CampoData";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FormFooter } from "@/components/ui/FormFooter";
import { useToast } from "@/components/ui/Toast";
import type { ActionState } from "@/lib/actionState";
import { MOVIMENTOS, TIPOS_DE_ITEM, movimentosDoItem, type TipoDeMovimento } from "@/lib/financeiroInterno/estoque";

type Acao = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** Fecha o painel e avisa quando a ação termina sem erro (o padrão das telas de cadastro). */
function useAoTerminar(isPending: boolean, state: ActionState, aoTerminar: () => void) {
  const estavaEnviando = useRef(false);
  useEffect(() => {
    if (estavaEnviando.current && !isPending && !state?.error) aoTerminar();
    estavaEnviando.current = isPending;
  }, [isPending, state, aoTerminar]);
}

export type ItemNoFormulario = {
  kind: string;
  name: string;
  category: string;
  assetTag: string | null;
  serialNumber: string | null;
  location: string | null;
  unit: string;
  minQuantity: number | null;
  purchaseDate: string | null;
  purchaseValue: string | null;
  supplier: string | null;
  notes: string | null;
};

/**
 * Cadastrar ou editar um item do estoque (05/11/2026), num painel ao lado.
 * Quantidade e situação não se editam aqui: mudam por movimento, para o
 * histórico contar o que aconteceu.
 */
export function FormularioDoItem({ item, categorias, action }: { item?: ItemNoFormulario; categorias: string[]; action: Acao }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState(action, null);
  const [tipo, setTipo] = useState(item?.kind ?? "patrimonio");
  const toast = useToast();
  useAoTerminar(isPending, state, () => {
    setAberto(false);
    toast.success(item ? "Item salvo." : "Item cadastrado.");
  });
  const novo = !item;

  return (
    <>
      {novo ? (
        <Button onClick={() => setAberto(true)}>
          <Plus size={14} aria-hidden /> Novo item
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>
          <Pencil size={13} aria-hidden /> Editar
        </Button>
      )}
      <SlideOver open={aberto} onClose={() => setAberto(false)} title={novo ? "Novo item do estoque" : "Editar item"} width="max-w-lg">
        <form action={formAction} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label font-medium text-fg mb-1">O que é</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo do item">
              {Object.entries(TIPOS_DE_ITEM).map(([v, rotulo]) => (
                <label key={v} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-ui transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${tipo === v ? "border-brand bg-brand-subtle text-brand font-medium" : "border-border text-fg-secondary hover:bg-surface-hover"} ${!novo && tipo !== v ? "opacity-50" : ""}`}>
                  <input type="radio" name="kind" value={v} checked={tipo === v} onChange={() => setTipo(v)} disabled={!novo && tipo !== v} className="sr-only" />
                  {rotulo}
                </label>
              ))}
            </div>
            <p className="text-fs-1 text-fg-muted">
              {tipo === "patrimonio" ? "Uma coisa só, com número de patrimônio: notebook, monitor, cadeira." : "Por quantidade: papel, toner, cabos."}
              {!novo && " O tipo não muda depois de cadastrado."}
            </p>
          </fieldset>

          <CampoForm label="Nome" htmlFor="estoque-nome" required>
            <Input id="estoque-nome" name="name" defaultValue={item?.name ?? ""} maxLength={160} required placeholder={tipo === "patrimonio" ? "Notebook Dell Latitude 5440" : "Papel A4 (resma)"} />
          </CampoForm>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Categoria" htmlFor="estoque-categoria" required>
              <CampoComSugestoes id="estoque-categoria" name="category" defaultValue={item?.category ?? ""} sugestoes={categorias} maxLength={80} required />
            </CampoForm>
            <CampoForm label="Onde fica" htmlFor="estoque-local">
              <Input id="estoque-local" name="location" defaultValue={item?.location ?? ""} maxLength={120} placeholder="Sala 2, armário da copa…" />
            </CampoForm>
          </div>

          {tipo === "patrimonio" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoForm label="Nº de patrimônio" htmlFor="estoque-patrimonio" helper="A etiqueta do item. Não se repete.">
                <Input id="estoque-patrimonio" name="assetTag" defaultValue={item?.assetTag ?? ""} maxLength={60} />
              </CampoForm>
              <CampoForm label="Nº de série" htmlFor="estoque-serie">
                <Input id="estoque-serie" name="serialNumber" defaultValue={item?.serialNumber ?? ""} maxLength={120} />
              </CampoForm>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {novo && (
                <CampoForm label="Quantidade" htmlFor="estoque-quantidade" helper="O que há hoje.">
                  <CampoNumero id="estoque-quantidade" name="quantity" min={0} defaultValue="0" />
                </CampoForm>
              )}
              <CampoForm label="Unidade" htmlFor="estoque-unidade">
                <Input id="estoque-unidade" name="unit" defaultValue={item?.unit ?? "un"} maxLength={20} />
              </CampoForm>
              <CampoForm label="Mínimo" htmlFor="estoque-minimo" helper="Abaixo disto, avisa para repor.">
                <CampoNumero id="estoque-minimo" name="minQuantity" min={0} defaultValue={item?.minQuantity?.toString() ?? ""} />
              </CampoForm>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Comprado em" htmlFor="estoque-compra">
              <CampoData id="estoque-compra" name="purchaseDate" defaultValue={item?.purchaseDate ?? ""} />
            </CampoForm>
            <CampoForm label="Valor de compra" htmlFor="estoque-valor">
              <Input id="estoque-valor" name="purchaseValue" defaultValue={item?.purchaseValue ?? ""} inputMode="decimal" placeholder="0,00" prefix="R$" />
            </CampoForm>
          </div>
          <CampoForm label="Fornecedor" htmlFor="estoque-fornecedor">
            <Input id="estoque-fornecedor" name="supplier" defaultValue={item?.supplier ?? ""} maxLength={160} />
          </CampoForm>
          <CampoForm label="Observações" htmlFor="estoque-notas">
            <Textarea id="estoque-notas" name="notes" defaultValue={item?.notes ?? ""} rows={3} maxLength={4000} />
          </CampoForm>
          <FormFooter pending={isPending} submitLabel={novo ? "Cadastrar" : "Salvar"} pendingLabel="Salvando…" onCancel={() => setAberto(false)} erro={state?.error} />
        </form>
      </SlideOver>
    </>
  );
}

/** Quais campos cada movimento pede. */
function pede(tipo: TipoDeMovimento | "", kind: string) {
  const material = kind === "material";
  return {
    quantidade: material && (tipo === "ENTRADA" || tipo === "SAIDA" || tipo === "BAIXA" || tipo === "CONFERENCIA"),
    pessoa: tipo === "ENTREGA" || tipo === "EMPRESTIMO",
    local: tipo === "ENTRADA" || tipo === "ENTREGA" || tipo === "EMPRESTIMO" || tipo === "DEVOLUCAO" || tipo === "MANUTENCAO" || tipo === "CONFERENCIA",
  };
}

/**
 * Registrar o que aconteceu com o item (05/11/2026): só os movimentos que valem
 * para ele agora (`movimentosDoItem`), e só os campos que cada um pede.
 */
export function MovimentarItem({
  item,
  pessoas,
  action,
}: {
  item: { name: string; kind: string; status: string; quantity: number; unit: string; location: string | null };
  pessoas: { id: string; name: string }[];
  action: Acao;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState(action, null);
  const opcoes = movimentosDoItem(item);
  const [tipo, setTipo] = useState<TipoDeMovimento | "">(opcoes[0] ?? "");
  const toast = useToast();
  useAoTerminar(isPending, state, () => {
    setAberto(false);
    toast.success("Movimento registrado.");
  });
  if (opcoes.length === 0) return null;
  const campos = pede(tipo, item.kind);

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}>
        <ArrowLeftRight size={13} aria-hidden /> Movimentar
      </Button>
      <SlideOver open={aberto} onClose={() => setAberto(false)} title={`Movimentar: ${item.name}`} width="max-w-md">
        <form action={formAction} className="flex flex-col gap-4">
          <CampoForm label="O que aconteceu" htmlFor="mov-tipo" required>
            <Select id="mov-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeMovimento)} required>
              {opcoes.map((o) => (
                <option key={o} value={o}>
                  {MOVIMENTOS[o]}
                </option>
              ))}
            </Select>
          </CampoForm>
          {campos.quantidade && (
            <CampoForm
              label={tipo === "CONFERENCIA" ? "Quantidade contada" : "Quantidade"}
              htmlFor="mov-quantidade"
              required
              helper={`Hoje: ${item.quantity} ${item.unit}.`}
            >
              <CampoNumero id="mov-quantidade" name="quantidade" min={0} suffix={item.unit} required />
            </CampoForm>
          )}
          {campos.pessoa && (
            <>
              <CampoForm label="Com quem vai ficar" htmlFor="mov-pessoa" helper="Uma pessoa do Connect, ou escreva o nome abaixo.">
                <Select id="mov-pessoa" name="holderUserId" defaultValue="" busca>
                  <option value="">Escolha…</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Ou o nome" htmlFor="mov-nome">
                <Input id="mov-nome" name="holderName" maxLength={120} placeholder="Quem não tem acesso ao Connect" />
              </CampoForm>
            </>
          )}
          {campos.local && (
            <CampoForm label="Onde fica agora" htmlFor="mov-local">
              <Input id="mov-local" name="location" defaultValue={item.location ?? ""} maxLength={120} />
            </CampoForm>
          )}
          <CampoForm label="Observação" htmlFor="mov-nota">
            <Textarea id="mov-nota" name="note" rows={2} maxLength={2000} />
          </CampoForm>
          <FormFooter pending={isPending} submitLabel="Registrar" pendingLabel="Registrando…" onCancel={() => setAberto(false)} erro={state?.error} />
        </form>
      </SlideOver>
    </>
  );
}
