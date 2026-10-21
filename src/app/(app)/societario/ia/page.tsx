import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { Colunas } from "@/components/shared/Graficos";
import { Aviso } from "@/components/ui/Aviso";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { formatInstantDate, formatarNumero, formatarReaisDeCentavos } from "@/lib/format";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { estadoDosAgentes } from "@/lib/ia/data";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import { propostasDoSetor, qualidadeDoSetor } from "@/lib/ia/propostas";
import { AGENTE_CONTRATO, AGENTE_VARREDURA } from "@/lib/societario/iaDoSetor";
import { RodarVarredura } from "@/components/societario/ia/RodarVarredura";
import { rodarVarreduraAction } from "./actions";

// A IA do Societário (29/09): as funções do protótipo do Marcos — varredura de
// pendências, leitura de contrato social, fila de aprovação e painel de
// qualidade — numa tela só, da coordenação do setor. Desde 13/10/2026 a IA do
// Connect se apresenta como a Ceci (`src/lib/ia/ceci.ts`), e a tela leva o
// nome dela com o setor, como no chat.

const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

// A situação da proposta é Selo (escolha 2A, 08/10/2026); a rejeitada saiu de
// cena — não pede ação —, então é neutra, como a indeferida do processo.
const STATUS = {
  PENDENTE: { rotulo: "Esperando revisão", variante: "info" },
  APROVADA: { rotulo: "Aprovada", variante: "success" },
  EDITADA: { rotulo: "Aprovada com ajuste", variante: "warning" },
  REJEITADA: { rotulo: "Rejeitada", variante: "neutral" },
} as const;

const CONFIANCA = { ALTA: "alta", MEDIA: "média", BAIXA: "baixa" } as const;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const MES = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

export default async function IaDoSocietarioPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const setores = (await setoresDoModulo(ctx.tenantId, MODULE)) ?? [SECTOR];
  const setor = setores[0];
  if (!canManageSector(ctx, setores)) notFound();

  const [{ pendentes, revisadas }, qualidade, estados] = await Promise.all([
    propostasDoSetor(ctx.tenantId, setor),
    qualidadeDoSetor(ctx.tenantId, setor),
    estadoDosAgentes(ctx.tenantId, [AGENTE_VARREDURA, AGENTE_CONTRATO]),
  ]);
  const ligado = (code: string) => {
    const e = estados.get(code);
    return !!e && e.ligado && e.temChave;
  };
  const varreduraLigada = ligado(AGENTE_VARREDURA);
  const nome = (code: string) => agenteDoCatalogo(code)?.label ?? code;

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Voltar" (P04, 15/10/2026): a tela sai de Processos
          (o botão "Ceci · Societário" do cabeçalho de lá). */}
      <Breadcrumb items={[{ label: "Processos", href: "/processos" }, { label: "Ceci · Societário" }]} />
      <PageHeader
        title="Ceci · Societário"
        subtitle="A Ceci propõe; a coordenação aprova, corrige ou rejeita. Nada é gravado sem aprovação."
        action={<RodarVarredura rodar={rodarVarreduraAction} desligada={!varreduraLigada} />}
      />

      {(!varreduraLigada || !ligado(AGENTE_CONTRATO)) && (
        // Revisão de 05/10: botão não é link — o caminho era texto azul no meio da frase.
        // No `Aviso` de atenção (15/10/2026), como o da chave de IA: era uma caixa
        // cinza montada à mão.
        <Aviso tom="atencao" className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="text-fg">
            {[!varreduraLigada && nome(AGENTE_VARREDURA), !ligado(AGENTE_CONTRATO) && nome(AGENTE_CONTRATO)].filter(Boolean).join(" e ")}{" "}
            {!varreduraLigada && !ligado(AGENTE_CONTRATO) ? "estão desligadas" : "está desligada"}. Um administrador liga em
            Configurações › Inteligência artificial. A leitura de contrato social fica na tela de sócios de cada empresa.
          </p>
          <Button href="/admin/ia" variant="secondary" size="xs">
            Abrir Inteligência artificial
          </Button>
        </Aviso>
      )}

      <section aria-labelledby="fila" className="mb-6 flex flex-col gap-2">
        <h2 id="fila" className="text-section font-semibold text-fg">
          Esperando revisão ({pendentes.length})
        </h2>
        {pendentes.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhuma proposta esperando"
              description="Rode a varredura para ver as pendências do setor, ou leia um contrato social na tela de sócios de uma empresa."
            />
          </Card>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {pendentes.map((p) => (
              <li key={p.id}>
                <Link href={`/societario/ia/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="text-fs-4 font-medium text-fg">{p.title}</p>
                    <p className="text-fs-2 text-fg-muted">
                      {nome(p.agentCode)} · pedido por {p.createdBy?.name ?? "—"} em {formatInstantDate(p.createdAt)}
                      {p.confidence && ` · confiança ${CONFIANCA[p.confidence]}`}
                    </p>
                  </div>
                  <span className="text-fs-3 text-brand">Revisar →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="qualidade" className="mb-6 flex flex-col gap-2">
        <div>
          <h2 id="qualidade" className="text-section font-semibold text-fg">
            Qualidade da IA, últimos 6 meses
          </h2>
          <p className="text-fs-2 text-fg-muted">
            Quanto do que a IA propõe é aprovado como veio, quanto precisa de ajuste e quanto é descartado — e quanto custou.
          </p>
        </div>
        {qualidade.length === 0 ? (
          <p className="text-fs-3 text-fg-muted">Ainda não há proposta para medir.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {qualidade.map((q) => {
              return (
                <Card key={q.agentCode} className="p-4 flex flex-col gap-3">
                  <p className="text-fs-4 font-semibold text-fg">{nome(q.agentCode)}</p>
                  {/* Os três números no cartão de número (15/10/2026): eram
                      números de 18px montados à mão. Sem o azul cheio: são
                      vários agentes na tela, e nenhum é o total dela. */}
                  <FaixaDeTotais
                    className=""
                    destaque={false}
                    itens={[
                      { rotulo: "Propostas", valor: formatarNumero(q.total, 0) },
                      { rotulo: "Com ajuste", valor: pct(q.taxaDeEdicao) },
                      { rotulo: "Rejeitadas", valor: pct(q.taxaDeRejeicao) },
                    ]}
                  />
                  <p className="text-fs-2 text-fg-secondary tabular-nums">
                    {q.aprovadas} aprovadas como vieram · {q.editadas} com ajuste · {q.rejeitadas} rejeitadas · {q.pendentes} esperando
                  </p>
                  <p className="text-fs-2 text-fg-secondary tabular-nums">
                    Confiança que a IA declarou: {q.confianca.ALTA} alta · {q.confianca.MEDIA} média · {q.confianca.BAIXA} baixa
                  </p>
                  {/* As colunas da família `Graficos` (15/10/2026): eram barras
                      desenhadas à mão, com o número só no `title`. */}
                  <Colunas
                    titulo="Propostas por mês"
                    vazio="Nenhuma proposta nos últimos 6 meses."
                    colunas={q.porMes.map((m) => ({
                      chave: m.mes,
                      rotulo: MES.format(new Date(`${m.mes}-15T12:00:00Z`)),
                      valor: m.total,
                    }))}
                  />
                  <p className="text-fs-2 text-fg-muted">Custo no período: {formatarReaisDeCentavos(q.custoCentavos)}</p>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {revisadas.length > 0 && (
        <section aria-labelledby="revisadas" className="flex flex-col gap-2">
          <h2 id="revisadas" className="text-section font-semibold text-fg">
            Revisadas recentemente
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {revisadas.map((p) => (
              <li key={p.id}>
                <Link href={`/societario/ia/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="text-fs-3 text-fg">{p.title}</p>
                    <p className="text-fs-2 text-fg-muted">
                      {p.reviewedBy?.name ?? "—"} · {p.reviewedAt ? formatInstantDate(p.reviewedAt) : ""}
                    </p>
                  </div>
                  <Selo tom={tomDaVariante(STATUS[p.status].variante)}>{STATUS[p.status].rotulo}</Selo>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
