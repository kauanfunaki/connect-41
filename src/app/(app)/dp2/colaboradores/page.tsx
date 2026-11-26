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
import { colaboradoresDaEmpresa, listarRubricas } from "@/lib/dp2/servidor";
import { RubricasFixasDoContrato } from "@/components/dp2/RubricasFixasDoContrato";
import { regraDeLancamento } from "@/lib/dp2/rubricas";
import { relatorioDeTransparencia, salarioMensalDoContrato, LIMITE_DA_LEI } from "@/lib/dp2/transparenciaSalarial";
import { horasDoHorario } from "@/lib/dp2/horarios";
import { abrirTelaDeEmpresaDoDp2, brl, mesAtual } from "@/lib/dp2/tela";
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
import { CATEGORIAS, regimeDaCategoria } from "@/lib/dp2/categorias";
import { apagarSaldoInicialAction, conferirSaldoInicialAction, criarColaboradorDp2Action, excluirOcorrenciaAction, importarSaldoInicialAction, reajusteColetivoAction, registrarOcorrenciaAction, salvarVinculoAction } from "../actions";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { resumirSaldoInicial } from "@/lib/dp2/saldoInicial";

const NOME_DA_INSALUBRIDADE: Record<string, string> = { NENHUM: "", MINIMO: "Insalubridade 10%", MEDIO: "Insalubridade 20%", MAXIMO: "Insalubridade 40%" };

/**
 * O contrato de cada colaborador para o cálculo (11/11/2026): salário,
 * dependentes, adicionais. A pessoa em si (CPF, admissão, desligamento)
 * continua no cadastro de Colaboradores de clientes.
 */
export default async function ColaboradoresDoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string; pessoa?: string; novo?: string }> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_colaboradores", params.empresa);
  const cabecalho = <PageHeader title="Colaboradores" />;
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} porQue="O DP 2 trabalha uma empresa por vez." /> : <EmptyState icon={<IdCard />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }

  const [pessoas, cadastroDaEmpresa, linhasDeRubrica, horarios, centrosDeCusto] = await Promise.all([
    colaboradoresDaEmpresa(tela.tenantId, tela.empresa.id),
    getPrisma().company.findFirst({ where: { id: tela.empresa.id, tenantId: tela.tenantId }, select: { cnpj: true, kind: true } }),
    listarRubricas(tela.tenantId),
    // Horários de trabalho da empresa (funcionalidade-752).
    getPrisma().dp2Horario.findMany({ where: { tenantId: tela.tenantId, companyId: tela.empresa.id }, orderBy: { nome: "asc" } }),
    // Centros de custo do BPO da empresa (funcionalidade-751).
    getPrisma().costCenter.findMany({ where: { tenantId: tela.tenantId, companyId: tela.empresa.id, active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ]);
  // As rubricas que podem ser fixas no contrato: as mesmas que o DP lança no mês (funcionalidade-767).
  const paraFixar = linhasDeRubrica
    .filter((r) => r.ativa && regraDeLancamento(r).lancavel)
    .map((r) => ({
      id: r.id,
      rotulo: `${r.codigo} · ${r.nome}`,
      unidade: regraDeLancamento(r).porQuantidade ? (r.lancamento === "DIAS" ? ("dias" as const) : ("horas" as const)) : null,
    }));
  // O CNPJ vai para o Assinador escolher o certificado e montar a consulta ao eSocial.
  const cnpjDaEmpresa = cadastroDaEmpresa?.kind === "PESSOA_FISICA" ? null : (cadastroDaEmpresa?.cnpj ?? null);
  const aberta = params.pessoa ? pessoas.find((p) => p.id === params.pessoa) : undefined;
  const v = aberta?.dp2Vinculo;
  const fixasDaPessoa = aberta
    ? await getPrisma().dp2RubricaFixa.findMany({ where: { tenantId: tela.tenantId, personId: aberta.id }, orderBy: { createdAt: "asc" } })
    : [];
  const decimalTexto = (d: unknown, casas?: number) => (d === null || d === undefined ? "" : (casas === undefined ? String(d) : Number(d).toFixed(casas)).replace(".", ","));
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
  // Transparência salarial (Lei 14.611/2023, funcionalidade-775): os empregados (CLT) ativos com contrato.
  const ativosComContrato = pessoas.filter((p) => p.dp2Vinculo && !p.dismissalDate && p.active && regimeDaCategoria(p.dp2Vinculo.categoria) === "CLT");
  const cargoDe = new Map(
    (
      await getPrisma().person.findMany({ where: { tenantId: tela.tenantId, id: { in: ativosComContrato.map((p) => p.id) } }, select: { id: true, cargo: { select: { name: true } } } })
    ).map((p) => [p.id, p.cargo?.name ?? null])
  );
  const nomeDaRaca = new Map(RACAS);
  const transparencia = relatorioDeTransparencia(
    ativosComContrato.map((p) => {
      const d = lerDadosEsocial(p.dp2Vinculo!.dadosEsocial);
      return {
        cargo: cargoDe.get(p.id) ?? null,
        sexo: d.sexo,
        racaCor: d.racaCor,
        salarioMensal: salarioMensalDoContrato({ salarioBase: Number(p.dp2Vinculo!.salarioBase), tipoSalario: p.dp2Vinculo!.tipoSalario, horasMensais: p.dp2Vinculo!.horasMensais }),
      };
    }),
    (c) => nomeDaRaca.get(c) ?? c
  );
  const pctTransp = (v: number | null) => (v === null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)}%`);
  // Advertências e suspensões da empresa (funcionalidade-763).
  const empresaId = tela.empresa.id;
  const ocorrencias = await getPrisma().dp2Ocorrencia.findMany({ where: { tenantId: tela.tenantId, companyId: empresaId }, orderBy: { data: "desc" }, take: 100 });
  const nomeDaPessoa = new Map(pessoas.map((p) => [p.id, p.name]));
  // Saldo inicial das médias (funcionalidade-747): o histórico de antes do DP 2.
  const saldoInicial = resumirSaldoInicial(
    (
      await getPrisma().dp2SaldoInicialMedia.findMany({
        where: { tenantId: tela.tenantId, companyId: tela.empresa.id },
        select: { personId: true, competencia: true, valor: true, conferidoEm: true },
      })
    ).map((l) => ({ personId: l.personId, competencia: l.competencia, valor: Number(l.valor), conferido: l.conferidoEm !== null }))
  );
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.name]));
  const mesDe = (c: string) => c.split("-").reverse().join("/");
  const saldoPendente = saldoInicial.reduce((s, r) => s + r.pendentes, 0);
  // Histórico salarial da empresa (funcionalidade-760): as últimas mudanças.
  const historicoSalarial = await getPrisma().dp2HistoricoSalarial.findMany({ where: { tenantId: tela.tenantId, companyId: tela.empresa.id }, orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: 30 });
  const nomeNoHistorico = new Map(pessoas.map((p) => [p.id, p.name]));
  const empresaDoReajuste = tela.empresa.id;
  const comContrato = pessoas.filter((p) => p.dp2Vinculo).length;
  const semContrato = pessoas.length - comContrato;

  // Os campos do contrato, iguais no Editar e no Novo colaborador.
  const camposDoContrato = (
    <>
      <BlocoDoContrato titulo="Salário e jornada">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <CampoForm label="Salário" htmlFor="salarioBase" required dica="No horista, o valor da hora. Sócio: o pró-labore; estagiário: a bolsa; RPA: o valor fixo do mês (ou 0 e lance o serviço no mês).">
            <Input
              id="salarioBase"
              name="salarioBase"
              inputMode="decimal"
              prefix="R$"
              required
              defaultValue={v ? reais(Number(v.salarioBase)) : aberta?.currentSalary ? reais(Number(aberta?.currentSalary)) : ""}
            />
          </CampoForm>
          <CampoForm label="Salário vale desde" htmlFor="salarioDesde" dica="Só quando o salário muda: a data e o motivo vão para o histórico salarial.">
            <CampoData id="salarioDesde" name="salarioDesde" />
          </CampoForm>
          <CampoForm label="Motivo da mudança" htmlFor="motivoSalario">
            <Input id="motivoSalario" name="motivoSalario" maxLength={120} placeholder="Promoção, mérito, acordo…" />
          </CampoForm>
          <CampoForm label="Tipo" htmlFor="tipoSalario">
            <Select id="tipoSalario" name="tipoSalario" defaultValue={v?.tipoSalario ?? "MENSAL"}>
              <option value="MENSAL">Mensalista</option>
              <option value="HORISTA">Horista</option>
              <option value="HORA_AULA">Professor (hora-aula)</option>
            </Select>
          </CampoForm>
          <CampoForm label="Horário de trabalho" htmlFor="horarioId" dica="Os horários da Configuração da empresa. Com um horário, as horas por mês e a jornada do eSocial saem dele.">
            <Select id="horarioId" name="horarioId" defaultValue={v?.horarioId ?? ""}>
              <option value="">Sem horário (informar as horas)</option>
              {horarios.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome} · {horasDoHorario(h).mensais} h/mês
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Aulas por semana (professor)" htmlFor="aulasSemanais" dica="Só no professor: o salário é o valor da hora-aula, e o mês é aulas × 4,5 semanas × valor + 1/6 de DSR.">
            <Input id="aulasSemanais" name="aulasSemanais" inputMode="numeric" maxLength={2} defaultValue={v?.aulasSemanais != null ? String(v.aulasSemanais) : ""} />
          </CampoForm>
          <CampoForm label="Horas por mês" htmlFor="horasMensais" dica="220 na jornada de 44 h semanais. Com horário escolhido, vale o do horário.">
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
          <CampoForm label="Filhos para o salário-família" htmlFor="filhosSalarioFamilia" dica="Até 14 anos, ou inválidos.">
            <Input id="filhosSalarioFamilia" name="filhosSalarioFamilia" inputMode="numeric" defaultValue={String(v?.filhosSalarioFamilia ?? 0)} />
          </CampoForm>
          <CampoForm
            label="Matrícula no eSocial"
            htmlFor="matricula"
            dica="A mesma do evento de início (S-2200 ou S-2300). Sócio e autônomo sem S-2300: deixe vazia."
          >
            <Input id="matricula" name="matricula" maxLength={30} defaultValue={v?.matricula ?? ""} />
          </CampoForm>
          <CampoForm label="Categoria" htmlFor="categoria" dica="Tabela 1 do eSocial. Sócio, autônomo e estagiário não têm FGTS, férias, 13º nem rescisão.">
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
            dica={!es.grauInstrucao && grauSugerido ? `Sugerido pela escolaridade do cadastro: ${aberta?.education}` : undefined}
          >
            <Select id="esocial_grauInstrucao" name="esocial_grauInstrucao" defaultValue={grauSugerido ?? ""}>
              {opcoes(GRAUS_DE_INSTRUCAO)}
            </Select>
          </CampoForm>
          <CampoForm label="Município (código IBGE)" htmlFor="esocial_codigoMunicipio" dica="7 dígitos (4106902 é Curitiba).">
            <Input id="esocial_codigoMunicipio" name="esocial_codigoMunicipio" inputMode="numeric" maxLength={7} placeholder="4106902" defaultValue={es.codigoMunicipio ?? ""} />
          </CampoForm>
          <CampoForm label="CBO do cargo" htmlFor="esocial_cbo">
            <Input id="esocial_cbo" name="esocial_cbo" inputMode="numeric" maxLength={7} placeholder="6 dígitos" defaultValue={es.cbo ?? ""} />
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
          <CampoForm label="CNPJ do agente de integração" htmlFor="esocial_estagioCnpjAgente" dica="CIEE, IEL…, quando houver.">
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
          <CampoForm label="Banco" htmlFor="bancoCodigo" dica="O código de 3 dígitos do banco (ex.: 341).">
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
        {/* "O banco é o código de 3 dígitos" saiu do lado do campo e foi para
            o "?" do Banco (17/11/2026, melhoria-707). */}
        <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 sm:items-end mt-4">
          <CampoForm label="Tipo de conta" htmlFor="tipoConta">
            <Select id="tipoConta" name="tipoConta" defaultValue={v?.tipoConta ?? (/poup/i.test(aberta?.bankAccountType ?? "") ? "POUPANCA" : "CORRENTE")}>
              <option value="CORRENTE">Conta corrente</option>
              <option value="POUPANCA">Poupança</option>
            </Select>
          </CampoForm>
        </div>
        {!v && aberta?.bankName && (
          <p className="text-fs-2 text-fg-muted mt-3">
            No cadastro da pessoa: {aberta?.bankName}
            {aberta?.bankAgency ? `, agência ${aberta?.bankAgency}` : ""}
            {aberta?.bankAccount ? `, conta ${aberta?.bankAccount}` : ""}. Confira o código do banco e os dígitos.
          </p>
        )}
      </BlocoDoContrato>

      <BlocoDoContrato titulo="Centro de custo">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <CampoForm label="Centro de custo" htmlFor="costCenterId" dica="Os centros de custo do BPO da empresa. A contabilização e o resumo da folha saem por centro.">
            <Select id="costCenterId" name="costCenterId" defaultValue={v?.costCenterId ?? ""}>
              <option value="">Sem centro de custo</option>
              {centrosDeCusto.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} · ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Departamento" htmlFor="departamento">
            <Input id="departamento" name="departamento" maxLength={80} defaultValue={v?.departamento ?? ""} />
          </CampoForm>
        </div>
        {centrosDeCusto.length === 0 && <p className="text-fs-2 text-fg-muted mt-2">A empresa ainda não tem centros de custo: cadastre no BPO para escolher aqui.</p>}
      </BlocoDoContrato>

      <BlocoDoContrato titulo="Rubricas fixas">
        <RubricasFixasDoContrato
          key={aberta?.id ?? "novo"}
          rubricas={paraFixar}
          mesPadrao={mesAtual()}
          iniciais={fixasDaPessoa.map((f) => ({
            rubricaId: f.rubricaId,
            quantidade: decimalTexto(f.quantidade),
            valor: decimalTexto(f.valor, 2),
            inicio: f.inicio,
            fim: f.fim ?? "",
            observacao: f.observacao ?? "",
          }))}
        />
      </BlocoDoContrato>

      <BlocoDoContrato titulo="Adicionais">
        <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
          <Checkbox id="periculosidade" name="periculosidade" label="Periculosidade (30% do salário)" defaultChecked={v?.periculosidade ?? false} />
          <Checkbox id="valeTransporte" name="valeTransporte" label="Vale-transporte (desconta 6% do salário)" defaultChecked={v?.valeTransporte ?? false} />
          <Checkbox id="aprendiz" name="aprendiz" label="Aprendiz (FGTS de 2%)" defaultChecked={v?.aprendiz ?? false} />
          <Checkbox
            id="contribuicaoSindical"
            name="contribuicaoSindical"
            label="Autorizou a contribuição sindical (desconta um dia no mês da convenção)"
            defaultChecked={v?.contribuicaoSindical ?? false}
          />
        </div>
        <CampoForm
          label="Previdência complementar (por mês)"
          htmlFor="previdenciaComplementar"
          className="mt-4 max-w-xs"
          dica="A contribuição do empregado ao PGBL ou fundo de pensão: desconta na folha e deduz da base do IRRF."
        >
          <Input
            id="previdenciaComplementar"
            name="previdenciaComplementar"
            inputMode="decimal"
            prefix="R$"
            placeholder="0,00"
            defaultValue={v?.previdenciaComplementar != null ? reais(Number(v.previdenciaComplementar)) : ""}
          />
        </CampoForm>
        <CampoForm
          label="Custo diário do vale-transporte"
          htmlFor="vtCustoDiario"
          className="mt-4 max-w-xs"
          dica="As tarifas de ida e volta somadas. O desconto de 6% fica limitado a este custo × os dias úteis trabalhados, e o pedido do mês sai daqui."
        >
          <Input id="vtCustoDiario" name="vtCustoDiario" inputMode="decimal" prefix="R$" placeholder="0,00" defaultValue={v?.vtCustoDiario != null ? reais(Number(v.vtCustoDiario)) : ""} />
        </CampoForm>
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
          <p className="text-fs-3 text-fg-muted">Nenhum colaborador nesta empresa.</p>
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
                      {p.dp2Vinculo ? `${brl(Number(p.dp2Vinculo.salarioBase))}${p.dp2Vinculo.tipoSalario === "HORISTA" ? "/h" : p.dp2Vinculo.tipoSalario === "HORA_AULA" ? "/aula" : ""}` : "—"}
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

      {transparencia.empregados > 0 && (
        <Secao
          titulo="Transparência salarial (Lei 14.611/2023)"
          apoio={
            transparencia.obrigada
              ? `${transparencia.empregados} empregados: a empresa publica o relatório semestral do Ministério do Trabalho. Confira aqui antes.`
              : `${transparencia.empregados} empregado(s): o relatório semestral é obrigatório a partir de ${LIMITE_DA_LEI}. A conferência vale como prévia.`
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Cargo</th>
                  <th className={TH_NUM}>Mulheres</th>
                  <th className={TH_NUM}>Média</th>
                  <th className={TH_NUM}>Homens</th>
                  <th className={TH_NUM}>Média</th>
                  <th className={TH_NUM}>Mulheres ÷ homens</th>
                </tr>
              </thead>
              <tbody>
                {transparencia.porCargo.map((l) => (
                  <tr key={l.cargo} className={TR}>
                    <td className={TD}>{l.cargo}</td>
                    <td className={TD_NUM}>{l.mulheres}</td>
                    <td className={TD_NUM}>{l.mediaMulheres !== null ? brl(l.mediaMulheres) : "—"}</td>
                    <td className={TD_NUM}>{l.homens}</td>
                    <td className={TD_NUM}>{l.mediaHomens !== null ? brl(l.mediaHomens) : "—"}</td>
                    <td className={`${TD_NUM} ${l.razao !== null && l.razao < 100 ? "text-warning-fg font-medium" : ""}`}>{pctTransp(l.razao)}</td>
                  </tr>
                ))}
                <tr className={`${TR} font-semibold`}>
                  <td className={TD}>Empresa</td>
                  <td className={TD_NUM} />
                  <td className={TD_NUM}>{transparencia.geral.mediaMulheres !== null ? brl(transparencia.geral.mediaMulheres) : "—"}</td>
                  <td className={TD_NUM} />
                  <td className={TD_NUM}>{transparencia.geral.mediaHomens !== null ? brl(transparencia.geral.mediaHomens) : "—"}</td>
                  <td className={TD_NUM}>{pctTransp(transparencia.geral.razao)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-fs-2 text-fg-muted">
            Por raça/cor:{" "}
            {transparencia.porRaca.map((r) => `${r.racaCor} ${r.pessoas} (média ${brl(r.media)})`).join(" · ")}
            {transparencia.semSexo > 0 ? `. ${transparencia.semSexo} sem sexo nos dados do eSocial do contrato: ficaram fora da comparação.` : "."} Salário do contrato; horista em mês pelas horas mensais.
          </p>
        </Secao>
      )}

      {pessoas.some((p) => p.dp2Vinculo) && (
        <Secao titulo="Documentos do contrato" apoio="A ficha de registro de empregado e o contrato de experiência em PDF, do cadastro e do contrato do DP 2. O que faltar no cadastro sai com um traço.">
          <form action="/api/dp2/documentos" method="get" target="_blank" className="flex flex-wrap items-end gap-4">
            <CampoForm label="Colaborador" htmlFor="doc-pessoa">
              <Select id="doc-pessoa" name="pessoa" defaultValue="" required>
                <option value="" disabled>
                  Escolha…
                </option>
                {pessoas
                  .filter((p) => p.dp2Vinculo)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </CampoForm>
            <CampoForm label="Documento" htmlFor="doc-tipo">
              <Select id="doc-tipo" name="tipo" defaultValue="FICHA">
                <option value="FICHA">Ficha de registro de empregado</option>
                <option value="EXPERIENCIA">Contrato de experiência</option>
              </Select>
            </CampoForm>
            <Button type="submit" variant="secondary">
              Baixar (PDF)
            </Button>
          </form>
          <p className="mt-2 text-fs-2 text-fg-muted">O contrato de experiência sai do contrato por prazo determinado (tipo 2 e data de término nos dados do eSocial), com o termo de prorrogação no fim.</p>
        </Secao>
      )}

      {pessoas.some((p) => p.dp2Vinculo) && (
        <Secao titulo="Termo de quitação anual" apoio="O termo do art. 507-B da CLT, com o que as competências fechadas do ano pagaram a cada colaborador, para assinar com o sindicato da categoria.">
          <form action="/api/dp2/quitacao" method="get" target="_blank" className="flex flex-wrap items-end gap-4">
            <CampoForm label="Colaborador" htmlFor="quit-pessoa">
              <Select id="quit-pessoa" name="pessoa" defaultValue="" required>
                <option value="" disabled>
                  Escolha…
                </option>
                {pessoas
                  .filter((p) => p.dp2Vinculo)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </CampoForm>
            <CampoForm label="Ano" htmlFor="quit-ano">
              <Input id="quit-ano" name="ano" inputMode="numeric" maxLength={4} defaultValue={String(new Date().getFullYear() - 1)} required />
            </CampoForm>
            <Button type="submit" variant="secondary">
              Baixar termo (PDF)
            </Button>
          </form>
        </Secao>
      )}

      {pessoas.length > 0 && (
        <Secao
          titulo="Advertências e suspensões"
          apoio="O registro na ficha e o documento para assinatura. Os dias da suspensão saem do salário quando a folha do mês é calculada."
        >
          {ocorrencias.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full min-w-[720px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Colaborador</th>
                    <th className={TH}>Tipo</th>
                    <th className={TH}>Data</th>
                    <th className={TH}>Motivo</th>
                    <th className={TH}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ocorrencias.map((o) => (
                    <tr key={o.id} className={TR}>
                      <td className={`${TD} align-middle`}>{nomeDaPessoa.get(o.personId) ?? "Fora desta empresa"}</td>
                      <td className={`${TD} align-middle`}>
                        <Selo tom={o.tipo === "SUSPENSAO" ? "perigo" : "atencao"}>{o.tipo === "SUSPENSAO" ? `Suspensão · ${o.dias} dia(s)` : "Advertência"}</Selo>
                      </td>
                      <td className={`${TD} align-middle tabular-nums`}>{formatCalendarDate(o.data)}</td>
                      <td className={`${TD} align-middle max-w-[320px] truncate`} title={o.motivo}>
                        {o.motivo}
                      </td>
                      <td className={`${TD} align-middle text-right pr-0`}>
                        <span className="inline-flex gap-2">
                          <Button href={`/api/dp2/ocorrencias/${o.id}`} variant="secondary" size="sm" download>
                            Documento (PDF)
                          </Button>
                          {tela.podeAgir && (
                            <FormularioDoDp2
                              acao={excluirOcorrenciaAction}
                              rotulo="Excluir"
                              rotuloEnviando="Excluindo…"
                              variante="secondary"
                              tamanho="sm"
                              confirmar={{ titulo: "Excluir a ocorrência?", texto: "Ela sai da ficha do colaborador. Se era suspensão de um mês já calculado, calcule a folha de novo.", rotulo: "Excluir" }}
                            >
                              <input type="hidden" name="ocorrenciaId" value={o.id} />
                            </FormularioDoDp2>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tela.podeAgir && (
            <FormularioDoDp2 acao={registrarOcorrenciaAction} rotulo="Registrar" rotuloEnviando="Registrando…" variante="secondary">
              <input type="hidden" name="companyId" value={empresaId} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CampoForm label="Colaborador" htmlFor="oc-personId">
                  <Select id="oc-personId" name="personId" defaultValue="" required>
                    <option value="" disabled>
                      Escolha…
                    </option>
                    {pessoas
                      .filter((p) => p.dp2Vinculo && !p.dismissalDate)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </CampoForm>
                <CampoForm label="Tipo" htmlFor="oc-tipo">
                  <Select id="oc-tipo" name="tipo" defaultValue="ADVERTENCIA">
                    <option value="ADVERTENCIA">Advertência</option>
                    <option value="SUSPENSAO">Suspensão</option>
                  </Select>
                </CampoForm>
                <CampoForm label="Data (ou início da suspensão)" htmlFor="oc-data">
                  <CampoData id="oc-data" name="data" required />
                </CampoForm>
                <CampoForm label="Dias de suspensão" htmlFor="oc-dias" dica="Só na suspensão: de 1 a 30 dias seguidos.">
                  <Input id="oc-dias" name="dias" inputMode="numeric" maxLength={2} />
                </CampoForm>
              </div>
              <CampoForm label="Motivo" htmlFor="oc-motivo" className="mt-4" dica="O fato e quando aconteceu: vai no documento.">
                <Textarea id="oc-motivo" name="motivo" rows={3} required />
              </CampoForm>
            </FormularioDoDp2>
          )}
        </Secao>
      )}

      {pessoas.length > 0 && (
        <Secao
          titulo="Saldo inicial das médias"
          apoio={
            saldoInicial.length === 0
              ? "O histórico de antes do DP 2, para a média de férias, 13º e rescisão: cole da Domínio (Utilitários › Lançamentos › Lançamento de Rubricas para Médias)."
              : saldoPendente > 0
                ? `${saldoPendente} linha(s) a conferir: só entram na média depois de conferidas.`
                : "Conferido: entra na média dos meses sem competência fechada no DP 2."
          }
          acao={
            tela.podeAgir && saldoPendente > 0 ? (
              <FormularioDoDp2 acao={conferirSaldoInicialAction} rotulo="Conferir todos" rotuloEnviando="Conferindo…" tamanho="sm">
                <input type="hidden" name="companyId" value={tela.empresa.id} />
              </FormularioDoDp2>
            ) : undefined
          }
        >
          {saldoInicial.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full min-w-[640px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Colaborador</th>
                    <th className={TH}>Meses</th>
                    <th className={TH_NUM}>Total das rubricas</th>
                    <th className={TH}>Situação</th>
                    <th className={TH}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {saldoInicial.map((r) => (
                    <tr key={r.personId} className={TR}>
                      <td className={`${TD} align-middle`}>{nomeDe.get(r.personId) ?? "Fora desta empresa"}</td>
                      <td className={`${TD} align-middle tabular-nums`}>
                        {r.meses} ({mesDe(r.de)} a {mesDe(r.ate)})
                      </td>
                      <td className={`${TD_NUM} align-middle`}>{brl(r.total)}</td>
                      <td className={`${TD} align-middle`}>{r.pendentes > 0 ? <Selo tom="atencao">{r.pendentes} a conferir</Selo> : <Selo tom="sucesso">Conferido</Selo>}</td>
                      <td className={`${TD} align-middle text-right pr-0`}>
                        {tela.podeAgir && (
                          <span className="inline-flex gap-2">
                            {r.pendentes > 0 && (
                              <FormularioDoDp2 acao={conferirSaldoInicialAction} rotulo="Conferir" rotuloEnviando="Conferindo…" variante="secondary" tamanho="sm">
                                <input type="hidden" name="companyId" value={empresaId} />
                                <input type="hidden" name="personId" value={r.personId} />
                              </FormularioDoDp2>
                            )}
                            <FormularioDoDp2
                              acao={apagarSaldoInicialAction}
                              rotulo="Apagar"
                              rotuloEnviando="Apagando…"
                              variante="secondary"
                              tamanho="sm"
                              confirmar={{
                                titulo: "Apagar o saldo inicial?",
                                texto: `O saldo inicial de ${nomeDe.get(r.personId) ?? "este colaborador"} sai, e a média volta a usar só as competências do DP 2.`,
                                rotulo: "Apagar",
                              }}
                            >
                              <input type="hidden" name="companyId" value={empresaId} />
                              <input type="hidden" name="personId" value={r.personId} />
                            </FormularioDoDp2>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tela.podeAgir && (
            <FormularioDoDp2 acao={importarSaldoInicialAction} rotulo="Importar saldo inicial" rotuloEnviando="Lendo…" variante="secondary">
              <input type="hidden" name="companyId" value={tela.empresa.id} />
              <CampoForm
                label="Linhas da Domínio"
                htmlFor="saldo-inicial"
                dica="Uma linha por rubrica e mês: CPF; competência (MM/AAAA); código da rubrica no DP 2; valor. Vale ; ou tabulação (colado de planilha). Importar de novo troca o da mesma pessoa, mês e rubrica."
              >
                <Textarea id="saldo-inicial" name="texto" rows={5} required placeholder={"123.456.789-09;03/2026;150;412,30\n123.456.789-09;04/2026;150;380,00"} className="font-mono" />
              </CampoForm>
            </FormularioDoDp2>
          )}
        </Secao>
      )}

      {pessoas.some((p) => p.dp2Vinculo) && (
        <Secao titulo="Reajuste coletivo e histórico salarial" apoio="O reajuste da convenção para todos os empregados (CLT) ativos: o percentual e, se houver, o piso. Cada mudança de salário fica no histórico.">
          {tela.podeAgir && (
            <FormularioDoDp2
              acao={reajusteColetivoAction}
              rotulo="Aplicar reajuste"
              rotuloEnviando="Aplicando…"
              variante="secondary"
              confirmar={{ titulo: "Aplicar o reajuste coletivo?", texto: "O salário de todos os empregados ativos muda a partir da data informada e entra no histórico. O S-2206 de cada um sai depois, em DP 2 › eSocial.", rotulo: "Aplicar" }}
            >
              <input type="hidden" name="companyId" value={empresaDoReajuste} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CampoForm label="Percentual" htmlFor="reaj-percentual">
                  <Input id="reaj-percentual" name="percentual" inputMode="decimal" suffix="%" placeholder="0,00" />
                </CampoForm>
                <CampoForm label="Piso da categoria" htmlFor="reaj-piso" dica="Quem fica abaixo sobe para o piso. Horista: o piso mensal ÷ horas.">
                  <Input id="reaj-piso" name="piso" inputMode="decimal" prefix="R$" placeholder="0,00" />
                </CampoForm>
                <CampoForm label="Vale a partir de" htmlFor="reaj-data">
                  <CampoData id="reaj-data" name="data" required />
                </CampoForm>
                <CampoForm label="Motivo" htmlFor="reaj-motivo">
                  <Input id="reaj-motivo" name="motivo" maxLength={120} placeholder="Convenção coletiva 2027" />
                </CampoForm>
              </div>
            </FormularioDoDp2>
          )}
          {historicoSalarial.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full min-w-[640px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Colaborador</th>
                    <th className={TH}>Desde</th>
                    <th className={TH_NUM}>De</th>
                    <th className={TH_NUM}>Para</th>
                    <th className={TH}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoSalarial.map((h) => (
                    <tr key={h.id} className={TR}>
                      <td className={TD}>{nomeNoHistorico.get(h.personId) ?? "Fora desta empresa"}</td>
                      <td className={`${TD} tabular-nums`}>{formatCalendarDate(h.data)}</td>
                      <td className={TD_NUM}>{h.salarioAnterior !== null ? brl(Number(h.salarioAnterior)) : "—"}</td>
                      <td className={TD_NUM}>{brl(Number(h.salario))}</td>
                      <td className={TD}>{h.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      )}

      {params.novo === "1" && !aberta && tela.podeAgir && (
        <ModalDoDp2
          key="novo"
          titulo="Novo colaborador"
          apoio={tela.empresa.nome}
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
                <CampoForm label="Cargo" htmlFor="novo_cargo">
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
