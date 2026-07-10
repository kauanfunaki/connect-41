"use client";

import { useState } from "react";

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[1][0] : "";
  return (first + second).toUpperCase() || "?";
}

const SHAPE_CLASS = { circle: "rounded-full", lg: "rounded-lg", xl: "rounded-xl" } as const;

type Props = {
  src: string | null;
  name: string;
  size: number;
  shape?: keyof typeof SHAPE_CLASS;
  bordered?: boolean;
  fontSize?: number;
  className?: string;
};

// Avatar/logo com fallback pra iniciais — tanto quando não há foto (src nulo)
// quanto quando a foto existe mas o arquivo 404 (upload perdido, volume
// diferente entre ambientes etc.): sem o onError, o navegador mostrava o
// ícone de imagem quebrada em vez de cair pras iniciais.
export function AvatarImage({ src, name, size, shape = "circle", bordered = true, fontSize, className = "" }: Props) {
  const [broken, setBroken] = useState(false);
  const shapeClass = SHAPE_CLASS[shape];

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={`${shapeClass} object-cover flex-shrink-0 ${bordered ? "border border-border" : ""} ${className}`.trim()}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`${shapeClass} bg-brand-subtle text-brand font-display font-semibold flex items-center justify-center flex-shrink-0 ${className}`.trim()}
      style={{ width: size, height: size, fontSize: fontSize ?? size * 0.36 }}
    >
      {initialsFromName(name)}
    </span>
  );
}
