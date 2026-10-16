import { Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { ColaboradoresTable, type LinhaDaTabelaDeColaboradores } from "@/components/colaboradores/ColaboradoresTable";
import { PessoasFilterButton } from "@/components/pessoas/PessoasFilterButton";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { formatCalendarDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { resolvePersonActiveFilter, estaOcultandoInativos, situacaoSelecionada, SITUACAO_TODOS } from "@/lib/personActiveFilter";
import { LIMITE_DA_BUSCA, modoDaTela, termoDaBusca } from "@/lib/colaboradores/busca";
import { buscarEmTodasAsEmpresas, colaboradoresDaEmpresa, lerResumoDaEmpresa, type LinhaDeColaborador } from "@/lib/colaboradores/consultas";
import { numerosDoResumo } from "@/lib/colaboradores/resumoDaEmpresa";
import { definirAtivoPessoasEmMassa } from "../pessoas/actions";

const POR_PAGINA = 50;

function paraALinha(p: LinhaDeColaborador): LinhaDaTabelaDeColaboradores {
  return {
    id: p.id,
    name: p.name,
    active: p.active,
    cpf: p.cpf,
    photoUrl: p.photoUrl,
    cargo: p.cargo?.name ?? null,
    situacao: p.employmentStatus,
    // Data de calendário (meia-noite UTC), como a ficha mostra.
    admissao: p.admissionDate ? formatCalendarDate(p.admissionDate) : null,
    empresa: p.currentCompany ? { id: p.currentCompany.id, nome: nomeExibicao(p.currentCompany) } : null,
  };
}

/**
 * Colaboradores das empresas clientes.
 *
 * Saiu de `/pessoas` em 2026-09-02 por decisão do Kauan: Cadastros é módulo
 * geral, e misturar o pessoal das empresas clientes com o cadastro do próprio
 * escritório não se sustentava ali. Continuam sendo `Person` com
 * `isInternal = false`, com os vínculos de admissão, férias, rescisão,
 * afastamento e escala — o DP segue lendo daqui. A rota vive sob o setor
 * `recrutamento`; quem procurar pelo módulo de DP acha os fluxos
 * (`/admissoes`, `/desligamentos`, `/ferias`).
 *
 * **Uma empresa por vez** (14/10/2026, escolha "1C — Seletor de empresa no
 * topo" do Kauan). Abria na lista de todo mundo em ordem alfabética — cerca de
 * 4 mil pessoas em ~400 empresas, 200 páginas — com a empresa só numa coluna.
 * Agora:
 * - o seletor de empresa das telas da equipe, que abre na **última empresa
 *   aberta** (`escolherEmpresaDaTela`) e grava a escolha;
 * - sem empresa ainda, o pedido de escolher — nunca a primeira da lista;
 * - em cima da tabela, o resumo da empresa (`resumoDaEmpresa`);
 * - a busca por nome ou CPF continua valendo em **todas** as empresas, com
 *   teto (`LIMITE_DA_BUSCA`) e a empresa de cada pessoa na tabela.
 *
 * `?companyId=` é o endereço antigo (favoritos, links salvos) — vale como
 * `?empresa=`.
 */
export default async function ColaboradoresClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; empresa?: string; companyId?: string; page?: string; situacao?: string }>;
}) {
  const params = await searchParams;
  const { ctx, setor } = await abrirTelaDoModulo("recrutamento_colaboradores_clientes");
  const canCreate = canManageSector(ctx, setor);

  const busca = termoDaBusca(params.search);
  const filtro = resolvePersonActiveFilter(params.situacao);
  const situacao = situacaoSelecionada(filtro) || undefined;

  const empresas = await empresasDoSeletor(ctx.tenantId);
  const { escolha, empresa } = await escolherEmpresaDaTela(ctx, params.empresa ?? params.companyId, empresas);
  const companyId = empresa?.id ?? null;
  const modo = modoDaTela(busca, escolha);

  const cabecalho = (
    <PageHeader
      title="Colaboradores de clientes"
      subtitle="As pessoas que trabalham nas empresas clientes — é este cadastro que alimenta admissão, férias e rescisão no DP. A tela abre na última empresa que você abriu."
      action={
        canCreate ? (
          <Button href="/pessoas/nova?tipo=cliente" variant="primary">
            <Plus size={14} />
            Novo colaborador
          </Button>
        ) : undefined
      }
    />
  );
  // Trocar de empresa conserva o filtro de cadastro; a busca fica para trás —
  // escolher uma empresa é sair da busca em todas.
  const fileiraDaEmpresa = (
    <FiltroDaEmpresa acao="/colaboradores-clientes" empresas={empresas} valor={companyId} manter={{ situacao }} className="mb-5">
      {/* A chave remonta o campo ao trocar de empresa: escolher uma empresa
          sai da busca, e o campo não pode continuar mostrando o termo. Só a
          empresa — com o termo na chave, o campo remontaria a cada letra. */}
      <DebouncedSearchInput key={companyId ?? "sem-empresa"} placeholder="Buscar em todas as empresas…" className="w-72 max-w-full" />
    </FiltroDaEmpresa>
  );
  const filtros = (
    <PessoasFilterButton
      search={busca ?? undefined}
      situacao={situacaoSelecionada(filtro)}
      mostrarEmpresa={false}
      manter={{ empresa: companyId ?? undefined }}
      rotuloDaSituacao="Cadastro"
    />
  );
  /** O aviso dos inativos fora da lista, com o "Mostrar todos". */
  function avisoDosInativos(ocultos: number, todosHref: string) {
    if (!estaOcultandoInativos(filtro) || ocultos === 0) return undefined;
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fs-2 text-fg-muted">
        <span>
          {ocultos} colaborador{ocultos !== 1 ? "es" : ""} inativo{ocultos !== 1 ? "s" : ""} fora desta lista.
        </span>
        <Button href={todosHref} variant="ghost" size="xs">
          Mostrar todos
        </Button>
      </span>
    );
  }
  function href(extra: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const juntos: Record<string, string | undefined> = { empresa: companyId ?? undefined, search: busca ?? undefined, situacao, ...extra };
    for (const [k, v] of Object.entries(juntos)) if (v) q.set(k, v);
    return `/colaboradores-clientes?${q.toString()}`;
  }

  /**
   * A moldura das três situações da tela. A fileira da empresa fica sempre no
   * mesmo lugar da árvore: a tela troca de situação enquanto a pessoa digita
   * a busca (da empresa para "busca em todas"), e o campo não pode remontar —
   * perderia o foco no meio da palavra.
   */
  const tela = (conteudo: React.ReactNode) => (
    <PageContainer>
      {cabecalho}
      {empresas.length > 0 || busca ? fileiraDaEmpresa : null}
      {conteudo}
    </PageContainer>
  );

  // ─── A busca em todas as empresas ──────────────────────────────────────────
  if (modo === "busca" && busca) {
    const { itens, temMais, inativos } = await buscarEmTodasAsEmpresas(ctx, busca, filtro);
    return tela(
      <>
        <CascoDaTabela
          contagem={
            <>
              {contarItens(itens.length, "pessoa encontrada", "pessoas encontradas", temMais)}
              <span className="font-normal text-fg-muted"> em todas as empresas</span>
            </>
          }
          filtros={filtros}
          acoes={avisoDosInativos(inativos, href({ situacao: SITUACAO_TODOS }))}
        >
          {itens.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="Ninguém encontrado"
              description="Confira o nome ou o CPF. A busca procura em todas as empresas clientes."
            />
          ) : (
            <ColaboradoresTable
              linhas={itens.map(paraALinha)}
              canCreate={canCreate}
              mostrarEmpresa
              definirAtivoPessoasEmMassa={definirAtivoPessoasEmMassa}
            />
          )}
        </CascoDaTabela>
        {temMais && (
          <p className="mt-3 text-fs-2 text-fg-muted">
            Mostrando as {LIMITE_DA_BUSCA} primeiras, em ordem alfabética. Digite mais do nome — ou o CPF — para achar quem você procura.
          </p>
        )}
      </>
    );
  }

  // ─── Sem empresa ainda ─────────────────────────────────────────────────────
  if (modo === "escolher" || !companyId) {
    return tela(
      empresas.length === 0 ? (
        <EmptyState icon={<Users />} title="Nenhuma empresa ativa" description="Os colaboradores aparecem aqui por empresa cliente." />
      ) : (
        <EscolhaAEmpresa
          escolha={escolha}
          porQue="A lista mostra o pessoal de uma empresa por vez. Para achar alguém sem saber a empresa, use a busca em todas as empresas, ao lado do campo."
        />
      )
    );
  }

  // ─── A empresa escolhida ───────────────────────────────────────────────────
  const pagina = Math.max(1, parseInt(params.page ?? "1") || 1);
  const [{ linhas, total, inativos }, resumo] = await Promise.all([
    colaboradoresDaEmpresa(ctx, companyId, filtro, { numero: pagina, tamanho: POR_PAGINA }),
    lerResumoDaEmpresa(ctx, companyId, new Date()),
  ]);

  return tela(
    <>
      {/* O mês por extenso no rótulo ("Desligamentos em setembro") quebra em
          duas linhas no cartão estreito, em vez de cortar com "…"; todo rótulo
          reserva as duas linhas, e os números ficam alinhados. */}
      <FaixaDeTotais itens={numerosDoResumo(resumo)} rotulosInteiros />

      {/* No casco das listas do Recrutamento (DRG-13, 07/10/2026): contagem na
          barra, Filtros à direita, e o aviso dos inativos com o "Mostrar
          todos" nas ações da barra. A busca subiu para a fileira da empresa:
          ela procura em todas, não só nesta. */}
      <CascoDaTabela
        contagem={contarItens(total, "colaborador", "colaboradores")}
        filtros={filtros}
        acoes={avisoDosInativos(inativos, href({ situacao: SITUACAO_TODOS }))}
      >
        {linhas.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={filtro.kind === "ativos" ? "Nenhum colaborador nesta empresa" : "Nenhum colaborador encontrado"}
            description={
              filtro.kind === "ativos"
                ? "São as pessoas que trabalham na empresa cliente, não a equipe do escritório."
                : "Tente outro filtro."
            }
          />
        ) : (
          <ColaboradoresTable
            linhas={linhas.map(paraALinha)}
            canCreate={canCreate}
            definirAtivoPessoasEmMassa={definirAtivoPessoasEmMassa}
          />
        )}
      </CascoDaTabela>

      <Pagination
        page={pagina}
        totalPages={Math.ceil(total / POR_PAGINA)}
        buildHref={(n) => href({ page: String(n) })}
        total={total}
        rotulo="colaboradores"
      />
    </>
  );
}
