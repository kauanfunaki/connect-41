import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { CentralDeAjuda, type SetorDaAjuda, type TelaDaAjuda } from "@/components/ajuda/CentralDeAjuda";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getModuleRoute } from "@/lib/module-catalog";
import { getSectorMaps } from "@/lib/sectors";
import { TELAS_GERAIS } from "@/lib/ia/ferramentas-ajuda";
import { artigoDaChave, artigoDoCaminho } from "@/lib/ajuda/artigos";

/** O endereço do passo a passo da tela, se ela tem artigo. */
function enderecoDoArtigo(codigo: string | undefined, caminho: string): string | undefined {
  const artigo = (codigo ? artigoDaChave(codigo) : null) ?? (caminho.startsWith("/") ? artigoDoCaminho(caminho) : null);
  return artigo ? `/ajuda/${encodeURIComponent(artigo.chave)}` : undefined;
}

/**
 * Central de ajuda (30/09) — o destino do "?" da topbar.
 *
 * Primeira versão da base de conhecimento decidida no mesmo dia: dentro do
 * Connect, por setor, com busca. As telas vêm do mesmo catálogo que a barra
 * lateral e o agente "Ajuda do Connect" usam (módulo ligado + setor que a
 * pessoa enxerga), então a central nunca mostra tela que a pessoa não abre.
 * Os artigos passo a passo com vídeo de cada tela entram depois, aqui.
 */
export default async function AjudaPage() {
  const ctx = await getAuthContext();
  const [estados, { labels, colors }] = await Promise.all([getTenantModuleStates(ctx.tenantId), getSectorMaps(ctx.tenantId)]);

  const visiveis = estados.filter((m) => m.enabled && canViewSector(ctx, m.sectorCode));
  const porSetor = new Map<string, TelaDaAjuda[]>();
  for (const m of visiveis) {
    const lista = porSetor.get(m.sectorCode) ?? [];
    const caminho = getModuleRoute(m.code) ?? `/setor/${m.sectorCode}/${m.code}`;
    lista.push({
      chave: m.code,
      titulo: m.label,
      caminho,
      descricao: m.description,
      codigo: m.code,
      artigo: enderecoDoArtigo(m.code, caminho),
    });
    porSetor.set(m.sectorCode, lista);
  }

  // Com setor ativo, ele vem primeiro: é o que a pessoa está fazendo agora.
  const codigos = Array.from(porSetor.keys()).sort((a, b) =>
    a === ctx.activeSector ? -1 : b === ctx.activeSector ? 1 : (labels[a] ?? a).localeCompare(labels[b] ?? b, "pt-BR")
  );
  const setores: SetorDaAjuda[] = codigos.map((code) => ({
    code,
    rotulo: labels[code] ?? code,
    cor: colors[code] ?? "#586577",
    telas: porSetor.get(code)!,
  }));

  // "Espaços" é por setor: aponta para o do setor ativo (ou o primeiro que a
  // pessoa enxerga); sem nenhum, sai da lista.
  const setorDosEspacos = ctx.activeSector ?? codigos[0] ?? null;
  const gerais: TelaDaAjuda[] = TELAS_GERAIS.flatMap((t): TelaDaAjuda[] => {
    if (t.tela === "Ajuda") return [];
    // A fila das solicitações do portal só existe com o módulo ligado.
    if (t.tela === "Solicitações" && !estados.some((m) => m.code === "portal_solicitacoes" && m.enabled)) return [];
    if (t.tela === "Espaços") {
      const caminho = `/setor/${setorDosEspacos}`;
      return setorDosEspacos ? [{ chave: t.tela, titulo: t.tela, caminho, descricao: t.descricao, artigo: enderecoDoArtigo(undefined, caminho) }] : [];
    }
    return [{ chave: t.tela, titulo: t.tela, caminho: t.caminho, descricao: t.descricao, artigo: enderecoDoArtigo(undefined, t.caminho) }];
  });

  return (
    <PageContainer>
      <PageHeader title="Ajuda" subtitle="Primeiros passos e o que cada tela do Connect faz." />
      <CentralDeAjuda gerais={gerais} setores={setores} />
    </PageContainer>
  );
}
