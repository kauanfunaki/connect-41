import Link from "next/link";
import { Building2, Calculator, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { NovaAvaliacao } from "@/components/tributario/NovaAvaliacao";
import { AcoesDaAvaliacao } from "@/components/tributario/AcoesDaAvaliacao";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { formatCnpj, formatInstantDate } from "@/lib/format";
import { listarAvaliacoes } from "@/lib/tributario/servidor";
import { ROTA_DO_PLANEJAMENTO, rotuloDoModo } from "@/lib/tributario/regras";

export const dynamic = "force-dynamic";

/**
 * Planejamento tributário (05/11/2026): as avaliações do Connect Tributário
 * dentro do Connect — Simples, Simples híbrido, Presumido e Real comparados de
 * 2027 a 2033 com os dados de cada empresa. Busca e aba (Ativas/Lixeira) pela
 * URL, para o endereço ser copiável.
 */
export default async function PlanejamentoTributarioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("contabil_planejamento");
  const params = await searchParams;
  const lixeira = params.aba === "lixeira";
  const busca = params.busca?.trim() || null;

  const [podeAgir, avaliacoes, naLixeira, empresas] = await Promise.all([
    podeNoModulo(ctx, "contabil_planejamento", "agir"),
    listarAvaliacoes(ctx.tenantId, { lixeira, busca }),
    // Só a contagem da outra aba, para o número no seletor.
    listarAvaliacoes(ctx.tenantId, { lixeira: !lixeira }),
    empresasDoSeletor(ctx.tenantId),
  ]);
  const ativas = lixeira ? naLixeira.length : avaliacoes.length;
  const descartadas = lixeira ? avaliacoes.length : naLixeira.length;
  const comBusca = (aba: "ativas" | "lixeira") => {
    const q = new URLSearchParams();
    if (aba === "lixeira") q.set("aba", "lixeira");
    if (busca) q.set("busca", busca);
    const s = q.toString();
    return s ? `${ROTA_DO_PLANEJAMENTO}?${s}` : ROTA_DO_PLANEJAMENTO;
  };

  return (
    <PageContainer>
      <PageHeader
        title="Planejamento tributário"
        subtitle="Compare Simples Nacional, Simples híbrido, Lucro Presumido e Lucro Real de 2027 a 2033, com os dados de cada empresa e as premissas da reforma."
        action={podeAgir ? <NovaAvaliacao empresas={empresas} anoAtual={new Date().getFullYear()} /> : undefined}
      />

      <CascoDaTabela
        contagem={contarItens(avaliacoes.length, "avaliação", "avaliações", avaliacoes.length === 500)}
        busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar por nome ou CNPJ" />}
        filtros={
          <SegmentedControl
            label="Quais avaliações"
            active={lixeira ? "lixeira" : "ativas"}
            items={[
              { key: "ativas", label: "Ativas", href: comBusca("ativas"), contagem: lixeira ? ativas : undefined },
              { key: "lixeira", label: "Lixeira", href: comBusca("lixeira"), contagem: lixeira ? undefined : descartadas },
            ]}
          />
        }
      >
        {avaliacoes.length === 0 ? (
          lixeira ? (
            <EmptyState icon={<Trash2 />} title="A lixeira está vazia" description="Avaliações movidas para a lixeira guardam dados e histórico e podem ser restauradas aqui." />
          ) : (
            <EmptyState
              icon={<Calculator />}
              title={busca ? "Nenhuma avaliação encontrada" : "Seu próximo estudo começa aqui"}
              description={
                busca
                  ? "Confira o nome ou o CNPJ buscado."
                  : "Comece pelos totais numa avaliação rápida ou siga as etapas da avaliação analítica. As avaliações salvas aparecem nesta lista."
              }
            />
          )
        ) : (
          <>
            <CartoesNoCelular>
              {avaliacoes.map((a) => (
                <Cartao key={a.id}>
                  <TopoDoCartao
                    nome={
                      lixeira ? (
                        a.nome
                      ) : (
                        <Link href={`${ROTA_DO_PLANEJAMENTO}/${a.id}`} className="text-fg hover:text-brand transition-colors">
                          {a.nome}
                        </Link>
                      )
                    }
                  />
                  <InfoDoCartao>
                    {a.cnpj ? formatCnpj(a.cnpj) : "CNPJ a preencher"} · dados de {a.ano}
                  </InfoDoCartao>
                  <InfoDoCartao>
                    {lixeira && a.naLixeiraEm ? `Na lixeira desde ${formatInstantDate(a.naLixeiraEm)}` : `Atualizada em ${formatInstantDate(a.updatedAt)}`}
                    {a.atualizadoPor ? ` · ${a.atualizadoPor}` : ""}
                  </InfoDoCartao>
                  <PeDoCartao>
                    <Selo tom={a.modo === "guiada" ? "marca" : "neutro"}>{rotuloDoModo(a.modo)}</Selo>
                    {podeAgir && (
                      <div className="ml-auto">
                        <AcoesDaAvaliacao id={a.id} nome={a.nome} revisao={a.revisao} naLixeira={lixeira} />
                      </div>
                    )}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-3 text-left">Avaliação</th>
                    <th className="px-3 text-left">CNPJ</th>
                    <th className="px-3 text-left">Modo</th>
                    <th className="px-3 text-left">Dados de</th>
                    <th className="px-3 text-left">{lixeira ? "Na lixeira desde" : "Atualizada"}</th>
                    <th className="px-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {avaliacoes.map((a) => (
                    <tr key={a.id} className="border-b border-border align-top">
                      <td className="px-3">
                        {lixeira ? (
                          <span className="font-semibold text-fg">{a.nome}</span>
                        ) : (
                          <Link href={`${ROTA_DO_PLANEJAMENTO}/${a.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                            {a.nome}
                          </Link>
                        )}
                        {a.empresa && (
                          <span className="flex items-center gap-1 text-micro text-fg-muted">
                            <Building2 size={12} aria-hidden /> {a.empresa.nome}
                          </span>
                        )}
                      </td>
                      <td className="px-3 tabular-nums text-fg-secondary whitespace-nowrap">{a.cnpj ? formatCnpj(a.cnpj) : "—"}</td>
                      <td className="px-3">
                        <Selo tom={a.modo === "guiada" ? "marca" : "neutro"}>{rotuloDoModo(a.modo)}</Selo>
                      </td>
                      <td className="px-3 tabular-nums text-fg-secondary">{a.ano}</td>
                      <td className="px-3 text-fg-secondary whitespace-nowrap">
                        {formatInstantDate(lixeira && a.naLixeiraEm ? a.naLixeiraEm : a.updatedAt)}
                        {a.atualizadoPor && <span className="block text-micro text-fg-muted">{a.atualizadoPor}</span>}
                      </td>
                      <td className="px-3 text-right">
                        {podeAgir && <AcoesDaAvaliacao id={a.id} nome={a.nome} revisao={a.revisao} naLixeira={lixeira} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
