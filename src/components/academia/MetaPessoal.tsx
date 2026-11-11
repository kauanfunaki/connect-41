"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Select } from "@/components/ui/Select";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { dataBR } from "@/lib/datas/calendario";
import { gravarMetaAction, tirarMetaAction } from "@/app/(app)/academia/actions";
import { NIVEIS, ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TESTES, ehNivel, ehTeste, type Teste } from "@/lib/academia/regras";
import { ALVO_MAXIMO, UNIDADE_DA_META } from "@/lib/academia/metas";
import type { MetaNaTela } from "@/lib/academia/tipos";

const ROTULO_DA_SITUACAO = { atingida: "Meta atingida!", andamento: "Em andamento", vencida: "O prazo passou" } as const;

/** A barra do progresso da meta, com o número para o leitor de tela. Também no painel do topo. */
export function BarraDaMeta({ meta, compacta = false }: { meta: MetaNaTela; compacta?: boolean }) {
  const { progresso } = meta;
  const unidade = UNIDADE_DA_META[meta.teste];
  const cor = progresso.situacao === "atingida" ? "bg-success" : progresso.situacao === "vencida" ? "bg-fg-muted" : "bg-brand";
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progresso.pct}
        aria-label={`Meta: ${meta.texto}`}
        aria-valuetext={`${progresso.melhor ?? 0} de ${meta.alvo} ${unidade}`}
        className={`${compacta ? "h-1.5" : "h-2"} overflow-hidden rounded-full bg-surface-2`}
      >
        <div className={`h-full rounded-full ${cor} motion-safe:transition-[width] motion-safe:duration-300`} style={{ width: `${progresso.pct}%` }} />
      </div>
      <p className="flex flex-wrap justify-between gap-x-2 text-helper text-fg-muted tabular-nums">
        <span>
          {progresso.melhor === null ? "Sem resultado valendo desde a meta" : `Seu melhor: ${progresso.melhor} de ${meta.alvo} ${unidade}`}
        </span>
        <span className={progresso.situacao === "atingida" ? "font-semibold text-success-fg" : ""}>
          {progresso.situacao === "andamento" ? `até ${dataBR(meta.prazo)}` : ROTULO_DA_SITUACAO[progresso.situacao]}
        </span>
      </p>
    </div>
  );
}

/**
 * A meta pessoal (Fase 2, 11/11/2026, pedido do Kauan): a pessoa escolhe o
 * teste, o nível, o alvo e o prazo; o progresso é o melhor resultado valendo
 * desde que a meta foi definida. Só ela vê.
 */
export function MetaPessoal({ meta, hoje, podeGravar }: { meta: MetaNaTela | null; hoje: string; podeGravar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [teste, setTeste] = useState<Teste>(meta?.teste ?? "digitacao");
  const [nivel, setNivel] = useState<string>(meta?.nivel ?? "");
  const [alvo, setAlvo] = useState(String(meta?.alvo ?? ""));
  const [prazo, setPrazo] = useState(meta?.prazo ?? "");
  const [erro, setErro] = useState("");
  const [gravando, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    iniciar(async () => {
      const r = await gravarMetaAction({ teste, nivel: ehNivel(nivel) ? nivel : null, alvo, prazo });
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      toast.success("Meta salva. O progresso conta a partir de agora.");
      setEditando(false);
      router.refresh();
    });
  }

  function tirar() {
    iniciar(async () => {
      const r = await tirarMetaAction();
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success("Meta tirada.");
      setEditando(false);
      router.refresh();
    });
  }

  const tituloId = "meta-pessoal-titulo";
  return (
    <Card as="section" aria-labelledby={tituloId} className="flex flex-col gap-3 p-4">
      <h2 id={tituloId} className="flex items-center gap-2 text-body font-semibold text-fg">
        <Target size={16} aria-hidden className="text-brand" /> Sua meta
      </h2>

      {!editando && meta && (
        <>
          <p className="text-ui font-medium text-fg">{meta.texto}</p>
          <BarraDaMeta meta={meta} />
        </>
      )}
      {!editando && !meta && (
        <p className="text-ui text-fg-secondary">Escolha um alvo e um prazo, como 60 PPM na digitação até o fim do mês. Só você vê a sua meta.</p>
      )}

      {editando ? (
        <form onSubmit={salvar} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoForm label="Teste" htmlFor="meta-teste">
              <Select id="meta-teste" value={teste} onChange={(e) => {
                  if (ehTeste(e.target.value)) setTeste(e.target.value);
                }} className="w-full">
                {TESTES.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_DO_TESTE[t]}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Nível" htmlFor="meta-nivel">
              <Select id="meta-nivel" value={nivel} onChange={(e) => setNivel(e.target.value)} className="w-full">
                <option value="">Qualquer nível</option>
                {NIVEIS.map((n) => (
                  <option key={n} value={n}>
                    {ROTULO_DO_NIVEL[n]}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label={`Alvo (${UNIDADE_DA_META[teste]})`} htmlFor="meta-alvo" helper={`De 1 a ${ALVO_MAXIMO[teste]}.`}>
              <CampoNumero id="meta-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)} min={1} max={ALVO_MAXIMO[teste]} suffix={UNIDADE_DA_META[teste]} required />
            </CampoForm>
            <CampoForm label="Prazo" htmlFor="meta-prazo">
              <CampoData id="meta-prazo" value={prazo} onChange={setPrazo} min={hoje} required />
            </CampoForm>
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={gravando} className="min-h-11 sm:min-h-0">Salvar a meta</Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)} className="min-h-11 sm:min-h-0">
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        podeGravar && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={meta ? "secondary" : "primary"} onClick={() => setEditando(true)} className="min-h-11 sm:min-h-0">
              {meta ? "Trocar a meta" : "Definir uma meta"}
            </Button>
            {meta && (
              <Button size="sm" variant="ghost" onClick={tirar} disabled={gravando} className="min-h-11 sm:min-h-0">
                Tirar a meta
              </Button>
            )}
          </div>
        )
      )}
    </Card>
  );
}
