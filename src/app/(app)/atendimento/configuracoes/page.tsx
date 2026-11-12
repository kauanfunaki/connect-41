import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfiguracoesDoAtendimento } from "@/components/atendimento/ConfiguracoesDoAtendimento";
import { contextoDaTela } from "@/lib/atendimento/contexto";
import { podeConfigurar } from "@/lib/atendimento/acesso";
import { desfechosDoEscritorio, lerConfiguracao, setoresQueAtendem } from "@/lib/atendimento/dados";
import { conexoesDoEscritorio } from "@/lib/atendimento/transporte";
import { integracaoDoCatalogo } from "@/lib/integracoes/catalogo";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { diasDoHorario, lerQuemVeTudo } from "@/lib/atendimento/regras";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesDoAtendimentoPage() {
  const c = await contextoDaTela();
  if (!c || !podeConfigurar(c.ctx, c.cfg)) notFound();
  const tenantId = c.ctx.tenantId;
  const [config, maps, conexoes, desfechos, mensagens, modelos, pessoas] = await Promise.all([
    lerConfiguracao(tenantId),
    getSectorMaps(tenantId),
    conexoesDoEscritorio(tenantId),
    desfechosDoEscritorio(tenantId, true),
    getPrisma().atendimentoMensagemPadrao.findMany({ where: { tenantId }, orderBy: [{ titulo: "asc" }] }),
    getPrisma().atendimentoModelo.findMany({ where: { tenantId }, orderBy: [{ rotulo: "asc" }] }),
    getPrisma().user.findMany({ where: { tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const ativos = maps.options.map((o) => o.value);
  const marcados = setoresQueAtendem(config.setores, ativos, c.cfg.triagem);

  return (
    <PageContainer>
      <PageHeader
        title="Configurações do Atendimento"
        subtitle="Valem para o WhatsApp do escritório. O WhatsApp do Recrutamento tem as configurações dele."
        action={
          <Button href="/atendimento" variant="secondary" size="sm">
            Voltar ao Atendimento
          </Button>
        }
      />
      <ConfiguracoesDoAtendimento
        triagem={sectorLabel(maps.labels, c.cfg.triagem)}
        conexoes={conexoes.map((x) => ({
          id: x.id,
          rotulo: x.label ?? integracaoDoCatalogo(x.integrationCode)?.label ?? x.integrationCode,
          ligada: x.enabled,
          erro: x.lastError,
        }))}
        config={{
          integrationId: config.integrationId,
          diasDaSemana: diasDoHorario(config.diasDaSemana),
          abreAs: config.abreAs,
          fechaAs: config.fechaAs,
          boasVindas: config.boasVindas ?? "",
          foraDoHorario: config.foraDoHorario ?? "",
          respostasAutomaticas: config.respostasAutomaticas,
          diasParaReabrir: config.diasParaReabrir,
          setores: marcados,
          ceciLigada: config.ceciLigada,
          veemTudo: lerQuemVeTudo(config.veemTudo),
        }}
        pessoas={pessoas.map((u) => ({ id: u.id, nome: u.name }))}
        setores={maps.options.filter((o) => o.value !== c.cfg.triagem).map((o) => ({ code: o.value, label: o.label, cor: maps.colors[o.value] ?? "#586577" }))}
        desfechos={desfechos}
        modelos={modelos.map((m) => ({ id: m.id, rotulo: m.rotulo, nomeNaMeta: m.nomeNaMeta, idioma: m.idioma, texto: m.texto, ativo: m.ativo }))}
        mensagens={mensagens.map((m) => ({ id: m.id, titulo: m.titulo, sectorCode: m.sectorCode, texto: m.texto, ativo: m.ativo }))}
      />
    </PageContainer>
  );
}
