import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { LayoutGrid } from "lucide-react";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { ModulosPorSetor, type SetorDaLista } from "@/components/admin/ModulosPorSetor";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { alternarModulo, transferirModulo } from "./actions";

export default async function ModulosPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const [modules, { labels: sectorLabels, colors: sectorColors, options: setoresAtivos }] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
  ]);

  // Agrupado pelo setor que opera (já resolvido), não pelo de origem. O setor
  // atual entra nas opções mesmo desativado, para o select não mentir sobre
  // onde o módulo está.
  const opcoesDeSetor = (atual: string) =>
    setoresAtivos.some((o) => o.value === atual)
      ? setoresAtivos
      : [{ value: atual, label: sectorLabel(sectorLabels, atual) }, ...setoresAtivos];

  const grouped = modules.reduce<Record<string, typeof modules>>((acc, m) => {
    (acc[m.sectorCode] ??= []).push(m);
    return acc;
  }, {});

  // Cada setor num bloco que recolhe, com a busca no topo (escolha "Módulos A",
  // 08/10/2026). A lista vive no navegador; as actions são as de sempre, presas
  // a cada módulo aqui.
  const setores: SetorDaLista[] = Object.entries(grouped).map(([sectorCode, list]) => ({
    chave: sectorCode,
    rotulo: sectorLabel(sectorLabels, sectorCode),
    cor: sectorColors[sectorCode],
    itens: list.map((m) => ({
      code: m.code,
      nome: m.label,
      descricao: m.description,
      ligado: m.enabled,
      setor: m.sectorCode,
      origem: m.sectorCode !== m.catalogSectorCode ? sectorLabel(sectorLabels, m.catalogSectorCode) : null,
      opcoesDeSetor: opcoesDeSetor(m.sectorCode),
      alternar: alternarModulo.bind(null, m.code, !m.enabled),
      transferir: transferirModulo.bind(null, m.code),
    })),
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Módulos"
        subtitle="Blocos de funcionalidade que podem ser ligados ou desligados por cliente."
      />

      {modules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid />}
            title="Nenhum módulo no catálogo ainda."
            description="Os módulos de setor (Recrutamento, RH/DP…) aparecem aqui quando forem construídos."
          />
        </Card>
      ) : (
        <ModulosPorSetor setores={setores} />
      )}
    </PageContainer>
  );
}
