"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "./SearchableSelect";

type Props = {
  empresas: { id: string; nome: string }[];
  empresaId: string | null;
  /** Rota da tela; a escolha vira `?empresa=<id>` nela. */
  acao: string;
};

/**
 * Troca de empresa que navega sozinha, para telas em que a empresa é a única
 * escolha do topo — o DRE e a conversa do portal.
 *
 * Era uma fileira de botões, um por empresa, e o Kauan pediu o seletor com busca
 * do cadastro de empresas (18/09). A fileira não cabia: o grupo da BLD tem 21
 * empresas, o escritório quase quatrocentas — e o DRE só mostrava as doze
 * primeiras, então as outras só se abriam pela URL.
 *
 * Onde empresa e mês se escolhem juntos, o seletor fica dentro do formulário com
 * "Aplicar" (`FiltroDePeriodo`): navegar a cada escolha seriam duas navegações.
 */
export function SeletorDeEmpresaQueNavega({ empresas, empresaId, acao }: Props) {
  const router = useRouter();
  return (
    <SearchableSelect
      // Remonta quando a URL muda por fora (o voltar do navegador), como em
      // AcervoFiltros — o estado interno é só o valor inicial.
      key={empresaId ?? ""}
      name="empresa"
      compact
      className="w-80 max-w-full"
      aria-label="Empresa"
      options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
      defaultValue={empresaId ?? ""}
      placeholder="Buscar empresa…"
      onChange={(v) => {
        if (v && v !== empresaId) router.push(`${acao}?empresa=${encodeURIComponent(v)}`);
      }}
    />
  );
}
