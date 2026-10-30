"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Aviso } from "@/components/ui/Aviso";
import { useChaveDeIdempotencia } from "@/components/fiscal/motor/useChaveDeIdempotencia";
import { gerarContribuicoes } from "@/app/(app)/contabil/sped/actions";
export function GerarContribuicoesForm({ empresaId, mes, pode, motivo, tipoInicial = "0", reciboInicial = "" }: { empresaId: string; mes: string; pode: boolean; motivo: string; tipoInicial?: "0" | "1"; reciboInicial?: string }) {
  const [tipo, setTipo] = useState<"0" | "1">(tipoInicial);
  const [recibo, setRecibo] = useState(reciboInicial);
  const [erro, setErro] = useState("");
  const [duplicado, setDuplicado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const router = useRouter();
  const gerar = (confirmarDuplicado = false) => iniciar(async () => {
    const r = await gerarContribuicoes({ empresa: empresaId, competencia: mes, tipoSped: tipo, reciboAnterior: recibo, confirmarDuplicado, chave });
    depoisDe(r);
    if (!r.ok) { setErro(r.mensagem); setDuplicado(r.codigo === "execucao_duplicada"); return; }
    setErro(""); setDuplicado(false);
    router.push("/contabil/sped?" + new URLSearchParams({ empresa: empresaId, mes, aba: "contribuicoes", secao: "gerar", execucao: String(r.dados?.id ?? "") }));
    router.refresh();
  });
  return <form className="space-y-3 rounded-lg border border-border bg-surface p-4" onSubmit={(e) => { e.preventDefault(); gerar(duplicado); }}>
    <div className="flex flex-wrap gap-3 items-end"><label className="grid gap-1 text-label text-fg-secondary">Escrituração<Select value={tipo} onChange={(e) => { setTipo(e.target.value as "0" | "1"); setDuplicado(false); }}><option value="0">Original</option><option value="1">Retificadora</option></Select></label>
      {tipo === "1" && <label className="grid gap-1 text-label text-fg-secondary flex-1">Recibo anterior<Input value={recibo} maxLength={60} required onChange={(e) => { setRecibo(e.target.value); setDuplicado(false); }} /></label>}
      <Button type="submit" loading={pendente} disabled={!pode || (tipo === "1" && !recibo.trim())}>{duplicado ? "Gerar mesmo assim" : "Gerar no motor"}</Button>
    </div>
    <p className="text-helper text-fg-secondary">{motivo || "A geração usa os parâmetros e as decisões desta raiz. O pedido será acompanhado abaixo."}</p>
    {erro && <Aviso tom={duplicado ? "atencao" : "perigo"}>{erro}</Aviso>}
  </form>;
}
