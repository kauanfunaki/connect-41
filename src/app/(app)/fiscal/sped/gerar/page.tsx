import { Suspense } from "react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { prepararTelaDoSped, type TelaDoSped } from "@/lib/fiscal/sped/tela";
import { arquivosDaCompetencia } from "@/lib/fiscal/sped/dados";
import { hrefDoSped } from "@/lib/fiscal/sped/etapas";
import { mesPorExtenso } from "@/lib/fiscal/sped/formato";
import { doMotor } from "@/lib/fiscal/motor/leitura";
import { dataHora, tamanho } from "@/lib/fiscal/motor/formato";
import { ESTADO_DA_EXECUCAO } from "@/lib/fiscal/previa/doMotor";
import type { ArquivoDoMotor } from "@/lib/sped/motor";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { CascoDoSped } from "@/components/fiscal/sped/CascoDoSped";
import { SemMotor } from "@/components/fiscal/sped/SemMotor";
import { GerarArquivo } from "@/components/fiscal/sped/GerarArquivo";
import { AcoesDoArquivo } from "@/components/fiscal/motor/AcoesDoArquivo";
import { AcompanhamentoDaExecucao } from "@/components/fiscal/motor/AcompanhamentoDaExecucao";
import { CarregandoLeitura, ErroDaLeitura } from "@/components/fiscal/motor/LeituraDoMotor";

export const dynamic = "force-dynamic";

const VALIDACAO: Record<ArquivoDoMotor["validacao"]["estado"], string> = { nao_validado: "Não validado", validando: "Validando", ok: "Validado", erro: "Com erro" };
const ENTREGA: Record<string, string> = { nao_registrada: "Entrega não registrada", registrada: "Entregue", outro_arquivo: "Outro arquivo foi entregue", dominio: "Vale o arquivo da Domínio", nenhum: "Sem entrega" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await abrirTelaDoModulo("fiscal_operacao");
  const tela = await prepararTelaDoSped(await searchParams, "gerar");
  if (!tela) return <SemMotor />;
  return <CascoDoSped tela={tela}>
    <Suspense key={`${tela.estabelecimento?.id}:${tela.competencia}`} fallback={<CarregandoLeitura oQue="os arquivos e a fila do motor" />}>
      <Gerar tela={tela} />
    </Suspense>
  </CascoDoSped>;
}

/**
 * Gerar SPED (29/10/2026): o pedido de geração ao motor, o andamento do pedido
 * aberto e as versões do arquivo da competência, com validar, registrar a
 * entrega e baixar. O arquivo sai do motor byte a byte (ISO-8859-1).
 */
async function Gerar({ tela }: { tela: TelaDoSped }) {
  const estab = tela.estabelecimento!;
  const { motor, ctx, competencia } = tela;
  const aqui = hrefDoSped("gerar", { empresa: estab.companyId, competencia });
  const [arquivos, execucoes, agir, entregas] = await Promise.all([
    arquivosDaCompetencia(tela, estab),
    doMotor(() => motor.cliente.listarExecucoes(estab.raiz, { acao: "sped", empresa_id: estab.id, competencia, limite: 10 })),
    podeNoModulo(ctx, "fiscal_operacao", "agir"),
    podeNoModulo(ctx, "fiscal_entregas", "agir"),
  ]);
  const doEstab = (execucoes.dados?.itens ?? []).filter((e) => e.empresa_id === estab.id);
  const aberta = doEstab.find((e) => e.estado === "pendente" || e.estado === "executando") ?? null;
  const ultima = doEstab[0] ?? null;
  // O log só aparece com a geração em andamento; concluída, vira uma linha (e o arquivo novo, embaixo).
  const log = aberta ? await doMotor(() => motor.cliente.logDaExecucao(estab.raiz, aberta.id, 200)) : null;
  const motivo = !motor.escrita ? "Escrita do SPED não habilitada: falta o token de escrita na integração (Administração › Integrações)." : !agir ? "Seu perfil consulta, mas não pede geração." : null;
  const versoes = arquivos.dados?.versoes ?? [];
  const vigente = arquivos.dados?.vigente ?? null;
  const baixa = tela.modulos.includes("fiscal_entregas");
  const hrefDownload = (id: number) => `/api/fiscal/sped/arquivos/${id}/download?raiz=${estab.raiz}`;

  return <div className="space-y-6">
    <GerarArquivo raiz={estab.raiz} estabelecimentoId={estab.id} competencia={competencia} nomeDoMes={mesPorExtenso(competencia)} jaTemArquivo={!!vigente} emAndamento={!!aberta} pode={motor.escrita && agir} motivo={motivo} />

    {execucoes.erro !== null && <ErroDaLeitura falha={execucoes} hrefDeNovo={aqui} />}
    {aberta && log?.dados && <AcompanhamentoDaExecucao key={aberta.id} raiz={estab.raiz} inicial={aberta} logInicial={log.dados.texto} truncadoInicial={log.dados.truncado} />}
    {!aberta && ultima && <p className="-mt-3 text-helper text-fg-muted">Última geração: #{ultima.id}, {ESTADO_DA_EXECUCAO[ultima.estado].toLowerCase()} · pedida em {dataHora(ultima.solicitado_em)}{ultima.solicitado_por ? ` por ${ultima.solicitado_por}` : ""}{ultima.mensagem ? ` · ${ultima.mensagem.replace(/\.$/, "")}` : ""}.</p>}

    {arquivos.erro !== null ? <ErroDaLeitura falha={arquivos} hrefDeNovo={aqui} /> : vigente && <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-card-title font-semibold text-fg">Arquivo vigente · versão {vigente.versao}</h2>
          <p className="mt-1 text-ui text-fg-secondary">{vigente.nome_arquivo} · gerado em {dataHora(vigente.gerado_em)} · {tamanho(vigente.tamanho_bytes)}</p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <Selo tom={vigente.validacao.estado === "ok" ? "sucesso" : vigente.validacao.estado === "erro" ? "perigo" : "neutro"}>{VALIDACAO[vigente.validacao.estado]}</Selo>
          <Selo tom={vigente.entrega.estado === "registrada" ? "sucesso" : "neutro"}>{ENTREGA[vigente.entrega.estado] ?? vigente.entrega.estado}</Selo>
          {vigente.defasado && <Selo tom="atencao">Há decisões depois desta geração</Selo>}
        </span>
      </div>
      {vigente.validacao.estado !== "nao_validado" && vigente.validacao.estado !== "validando" && <p className="mt-3 text-ui text-fg-secondary">Validação: {vigente.validacao.erros ?? 0} erro(s) e {vigente.validacao.advertencias ?? 0} advertência(s){vigente.validacao.concluido_em ? `, em ${dataHora(vigente.validacao.concluido_em)}` : ""}.</p>}
      {vigente.defasado && <div className="mt-3"><Aviso tom="atencao">{vigente.decisoes_posteriores ? `${vigente.decisoes_posteriores} decisão(ões) foram gravadas` : "Há decisões gravadas"} depois desta geração. Gere de novo para o arquivo levá-las.</Aviso></div>}
      <div className="mt-4">
        {baixa
          ? <AcoesDoArquivo raiz={estab.raiz} id={vigente.id} hrefDownload={hrefDownload(vigente.id)} obrigacao={vigente.obrigacao} validando={vigente.validacao.estado === "validando"} entregue={vigente.entrega.estado === "registrada"} permiteRegerar={false} permiteEntregas={entregas && motor.escrita} />
          : <p className="text-helper text-fg-muted">Baixar, validar e registrar a entrega ficam com quem acessa SPED gerados.</p>}
      </div>
    </Card>}

    {versoes.length > 1 && <BlocoRecolhivel titulo={`Versões anteriores (${versoes.length - 1})`} abertoInicial={false}>
      <div><TabelaFiscal colunas={["Versão", "Gerado em", "Validação", "Entrega", ""]} linhas={versoes.filter((a) => a.id !== vigente?.id).map((a) => ({ id: String(a.id), celulas: [
        `v${a.versao}${a.superado_por ? " · superada" : ""}`, dataHora(a.gerado_em), VALIDACAO[a.validacao.estado], ENTREGA[a.entrega.estado] ?? a.entrega.estado,
        baixa ? <Button key="b" size="xs" variant="ghost" href={hrefDownload(a.id)} download>Baixar</Button> : "—",
      ] }))} /></div>
    </BlocoRecolhivel>}
  </div>;
}
