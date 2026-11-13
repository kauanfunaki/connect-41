import Link from "next/link";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoData } from "@/components/ui/CampoData";
import { ModalDoDp2 } from "@/components/dp2/ModalDoDp2";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { canManageSector } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { brl } from "@/lib/dp2/tela";
import { salvarConvencaoAction } from "../actions";

const pct = (v: unknown) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const num = (v: unknown) => (v === null || v === undefined ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Convenções coletivas do DP 2 (11/11/2026): o que muda o cálculo e o piso para conferência. */
export default async function ConvencoesDoDp2({ searchParams }: { searchParams: Promise<{ convencao?: string; nova?: string }> }) {
  const params = await searchParams;
  const { ctx, setor } = await abrirTelaDoModulo("dp2_convencoes");
  const podeGerir = canManageSector(ctx, setor);
  const convencoes = await getPrisma().dp2Convencao.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ ativa: "desc" }, { nome: "asc" }],
    include: { _count: { select: { empresas: true } } },
  });
  const aberta = params.convencao ? convencoes.find((c) => c.id === params.convencao) : undefined;
  const nova = params.nova === "1" && !aberta;

  return (
    <PageContainer>
      <PageHeader
        title="Convenções coletivas"
        subtitle="Percentuais de hora extra e adicional noturno que o cálculo usa, e o piso para o alerta de salário abaixo dele."
        action={
          podeGerir ? (
            <Button href="/dp2/convencoes?nova=1" scroll={false}>
              <Plus size={14} aria-hidden="true" />
              Nova convenção
            </Button>
          ) : undefined
        }
      />
        {convencoes.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="Nenhuma convenção cadastrada" description="Sem convenção, a empresa é calculada pela CLT: hora extra 50% e 100%, adicional noturno 20%." />
        ) : (
          <Secao titulo={`${convencoes.length} convenção(ões)`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Nome</th>
                    <th className={TH}>Data-base</th>
                    <th className={TH_NUM}>Piso</th>
                    <th className={TH_NUM}>HE</th>
                    <th className={TH_NUM}>Noturno</th>
                    <th className={TH_NUM}>Empresas</th>
                    {podeGerir && (
                      <th className={TH}>
                        <span className="sr-only">Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {convencoes.map((c) => (
                    <tr key={c.id} className={`${TR} ${c.id === params.convencao ? "bg-surface-hover" : ""}`}>
                      <td className={TD}>
                        <Link href={`/dp2/convencoes?convencao=${c.id}`} scroll={false} className="text-brand hover:underline font-medium">
                          {c.nome}
                        </Link>
                        {c.sindicato && <div className="text-fs-2 text-fg-muted">{c.sindicato}</div>}
                        {!c.ativa && <Selo tom="neutro">inativa</Selo>}
                      </td>
                      <td className={TD}>{c.dataBase ? MESES[c.dataBase - 1] : "—"}</td>
                      <td className={TD_NUM}>{c.piso !== null ? brl(Number(c.piso)) : "—"}</td>
                      <td className={TD_NUM}>
                        {pct(c.he50)} / {pct(c.he100)}
                      </td>
                      <td className={TD_NUM}>{pct(c.noturno)}</td>
                      <td className={TD_NUM}>{c._count.empresas}</td>
                      {podeGerir && (
                        <td className={`${TD} text-right pr-0`}>
                          <Button href={`/dp2/convencoes?convencao=${c.id}`} scroll={false} variant="secondary" size="sm" aria-label={`Editar a convenção ${c.nome}`}>
                            <Pencil size={14} aria-hidden="true" />
                            Editar
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        )}

        {podeGerir && (aberta || nova) && (
          <ModalDoDp2
            key={aberta?.id ?? "nova"}
            titulo={nova ? "Nova convenção" : aberta!.nome}
            acao={salvarConvencaoAction}
            rotulo={nova ? "Criar convenção" : "Salvar convenção"}
            fecharHref="/dp2/convencoes"
          >
            <>
              {aberta && <input type="hidden" name="id" value={aberta.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoForm label="Nome" htmlFor="nome" required className="sm:col-span-2">
                  <Input id="nome" name="nome" maxLength={160} defaultValue={aberta?.nome ?? ""} placeholder="Comércio varejista de Curitiba 2026/2027" required />
                </CampoForm>
                <CampoForm label="Sindicato" htmlFor="sindicato">
                  <Input id="sindicato" name="sindicato" maxLength={160} defaultValue={aberta?.sindicato ?? ""} />
                </CampoForm>
                <CampoForm label="CNPJ do sindicato" htmlFor="cnpjSindicato" helper="Vai no vínculo do eSocial.">
                  <Input id="cnpjSindicato" name="cnpjSindicato" inputMode="numeric" maxLength={18} defaultValue={aberta?.cnpjSindicato ?? ""} />
                </CampoForm>
                <CampoForm label="Vigência de" htmlFor="vigenciaInicio">
                  <CampoData id="vigenciaInicio" name="vigenciaInicio" defaultValue={aberta?.vigenciaInicio ?? ""} />
                </CampoForm>
                <CampoForm label="até" htmlFor="vigenciaFim">
                  <CampoData id="vigenciaFim" name="vigenciaFim" defaultValue={aberta?.vigenciaFim ?? ""} />
                </CampoForm>
                <CampoForm label="Mês da data-base" htmlFor="dataBase" helper="1 a 12.">
                  <Input id="dataBase" name="dataBase" inputMode="numeric" defaultValue={aberta?.dataBase ? String(aberta.dataBase) : ""} />
                </CampoForm>
                <CampoForm label="Piso salarial" htmlFor="piso">
                  <Input id="piso" name="piso" inputMode="decimal" prefix="R$" defaultValue={num(aberta?.piso)} />
                </CampoForm>
                <CampoForm label="Hora extra em dia útil (%)" htmlFor="he50">
                  <Input id="he50" name="he50" inputMode="decimal" defaultValue={aberta ? num(aberta.he50) : "50"} />
                </CampoForm>
                <CampoForm label="Hora extra em domingo e feriado (%)" htmlFor="he100">
                  <Input id="he100" name="he100" inputMode="decimal" defaultValue={aberta ? num(aberta.he100) : "100"} />
                </CampoForm>
                <CampoForm label="Adicional noturno (%)" htmlFor="noturno">
                  <Input id="noturno" name="noturno" inputMode="decimal" defaultValue={aberta ? num(aberta.noturno) : "20"} />
                </CampoForm>
              </div>
              <CampoForm label="Observações" htmlFor="observacoes" className="mt-4">
                <Textarea id="observacoes" name="observacoes" rows={3} defaultValue={aberta?.observacoes ?? ""} />
              </CampoForm>
              {aberta && (
                <div className="mt-3">
                  <input type="hidden" name="temAtiva" value="1" />
                  <Checkbox id="ativa" name="ativa" label="Ativa" defaultChecked={aberta.ativa} />
                </div>
              )}
            </>
          </ModalDoDp2>
        )}
    </PageContainer>
  );
}
