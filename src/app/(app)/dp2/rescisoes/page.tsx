import { FileSignature } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { Secao, TD, TD_NUM, TH, TH_NUM, TR } from "@/components/dp2/Secao";
import { Selo } from "@/components/ui/Selo";
import { getPrisma } from "@/lib/prisma";
import { calcularRescisaoDaPessoa } from "@/lib/dp2/rescisaoServidor";
import { Recibo } from "@/components/dp2/Recibo";
import { formatCalendarDate } from "@/lib/format";
import { semVinculo } from "@/lib/dp2/categorias";
import { colaboradoresDaEmpresa } from "@/lib/dp2/servidor";
import { lerInteiro, lerNumero } from "@/lib/dp2/entrada";
import { MOTIVO_LABEL, type MotivoCanonico } from "@/lib/rescisao/motivos";
import { abrirTelaDeEmpresaDoDp2, brl } from "@/lib/dp2/tela";
import { podeNoModulo } from "@/lib/auth/modulo";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { excluirRescisaoAction, gerarDesligamentoAction, gravarRescisaoAction } from "../actions";

const NOME_DO_AVISO: Record<string, string> = { INDENIZADO: "indenizado", TRABALHADO: "trabalhado", DISPENSADO: "dispensado" };
const SITUACAO_DO_S2299: Record<string, string> = { PENDENCIA: "com pendência", PRONTO: "pronto para enviar" };

type Params = {
  empresa?: string;
  pessoa?: string;
  desligamento?: string;
  motivo?: string;
  aviso?: string;
  vencidos?: string;
  faltas?: string;
  saldoFgts?: string;
  adiantado?: string;
};

const MOTIVOS = Object.keys(MOTIVO_LABEL) as MotivoCanonico[];

/**
 * Rescisões no DP 2 (11/11/2026): as verbas do cálculo de rescisão do Connect
 * com INSS, IRRF e FGTS pelas tabelas do DP 2. Desde 25/11/2026
 * (funcionalidade-746, entrega 2.3) grava a rescisão, liga ao desligamento em
 * andamento e gera o S-2299 a partir dela; quem tem rescisão no mês sai da
 * folha mensal. TRCT, aviso prévio em PDF e multa na guia são da entrega 2.4.
 */
export default async function RescisoesDoDp2({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_rescisoes", params.empresa);
  const cabecalho = (
    <PageHeader title="Rescisões" />
  );
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EmptyState icon={<FileSignature />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }

  // Sócio, autônomo e estagiário não têm rescisão: o término sai no eSocial (S-2399).
  const pessoas = (await colaboradoresDaEmpresa(tela.tenantId, tela.empresa.id)).filter((p) => p.dp2Vinculo && !semVinculo(p.dp2Vinculo.categoria));
  const pessoa = params.pessoa ? pessoas.find((p) => p.id === params.pessoa) : undefined;
  const desligamento = /^\d{4}-\d{2}-\d{2}$/.test(params.desligamento ?? "")
    ? params.desligamento!
    : pessoa?.dismissalDate
      ? pessoa.dismissalDate.toISOString().slice(0, 10)
      : null;
  const motivo = (MOTIVOS as string[]).includes(params.motivo ?? "") ? (params.motivo as MotivoCanonico) : "DISPENSA_SEM_JUSTA_CAUSA";
  const aviso = params.aviso ?? "INDENIZADO";
  const vencidos = Math.max(0, Math.min(2, lerInteiro(params.vencidos ?? "0") ?? 0));
  const faltas = lerInteiro(params.faltas ?? "0") ?? 0;
  const saldoFgts = lerNumero(params.saldoFgts ?? "");
  const adiantado = lerNumero(params.adiantado ?? "") ?? 0;

  const comEsocial = await podeNoModulo(tela.ctx, "dp2_esocial", "agir");
  const prisma = getPrisma();
  const gravadas = await prisma.dp2Rescisao.findMany({
    where: { tenantId: tela.tenantId, companyId: tela.empresa.id },
    include: { person: { select: { name: true } } },
    orderBy: { desligamento: "desc" },
    take: 50,
  });
  const eventos = await prisma.dp2EventoEsocial.findMany({
    where: { tenantId: tela.tenantId, id: { in: gravadas.map((g) => g.eventoEsocialId).filter((x): x is string => !!x) } },
    select: { id: true, situacao: true },
  });
  const situacaoDoEvento = new Map(eventos.map((e) => [e.id, e.situacao]));
  const jaGravada = pessoa ? gravadas.find((g) => g.personId === pessoa.id) : undefined;

  let resultado: React.ReactNode = null;
  if (pessoa?.dp2Vinculo && desligamento) {
    const r = await calcularRescisaoDaPessoa(tela.tenantId, pessoa, {
      desligamento,
      motivo,
      aviso: aviso === "TRABALHADO" ? "TRABALHADO" : aviso === "DISPENSADO" ? "DISPENSADO" : "INDENIZADO",
      vencidos,
      faltas,
      saldoFgts,
      adiantado,
    });
    if (!r.ok) {
      resultado = <Aviso tom="perigo">{pessoa.name}: {r.erro}</Aviso>;
    } else {
      const c = r.calculo;
      resultado = (
        <Secao
          titulo={`Rescisão de ${pessoa.name}`}
          apoio={`${MOTIVO_LABEL[motivo]} · admitido em ${formatCalendarDate(pessoa.admissionDate!)}, desligado em ${formatCalendarDate(new Date(`${desligamento}T00:00:00.000Z`))}. FGTS na guia: ${brl(c.fgts)}${c.multaFgts !== null ? ` + multa ${brl(c.multaFgts)}` : ""}.`}
        >
          {c.faltando.length > 0 && (
            <Aviso tom="info" className="mb-4">
              {c.faltando.join(" ")}
            </Aviso>
          )}
          <p className="text-fs-2 text-fg-muted mb-4">Média de variáveis: {r.media.memoria}</p>
          <Recibo
            linhas={c.linhas.map((l) => ({ nome: l.nome, valor: l.valor, tipo: l.tipo, memoria: l.memoria, motivo: l.motivo }))}
            proventos={c.proventos}
            descontos={c.descontos}
            liquido={c.liquido}
            alertas={c.alertas}
          />
          {tela.podeAgir &&
            (jaGravada ? (
              <Aviso tom="info" className="mt-5">
                {pessoa.name} já tem rescisão gravada (desligamento em {formatCalendarDate(jaGravada.desligamento)}). Para gravar outra, exclua a gravada abaixo.
              </Aviso>
            ) : (
              <FormularioDoDp2 acao={gravarRescisaoAction} rotulo="Gravar rescisão" rotuloEnviando="Gravando…" className="mt-5">
                <input type="hidden" name="companyId" value={tela.empresa.id} />
                <input type="hidden" name="personId" value={pessoa.id} />
                <input type="hidden" name="desligamento" value={desligamento} />
                <input type="hidden" name="motivo" value={motivo} />
                <input type="hidden" name="aviso" value={aviso} />
                <input type="hidden" name="vencidos" value={String(vencidos)} />
                <input type="hidden" name="faltas" value={String(faltas)} />
                <input type="hidden" name="saldoFgts" value={params.saldoFgts ?? ""} />
                <input type="hidden" name="adiantado" value={params.adiantado ?? ""} />
              </FormularioDoDp2>
            ))}
        </Secao>
      );
    }
  }

  const listaDeGravadas = (
    <Secao titulo="Rescisões gravadas">
      {gravadas.length === 0 ? (
        <p className="text-fs-3 text-fg-muted">Nenhuma rescisão gravada nesta empresa.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-fs-3">
            <thead>
              <tr>
                <th className={TH}>Colaborador</th>
                <th className={TH}>Desligamento</th>
                <th className={TH}>Motivo</th>
                <th className={TH_NUM}>Líquido</th>
                <th className={TH_NUM}>FGTS + multa</th>
                <th className={TH}>S-2299</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {gravadas.map((g) => {
                const situacao = g.eventoEsocialId ? situacaoDoEvento.get(g.eventoEsocialId) : undefined;
                return (
                  <tr key={g.id} className={TR}>
                    <td className={TD}>
                      {g.person.name}
                      {g.terminationId && (
                        <Selo tom="marca" className="ml-2">
                          ligada ao desligamento
                        </Selo>
                      )}
                    </td>
                    <td className={TD}>{formatCalendarDate(g.desligamento)}</td>
                    <td className={TD}>
                      {MOTIVO_LABEL[g.motivo as MotivoCanonico] ?? g.motivo} · aviso {NOME_DO_AVISO[g.aviso] ?? g.aviso}
                    </td>
                    <td className={TD_NUM}>{brl(Number(g.liquido))}</td>
                    <td className={TD_NUM}>
                      {brl(Number(g.fgts))}
                      {g.multaFgts !== null ? ` + ${brl(Number(g.multaFgts))}` : ""}
                    </td>
                    <td className={TD}>
                      {situacao ? (
                        <Selo tom={situacao === "PRONTO" ? "sucesso" : situacao === "PENDENCIA" ? "atencao" : "marca"}>{SITUACAO_DO_S2299[situacao] ?? situacao.toLowerCase()}</Selo>
                      ) : (
                        <span className="text-fg-muted">não gerado</span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex justify-end gap-1">
                        {comEsocial && tela.podeAgir && (!situacao || situacao === "PENDENCIA" || situacao === "PRONTO") && (
                          <FormularioDoDp2 acao={gerarDesligamentoAction} rotulo={situacao ? "Gerar o S-2299 de novo" : "Gerar o S-2299"} rotuloEnviando="Gerando…" variante="secondary" tamanho="xs">
                            <input type="hidden" name="rescisaoId" value={g.id} />
                          </FormularioDoDp2>
                        )}
                        {tela.podeAgir && (
                          <FormularioDoDp2
                            acao={excluirRescisaoAction}
                            rotulo="Excluir"
                            rotuloEnviando="Excluindo…"
                            variante="ghost"
                            tamanho="xs"
                            confirmar={{
                              titulo: "Excluir esta rescisão?",
                              texto: "A pessoa volta para a folha mensal do mês do desligamento, e o S-2299 que ainda não foi enviado é apagado junto.",
                              rotulo: "Excluir",
                            }}
                          >
                            <input type="hidden" name="rescisaoId" value={g.id} />
                          </FormularioDoDp2>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      {pessoas.length === 0 ? (
        <EmptyState
          icon={<FileSignature />}
          title="Ninguém com contrato no DP 2"
          description="Crie o contrato dos colaboradores em Colaboradores para calcular a rescisão."
          action={<Button href="/dp2/colaboradores">Ir para Colaboradores</Button>}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {/* A linha de apoio foi para o artigo do DP 2, e o "Só aparece quem tem
              contrato" para o "?" do Colaborador (17/11/2026, melhoria-707). */}
          <Secao titulo="Calcular rescisão">
            <FormularioDeFiltro className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <CampoForm label="Colaborador" htmlFor="pessoa" dica="Só aparece quem tem contrato no DP 2, em Colaboradores.">
                <Select id="pessoa" name="pessoa" defaultValue={pessoa?.id ?? ""} required>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Último dia trabalhado" htmlFor="desligamento">
                <CampoData id="desligamento" name="desligamento" defaultValue={desligamento ?? ""} required />
              </CampoForm>
              <CampoForm label="Motivo" htmlFor="motivo">
                <Select id="motivo" name="motivo" defaultValue={motivo}>
                  {MOTIVOS.map((m) => (
                    <option key={m} value={m}>
                      {MOTIVO_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Aviso prévio" htmlFor="aviso">
                <Select id="aviso" name="aviso" defaultValue={aviso}>
                  <option value="INDENIZADO">Indenizado</option>
                  <option value="TRABALHADO">Trabalhado</option>
                  <option value="DISPENSADO">Dispensado</option>
                </Select>
              </CampoForm>
              <CampoForm label="Períodos de férias vencidos" htmlFor="vencidos" dica="0, 1 ou 2, não gozados.">
                <Input id="vencidos" name="vencidos" inputMode="numeric" defaultValue={String(vencidos)} />
              </CampoForm>
              <CampoForm label="Faltas no período atual" htmlFor="faltas">
                <Input id="faltas" name="faltas" inputMode="numeric" defaultValue={String(faltas)} />
              </CampoForm>
              <CampoForm label="Saldo do FGTS" htmlFor="saldoFgts" dica="Do extrato, para a multa.">
                <Input id="saldoFgts" name="saldoFgts" inputMode="decimal" prefix="R$" defaultValue={params.saldoFgts ?? ""} />
              </CampoForm>
              <CampoForm label="13º já adiantado" htmlFor="adiantado">
                <Input id="adiantado" name="adiantado" inputMode="decimal" prefix="R$" defaultValue={params.adiantado ?? ""} />
              </CampoForm>
              <div className="lg:col-span-4">
                <Button type="submit">Calcular</Button>
              </div>
            </FormularioDeFiltro>
          </Secao>
          {resultado}
          {listaDeGravadas}
        </div>
      )}
    </PageContainer>
  );
}
