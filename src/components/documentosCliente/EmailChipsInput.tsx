"use client";

import { useState } from "react";
import { X } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  name: string;
  id?: string;
  placeholder?: string;
};

// Chips em vez de textarea de texto corrido — cada e-mail vira uma pílula
// removível individualmente, com validação na hora (a textarea antiga
// aceitava qualquer texto e só descartava endereço inválido em silêncio no
// servidor, sem o usuário nunca saber que "avulso.com" nunca chegou a sair).
export function EmailChipsInput({ name, id, placeholder = "contador@empresa.com" }: Props) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function commit(raw: string) {
    const value = raw.trim().replace(/[,;]+$/, "");
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setError(`"${value}" não parece um e-mail válido.`);
      return;
    }
    if (emails.includes(value)) {
      setDraft("");
      return;
    }
    setEmails((prev) => [...prev, value]);
    setDraft("");
    setError(null);
  }

  function remove(value: string) {
    setEmails((prev) => prev.filter((e) => e !== value));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && emails.length > 0) {
      setEmails((prev) => prev.slice(0, -1));
    }
  }

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-1.5 min-h-9 w-full px-2.5 py-1.5 rounded-[10px] border bg-input-bg transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] ${
          error ? "border-danger" : "border-border-strong"
        }`}
      >
        {emails.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-brand-subtle text-brand text-[12px] font-medium"
          >
            {email}
            <button
              type="button"
              onClick={() => remove(email)}
              className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand/20 transition-colors"
              aria-label={`Remover ${email}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {/* eslint-disable-next-line no-restricted-syntax -- campo de digitação inline entre os chips: precisa ficar sem borda/fundo próprios (o container de fora já tem os dois) pra crescer junto com as pílulas na mesma linha. O Input do DS traz altura/borda/fundo fixos que quebrariam esse layout. */}
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={emails.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[140px] bg-transparent outline-none text-[length:var(--fs-input)] text-fg placeholder:text-fg-muted py-1"
        />
      </div>
      {error && <p className="text-[12px] text-danger mt-1">{error}</p>}
      <input type="hidden" id={id} name={name} value={emails.join(",")} readOnly />
    </div>
  );
}
