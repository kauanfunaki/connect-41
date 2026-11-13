import { notFound } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe, permissoesNosHonorarios } from "@/lib/honorarios/acesso";
import { carregarContratante, historicoDoTermo, modeloDoTermo } from "@/lib/honorarios/termo/servidor";
import { textoDoContratante } from "@/lib/honorarios/termo/contratante";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { TermoDaEmpresa } from "@/components/honorarios/TermoDaEmpresa";
import { formatCnpj, formatInstantDateTime } from "@/lib/format";

export default async function TermoDaEmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ socio?: string }>;
}) {
  const { ctx } = await abrirTelaDoModulo("controladoria_honorarios");
  const [{ companyId }, { socio }] = await Promise.all([params, searchParams]);
  const [{ podeAgir }, [contratante, modelo, historico]] = await Promise.all([
    permissoesNosHonorarios(ctx),
    noEscritorioDe(ctx, () =>
      Promise.all([carregarContratante(ctx.tenantId!, companyId, socio === "novo" ? null : socio), modeloDoTermo(ctx.tenantId!), historicoDoTermo(ctx.tenantId!, companyId)])
    ),
  ]);
  if (!contratante) notFound();
  const novoSocio = socio === "novo" || contratante.socios.length === 0;

  return (
    <PageContainer>
      <BackButton href="/honorarios/termo" rotulo="Termo aditivo" />
      <PageHeader title={contratante.nome} subtitle={`Termo aditivo · CNPJ ${formatCnpj(contratante.cnpj)}`} />
      <TermoDaEmpresa
        key={novoSocio ? "novo" : (contratante.socioId ?? "sem")}
        companyId={contratante.companyId}
        endereco={contratante.endereco}
        socios={contratante.socios}
        socioId={novoSocio ? "novo" : contratante.socioId}
        contatos={contratante.contatos}
        faltas={contratante.faltas}
        previa={contratante.podeGerar && !novoSocio ? textoDoContratante(contratante.dados) : null}
        temModelo={!!modelo}
        podeAgir={podeAgir}
        historico={historico.map((h) => ({ id: h.id, nomeArquivo: h.nomeArquivo, geradoPor: h.geradoPor, geradoEm: formatInstantDateTime(h.geradoEm), nosArquivos: !!h.driveFileId }))}
      />
    </PageContainer>
  );
}
