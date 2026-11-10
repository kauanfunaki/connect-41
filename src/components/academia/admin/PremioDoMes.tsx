"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { salvarPremioAction } from "@/app/(app)/academia/actions";
import { mesPorExtensoLongo } from "@/lib/academia/regras";

/**
 * O prêmio do mês (10/11/2026, pedido do Kauan): um texto livre por mês
 * ("Top 3 ganham chocolate"), que aparece no painel do topo, no Início e no
 * ranking. Vazio tira o prêmio do mês.
 */
export function PremioDoMes({ premios, meses }: { premios: Record<string, string>; meses: string[] }) {
  const [mes, setMes] = useState(meses[0]);
  const [texto, setTexto] = useState(premios[meses[0]] ?? "");
  const [erro, setErro] = useState("");
  const [salvando, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function escolherMes(m: string) {
    setMes(m);
    setTexto(premios[m] ?? "");
    setErro("");
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await salvarPremioAction({ mes, texto });
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      toast.success(texto.trim() ? "Prêmio do mês salvo." : "Prêmio do mês tirado.");
      router.refresh();
    });
  }

  return (
    <Card as="section" aria-labelledby="premio-titulo" className="max-w-2xl p-5">
      <h2 id="premio-titulo" className="mb-1 flex items-center gap-2 text-body font-semibold text-fg">
        <Gift size={16} aria-hidden className="text-brand" /> Prêmio do mês
      </h2>
      <p className="mb-4 text-ui text-fg-secondary">Aparece no painel do topo, no Início e no ranking. Deixe vazio para não ter prêmio no mês.</p>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <CampoForm label="Mês" htmlFor="premio-mes">
          <Select id="premio-mes" value={mes} onChange={(e) => escolherMes(e.target.value)} className="w-full sm:w-60">
            {meses.map((m) => (
              <option key={m} value={m}>
                {`${mesPorExtensoLongo(m)}${premios[m] ? " · com prêmio" : ""}`}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Prêmio" htmlFor="premio-texto" helper={`${texto.length} de 200 caracteres. Ex.: Top 3 de cada teste ganham chocolate.`}>
          <Input id="premio-texto" value={texto} maxLength={200} onChange={(e) => setTexto(e.target.value)} />
        </CampoForm>
        {erro && <Aviso>{erro}</Aviso>}
        <div>
          <Button type="submit" loading={salvando} className="min-h-11 sm:min-h-0">Salvar</Button>
        </div>
      </form>
    </Card>
  );
}
