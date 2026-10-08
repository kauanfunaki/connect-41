import { notFound } from "next/navigation";
import { FileStack, Loader, TriangleAlert, Hourglass, CheckCircle2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { SeloDoProcesso } from "@/components/portal/SeloDoProcesso";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { CartaoDeLista } from "@/components/portal/CartaoDeLista";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { processosDoPortal, type ProcessoNoPortal } from "@/lib/societario/portal-data";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// "Aguardando você" desde 05/10: o Início leva direto aos processos parados
// esperando o cliente.
const RECORTES = [
  { chave: "abertos", rotulo: "Em andamento" },
  { chave: "aguardando", rotulo: "Aguardando você" },
  { chave: "encerrados", rotulo: "Encerrados" },
] as const;

const encerrado = (p: ProcessoNoPortal) => ["CONCLUIDO", "CANCELADO", "INDEFERIDO"].includes(p.situacao);

/**
 * Os processos societários das empresas do cliente: abertura, alteração,
 * baixa, alvará. O que ele quer saber é "em que pé está", então a situação e a
 * previsão vêm na linha; o resto fica no detalhe.
 */
export default async function PortalProcessosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { sessao, escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("societario_processos")) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "abertos";
  const feriados = await feriadosDoTenant(sessao.tenantId);
  const todos = await processosDoPortal(sessao.tenantId, escopo.companyIds ?? [], new Date(), feriados);

  const abertos = todos.filter((p) => !encerrado(p));
  const linhas =
    recorte === "abertos"
      ? abertos
      : recorte === "aguardando"
        ? abertos.filter((p) => p.situacao === "AGUARDANDO_CLIENTE")
        : todos.filter(encerrado);
  const variasEmpresas = new Set(todos.map((p) => p.empresaNome)).size > 1;
  const emExigencia = abertos.filter((p) => p.situacao === "EM_EXIGENCIA").length;
  const aguardandoVoce = abertos.filter((p) => p.situacao === "AGUARDANDO_CLIENTE").length;

  return (
    <PageContainer>
      {/* Sem o "Só leitura" (07/10/2026): no detalhe o cliente manda documentos
          e escreve para a equipe. */}
      <PortalCabecalho
        titulo="Processos"
        descricao="Abertura, alterações, baixa e licenças das suas empresas."
        somenteLeitura={false}
      />

      {/* Números que levam ao recorte, e o recorte no "Filtros" — eram abas
          (regra da conferência de 30/09). */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Em andamento",
            valor: String(abertos.length),
            icone: <Loader />,
            detalhe: recorte === "abertos" ? "mostrando agora" : undefined,
            href: "/portal/processos",
          },
          // Sem atalho (07/10/2026): não há recorte de "com exigência", e o
          // cartão subia no hover para levar à mesma lista, sem filtro.
          {
            rotulo: "Com exigência do órgão",
            valor: String(emExigencia),
            tom: emExigencia > 0 ? "text-warning" : "",
            icone: <TriangleAlert />,
          },
          {
            rotulo: "Aguardando você",
            valor: String(aguardandoVoce),
            tom: aguardandoVoce > 0 ? "text-warning" : "",
            icone: <Hourglass />,
            detalhe: recorte === "aguardando" ? "mostrando agora" : undefined,
            href: "/portal/processos?recorte=aguardando",
          },
          {
            rotulo: "Encerrados",
            valor: String(todos.length - abertos.length),
            tom: "text-fg-muted",
            icone: <CheckCircle2 />,
            detalhe: recorte === "encerrados" ? "mostrando agora" : undefined,
            href: "/portal/processos?recorte=encerrados",
          },
        ]}
      />
      <FiltrosDaTela
        className="mb-4"
        campos={[
          {
            chave: "recorte",
            rotulo: "Situação",
            vazioLabel: "Em andamento",
            opcoes: [
              { value: "aguardando", label: "Aguardando você" },
              { value: "encerrados", label: "Encerrados" },
            ],
          },
        ]}
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileStack />}
            title={
              recorte === "abertos"
                ? "Nenhum processo em andamento"
                : recorte === "aguardando"
                  ? "Nenhum processo esperando você"
                  : "Nenhum processo encerrado"
            }
            description="Quando a equipe abrir um processo para a sua empresa, ele aparece aqui com cada etapa."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {linhas.map((p) => (
            <li key={p.id}>
              <CartaoDeLista
                href={`/portal/processos/${p.id}`}
                titulo={p.titulo || p.tipoNome}
                corpo={p.motivo || undefined}
                apoio={
                  <>
                    <span>
                      {p.titulo ? `${p.tipoNome} · ` : ""}
                      {variasEmpresas ? `${p.empresaNome} · ` : ""}
                      aberto em {formatInstantDate(p.iniciadoEm)}
                      {p.concluidoEm ? ` · concluído em ${formatInstantDate(p.concluidoEm)}` : ""}
                    </span>
                    <span>{p.previsao}</span>
                  </>
                }
                selos={
                  <>
                    {p.progresso.total > 0 && (
                      <span className="text-ui text-fg-muted tabular-nums">
                        {p.progresso.feitas} de {p.progresso.total} etapas
                      </span>
                    )}
                    <SeloDoProcesso situacao={p.situacao} />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
