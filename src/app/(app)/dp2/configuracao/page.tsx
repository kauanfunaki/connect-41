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
import { Secao } from "@/components/dp2/Secao";
import { getPrisma } from "@/lib/prisma";
import { configDaEmpresa } from "@/lib/dp2/servidor";
import { aliquotaPatronal } from "@/lib/dp2/mensal";
import { abrirTelaDeEmpresaDoDp2 } from "@/lib/dp2/tela";
import { salvarConfigDaEmpresaAction } from "../actions";

const fmt = (v: number, casas = 2) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4 }).format(v);

/** Como o DP 2 calcula a empresa em foco (11/11/2026): convenção coletiva e encargos patronais. */
export default async function ConfiguracaoDaEmpresaNoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_configuracao", params.empresa);
  const cabecalho = <PageHeader title="Configuração da empresa" subtitle="A convenção coletiva e os encargos patronais que o DP 2 usa no cálculo desta empresa." />;
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EmptyState icon={<Building2 />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }
  const [cfg, convencoes] = await Promise.all([
    configDaEmpresa(tela.tenantId, tela.empresa.id),
    getPrisma().dp2Convencao.findMany({ where: { tenantId: tela.tenantId, ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
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
                helper="Cadastre em DP 2 › Convenções coletivas."
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
              <CampoForm label="RAT (%)" htmlFor="ratAliquota" helper="1, 2 ou 3, pelo CNAE.">
                <Input id="ratAliquota" name="ratAliquota" inputMode="decimal" defaultValue={fmt(cfg.empresa.ratAliquota)} />
              </CampoForm>
              <CampoForm label="FAP" htmlFor="fap" helper="Entre 0,5 e 2.">
                <Input id="fap" name="fap" inputMode="decimal" defaultValue={fmt(cfg.empresa.fap, 4)} />
              </CampoForm>
              <CampoForm label="Terceiros (%)" htmlFor="terceirosAliquota" helper="Salário-educação, Sistema S… (FPAS).">
                <Input id="terceirosAliquota" name="terceirosAliquota" inputMode="decimal" defaultValue={fmt(cfg.empresa.terceirosAliquota)} />
              </CampoForm>
            </div>
            <h3 className="text-fs-3 font-semibold text-fg mt-5 mb-2">eSocial</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoForm label="FPAS" htmlFor="fpas" helper="3 dígitos, da atividade (ex.: 515 comércio).">
                <Input id="fpas" name="fpas" inputMode="numeric" maxLength={3} defaultValue={cfg.esocial?.fpas ?? ""} />
              </CampoForm>
              <CampoForm label="Código de terceiros" htmlFor="codTercs" helper="4 dígitos (ex.: 0115).">
                <Input id="codTercs" name="codTercs" inputMode="numeric" maxLength={4} defaultValue={cfg.esocial?.codTercs ?? ""} />
              </CampoForm>
              <CampoForm label="Classificação tributária" htmlFor="classTrib" helper="Tabela 8. Vazio: pelo regime (Simples 01/02, MEI 04, demais 99).">
                <Input id="classTrib" name="classTrib" inputMode="numeric" maxLength={2} defaultValue={cfg.esocial?.classTrib ?? ""} />
              </CampoForm>
            </div>

                <h3 className="text-fs-3 font-semibold text-fg mt-5 mb-2">Conta pagadora (de onde sai o salário no arquivo do banco)</h3>
                <div className="grid gap-4 grid-cols-[90px_1fr_70px] sm:grid-cols-[90px_1fr_70px_1.3fr_70px]">
                  <CampoForm label="Banco" htmlFor="bancoCodigo" helper="Código, ex.: 341">
                    <Input id="bancoCodigo" name="bancoCodigo" inputMode="numeric" maxLength={3} defaultValue={cfg.pagadora?.bancoCodigo ?? ""} />
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
            <CampoForm label="Convênio de pagamentos" htmlFor="convenio" className="mt-4 max-w-sm" helper="O código que o banco dá à empresa para o pagamento por arquivo.">
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
          </FormularioDoDp2>
        ) : (
          <p className="text-fs-3 text-fg-muted">Você pode ver, mas não alterar a configuração.</p>
        )}
      </Secao>
    </PageContainer>
  );
}
