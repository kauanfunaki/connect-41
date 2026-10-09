import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, ShieldAlert, Send, Hourglass } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { MetricCard } from "@/components/ui/MetricCard";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { AtualizarEmLote, BotaoDaAutorizacao, PedidoAoCliente } from "@/components/autorizacoes/DialogosDaAutorizacao";
import { TOM_DA_SITUACAO } from "@/components/autorizacoes/AutorizacaoNaFicha";
import { acessoAsAutorizacoes, carteiraDasAutorizacoes, quemRecebe, sugestaoDeQuemRecebe } from "@/lib/autorizacoes/servidor";
import {
  andamentoDaAutorizacao,
  diasEntre,
  noRecorte,
  prazoParaValidar,
  precisaDePedido,
  RECORTES,
  ROTULO_DA_SITUACAO,
  textoDoPedido,
  type Recorte,
  type Situacao,
} from "@/lib/autorizacoes/regras";
import { ROTULO_DO_TIPO_DE_REGIME } from "@/lib/taxRegime";
import { hojeIso } from "@/lib/datas/calendario";
import { getAuthContext } from "@/lib/auth/context";
import type { TaxRegimeKind } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/** O mais urgente primeiro: o que cai se ninguém validar, o que se perdeu, o que vence. */
const URGENCIA: Record<Situacao, number> = {
  validar: 0,
  caiu: 1,
  vencida: 1,
  a_renovar: 2,
  falta_pedir: 3,
  cancelada: 3,
  pedida: 4,
  ativa: 5,
  nao_se_aplica: 6,
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const REGIMES = Object.entries(ROTULO_DO_TIPO_DE_REGIME) as [TaxRegimeKind, string][];

/**
 * Autorizações de Acesso da Receita Federal (a antiga procuração do e-CAC) da
 * carteira: quem já autorizou o escritório, quem falta pedir, o que está para
 * validar no Portal e o que vence. Preparação para o Integra Contador do Serpro
 * (09/10/2026): sem a autorização, cada chamada em nome do cliente volta 403 —
 * e é cobrada.
 */
export default async function AutorizacoesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) notFound();
  const params = await searchParams;
  const recorte: Recorte = RECORTES.find((r) => r.chave === params.situacao)?.chave ?? "pendentes";
  const regime = REGIMES.find(([k]) => k === params.regime)?.[0] ?? null;
  const busca = (params.q ?? "").trim().toLowerCase();
  const digitos = busca.replace(/\D/g, "");

  const hoje = hojeIso();
  const [{ linhas, semDocumento }, recebe, sugestao] = await Promise.all([
    carteiraDasAutorizacoes(acesso.tenantId, hoje),
    quemRecebe(acesso.tenantId),
    sugestaoDeQuemRecebe(acesso.tenantId),
  ]);

  const visiveis = linhas
    .filter(
      (l) =>
        noRecorte(l.situacao, recorte) &&
        (!regime || l.regime === regime) &&
        (!busca ||
          l.empresa.nome.toLowerCase().includes(busca) ||
          l.filiais.some((f) => f.nome.toLowerCase().includes(busca)) ||
          (digitos.length >= 3 && l.chave.includes(digitos.slice(0, Math.min(digitos.length, l.chave.length)))))
    )
    .sort((a, b) => URGENCIA[a.situacao] - URGENCIA[b.situacao] || a.empresa.nome.localeCompare(b.empresa.nome, "pt-BR"));

  const conta = (f: (s: Situacao) => boolean) => linhas.filter((l) => f(l.situacao)).length;
  const validarLogo = linhas.filter(
    (l) => l.situacao === "validar" && l.registro?.receivedAt && diasEntre(hoje, prazoParaValidar(l.registro.receivedAt)) <= 5
  ).length;
  const ativas = conta((s) => s === "ativa" || s === "a_renovar");
  const consideradas = linhas.length - conta((s) => s === "nao_se_aplica");
  const href = (s: Recorte) => `/autorizacoes${s === "pendentes" ? "" : `?situacao=${s}`}`;

  return (
    <PageContainer>
      <PageHeader
        title="Autorizações de acesso"
        subtitle="Quais clientes já autorizaram o escritório na Receita Federal (a antiga procuração do e-CAC). É o que o Serpro confere antes de cada consulta ou guia em nome do cliente."
        action={
          <div className="flex flex-wrap gap-2 justify-end">
            <PedidoAoCliente texto={recebe ? textoDoPedido(recebe) : null} quemRecebe={recebe} sugestao={sugestao} podeConfigurar={acesso.podeConfigurar} />
            {acesso.podeEditar && <AtualizarEmLote hoje={hoje} />}
          </div>
        }
      />

      {!recebe && (
        <Aviso tom="atencao" className="mb-4">
          Falta definir quem recebe as autorizações: o CNPJ do escritório contábil que o cliente informa no Portal.{" "}
          {acesso.podeConfigurar ? "Clique em “Como pedir ao cliente” para definir." : "Peça à coordenação do setor para definir."}
        </Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Validar no Portal"
          value={conta((s) => s === "validar")}
          sub={validarLogo ? `${validarLogo} cai em até 5 dias` : "o cliente já cadastrou"}
          tom={validarLogo ? "critico" : undefined}
          icon={<Hourglass size={15} />}
          href={href("validar")}
        />
        <MetricCard label="Falta pedir" value={conta(precisaDePedido)} sub="inclui caídas, canceladas e vencidas" icon={<ShieldAlert size={15} />} href={href("pedir")} />
        <MetricCard label="Com o cliente" value={conta((s) => s === "pedida")} sub="pedida, ainda não cadastrou" icon={<Send size={15} />} href={href("pedida")} />
        <MetricCard
          label="Ativas"
          value={ativas}
          sub={`de ${plural(consideradas, "cliente", "clientes")}${conta((s) => s === "a_renovar") ? ` · ${conta((s) => s === "a_renovar")} a renovar` : ""}`}
          icon={<ShieldCheck size={15} />}
          href={href("ativa")}
        />
      </div>

      <CascoDaTabela
        contagem={contarItens(visiveis.length, "cliente", "clientes")}
        busca={
          <form method="get" action="/autorizacoes" className="max-w-full">
            {recorte !== "pendentes" && <input type="hidden" name="situacao" value={recorte} />}
            {regime && <input type="hidden" name="regime" value={regime} />}
            <CampoDeBusca
              compact
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar por empresa ou CNPJ…"
              aria-label="Buscar cliente"
              className="w-72 max-w-full"
            />
          </form>
        }
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: "Pendentes",
                opcoes: RECORTES.filter((r) => r.chave !== "pendentes").map((r) => ({ value: r.chave, label: r.rotulo })),
              },
              { chave: "regime", rotulo: "Regime", vazioLabel: "Todos", opcoes: REGIMES.map(([value, label]) => ({ value, label })) },
            ]}
          />
        }
      >
        {visiveis.length === 0 ? (
          <EmptyState
            title={linhas.length === 0 ? "Nenhuma empresa ativa com CNPJ ou CPF" : busca ? "Nada encontrado" : "Nada nesta situação"}
            description={recorte === "pendentes" && linhas.length > 0 && !busca && !regime ? "Todos os clientes estão com a autorização ativa ou marcados como “Não se aplica”." : undefined}
            icon={<ShieldCheck />}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {visiveis.map((l) => (
                <Cartao key={l.chave}>
                  <TopoDoCartao nome={<Link href={`/empresas/${l.empresa.id}`}>{l.empresa.nome}</Link>} />
                  <InfoDoCartao className="tabular-nums">
                    {l.documento}
                    {l.filiais.length > 0 && ` · +${plural(l.filiais.length, "filial", "filiais")}`}
                  </InfoDoCartao>
                  <InfoDoCartao>{andamentoDaAutorizacao(l.situacao, l.registro, hoje)}</InfoDoCartao>
                  <PeDoCartao>
                    <Selo tom={TOM_DA_SITUACAO[l.situacao]}>{ROTULO_DA_SITUACAO[l.situacao]}</Selo>
                    {acesso.podeEditar && <BotaoDaAutorizacao chave={l.chave} nome={l.empresa.nome} documento={l.documento} registro={l.registro} hoje={hoje} />}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            <TabelaFiltravel
              linhas={visiveis.map((l) => ({
                id: l.chave,
                valores: {
                  empresa: l.empresa.nome,
                  regime: l.regime ? ROTULO_DO_TIPO_DE_REGIME[l.regime] : "",
                  situacao: ROTULO_DA_SITUACAO[l.situacao],
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                      </th>
                      <th className="py-2 pr-3 font-medium">Raiz do CNPJ</th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Regime" chave="regime" />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Situação" chave="situacao" />
                      </th>
                      <th className="py-2 pr-3 font-medium">Andamento</th>
                      {acesso.podeEditar && <th className="py-2 font-medium" aria-label="Ações" />}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => (
                      <LinhaFiltravel key={l.chave} id={l.chave} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                        <td className="py-2.5 pr-3">
                          <Link href={`/empresas/${l.empresa.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                            {l.empresa.nome}
                          </Link>
                          {l.filiais.length > 0 && (
                            <span className="block text-micro text-fg-muted" title={l.filiais.map((f) => f.nome).join(", ")}>
                              + {plural(l.filiais.length, "filial", "filiais")}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums text-fg-secondary">{l.documento}</td>
                        <td className="py-2.5 pr-3 text-fg-secondary">
                          {l.regime ? ROTULO_DO_TIPO_DE_REGIME[l.regime] : "—"}
                          {l.semMovimento && <span className="block text-micro text-fg-muted">sem movimento</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Selo tom={TOM_DA_SITUACAO[l.situacao]}>{ROTULO_DA_SITUACAO[l.situacao]}</Selo>
                        </td>
                        <td className="py-2.5 pr-3 text-fg-secondary">
                          {andamentoDaAutorizacao(l.situacao, l.registro, hoje)}
                          {l.registro?.atualizadaPor && <span className="block text-micro text-fg-muted">por {l.registro.atualizadaPor}</span>}
                        </td>
                        {acesso.podeEditar && (
                          <td className="py-2.5 text-right">
                            <BotaoDaAutorizacao chave={l.chave} nome={l.empresa.nome} documento={l.documento} registro={l.registro} hoje={hoje} />
                          </td>
                        )}
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
        <p className="text-micro text-fg-muted mt-3">
          Uma linha por raiz de CNPJ: a autorização dada pela matriz vale para as filiais. O escritório valida no Portal de Serviços da Receita, aba
          “Recebidas”, em até 30 dias do cadastro do cliente — depois disso ela cai. O setor é avisado faltando 10 e 3 dias e no último dia, e 60,
          30 e 7 dias antes do fim da validade.
          {semDocumento > 0 && ` ${plural(semDocumento, "empresa ativa sem CNPJ ou CPF válido ficou", "empresas ativas sem CNPJ ou CPF válido ficaram")} de fora.`}
        </p>
      </CascoDaTabela>
    </PageContainer>
  );
}
