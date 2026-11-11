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

type Premios = Record<string, { podio: string; evolucao: string }>;

/**
 * O prêmio do mês (10/11/2026, pedido do Kauan): um texto livre por mês
 * ("Top 3 ganham chocolate"), que aparece no painel do topo, no Início e no
 * ranking. Na Fase 2 (11/11/2026), um segundo texto para a maior evolução do
 * mês. Os dois ficam gravados no Hall dos campeões quando o mês fecha. Vazios,
 * o mês fica sem prêmio.
 */
export function PremioDoMes({ premios, meses }: { premios: Premios; meses: string[] }) {
  const [mes, setMes] = useState(meses[0]);
  const [texto, setTexto] = useState(premios[meses[0]]?.podio ?? "");
  const [evolucao, setEvolucao] = useState(premios[meses[0]]?.evolucao ?? "");
  const [erro, setErro] = useState("");
  const [salvando, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function escolherMes(m: string) {
    setMes(m);
    setTexto(premios[m]?.podio ?? "");
    setEvolucao(premios[m]?.evolucao ?? "");
    setErro("");
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await salvarPremioAction({ mes, texto, textoEvolucao: evolucao });
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      toast.success(texto.trim() || evolucao.trim() ? "Prêmio do mês salvo." : "Prêmio do mês tirado.");
      router.refresh();
    });
  }

  const comPremio = (m: string) => Boolean(premios[m]?.podio || premios[m]?.evolucao);
  return (
    <Card as="section" aria-labelledby="premio-titulo" className="max-w-2xl p-5">
      <h2 id="premio-titulo" className="mb-1 flex items-center gap-2 text-body font-semibold text-fg">
        <Gift size={16} aria-hidden className="text-brand" /> Prêmio do mês
      </h2>
      <p className="mb-4 text-ui text-fg-secondary">
        Aparece no painel do topo, no Início e no ranking, e fica gravado no Hall dos campeões quando o mês fecha. Deixe vazio para não ter prêmio.
      </p>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <CampoForm label="Mês" htmlFor="premio-mes">
          <Select id="premio-mes" value={mes} onChange={(e) => escolherMes(e.target.value)} className="w-full sm:w-60">
            {meses.map((m) => (
              <option key={m} value={m}>
                {`${mesPorExtensoLongo(m)}${comPremio(m) ? " · com prêmio" : ""}`}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Prêmio do pódio (top 3 de cada teste)" htmlFor="premio-texto" helper={`${texto.length} de 200 caracteres. Ex.: Top 3 de cada teste ganham chocolate.`}>
          <Input id="premio-texto" value={texto} maxLength={200} onChange={(e) => setTexto(e.target.value)} />
        </CampoForm>
        <CampoForm label="Prêmio da maior evolução" htmlFor="premio-evolucao" helper={`${evolucao.length} de 200 caracteres. Para quem mais melhorou contra a própria média. Ex.: Um vale-café.`}>
          <Input id="premio-evolucao" value={evolucao} maxLength={200} onChange={(e) => setEvolucao(e.target.value)} />
        </CampoForm>
        {erro && <Aviso>{erro}</Aviso>}
        <div>
          <Button type="submit" loading={salvando} className="min-h-11 sm:min-h-0">Salvar</Button>
        </div>
      </form>
    </Card>
  );
}
