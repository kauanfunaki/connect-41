"use client";
import { useEmpresaContabil } from "@/components/contabil/ContextoContribuicoes";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { AcoesFiscais, CampoFiscal } from "@/components/fiscal/previa/Compartilhados";
import { lerValidacaoNoMotor, regerarArquivoNoMotor, registrarEntregaNoMotor, validarArquivoNoMotor } from "@/app/(app)/fiscal/motor-actions";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

type Aberto = "regerar" | "entrega" | null;
const CONSULTA_MS = 5000;
const LIMITE_MS = 5 * 60 * 1000;

/**
 * As ações de um SPED gerado no motor real: baixar (os bytes do motor, sem
 * mudar nenhum), regerar (vira pedido na fila), validar (o motor roda a
 * pré-validação; aqui só se consulta a cada 5 s, por até 5 min) e registrar a
 * entrega. Cada diálogo tem a própria chave de idempotência.
 */
export function AcoesDoArquivo({ raiz, id, hrefDownload, obrigacao, validando, entregue, permiteRegerar, permiteEntregas }: {
  raiz: string;
  id: number;
  hrefDownload: string;
  obrigacao: "icms_ipi" | "contribuicoes";
  validando: boolean;
  entregue: boolean;
  permiteRegerar: boolean;
  permiteEntregas: boolean;
}) {
  const empresaContabil = useEmpresaContabil();
  const router = useRouter();
  const [aberto, setAberto] = useState<Aberto>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [acompanhando, setAcompanhando] = useState(validando);
  const [chaveValidar, , depoisDeValidar] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    if (!acompanhando) return;
    const inicio = Date.now();
    const relogio = setInterval(async () => {
      if (Date.now() - inicio > LIMITE_MS) { setAcompanhando(false); setResultado({ ok: false, mensagem: "A validação passou de 5 minutos. Recarregue mais tarde para ver o resultado." }); return; }
      const r = await lerValidacaoNoMotor({ raiz, empresaContabil, id }).catch(() => null);
      if (r?.ok && r.dados && r.dados.estado !== "validando") {
        setAcompanhando(false);
        setResultado({ ok: true, mensagem: "Validação concluída." });
        router.refresh();
      }
    }, CONSULTA_MS);
    return () => clearInterval(relogio);
  }, [acompanhando, raiz, id, router, empresaContabil]);

  const validar = () => startTransition(async () => {
    const r = await validarArquivoNoMotor({ raiz, empresaContabil, id, chave: chaveValidar });
    depoisDeValidar(r);
    if (r.ok || r.codigo === "validacao_em_andamento") setAcompanhando(true);
    setResultado({ ok: r.ok, mensagem: r.mensagem });
  });

  return <div className="space-y-3">
    <AcoesFiscais>
      <Button href={hrefDownload} download variant="secondary" size="sm"><Download size={14} />Baixar arquivo</Button>
      {permiteRegerar && <Button size="sm" variant="secondary" onClick={() => { setResultado(null); setAberto("regerar"); }}>Regerar</Button>}
      {permiteEntregas && obrigacao === "icms_ipi" && <Button size="sm" variant="secondary" loading={pendente || acompanhando} loadingLabel={acompanhando ? "Validando…" : "Enviando…"} onClick={validar}>Validar</Button>}
      {permiteEntregas && !entregue && <Button size="sm" onClick={() => { setResultado(null); setAberto("entrega"); }}>Registrar entrega</Button>}
    </AcoesFiscais>
    {obrigacao === "contribuicoes" && permiteEntregas && <p className="text-helper text-fg-muted">A validação do EFD Contribuições ainda não está ligada no motor.</p>}
    {resultado && <div role={resultado.ok ? "status" : "alert"}><Aviso tom={resultado.ok ? "sucesso" : "atencao"}>{resultado.mensagem}</Aviso></div>}
    {aberto === "regerar" && <Regerar raiz={raiz} id={id} fechar={(r) => { setAberto(null); if (r) { setResultado(r); if (r.ok) router.refresh(); } }} />}
    {aberto === "entrega" && <Entrega raiz={raiz} id={id} fechar={(r) => { setAberto(null); if (r) { setResultado(r); if (r.ok) router.refresh(); } }} />}
  </div>;
}

function Regerar({ raiz, id, fechar }: { raiz: string; id: number; fechar: (r?: { ok: boolean; mensagem: string }) => void }) {
  const empresaContabil = useEmpresaContabil();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [tipo, setTipo] = useState<"" | "0" | "1">("");
  const [duplicado, setDuplicado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const enviar = (confirmarDuplicado: boolean) => startTransition(async () => {
    if (!tipo) { setErro("Escolha Original ou Substituto."); return; }
    const r = await regerarArquivoNoMotor({ raiz, empresaContabil, id, tipoSped: tipo, confirmarDuplicado, chave });
    depoisDe(r);
    if (!r.ok && r.codigo === "execucao_duplicada") {
      const ex = r.detalhe?.existente as { id?: number } | undefined;
      setDuplicado(`Já existe o pedido #${ex?.id ?? "?"} para o mesmo arquivo e período. Enviar outro mesmo assim?`);
      return;
    }
    if (!r.ok) { setErro(r.mensagem); return; }
    fechar(r);
  });
  return <Modal open title={`Regerar o arquivo #${id}`} onClose={() => fechar()}>
    <p className="text-ui text-fg-secondary">Cria um pedido de geração do mesmo período na fila do motor. O arquivo atual continua guardado.</p>
    <CampoFiscal nome="Tipo do arquivo" className="mt-4"><Select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}><option value="">Selecione</option><option value="0">Original</option><option value="1">Substituto</option></Select></CampoFiscal>
    {duplicado && <Aviso tom="atencao" className="mt-3">{duplicado}</Aviso>}
    {erro && <Aviso tom="atencao" className="mt-3">{erro}</Aviso>}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button loading={pendente} loadingLabel="Enviando…" onClick={() => enviar(!!duplicado)}>{duplicado ? "Enviar mesmo assim" : "Regerar"}</Button>
      <Button variant="secondary" onClick={() => fechar()}>Cancelar</Button>
    </div>
  </Modal>;
}

function Entrega({ raiz, id, fechar }: { raiz: string; id: number; fechar: (r?: { ok: boolean; mensagem: string }) => void }) {
  const empresaContabil = useEmpresaContabil();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [dados, setDados] = useState({ tipo: "original" as "original" | "retificadora", recibo: "", dataEntrega: new Date().toISOString().slice(0, 10), observacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const enviar = () => startTransition(async () => {
    const r = await registrarEntregaNoMotor({ raiz, empresaContabil, id, chave, ...dados });
    depoisDe(r);
    if (!r.ok) { setErro(r.mensagem); return; }
    fechar(r);
  });
  return <Modal open title={`Registrar a entrega do arquivo #${id}`} onClose={() => fechar()}>
    <div className="grid gap-4 sm:grid-cols-2">
      <CampoFiscal nome="Tipo"><Select value={dados.tipo} onChange={(e) => setDados((d) => ({ ...d, tipo: e.target.value as typeof d.tipo }))}><option value="original">Original</option><option value="retificadora">Retificadora</option></Select></CampoFiscal>
      <CampoFiscal nome="Data da entrega"><CampoData value={dados.dataEntrega} onChange={(v) => setDados((d) => ({ ...d, dataEntrega: v }))} /></CampoFiscal>
      <CampoFiscal nome={dados.tipo === "retificadora" ? "Recibo (obrigatório)" : "Recibo"} className="sm:col-span-2"><Input maxLength={60} value={dados.recibo} onChange={(e) => setDados((d) => ({ ...d, recibo: e.target.value }))} /></CampoFiscal>
      <CampoFiscal nome="Observação" className="sm:col-span-2"><Input maxLength={200} value={dados.observacao} onChange={(e) => setDados((d) => ({ ...d, observacao: e.target.value }))} /></CampoFiscal>
    </div>
    {erro && <Aviso tom="atencao" className="mt-3">{erro}</Aviso>}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button loading={pendente} loadingLabel="Registrando…" onClick={enviar}>Registrar entrega</Button>
      <Button variant="secondary" onClick={() => fechar()}>Cancelar</Button>
    </div>
  </Modal>;
}
