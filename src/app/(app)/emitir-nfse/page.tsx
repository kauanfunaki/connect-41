import { ExternalLink, ReceiptText } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { isFullWrite } from "@/lib/auth/papeis";
import { acessoAEmissao, MODULO_EMITIR_NFSE } from "@/lib/integracoes/omie/acessoEmissao";
import { listarContasOmie } from "@/lib/integracoes/omie/contas";
import { ROTULO_DO_ESTADO, type EstadoDaEmissao } from "@/lib/integracoes/omie/emissao";
import { listarEmissoes, outrasEmpresasDaMesmaConta, type EmissaoNaTela } from "@/lib/integracoes/omie/emissaoServidor";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { competenciaDoInstante } from "@/lib/financeiro/periodo";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";
import { formatCnpj, formatCpf, formatarCompetencia, formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { NovaNfse } from "@/components/omie/NovaNfse";
import { CancelarEmissao } from "@/components/omie/CancelarEmissao";

export const dynamic = "force-dynamic";

// Nota fiscal cancelada fica em vermelho — a exceção já registrada no `Selo`.
const TOM_DO_ESTADO: Record<EstadoDaEmissao, TomDoSelo> = {
  ENVIANDO: "marca",
  PROCESSANDO: "marca",
  AUTORIZADA: "sucesso",
  REJEITADA: "perigo",
  CANCELADA: "perigo",
};

const LIMITE_DA_LISTA = 100;

function documento(doc: string | null): string {
  if (!doc) return "";
  return doc.length === 11 ? formatCpf(doc) : formatCnpj(doc);
}

function mensagemCurta(m: string | null): string | null {
  if (!m) return null;
  return m.length > 400 ? `${m.slice(0, 399)}…` : m;
}

function Situacao({ e }: { e: EmissaoNaTela }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Selo tom={TOM_DO_ESTADO[e.estado]}>{ROTULO_DO_ESTADO[e.estado]}</Selo>
      {e.ambiente === "H" && <Badge variant="warning">Homologação</Badge>}
    </span>
  );
}

function NumeroDaNota({ e }: { e: EmissaoNaTela }) {
  if (!e.nfseNumero) return e.omieNumeroOS ? <span className="text-fg-muted">OS {e.omieNumeroOS}</span> : <span className="text-fg-muted">—</span>;
  return e.nfseUrl ? (
    <a href={e.nfseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
      NFS-e {e.nfseNumero} <ExternalLink size={12} />
    </a>
  ) : (
    <span>NFS-e {e.nfseNumero}</span>
  );
}

/**
 * Emitir NFS-e pelo Omie da empresa (Fase 2 da integração, 13/10/2026).
 *
 * A tela é um pedido ao Omie, não um emissor: tomador, serviço, tributação e
 * certificado moram no Omie de cada empresa, e a nota sai por lá. Daqui se
 * escolhe, confirma, acompanha até a prefeitura responder e cancela. Só a
 * empresa com conta do Omie ligada aparece no seletor.
 */
export default async function EmitirNfsePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx, setor } = await abrirTelaDoModulo(MODULO_EMITIR_NFSE);
  // `abrirTelaDoModulo` já garantiu o módulo ligado e o "ver".
  const { emitir: podeEmitir } = acessoAEmissao(ctx, setor, true);
  const params = await searchParams;
  const agora = new Date();

  const contas = (await listarContasOmie(ctx.tenantId, agora)).filter((c) => c.enabled);
  const empresas = contas.length > 0 ? await empresasDoSeletor(ctx.tenantId, contas.map((c) => c.companyId)) : [];
  // A empresa da URL, a última aberta pela pessoa, a única com conta do Omie —
  // ou nenhuma, e a tela pede (13/10/2026). Era a primeira em ordem alfabética:
  // a nota sairia pela empresa que ninguém escolheu.
  const { escolha, empresa: escolhida } = await escolherEmpresaDaTela(ctx, params.empresa, empresas);
  const companyId = escolhida?.id ?? null;

  // "Nova NFS-e" à direita do título, quando a empresa está escolhida (P19, 15/10/2026).
  const cabecalho = (acao?: React.ReactNode) => (
    <PageHeader
      title="Emitir NFS-e"
      subtitle="A nota sai pelo Omie da empresa, pedida daqui. Serviço, tributação e certificado continuam no cadastro do Omie."
      action={acao}
    />
  );

  if (empresas.length > 0 && !companyId) {
    return (
      <PageContainer>
        {cabecalho()}
        <FiltroDaEmpresa acao="/emitir-nfse" empresas={empresas} valor={null} />
        <EscolhaAEmpresa escolha={escolha} porQue="A nota sai pelo Omie de uma empresa por vez." />
      </PageContainer>
    );
  }

  if (!companyId || !escolhida) {
    return (
      <PageContainer>
        {cabecalho()}
        <EmptyState
          title="Nenhuma empresa com conta do Omie ligada"
          description="A conta do Omie de cada empresa (App Key e App Secret) é cadastrada em Integrações, por quem administra o escritório."
          icon={<ReceiptText />}
          action={isFullWrite(ctx.role) ? <Button href="/admin/integracoes" variant="secondary">Abrir Integrações</Button> : undefined}
        />
      </PageContainer>
    );
  }

  const empresa = empresas.find((e) => e.id === companyId)!;
  const comEmpresa = (tela: React.ReactNode) => (
    <EmpresaDaTela empresa={{ nome: empresa.nome, cnpj: empresa.cnpj }}>{tela}</EmpresaDaTela>
  );
  const conta = contas.find((c) => c.companyId === companyId)!;
  const [emissoes, compartilhada] = await Promise.all([
    listarEmissoes(ctx.tenantId, companyId, LIMITE_DA_LISTA + 1),
    outrasEmpresasDaMesmaConta(ctx.tenantId, companyId),
  ]);
  const limitado = emissoes.length > LIMITE_DA_LISTA;
  const linhas = limitado ? emissoes.slice(0, LIMITE_DA_LISTA) : emissoes;

  // A nota sai pela empresa escolhida — o rodapé do "Nova NFS-e" diz qual.
  return comEmpresa(
    <PageContainer>
      {cabecalho(
        podeEmitir ? <NovaNfse companyId={companyId} empresaNome={empresa.nome} competenciaAtual={competenciaDoInstante(agora)} /> : undefined
      )}

      <FiltroDaEmpresa acao="/emitir-nfse" empresas={empresas} valor={companyId} />

      <div className="flex flex-col gap-2 mb-4">
        {conta.saude === "com_erro" && conta.lastError && (
          <Aviso tom="atencao">A última chamada à conta do Omie desta empresa deu erro: {conta.lastError}</Aviso>
        )}
        {compartilhada.length > 0 && (
          <Aviso tom="info">
            A mesma conta do Omie (a mesma App Key) está cadastrada também em: {compartilhada.join(", ")}. As empresas dividem a fila de chamadas do Omie, e a
            nota só sai pela empresa cujo CNPJ está na conta — o Connect confere antes de enviar.
          </Aviso>
        )}
      </div>

      {!podeEmitir && (
        <p className="text-ui text-fg-muted mb-4">Só o administrador do setor emite e cancela NFS-e. Aqui você acompanha o que foi pedido.</p>
      )}

      <CascoDaTabela contagem={contarItens(linhas.length, "emissão", "emissões", limitado)}>
        {linhas.length === 0 ? (
          <EmptyState
            title="Nenhuma NFS-e pedida por aqui nesta empresa"
            description={podeEmitir ? "Use “Nova NFS-e”, no alto da tela, para pedir a primeira." : undefined}
            icon={<ReceiptText />}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map((e) => (
                <Cartao key={e.id}>
                  <TopoDoCartao nome={e.tomadorNome} valor={moeda(centavosDeDecimal(e.valor))} />
                  <InfoDoCartao>{e.servicoDescricao}</InfoDoCartao>
                  <InfoDoCartao className="mt-1">
                    pedida em {formatInstantDateTime(e.pedidoEm)} por {e.pedidoPor} · {formatarCompetencia(e.competencia)}
                  </InfoDoCartao>
                  {e.mensagem && <InfoDoCartao className="whitespace-pre-line break-words">{mensagemCurta(e.mensagem)}</InfoDoCartao>}
                  <PeDoCartao>
                    <Situacao e={e} />
                    <span className="text-fs-2">
                      <NumeroDaNota e={e} />
                    </span>
                    {podeEmitir && e.podeCancelar && (
                      <span className="ml-auto">
                        <CancelarEmissao emissaoId={e.id} naPrefeitura={e.cancelaNaPrefeitura} rotulo={e.nfseNumero ? `NFS-e ${e.nfseNumero}` : `OS ${e.omieNumeroOS ?? ""}`.trim()} />
                      </span>
                    )}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
                    <th className="py-2 pr-3 font-medium">Pedida em</th>
                    <th className="py-2 pr-3 font-medium">Tomador</th>
                    <th className="py-2 pr-3 font-medium">Serviço</th>
                    <th className="py-2 pr-3 font-medium text-right">Valor</th>
                    <th className="py-2 pr-3 font-medium">Situação</th>
                    <th className="py-2 pr-3 font-medium">Nota</th>
                    <th className="py-2 pr-3 font-medium">Mensagem do Omie</th>
                    <th className="py-2 font-medium" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((e) => (
                    <tr key={e.id} className="border-b border-border-soft align-top text-ui">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <div className="tabular-nums">{formatInstantDateTime(e.pedidoEm)}</div>
                        <div className="text-helper text-fg-muted">{e.pedidoPor}</div>
                      </td>
                      <td className="py-2 pr-3 min-w-0">
                        <div className="break-words">{e.tomadorNome}</div>
                        {e.tomadorDocumento && <div className="text-helper text-fg-muted tabular-nums">{documento(e.tomadorDocumento)}</div>}
                      </td>
                      <td className="py-2 pr-3 min-w-0">
                        <div className="break-words">{e.servicoDescricao}</div>
                        <div className="text-helper text-fg-muted">{formatarCompetencia(e.competencia)}</div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(centavosDeDecimal(e.valor))}</td>
                      <td className="py-2 pr-3">
                        <Situacao e={e} />
                        {e.canceladaEm && (
                          <div className="text-helper text-fg-muted mt-1">
                            {formatInstantDateTime(e.canceladaEm)}
                            {e.canceladaPor ? ` por ${e.canceladaPor}` : " no Omie"}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <NumeroDaNota e={e} />
                      </td>
                      <td className="py-2 pr-3 max-w-[320px] text-helper text-fg-muted whitespace-pre-line break-words">{mensagemCurta(e.mensagem) ?? "—"}</td>
                      <td className="py-2 text-right">
                        {podeEmitir && e.podeCancelar && (
                          <CancelarEmissao
                            emissaoId={e.id}
                            naPrefeitura={e.cancelaNaPrefeitura}
                            rotulo={e.nfseNumero ? `NFS-e ${e.nfseNumero}` : `OS ${e.omieNumeroOS ?? ""}`.trim()}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>

      <NotaDeFonte>
        Enquanto a prefeitura não responde, o Connect confere a situação com o Omie a cada poucos minutos, por até 7 dias. A nota autorizada entra em Documentos
        fiscais com origem Omie. Carta de correção não tem API: fica na tela do Omie.
      </NotaDeFonte>
    </PageContainer>
  );
}
