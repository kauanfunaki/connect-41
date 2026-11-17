import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Gauge } from "lucide-react";
import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoMes } from "@/components/ui/CampoMes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { AjusteDaRotina, IncluirEmpresas, RodarAgora, TirarEmpresa } from "@/components/autorizacoes/DctfwebDoMes";
import { getAuthContext } from "@/lib/auth/context";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { configuracaoDoSerpro, prontidaoDoSerpro } from "@/lib/serpro/cliente";
import { reais } from "@/lib/serpro/regras";
import { competenciaDaRotina, lerCompetencia, ROTULO_DA_SITUACAO_DCTFWEB, SITUACOES_RESOLVIDAS, type SituacaoDaDctfweb } from "@/lib/serpro/dctfweb";
import { dctfwebDoMes, empresasParaMarcar } from "@/lib/serpro/dctfwebDoMes";
import { hojeIso } from "@/lib/datas/calendario";
import { formatCnpj, formatInstantDateTime, formatarCompetenciaNumerica } from "@/lib/format";

export const dynamic = "force-dynamic";

const TOM: Record<SituacaoDaDctfweb, TomDoSelo> = {
  PENDENTE: "marca",
  BAIXADO: "sucesso",
  SEM_DECLARACAO: "neutro",
  SEM_DEBITO: "sucesso",
  SEM_PROCURACAO: "atencao",
  ERRO: "perigo",
};

/** Recibo (R$ 0,24) e DARF (R$ 0,32) na faixa 1: o máximo por empresa, para a confirmação. */
const MAXIMO_POR_EMPRESA = 56;

/**
 * A DCTFWeb do mês (17/11/2026, funcionalidade-734): as empresas que entram, o
 * resultado de cada uma na competência (recibo e DARF nos Arquivos) e o custo.
 * A rotina roda sozinha no agendador; o "Rodar agora" adianta por clique.
 */
export default async function DctfwebDoMesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) notFound();
  // Sem conexão a tela abre mesmo assim: dá para escolher as empresas e
  // ajustar a rotina antes do contrato; nada é chamado até a conexão ficar pronta.
  const cfg = await configuracaoDoSerpro(acesso.tenantId);

  const params = await searchParams;
  const hoje = hojeIso();
  const competencia = lerCompetencia(params.competencia, hoje) ?? competenciaDaRotina(hoje);
  const [tela, paraMarcar] = await Promise.all([dctfwebDoMes(acesso.tenantId, competencia), acesso.podeEditar ? empresasParaMarcar(acesso.tenantId) : []]);
  const pronta = prontidaoDoSerpro(cfg);
  const producao = cfg?.ambiente === "producao";
  const pode = acesso.podeEditar && pronta.pronta && producao;

  const conta = (s: SituacaoDaDctfweb) => tela.linhas.filter((l) => l.situacao === s).length;
  const abertas = tela.linhas.filter((l) => !l.situacao || !SITUACOES_RESOLVIDAS.includes(l.situacao)).length;
  const rotulo = formatarCompetenciaNumerica(competencia);
  const { ajuste } = tela;

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Autorizações de acesso", href: "/autorizacoes" }, { label: "DCTFWeb do mês" }]} />
      <PageHeader
        title="DCTFWeb do mês"
        meta={
          <>
            <Selo tom={ajuste.ligada ? "sucesso" : "neutro"}>{ajuste.ligada ? "Rotina ligada" : "Rotina desligada"}</Selo>
            <span>Recibo e DARF da DCTFWeb de cada empresa, pelo Serpro, na pasta Guias dos Arquivos.</span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FormularioDeFiltro action="/autorizacoes/dctfweb" className="flex items-center gap-2">
              <CampoMes compact name="competencia" defaultValue={competencia} className="w-40" aria-label="Competência" />
              <Button type="submit" variant="secondary" size="sm">
                Aplicar
              </Button>
            </FormularioDeFiltro>
            {acesso.podeEditar && <IncluirEmpresas empresas={paraMarcar} />}
            {pode && (
              <RodarAgora competencia={competencia} rotuloDaCompetencia={rotulo} empresas={abertas} custoMaximo={reais(abertas * MAXIMO_POR_EMPRESA)} />
            )}
          </div>
        }
      />

      {!pronta.pronta && (
        <Aviso tom="atencao" className="mb-4">
          {pronta.motivo} Enquanto isso, dá para escolher as empresas e ajustar a rotina: nada é chamado.
        </Aviso>
      )}
      {pronta.pronta && !producao && (
        <Aviso tom="atencao" className="mb-4">
          A conexão do Serpro está em demonstração, que não responde com dados de clientes: a DCTFWeb do mês só roda na produção.
        </Aviso>
      )}

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Baixadas", valor: String(conta("BAIXADO") + conta("SEM_DEBITO")), detalhe: `${conta("SEM_DEBITO")} sem débito (só o recibo)`, icone: <CheckCircle2 /> },
          { rotulo: "Sem declaração", valor: String(conta("SEM_DECLARACAO")), detalhe: `de ${tela.linhas.length} empresas`, icone: <FileText /> },
          {
            rotulo: "Sem procuração ou com erro",
            valor: String(conta("SEM_PROCURACAO") + conta("ERRO")),
            tom: conta("ERRO") > 0 ? "text-danger" : undefined,
            icone: <AlertTriangle />,
          },
          {
            rotulo: "Gasto da rotina no mês",
            valor: reais(tela.gastoNoMes.centavos),
            detalhe: `${tela.gastoNoMes.consultas} recibos e ${tela.gastoNoMes.emissoes} DARFs cobrados${ajuste.tetoCentavos !== null ? ` · teto ${reais(ajuste.tetoCentavos)}` : ""}`,
            icone: <Gauge />,
          },
        ]}
      />

      {acesso.podeEditar && (
        <Card className="mb-6 p-4">
          <AjusteDaRotina ligada={ajuste.ligada} diaSemEvento={ajuste.diaSemEvento} teto={ajuste.tetoCentavos === null ? "" : (ajuste.tetoCentavos / 100).toFixed(2).replace(".", ",")} />
        </Card>
      )}

      {tela.linhas.length === 0 ? (
        <EmptyState
          title="Nenhuma empresa na DCTFWeb do mês"
          description="Inclua as empresas (o CNPJ vem do cadastro). Cada uma precisa da procuração do Serpro com o serviço 00103 (DCTFWeb), ou todos os serviços."
          icon={<FileText />}
        />
      ) : (
        <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium">Situação em {rotulo}</th>
                <th className="py-2 pr-3 font-medium">Arquivos</th>
                <th className="py-2 pr-3 font-medium">Custo</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tela.linhas.map((l) => (
                <tr key={l.companyId} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-3">
                    <a href={`/empresas/${l.companyId}`} className="hover:underline">
                      {l.empresa}
                    </a>
                    <span className="block text-micro text-fg-muted tabular-nums">{formatCnpj(l.cnpj)}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {l.situacao ? <Selo tom={TOM[l.situacao]}>{ROTULO_DA_SITUACAO_DCTFWEB[l.situacao]}</Selo> : <Selo tom="neutro">Ainda não tentada</Selo>}
                    {l.naFila && l.situacao !== "PENDENTE" && <span className="block text-micro text-fg-muted">na fila para tentar de novo</span>}
                    {l.erro && l.situacao !== "BAIXADO" && <span className="block text-micro text-fg-muted max-w-md">{l.erro}</span>}
                    {l.ultimaTentativa && <span className="block text-micro text-fg-muted">última tentativa {formatInstantDateTime(l.ultimaTentativa)}</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <div className="flex gap-3">
                      {l.reciboArquivoId && (
                        <a href={`/api/arquivos/${l.reciboArquivoId}?ver=1`} target="_blank" rel="noreferrer" className="text-ui text-brand underline">
                          Recibo
                        </a>
                      )}
                      {l.darfArquivoId && (
                        <a href={`/api/arquivos/${l.darfArquivoId}?ver=1`} target="_blank" rel="noreferrer" className="text-ui text-brand underline">
                          DARF
                        </a>
                      )}
                      {!l.reciboArquivoId && !l.darfArquivoId && <span className="text-fg-muted">—</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{l.custoCentavos ? reais(l.custoCentavos) : "—"}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {pode && l.situacao && !SITUACOES_RESOLVIDAS.includes(l.situacao) && (
                        <RodarAgora
                          competencia={competencia}
                          rotuloDaCompetencia={rotulo}
                          companyId={l.companyId}
                          empresas={1}
                          custoMaximo={reais(l.reciboArquivoId ? 32 : MAXIMO_POR_EMPRESA)}
                        />
                      )}
                      {acesso.podeEditar && <TirarEmpresa companyId={l.companyId} nome={l.empresa} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NotaDeFonte>
        Pelo Integra Contador do Serpro, com a procuração de cada cliente para o escritório (serviço 00103). Por empresa e competência: o recibo
        (consulta, R$ 0,24 na faixa 1) e, havendo declaração, o DARF (emissão, R$ 0,32 na faixa 1) com todos os débitos da declaração, para pagar
        hoje — nas empresas com retenção, folha e fiscal saem na mesma guia, como o portal faz. Sem declaração, o Serpro responde sem cobrar e o
        DARF não é pedido. Com a rotina ligada, ela tenta a competência do mês passado quando a Receita avisa que a DCTFWeb recebeu declaração
        (evento E0301) ou, sem o aviso, a partir do dia escolhido; o que já foi baixado nunca é pedido de novo. O custo é estimado pela faixa do
        mês; a fatura de verdade é a do Serpro (Consumo do Serpro). O FGTS Digital não tem API oficial e fica fora.
      </NotaDeFonte>
    </PageContainer>
  );
}
