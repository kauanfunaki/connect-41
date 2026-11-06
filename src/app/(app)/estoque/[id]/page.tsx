import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { FormularioDoItem, MovimentarItem } from "@/components/financeiroInterno/Estoque";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { podeExcluir } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { formatarReaisDeCentavos, formatCalendarDate, formatInstantDateTime } from "@/lib/format";
import { CATEGORIAS_SUGERIDAS, MODULO_ESTOQUE, MOVIMENTOS, SITUACOES, TIPOS_DE_ITEM, abaixoDoMinimo, type SituacaoDoItem, type TipoDeMovimento } from "@/lib/financeiroInterno/estoque";
import { excluirItemDoEstoque, movimentarItemDoEstoque, salvarItemDoEstoque } from "../actions";

export const dynamic = "force-dynamic";

const TOM: Record<SituacaoDoItem, TomDoSelo> = { DISPONIVEL: "sucesso", EM_USO: "marca", EMPRESTADO: "atencao", MANUTENCAO: "atencao", BAIXADO: "neutro" };

/** Um item do estoque: os dados, o que fazer com ele e o que já aconteceu (05/11/2026). */
export default async function ItemDoEstoquePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_ESTOQUE);
  const { id } = await params;
  const prisma = getPrisma();
  const [item, podeAgir, podeGerir, pessoas, categoriasUsadas] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id, tenantId: ctx.tenantId! }, include: { movements: { orderBy: { createdAt: "desc" }, take: 100 } } }),
    podeNoModulo(ctx, MODULO_ESTOQUE, "agir"),
    podeNoModulo(ctx, MODULO_ESTOQUE, "gerir"),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId!, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inventoryItem.findMany({ where: { tenantId: ctx.tenantId! }, select: { category: true }, distinct: ["category"] }),
  ]);
  if (!item) notFound();
  const categorias = [...new Set([...CATEGORIAS_SUGERIDAS, ...categoriasUsadas.map((c) => c.category)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const material = item.kind === "material";
  const dados: [string, string][] = [
    ["Tipo", TIPOS_DE_ITEM[item.kind as keyof typeof TIPOS_DE_ITEM] ?? item.kind],
    ["Categoria", item.category],
    ...(material
      ? ([["Quantidade", `${item.quantity} ${item.unit}`], ["Mínimo", item.minQuantity === null ? "—" : `${item.minQuantity} ${item.unit}`]] as [string, string][])
      : ([["Nº de patrimônio", item.assetTag ?? "—"], ["Nº de série", item.serialNumber ?? "—"], ["Com quem está", item.holderName ?? "—"]] as [string, string][])),
    ["Onde fica", item.location ?? "—"],
    ["Comprado em", item.purchaseDate ? formatCalendarDate(item.purchaseDate) : "—"],
    ["Valor de compra", item.purchaseValueCents === null ? "—" : formatarReaisDeCentavos(item.purchaseValueCents)],
    ["Fornecedor", item.supplier ?? "—"],
    ["Última conferência", item.lastCheckedAt ? formatInstantDateTime(item.lastCheckedAt) : "nunca"],
  ];

  return (
    <PageContainer>
      <PageHeader
        title={<span className="break-words [overflow-wrap:anywhere]">{item.name}</span>}
        subtitle={`${item.category}${item.assetTag ? ` · nº ${item.assetTag}` : ""}`}
        action={
          <Button variant="secondary" href="/estoque">
            <ArrowLeft size={14} aria-hidden /> Voltar ao estoque
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
        <Card as="section" aria-labelledby="dados-do-item" className="p-5 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="dados-do-item" className="text-card-title font-semibold text-fg mr-auto">
              Dados
            </h2>
            <Selo tom={TOM[item.status as SituacaoDoItem] ?? "neutro"}>{SITUACOES[item.status as SituacaoDoItem] ?? item.status}</Selo>
            {abaixoDoMinimo(item) && <Selo tom="atencao">Repor</Selo>}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-ui">
            {dados.map(([rotulo, valor]) => (
              <div key={rotulo} className="contents">
                <dt className="text-fg-muted">{rotulo}</dt>
                <dd className="text-fg break-words">{valor}</dd>
              </div>
            ))}
          </dl>
          {item.notes && <p className="whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-ui text-fg-secondary">{item.notes}</p>}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {podeAgir && (
              <MovimentarItem
                item={{ name: item.name, kind: item.kind, status: item.status, quantity: item.quantity, unit: item.unit, location: item.location }}
                pessoas={pessoas}
                action={movimentarItemDoEstoque.bind(null, item.id)}
              />
            )}
            {podeGerir && (
              <FormularioDoItem
                categorias={categorias}
                action={salvarItemDoEstoque.bind(null, item.id)}
                item={{
                  kind: item.kind, name: item.name, category: item.category, assetTag: item.assetTag, serialNumber: item.serialNumber,
                  location: item.location, unit: item.unit, minQuantity: item.minQuantity,
                  purchaseDate: item.purchaseDate ? item.purchaseDate.toISOString().slice(0, 10) : null,
                  purchaseValue: item.purchaseValueCents === null ? null : (item.purchaseValueCents / 100).toFixed(2).replace(".", ","),
                  supplier: item.supplier, notes: item.notes,
                }}
              />
            )}
            {podeGerir && podeExcluir(ctx) && (
              <ConfirmActionButton
                action={excluirItemDoEstoque.bind(null, item.id)}
                label="Excluir"
                title={`Excluir “${item.name}”?`}
                description="O item e o histórico dele saem do estoque. Para tirar de uso sem perder o histórico, use “Dar baixa” em Movimentar."
                confirmLabel="Excluir"
                destructive
                variant="ghost"
                size="sm"
              />
            )}
          </div>
        </Card>

        <Card as="section" aria-labelledby="historico-do-item" className="p-5 min-w-0">
          <h2 id="historico-do-item" className="text-card-title font-semibold text-fg mb-4">
            Histórico
          </h2>
          {item.movements.length === 0 ? (
            <p className="text-ui text-fg-muted">Nada registrado ainda.</p>
          ) : (
            <ol className="flex flex-col" aria-label="Histórico do item">
              {item.movements.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-soft py-2.5 last:border-b-0">
                  <span className="font-medium text-fg">{MOVIMENTOS[m.type as TipoDeMovimento] ?? m.type}</span>
                  {material && m.quantity > 0 && <span className="tabular-nums text-fg-secondary">{m.quantity} {item.unit}</span>}
                  {m.holderName && <span className="text-fg-secondary">com {m.holderName}</span>}
                  {m.location && <span className="text-fg-muted">· {m.location}</span>}
                  <span className="ml-auto text-helper text-fg-muted">
                    {m.createdByName} · <time dateTime={m.createdAt.toISOString()}>{formatInstantDateTime(m.createdAt)}</time>
                  </span>
                  {m.note && <p className="basis-full text-ui text-fg-secondary whitespace-pre-wrap">{m.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
