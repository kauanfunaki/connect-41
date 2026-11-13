import Link from "next/link";
import { IdCard, Pencil } from "lucide-react";
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
import { ModalDoContrato } from "@/components/dp2/ModalDoContrato";
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
  const semContrato = pessoas.length - comContrato;

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      <Secao
        titulo={`${pessoas.length} colaborador(es) de ${tela.empresa.nome}`}
        apoio={
          pessoas.length === 0
            ? undefined
            : semContrato === 0
              ? `Todos com contrato.`
              : `${comContrato} com contrato, ${semContrato} sem contrato (fora do cálculo).`
        }
      >
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
            <table className="w-full min-w-[720px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Nome</th>
                  <th className={TH}>Admissão</th>
                  <th className={`${TH_NUM} pr-10`}>Salário</th>
                  <th className={TH}>Contrato</th>
                  <th className={TH}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => (
                  <tr key={p.id} className={`${TR} ${p.id === params.pessoa ? "bg-surface-hover" : ""}`}>
                    <td className={`${TD} align-middle`}>
                      <Link href={`/dp2/colaboradores?pessoa=${p.id}`} scroll={false} className="text-brand hover:underline font-medium">
                        {p.name}
                      </Link>
                      {!p.active && <span className="text-fg-muted"> · inativo</span>}
                      {p.dismissalDate && <span className="text-fg-muted"> · desligado em {formatCalendarDate(p.dismissalDate)}</span>}
                    </td>
                    <td className={`${TD} align-middle tabular-nums`}>{p.admissionDate ? formatCalendarDate(p.admissionDate) : "—"}</td>
                    <td className={`${TD_NUM} align-middle pr-10`}>
                      {p.dp2Vinculo ? `${brl(Number(p.dp2Vinculo.salarioBase))}${p.dp2Vinculo.tipoSalario === "HORISTA" ? "/h" : ""}` : "—"}
                    </td>
                    <td className={`${TD} align-middle`}>
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
                    <td className={`${TD} align-middle text-right pr-0`}>
                      <Button href={`/dp2/colaboradores?pessoa=${p.id}`} scroll={false} variant="secondary" size="sm" aria-label={`Editar o contrato de ${p.name}`}>
                        <Pencil size={14} aria-hidden="true" />
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {aberta && (
        <ModalDoContrato
          key={aberta.id}
          titulo={aberta.name}
          apoio={
            <>
              {aberta.cpf ? `CPF ${formatCpf(aberta.cpf)} · ` : ""}
              {aberta.admissionDate ? `admitido em ${formatCalendarDate(aberta.admissionDate)}` : "sem data de admissão no cadastro"}
              {" · "}
              {v ? <Selo tom="sucesso">Com contrato</Selo> : <Selo tom="atencao">Sem contrato</Selo>}
            </>
          }
          acao={tela.podeAgir ? salvarVinculoAction : undefined}
          rotulo={v ? "Salvar contrato" : "Criar contrato"}
          fecharHref="/dp2/colaboradores"
        >
          {tela.podeAgir ? (
            <>
              <input type="hidden" name="personId" value={aberta.id} />

              <BlocoDoContrato titulo="Salário e jornada">
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
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
                </div>
              </BlocoDoContrato>

              <BlocoDoContrato titulo="Dependentes e eSocial">
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <CampoForm label="Dependentes para o IRRF" htmlFor="dependentesIrrf">
                    <Input id="dependentesIrrf" name="dependentesIrrf" inputMode="numeric" defaultValue={String(v?.dependentesIrrf ?? 0)} />
                  </CampoForm>
                  <CampoForm label="Filhos para o salário-família" htmlFor="filhosSalarioFamilia" helper="Até 14 anos, ou inválidos.">
                    <Input id="filhosSalarioFamilia" name="filhosSalarioFamilia" inputMode="numeric" defaultValue={String(v?.filhosSalarioFamilia ?? 0)} />
                  </CampoForm>
                  <CampoForm label="Matrícula no eSocial" htmlFor="matricula" helper="A mesma do evento de admissão (S-2200).">
                    <Input id="matricula" name="matricula" maxLength={30} defaultValue={v?.matricula ?? ""} />
                  </CampoForm>
                  <CampoForm label="Categoria" htmlFor="categoria" helper="Tabela 1 do eSocial.">
                    <Select id="categoria" name="categoria" defaultValue={v?.categoria ?? "101"}>
                      <option value="101">101 · Empregado geral</option>
                      <option value="102">102 · Empregado rural</option>
                      <option value="103">103 · Aprendiz</option>
                      <option value="105">105 · Contrato por prazo determinado</option>
                      <option value="106">106 · Contrato temporário</option>
                      <option value="111">111 · Contrato intermitente</option>
                    </Select>
                  </CampoForm>
                </div>
              </BlocoDoContrato>

              <BlocoDoContrato titulo="Conta para o pagamento">
                {/* Banco, agência e os dígitos têm tamanho fixo: completos, o
                    cursor pula para o próximo campo (data-pular). A conta varia
                    de banco para banco e não pula. */}
                <div className="grid gap-3 grid-cols-[88px_minmax(0,1fr)_64px] sm:grid-cols-[88px_minmax(0,1fr)_64px_minmax(0,1.5fr)_64px]">
                  <CampoForm label="Banco" htmlFor="bancoCodigo">
                    <Input id="bancoCodigo" name="bancoCodigo" inputMode="numeric" maxLength={3} placeholder="341" data-pular defaultValue={v?.bancoCodigo ?? (aberta.bankName?.match(/\d{3}/)?.[0] ?? "")} />
                  </CampoForm>
                  <CampoForm label="Agência" htmlFor="agencia">
                    <Input id="agencia" name="agencia" inputMode="numeric" maxLength={4} data-pular defaultValue={v?.agencia ?? (aberta.bankAgency?.replace(/\D/g, "") ?? "")} />
                  </CampoForm>
                  <CampoForm label="Dígito" htmlFor="agenciaDigito">
                    <Input id="agenciaDigito" name="agenciaDigito" maxLength={1} data-pular defaultValue={v?.agenciaDigito ?? ""} />
                  </CampoForm>
                  <CampoForm label="Conta" htmlFor="conta">
                    <Input id="conta" name="conta" inputMode="numeric" maxLength={20} defaultValue={v?.conta ?? (aberta.bankAccount?.replace(/\D/g, "") ?? "")} />
                  </CampoForm>
                  <CampoForm label="Dígito" htmlFor="contaDigito">
                    <Input id="contaDigito" name="contaDigito" maxLength={1} data-pular defaultValue={v?.contaDigito ?? ""} />
                  </CampoForm>
                </div>
                <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 sm:items-end mt-4">
                  <CampoForm label="Tipo de conta" htmlFor="tipoConta">
                    <Select id="tipoConta" name="tipoConta" defaultValue={v?.tipoConta ?? (/poup/i.test(aberta.bankAccountType ?? "") ? "POUPANCA" : "CORRENTE")}>
                      <option value="CORRENTE">Conta corrente</option>
                      <option value="POUPANCA">Poupança</option>
                    </Select>
                  </CampoForm>
                  <p className="text-fs-2 text-fg-muted sm:pb-2">O banco é o código de 3 dígitos (ex.: 341).</p>
                </div>
                {!v && aberta.bankName && (
                  <p className="text-fs-2 text-fg-muted mt-3">
                    No cadastro da pessoa: {aberta.bankName}
                    {aberta.bankAgency ? `, agência ${aberta.bankAgency}` : ""}
                    {aberta.bankAccount ? `, conta ${aberta.bankAccount}` : ""}. Confira o código do banco e os dígitos.
                  </p>
                )}
              </BlocoDoContrato>

              <BlocoDoContrato titulo="Adicionais">
                <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
                  <Checkbox id="periculosidade" name="periculosidade" label="Periculosidade (30% do salário)" defaultChecked={v?.periculosidade ?? false} />
                  <Checkbox id="valeTransporte" name="valeTransporte" label="Vale-transporte (desconta 6% do salário)" defaultChecked={v?.valeTransporte ?? false} />
                  <Checkbox id="aprendiz" name="aprendiz" label="Aprendiz (FGTS de 2%)" defaultChecked={v?.aprendiz ?? false} />
                </div>
                <CampoForm label="Observações" htmlFor="observacoes" className="mt-4">
                  <Textarea id="observacoes" name="observacoes" rows={2} defaultValue={v?.observacoes ?? ""} />
                </CampoForm>
              </BlocoDoContrato>
            </>
          ) : (
            <p className="text-fs-3 text-fg-muted pb-1">Você pode ver, mas não alterar contratos no DP 2.</p>
          )}
        </ModalDoContrato>
      )}
    </PageContainer>
  );
}

/** Uma seção do modal do contrato: o título pequeno em caixa alta e os campos. */
function BlocoDoContrato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-5 first-of-type:border-t-0 first-of-type:pt-2">
      <h3 className="text-fs-2 font-semibold uppercase tracking-wide text-fg-muted mb-3">{titulo}</h3>
      {children}
    </section>
  );
}
