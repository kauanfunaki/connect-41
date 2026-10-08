"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Smartphone, Sun } from "lucide-react";
import { applyPreferencia, readPreferencia, type PreferenciaDeTema } from "@/lib/theme";
import { RadioGroup } from "@/components/ui/RadioGroup";

const OPCOES: { valor: PreferenciaDeTema; rotulo: string; icone: React.ReactNode }[] = [
  { valor: "system", rotulo: "Do aparelho", icone: <Smartphone /> },
  { valor: "light", rotulo: "Claro", icone: <Sun /> },
  { valor: "dark", rotulo: "Escuro", icone: <Moon /> },
];

// A preferência mora no cookie, que o servidor desta tela não lê: no servidor
// nenhuma opção sai marcada, e o navegador marca a gravada logo depois da
// hidratação — sem a diferença entre os dois que o React acusaria.
const semAssinatura = () => () => {};
const nadaNoServidor = () => null;

/**
 * O tema do portal em Minha conta (12A da página de decisões, 08/10/2026):
 * Do aparelho · Claro · Escuro, e "Do aparelho" é o padrão de quem nunca
 * escolheu (ver `lib/theme.ts`). O mesmo cookie da equipe.
 *
 * O `RadioGroup` em cartões, como a escolha de cliente do login: cada opção é
 * um alvo de 44px, com a escolhida marcada na borda — a tela é aberta no
 * celular. Escolher já aplica; não há "salvar".
 */
export function TemaDoPortal() {
  const gravada = useSyncExternalStore(semAssinatura, readPreferencia, nadaNoServidor);
  const [escolhida, setEscolhida] = useState<PreferenciaDeTema | null>(null);
  const atual = escolhida ?? gravada;

  function escolher(valor: PreferenciaDeTema) {
    setEscolhida(valor);
    applyPreferencia(valor);
  }

  return (
    <RadioGroup
      legenda="Tema do portal"
      legendaOculta
      colunas="sm:grid-cols-3"
      valor={atual}
      onChange={escolher}
      opcoes={OPCOES.map((o) => ({ valor: o.valor, rotulo: o.rotulo, icone: o.icone }))}
    />
  );
}
