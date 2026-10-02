"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/IconButton";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "direita">;

// Campo de senha com o olho para conferir o que se digitou (02/10/2026). Só a
// tela de entrada tinha; troca de senha, portal, cofre do BPO e as chaves de
// integração eram campos cegos. Revela só o que a pessoa digitou neste campo —
// nada vem do servidor.
export function CampoDeSenha({ compact, ...rest }: Props) {
  const [visivel, setVisivel] = useState(false);
  return (
    <Input
      {...rest}
      compact={compact}
      type={visivel ? "text" : "password"}
      direita={
        <IconButton
          size="sm"
          tabIndex={-1}
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar o que foi digitado" : "Mostrar o que foi digitado"}
          title={visivel ? "Ocultar" : "Mostrar"}
        >
          {visivel ? <EyeOff size={15} /> : <Eye size={15} />}
        </IconButton>
      }
    />
  );
}
