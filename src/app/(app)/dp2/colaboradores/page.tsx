import Link from "next/link";
import { IdCard } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { formatCalendarDate, formatCpf } from "@/lib/format";
import { colaboradoresDaEmpresa } from "@/lib/dp2/servidor";
import { abrirTelaDeEmpresaDoDp2, brl } from "@/lib/dp2/tela";
import { reais } from "@/lib/dp2/formato";
import { salvarVinculoAction } from "../actions";

const NOME_DA_INSALUBRIDADE: Record<string, string> = { NENHUM: "", MINIMO: "Insalubridade 10%", MEDIO: "Insalubridade 20%", MAXIMO: "Insalubridade 40%" };

/**
 * O contrato de cada colaborador para o cálculo (11/11/2026): salário,
 * dependentes, adicionais. A pessoa em si (CPF, admissão, desligamento)
 * continua no cadastro de Colaboradores de clientes.
 */
export default async function ColaboradoresDoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string; pessoa?: string }> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_colaboradores", params.empresa);
  const cabecalho = (
    <PageHeader
      title="Colaboradores"
      subtitle="O contrato de cada colaborador para o cálculo da folha. Quem não tem contrato aqui fica fora do cálculo."
    />
  );
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} porQue="O DP 2 trabalha uma empresa por vez." /> : <EmptyState icon={<IdCard />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }

  const pessoas = await colaboradoresDaEmpresa(tela.tenantId, tela.empresa.id);
  const aberta = params.pessoa ? pessoas.find((p) => p.id === params.pessoa) : undefined;
  const v = aberta?.dp2Vinculo;
  const comContrato = pessoas.filter((p) => p.dp2Vinculo).length;

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Secao titulo={`${pessoas.length} colaborador(es) de ${tela.empresa.nome}`} apoio={`${comContrato} com contrato no DP 2.`}>
          {pessoas.length === 0 ? (
            <p className="text-fs-3 text-fg-muted">
              Nenhum colaborador nesta empresa. Cadastre em{" "}
              <Link href="/colaboradores-clientes" className="text-brand hover:underline">
                Colaboradores de clientes
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Nome</th>
                    <th className={TH}>Admissão</th>
                    <th className={TH_NUM}>Salário</th>
                    <th className={TH}>Contrato no DP 2</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map((p) => (
                    <tr key={p.id} className={`${TR} ${p.id === params.pessoa ? "bg-surface-hover" : ""}`}>
                      <td className={TD}>
                        <Link href={`/dp2/colaboradores?pessoa=${p.id}`} scroll={false} className="text-brand hover:underline font-medium">
                          {p.name}
                        </Link>
                        {!p.active && <span className="text-fg-muted"> · inativo</span>}
                        {p.dismissalDate && <span className="text-fg-muted"> · desligado em {formatCalendarDate(p.dismissalDate)}</span>}
                      </td>
                      <td className={TD}>{p.admissionDate ? formatCalendarDate(p.admissionDate) : "—"}</td>
                      <td className={TD_NUM}>
                        {p.dp2Vinculo ? `${brl(Number(p.dp2Vinculo.salarioBase))}${p.dp2Vinculo.tipoSalario === "HORISTA" ? "/h" : ""}` : "—"}
                      </td>
                      <td className={TD}>
                        {p.dp2Vinculo ? (
                          <span className="flex flex-wrap gap-1">
                            <Selo tom="sucesso">Com contrato</Selo>
                            {p.dp2Vinculo.dependentesIrrf > 0 && <Selo tom="neutro">{p.dp2Vinculo.dependentesIrrf} dep.</Selo>}
                            {NOME_DA_INSALUBRIDADE[p.dp2Vinculo.insalubridade] && <Selo tom="neutro">{NOME_DA_INSALUBRIDADE[p.dp2Vinculo.insalubridade]}</Selo>}
                            {p.dp2Vinculo.periculosidade && <Selo tom="neutro">Periculosidade</Selo>}
                          </span>
                        ) : (
                          <Selo tom="atencao">Sem contrato</Selo>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>

        {aberta ? (
          <Secao
            titulo={aberta.name}
            apoio={`${aberta.cpf ? `CPF ${formatCpf(aberta.cpf)} · ` : ""}${aberta.admissionDate ? `admitido em ${formatCalendarDate(aberta.admissionDate)}` : "sem data de admissão no cadastro"}`}
            acao={
              <Button href="/dp2/colaboradores" variant="ghost" size="sm" scroll={false}>
                Fechar
              </Button>
            }
          >
            {tela.podeAgir ? (
              <FormularioDoDp2 key={aberta.id} acao={salvarVinculoAction} rotulo={v ? "Salvar contrato" : "Criar contrato"}>
                <input type="hidden" name="personId" value={aberta.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoForm label="Salário" htmlFor="salarioBase" required helper="No horista, o valor da hora.">
                    <Input
                      id="salarioBase"
                      name="salarioBase"
                      inputMode="decimal"
                      prefix="R$"
                      required
                      defaultValue={v ? reais(Number(v.salarioBase)) : aberta.currentSalary ? reais(Number(aberta.currentSalary)) : ""}
                    />
                  </CampoForm>
                  <CampoForm label="Tipo" htmlFor="tipoSalario">
                    <Select id="tipoSalario" name="tipoSalario" defaultValue={v?.tipoSalario ?? "MENSAL"}>
                      <option value="MENSAL">Mensalista</option>
                      <option value="HORISTA">Horista</option>
                    </Select>
                  </CampoForm>
                  <CampoForm label="Horas por mês" htmlFor="horasMensais" helper="220 na jornada de 44 h semanais.">
                    <Input id="horasMensais" name="horasMensais" inputMode="numeric" defaultValue={String(v?.horasMensais ?? 220)} />
                  </CampoForm>
                  <CampoForm label="Insalubridade" htmlFor="insalubridade">
                    <Select id="insalubridade" name="insalubridade" defaultValue={v?.insalubridade ?? "NENHUM"}>
                      <option value="NENHUM">Não tem</option>
                      <option value="MINIMO">Grau mínimo (10%)</option>
                      <option value="MEDIO">Grau médio (20%)</option>
                      <option value="MAXIMO">Grau máximo (40%)</option>
                    </Select>
                  </CampoForm>
                  <CampoForm label="Dependentes para o IRRF" htmlFor="dependentesIrrf">
                    <Input id="dependentesIrrf" name="dependentesIrrf" inputMode="numeric" defaultValue={String(v?.dependentesIrrf ?? 0)} />
                  </CampoForm>
                  <CampoForm label="Filhos para o salário-família" htmlFor="filhosSalarioFamilia" helper="Até 14 anos, ou inválidos.">
                    <Input id="filhosSalarioFamilia" name="filhosSalarioFamilia" inputMode="numeric" defaultValue={String(v?.filhosSalarioFamilia ?? 0)} />
                  </CampoForm>
                </div>
                <div className="flex flex-col gap-2 mt-4">
                  <Checkbox id="periculosidade" name="periculosidade" label="Periculosidade (30% do salário)" defaultChecked={v?.periculosidade ?? false} />
                  <Checkbox id="valeTransporte" name="valeTransporte" label="Vale-transporte (desconta 6% do salário)" defaultChecked={v?.valeTransporte ?? false} />
                  <Checkbox id="aprendiz" name="aprendiz" label="Aprendiz (FGTS de 2%)" defaultChecked={v?.aprendiz ?? false} />
                </div>
                <CampoForm label="Observações" htmlFor="observacoes" className="mt-4">
                  <Textarea id="observacoes" name="observacoes" rows={2} defaultValue={v?.observacoes ?? ""} />
                </CampoForm>
              </FormularioDoDp2>
            ) : (
              <p className="text-fs-3 text-fg-muted">Você pode ver, mas não alterar contratos no DP 2.</p>
            )}
          </Secao>
        ) : (
          <Secao titulo="Contrato" apoio="Escolha um colaborador na lista para ver ou criar o contrato dele no DP 2.">
            <p className="text-fs-2 text-fg-muted">O salário vem preenchido com o do cadastro da pessoa, quando houver.</p>
          </Secao>
        )}
      </div>
    </PageContainer>
  );
}
