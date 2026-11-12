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
import { CampoData } from "@/components/ui/CampoData";
import {
  ESTADOS_CIVIS,
  GRAUS_DE_INSTRUCAO,
  NATUREZAS_DE_ESTAGIO,
  NIVEIS_DE_ESTAGIO,
  RACAS,
  SEXOS,
  TIPOS_DE_CONTRATO,
  TIPOS_DE_JORNADA,
  lerDadosEsocial,
  sugerirGrauDeInstrucao,
} from "@/lib/dp2/esocial/cadastro";
import { CATEGORIAS } from "@/lib/dp2/categorias";
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
  const es = lerDadosEsocial(v?.dadosEsocial);
  const grauSugerido = es.grauInstrucao ?? sugerirGrauDeInstrucao(aberta?.education);
  const opcoes = (lista: [string, string][]) => [
    <option key="" value="">
      Não informado
    </option>,
    ...lista.map(([k, r]) => (
      <option key={k} value={k}>
        {k} · {r}
      </option>
    )),
  ];
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
                  <CampoForm label="Salário" htmlFor="salarioBase" required helper="No horista, o valor da hora. Sócio: o pró-labore; estagiário: a bolsa; RPA: o valor fixo do mês (ou 0 e lance o serviço no mês).">
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
                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <CampoForm
                    label="Matrícula no eSocial"
                    htmlFor="matricula"
                    helper="A mesma do evento de início (S-2200 ou S-2300). Sócio e autônomo sem S-2300: deixe vazia."
                  >
                    <Input id="matricula" name="matricula" maxLength={30} defaultValue={v?.matricula ?? ""} />
                  </CampoForm>
                  <CampoForm label="Categoria" htmlFor="categoria" helper="Tabela 1 do eSocial. Sócio, autônomo e estagiário não têm FGTS, férias, 13º nem rescisão.">
                    <Select id="categoria" name="categoria" defaultValue={v?.categoria ?? "101"}>
                      {CATEGORIAS.map(([k, r]) => (
                        <option key={k} value={k}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                </div>
                <h3 className="text-fs-3 font-semibold text-fg mt-5 mb-1">Dados para o eSocial</h3>
                <p className="text-fs-2 text-fg-muted mb-3">O que a admissão (S-2200) pede e o cadastro da pessoa não tem.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoForm label="Sexo" htmlFor="esocial_sexo">
                    <Select id="esocial_sexo" name="esocial_sexo" defaultValue={es.sexo ?? ""}>
                      {opcoes(SEXOS)}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Raça/cor" htmlFor="esocial_racaCor">
                    <Select id="esocial_racaCor" name="esocial_racaCor" defaultValue={es.racaCor ?? ""}>
                      {opcoes(RACAS)}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Estado civil" htmlFor="esocial_estadoCivil">
                    <Select id="esocial_estadoCivil" name="esocial_estadoCivil" defaultValue={es.estadoCivil ?? ""}>
                      {opcoes(ESTADOS_CIVIS)}
                    </Select>
                  </CampoForm>
                  <CampoForm
                    label="Grau de instrução"
                    htmlFor="esocial_grauInstrucao"
                    helper={!es.grauInstrucao && grauSugerido ? `Sugerido pela escolaridade do cadastro: ${aberta.education}` : undefined}
                  >
                    <Select id="esocial_grauInstrucao" name="esocial_grauInstrucao" defaultValue={grauSugerido ?? ""}>
                      {opcoes(GRAUS_DE_INSTRUCAO)}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Município (código IBGE)" htmlFor="esocial_codigoMunicipio" helper="7 dígitos (ex.: 4106902 Curitiba).">
                    <Input id="esocial_codigoMunicipio" name="esocial_codigoMunicipio" inputMode="numeric" maxLength={7} defaultValue={es.codigoMunicipio ?? ""} />
                  </CampoForm>
                  <CampoForm label="CBO do cargo" htmlFor="esocial_cbo" helper="6 dígitos.">
                    <Input id="esocial_cbo" name="esocial_cbo" inputMode="numeric" maxLength={7} defaultValue={es.cbo ?? ""} />
                  </CampoForm>
                  <CampoForm label="Tipo de contrato" htmlFor="esocial_tipoContrato">
                    <Select id="esocial_tipoContrato" name="esocial_tipoContrato" defaultValue={es.tipoContrato ?? "1"}>
                      {TIPOS_DE_CONTRATO.map(([k, r]) => (
                        <option key={k} value={k}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Término (prazo determinado)" htmlFor="esocial_dataTermino">
                    <CampoData id="esocial_dataTermino" name="esocial_dataTermino" defaultValue={es.dataTermino ?? ""} />
                  </CampoForm>
                  <CampoForm label="Tipo de jornada" htmlFor="esocial_tipoJornada">
                    <Select id="esocial_tipoJornada" name="esocial_tipoJornada" defaultValue={es.tipoJornada ?? ""}>
                      {opcoes(TIPOS_DE_JORNADA)}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Jornada por extenso" htmlFor="esocial_descricaoJornada">
                    <Input id="esocial_descricaoJornada" name="esocial_descricaoJornada" maxLength={999} placeholder="Segunda a sexta, 08:00 às 17:48" defaultValue={es.descricaoJornada ?? ""} />
                  </CampoForm>
                </div>

                <h3 className="text-fs-3 font-semibold text-fg mt-5 mb-1">Estágio</h3>
                <p className="text-fs-2 text-fg-muted mb-3">Só para a categoria 901: o que o início do estagiário (S-2300) pede.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoForm label="Natureza" htmlFor="esocial_estagioNatureza">
                    <Select id="esocial_estagioNatureza" name="esocial_estagioNatureza" defaultValue={es.estagioNatureza ?? ""}>
                      {opcoes(NATUREZAS_DE_ESTAGIO)}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Nível" htmlFor="esocial_estagioNivel">
                    <Select id="esocial_estagioNivel" name="esocial_estagioNivel" defaultValue={es.estagioNivel ?? ""}>
                      {opcoes(NIVEIS_DE_ESTAGIO)}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Área de atuação" htmlFor="esocial_estagioArea">
                    <Input id="esocial_estagioArea" name="esocial_estagioArea" maxLength={100} defaultValue={es.estagioArea ?? ""} />
                  </CampoForm>
                  <CampoForm label="Previsão de término" htmlFor="esocial_estagioPrevisaoTermino">
                    <CampoData id="esocial_estagioPrevisaoTermino" name="esocial_estagioPrevisaoTermino" defaultValue={es.estagioPrevisaoTermino ?? ""} />
                  </CampoForm>
                  <CampoForm label="CNPJ da instituição de ensino" htmlFor="esocial_estagioCnpjInstituicao">
                    <Input id="esocial_estagioCnpjInstituicao" name="esocial_estagioCnpjInstituicao" inputMode="numeric" maxLength={18} defaultValue={es.estagioCnpjInstituicao ?? ""} />
                  </CampoForm>
                  <CampoForm label="CNPJ do agente de integração" htmlFor="esocial_estagioCnpjAgente" helper="CIEE, IEL…, quando houver.">
                    <Input id="esocial_estagioCnpjAgente" name="esocial_estagioCnpjAgente" inputMode="numeric" maxLength={18} defaultValue={es.estagioCnpjAgente ?? ""} />
                  </CampoForm>
                  <CampoForm label="CPF do supervisor" htmlFor="esocial_estagioCpfSupervisor">
                    <Input id="esocial_estagioCpfSupervisor" name="esocial_estagioCpfSupervisor" inputMode="numeric" maxLength={14} defaultValue={es.estagioCpfSupervisor ?? ""} />
                  </CampoForm>
                  <CampoForm label="Apólice do seguro" htmlFor="esocial_estagioApolice">
                    <Input id="esocial_estagioApolice" name="esocial_estagioApolice" maxLength={30} defaultValue={es.estagioApolice ?? ""} />
                  </CampoForm>
                </div>

                <h3 className="text-fs-3 font-semibold text-fg mt-5 mb-2">Conta para o pagamento</h3>
                <div className="grid gap-4 grid-cols-[90px_1fr_70px] sm:grid-cols-[90px_1fr_70px_1.3fr_70px]">
                  <CampoForm label="Banco" htmlFor="bancoCodigo" helper="Código, ex.: 341">
                    <Input id="bancoCodigo" name="bancoCodigo" inputMode="numeric" maxLength={3} defaultValue={v?.bancoCodigo ?? (aberta.bankName?.match(/\d{3}/)?.[0] ?? "")} />
                  </CampoForm>
                  <CampoForm label="Agência" htmlFor="agencia">
                    <Input id="agencia" name="agencia" inputMode="numeric" maxLength={10} defaultValue={v?.agencia ?? (aberta.bankAgency?.replace(/\D/g, "") ?? "")} />
                  </CampoForm>
                  <CampoForm label="Dígito" htmlFor="agenciaDigito">
                    <Input id="agenciaDigito" name="agenciaDigito" maxLength={2} defaultValue={v?.agenciaDigito ?? ""} />
                  </CampoForm>
                  <CampoForm label="Conta" htmlFor="conta">
                    <Input id="conta" name="conta" inputMode="numeric" maxLength={20} defaultValue={v?.conta ?? (aberta.bankAccount?.replace(/\D/g, "") ?? "")} />
                  </CampoForm>
                  <CampoForm label="Dígito" htmlFor="contaDigito">
                    <Input id="contaDigito" name="contaDigito" maxLength={2} defaultValue={v?.contaDigito ?? ""} />
                  </CampoForm>
                </div>
                <CampoForm label="Tipo de conta" htmlFor="tipoConta" className="mt-4 max-w-xs">
                  <Select id="tipoConta" name="tipoConta" defaultValue={v?.tipoConta ?? (/poup/i.test(aberta.bankAccountType ?? "") ? "POUPANCA" : "CORRENTE")}>
                    <option value="CORRENTE">Conta corrente</option>
                    <option value="POUPANCA">Poupança</option>
                  </Select>
                </CampoForm>
                {!v && aberta.bankName && (
                  <p className="text-fs-2 text-fg-muted mt-2">
                    No cadastro da pessoa: {aberta.bankName}
                    {aberta.bankAgency ? `, agência ${aberta.bankAgency}` : ""}
                    {aberta.bankAccount ? `, conta ${aberta.bankAccount}` : ""}. Confira o código do banco e os dígitos.
                  </p>
                )}
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
