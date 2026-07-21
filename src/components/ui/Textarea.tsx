"use client";

import { forwardRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

// forwardRef: MentionTextarea (transferencias) precisa do DOM node pra ler
// selectionStart/posicionar o cursor ao inserir uma menção.
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { error = false, className = "", disabled, readOnly, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      disabled={disabled}
      readOnly={readOnly}
      className={`w-full min-h-[76px] px-3 py-2.5 rounded-[10px] border bg-input-bg text-[length:var(--fs-input)] text-fg placeholder:text-fg-muted outline-none transition-colors resize-none ${
        error
          ? "border-danger focus:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
          : "border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
      } ${readOnly ? "bg-transparent border-dashed" : ""} disabled:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      {...rest}
    />
  );
});
