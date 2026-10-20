import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { PageContainer } from "@/components/shared/PageContainer";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { CampoForm } from "@/components/admin/CampoForm";
import { ConstrutorDeCampos, EscolhaDoSetorDosCampos, type CampoDoConstrutor } from "@/components/admin/ConstrutorDeCampos";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, podeExcluir, canManageSector } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";
import { dadosDoConstrutor } from "@/lib/camposCustomizados/dados";
import type { EntityType } from "@/generated/prisma/enums";
import { atualizarCampo, criarCampo, excluirCampo, reordenarCampos } from "./actions";

/**
 * Campos customizados como construtor, com prévia (escolha 5A dos Ajustes de
 * 15/10, 20/10/2026). Escolhe-se a ficha (empresa ou pessoa) e o setor; à
 * esquerda ficam os campos na ordem da ficha, para arrastar, com quantas
 * fichas já os preenchem; à direita, a prévia na ficha de uma empresa ou
 * pessoa de verdade do setor — a que mais preencheu. Criar e editar abrem no
 * painel ao lado (2B). Era uma lista por setor com nome, tipo e a chave
 * técnica, e a ordem, um número digitado.
 *
 * O campo vale para as fichas ligadas ao setor: empresa pelos serviços
 * contratados, pessoa pelos quadros em que aparece (`getApplicableCustomFields`)
 * — é delas o "de N" do preenchimento.
 */
export default async function CamposPage({
  searchParams,
}: {
  searchParams: Promise<{ ficha?: string; setor?: string; novo?: string; editar?: string }>;
}) {
  const ctx = await getAuthContext();
  const canManageAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canManageAny) notFound();
  const params = await searchParams;

  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const { options: ativos, labels } = await getSectorMaps(tenantId);
  const contagens = await prisma.customField.groupBy({
    by: ["sectorCode", "entityType"],
    where: isFullWrite(ctx.role) ? { tenantId } : { tenantId, sectorCode: { in: ctx.sectors } },
    _count: { _all: true },
  });
  // Os setores ativos de quem configura, e os inativos que ainda têm campos —
  // sem eles, campo de setor desativado sumiria da tela.
  const setores = [
    ...ativos.filter((s) => isFullWrite(ctx.role) || ctx.sectors.includes(s.value)),
    ...[...new Set(contagens.map((c) => c.sectorCode))]
      .filter((code) => !ativos.some((s) => s.value === code))
      .map((code) => ({ value: code, label: `${labels[code] ?? code} (inativo)` })),
  ];

  const pedidoParaEditar = params.editar ? await prisma.customField.findFirst({ where: { id: params.editar, tenantId } }) : null;
  const emEdicao = pedidoParaEditar && canManageSector(ctx, pedidoParaEditar.sectorCode) ? pedidoParaEditar : null;

  const ficha: EntityType = params.ficha === "PERSON" || params.ficha === "COMPANY" ? params.ficha : (emEdicao?.entityType ?? "COMPANY");
  const setor =
    setores.find((s) => s.value === params.setor)?.value ??
    setores.find((s) => s.value === emEdicao?.sectorCode)?.value ??
    setores.find((s) => contagens.some((c) => c.sectorCode === s.value && c.entityType === ficha))?.value ??
    setores[0]?.value;
  const base = `/admin/campos?ficha=${ficha}&setor=${encodeURIComponent(setor ?? "")}`;
  const nomeDaFicha = ficha === "COMPANY" ? "empresa" : "pessoa";

  const campos = setor
    ? await prisma.customField.findMany({
        where: { tenantId, sectorCode: setor, entityType: ficha },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const ids = campos.map((c) => c.id);

  const { preenchidos, ligadas, exemplo } = setor
    ? await dadosDoConstrutor(tenantId, setor, ficha, ids)
    : { preenchidos: {} as Record<string, number>, ligadas: 0, exemplo: null };
  const doConstrutor: CampoDoConstrutor[] = campos.map((c) => ({
    id: c.id,
    label: c.label,
    fieldType: c.fieldType,
    options: Array.isArray(c.options) ? (c.options as string[]) : [],
    required: c.required,
    preenchidos: preenchidos[c.id] ?? 0,
    excluir: podeExcluir(ctx) ? excluirCampo.bind(null, c.id) : undefined,
  }));
  const quantosNa = (code: string, tipo: EntityType) =>
    contagens.find((c) => c.sectorCode === code && c.entityType === tipo)?._count._all ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Campos customizados"
        subtitle="Campos a mais nas fichas de empresa e de pessoa, por setor, na ordem em que aparecem."
        action={
          setor ? (
            <Button href={`${base}&novo=1`} scroll={false}>
              <Plus size={14} /> Novo campo
            </Button>
          ) : undefined
        }
      />

      {setor && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <EscolhaDoSetorDosCampos
              atual={setor}
              opcoes={setores.map((s) => {
                const n = quantosNa(s.value, ficha);
                return { value: s.value, label: n > 0 ? `${s.label} · ${n} ${n === 1 ? "campo" : "campos"}` : s.label };
              })}
              hrefDoSetor={`/admin/campos?ficha=${ficha}&setor=`}
            />
          </div>
          <AbasDeLink
            ativa={ficha}
            abas={[
              { chave: "COMPANY", rotulo: "Ficha da empresa", href: `/admin/campos?ficha=COMPANY&setor=${encodeURIComponent(setor)}`, contagem: quantosNa(setor, "COMPANY") },
              { chave: "PERSON", rotulo: "Ficha da pessoa", href: `/admin/campos?ficha=PERSON&setor=${encodeURIComponent(setor)}`, contagem: quantosNa(setor, "PERSON") },
            ]}
          />
          <ConstrutorDeCampos
            key={`${setor}:${ficha}:${[...ids].sort().join()}`}
            campos={doConstrutor}
            total={ligadas}
            ficha={nomeDaFicha}
            exemplo={exemplo}
            editarHref={`${base}&editar=`}
            reordenar={reordenarCampos.bind(null, setor, ficha)}
          />
        </>
      )}

      {params.novo === "1" && setor && (
        <PainelDeCadastro titulo="Novo campo" voltarPara={base}>
          <CampoForm
            action={criarCampo}
            cancelHref={base}
            sectorOptions={setores}
            defaultValues={{ sectorCode: setor, entityType: ficha }}
          />
        </PainelDeCadastro>
      )}
      {emEdicao && (
        <PainelDeCadastro titulo="Editar campo" voltarPara={base}>
          <CampoForm
            key={emEdicao.id}
            action={atualizarCampo}
            cancelHref={base}
            sectorOptions={[]}
            defaultValues={{
              id: emEdicao.id,
              sectorCode: emEdicao.sectorCode,
              entityType: emEdicao.entityType,
              label: emEdicao.label,
              fieldType: emEdicao.fieldType,
              options: Array.isArray(emEdicao.options) ? (emEdicao.options as string[]) : [],
              required: emEdicao.required,
            }}
          />
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
