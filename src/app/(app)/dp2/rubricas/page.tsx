import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Secao, TD, TH, TR } from "@/components/dp2/Secao";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { canManageSector } from "@/lib/auth/context";
import { listarRubricas } from "@/lib/dp2/servidor";
import { NOME_DO_LANCAMENTO, NOME_DO_TIPO, type LancamentoDaRubrica, type TipoDaRubrica } from "@/lib/dp2/rubricas";
import { contasDaFolha } from "@/lib/dp2/saidas";
import { CAMPOS_DAS_CONTAS } from "@/lib/dp2/contabilizacao";
import { salvarContasDaFolhaAction, salvarRubricaAction } from "../actions";

const sim = (v: boolean) => (v ? "sim" : "—");

/**
 * As rubricas do DP 2 (11/11/2026). As do motor nascem da lista padrão e só
 * mudam no nome, na natureza do eSocial e nas contas contábeis — tipo e
 * incidências são da lei. As livres o escritório cria à vontade.
 */
export default async function RubricasDoDp2({ searchParams }: { searchParams: Promise<{ rubrica?: string; nova?: string }> }) {
  const params = await searchParams;
  const { ctx, setor } = await abrirTelaDoModulo("dp2_rubricas");
  const [rubricas, contas] = await Promise.all([listarRubricas(ctx.tenantId), contasDaFolha(ctx.tenantId)]);
  const podeGerir = canManageSector(ctx, setor);
  const aberta = params.rubrica ? rubricas.find((r) => r.id === params.rubrica) : undefined;
  const nova = params.nova === "1" && !aberta;
  const livre = nova || aberta?.papel === null;

  return (
    <PageContainer>
      <PageHeader
        title="Rubricas"
        subtitle="Proventos e descontos do escritório, com as incidências de INSS, FGTS e IRRF. Valem para todas as empresas."
        action={
          podeGerir ? (
            <Button href="/dp2/rubricas?nova=1" scroll={false}>
              Nova rubrica
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Secao titulo={`${rubricas.length} rubricas`} apoio="“Do motor” = o Connect calcula. Rubrica livre = o DP informa o valor no mês.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Cód.</th>
                  <th className={TH}>Nome</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Lança em</th>
                  <th className={TH}>INSS</th>
                  <th className={TH}>FGTS</th>
                  <th className={TH}>IRRF</th>
                  <th className={TH}>Média</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {rubricas.map((r) => (
                  <tr key={r.id} className={`${TR} ${r.id === params.rubrica ? "bg-surface-hover" : ""} ${r.ativa ? "" : "opacity-60"}`}>
                    <td className={`${TD} tabular-nums text-fg-muted`}>{r.codigo}</td>
                    <td className={TD}>
                      {podeGerir ? (
                        <Link href={`/dp2/rubricas?rubrica=${r.id}`} scroll={false} className="text-brand hover:underline">
                          {r.nome}
                        </Link>
                      ) : (
                        r.nome
                      )}
                      {!r.ativa && <span className="text-fg-muted"> · inativa</span>}
                    </td>
                    <td className={TD}>{NOME_DO_TIPO[r.tipo as TipoDaRubrica] ?? r.tipo}</td>
                    <td className={TD}>{NOME_DO_LANCAMENTO[r.lancamento as LancamentoDaRubrica] ?? r.lancamento}</td>
                    <td className={TD}>{sim(r.incideInss)}</td>
                    <td className={TD}>{sim(r.incideFgts)}</td>
                    <td className={TD}>{sim(r.incideIrrf)}</td>
                    <td className={TD}>{sim(r.entraNaMedia)}</td>
                    <td className={TD}>{r.papel ? <Selo tom="neutro">do motor</Selo> : <Selo tom="marca">livre</Selo>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        {podeGerir && (aberta || nova) && (
          <Secao
            titulo={nova ? "Nova rubrica" : `${aberta!.codigo} · ${aberta!.nome}`}
            apoio={livre ? "Rubrica livre: o DP informa o valor no mês." : "Do motor: tipo e incidências seguem a lei e não mudam aqui."}
            acao={
              <Button href="/dp2/rubricas" variant="ghost" size="sm" scroll={false}>
                Fechar
              </Button>
            }
          >
            <FormularioDoDp2 key={aberta?.id ?? "nova"} acao={salvarRubricaAction} rotulo={nova ? "Criar rubrica" : "Salvar rubrica"}>
              {aberta && <input type="hidden" name="id" value={aberta.id} />}
              <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
                <CampoForm label="Código" htmlFor="codigo">
                  <Input id="codigo" name="codigo" maxLength={10} defaultValue={aberta?.codigo ?? ""} disabled={!nova} required={nova} />
                </CampoForm>
                <CampoForm label="Nome" htmlFor="nome" required>
                  <Input id="nome" name="nome" maxLength={120} defaultValue={aberta?.nome ?? ""} required />
                </CampoForm>
              </div>
              {livre && (
                <>
                  <CampoForm label="Tipo" htmlFor="tipo" className="mt-4">
                    <Select id="tipo" name="tipo" defaultValue={aberta?.tipo ?? "PROVENTO"}>
                      <option value="PROVENTO">Provento</option>
                      <option value="DESCONTO">Desconto</option>
                    </Select>
                  </CampoForm>
                  <div className="flex flex-col gap-2 mt-4">
                    <Checkbox id="incideInss" name="incideInss" label="Incide INSS" defaultChecked={aberta?.incideInss ?? true} />
                    <Checkbox id="incideFgts" name="incideFgts" label="Incide FGTS" defaultChecked={aberta?.incideFgts ?? true} />
                    <Checkbox id="incideIrrf" name="incideIrrf" label="Incide IRRF" defaultChecked={aberta?.incideIrrf ?? true} />
                    <Checkbox id="entraNaMedia" name="entraNaMedia" label="Entra na média de férias, 13º e rescisão" defaultChecked={aberta?.entraNaMedia ?? false} />
                    {aberta && <Checkbox id="ativa" name="ativa" label="Ativa (aparece para lançar)" defaultChecked={aberta.ativa} />}
                  </div>
                </>
              )}
              <div className="grid gap-4 sm:grid-cols-3 mt-4">
                <CampoForm label="Incidência INSS (eSocial)" htmlFor="codIncCP" helper="Tabela 21. Vazio: o Connect sugere.">
                  <Input id="codIncCP" name="codIncCP" inputMode="numeric" maxLength={2} defaultValue={aberta?.codIncCP ?? ""} />
                </CampoForm>
                <CampoForm label="Incidência IRRF (eSocial)" htmlFor="codIncIRRF" helper="Tabela 22. Vazio: o Connect sugere.">
                  <Input id="codIncIRRF" name="codIncIRRF" inputMode="numeric" maxLength={2} defaultValue={aberta?.codIncIRRF ?? ""} />
                </CampoForm>
                <CampoForm label="Incidência FGTS (eSocial)" htmlFor="codIncFGTS" helper="Tabela 23. Vazio: o Connect sugere.">
                  <Input id="codIncFGTS" name="codIncFGTS" inputMode="numeric" maxLength={2} defaultValue={aberta?.codIncFGTS ?? ""} />
                </CampoForm>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 mt-4">
                <CampoForm label="Natureza eSocial" htmlFor="naturezaEsocial" helper="Tabela 3, 4 dígitos.">
                  <Input id="naturezaEsocial" name="naturezaEsocial" maxLength={4} defaultValue={aberta?.naturezaEsocial ?? ""} />
                </CampoForm>
                <CampoForm label="Conta débito" htmlFor="contaDebito">
                  <Input id="contaDebito" name="contaDebito" maxLength={40} defaultValue={aberta?.contaDebito ?? ""} />
                </CampoForm>
                <CampoForm label="Conta crédito" htmlFor="contaCredito">
                  <Input id="contaCredito" name="contaCredito" maxLength={40} defaultValue={aberta?.contaCredito ?? ""} />
                </CampoForm>
              </div>
            </FormularioDoDp2>
          </Secao>
        )}
      </div>
      {podeGerir && (
        <Secao
          className="mt-5"
          titulo="Contas da folha"
          apoio="Para onde vão o líquido, os encargos da empresa e as provisões nos lançamentos contábeis. As contas de cada provento e desconto ficam na própria rubrica (débito e crédito)."
        >
          <FormularioDoDp2 acao={salvarContasDaFolhaAction} rotulo="Salvar contas">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS_DAS_CONTAS.map((c) => (
                <CampoForm key={c.chave} label={c.rotulo} htmlFor={c.chave} helper={c.ajuda}>
                  <Input id={c.chave} name={c.chave} maxLength={40} defaultValue={contas[c.chave]} />
                </CampoForm>
              ))}
            </div>
          </FormularioDoDp2>
        </Secao>
      )}
    </PageContainer>
  );
}
