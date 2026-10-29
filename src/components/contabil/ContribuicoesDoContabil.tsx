"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { useChaveDeIdempotencia } from "@/components/fiscal/motor/useChaveDeIdempotencia";
import { formatarCompetencia, formatInstantDateTime } from "@/lib/format";
import type { ArquivoDoMotor, ExecucaoDoMotor } from "@/lib/sped/motor";
import { gerarContribuicoes } from "@/app/(app)/contabil/sped/actions";

const ESTADO: Record<ExecucaoDoMotor["estado"], [string, TomDoSelo]> = {
  pendente: ["Na fila", "marca"], executando: ["Gerando", "marca"], concluida: ["Concluída", "sucesso"], erro: ["Com erro", "perigo"], cancelada: ["Cancelada", "neutro"],
};
const VALIDACAO: Record<ArquivoDoMotor["validacao"]["estado"], [string, TomDoSelo]> = {
  nao_validado: ["Não validado", "neutro"], validando: ["Validando", "marca"], ok: ["Validado", "sucesso"], erro: ["Com erros", "perigo"],
};
const quando = (v: string | null | undefined) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? formatInstantDateTime(d) : ""; };

/**
 * O EFD Contribuições pelo motor (29/10/2026): pedir a geração do mês, ver o
 * pedido andar e baixar o arquivo. O arquivo é da raiz e quem assina é a
 * matriz — por isso não importa qual filial está escolhida.
 */
export function ContribuicoesDoContabil({ empresaId, competencia, raiz, escrita, podeAgir, execucoes, arquivos }: {
  empresaId: string; competencia: string; raiz: string; escrita: boolean; podeAgir: boolean; execucoes: ExecucaoDoMotor[]; arquivos: ArquivoDoMotor[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [tipo, setTipo] = useState<"0" | "1">("0");
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [duplicado, setDuplicado] = useState<string | null>(null);
  const ultima = execucoes[0] ?? null;
  const aberta = ultima?.estado === "pendente" || ultima?.estado === "executando";
  const vigente = arquivos.find((a) => a.considerado) ?? arquivos[0] ?? null;

  // Enquanto o pedido está na fila ou gerando, relê a tela a cada 5 s — o arquivo aparece sozinho.
  useEffect(() => {
    if (!aberta) return;
    const relogio = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 5000);
    return () => clearInterval(relogio);
  }, [aberta, router]);

  function gerar(confirmarDuplicado = false) {
    iniciar(async () => {
      const r = await gerarContribuicoes({ empresa: empresaId, competencia, tipoSped: tipo, confirmarDuplicado, chave });
      depoisDe(r);
      if (r.ok) { setDuplicado(null); toast.success(r.mensagem); router.refresh(); return; }
      if (r.codigo === "execucao_duplicada") { setDuplicado(r.mensagem); return; }
      toast.error(r.mensagem);
    });
  }

  const motivo = !podeAgir ? "Seu perfil só consulta." : !escrita ? "Falta o token de escrita na integração do SPED." : aberta ? "Aguarde o pedido em andamento terminar." : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-card-title font-semibold text-fg">EFD Contribuições de {formatarCompetencia(competencia)}</h3>
          <p className="mt-1 text-label text-fg-secondary">Um arquivo por raiz ({raiz}), assinado pela matriz. O motor gera com as decisões e os saldos que o Fiscal já registrou.</p>
        </div>
        <SegmentedControl label="Tipo do arquivo" active={tipo} onChange={setTipo} items={[{ key: "0", label: "Original" }, { key: "1", label: "Retificadora" }]} />
        <div className="flex flex-col items-start gap-1">
          <Button disabled={pendente || !!motivo} onClick={() => gerar()}><Play size={14} aria-hidden /> Gerar no motor</Button>
          {motivo && <p className="text-helper text-fg-muted">{motivo}</p>}
        </div>
        {duplicado && (
          <Aviso tom="atencao">
            <p>{duplicado}</p>
            <Button className="mt-2" size="sm" variant="secondary" disabled={pendente} onClick={() => gerar(true)}>Gerar mesmo assim</Button>
          </Aviso>
        )}
        {ultima && (
          <div className="border-t border-border pt-4 text-label">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">Pedido #{ultima.id}</span>
              <Selo tom={ESTADO[ultima.estado][1]}>{ESTADO[ultima.estado][0]}</Selo>
              {ultima.travada && <Selo tom="atencao">Sem sinal do agente</Selo>}
            </div>
            <p className="mt-1 text-helper text-fg-secondary">
              {[quando(ultima.solicitado_em), ultima.solicitado_por && `por ${ultima.solicitado_por}`, ultima.agente_host && `agente ${ultima.agente_host}`].filter(Boolean).join(" · ")}
            </p>
            {ultima.estado === "erro" && ultima.mensagem && <Aviso tom="perigo" className="mt-2">{ultima.mensagem}</Aviso>}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-card-title font-semibold text-fg">Arquivos gerados</h3>
        {!arquivos.length ? (
          <p className="mt-2 text-label text-fg-secondary">Nenhum arquivo deste mês ainda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {arquivos.map((a) => {
              const [rotulo, tom] = VALIDACAO[a.validacao.estado];
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-label">
                  <div className="min-w-0">
                    <p className="font-medium text-fg truncate" title={a.nome_arquivo}>{a.nome_arquivo}</p>
                    <p className="text-helper text-fg-secondary">Versão {a.versao}{a.retificadora ? " · retificadora" : ""} · {quando(a.gerado_em)}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.id === vigente?.id && a.considerado && <Selo tom="sucesso">Vigente</Selo>}
                      {a.superado_por && <Selo>Substituído</Selo>}
                      <Selo tom={tom}>{rotulo}</Selo>
                    </div>
                  </div>
                  <Button size="sm" variant={a.id === vigente?.id ? "primary" : "secondary"} href={`/api/fiscal/sped/arquivos/${a.id}/download?raiz=${raiz}`} download><Download size={14} aria-hidden /> Baixar</Button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-helper text-fg-muted">O download é o arquivo do motor, byte a byte. Validação e transmissão continuam no PVA.</p>
      </Card>
    </div>
  );
}
