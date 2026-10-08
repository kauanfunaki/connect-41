import { notFound } from "next/navigation";
import { Handshake } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { TituloDeSecao } from "@/components/portal/TituloDeSecao";
import { SeloDaCobranca, SeloDoAcordo } from "@/components/cobranca/SeloDaCobranca";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { formatInstantDate } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { moeda } from "@/lib/financeiro/formato";
import { FAIXAS_DE_ATRASO, type ChaveDaFaixa } from "@/lib/financeiro/analise";
import { ROTULO_DA_SITUACAO, ROTULO_DO_CANAL, ROTULO_DO_RESULTADO } from "@/lib/financeiro/cobranca/regras";
import { cobrancaDoCliente, MODULO_DE_COBRANCA } from "@/lib/financeiro/cobranca/consultas";

export const dynamic = "force-dynamic";

/** O dia em São Paulo, em ISO — o valor de data que o funil espera. */
const diaEmSaoPaulo = (d: Date) => saoPauloParts(d).dateKey;

const rotuloDoAtraso = (faixa: ChaveDaFaixa) => FAIXAS_DE_ATRASO.find((f) => f.chave === faixa)?.rotulo ?? "";

/**
 * A cobrança vista pelo cliente: o que os sacados dele devem, em que pé está a
 * conversa e os acordos com as parcelas. Só leitura — a cobrança é trabalho da
 * equipe, e o cliente acompanha. A anotação interna do contato não sai daqui.
 */
export default async function PortalCobrancaPage() {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has(MODULO_DE_COBRANCA)) notFound();

  const { titulos, acordos } = await cobrancaDoCliente(escopo, new Date());
  const vencido = titulos.reduce((n, t) => n + t.valorCentavos, 0);
  const ativos = acordos.filter((a) => a.status === "ATIVO");

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Cobrança"
        descricao="Contas a receber vencidas das suas empresas, o andamento da cobrança e os acordos."
      />

      <FaixaDeTotais
        itens={[
          { rotulo: "Títulos vencidos", valor: String(titulos.length) },
          { rotulo: "Valor vencido", valor: moeda(vencido), tom: vencido > 0 ? "text-danger" : "" },
          { rotulo: "Acordos ativos", valor: String(ativos.length) },
          { rotulo: "Em aberto nos acordos", valor: moeda(ativos.reduce((n, a) => n + a.resumo.emAbertoCentavos, 0)), tom: "text-fg-muted" },
        ]}
      />

      {/* Títulos de seção no desenho do Início (`TituloDeSecao`, 08/10/2026). */}
      <TituloDeSecao>Títulos em cobrança</TituloDeSecao>
      {/* No casco da tabela (07/10/2026), como a cobrança da equipe: quantos
          títulos e quanto somam na barra, e a lista vazia dentro dele. */}
      <CascoDaTabela
        className="mb-6"
        contagem={contarItens(titulos.length, "título", "títulos")}
        total={titulos.length > 0 ? moeda(vencido) : undefined}
      >
      {titulos.length === 0 ? (
        <EmptyState icon={<Handshake />} title="Nenhum título vencido" description="Quando um cliente das suas empresas atrasar um pagamento, o título aparece aqui." />
      ) : (
        <>
          <CartoesNoCelular>
            {titulos.map((t) => (
              <Cartao key={t.id}>
                <TopoDoCartao nome={t.sacadoNome} valor={moeda(t.valorCentavos)} />
                {t.descricao && <InfoDoCartao>{t.descricao}</InfoDoCartao>}
                <InfoDoCartao className="mt-1 tabular-nums">
                  vence {formatInstantDate(t.vencimento)} · {FAIXAS_DE_ATRASO.find((f) => f.chave === t.faixa)?.rotulo}
                </InfoDoCartao>
                <InfoDoCartao>{t.empresaNome}</InfoDoCartao>
                {t.ultimoContato && (
                  <InfoDoCartao className="tabular-nums">
                    último contato {formatInstantDate(t.ultimoContato.em)} · {ROTULO_DO_CANAL[t.ultimoContato.canal]} ·{" "}
                    {ROTULO_DO_RESULTADO[t.ultimoContato.resultado]}
                  </InfoDoCartao>
                )}
                <PeDoCartao>
                  <SeloDaCobranca situacao={t.situacao} />
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>

          {/* Funil nas colunas (02/10): a lista vem inteira (até 500), então
              filtra no navegador. Último contato filtra pela data, pelo canal
              e pelo resultado — os três que a célula mostra. */}
          <TabelaFiltravel
            linhas={titulos.map((t) => ({
              id: t.id,
              valores: {
                vencimento: diaEmSaoPaulo(t.vencimento),
                cliente: t.sacadoNome,
                empresa: t.empresaNome,
                atraso: rotuloDoAtraso(t.faixa),
                situacao: t.situacao ? ROTULO_DA_SITUACAO[t.situacao] : "",
                contato: t.ultimoContato ? diaEmSaoPaulo(t.ultimoContato.em) : "",
                canal: t.ultimoContato ? ROTULO_DO_CANAL[t.ultimoContato.canal] : "",
                resultado: t.ultimoContato ? ROTULO_DO_RESULTADO[t.ultimoContato.resultado] : "",
              },
            }))}
          >
          <TabelaNoDesktop padrao>
          <table className="w-full min-w-[860px] text-ui">
            <thead>
              <tr>
                <th className="py-2 pr-3">
                  <FiltroDaColuna rotulo="Vencimento" chave="vencimento" tipo="data" />
                </th>
                <th className="py-2 pr-3">
                  <FiltroDaColuna rotulo="Cliente" chave="cliente" />
                </th>
                <th className="py-2 pr-3">
                  <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                </th>
                <th className="py-2 pr-3">Valor</th>
                <th className="py-2 pr-3">
                  <FiltroDaColuna rotulo="Atraso" chave="atraso" />
                </th>
                <th className="py-2 pr-3">
                  <FiltroDaColuna rotulo="Situação" chave="situacao" />
                </th>
                <th className="py-2">
                  <FiltroDaColuna
                    rotulo="Último contato"
                    campos={[
                      { chave: "contato", rotulo: "Data", tipo: "data" },
                      { chave: "canal", rotulo: "Canal" },
                      { chave: "resultado", rotulo: "Resultado" },
                    ]}
                    align="right"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {titulos.map((t) => (
                <LinhaFiltravel key={t.id} id={t.id} className="border-b border-border-soft align-top">
                  <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{formatInstantDate(t.vencimento)}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{t.sacadoNome}</span>
                    {t.descricao && <span className="block text-micro text-fg-muted truncate max-w-[240px]">{t.descricao}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-fg-secondary">{t.empresaNome}</td>
                  <td className="py-2.5 pr-3 tabular-nums font-medium">{moeda(t.valorCentavos)}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{rotuloDoAtraso(t.faixa)}</td>
                  <td className="py-2.5 pr-3">
                    <SeloDaCobranca situacao={t.situacao} />
                  </td>
                  <td className="py-2.5 text-fg-secondary">
                    {t.ultimoContato
                      ? `${formatInstantDate(t.ultimoContato.em)} · ${ROTULO_DO_CANAL[t.ultimoContato.canal]} · ${ROTULO_DO_RESULTADO[t.ultimoContato.resultado]}`
                      : "—"}
                  </td>
                </LinhaFiltravel>
              ))}
            </tbody>
          </table>
          </TabelaNoDesktop>
          </TabelaFiltravel>
        </>
      )}
      </CascoDaTabela>

      <TituloDeSecao>Acordos</TituloDeSecao>
      {acordos.length === 0 ? (
        <Card>
          <EmptyState icon={<Handshake />} title="Nenhum acordo" description="Quando uma dívida for renegociada em parcelas, o acordo aparece aqui." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {acordos.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="min-w-0 text-card-title font-semibold text-fg break-words">{a.sacadoNome}</span>
                <SeloDoAcordo status={a.status} />
              </div>
              {/* Ficha em colunas (rótulo em cima, valor embaixo): era uma frase
                  de seis fatos ligados por "·", que mudava de forma de um acordo
                  para o outro e não deixava comparar os valores. */}
              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3 mb-4">
                {[
                  { rotulo: "Empresa", valor: a.empresaNome },
                  { rotulo: "Acordado em", valor: formatInstantDate(a.acordadoEm) },
                  { rotulo: "Dívida original", valor: moeda(a.originalCentavos) },
                  { rotulo: "Valor acordado", valor: moeda(a.acordadoCentavos) },
                  { rotulo: "Parcelas pagas", valor: `${a.resumo.pagas}/${a.resumo.total}` },
                  { rotulo: "Recebido", valor: moeda(a.resumo.pagoCentavos) },
                ].map((f) => (
                  <div key={f.rotulo} className="min-w-0">
                    <dt className="text-helper text-fg-muted">{f.rotulo}</dt>
                    <dd className="text-ui text-fg tabular-nums break-words">{f.valor}</dd>
                  </div>
                ))}
              </dl>
              {/* Colunas de largura fixa: número, vencimento e valor caem um
                  embaixo do outro em todas as parcelas (no flex solto, cada
                  linha começava o valor num ponto). No celular o selo desce. */}
              <ul className="flex flex-col gap-1.5 text-fs-2 border-t border-border-soft pt-3">
                {a.parcelas.map((p, i) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                    <span className="w-10 shrink-0 text-fg-muted">
                      {i + 1}/{a.parcelas.length}
                    </span>
                    <span className="w-28 shrink-0">vence {formatInstantDate(p.vencimento)}</span>
                    <span className="w-24 shrink-0 text-right font-medium">{moeda(p.valorCentavos)}</span>
                    {p.pagoEm ? (
                      <Badge variant="success">Paga em {formatInstantDate(p.pagoEm)}</Badge>
                    ) : p.status === "CANCELADO" ? (
                      // Neutro (07/10/2026): no `info` era o mesmo azul de "A vencer".
                      <Badge variant="neutral">Encerrada</Badge>
                    ) : (
                      <Badge variant="warning">Em aberto</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
