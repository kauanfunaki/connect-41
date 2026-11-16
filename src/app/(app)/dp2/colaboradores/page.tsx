import Link from "next/link";
import { IdCard, Pencil, Plus } from "lucide-react";
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
import { ModalDoDp2 } from "@/components/dp2/ModalDoDp2";
import { ImportarDoEsocial } from "@/components/dp2/ImportarDoEsocial";
import { getPrisma } from "@/lib/prisma";
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
import { criarColaboradorDp2Action, salvarVinculoAction } from "../actions";

const NOME_DA_INSALUBRIDADE: Record<string, string> = { NENHUM: "", MINIMO: "Insalubridade 10%", MEDIO: "Insalubridade 20%", MAXIMO: "Insalubridade 40%" };

/**
 * O contrato de cada colaborador para o cálculo (11/11/2026): salário,
 * dependentes, adicionais. A pessoa em si (CPF, admissão, desligamento)
 * continua no cadastro de Colaboradores de clientes.
 */
export default async function ColaboradoresDoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string; pessoa?: string; novo?: string }> }) {
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

  const [pessoas, cadastroDaEmpresa] = await Promise.all([
    colaboradoresDaEmpresa(tela.tenantId, tela.empresa.id),
    getPrisma().company.findFirst({ where: { id: tela.empresa.id, tenantId: tela.tenantId }, select: { cnpj: true, kind: true } }),
  ]);
  // O CNPJ vai para o Assinador escolher o certificado e montar a consulta ao eSocial.
  const cnpjDaEmpresa = cadastroDaEmpresa?.kind === "PESSOA_FISICA" ? null : (cadastroDaEmpresa?.cnpj ?? null);
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
  const semContrato = pessoas.length - comContrato;

  // Os campos do contrato, iguais no Editar e no Novo colaborador.
  const camposDoContrato = (
    <>
      <BlocoDoContrato titulo="Salário e jornada">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <CampoForm label="Salário" htmlFor="salarioBase" required helper="No horista, o valor da hora. Sócio: o pró-labore; estagiário: a bolsa; RPA: o valor fixo do mês (ou 0 e lance o serviço no mês).">
            <Input
              id="salarioBase"
              name="salarioBase"
              inputMode="decimal"
              prefix="R$"
              required
              defaultValue={v ? reais(Number(v.salarioBase)) : aberta?.currentSalary ? reais(Number(aberta?.currentSalary)) : ""}
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
      </BlocoDoContrato>

      <BlocoDoContrato titulo="Dados para o eSocial">
        <p className="text-fs-2 text-fg-muted -mt-1 mb-3">O que a admissão (S-2200) pede e o cadastro da pessoa não tem.</p>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
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
            helper={!es.grauInstrucao && grauSugerido ? `Sugerido pela escolaridade do cadastro: ${aberta?.education}` : undefined}
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
      </BlocoDoContrato>

      <BlocoDoContrato titulo="Estágio">
        <p className="text-fs-2 text-fg-muted -mt-1 mb-3">Só para a categoria 901: o que o início do estagiário (S-2300) pede.</p>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
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
      </BlocoDoContrato>

      <BlocoDoContrato titulo="Conta para o pagamento">
        {/* Banco, agência e os dígitos têm tamanho fixo: completos, o
            cursor pula para o próximo campo (data-pular). A conta varia
            de banco para banco e não pula. */}
        <div className="grid gap-3 grid-cols-[88px_minmax(0,1fr)_64px] sm:grid-cols-[88px_minmax(0,1fr)_64px_minmax(0,1.5fr)_64px]">
          <CampoForm label="Banco" htmlFor="bancoCodigo">
            <Input id="bancoCodigo" name="bancoCodigo" inputMode="numeric" maxLength={3} placeholder="341" data-pular defaultValue={v?.bancoCodigo ?? (aberta?.bankName?.match(/\d{3}/)?.[0] ?? "")} />
          </CampoForm>
          <CampoForm label="Agência" htmlFor="agencia">
            <Input id="agencia" name="agencia" inputMode="numeric" maxLength={4} data-pular defaultValue={v?.agencia ?? (aberta?.bankAgency?.replace(/\D/g, "") ?? "")} />
          </CampoForm>
          <CampoForm label="Dígito" htmlFor="agenciaDigito">
            <Input id="agenciaDigito" name="agenciaDigito" maxLength={1} data-pular defaultValue={v?.agenciaDigito ?? ""} />
          </CampoForm>
          <CampoForm label="Conta" htmlFor="conta">
            <Input id="conta" name="conta" inputMode="numeric" maxLength={20} defaultValue={v?.conta ?? (aberta?.bankAccount?.replace(/\D/g, "") ?? "")} />
          </CampoForm>
          <CampoForm label="Dígito" htmlFor="contaDigito">
            <Input id="contaDigito" name="contaDigito" maxLength={1} data-pular defaultValue={v?.contaDigito ?? ""} />
          </CampoForm>
        </div>
        <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 sm:items-end mt-4">
          <CampoForm label="Tipo de conta" htmlFor="tipoConta">
            <Select id="tipoConta" name="tipoConta" defaultValue={v?.tipoConta ?? (/poup/i.test(aberta?.bankAccountType ?? "") ? "POUPANCA" : "CORRENTE")}>
              <option value="CORRENTE">Conta corrente</option>
              <option value="POUPANCA">Poupança</option>
            </Select>
          </CampoForm>
          <p className="text-fs-2 text-fg-muted sm:pb-2">O banco é o código de 3 dígitos (ex.: 341).</p>
        </div>
        {!v && aberta?.bankName && (
          <p className="text-fs-2 text-fg-muted mt-3">
            No cadastro da pessoa: {aberta?.bankName}
            {aberta?.bankAgency ? `, agência ${aberta?.bankAgency}` : ""}
            {aberta?.bankAccount ? `, conta ${aberta?.bankAccount}` : ""}. Confira o código do banco e os dígitos.
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
  );

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
        acao={
          tela.podeAgir ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button href="/dp2/colaboradores?novo=1" scroll={false} size="sm">
                <Plus size={14} aria-hidden="true" />
                Novo colaborador
              </Button>
              <ImportarDoEsocial companyId={tela.empresa.id} cnpj={cnpjDaEmpresa} empresa={tela.empresa.nome} />
            </div>
          ) : undefined
        }
      >
        {pessoas.length === 0 ? (
          <p className="text-fs-3 text-fg-muted">
            Nenhum colaborador nesta empresa. Traga do eSocial pelo botão “Importar do eSocial”, ou cadastre um a um em{" "}
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

      {params.novo === "1" && !aberta && tela.podeAgir && (
        <ModalDoDp2
          key="novo"
          titulo="Novo colaborador"
          apoio={`O cadastro da pessoa e o contrato do DP 2 de uma vez, em ${tela.empresa.nome}.`}
          acao={criarColaboradorDp2Action}
          rotulo="Cadastrar colaborador"
          fecharHref="/dp2/colaboradores"
        >
          <>
            <input type="hidden" name="companyId" value={tela.empresa.id} />
            <BlocoDoContrato titulo="Pessoa">
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <CampoForm label="Nome completo" htmlFor="novo_nome" required className="sm:col-span-2">
                  <Input id="novo_nome" name="novo_nome" maxLength={120} required autoComplete="off" />
                </CampoForm>
                <CampoForm label="CPF" htmlFor="novo_cpf" required>
                  <Input id="novo_cpf" name="novo_cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" required autoComplete="off" />
                </CampoForm>
                <CampoForm label="Nascimento" htmlFor="novo_nascimento">
                  <CampoData id="novo_nascimento" name="novo_nascimento" />
                </CampoForm>
                <CampoForm label="Admissão" htmlFor="novo_admissao" required>
                  <CampoData id="novo_admissao" name="novo_admissao" />
                </CampoForm>
                <CampoForm label="Cargo" htmlFor="novo_cargo" helper="O nome do cargo, como vai no eSocial.">
                  <Input id="novo_cargo" name="novo_cargo" maxLength={120} />
                </CampoForm>
                <CampoForm label="E-mail" htmlFor="novo_email">
                  <Input id="novo_email" name="novo_email" type="email" maxLength={160} />
                </CampoForm>
                <CampoForm label="Telefone" htmlFor="novo_telefone">
                  <Input id="novo_telefone" name="novo_telefone" inputMode="tel" maxLength={20} />
                </CampoForm>
              </div>
            </BlocoDoContrato>
            {camposDoContrato}
          </>
        </ModalDoDp2>
      )}
      {aberta && (
        <ModalDoDp2
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

              {camposDoContrato}
            </>
          ) : (
            <p className="text-fs-3 text-fg-muted pb-1">Você pode ver, mas não alterar contratos no DP 2.</p>
          )}
        </ModalDoDp2>
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
