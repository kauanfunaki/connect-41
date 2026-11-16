import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { AjudaDoCampo } from "@/components/ui/CampoForm";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { BotaoDaAutorizacao } from "@/components/autorizacoes/DialogosDaAutorizacao";
import { AbrirMensagem, EmitirCertificadoDoMei, EmitirGuia, PedirSituacaoFiscal, VerMensagem } from "@/components/autorizacoes/BotoesDaReceita";
import type { AutorizacaoDaEmpresa } from "@/lib/autorizacoes/servidor";
import { andamentoDaAutorizacao, ROTULO_DA_SITUACAO, type Situacao } from "@/lib/autorizacoes/regras";
import type { TipoDeGuia } from "@/lib/serpro/guias";
import { EVENTOS, ROTULO_CURTO_DO_EVENTO, ROTULO_DO_EVENTO } from "@/lib/serpro/eventos";
import type { EventoNaTela, MensagemNaTela, ReceitaDaEmpresa } from "@/lib/serpro/acompanhamento";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";

/** O tom do selo de cada situação — o mesmo na lista e na ficha. */
export const TOM_DA_SITUACAO: Record<Situacao, TomDoSelo> = {
  falta_pedir: "neutro",
  pedida: "marca",
  validar: "atencao",
  caiu: "perigo",
  ativa: "sucesso",
  a_renovar: "atencao",
  vencida: "perigo",
  cancelada: "perigo",
  nao_se_aplica: "neutro",
};

/** Como está a mensagem: aberta aqui, com ciência pelo e-CAC, ou ainda nova. */
export function situacaoDaMensagem(m: Pick<MensagemNaTela, "abertaEm" | "abertaPor" | "cienciaEm">): string {
  if (m.abertaEm) return `Aberta${m.abertaPor ? ` por ${m.abertaPor}` : ""} em ${formatInstantDate(new Date(m.abertaEm))}`;
  if (m.cienciaEm) return `Ciência em ${formatInstantDate(new Date(m.cienciaEm))}`;
  return "Nova";
}

/** O pedido de situação fiscal, em selo: o texto diz o estado, o tom só reforça. */
const SELO_DO_SITFIS: Record<string, { rotulo: string; tom: TomDoSelo }> = {
  PROTOCOLO: { rotulo: "Aguardando o Serpro", tom: "marca" },
  RESULTADO: { rotulo: "O Serpro está preparando", tom: "marca" },
  PRONTO: { rotulo: "Pronto", tom: "sucesso" },
  FALHOU: { rotulo: "Não saiu", tom: "perigo" },
  EXPIRADO: { rotulo: "Não ficou pronto no dia", tom: "atencao" },
};

/** O que cada etiqueta do Movimento quer dizer, por extenso, na dica da linha. */
const DICA_DO_MOVIMENTO = ["O último dia de cada evento, nos últimos 60 dias:", ...EVENTOS.map((e) => ROTULO_DO_EVENTO[e])].join("\n");

const LINK_DISCRETO = "text-ui text-fg-muted hover:text-brand transition-colors whitespace-nowrap";

/** "13/11", do dia em AAAA-MM-DD: o evento é sempre dos últimos 60 dias. */
const diaEMes = (iso: string) => iso.slice(5, 10).split("-").reverse().join("/");

/** A autorização de acesso da raiz desta empresa, com o que o botão "Atualizar" precisa. */
export type AutorizacaoNoCartao = {
  dados: AutorizacaoDaEmpresa;
  nome: string;
  hoje: string;
  podeEditar: boolean;
  /** A ligação com o Serpro está pronta: o diálogo oferece conferir lá. */
  serpro: boolean;
};

/** O que o Serpro diz da empresa, com quem pode pedir e abrir. */
export type ReceitaNoCartao = {
  dados: ReceitaDaEmpresa;
  companyId: string;
  /** Quem edita no Fiscal pede a situação fiscal (cobrada). */
  podePedir: boolean;
  /** Abrir mensagem é só da coordenação do Fiscal: dá ciência da intimação. */
  podeAbrir: boolean;
  /** Por que a ligação não chama agora; null = pronta. */
  motivo: string | null;
  /** A guia que a janela abre escolhida, pelo regime da empresa. */
  guiaSugerida: TipoDeGuia;
};

/**
 * Uma linha do cartão: o assunto, a situação e a ação, em três colunas
 * alinhadas. Em cartão estreito (a medida é a do cartão, não a da janela) a
 * linha empilha. `abaixo` fica sob a situação, até a borda direita.
 */
function Linha({
  assunto,
  dica,
  acao,
  abaixo,
  children,
}: {
  assunto: string;
  /** O "?" ao lado do assunto: abre no mouse, no foco do teclado e no toque. */
  dica?: string;
  acao?: React.ReactNode;
  abaixo?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-x-4 gap-y-1.5 py-3 first:pt-0 last:pb-0 @2xl:grid-cols-[11rem_minmax(0,1fr)_auto] @2xl:items-center">
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="text-label font-medium text-fg">{assunto}</h3>
        {dica && <AjudaDoCampo texto={dica} rotulo={assunto} />}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-ui text-fg-secondary">{children}</div>
      {acao && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 @2xl:justify-end">{acao}</div>}
      {abaixo && <div className="min-w-0 @2xl:col-span-2 @2xl:col-start-2">{abaixo}</div>}
    </section>
  );
}

/**
 * O custo à vista, ao lado do botão: pedir a situação fiscal e emitir o
 * certificado de MEI saem no clique, sem janela de confirmação.
 */
function EmissaoCobrada() {
  return <span className="text-helper text-fg-muted whitespace-nowrap">emissão cobrada</span>;
}

/** A etiqueta de um evento: nome curto e a data, "sem acesso" ou "nada em 60 dias". */
function EtiquetaDoEvento({ e }: { e: EventoNaTela }) {
  const nome = ROTULO_CURTO_DO_EVENTO[e.evento];
  if (e.semAcesso) return <Selo tom="atencao">{`${nome} · sem acesso`}</Selo>;
  if (e.ultimoEm) return <Selo tom="marca" className="tabular-nums">{`${nome} ${diaEMes(e.ultimoEm)}`}</Selo>;
  return <Selo tom="neutro">{`${nome} · nada em 60 dias`}</Selo>;
}

/**
 * A Receita Federal na Visão geral da ficha, num cartão só e em linhas
 * (16/11/2026, melhoria-715). Eram dois cartões — "Autorização de acesso na
 * Receita" e "Receita Federal pelo Serpro" — com cinco frases de explicação
 * para três datas e dois botões; o retorno de uso foi de texto miúdo demais.
 * Cada linha é um assunto: nome, situação e ação. O que era frase de ajuda foi
 * para a dica ("?"); o que tem consequência ficou à vista (o custo da emissão,
 * a ciência da intimação).
 *
 * Cada parte segue com o próprio portão: `autorizacao` aparece para quem vê o
 * módulo; `receita`, só com o Serpro em produção. Sem nenhuma, não há cartão.
 */
export function ReceitaFederalNaFicha({ autorizacao, receita }: { autorizacao: AutorizacaoNoCartao | null; receita: ReceitaNoCartao | null }) {
  if (!autorizacao && !receita) return null;
  const eventos = receita?.dados.eventos ?? [];
  return (
    <Card className="@container p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-section font-semibold text-fg">Receita Federal</h2>
        {eventos.length > 0 && (
          <span className="text-helper text-fg-muted tabular-nums">
            conferido em {formatInstantDateTime(new Date(eventos[0].lidoEm), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {receita?.motivo && <Aviso tom="atencao">{receita.motivo}</Aviso>}
      {receita?.dados.semAcesso && (
        <Aviso tom="atencao">
          O Serpro negou o acesso a este cliente no último acompanhamento: falta a Autorização de Acesso, ou ela não cobre o serviço. Sem ela, a
          Caixa Postal não abre e as chamadas pagas não saem.
        </Aviso>
      )}

      <div className="divide-y divide-border-soft">
        {autorizacao && <LinhaDaAutorizacao {...autorizacao} />}
        {receita && <LinhasDaReceita {...receita} />}
      </div>
    </Card>
  );
}

function LinhaDaAutorizacao({ dados, nome, hoje, podeEditar, serpro }: AutorizacaoNoCartao) {
  return (
    <Linha
      assunto="Autorização de acesso"
      acao={
        <>
          <Link href="/autorizacoes" aria-label="Autorizações de todos os clientes" className={LINK_DISCRETO}>
            Todos os clientes
          </Link>
          {podeEditar && !dados.semDocumento && (
            <BotaoDaAutorizacao chave={dados.chave} nome={nome} documento={dados.documento} registro={dados.registro} hoje={hoje} serpro={serpro} />
          )}
        </>
      }
    >
      {dados.semDocumento ? (
        <span className="text-fg-muted">Sem CNPJ ou CPF válido no cadastro</span>
      ) : (
        <>
          <Selo tom={TOM_DA_SITUACAO[dados.situacao]}>{ROTULO_DA_SITUACAO[dados.situacao]}</Selo>
          {dados.mesmaRaiz > 0 && (
            <AjudaDoCampo
              rotulo="Autorização de acesso"
              texto={`Vale para a raiz ${dados.documento}: ${dados.mesmaRaiz === 1 ? "mais 1 empresa cadastrada" : `mais ${dados.mesmaRaiz} empresas cadastradas`}.`}
            />
          )}
          {dados.registro && <span className="min-w-0 break-words">{andamentoDaAutorizacao(dados.situacao, dados.registro, hoje)}</span>}
        </>
      )}
    </Linha>
  );
}

function LinhasDaReceita({ dados, companyId, podePedir, podeAbrir, motivo, guiaSugerida }: ReceitaNoCartao) {
  const sitfis = dados.sitfis;
  const seloDoSitfis = sitfis ? (SELO_DO_SITFIS[sitfis.situacao] ?? { rotulo: sitfis.situacao, tom: "neutro" as const }) : null;
  const novas = dados.mensagens.filter((m) => !m.abertaEm && !m.cienciaEm).length;
  return (
    <>
      <Linha assunto="Movimento" dica={DICA_DO_MOVIMENTO}>
        {dados.eventos.length === 0 ? (
          <span className="text-fg-muted">Ainda não conferido</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {dados.eventos.map((e) => (
              <li key={e.evento} className="inline-flex">
                <EtiquetaDoEvento e={e} />
              </li>
            ))}
          </ul>
        )}
      </Linha>

      <Linha
        assunto="Caixa Postal"
        acao={
          <Link href="/autorizacoes/caixa-postal" aria-label="Caixa Postal de todos os clientes" className={LINK_DISCRETO}>
            Todos os clientes
          </Link>
        }
        abaixo={
          dados.mensagens.length > 0 && (
            <>
              <ul className="flex flex-col divide-y divide-border-soft">
                {dados.mensagens.slice(0, 10).map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-ui text-fg break-words">
                        {m.assunto} {m.relevante && <Selo tom="atencao">Relevante</Selo>}
                      </p>
                      <p className="text-micro text-fg-muted tabular-nums">
                        Enviada em {formatInstantDate(new Date(m.enviadaEm))}
                        {m.origem ? ` · ${m.origem}` : ""} · {situacaoDaMensagem(m)}
                      </p>
                    </div>
                    {m.abertaEm ? <VerMensagem id={m.id} /> : podeAbrir && !motivo ? <AbrirMensagem id={m.id} /> : null}
                  </li>
                ))}
              </ul>
              {/* Consequência jurídica, não ajuda: fica à vista, junto da lista. Para a
                  coordenação, que abre, quem diz é a confirmação do botão "Abrir". */}
              {!podeAbrir && dados.mensagens.some((m) => !m.abertaEm) && (
                <p className="text-micro text-fg-muted">Abrir uma mensagem dá ciência da intimação: só a coordenação do Fiscal abre.</p>
              )}
            </>
          )
        }
      >
        {novas > 0 ? (
          <Selo tom="atencao">{novas === 1 ? "1 mensagem nova" : `${novas} mensagens novas`}</Selo>
        ) : (
          <span className="text-fg-muted">Nenhuma mensagem nova</span>
        )}
        {dados.mensagens.length > 0 && (
          <span className="text-fg-muted tabular-nums">última em {formatInstantDate(new Date(dados.mensagens[0].enviadaEm))}</span>
        )}
      </Linha>

      <Linha
        assunto="Situação fiscal"
        dica="Uma emissão, cobrada pelo Serpro. O PDF vai para Arquivos › Fiscal."
        acao={
          podePedir && (
            <>
              <EmissaoCobrada />
              <PedirSituacaoFiscal companyId={companyId} desabilitado={!!motivo} />
            </>
          )
        }
      >
        {sitfis && seloDoSitfis ? (
          <>
            <Selo tom={seloDoSitfis.tom}>{seloDoSitfis.rotulo}</Selo>
            <span className="tabular-nums">pedida em {formatInstantDateTime(new Date(sitfis.pedidoEm))}</span>
            {sitfis.situacao === "PRONTO" && sitfis.arquivoId && (
              <a href={`/api/arquivos/${sitfis.arquivoId}?ver=1`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                Abrir o PDF
              </a>
            )}
            {sitfis.erro && sitfis.situacao !== "PRONTO" && <span className="basis-full text-micro text-fg-muted break-words">{sitfis.erro}</span>}
          </>
        ) : (
          <span className="text-fg-muted">Nenhum relatório pedido</span>
        )}
      </Linha>

      <Linha
        assunto="Guias federais"
        dica="DAS do Simples e do MEI, guia da DCTFWeb, DARF e parcela de parcelamento, com recálculo pela data de pagamento. Uma emissão, cobrada pelo Serpro. O PDF vai para Arquivos › Guias, que o cliente vê no portal."
        acao={
          podePedir && (
            <>
              <EmissaoCobrada />
              <EmitirGuia companyId={companyId} desabilitado={!!motivo} sugestao={guiaSugerida} />
            </>
          )
        }
      >
        DAS, DCTFWeb, DARF e parcelamento
      </Linha>

      {guiaSugerida === "DAS_MEI" && (
        <Linha
          assunto="Certificado de MEI"
          dica="O CCMEI atualizado, para o Societário e para o cliente. Uma emissão, cobrada pelo Serpro. O PDF vai para Arquivos › Societário, que o cliente não vê: para mandar, use Enviar ao cliente."
          acao={
            podePedir && (
              <>
                <EmissaoCobrada />
                <EmitirCertificadoDoMei companyId={companyId} desabilitado={!!motivo} />
              </>
            )
          }
        >
          CCMEI atualizado
        </Linha>
      )}
    </>
  );
}
