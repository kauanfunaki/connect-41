"use client";

import { usePathname } from "next/navigation";
import { caminhoDoMenuAtivo } from "@/lib/caminhoDoMenu";
import { NavItem } from "@/components/shell/NavLink";
import { PainelDoItem, type TelaDoPainel } from "@/components/shell/PainelDoItem";

/**
 * Um item do menu com telas dentro (05/11/2026, opção C da página "Ajustes de
 * 05/11", "o jeito do BPO para todos"): o grupo de um setor (Contas, Processos…)
 * ou a tela que tem filhas (Processos com Painel e Órgãos, o Painel de Gestão
 * com as abas dele). A linha mostra o número de telas e o "›"; a janela abre ao
 * lado, com o mouse parado ou com o clique (no toque e no teclado também).
 *
 * O menu fica curto em todo setor; o preço, que o Kauan aceitou, é a tela
 * ficar a um passo a mais — abrir a janela.
 */
export function ItemComJanela({
  label,
  icon,
  area,
  telas,
  verTudo,
  contador,
  aceso = false,
}: {
  label: string;
  icon: React.ReactNode;
  area: string;
  /** As telas da janela, na ordem do menu. `ativa` quando a regra do endereço não basta. */
  telas: TelaDoPainel[];
  /** O rodapé "Ver as telas do grupo" (só nos grupos). */
  verTudo?: { href: string; rotulo: string };
  /** O que pede ação numa das telas (chamados novos), somado. */
  contador?: number;
  /**
   * Acende mesmo sem nenhuma tela da janela aberta (09/11/2026): o SPED do
   * Fiscal, cuja mãe é só o título, segue aceso em SPED gerados e Executar.
   */
  aceso?: boolean;
}) {
  const pathname = usePathname();
  const ativo = aceso || telas.some((t) => t.ativa ?? caminhoDoMenuAtivo(pathname, t.href));
  return (
    <PainelDoItem titulo={label} area={area} icone={icon} abrirPorClique telas={telas} verTudo={verTudo}>
      {({ aberto, alternar, painelId }) => (
        <NavItem
          href={verTudo?.href ?? telas[0]?.href ?? "#"}
          icon={icon}
          label={label}
          comTelas
          ativo={ativo}
          contador={contador}
          area={area}
          menu={{ aberto, onClick: alternar, painelId, telas: telas.length }}
        />
      )}
    </PainelDoItem>
  );
}
