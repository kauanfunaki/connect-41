import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { AbrirMensagem, EmitirCertificadoDoMei, EmitirGuia, PedirSituacaoFiscal, VerMensagem } from "@/components/autorizacoes/BotoesDaReceita";
import type { TipoDeGuia } from "@/lib/serpro/guias";
import type { MensagemNaTela, ReceitaDaEmpresa } from "@/lib/serpro/acompanhamento";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const ROTULO_DO_SITFIS: Record<string, string> = {
  PROTOCOLO: "pedido, aguardando o Serpro",
  RESULTADO: "pedido, o Serpro está preparando",
  PRONTO: "pronto",
  FALHOU: "não saiu",
  EXPIRADO: "não ficou pronto no dia",
};

/** Como está a mensagem: aberta aqui, com ciência pelo e-CAC, ou ainda nova. */
export function situacaoDaMensagem(m: Pick<MensagemNaTela, "abertaEm" | "abertaPor" | "cienciaEm">): string {
  if (m.abertaEm) return `Aberta${m.abertaPor ? ` por ${m.abertaPor}` : ""} em ${formatInstantDate(new Date(m.abertaEm))}`;
  if (m.cienciaEm) return `Ciência em ${formatInstantDate(new Date(m.cienciaEm))}`;
  return "Nova";
}

/**
 * O que o Serpro diz da empresa, na Visão geral da ficha (Fase 1 do Integra
 * Contador, 20/10/2026): o movimento na Receita (Eventos de Atualização), as
 * mensagens da Caixa Postal e a situação fiscal. Abrir mensagem é só da
 * coordenação do Fiscal (`podeAbrir`), porque dá ciência da intimação.
 */
export function ReceitaNaFicha({
  dados,
  companyId,
  podePedir,
  podeAbrir,
  motivo,
  guiaSugerida,
}: {
  dados: ReceitaDaEmpresa;
  companyId: string;
  /** Quem edita no Fiscal pede a situação fiscal (cobrada). */
  podePedir: boolean;
  podeAbrir: boolean;
  /** Por que a ligação não chama agora; null = pronta. */
  motivo: string | null;
  /** A guia que a janela abre escolhida, pelo regime da empresa. */
  guiaSugerida: TipoDeGuia;
}) {
  const sitfis = dados.sitfis;
  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section font-semibold text-fg">Receita Federal pelo Serpro</h2>
        <Link href="/autorizacoes/caixa-postal" className="text-ui text-fg-muted hover:text-brand transition-colors">
          Caixa Postal de todos os clientes
        </Link>
      </div>

      {motivo && <Aviso tom="atencao">{motivo}</Aviso>}
      {dados.semAcesso && (
        <Aviso tom="atencao">
          O Serpro negou o acesso a este cliente no último acompanhamento: falta a Autorização de Acesso, ou ela não cobre o serviço. Sem ela, a
          Caixa Postal não abre e as chamadas pagas não saem.
        </Aviso>
      )}

      <section className="flex flex-col gap-1.5">
        <h3 className="text-label font-medium text-fg">Movimento na Receita</h3>
        {dados.eventos.length === 0 ? (
          <p className="text-ui text-fg-muted">O acompanhamento diário ainda não passou por este cliente.</p>
        ) : (
          <ul className="text-ui text-fg-secondary flex flex-col gap-1">
            {dados.eventos.map((e) => (
              <li key={e.evento}>
                {e.rotulo}:{" "}
                <span className="tabular-nums text-fg">{e.semAcesso ? "sem acesso" : e.ultimoEm ? `em ${dataBr(e.ultimoEm)}` : "nada nos últimos 60 dias"}</span>
              </li>
            ))}
            <li className="text-micro text-fg-muted">Conferido em {formatInstantDateTime(new Date(dados.eventos[0].lidoEm))}, de graça, pelos Eventos de Atualização.</li>
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-label font-medium text-fg">Caixa Postal</h3>
        {dados.mensagens.length === 0 ? (
          <p className="text-ui text-fg-muted">Nenhuma mensagem trazida. O Connect busca a lista sozinho quando o Serpro avisa de mensagem nova.</p>
        ) : (
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
        )}
        {!podeAbrir && dados.mensagens.some((m) => !m.abertaEm) && (
          <p className="text-micro text-fg-muted">Abrir uma mensagem dá ciência da intimação: só a coordenação do Fiscal abre.</p>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-label font-medium text-fg">Situação fiscal</h3>
          <p className="text-ui text-fg-secondary">
            {sitfis ? (
              <>
                Pedida em {formatInstantDateTime(new Date(sitfis.pedidoEm))}: {ROTULO_DO_SITFIS[sitfis.situacao] ?? sitfis.situacao}
                {sitfis.situacao === "PRONTO" && sitfis.arquivoId && (
                  <>
                    {" · "}
                    <a href={`/api/arquivos/${sitfis.arquivoId}?ver=1`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      abrir o PDF
                    </a>
                  </>
                )}
                {sitfis.erro && sitfis.situacao !== "PRONTO" && <span className="block text-micro text-fg-muted">{sitfis.erro}</span>}
              </>
            ) : (
              "Nenhum relatório pedido pelo Connect."
            )}
          </p>
          <p className="text-micro text-fg-muted">Uma emissão, cobrada pelo Serpro. O PDF vai para Arquivos › Fiscal.</p>
        </div>
        {podePedir && <PedirSituacaoFiscal companyId={companyId} desabilitado={!!motivo} />}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-label font-medium text-fg">Guias federais</h3>
          <p className="text-ui text-fg-secondary">DAS do Simples e do MEI, guia da DCTFWeb, DARF e parcela de parcelamento, com recálculo pela data de pagamento.</p>
          <p className="text-micro text-fg-muted">Uma emissão, cobrada pelo Serpro. O PDF vai para Arquivos › Guias, que o cliente vê no portal.</p>
        </div>
        {podePedir && <EmitirGuia companyId={companyId} desabilitado={!!motivo} sugestao={guiaSugerida} />}
      </section>

      {guiaSugerida === "DAS_MEI" && (
        <section className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-label font-medium text-fg">Certificado de MEI</h3>
            <p className="text-ui text-fg-secondary">O CCMEI atualizado, para o Societário e para o cliente.</p>
            <p className="text-micro text-fg-muted">Uma emissão, cobrada pelo Serpro. O PDF vai para Arquivos › Societário, que o cliente não vê: para mandar, use Enviar ao cliente.</p>
          </div>
          {podePedir && <EmitirCertificadoDoMei companyId={companyId} desabilitado={!!motivo} />}
        </section>
      )}
    </Card>
  );
}
