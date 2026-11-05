import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { SECTOR_ICONS } from "@/components/shell/iconesDosSetores";
import type { SetorDoApoio } from "@/lib/apoio/servidor";
import { FolderKanban } from "lucide-react";

/**
 * De qual setor são as senhas ou os manuais (05/11/2026): só em "Todos os
 * setores" e para quem alcança mais de um. Dentro de um setor, a tela é a dele
 * e o seletor não aparece. Aba por link (`?setor=`), como as outras telas.
 */
export function SeletorDoSetorDoApoio({ apoio, caminho }: { apoio: SetorDoApoio; caminho: string }) {
  if (apoio.noSetor || apoio.setores.length < 2) return null;
  return (
    <AbasDeLink
      aria-label="Setor"
      ativa={apoio.setor}
      abas={apoio.setores.map((s) => ({
        chave: s.code,
        rotulo: s.label,
        href: `${caminho}?setor=${encodeURIComponent(s.code)}`,
        icone: SECTOR_ICONS[s.code] ?? <FolderKanban />,
      }))}
    />
  );
}
