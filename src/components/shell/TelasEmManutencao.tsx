"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Wrench } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { telaDoCaminho } from "@/lib/manutencao/regras";

// Telas em manutenção (13/11/2026) — o lado de cliente: o selo no menu e a
// faixa de quem passa pela manutenção.
//
// A lista vem do layout, que não renderiza de novo a cada clique no menu: o
// selo pode ficar atrás até a página recarregar. Quem decide se a tela abre é
// o proxy, com a lista fresca — o selo é só o aviso de antemão.

/** Uma tela em manutenção: o código e o setor dono, onde se libera. */
export type TelaEmManutencaoNoMenu = { code: string; setor: string };

type Estado = { porCodigo: ReadonlyMap<string, string>; passa: boolean; podeLiberar: boolean };

const Contexto = createContext<Estado>({ porCodigo: new Map(), passa: false, podeLiberar: false });

export function ProvedorDaManutencao({
  telas,
  passa,
  podeLiberar,
  children,
}: {
  telas: readonly TelaEmManutencaoNoMenu[];
  /** Quem passa pela manutenção (Tech e administrador): vê a tela e a faixa. */
  passa: boolean;
  /** Quem abre Setores e módulos, onde a tela é liberada. */
  podeLiberar: boolean;
  children: React.ReactNode;
}) {
  const valor = useMemo(() => ({ porCodigo: new Map(telas.map((t) => [t.code, t.setor])), passa, podeLiberar }), [telas, passa, podeLiberar]);
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
 * A faixa no alto da tela para quem passa pela manutenção: a pessoa vê a tela
 * como ela está, e a faixa lembra que os setores estão vendo o aviso — e leva
 * a quem pode liberar até o setor dono, em Setores e módulos. Mesmo lugar e
 * mesmo desenho do aviso de assinatura pendente.
 */
export function FaixaDaManutencao() {
  const { porCodigo, passa, podeLiberar } = useContext(Contexto);
  const caminho = usePathname();
  if (!passa || porCodigo.size === 0) return null;
  const tela = telaDoCaminho(caminho);
  const setor = tela ? porCodigo.get(tela) : undefined;
  if (!tela || setor === undefined) return null;
  return (
    <div className="flex-shrink-0 w-full max-w-[1440px] mx-auto px-6 pt-4">
      <Aviso tom="atencao" icone={<Wrench />}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span role="status" className="min-w-0 flex-1 basis-72">
            <strong className="font-semibold">Esta tela está em manutenção.</strong> Os setores veem o aviso de manutenção no lugar dela; você vê a tela porque é da Tech ou administrador.
          </span>
          {podeLiberar && (
            <Button href={`/admin/setores?setor=${encodeURIComponent(setor)}`} variant="secondary" size="xs" className="whitespace-nowrap">
              Liberar a tela
            </Button>
          )}
        </div>
      </Aviso>
    </div>
  );
}
