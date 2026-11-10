import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { formatInstantDate } from "@/lib/format";
import { BpoCredentialsList, NewCredentialModal, type CredentialRow } from "@/components/bpoSenhas/BpoCredentialsList";
import { SeletorDoSetorDoApoio } from "@/components/apoio/SeletorDoSetorDoApoio";
import { criarCredencial, atualizarCredencial, excluirCredencial, revelarCredencial } from "./actions";
import { isModuleEnabled } from "@/lib/modules";
import { setorDaTelaDoApoio } from "@/lib/apoio/servidor";
import { pessoasQuePodemSerMarcadas } from "@/lib/apoio/senhasServidor";
import {
  daLinhaDoBanco,
  ondeDasCompletas,
  ondeDasSoExistencia,
  opcoesAoCriar,
  opcoesAoEditar,
  podeEditarCredencial,
  podeExcluirCredencial,
  podeRestringirCredencial,
  podeRevelarCredencial,
  visaoNaLista,
} from "@/lib/apoio/regrasDasSenhas";

const MODULE = "bpo_senhas";

// O Repositório de senhas é Apoio de todo setor desde 05/11/2026 (cofre por
// setor, decisão do Kauan): cada setor vê só as suas credenciais. O setor é o
// da pessoa (o que ela está usando, ou o escolhido em "Todos os setores") —
// ver `setorDaTelaDoApoio`. O módulo ligado/desligado continua valendo para o
// escritório inteiro.
//
// Senha pessoal e "todos do setor, menos…" (10/11/2026, pedido do Kauan): a
// lista vem em duas consultas, pelas regras de `regrasDasSenhas.ts` — as que a
// pessoa vê inteiras, e (só para o administrador) as pessoais dos outros, das
// quais o banco devolve só título, dono e data. A senha cifrada não é lida em
// nenhuma das duas.
export default async function SenhasPage({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const [{ setor: pedido }, ligado] = await Promise.all([searchParams, isModuleEnabled(ctx.tenantId, MODULE)]);
  if (!ligado) notFound();
  const apoio = await setorDaTelaDoApoio(ctx, pedido);
  if (!apoio) notFound();
  const setor = apoio.setor;
  const canManage = canManageSector(ctx, setor);
  const opcoesDeCriar = opcoesAoCriar(ctx, setor);
  const ondeSoExistencia = ondeDasSoExistencia(ctx, setor);

  const prisma = getPrisma();
  const [completas, deOutros, companies, elegiveis] = await Promise.all([
    prisma.bpoCredential.findMany({
      where: ondeDasCompletas(ctx, setor),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        companyId: true,
        username: true,
        url: true,
        notes: true,
        sectorCode: true,
        visibility: true,
        createdById: true,
        createdAt: true,
        company: { select: { name: true } },
        createdBy: { select: { name: true } },
        restrictions: { select: { userId: true, user: { select: { name: true } } } },
      },
    }),
    ondeSoExistencia
      ? prisma.bpoCredential.findMany({
          where: ondeSoExistencia,
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, createdById: true, createdAt: true, createdBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true, cnpj: true, parentCompanyId: true },
    }),
    // Quem pode ser marcado em "menos…": só carrega para quem coordena.
    canManage ? pessoasQuePodemSerMarcadas(ctx.tenantId, setor) : Promise.resolve([]),
  ]);

  // Quem marca não se marca. As marcas que já não valem (a pessoa saiu do
  // setor, ficou inativa, virou administrador) não aparecem no selo — a regra
  // também já não as conta.
  const pessoas = elegiveis.filter((p) => p.id !== ctx.userId);
  const idsElegiveis = new Set(elegiveis.map((p) => p.id));

  const linhas: { quando: Date; linha: CredentialRow }[] = [];
  for (const c of completas) {
    const regra = daLinhaDoBanco(c);
    // A consulta já filtrou; a regra confere de novo linha a linha.
    if (visaoNaLista(ctx, regra) !== "completa") continue;
    linhas.push({
      quando: c.createdAt,
      linha: {
        id: c.id,
        title: c.title,
        companyId: c.companyId,
        companyName: c.company?.name ?? null,
        username: c.username,
        url: c.url,
        notes: c.notes,
        createdById: c.createdById,
        createdByName: c.createdBy.name,
        createdAtLabel: formatInstantDate(c.createdAt),
        visibilidade: c.visibility,
        soExistencia: false,
        // Os nomes de quem não vê só chegam para quem coordena.
        restritos: podeRestringirCredencial(ctx, regra)
          ? c.restrictions.filter((r) => idsElegiveis.has(r.userId)).map((r) => ({ id: r.userId, name: r.user.name }))
          : [],
        pode: {
          revelar: podeRevelarCredencial(ctx, regra),
          editar: podeEditarCredencial(ctx, regra),
          excluir: podeExcluirCredencial(ctx, regra),
        },
        opcoesDeQuemVe: opcoesAoEditar(ctx, regra),
      },
    });
  }
  for (const c of deOutros) {
    const regra = daLinhaDoBanco({ sectorCode: setor, visibility: "PESSOAL", createdById: c.createdById });
    if (visaoNaLista(ctx, regra) !== "existencia") continue;
    linhas.push({
      quando: c.createdAt,
      linha: {
        id: c.id,
        title: c.title,
        companyId: null,
        companyName: null,
        username: null,
        url: null,
        notes: null,
        createdById: c.createdById,
        createdByName: c.createdBy.name,
        createdAtLabel: formatInstantDate(c.createdAt),
        visibilidade: "PESSOAL",
        soExistencia: true,
        restritos: [],
        pode: { revelar: false, editar: false, excluir: podeExcluirCredencial(ctx, regra) },
        opcoesDeQuemVe: [],
      },
    });
  }
  linhas.sort((a, b) => b.quando.getTime() - a.quando.getTime());

  return (
    <PageContainer>
      {/* Sem "Voltar" (08/10/2026): é página principal, aberta pelo menu. */}
      <PageHeader
        title="Repositório de senhas"
        subtitle={`As credenciais de ${apoio.rotulo}: portais, bancos e sistemas, com cada acesso registrado.`}
        action={
          // Para todo mundo que usa o Repositório do setor (10/11/2026): quem não
          // coordena cadastra só a pessoal.
          opcoesDeCriar.length > 0 ? (
            <NewCredentialModal
              companies={companies}
              createAction={criarCredencial.bind(null, setor)}
              opcoes={opcoesDeCriar}
              pessoas={pessoas}
              setorRotulo={apoio.rotulo}
            />
          ) : undefined
        }
      />
      <SeletorDoSetorDoApoio apoio={apoio} caminho="/senhas" />

      <BpoCredentialsList
        credentials={linhas.map((l) => l.linha)}
        companies={companies}
        canManage={canManage}
        // O vazio cita quem coordena o setor da tela (05/10/2026).
        setorRotulo={apoio.rotulo}
        pessoas={pessoas}
        updateAction={atualizarCredencial}
        // Quem exclui cada linha vem de `pode.excluir`: o administrador
        // (13/10/2026), e o dono da pessoal (10/11/2026).
        deleteAction={excluirCredencial}
        revealAction={revelarCredencial}
      />
    </PageContainer>
  );
}
