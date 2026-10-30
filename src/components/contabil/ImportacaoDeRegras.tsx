"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { TabelaContabil } from "./TabelaContabil";
import { importarRegras } from "@/app/(app)/contabil/sped/actions";
import type { PreviaDeRegras } from "@/lib/contabil/regras";

export function ImportacaoDeRegras({ empresaId, fechar }: { empresaId: string; fechar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const arquivo = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<PreviaDeRegras | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const enviar = (confirmar: boolean) => iniciar(async () => {
    const f = arquivo.current?.files?.[0];
    if (!f) { setErro("Escolha uma planilha."); return; }
    const dados = new FormData(); dados.set("empresa", empresaId); dados.set("arquivo", f);
    if (confirmar) { dados.set("confirmar", "sim"); dados.set("impressao", previa?.impressao ?? ""); }
    const r = await importarRegras(dados);
    if (!r.ok) { setErro(r.erro); return; }
    if ("previa" in r) { setPrevia(r.previa); setErro(""); if (r.aplicada) { toast.success(r.mensagem); router.refresh(); fechar(); } }
  });
  return <SlideOver open onClose={() => { if (!pendente) fechar(); }} title="Importar regras" width="max-w-3xl"><div className="space-y-4">
    <p className="text-label text-fg-secondary">CSV ou XLSX, até 5 MB e 5.000 linhas. Use o arquivo de regras ou de pendências exportado aqui. Reenviar atualiza fornecedor + CFOP; linhas ainda sem contas são ignoradas.</p>
    <label className="grid gap-2 text-label text-fg-secondary">Planilha de regras<input ref={arquivo} type="file" accept=".csv,.xlsx" disabled={pendente} onChange={() => { setPrevia(null); setErro(""); }} /></label>
    <Button variant="secondary" loading={pendente} onClick={() => enviar(false)}>Conferir arquivo</Button>
    {erro && <Aviso tom="perigo">{erro}</Aviso>}
    {previa && <><p className="text-label">{previa.regras.length} regra(s) preenchida(s) · {previa.ignoradas} linha(s) sem contas · {previa.erros.length} erro(s)</p>
      {previa.erros.length > 0 && <Aviso tom="atencao"><ul className="space-y-1">{previa.erros.slice(0, 50).map((e) => <li key={e.linha}>Linha {e.linha}: {e.mensagem}</li>)}</ul>{previa.erros.length > 50 && <p>Mostrando os primeiros 50 erros. Corrija o arquivo e confira novamente.</p>}</Aviso>}
      <TabelaContabil local pesquisar colunas={["Fornecedor", "CFOP", "Débito", "Crédito", "Histórico"]} linhas={previa.regras.map((r) => ({ id: r.cnpjFornecedor + "|" + r.cfop, celulas: [r.nomeFornecedor || r.cnpjFornecedor, r.cfop || "Todos", r.contaDebito || "Modelo", r.contaCredito, r.historico || "Padrão"] }))} />
      <Button loading={pendente} disabled={!!previa.erros.length || !previa.regras.length} onClick={() => enviar(true)}>Confirmar importação</Button>
    </>}
  </div></SlideOver>;
}
