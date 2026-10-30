import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { podeNoModulo } from "@/lib/auth/modulo";
import { abrirMotor } from "@/lib/fiscal/motor/servidor";
import { type EtapaDoSped } from "@/lib/fiscal/sped/etapas";
import { carregarBase, ErroFiscal, prepararTelaLocal } from "@/lib/fiscal/sped/local/servidor";
import { EstacaoSped, type MotorDaEstacao } from "./EstacaoSped";
import { PeriodoLocalSped } from "./PeriodoLocalSped";

export async function AreaLocalSped({ aba, params }: { aba: EtapaDoSped; params: Record<string, string | string[] | undefined> }) {
  let tela;
  try { tela = await prepararTelaLocal(params, aba); } catch (e) { if (e instanceof ErroFiscal && e.status === 404) notFound(); throw e; }
  const base = tela.contexto ? await carregarBase(tela) : null;
  let motor: MotorDaEstacao = { disponivel: false, capaz: false, motivo: "Configure o motor em Administração › Integrações para gerar arquivos.", arquivos: [], execucoes: [] };
  if (aba === "gerar" && tela.contexto) {
    const m = await abrirMotor(tela.ctx.tenantId);
    if (m && m.raizes.includes(tela.contexto.raiz)) {
      try {
        const [saude, arquivos, execucoes] = await Promise.all([
          m.cliente.saude(tela.contexto.raiz),
          m.cliente.listarArquivos(tela.contexto.raiz, { competencia: tela.competencia, limite: 50 }),
          m.cliente.listarExecucoes(tela.contexto.raiz, { competencia: tela.competencia, limite: 20 }),
        ]);
        const capaz = saude.capacidades?.includes("geracao_connect_v1") ?? false;
        motor = { disponivel: m.escrita, capaz, motivo: !capaz ? "O motor configurado ainda precisa receber a adaptação para gerar com a revisão do Connect." : !m.escrita ? "Configure o token de escrita da integração." : null, arquivos: arquivos.itens.filter(a => a.cnpj === tela.empresa!.cnpj || a.obrigacao === "contribuicoes"), execucoes: execucoes.itens.filter(e => e.cnpj === tela.empresa!.cnpj || e.acao === "sped_contribuicoes") };
      } catch { motor.motivo = "Não foi possível consultar o motor. Seus dados e decisões continuam disponíveis no Connect."; }
    }
  }
  const direitos = { importar: await podeNoModulo(tela.ctx, "fiscal_acervo", "agir"), configurar: await podeNoModulo(tela.ctx, "fiscal_configuracoes", "gerir"), entregas: await podeNoModulo(tela.ctx, "fiscal_entregas", "agir"), icms: await podeNoModulo(tela.ctx, "fiscal_icms_ipi", "ver"), contribuicoes: await podeNoModulo(tela.ctx, "fiscal_contribuicoes", "ver") };
  const conteudo = <PageContainer>
    <PageHeader title="SPED" subtitle="Classificação, apuração e fechamento no Connect. Arquivos gerados no motor do escritório." />
    <FiltroDaEmpresa acao={`/fiscal/sped/${aba}`} empresas={tela.empresas} valor={tela.empresa?.id ?? null} foco={tela.foco} manter={{ competencia: tela.competencia, vista: typeof params.vista === "string" ? params.vista : undefined, escopo: typeof params.escopo === "string" ? params.escopo : undefined }}>
      <PeriodoLocalSped competencia={tela.competencia} mensal={aba === "gerar"} />
    </FiltroDaEmpresa>
    {!tela.empresa || !base || !tela.contexto ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EstacaoSped key={`${tela.empresa.id}:${tela.competencia}:${aba}:${tela.contexto.consolidado}:${base.revisao}`} aba={aba} empresa={{ id: tela.empresa.id, nome: tela.empresa.nome, cnpj: tela.empresa.cnpj }} contexto={{ ...tela.contexto, revisao: base.revisao }} base={base} pode={tela.pode} direitos={direitos} grupo={tela.grupo.map(e => ({ id: e.id, nome: e.nome, cnpj: e.cnpj }))} vistaInicial={typeof params.vista === "string" ? params.vista : undefined} motor={motor} />}
  </PageContainer>;
  return tela.empresa ? <EmpresaDaTela empresa={{ nome: tela.empresa.nome, cnpj: tela.empresa.cnpj }}>{conteudo}</EmpresaDaTela> : conteudo;
}
