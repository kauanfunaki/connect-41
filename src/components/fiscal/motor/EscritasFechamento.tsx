"use client";
import { useEmpresaContabil } from "@/components/contabil/ContextoContribuicoes";

// As escritas do Fechamento de PIS e COFINS (API-CONNECT §13.4 a §13.7 e §14.3).

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { CampoFiscal } from "@/components/fiscal/previa/Compartilhados";
import { apurarCteNoMotor, corrigirPagamentoNoMotor, decidirPagamentoNoMotor, informarContratoNoMotor } from "@/app/(app)/fiscal/escritas-actions";
import type { PermissaoDeEscrita } from "@/lib/fiscal/motor/escrita";
import { camposDaCorrecao, CAMPOS_CORRIGIVEIS, pastaValida, ROTULO_DO_TIPO_DE_APOIO, TIPOS_DE_PAGAMENTO_APOIO, type CampoCorrigivel, type ChaveDoPagamento, type CorpoDoContrato, type FaturasBpoImportadas, type PagamentosApoioImportados, type TipoDePagamentoApoio } from "@/lib/sped/escritasDoMotor";
import { reaisDoMotor } from "@/lib/fiscal/motor/formato";
import { AvisoDoResultado, EnvioDeArquivo, MotivoSemEscrita, useLacoPesado, type Resultado } from "./EscritasComuns";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

const ROTULO_DO_CAMPO: Record<CampoCorrigivel, string> = {
  valor: "Valor (R$)", documento: "CPF ou CNPJ", competencia: "Competência (AAAA-MM)", data_pagamento: "Data do pagamento (AAAA-MM-DD)", nome: "Nome", tipo: "Tipo",
};

/**
 * Decidir (aceitar, descartar, desfazer) e corrigir um pagamento a conferir.
 * O aceite tem a trava do motor (`422 pagamento_nao_aceitavel`, a frase diz o
 * que falta). Corrigir e aceitar juntos: se o aceite for recusado, **a
 * correção fica gravada** — a tela diz isso, em vez de "nada aconteceu".
 */
export function AcoesDoPagamento({ raiz, chave: alvo, decisao, falta, correcao, originais, permissao }: {
  raiz: string;
  chave: ChaveDoPagamento;
  decisao: string;
  /** `falta_para_aceitar` da leitura: o motor já disse por que o aceite seria recusado. */
  falta: string | null;
  correcao: Record<CampoCorrigivel, string>;
  originais: Record<CampoCorrigivel, string>;
  permissao: PermissaoDeEscrita;
}) {
  const empresaContabil = useEmpresaContabil();
  const router = useRouter();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aberto, setAberto] = useState<"descartar" | "corrigir" | null>(null);
  if (!permissao.visivel) return null;
  const decidir = (d: "aceito" | "descartado" | "", motivo = "") => new Promise<boolean>((fim) => startTransition(async () => {
    const r = await decidirPagamentoNoMotor({ raiz, empresaContabil, ...alvo, decisao: d, motivo, chave });
    depoisDe(r);
    setResultado({ ok: r.ok, mensagem: r.mensagem });
    if (r.ok) router.refresh();
    fim(r.ok);
  }));
  // Um botão e o "⋯" por linha (auditoria de UX, 30/10/2026): eram até quatro
  // botões, com "Aceitar" primário em todas as linhas — dezenas de primários
  // numa fila de pagamentos. "Aceitar" fica à vista, em secundário; Descartar,
  // Corrigir e Desfazer vão para o menu, como nas outras tabelas do app.
  const travado = !permissao.pode || pendente;
  return <div className="flex min-w-40 flex-col items-center gap-1">
    <span className="flex flex-wrap items-center justify-center gap-1">
      {decisao !== "aceito" && <Button size="xs" variant="secondary" disabled={travado} title={falta ?? permissao.motivo ?? undefined} onClick={() => decidir("aceito")}>Aceitar</Button>}
      {permissao.pode && <MenuDeMaisAcoes rotulo="Mais decisões do pagamento" sempreMenu>{({ close }) => <>
        <ItemDoMenu disabled={pendente} onClick={() => { close(); setResultado(null); setAberto("corrigir"); }}>Corrigir</ItemDoMenu>
        {decisao && <ItemDoMenu disabled={pendente} onClick={() => { close(); void decidir(""); }}>Desfazer a decisão</ItemDoMenu>}
        {decisao !== "descartado" && <ItemDoMenu danger disabled={pendente} onClick={() => { close(); setResultado(null); setAberto("descartar"); }}>Descartar</ItemDoMenu>}
      </>}</MenuDeMaisAcoes>}
    </span>
    {resultado && <span role={resultado.ok ? "status" : "alert"} className={`max-w-56 text-helper ${resultado.ok ? "text-success-fg" : "text-warning-fg"}`}>{resultado.mensagem}</span>}
    {aberto === "descartar" && <Descartar fechar={() => setAberto(null)} enviar={async (motivo) => { if (await decidir("descartado", motivo)) setAberto(null); }} pendente={pendente} />}
    {aberto === "corrigir" && <Corrigir raiz={raiz} alvo={alvo} inicial={correcao} originais={originais} falta={falta} fechar={(r) => { setAberto(null); if (r) { setResultado(r); router.refresh(); } }} />}
  </div>;
}

function Descartar({ fechar, enviar, pendente }: { fechar: () => void; enviar: (motivo: string) => void; pendente: boolean }) {
  const [motivo, setMotivo] = useState("");
  return <Modal open title="Descartar o pagamento" onClose={fechar}>
    <CampoFiscal nome="Motivo"><Input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: duplicado da página 2" /></CampoFiscal>
    {/* Rodapé do app: Cancelar e a ação à direita; a ação em vermelho, porque
        descarta (era o azul de primário). */}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={fechar} disabled={pendente}>Cancelar</Button>
      <Button variant="dangerSolid" loading={pendente} loadingLabel="Gravando…" onClick={() => enviar(motivo)}>Descartar</Button>
    </div>
  </Modal>;
}

function Corrigir({ raiz, alvo, inicial, originais, falta, fechar }: {
  raiz: string;
  alvo: ChaveDoPagamento;
  inicial: Record<CampoCorrigivel, string>;
  originais: Record<CampoCorrigivel, string>;
  falta: string | null;
  fechar: (r?: Resultado) => void;
}) {
  const empresaContabil = useEmpresaContabil();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [campos, setCampos] = useState(inicial);
  const [motivo, setMotivo] = useState("");
  const [aceitar, setAceitar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [errosDosCampos, setErrosDosCampos] = useState<Record<string, string>>({});
  const [pendente, startTransition] = useTransition();
  const enviar = () => startTransition(async () => {
    const corpo = camposDaCorrecao(inicial, campos);
    if ("erro" in corpo) { setErro(corpo.erro as string); return; }
    if (Object.keys(corpo).length === 0) { setErro("Nenhum campo mudou."); return; }
    const r = await corrigirPagamentoNoMotor({ raiz, empresaContabil, ...alvo, ...corpo, motivo, ...(aceitar ? { decisao: "aceito" } : {}), chave });
    depoisDe(r);
    // O aceite recusado com a correção gravada fecha o diálogo: o que foi gravado tem de aparecer na tela.
    if (r.ok || r.detalhe?.correcaoGravada) { fechar({ ok: r.ok, mensagem: r.mensagem }); return; }
    setErro(r.mensagem);
    setErrosDosCampos(r.campos ?? {});
  });
  return <Modal open title="Corrigir o pagamento" maxWidth="max-w-2xl" onClose={() => fechar()}>
    <p className="text-ui text-fg-secondary">Só o campo que você mudar é gravado. Esvaziar um campo limpa a correção e volta ao valor lido do documento.</p>
    {falta && <Aviso tom="atencao" className="mt-3">Para aceitar falta: {falta}</Aviso>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {/* O erro pela prop `erro` (auditoria de UX, 30/10/2026): passado como
          segundo filho, impedia o `CampoFiscal` de dar o `id` ao campo, e o
          rótulo ficava solto dele. */}
      {CAMPOS_CORRIGIVEIS.map((c) => <CampoFiscal key={c} nome={ROTULO_DO_CAMPO[c]} erro={errosDosCampos[c]}>
        <Input value={campos[c]} error={!!errosDosCampos[c]} placeholder={originais[c] ? `Lido: ${originais[c]}` : "Sem valor lido"} onChange={(e) => setCampos((x) => ({ ...x, [c]: e.target.value }))} />
      </CampoFiscal>)}
      <CampoFiscal nome="Motivo" className="sm:col-span-2"><Input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: conferi o PDF" /></CampoFiscal>
    </div>
    <Checkbox className="mt-4" label="Aceitar junto" helper="A correção é gravada primeiro; se o motor recusar o aceite, a correção fica." checked={aceitar} onChange={(e) => setAceitar(e.target.checked)} />
    {erro && <Aviso tom="atencao" className="mt-3">{erro}</Aviso>}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button loading={pendente} loadingLabel="Gravando…" onClick={enviar}>{aceitar ? "Corrigir e aceitar" : "Corrigir"}</Button>
      <Button variant="secondary" onClick={() => fechar()}>Cancelar</Button>
    </div>
  </Modal>;
}

const SIM_NAO_DO_CONTRATO = [
  ["existe_contrato", "Existe contrato"], ["locataria_bld", "A locatária é a empresa"], ["e_imovel", "É imóvel"],
  ["aprovado_fora_da_regra", "Aprovado fora da regra (ressalva)"], ["so_contabil", "Só para o contábil (sem crédito)"],
] as const;
const TEXTO_DO_CONTRATO = [
  ["locador_nome", "Locador", "text"], ["locador_documento", "CPF ou CNPJ do locador", "text"], ["vigencia_inicio", "Início da vigência", "date"],
  ["vigencia_fim", "Fim da vigência", "date"], ["onde_esta", "Onde está o contrato", "text"], ["observacao", "Observação", "text"], ["tratativa", "Tratativa", "text"],
] as const;

/**
 * "Informar contrato" de um fornecedor de aluguel de imóvel (§13.6). Só vai o
 * que a pessoa preencheu; o resto fica com o padrão do motor. O motor aplica a
 * resposta aos pagamentos a conferir do fornecedor e devolve a conta.
 */
export function InformarContrato({ raiz, fornecedor, permissao }: { raiz: string; fornecedor: string; permissao: PermissaoDeEscrita }) {
  const empresaContabil = useEmpresaContabil();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [dados, setDados] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendente, startTransition] = useTransition();
  if (!permissao.visivel) return null;
  const ressalva = dados.aprovado_fora_da_regra === "S" || dados.so_contabil === "S";
  const enviar = () => startTransition(async () => {
    const corpo = { fornecedor, ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== "")) } as CorpoDoContrato;
    const r = await informarContratoNoMotor({ raiz, empresaContabil, ...corpo, chave });
    depoisDe(r);
    if (!r.ok) { setErro(r.mensagem); setCampos(r.campos ?? {}); return; }
    setAberto(false);
    setResultado({ ok: true, mensagem: r.mensagem });
    router.refresh();
  });
  return <span className="flex flex-col items-center gap-1">
    <Button size="xs" variant="secondary" disabled={!permissao.pode} title={permissao.motivo ?? undefined} onClick={() => { setErro(null); setAberto(true); }}>Informar contrato</Button>
    {resultado && <span role="status" className="max-w-56 text-helper text-success-fg">{resultado.mensagem}</span>}
    {aberto && <Modal open title={`Contrato de ${fornecedor}`} maxWidth="max-w-2xl" onClose={() => setAberto(false)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {SIM_NAO_DO_CONTRATO.map(([k, rotulo]) => <CampoFiscal key={k} nome={rotulo}>
          <Select value={dados[k] ?? ""} onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))}><option value="">Padrão do motor</option><option value="S">Sim</option><option value="N">Não</option></Select>
        </CampoFiscal>)}
        {TEXTO_DO_CONTRATO.map(([k, rotulo, tipo]) => <CampoFiscal key={k} nome={k === "tratativa" && ressalva ? `${rotulo} (obrigatória)` : rotulo} erro={campos[k]} className={k === "observacao" || k === "tratativa" ? "sm:col-span-2" : undefined}>
          <Input type={tipo} value={dados[k] ?? ""} error={!!campos[k]} onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))} />
        </CampoFiscal>)}
      </div>
      {erro && <Aviso tom="atencao" className="mt-3">{erro}</Aviso>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button loading={pendente} loadingLabel="Gravando…" onClick={enviar}>Informar</Button>
        <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
      </div>
    </Modal>}
  </span>;
}

/**
 * "Apurar CT-e" dos arquivos pendentes (§13.7): um arquivo por chamada (2 a
 * 10 s cada), o laço aqui, com o progresso. `503 motor_ocupado` para o laço;
 * "Continuar" retoma de onde parou.
 */
export function ApurarCte({ raiz, ids, tela, permissao }: { raiz: string; ids: number[]; tela: "contribuicoes" | "conferencia"; permissao: PermissaoDeEscrita }) {
  const empresaContabil = useEmpresaContabil();
  const executar = useCallback((id: number, chave: string) => apurarCteNoMotor({ raiz, empresaContabil, id, tela, chave }), [raiz, tela, empresaContabil]);
  const rotulo = useCallback((id: number) => `#${id}`, []);
  const laco = useLacoPesado(executar, rotulo);
  if (!permissao.visivel || ids.length === 0) return null;
  const pendentes = laco.restantes.length ? laco.restantes : ids;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!permissao.pode} loading={laco.rodando} loadingLabel={`Apurando ${laco.feitos + 1} de ${laco.total}…`} onClick={() => laco.rodar(pendentes)}>
        {laco.restantes.length ? `Continuar (${laco.restantes.length} arquivo(s))` : `Apurar CT-e (${ids.length} arquivo(s))`}
      </Button>
      <span className="text-helper text-fg-muted">O motor lê cada SPED gerado inteiro: alguns segundos por arquivo.</span>
    </div>
    <MotivoSemEscrita permissao={permissao} />
    <AvisoDoResultado resultado={laco.resultado} />
  </div>;
}

/**
 * Importar pagamentos de apoio em PDF (§14.3): RPA, recibos, contratos de
 * motorista e de locação e faturas, para a conferência dos pagamentos desta
 * tela. O motor roda o mesmo código da ferramenta (`importacao_apoio.py`) e
 * não guarda o PDF. Até 25 MB por envio. OCR só onde o motor tem o
 * Tesseract: sem ele, `422 ocr_indisponivel`, e a tela diz para enviar sem.
 */
export function ImportarPagamentosApoio({ raiz, permissao }: { raiz: string; permissao: PermissaoDeEscrita }) {
  const [tipo, setTipo] = useState<TipoDePagamentoApoio | "">("");
  const [pasta, setPasta] = useState("");
  const [ocr, setOcr] = useState(false);
  const [semOcr, setSemOcr] = useState(false);
  const [importado, setImportado] = useState<PagamentosApoioImportados | null>(null);
  if (!permissao.visivel) return <MotivoSemEscrita permissao={permissao} />;
  const pastaRuim = !pastaValida(pasta.trim());
  return <div className="space-y-3">
    <div className="grid gap-4 sm:grid-cols-3">
      <CampoFiscal nome="Tipo dos documentos"><Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDePagamentoApoio)}><option value="">Escolha</option>{TIPOS_DE_PAGAMENTO_APOIO.map((t) => <option key={t} value={t}>{ROTULO_DO_TIPO_DE_APOIO[t]}</option>)}</Select></CampoFiscal>
      <CampoFiscal nome="Pasta do lote (opcional)"><Input maxLength={200} value={pasta} error={pastaRuim} placeholder="Ex.: 2026-09/recibos" onChange={(e) => setPasta(e.target.value)} /></CampoFiscal>
      <div className="flex items-end"><Checkbox label="Ler por OCR as páginas sem texto" helper={semOcr ? "O motor não tem OCR: envie sem." : "Mais lento; só onde o motor tem OCR."} checked={ocr} disabled={semOcr} onChange={(e) => setOcr(e.target.checked)} /></div>
    </div>
    {tipo ? <EnvioDeArquivo<PagamentosApoioImportados> destino="pagamentos_apoio" raiz={raiz} permissao={permissao} campos={{ tipo, pasta: pastaRuim ? "" : pasta.trim(), ocr: ocr ? "true" : "" }} rotuloDoBotao="Importar os pagamentos"
      aoConcluir={setImportado} aoFalhar={(r) => { if (r.codigo === "ocr_indisponivel") { setSemOcr(true); setOcr(false); } }} />
      : <p className="text-helper text-fg-muted">Escolha o tipo: o motor grava cada arquivo com ele, e arquivo já gravado com outro tipo é recusado.</p>}
    {importado && <div className="space-y-2 text-helper text-fg-secondary">
      <p>Situações: {Object.entries(importado.situacoes).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}. Soma dos aceitáveis: bruto {reaisDoMotor(importado.soma_ok.bruto)}, líquido {reaisDoMotor(importado.soma_ok.liquido)}.{importado.paginas_sem_texto ? ` ${importado.paginas_sem_texto} página(s) sem texto.` : ""}</p>
      {importado.recusadas.length > 0 && <Aviso tom="atencao">Recusados por já estarem gravados com outro tipo: {importado.recusadas.map((r) => `${r.arquivo} (${r.tipo_no_banco})`).join(", ")}.</Aviso>}
    </div>}
  </div>;
}

/**
 * Importar a planilha de faturas do BPO (§14.3), com os comprovantes em PDF
 * opcionais (ligam pelo número da nota no nome). A planilha já importada é
 * `409 importacao_existente`: nada é gravado, e a tela oferece substituir as
 * faturas dela (gravar por cima duplicaria o valor).
 */
export function ImportarFaturasBpo({ raiz, permissao }: { raiz: string; permissao: PermissaoDeEscrita }) {
  const [substituir, setSubstituir] = useState(false);
  const [existentes, setExistentes] = useState<number | null>(null);
  const [importado, setImportado] = useState<FaturasBpoImportadas | null>(null);
  if (!permissao.visivel) return <MotivoSemEscrita permissao={permissao} />;
  return <div className="space-y-3">
    {existentes !== null && <Aviso tom="atencao">A planilha já tem {existentes} fatura(s) no motor. Marque “substituir” para trocar as faturas dela pelas da planilha enviada.</Aviso>}
    <Checkbox label="Substituir as faturas já importadas desta planilha" helper="Apaga as faturas da mesma planilha e grava as novas." checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
    <EnvioDeArquivo<FaturasBpoImportadas> destino="faturas_bpo" raiz={raiz} permissao={permissao} campos={substituir ? { substituir: "true" } : {}} rotuloDoBotao={substituir ? "Substituir as faturas" : "Importar as faturas"}
      aoConcluir={(d) => { setImportado(d); setExistentes(null); setSubstituir(false); }}
      aoFalhar={(r) => setExistentes(r.codigo === "importacao_existente" && typeof r.detalhe?.existentes === "number" ? r.detalhe.existentes : null)} />
    {importado && <p className="text-helper text-fg-secondary">{importado.planilha}: {importado.pagamentos} pagamento(s), soma {reaisDoMotor(importado.soma_ok)}. Por competência: {Object.entries(importado.por_competencia).map(([c, v]) => `${c} ${reaisDoMotor(v)}`).join(" · ") || "—"}.</p>}
  </div>;
}
