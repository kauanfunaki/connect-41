"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** Os limites do `dadosSchema` (lib/chamados/regras.ts): até 20 tags de até 60 caracteres. */
export const LIMITE_DE_TAGS = 20, LIMITE_DA_TAG = 60;

/**
 * Junta o que se digitou às tags que já existem: separa por vírgula, tira os
 * espaços das pontas, corta no limite de caracteres e deixa de fora a repetida
 * (sem diferença de maiúscula) e o que passar de 20.
 */
export function juntarTags(atuais: string[], digitado: string): string[] {
  const novas = [...atuais];
  for (const parte of digitado.split(",")) {
    const tag = parte.trim().slice(0, LIMITE_DA_TAG).trim();
    if (!tag || novas.length >= LIMITE_DE_TAGS) continue;
    if (novas.some(t => t.toLocaleLowerCase("pt-BR") === tag.toLocaleLowerCase("pt-BR"))) continue;
    novas.push(tag);
  }
  return novas;
}

/**
 * Tags como etiquetas (26/11/2026, melhoria-809): digita, e Enter ou vírgula
 * vira etiqueta; o X tira; Backspace no campo vazio tira a última. Sair do
 * campo guarda o que ficou digitado. O valor continua a lista de textos de
 * antes (`DadosDoChamado.tags`). Era um campo de texto separado por vírgula.
 * O desenho é o das etiquetas do `EmailChipsInput` (documentos do cliente).
 */
export function CampoDeTags({ id, valor, onChange, disabled = false }: { id: string; valor: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [rascunho, setRascunho] = useState("");
  const cheio = valor.length >= LIMITE_DE_TAGS;
  function guardar(texto: string) {
    const novas = juntarTags(valor, texto);
    if (novas.length !== valor.length) onChange(novas);
    setRascunho("");
  }
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      // O Enter não envia o formulário em volta: aqui ele cria a etiqueta.
      e.preventDefault();
      guardar(rascunho);
    } else if (e.key === "Backspace" && !rascunho && valor.length) {
      onChange(valor.slice(0, -1));
    }
  }
  return <div className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-input-bg px-2 py-1 transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] ${disabled ? "cursor-not-allowed opacity-[var(--c41-disabled-op)]" : ""}`}>
    {valor.length > 0 && <ul aria-label="Tags" className="contents">{valor.map(tag => <li key={tag} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-surface-hover pl-2.5 pr-1 text-fs-2 font-medium text-fg">
      <span className="truncate" title={tag}>{tag}</span>
      <button type="button" disabled={disabled} aria-label={`Tirar a tag ${tag}`} onClick={() => onChange(valor.filter(t => t !== tag))}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-border hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><X size={11} aria-hidden /></button>
    </li>)}</ul>}
    {/* eslint-disable-next-line no-restricted-syntax -- campo de digitação entre as etiquetas, sem borda nem fundo próprios (a caixa de fora tem os dois), como no EmailChipsInput: o Input do DS traz altura, borda e fundo fixos. */}
    <input id={id} type="text" value={rascunho} disabled={disabled || cheio} maxLength={LIMITE_DA_TAG * 4} autoComplete="off"
      aria-describedby={`${id}-dica`}
      onChange={e => { const texto = e.target.value; if (texto.includes(",")) { const partes = texto.split(","); guardar(partes.slice(0, -1).join(",")); setRascunho(partes.at(-1) ?? ""); } else setRascunho(texto); }}
      onKeyDown={teclas} onBlur={() => { if (rascunho.trim()) guardar(rascunho); }}
      placeholder={cheio ? `Limite de ${LIMITE_DE_TAGS} tags` : "Enter adiciona"}
      className="h-7 min-w-32 flex-1 bg-transparent text-input text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed sm:text-ui" />
    <span id={`${id}-dica`} className="sr-only">Enter ou vírgula adiciona a tag; Backspace no campo vazio tira a última.</span>
  </div>;
}
