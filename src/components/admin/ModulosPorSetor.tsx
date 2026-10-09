"use client";

import { useState } from "react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { SetorDoModuloSelect } from "@/components/admin/SetorDoModuloSelect";
import { ToggleModuleButton } from "@/components/admin/ToggleModuleButton";
import { contagemDoBloco, filtrarGrupos, gruposAbertosPelaBusca, type Grupo } from "@/lib/listaEmBlocos";

export type ModuloDaLista = {
  code: string;
  nome: string;
  descricao: string;
  ligado: boolean;
  /** Setor que opera o módulo hoje, já resolvido. */
  setor: string;
  /** Rótulo do setor de origem, quando o módulo foi transferido. */
  origem: string | null;
  opcoesDeSetor: { value: string; label: string }[];
  /** As actions de hoje, já presas ao módulo pela página. */
  alternar: () => Promise<void>;
  transferir: (sectorCode: string) => Promise<void>;
};

export type SetorDaLista = Grupo<ModuloDaLista> & { cor?: string };

const LIGADOS = { um: "ligado", varios: "ligados" };
/** O que a busca olha: o que a linha mostra (nome e descrição). */
const textosDoModulo = (m: ModuloDaLista) => [m.nome, m.descricao];

/**
 * A lista de Administração › Módulos (escolha "Módulos A" do Kauan, 08/10/2026).
 * Eram 41 módulos em 9 setores, todos abertos um embaixo do outro. Agora cada
 * setor é um bloco fechado com "N de M ligados" na linha, e a busca do topo
 * filtra e abre o setor de quem casa. As linhas são as de antes: o setor que
 * opera (seletor) e o interruptor, com as mesmas confirmações e actions.
 */
export function ModulosPorSetor({ setores }: { setores: SetorDaLista[] }) {
  const [termo, setTermo] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());

  const visiveis = filtrarGrupos(setores, termo, textosDoModulo);

  function buscar(valor: string) {
    setTermo(valor);
    setAbertos(gruposAbertosPelaBusca(setores, valor, textosDoModulo));
  }

  function alternarBloco(chave: string, aberto: boolean) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (aberto) novo.add(chave);
      else novo.delete(chave);
      return novo;
    });
  }

  return (
    <div className="space-y-4">
      <CampoDeBusca
        compact
        value={termo}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Procurar módulo"
        aria-label="Procurar módulo"
        className="w-80 max-w-full"
      />

      {visiveis.length === 0 ? (
        <p className="text-ui text-fg-muted">Nenhum módulo com “{termo.trim()}”.</p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((g) => {
            // A contagem é do setor inteiro, mesmo com a busca filtrando as linhas.
            const inteiro = setores.find((s) => s.chave === g.chave) ?? g;
            const ligados = inteiro.itens.filter((m) => m.ligado).length;
            return (
              <BlocoRecolhivel
                key={g.chave}
                titulo={g.rotulo}
                cor={g.cor}
                resumo={contagemDoBloco(ligados, inteiro.itens.length, LIGADOS)}
                aberto={abertos.has(g.chave)}
                onAbertoChange={(aberto) => alternarBloco(g.chave, aberto)}
                className="bg-surface shadow-[var(--c41-shadow-xs)]"
                classeDoConteudo=""
              >
                <div className="divide-y divide-border border-t border-border">
                  {g.itens.map((m) => (
                    <LinhaDoModulo key={m.code} m={m} />
                  ))}
                </div>
              </BlocoRecolhivel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LinhaDoModulo({ m }: { m: ModuloDaLista }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0">
        <p className="text-fs-3 text-fg">{m.nome}</p>
        <p className="text-fs-1 text-fg-muted">{m.descricao}</p>
        {m.origem && <p className="text-fs-1 text-fg-muted mt-0.5">Transferido — origem: {m.origem}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <SetorDoModuloSelect action={m.transferir} atual={m.setor} opcoes={m.opcoesDeSetor} nome={m.nome} />
        <ToggleModuleButton action={m.alternar} enabled={m.ligado} nome={m.nome} />
      </div>
    </div>
  );
}
