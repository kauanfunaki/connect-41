import { notFound } from "next/navigation";
import { Wand2, History, ArrowLeft } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { StatusDot } from "@/components/shared/StatusDot";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { TIPOS_COM_EXTRATO } from "@/lib/financeiro/tiposDeConta";
import { nomeDaContaBancaria } from "@/lib/financeiro/contaPrevista";
import { camposDaRegraSalva, descricaoDaAcao, descricaoDaCondicao } from "@/lib/financeiro/conciliacao/regras";
import { regrasDaEmpresa, type RegraDaEmpresa } from "@/lib/financeiro/conciliacao/regrasServidor";
import { empresaLidaDoOmie } from "@/lib/integracoes/omie/viradaServidor";
import { dataCurta } from "@/components/financeiro/conciliacao/data";
import { NovaRegra, AcoesDaRegra, DesfazerDaRegra, type OpcoesDaRegra } from "@/components/financeiro/conciliacao/RegraDeConciliacao";

export const dynamic = "force-dynamic";

const MODULE = "bpo_conciliacao";
const SECTOR = getModuleDef(MODULE)!.sectorCode;

/** O registro mostra os lançamentos mais recentes; o resto fica na auditoria. */
const LIMITE_DO_REGISTRO = 100;

/**
 * As regras de conciliação de uma empresa (fila do BPO, 21/10): listar, editar,
 * pausar, excluir, aplicar às pendentes — e o registro de qual regra lançou o
 * quê, com o desfazer.
 */
export default async function RegrasDeConciliacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuthContext();
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR) : SECTOR;
  if (!ctx.tenantId || !canViewSector(ctx, setor)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);
  const tenantId = ctx.tenantId;

  const params = await searchParams;
  const empresas = await empresasDoSeletor(tenantId);
  // Com uma empresa em foco (21/10/2026), só ela, a matriz e as filiais — como a conciliação.
  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id ?? null;

  const subtitulo = "O que se repete no extrato — tarifa, rendimento, aluguel, folha, um fornecedor fixo — vira lançamento sem ninguém digitar.";
  const voltar = (
    <Button href={`/conciliacao${companyId ? `?empresa=${companyId}` : ""}`} variant="ghost" size="sm">
      <ArrowLeft size={14} /> Conciliação
    </Button>
  );
  const filtroDaEmpresa = <FiltroDaEmpresa acao="/conciliacao/regras" empresas={noSeletor} foco={foco} valor={companyId} />;

  if (!empresa || !companyId) {
    return (
      <PageContainer>
        <PageHeader title="Regras de conciliação" subtitle={subtitulo} action={voltar} />
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa ativa" icon={<Wand2 />} />
        ) : (
          <>
            {filtroDaEmpresa}
            <EscolhaAEmpresa escolha={escolha} porQue="As regras são de cada empresa." />
          </>
        )}
      </PageContainer>
    );
  }

  const prisma = getPrisma();
  const [regras, lidaDoOmie, usos, registro, contrapartes, categorias, centros, projetos, contas] = await Promise.all([
    regrasDaEmpresa(prisma, tenantId, companyId),
    empresaLidaDoOmie(tenantId, companyId),
    prisma.bankRuleApplication.groupBy({
      by: ["ruleId"],
      where: { tenantId, companyId, undoneAt: null, ruleId: { not: null } },
      _count: { _all: true },
    }),
    prisma.bankRuleApplication.findMany({
      where: { tenantId, companyId },
      select: {
        id: true,
        ruleName: true,
        automatic: true,
        createdAt: true,
        createdById: true,
        undoneAt: true,
        undoneById: true,
        transaction: { select: { postedAt: true, amount: true, memo: true, payeeName: true, bankAccount: { select: { nickname: true } } } },
        financeEntry: { select: { counterparty: { select: { name: true } }, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE_DO_REGISTRO,
    }),
    podeAgir
      ? prisma.financeCounterparty.findMany({
          where: { tenantId, companyId, active: true },
          select: { id: true, name: true, document: true },
          orderBy: { name: "asc" },
        })
      : [],
    podeAgir ? prisma.financeCategory.findMany({ where: ondeDaEmpresa(tenantId, companyId), select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }) : [],
    podeAgir ? prisma.costCenter.findMany({ where: { tenantId, companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    podeAgir ? prisma.financeProject.findMany({ where: { tenantId, companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    prisma.bankAccount.findMany({
      where: { tenantId, companyId, active: true, type: { in: [...TIPOS_COM_EXTRATO] } },
      select: { id: true, nickname: true, bankCode: true, accountNumber: true, type: true, agency: true },
      orderBy: { nickname: "asc" },
    }),
  ]);
  const lancadas = new Map(usos.map((u) => [u.ruleId, u._count._all]));
  const pessoas = await nomesDasPessoas(registro.flatMap((r) => [r.createdById, r.undoneById]));
  const opcoes: OpcoesDaRegra = {
    contrapartes: contrapartes.map((c) => ({ id: c.id, nome: c.name, documento: c.document })),
    categorias: categorias.map((c) => ({ id: c.id, nome: c.name, kind: c.kind })),
    centros: centros.map((c) => ({ id: c.id, nome: c.name })),
    projetos: projetos.map((p) => ({ id: p.id, nome: p.name })),
    contas: contas.map((c) => ({ id: c.id, nome: nomeDaContaBancaria(c) })),
  };

  const acoes = (r: RegraDaEmpresa) =>
    podeAgir ? (
      <AcoesDaRegra id={r.id} nome={r.nome} ativa={r.ativa} campos={camposDaRegraSalva(r)} companyId={companyId} opcoes={opcoes} lidaDoOmie={lidaDoOmie} />
    ) : null;

  return (
    <EmpresaDaTela empresa={{ nome: empresa.nome, cnpj: empresa.cnpj }}>
      <PageContainer>
        <PageHeader
          title="Regras de conciliação"
          subtitle={subtitulo}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {voltar}
              {podeAgir && <NovaRegra companyId={companyId} opcoes={opcoes} lidaDoOmie={lidaDoOmie} />}
            </div>
          }
        />
        {filtroDaEmpresa}
        {lidaDoOmie && (
          <Aviso tom="marca" className="mb-4">
            Esta empresa ainda é lida do Omie: até a virada, toda regra só sugere — o Connect não lança sozinho o que o BPO lança no Omie
            e a leitura traria de novo. Depois da virada, a regra em “lançar sozinha” passa a lançar na importação do extrato.
          </Aviso>
        )}

        <CascoDaTabela contagem={contarItens(regras.length, "regra", "regras")}>
          {regras.length === 0 ? (
            <EmptyState
              title="Nenhuma regra nesta empresa"
              description="Crie uma aqui, ou na conciliação: depois de criar o lançamento de uma linha, o Connect oferece a regra “sempre que vier assim”."
              icon={<Wand2 />}
            />
          ) : (
            <>
              <CartoesNoCelular>
                {regras.map((r) => (
                  <Cartao key={r.id}>
                    <TopoDoCartao nome={r.nome} valor={<Modo regra={r} />} />
                    <InfoDoCartao className="mt-1">{descricaoDaCondicao(r, r.contaNome)}</InfoDoCartao>
                    <InfoDoCartao>{descricaoDaAcao(r)}</InfoDoCartao>
                    <InfoDoCartao className="tabular-nums">{lancadas.get(r.id) ?? 0} lançada(s)</InfoDoCartao>
                    <PeDoCartao>
                      <Ativa ativa={r.ativa} />
                      <span className="ml-auto">{acoes(r)}</span>
                    </PeDoCartao>
                  </Cartao>
                ))}
              </CartoesNoCelular>
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">Regra</th>
                      <th className="py-2 pr-3 font-medium">Quando</th>
                      <th className="py-2 pr-3 font-medium">Lança como</th>
                      <th className="py-2 pr-3 font-medium">Faz</th>
                      <th className="py-2 pr-3 font-medium text-right">Lançadas</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {regras.map((r) => (
                      <tr key={r.id} className="border-b border-border-soft align-top">
                        <td className="py-2.5 pr-3">
                          <span className="block font-medium text-fg">{r.nome}</span>
                          <Ativa ativa={r.ativa} />
                        </td>
                        <td className="py-2.5 pr-3 text-fs-2 text-fg-secondary max-w-[280px]">{descricaoDaCondicao(r, r.contaNome)}</td>
                        <td className="py-2.5 pr-3 text-fs-2 text-fg-secondary max-w-[260px]">{descricaoDaAcao(r)}</td>
                        <td className="py-2.5 pr-3">
                          <Modo regra={r} />
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{lancadas.get(r.id) ?? 0}</td>
                        <td className="py-2.5">{acoes(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </>
          )}
        </CascoDaTabela>

        <div className="flex items-center gap-2 mt-8 mb-3">
          <History size={16} className="text-brand" />
          <h2 className="text-section font-semibold text-fg">O que as regras lançaram</h2>
        </div>
        <CascoDaTabela contagem={contarItens(registro.length, "lançamento", "lançamentos", registro.length >= LIMITE_DO_REGISTRO)}>
          {registro.length === 0 ? (
            <EmptyState title="Nenhum lançamento por regra ainda" icon={<History />} />
          ) : (
            // Grade de registro, com rolagem lateral no celular — como o extrato.
            <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">Quando</th>
                    <th className="py-2 pr-3 font-medium">Regra</th>
                    <th className="py-2 pr-3 font-medium">Linha do extrato</th>
                    <th className="py-2 pr-3 font-medium">Lançamento</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {registro.map((a) => {
                    const centavos = centavosDeDecimal(a.transaction.amount);
                    return (
                      <tr key={a.id} className="border-b border-border-soft align-top">
                        <td className="py-2.5 pr-3 text-fs-2 whitespace-nowrap">
                          {formatInstantDateTime(a.createdAt, { dateStyle: "short", timeStyle: "short" })}
                          <span className="block text-micro text-fg-muted">
                            {a.automatic ? "Sozinha, na importação" : `Por ${pessoas.get(a.createdById ?? "") ?? "alguém da equipe"}`}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-fs-2 font-medium">{a.ruleName}</td>
                        <td className="py-2.5 pr-3 text-fs-2 max-w-[300px]">
                          <span className="block break-words">{[a.transaction.payeeName, a.transaction.memo].filter(Boolean).join(" · ") || "Sem descrição"}</span>
                          <span className="block text-micro text-fg-muted tabular-nums">
                            {dataCurta(saoPauloParts(a.transaction.postedAt).dateKey)} · {a.transaction.bankAccount.nickname} · {moeda(centavos)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-fs-2 text-fg-secondary">
                          {a.financeEntry.counterparty.name}
                          {a.financeEntry.category && <span className="text-fg-muted"> · {a.financeEntry.category.name}</span>}
                        </td>
                        <td className="py-2.5">
                          {a.undoneAt ? (
                            <span className="text-micro text-fg-muted">
                              Desfeito em {formatInstantDateTime(a.undoneAt, { dateStyle: "short" })}
                              {a.undoneById ? ` por ${pessoas.get(a.undoneById) ?? "alguém da equipe"}` : ""}
                            </span>
                          ) : (
                            podeAgir && <DesfazerDaRegra applicationId={a.id} nome={a.ruleName} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CascoDaTabela>
        <NotaDeFonte>
          A regra olha a linha do extrato — entrada ou saída, o texto do histórico, o valor e a conta — e cria o lançamento pago no
          dia dela, já conciliado. Em “sugerir”, a regra aparece na linha e a pessoa confirma; em “lançar sozinha”, ela lança ao
          importar o extrato, menos quando há dúvida: outra regra pega a mesma linha, há lançamento em aberto de mesmo valor, ou
          alguém já desfez o que ela lançou ali. Desfazer cancela o lançamento e devolve a linha às pendentes.
        </NotaDeFonte>
      </PageContainer>
    </EmpresaDaTela>
  );
}

function Ativa({ ativa }: { ativa: boolean }) {
  return <StatusDot color={ativa ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={ativa ? "Ativa" : "Pausada"} />;
}

function Modo({ regra }: { regra: RegraDaEmpresa }) {
  return <Selo tom={regra.modo === "LANCAR" ? "marca" : "neutro"}>{regra.modo === "LANCAR" ? "Lança sozinha" : "Sugere"}</Selo>;
}

async function nomesDasPessoas(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  if (unicos.length === 0) return new Map();
  // Os ids vêm do registro desta empresa; a pessoa pode ter vindo de outro escritório (acesso a vários).
  const users = await getPrisma().user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}
