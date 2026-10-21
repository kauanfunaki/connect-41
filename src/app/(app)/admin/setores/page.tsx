import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutGrid, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { StatusDot } from "@/components/shared/StatusDot";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { ToggleModuleButton } from "@/components/admin/ToggleModuleButton";
import { MoverModuloPara } from "@/components/admin/MoverModuloPara";
import { TelasDoMenuGeral, type TelaDaConfiguracao } from "@/components/admin/TelasDoMenuGeral";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { SetorForm } from "@/components/admin/SetorForm";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getAllSectors } from "@/lib/sectors";
import { getTenantModuleStates } from "@/lib/modules";
import { lerOcultasDoGeral } from "@/lib/menuGeralDb";
import { TELAS_DO_GERAL, podeConfigurarMenuGeral } from "@/lib/menuGeral";
import { atualizarSetor, criarSetor } from "./actions";
import { alternarModulo, transferirModulo } from "./modulos-actions";
import { alternarTelaDoGeral, restaurarMenuGeral } from "./menu-geral-actions";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Setores e módulos numa tela só (escolha 4A dos Ajustes de 15/10, 20/10/2026).
 * Eram duas: Setores, uma lista com nome, código e Editar; e Módulos, com
 * blocos por setor e um seletor cinza do setor em cada módulo. Agora a lista
 * de setores fica à esquerda, e o setor escolhido mostra à direita os módulos
 * que ele opera (com "Mover para…" e o interruptor), as telas do menu Geral e
 * as pessoas. Criar e editar o setor abrem no painel ao lado (2B).
 *
 * O setor escolhido mora no endereço (`?setor=<código>`); sem ele, o primeiro
 * ativo. Setor não se exclui (o código está ligado a quadros, usuários e
 * transferências): desativa-se na edição.
 */
export default async function SetoresPage({
  searchParams,
}: {
  searchParams: Promise<{ setor?: string; novo?: string; editar?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();
  const { setor: setorPedido, novo, editar } = await searchParams;

  const prisma = getPrisma();
  const [sectors, ocultasDoGeral, modulos, pessoasPorSetor] = await Promise.all([
    getAllSectors(ctx.tenantId),
    lerOcultasDoGeral(ctx.tenantId),
    getTenantModuleStates(ctx.tenantId),
    prisma.userSector.groupBy({
      by: ["sectorCode"],
      where: { user: { tenantId: ctx.tenantId, active: true } },
      _count: { _all: true },
    }),
  ]);
  const quantasPessoas = new Map(pessoasPorSetor.map((p) => [p.sectorCode, p._count._all]));
  const emEdicao = editar ? sectors.find((s) => s.id === editar) : undefined;
  const escolhido =
    sectors.find((s) => s.code === setorPedido) ?? emEdicao ?? sectors.find((s) => s.active) ?? sectors[0];
  const aqui = escolhido ? `/admin/setores?setor=${encodeURIComponent(escolhido.code)}` : "/admin/setores";

  const modulosDo = (code: string) => modulos.filter((m) => m.sectorCode === code);
  const ativos = sectors.filter((s) => s.active);
  const rotuloDo = (code: string) => sectors.find((s) => s.code === code)?.label ?? code;

  const pessoas = escolhido
    ? await prisma.user.findMany({
        where: { tenantId: ctx.tenantId, active: true, sectors: { some: { sectorCode: escolhido.code } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, photoUrl: true },
      })
    : [];

  // O menu Geral do setor (14/10/2026): o que está escondido e, nas telas que
  // dependem de módulo, se o módulo está ligado no escritório.
  const ligados = new Set(modulos.filter((m) => m.enabled).map((m) => m.code));
  const ocultas = new Set(escolhido ? (ocultasDoGeral.porSetor[escolhido.code] ?? []) : []);
  const telasDoGeral: TelaDaConfiguracao[] = TELAS_DO_GERAL.map((t) => ({
    chave: t.chave,
    rotulo: t.rotulo,
    descricao: t.descricao,
    visivel: !ocultas.has(t.chave),
    observacao:
      t.modulo && !ligados.has(t.modulo)
        ? "O módulo está desligado neste escritório (Configurações › Setores e módulos): a tela não aparece para ninguém."
        : t.soDentroDoSetor
          ? "Aparece quando o setor está escolhido no alto da tela."
          : null,
  }));

  const doEscolhido = escolhido ? modulosDo(escolhido.code) : [];
  const ligadosDoEscolhido = doEscolhido.filter((m) => m.enabled).length;

  return (
    <PageContainer>
      <PageHeader
        title="Setores e módulos"
        subtitle="Como o trabalho é dividido: cada setor, os módulos que ele opera, o menu Geral e quem é dele."
        action={
          <Button href={`${aqui}${escolhido ? "&" : "?"}novo=1`} scroll={false}>
            <Plus size={14} /> Novo setor
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-6 items-start">
        <Card as="section" aria-label="Setores" className="overflow-hidden lg:sticky lg:top-4">
          <nav className="divide-y divide-border">
            {sectors.map((s) => {
              const dele = modulosDo(s.code);
              const atual = s.id === escolhido?.id;
              return (
                <Link
                  key={s.id}
                  href={`/admin/setores?setor=${encodeURIComponent(s.code)}`}
                  scroll={false}
                  aria-current={atual ? "page" : undefined}
                  className={`relative flex items-start gap-2.5 px-4 py-3 transition-colors ${
                    atual ? "bg-brand-subtle" : "hover:bg-surface-hover"
                  }`}
                >
                  {atual && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brand" aria-hidden />}
                  <span className="mt-1.5 size-2.5 flex-shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-fs-3 font-medium ${s.active ? "text-fg" : "text-fg-muted"}`}>{s.label}</span>
                    <span className="block truncate text-fs-1 text-fg-muted">
                      {plural(dele.filter((m) => m.enabled).length, "módulo ligado", "módulos ligados")} ·{" "}
                      {plural(quantasPessoas.get(s.code) ?? 0, "pessoa", "pessoas")}
                    </span>
                  </span>
                  {/* Inativo pela bolinha, a do ativo/inativo de cadastro (escolha 2A, 08/10/2026). */}
                  {!s.active && <StatusDot color="var(--c41-fg-muted)" label="Inativo" className="mt-0.5 flex-shrink-0" />}
                </Link>
              );
            })}
          </nav>
        </Card>

        {escolhido && (
          <div className="min-w-0 space-y-4">
            <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
              <span className="size-3.5 flex-shrink-0 rounded-full" style={{ background: escolhido.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-section font-semibold text-fg leading-tight">{escolhido.label}</h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-fs-2 text-fg-muted">
                  <span className="font-mono">{escolhido.code}</span>
                  <StatusDot
                    color={escolhido.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                    label={escolhido.active ? "Ativo" : "Inativo"}
                  />
                </p>
              </div>
              <Button href={`${aqui}&editar=${escolhido.id}`} scroll={false} variant="secondary" size="sm">
                <Pencil size={13} /> Editar setor
              </Button>
            </Card>

            <Card as="section" aria-labelledby="modulos-do-setor" className="overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3">
                <h2 id="modulos-do-setor" className="text-card-title font-semibold text-fg">
                  Módulos
                </h2>
                <p className="text-fs-2 text-fg-muted">
                  {doEscolhido.length === 0 ? "nenhum" : `${ligadosDoEscolhido} de ${doEscolhido.length} ligados`}
                </p>
              </div>
              {doEscolhido.length === 0 ? (
                <div className="border-t border-border">
                  <EmptyState
                    icon={<LayoutGrid />}
                    title="Nenhum módulo neste setor"
                    description="Para trazer um módulo para cá, abra o setor que o opera hoje e use “Mover para…” na linha dele."
                  />
                </div>
              ) : (
                <div className="divide-y divide-border border-t border-border">
                  {doEscolhido.map((m) => (
                    <div key={m.code} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
                      <div className="min-w-0 flex-1 basis-64">
                        <p className={`text-fs-3 font-medium ${m.enabled ? "text-fg" : "text-fg-muted"}`}>{m.label}</p>
                        <p className="text-fs-1 text-fg-muted">{m.description}</p>
                        {m.sectorCode !== m.catalogSectorCode && (
                          <p className="text-fs-1 text-fg-muted mt-0.5">Veio de {rotuloDo(m.catalogSectorCode)}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!m.fixedSector && <MoverModuloPara
                          nome={m.label}
                          destinos={ativos
                            .filter((s) => s.code !== m.sectorCode)
                            .map((s) => ({ value: s.code, label: s.label, cor: s.color }))}
                          action={transferirModulo.bind(null, m.code)}
                        />}
                        <ToggleModuleButton action={alternarModulo.bind(null, m.code, !m.enabled)} enabled={m.enabled} nome={m.label} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              {/* Chave por setor: o interruptor de cada tela guarda o estado
                  dele, e trocar de setor tem de começar do zero. */}
              <TelasDoMenuGeral
                key={escolhido.code}
                setor={escolhido.label}
                telas={telasDoGeral}
                personalizado={ocultas.size > 0}
                disponivel={ocultasDoGeral.disponivel}
                podeEditar={podeConfigurarMenuGeral(ctx)}
                alternar={alternarTelaDoGeral.bind(null, escolhido.id)}
                restaurar={restaurarMenuGeral.bind(null, escolhido.id)}
              />
            </Card>

            <Card as="section" aria-labelledby="pessoas-do-setor" className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="pessoas-do-setor" className="text-card-title font-semibold text-fg">
                  Pessoas
                </h2>
                <Button href="/admin/usuarios" variant="link" className="text-ui">
                  <Users size={13} /> Abrir Usuários
                </Button>
              </div>
              {pessoas.length === 0 ? (
                <p className="mt-2 text-fs-2 text-fg-muted">
                  Ninguém da equipe está neste setor ainda. Os setores de cada pessoa se escolhem em Usuários.
                </p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {pessoas.map((p) => (
                    <li key={p.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-3">
                      <AvatarImage src={p.photoUrl} name={p.name} size={22} fontSize={10} />
                      <span className="text-fs-2 text-fg">{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>

      {novo === "1" && (
        <PainelDeCadastro titulo="Novo setor" voltarPara={aqui}>
          <SetorForm action={criarSetor} cancelHref={aqui} />
        </PainelDeCadastro>
      )}
      {emEdicao && (
        <PainelDeCadastro titulo="Editar setor" voltarPara={aqui}>
          <SetorForm
            key={emEdicao.id}
            action={atualizarSetor}
            cancelHref={aqui}
            defaultValues={{
              id: emEdicao.id,
              code: emEdicao.code,
              label: emEdicao.label,
              color: emEdicao.color,
              active: emEdicao.active,
              order: emEdicao.order,
            }}
          />
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
