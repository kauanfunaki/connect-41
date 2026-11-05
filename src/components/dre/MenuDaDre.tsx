"use client";

import { useState } from "react";
import { FileSpreadsheet, LayoutList, ListChecks, Percent } from "lucide-react";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { PainelDoModeloDoDre } from "@/components/dre/PainelDoModeloDoDre";
import { usePainelDeClassificacao } from "@/components/dre/PainelDeClassificacao";
import type { CodigoDoModelo } from "@/lib/dre/estrutura";

type Props = {
  companyId: string;
  /** A exportação no modelo do BPO, no período da tela. */
  exportar: string;
  modelo: { codigo: CodigoDoModelo; nome: string };
  podeTrocarModelo: boolean;
  /** A outra visão dos impostos, só no modelo que deixa escolher. */
  impostos?: { href: string; rotulo: string } | null;
};

/**
 * O "⋯" do topo da DRE (05/11/2026, escolha 5A do Kauan). O topo tinha três
 * botões e cinco controles na fileira dos filtros; ficam à vista a ação
 * principal ("Importar do Omie") e este menu, com o que se usa de vez em
 * quando: exportar no modelo do BPO, o modelo da DRE da empresa e a visão dos
 * impostos.
 *
 * O painel do modelo mora fora do menu: o menu fecha ao clicar, e o painel
 * precisa continuar aberto.
 */
export function MenuDaDre({ companyId, exportar, modelo, podeTrocarModelo, impostos }: Props) {
  const [modeloAberto, setModeloAberto] = useState(false);
  const classificacao = usePainelDeClassificacao();
  // Sem nada a classificar, a fila ainda é a porta das exceções e das
  // desconsideradas ("Voltar ao padrão"). Com algo a classificar, o aviso da
  // tela já tem o botão.
  const revisar = classificacao?.temOQueVer && classificacao.faltam === 0;

  return (
    <>
      <MenuDeMaisAcoes rotulo="Mais ações da DRE" size="md" width={280} sempreMenu>
        {({ close }) => (
          <>
            <ItemDoMenu href={exportar} download icone={<FileSpreadsheet />} onClick={close}>
              Exportar no modelo do BPO
            </ItemDoMenu>
            <ItemDoMenu
              icone={<LayoutList />}
              onClick={() => {
                close();
                setModeloAberto(true);
              }}
            >
              Modelo da DRE: {modelo.codigo === "padrao" ? "Padrão" : modelo.nome}
            </ItemDoMenu>
            {impostos && (
              <ItemDoMenu href={impostos.href} icone={<Percent />} onClick={close}>
                {impostos.rotulo}
              </ItemDoMenu>
            )}
            {revisar && (
              <ItemDoMenu
                icone={<ListChecks />}
                onClick={() => {
                  close();
                  classificacao.abrir();
                }}
              >
                Exceções e desconsideradas
              </ItemDoMenu>
            )}
          </>
        )}
      </MenuDeMaisAcoes>
      <PainelDoModeloDoDre
        companyId={companyId}
        modelo={modelo.codigo}
        podeTrocar={podeTrocarModelo}
        aberto={modeloAberto}
        onFechar={() => setModeloAberto(false)}
      />
    </>
  );
}
