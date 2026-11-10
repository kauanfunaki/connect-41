"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";

// Envio de extrato OFX (Fase 2, 09/11/2026) ou PDF (Fase 4, 10/11/2026). Quando o arquivo não diz todos os dados da conta, o
// servidor responde pedindo confirmação, e o mesmo arquivo é reenviado com a confirmação explícita
// (fica registrada na auditoria).

type Resposta = {
  importadas: number;
  duplicadas: number;
  rejeitadas: number;
  erros: number;
  motivosRejeicao: string[];
  errosDeLeitura: string[];
  alertaSaldo: string | null;
};

export function EnvioDeExtrato({ empresaId, agencias }: { empresaId: string; agencias: Opcao[] }) {
  const base = useId();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [agenciaId, setAgenciaId] = useState(agencias.length === 1 ? agencias[0].value : "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resposta | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function enviar(confirmarConta: boolean) {
    const arquivo = arquivoRef.current?.files?.[0];
    setErro(null);
    setResultado(null);
    if (!agenciaId) return setErro("Escolha a conta bancária do extrato.");
    if (!arquivo) return setErro("Escolha o arquivo do extrato (OFX ou PDF).");
    const form = new FormData();
    form.set("empresaId", empresaId);
    form.set("agenciaId", agenciaId);
    form.set("arquivo", arquivo);
    if (confirmarConta) form.set("confirmarConta", "1");
    setEnviando(true);
    // fetch, e não o envio com progresso: o extrato tem até 10 MB, e a tela precisa do corpo da recusa (pedido de confirmação).
    const resp = await fetch("/api/contabil-core/importacoes", { method: "POST", body: form }).catch(() => null);
    setEnviando(false);
    const corpo = (await resp?.json().catch(() => null)) as (Resposta & { error?: string; precisaConfirmar?: boolean }) | null;
    if (!resp?.ok || !corpo) {
      if (corpo?.precisaConfirmar) return setConfirmar(corpo.error ?? "Confirme a conta do extrato.");
      return setErro(corpo?.error ?? "Não deu para enviar o arquivo. Tente de novo.");
    }
    setConfirmar(null);
    setResultado(corpo);
    toast.success("Extrato importado.");
    if (arquivoRef.current) arquivoRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <CampoForm label="Conta bancária" htmlFor={`${base}-ag`} required>
          <SearchableSelect id={`${base}-ag`} name="agenciaId" options={agencias} defaultValue={agenciaId} onChange={setAgenciaId} placeholder="Escolha a conta" />
        </CampoForm>
        <CampoForm label="Arquivo do extrato" htmlFor={`${base}-arq`} required helper="OFX ou PDF. A planilha do banco continua no Contábil Core por enquanto.">
          <input id={`${base}-arq`} ref={arquivoRef} type="file" accept=".ofx,.OFX,.pdf,.PDF,application/x-ofx,application/pdf,text/plain" className="block w-full text-sm" />
        </CampoForm>
        <Button type="button" onClick={() => enviar(false)} loading={enviando} loadingLabel="Importando…">
          <Upload size={14} aria-hidden /> Importar
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-helper text-danger">
          {erro}
        </p>
      )}
      {confirmar && (
        <Aviso tom="atencao">
          <p>{confirmar}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={() => enviar(true)}>
              É desta conta: importar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
          </div>
        </Aviso>
      )}
      {resultado && (
        <Aviso tom={resultado.rejeitadas || resultado.erros || resultado.alertaSaldo ? "atencao" : "sucesso"}>
          <p>
            {resultado.importadas} importada(s), {resultado.duplicadas} já existia(m), {resultado.rejeitadas} recusada(s) por valor suspeito
            {resultado.erros ? `, ${resultado.erros} com erro de leitura` : ""}.
          </p>
          {resultado.alertaSaldo && <p className="mt-1">{resultado.alertaSaldo}</p>}
          {[...resultado.motivosRejeicao, ...resultado.errosDeLeitura].slice(0, 10).map((m) => (
            <p key={m} className="mt-1 text-micro">
              {m}
            </p>
          ))}
        </Aviso>
      )}
    </div>
  );
}
