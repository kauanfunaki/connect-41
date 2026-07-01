"use client";

import { useState } from "react";
import { AuthField, AUTH_INPUT } from "./AuthShell";
import { LockIcon } from "./icons";

export function PasswordField({
  label,
  autoComplete,
}: {
  label: string;
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);

  return (
    <AuthField label={label} htmlFor="password" icon={<LockIcon />}>
      <input
        id="password"
        name="password"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={autoComplete === "new-password" ? 8 : undefined}
        placeholder="••••••••"
        className={AUTH_INPUT}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        className="text-fg-muted hover:text-fg transition-colors flex-shrink-0"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? (
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2 10s2.7-5.5 8-5.5S18 10 18 10s-2.7 5.5-8 5.5S2 10 2 10Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2 10s2.7-5.5 8-5.5S18 10 18 10s-2.7 5.5-8 5.5S2 10 2 10Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </AuthField>
  );
}
