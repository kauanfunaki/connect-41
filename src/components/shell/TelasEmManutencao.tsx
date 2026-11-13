"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { telaDoCaminho } from "@/lib/manutencao/regras";

// Telas em manutenção (13/11/2026) — o lado de cliente: o selo no menu e o
// "Abrir para testar" do aviso.
//
// A lista vem do layout, que não renderiza de novo a cada clique no menu: o
// selo pode ficar atrás até a página recarregar. Quem decide se a tela abre é
// o proxy, com a lista fresca — o selo é só o aviso de antemão.

/** Uma tela em manutenção: o código e o setor dono. */
export type TelaEmManutencaoNoMenu = { code: string; setor: string };

type Estado = { porCodigo: ReadonlyMap<string, string> };

const Contexto = createContext<Estado>({ porCodigo: new Map() });

export function ProvedorDaManutencao({ telas, children }: { telas: readonly TelaEmManutencaoNoMenu[]; children: React.ReactNode }) {
  const valor = useMemo(() => ({ porCodigo: new Map(telas.map((t) => [t.code, t.setor])) }), [telas]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Quem diz se um endereço é de tela em manutenção — uma função, e não um hook
 * por endereço, para servir também às listas (o painel das telas de um grupo).
 */
export function useConferirManutencao(): (href: string) => boolean {
  const { porCodigo } = useContext(Contexto);
  return (href) => {
    if (porCodigo.size === 0) return false;
    const tela = telaDoCaminho(href.split("?")[0]);
    return tela !== null && porCodigo.has(tela);
  };
}

/**
 * O selo do item do menu: a chave inglesa na cor de atenção, no fim da linha,
 * com o nome para o leitor de tela e a dica do Connect. Ícone e texto, não só
 * cor. No item aberto (fundo cheio), na cor do texto, para não sumir no azul.
 */
export function SeloDeManutencaoNoMenu({ naCorDoTexto = false }: { naCorDoTexto?: boolean }) {
  return (
    <span className="ml-auto flex-shrink-0 inline-flex" data-dica="Em manutenção" data-dica-lado="direita">
      <Wrench aria-hidden className={`size-3.5 ${naCorDoTexto ? "" : "text-warning-fg"}`.trim()} />
      <span className="sr-only">, em manutenção</span>
    </span>
  );
}

/**
 * "Abrir para testar", no aviso, para quem conserta: abre a tela só para a
 * pessoa (ver src/app/api/manutencao/testar/route.ts) e recarrega o mesmo
 * endereço — o proxy agora deixa passar, e a pessoa cai na tela que pediu,
 * inclusive numa página de dentro dela (`/pagar/<id>`).
 */
export function AbrirTelaParaTestar({ tela }: { tela: string }) {
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAbrindo(true);
    setErro(null);
    try {
      const res = await fetch("/api/manutencao/testar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tela }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? "Não deu para abrir a tela. Tente de novo.");
      }
      window.location.reload();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para abrir a tela. Tente de novo.");
      setAbrindo(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={abrir} loading={abrindo} loadingLabel="Abrindo…">
        Abrir para testar
      </Button>
      {erro && (
        <p className="basis-full text-fs-2 text-danger" role="alert">
          {erro}
        </p>
      )}
    </>
  );
}
