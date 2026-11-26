import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Aviso } from "@/components/ui/Aviso";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Secao, TD, TH, TR } from "@/components/dp2/Secao";
import { horasDoHorario, NOMES_DOS_DIAS } from "@/lib/dp2/horarios";
import { getPrisma } from "@/lib/prisma";
import { configDaEmpresa } from "@/lib/dp2/servidor";
import { responsaveisDeSst } from "@/lib/dp2/esocial/servidor";
import { aliquotaPatronal } from "@/lib/dp2/mensal";
import { abrirTelaDeEmpresaDoDp2 } from "@/lib/dp2/tela";
import { criarHorarioAction, excluirHorarioAction, salvarConfigDaEmpresaAction, salvarResponsaveisDeSstAction } from "../actions";

const fmt = (v: number, casas = 2) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4 }).format(v);

/** Como o DP 2 calcula a empresa em foco (11/11/2026): convenção coletiva e encargos patronais. */
export default async function ConfiguracaoDaEmpresaNoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_configuracao", params.empresa);
  const cabecalho = <PageHeader title="Configuração da empresa" />;
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EmptyState icon={<Building2 />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }
  const [cfg, convencoes, sst, horarios] = await Promise.all([
    configDaEmpresa(tela.tenantId, tela.empresa.id),
    getPrisma().dp2Convencao.findMany({ where: { tenantId: tela.tenantId, ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    responsaveisDeSst(tela.tenantId, tela.empresa.id),
    // Horários de trabalho (funcionalidade-752), com quantos contratos usam cada um.
    getPrisma().dp2Horario.findMany({ where: { tenantId: tela.tenantId, companyId: tela.empresa.id }, orderBy: { nome: "asc" } }),
  ]);
  const usoDoHorario = new Map(
    (
      await getPrisma().dp2Vinculo.groupBy({ by: ["horarioId"], where: { tenantId: tela.tenantId, horarioId: { in: horarios.map((h) => h.id) } }, _count: { _all: true } })
    ).map((g) => [g.horarioId, g._count._all])
  );
  const patronal = aliquotaPatronal(cfg.empresa);

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      {!cfg.configurada && (
        <Aviso tom="info" className="mb-5">
          Esta empresa ainda não foi configurada: o cálculo usa a CLT (hora extra 50% e 100%, noturno 20%), RAT 2%, FAP 1 e terceiros 5,8%.
        </Aviso>
      )}
      <Secao titulo={tela.empresa.nome} apoio={`Encargo patronal atual: ${fmt(patronal)}% sobre a folha${cfg.empresa.patronalNoDas ? " (no DAS)" : ""}, mais o FGTS.`}>
        {tela.podeAgir ? (
          <FormularioDoDp2 acao={salvarConfigDaEmpresaAction} rotulo="Salvar configuração">
            <input type="hidden" name="companyId" value={tela.empresa.id} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CampoForm
                label="Convenção coletiva"
                htmlFor="convencaoId"
                className="sm:col-span-2"
                dica="Cadastre em DP 2 › Convenções coletivas."
              >
                <Select id="convencaoId" name="convencaoId" defaultValue={cfg.convencaoId ?? ""}>
                  <option value="">Sem convenção (CLT)</option>
                  {convencoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="RAT (%)" htmlFor="ratAliquota" dica="1, 2 ou 3, pelo CNAE.">
                <Input id="ratAliquota" name="ratAliquota" inputMode="decimal" defaultValue={fmt(cfg.empresa.ratAliquota)} />
              </CampoForm>
              <CampoForm label="FAP" htmlFor="fap" dica="Entre 0,5 e 2.">
                <Input id="fap" name="fap" inputMode="decimal" defaultValue={fmt(cfg.empresa.fap, 4)} />
              </CampoForm>
              <CampoForm label="Terceiros (%)" htmlFor="terceirosAliquota" dica="Salário-educação, Sistema S… (FPAS).">
                <Input id="terceirosAliquota" name="terceirosAliquota" inputMode="decimal" defaultValue={fmt(cfg.empresa.terceirosAliquota)} />
              </CampoForm>
            </div>
            <h3 className="text-fs-3 font-semibold text-fg mt-5 mb-2">eSocial</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoForm label="FPAS" htmlFor="fpas" dica="3 dígitos, da atividade (515 é comércio).">
                <Input id="fpas" name="fpas" inputMode="numeric" maxLength={3} placeholder="515" defaultValue={cfg.esocial?.fpas ?? ""} />
              </CampoForm>
              <CampoForm label="Código de terceiros" htmlFor="codTercs">
                <Input id="codTercs" name="codTercs" inputMode="numeric" maxLength={4} placeholder="0115" defaultValue={cfg.esocial?.codTercs ?? ""} />
              </CampoForm>
              <CampoForm label="Classificação tributária" htmlFor="classTrib" dica="Tabela 8. Vazio: pelo regime (Simples 01/02, MEI 04, demais 99).">
                <Input id="classTrib" name="classTrib" inputMode="numeric" maxLength={2} defaultValue={cfg.esocial?.classTrib ?? ""} />
              </CampoForm>
            </div>

                <h3 className="text-fs-3 font-semibold text-fg mt-5 mb-2">Conta pagadora (de onde sai o salário no arquivo do banco)</h3>
                <div className="grid gap-4 grid-cols-[90px_1fr_70px] sm:grid-cols-[90px_1fr_70px_1.3fr_70px]">
                  <CampoForm label="Banco" htmlFor="bancoCodigo" dica="O código de 3 dígitos do banco.">
                    <Input id="bancoCodigo" name="bancoCodigo" inputMode="numeric" maxLength={3} placeholder="341" defaultValue={cfg.pagadora?.bancoCodigo ?? ""} />
                  </CampoForm>
                  <CampoForm label="Agência" htmlFor="agencia">
                    <Input id="agencia" name="agencia" inputMode="numeric" maxLength={10} defaultValue={cfg.pagadora?.agencia ?? ""} />
                  </CampoForm>
                  <CampoForm label="Dígito" htmlFor="agenciaDigito">
                    <Input id="agenciaDigito" name="agenciaDigito" maxLength={2} defaultValue={cfg.pagadora?.agenciaDigito ?? ""} />
                  </CampoForm>
                  <CampoForm label="Conta" htmlFor="conta">
                    <Input id="conta" name="conta" inputMode="numeric" maxLength={20} defaultValue={cfg.pagadora?.conta ?? ""} />
                  </CampoForm>
                  <CampoForm label="Dígito" htmlFor="contaDigito">
                    <Input id="contaDigito" name="contaDigito" maxLength={2} defaultValue={cfg.pagadora?.contaDigito ?? ""} />
                  </CampoForm>
                </div>
            <CampoForm label="Convênio de pagamentos" htmlFor="convenio" className="mt-4 max-w-sm" dica="O código que o banco dá à empresa para o pagamento por arquivo.">
              <Input id="convenio" name="convenio" maxLength={20} defaultValue={cfg.pagadora?.convenio ?? ""} />
            </CampoForm>
            <div className="mt-4">
              <Checkbox
                id="patronalNoDas"
                name="patronalNoDas"
                defaultChecked={cfg.empresa.patronalNoDas}
                label="Simples Nacional com a contribuição patronal no DAS (anexos I, II, III e V)"
              />
            </div>
            <div className="mt-3">
              <Checkbox
                id="pisSobreFolha"
                name="pisSobreFolha"
                defaultChecked={cfg.pisSobreFolha}
                label="Entidade sem fins lucrativos: PIS de 1% sobre a folha de salários"
                helper="Entra na apuração da competência, com as compensações de PIS do mês."
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CampoForm label="Adiantamento (% do salário)" htmlFor="adiantamentoPercentual" dica="O vale do meio do mês (40% é o comum). Em branco, a empresa não paga adiantamento.">
                <Input
                  id="adiantamentoPercentual"
                  name="adiantamentoPercentual"
                  inputMode="decimal"
                  defaultValue={cfg.adiantamento ? fmt(cfg.adiantamento.percentual) : ""}
                />
              </CampoForm>
              <CampoForm label="Dia do adiantamento" htmlFor="adiantamentoDia">
                <Input id="adiantamentoDia" name="adiantamentoDia" inputMode="numeric" maxLength={2} defaultValue={cfg.adiantamento ? String(cfg.adiantamento.dia) : ""} />
              </CampoForm>
            </div>
          </FormularioDoDp2>
        ) : (
          <p className="text-fs-3 text-fg-muted">Você pode ver, mas não alterar a configuração.</p>
        )}
      </Secao>
      <Secao titulo="Horários de trabalho" className="mt-5" apoio="O contrato de cada colaborador escolhe um horário: as horas por mês do cálculo e a jornada do eSocial saem dele.">
        {horarios.length > 0 && (
          <div className="overflow-x-auto mb-4">
            <table className="w-full min-w-[640px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Horário</th>
                  <th className={TH}>Jornada</th>
                  <th className={TH}>Horas</th>
                  <th className={TH}>Contratos</th>
                  <th className={TH}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {horarios.map((h) => {
                  const horas = horasDoHorario(h);
                  const uso = usoDoHorario.get(h.id) ?? 0;
                  return (
                    <tr key={h.id} className={TR}>
                      <td className={`${TD} font-medium`}>{h.nome}</td>
                      <td className={TD}>{horas.descricao}</td>
                      <td className={`${TD} tabular-nums whitespace-nowrap`}>
                        {fmt(horas.semanais, 0)} h/semana · {horas.mensais} h/mês
                      </td>
                      <td className={`${TD} tabular-nums`}>{uso}</td>
                      <td className={`${TD} text-right pr-0`}>
                        {tela.podeAgir && uso === 0 && (
                          <FormularioDoDp2
                            acao={excluirHorarioAction}
                            rotulo="Excluir"
                            rotuloEnviando="Excluindo…"
                            variante="secondary"
                            tamanho="sm"
                            confirmar={{ titulo: "Excluir o horário?", texto: `O horário "${h.nome}" sai da lista da empresa.`, rotulo: "Excluir" }}
                          >
                            <input type="hidden" name="horarioId" value={h.id} />
                          </FormularioDoDp2>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {tela.podeAgir && (
          <FormularioDoDp2 acao={criarHorarioAction} rotulo="Criar horário" rotuloEnviando="Criando…" variante="secondary">
            <input type="hidden" name="companyId" value={tela.empresa.id} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CampoForm label="Nome" htmlFor="horario-nome">
                <Input id="horario-nome" name="nome" maxLength={80} placeholder="Comercial 44 h" required />
              </CampoForm>
              <CampoForm label="Entrada" htmlFor="horario-entrada">
                <Input id="horario-entrada" name="entrada" placeholder="08:00" defaultValue="08:00" required />
              </CampoForm>
              <CampoForm label="Saída" htmlFor="horario-saida">
                <Input id="horario-saida" name="saida" placeholder="17:48" defaultValue="17:48" required />
              </CampoForm>
              <CampoForm label="Intervalo (minutos)" htmlFor="horario-intervalo">
                <Input id="horario-intervalo" name="intervalo" inputMode="numeric" defaultValue="60" />
              </CampoForm>
            </div>
            <fieldset className="mt-4">
              <legend className="text-label text-fg-secondary mb-2">Dias da semana</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {NOMES_DOS_DIAS.map((d, i) => (
                  <Checkbox key={d} id={`horario-dia-${i}`} name="dias" value={String(i)} label={d[0].toUpperCase() + d.slice(1)} defaultChecked={i < 5} />
                ))}
              </div>
            </fieldset>
            <CampoForm label="Tipo de jornada (eSocial)" htmlFor="horario-tipo" className="mt-4 max-w-sm">
              <Select id="horario-tipo" name="tipoJornada" defaultValue="9">
                <option value="9">9 · Demais tipos de jornada</option>
                <option value="2">2 · 12 x 36</option>
                <option value="3">3 · Fixa, com folga fixa no domingo</option>
              </Select>
            </CampoForm>
          </FormularioDoDp2>
        )}
      </Secao>
      <Secao titulo="Saúde e segurança (eSocial)" className="mt-5">
        {tela.podeAgir ? (
          <FormularioDoDp2 acao={salvarResponsaveisDeSstAction} rotulo="Salvar responsáveis">
            <input type="hidden" name="companyId" value={tela.empresa.id} />
            <h3 className="text-fs-3 font-semibold text-fg mb-3">Médico do PCMSO</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
              <CampoForm label="Nome" htmlFor="medicoNome">
                <Input id="medicoNome" name="medicoNome" maxLength={70} defaultValue={sst.medicoNome ?? ""} />
              </CampoForm>
              <CampoForm label="CPF" htmlFor="medicoCpf">
                <Input id="medicoCpf" name="medicoCpf" inputMode="numeric" maxLength={14} defaultValue={sst.medicoCpf ?? ""} />
              </CampoForm>
              <CampoForm label="CRM" htmlFor="medicoCrm">
                <Input id="medicoCrm" name="medicoCrm" inputMode="numeric" maxLength={10} defaultValue={sst.medicoCrm ?? ""} />
              </CampoForm>
              <CampoForm label="UF do CRM" htmlFor="medicoUf">
                <Input id="medicoUf" name="medicoUf" maxLength={2} defaultValue={sst.medicoUf ?? ""} />
              </CampoForm>
            </div>
            <h3 className="text-fs-3 font-semibold text-fg mb-3">Responsável pelos registros ambientais</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CampoForm label="Nome" htmlFor="ambientalNome">
                <Input id="ambientalNome" name="ambientalNome" maxLength={70} defaultValue={sst.ambientalNome ?? ""} />
              </CampoForm>
              <CampoForm label="CPF" htmlFor="ambientalCpf">
                <Input id="ambientalCpf" name="ambientalCpf" inputMode="numeric" maxLength={14} defaultValue={sst.ambientalCpf ?? ""} />
              </CampoForm>
              <CampoForm label="Órgão de classe" htmlFor="ambientalOrgao">
                <Select id="ambientalOrgao" name="ambientalOrgao" defaultValue={sst.ambientalOrgao ?? "4"}>
                  <option value="1">CRM</option>
                  <option value="4">CREA</option>
                  <option value="9">Outro</option>
                </Select>
              </CampoForm>
              <CampoForm label="Qual órgão (se outro)" htmlFor="ambientalOrgaoNome">
                <Input id="ambientalOrgaoNome" name="ambientalOrgaoNome" maxLength={20} defaultValue={sst.ambientalOrgaoNome ?? ""} />
              </CampoForm>
              <CampoForm label="Número no órgão" htmlFor="ambientalNumero">
                <Input id="ambientalNumero" name="ambientalNumero" maxLength={14} defaultValue={sst.ambientalNumero ?? ""} />
              </CampoForm>
              <CampoForm label="UF" htmlFor="ambientalUf">
                <Input id="ambientalUf" name="ambientalUf" maxLength={2} defaultValue={sst.ambientalUf ?? ""} />
              </CampoForm>
            </div>
          </FormularioDoDp2>
        ) : (
          <p className="text-fs-3 text-fg-muted">
            PCMSO: {sst.medicoNome ?? "não informado"} · Registros ambientais: {sst.ambientalNome ?? "não informado"}
          </p>
        )}
      </Secao>
    </PageContainer>
  );
}
