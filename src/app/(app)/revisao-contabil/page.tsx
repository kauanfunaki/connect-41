import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FormularioDoFechamento } from "@/components/revisao-contabil/FormularioDoFechamento";
import { empresasParaFechamento, listarFechamentos } from "@/lib/revisao-contabil/servidor";
import { formatCalendarDate, formatCnpj, formatInstantDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";

export const dynamic = "force-dynamic";

// Revisão do fechamento (05/11/2026): a carteira de fechamentos em revisão,
// do mais recente para o mais antigo. É a tela "Empresas" do AudTool, com a
// empresa vinda do cadastro do Connect em vez de um cadastro próprio.
export default async function RevisaoDoFechamentoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await abrirTelaDoModulo("contabil_revisao");
  const { q } = await searchParams;
  const podeAgir = await podeNoModulo(ctx, "contabil_revisao", "agir");
  const [fechamentos, empresas] = await Promise.all([
    listarFechamentos(ctx.tenantId, { busca: q }),
    podeAgir ? empresasParaFechamento(ctx.tenantId) : Promise.resolve([]),
  ]);

  const periodo = (f: { inicio: Date; fim: Date }) => `${formatCalendarDate(f.inicio)} a ${formatCalendarDate(f.fim)}`;
  const ultima = (f: (typeof fechamentos)[number]) => {
    const e = f.execucoes[0];
    if (!e) return <Selo tom="neutro">Não analisado</Selo>;
    return (
      <span className="flex flex-col">
        <span>{formatInstantDate(e.executadaEm)}</span>
        <span className="text-micro text-fg-muted">{e.achados === 1 ? "1 achado" : `${e.achados} achados`}</span>
      </span>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Revisão do fechamento"
        subtitle="Confere os documentos do fechamento de cada empresa pelo manual de conferência. Não lança, não ajusta saldo e não substitui o revisor."
        action={podeAgir ? <FormularioDoFechamento modo="novo" empresas={empresas} /> : undefined}
      />

      {fechamentos.length === 0 && !q ? (
        <EmptyState
          icon={<ClipboardCheck size={28} aria-hidden />}
          title="Nenhum fechamento em revisão"
          description="Abra um fechamento para uma empresa e um período, envie o balancete, o razão e os outros documentos, e execute a análise."
        />
      ) : (
        <CascoDaTabela
          contagem={contarItens(fechamentos.length, "fechamento", "fechamentos", fechamentos.length >= 300)}
          busca={
            <FormularioDeFiltro>
              <CampoDeBusca name="q" defaultValue={q ?? ""} placeholder="Buscar por empresa ou CNPJ…" aria-label="Buscar fechamento" compact />
            </FormularioDeFiltro>
          }
          buscaAEsquerda
        >
          {fechamentos.length === 0 ? (
            <EmptyState title="Nenhum fechamento encontrado" description="Tente outro nome ou parte do CNPJ." />
          ) : (
            <>
              <CartoesNoCelular>
                {fechamentos.map((f) => (
                  <Cartao key={f.id}>
                    <TopoDoCartao nome={<Link href={`/revisao-contabil/${f.id}`} className="text-brand hover:underline">{nomeExibicao(f.company)}</Link>} />
                    <InfoDoCartao>
                      {periodo(f)} · {f.regime}
                    </InfoDoCartao>
                    <PeDoCartao>
                      {ultima(f)}
                      <span className="text-micro text-fg-muted">{f._count.documentos} documento(s)</span>
                    </PeDoCartao>
                  </Cartao>
                ))}
              </CartoesNoCelular>
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[860px]">
                  <thead>
                    <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
                      <th className="py-2 pr-3 font-medium">Empresa</th>
                      <th className="py-2 pr-3 font-medium">Período</th>
                      <th className="py-2 pr-3 font-medium">Regime declarado</th>
                      <th className="py-2 pr-3 font-medium text-right">Documentos</th>
                      <th className="py-2 font-medium">Última análise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fechamentos.map((f) => (
                      <tr key={f.id} className="border-b border-border last:border-0 align-top">
                        <td className="py-2.5 pr-3">
                          <Link href={`/revisao-contabil/${f.id}`} className="font-medium text-brand hover:underline">
                            {nomeExibicao(f.company)}
                          </Link>
                          <span className="block text-micro text-fg-muted">{formatCnpj(f.company.cnpj)}</span>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{periodo(f)}</td>
                        <td className="py-2.5 pr-3">{f.regime}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{f._count.documentos}</td>
                        <td className="py-2.5">{ultima(f)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </>
          )}
        </CascoDaTabela>
      )}
    </PageContainer>
  );
}
