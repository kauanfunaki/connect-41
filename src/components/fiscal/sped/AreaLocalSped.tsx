import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { podeNoModulo } from "@/lib/auth/modulo";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_OPS } from "@/lib/ops/regras";
import { type EtapaDoSped } from "@/lib/fiscal/sped/etapas";
import { carregarBase, ErroFiscal, prepararTelaLocal } from "@/lib/fiscal/sped/local/servidor";
import { SEM_OPS, geracoesDaTela } from "@/lib/fiscal/sped/local/geracao";
import { EstacaoSped } from "./EstacaoSped";
import type { GeracaoDaEstacao } from "./AcompanhamentoDaGeracao";
import { PeriodoLocalSped } from "./PeriodoLocalSped";
import { AbrangenciaLocalSped } from "./AbrangenciaLocalSped";

export async function AreaLocalSped({ aba, params }: { aba: EtapaDoSped; params: Record<string, string | string[] | undefined> }) {
  let tela;
  try { tela = await prepararTelaLocal(params, aba); } catch (e) { if (e instanceof ErroFiscal && e.status === 404) notFound(); throw e; }
  const base = tela.contexto ? await carregarBase(tela) : null;
  // A geração vai para a fila do Connect e o agente do motor vem buscar (06/11/2026): sem
  // chamar o motor aqui. O agente é uma automação do Ops Center, que precisa estar ligado.
  let geracao: GeracaoDaEstacao = { opsLigado: false, motivo: null, geracoes: [], agente: null };
  if (aba === "gerar" && tela.contexto && tela.empresa) {
    const [opsLigado, dados] = await Promise.all([
      isModuleEnabled(tela.ctx.tenantId, MODULO_OPS),
      tela.competencia.length === 7 ? geracoesDaTela(tela.ctx.tenantId, tela.empresa, tela.competencia) : { geracoes: [], agente: null },
    ]);
    geracao = { opsLigado, motivo: opsLigado ? null : SEM_OPS, ...dados };
  }
  const direitos = { importar: await podeNoModulo(tela.ctx, "fiscal_acervo", "agir"), configurar: await podeNoModulo(tela.ctx, "fiscal_configuracoes", "gerir"), entregas: await podeNoModulo(tela.ctx, "fiscal_entregas", "agir"), icms: await podeNoModulo(tela.ctx, "fiscal_icms_ipi", "ver"), contribuicoes: await podeNoModulo(tela.ctx, "fiscal_contribuicoes", "ver") };
  const conteudo = <PageContainer>
    <PageHeader title="SPED" subtitle="Classificação, apuração e fechamento no Connect. O arquivo é gerado pelo agente do motor do escritório." />
    <FiltroDaEmpresa foco={tela.foco}>
      <PeriodoLocalSped competencia={tela.competencia} mensal={aba === "gerar"} />
      {tela.empresa && tela.comAbrangencia && <AbrangenciaLocalSped raiz={tela.empresa.cnpj.slice(0, 8)} consolidado={Boolean(tela.contexto?.consolidado)} />}
    </FiltroDaEmpresa>
    {!tela.empresa || !base || !tela.contexto ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EstacaoSped key={`${tela.empresa.id}:${tela.competencia}:${aba}:${tela.contexto.consolidado}:${base.revisao}`} aba={aba} empresa={{ id: tela.empresa.id, nome: tela.empresa.nome, cnpj: tela.empresa.cnpj }} contexto={{ ...tela.contexto, revisao: base.revisao }} base={base} pode={tela.pode} direitos={direitos} grupo={tela.grupo.map(e => ({ id: e.id, nome: e.nome, cnpj: e.cnpj }))} vistaInicial={typeof params.vista === "string" ? params.vista : undefined} geracao={geracao} />}
  </PageContainer>;
  return tela.empresa ? <EmpresaDaTela empresa={{ nome: tela.empresa.nome, cnpj: tela.empresa.cnpj }}>{conteudo}</EmpresaDaTela> : conteudo;
}
