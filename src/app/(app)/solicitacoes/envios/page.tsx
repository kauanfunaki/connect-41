import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCheck, FilePen, Hourglass, Paperclip, PenLine, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { isModuleEnabled } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { AbasDoAtendimento } from "@/components/solicitacoes/AbasDoAtendimento";
import { SeloDoEnvio } from "@/components/documentosCliente/SeloDoEnvio";
import { listarEnviosDaEquipe, LIMITE_DA_LISTA } from "@/lib/envios/consultas";
import {
  ROTULO_DA_SITUACAO,
  SITUACOES_DO_ENVIO,
  ehSituacaoDoEnvio,
  rotaDoEnvio,
  rotaDoNovoEnvio,
  rotaDosEnvios,
  type SituacaoDoEnvio,
} from "@/lib/envios/regras";

export const dynamic = "force-dynamic";

/**
 * Os envios ao cliente (08/10/2026): os documentos que o escritório manda a
 * uma empresa — guia, contrato, orientação —, com a prova de que o cliente viu
 * e, quando pedido, o aceite. Até aqui era "Documentos para cliente", uma tela
 * solta dentro da ficha de cada empresa; agora é a quarta aba da central de
 * Solicitações, onde fica toda a troca com o cliente, e o publicado aparece
 * também no portal.
 *
 * O alcance é o de antes (`scopedCompanyWhere`). A tela não depende do canal do
 * portal: sem ele ligado, as outras abas não existem e a lista aparece sem a
 * fileira de abas — e o envio segue por e-mail, como sempre foi. A ficha da
 * empresa chega aqui com `?empresa=`.
 */
export default async function EnviosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();

  const params = await searchParams;
  const prisma = getPrisma();
  const empresasNoAlcance = await scopedCompanyWhere(ctx);
  const [canalLigado, comEnvio, pedida] = await Promise.all([
    isModuleEnabled(ctx.tenantId, "portal_solicitacoes"),
    // As empresas do filtro: as que têm algum envio — com 394 empresas no
    // cadastro, a lista inteira seria quase toda de opções vazias.
    prisma.company.findMany({
      where: { ...empresasNoAlcance, clientDocuments: { some: {} } },
      select: { id: true, name: true, displayName: true },
    }),
    // A da URL vale mesmo sem envio nenhum (vem da ficha da empresa), desde que
    // esteja no alcance.
    params.empresa
      ? prisma.company.findFirst({ where: { ...empresasNoAlcance, id: params.empresa }, select: { id: true, name: true, displayName: true } })
      : null,
  ]);
  const empresaId = pedida?.id ?? null;
  const situacao: SituacaoDoEnvio | null = ehSituacaoDoEnvio(params.situacao) ? params.situacao : null;
  const podeCriar = canWrite(ctx.role);

  const { linhas: todas, limitado } = await listarEnviosDaEquipe({ tenantId: ctx.tenantId, empresas: empresasNoAlcance }, { empresaId });
  const linhas = situacao ? todas.filter((l) => l.situacao === situacao) : todas;
  // Os cartões contam o que espera alguém, na empresa filtrada; ignoram a
  // situação escolhida (são o mapa da lista, como nas outras abas).
  const quantos = (s: SituacaoDoEnvio) => todas.filter((l) => l.situacao === s).length;
  const rascunhos = quantos("rascunho");
  const naoVistos = quantos("enviado");
  const semAceite = quantos("aguardando-aceite");

  const opcoesDeEmpresa = [...comEnvio, ...(pedida && !comEnvio.some((e) => e.id === pedida.id) ? [pedida] : [])]
    .map((e) => ({ value: e.id, label: nomeExibicao(e) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  function href(mudancas: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const atual: Record<string, string | undefined> = { empresa: empresaId ?? undefined, situacao: situacao ?? undefined, ...mudancas };
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${rotaDosEnvios()}?${s}` : rotaDosEnvios();
  }

  // Destinatário é quem recebeu o link por e-mail ou abriu pelo portal (a
  // primeira abertura no portal cria a linha da pessoa).
  const destinatarios = (n: number, viram: number) =>
    n === 0 ? "Ninguém abriu ainda" : `${viram} de ${n} ${n === 1 ? "destinatário viu" : "destinatários viram"}`;

  return (
    <PageContainer>
      <PageHeader
        title="Envios ao cliente"
        subtitle="Documentos que o escritório manda a uma empresa — guia, contrato, orientação —, com a prova de que o cliente viu e, quando pedido, o aceite. O publicado aparece no portal do cliente e pode ir também por e-mail."
        action={
          podeCriar ? (
            <Button href={rotaDoNovoEnvio(empresaId)}>
              <Plus size={14} /> Novo envio
            </Button>
          ) : undefined
        }
      />

      {canalLigado && <AbasDoAtendimento ativa="envios" />}

      <div>
        <FaixaDeTotais
          itens={[
            {
              rotulo: "Rascunhos",
              valor: formatarNumero(rascunhos, 0),
              tom: rascunhos > 0 ? "text-warning-fg" : "",
              icone: <FilePen />,
              href: href({ situacao: "rascunho" }),
              ativo: situacao === "rascunho",
            },
            {
              rotulo: "Enviados, não vistos",
              valor: formatarNumero(naoVistos, 0),
              tom: naoVistos > 0 ? "text-brand" : "",
              icone: <Hourglass />,
              href: href({ situacao: "enviado" }),
              ativo: situacao === "enviado",
            },
            {
              rotulo: "Aguardando aceite",
              valor: formatarNumero(semAceite, 0),
              tom: semAceite > 0 ? "text-warning-fg" : "",
              icone: <PenLine />,
              href: href({ situacao: "aguardando-aceite" }),
              ativo: situacao === "aguardando-aceite",
            },
          ]}
        />
      </div>

      <CascoDaTabela
        contagem={contarItens(linhas.length, "envio", "envios", limitado)}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: "Todas",
                opcoes: SITUACOES_DO_ENVIO.map((s) => ({ value: s.chave, label: s.rotulo })),
              },
              { chave: "empresa", rotulo: "Empresa", vazioLabel: "Todas", opcoes: opcoesDeEmpresa },
            ]}
          />
        }
      >
        {linhas.length === 0 ? (
          <EmptyState
            icon={<FileCheck />}
            title={situacao || empresaId ? "Nenhum envio neste recorte" : "Nenhum envio ainda"}
            description={
              podeCriar
                ? "Crie um envio para mandar ao cliente um documento — guia, contrato, orientação — com prova de que ele viu e, se precisar, o aceite. Ele lê no portal ou pelo link do e-mail."
                : undefined
            }
            action={
              podeCriar && !situacao ? (
                <Button href={rotaDoNovoEnvio(empresaId)} variant="secondary">
                  <Plus size={14} /> Novo envio
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map((l) => (
                <Cartao key={l.id}>
                  <Link href={rotaDoEnvio(l.id)} className="font-medium text-brand hover:underline break-words">
                    {l.titulo}
                  </Link>
                  <InfoDoCartao className="mt-0.5 break-words">
                    {l.empresaNome}
                    {l.temAnexo ? " · com anexo" : ""}
                    {l.pedeAceite ? " · pede aceite" : ""}
                  </InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    {l.situacao === "rascunho" ? "criado" : "publicado"} em {formatInstantDate(l.publicadoEm ?? l.criadoEm)}
                    {l.situacao !== "rascunho" && ` · ${destinatarios(l.destinatarios, l.viram)}`}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <SeloDoEnvio situacao={l.situacao} />
                  </PeDoCartao>
                </Cartao>
              ))}
              {limitado && <p className="text-fs-1 text-fg-muted mt-1">Mostrando os {LIMITE_DA_LISTA} mais recentes. Filtre por empresa para ver o resto.</p>}
            </CartoesNoCelular>

            <TabelaFiltravel
              linhas={linhas.map((l) => ({
                id: l.id,
                valores: {
                  titulo: l.titulo,
                  empresa: l.empresaNome,
                  situacao: ROTULO_DA_SITUACAO[l.situacao],
                  aceite: l.pedeAceite ? "Pede aceite" : "Sem aceite",
                  data: saoPauloParts(l.publicadoEm ?? l.criadoEm).dateKey,
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[880px]">
                  <thead>
                    <tr className="text-fs-1 uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna
                          rotulo="Envio"
                          campos={[
                            { chave: "titulo", rotulo: "Título" },
                            { chave: "aceite", rotulo: "Aceite" },
                          ]}
                        />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                      </th>
                      <th className="py-2 pr-3 font-medium">Leitura</th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Situação" chave="situacao" />
                      </th>
                      <th className="py-2 font-medium">
                        <FiltroDaColuna rotulo="Data" chave="data" tipo="data" align="right" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                        <td className="py-2.5 pr-3">
                          <Link href={rotaDoEnvio(l.id)} className="font-medium text-brand hover:underline">
                            {l.titulo}
                          </Link>
                          {(l.temAnexo || l.pedeAceite) && (
                            <span className="block text-fs-1 text-fg-muted">
                              {l.temAnexo && (
                                <>
                                  <Paperclip size={10} className="inline" /> com anexo
                                </>
                              )}
                              {l.temAnexo && l.pedeAceite && " · "}
                              {l.pedeAceite && "pede aceite"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{l.empresaNome}</td>
                        <td className="py-2.5 pr-3 text-fg-secondary">{l.situacao === "rascunho" ? "—" : destinatarios(l.destinatarios, l.viram)}</td>
                        <td className="py-2.5 pr-3">
                          <SeloDoEnvio situacao={l.situacao} />
                        </td>
                        <td className="py-2.5 tabular-nums whitespace-nowrap text-fg-muted">
                          <span className="block">{formatInstantDate(l.publicadoEm ?? l.criadoEm)}</span>
                          <span className="block text-fs-1">{l.situacao === "rascunho" ? "criado" : "publicado"}</span>
                        </td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
                {limitado && <p className="text-fs-1 text-fg-muted mt-3">Mostrando os {LIMITE_DA_LISTA} mais recentes. Filtre por empresa para ver o resto.</p>}
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
