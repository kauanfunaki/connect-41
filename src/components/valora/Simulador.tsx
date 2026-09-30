"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { salvarProposta } from "@/app/(app)/valora/actions";
import {
  calcular,
  perfilVazio,
  REGIMES,
  ROTULO_REGIME,
  type Catalogo,
  type ParametrosPreco,
  type Perfil,
  type Regime,
} from "@/lib/valora/motor";
import { brl, horas, num } from "@/lib/valora/formato";

/**
 * Preenchido com o cliente, na reunião: cada pergunta alimenta uma atividade do
 * catálogo, e o preço muda na hora. O cálculo roda aqui para responder rápido e é
 * refeito no servidor ao salvar — a proposta guardada é a do servidor.
 */
export function Simulador({
  catalogo,
  parametros,
  podeSalvar,
}: {
  catalogo: Catalogo;
  parametros: ParametrosPreco;
  podeSalvar: boolean;
}) {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>(() => perfilVazio(catalogo));
  const [cliente, setCliente] = useState("");
  const [oferecido, setOferecido] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const r = useMemo(() => calcular(catalogo, perfil, parametros), [catalogo, perfil, parametros]);

  const muda = (p: Partial<Perfil>) => setPerfil((atual) => ({ ...atual, ...p }));
  const alterna = (lista: string[], item: string, marcado: boolean) =>
    marcado ? [...new Set([...lista, item])] : lista.filter((x) => x !== item);

  const volumes = catalogo.campos.filter((c) => c.tipo === "volume");
  const marcadores = catalogo.campos.filter((c) => c.tipo === "marcador");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem] items-start">
      <div className="space-y-4">
        {/* Revisão de alinhamento (30/09): rótulos no `CampoForm`, campos no
            `FieldGrid` e as caixas de marcar em grade, com título — eram uma
            fileira corrida, com "Empresa sem movimento" no meio dos setores. */}
        <Card className="p-4">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Cliente</h2>
          <FieldGrid>
            <CampoForm label="Nome" htmlFor="simulacao-cliente">
              <Input
                id="simulacao-cliente"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                maxLength={160}
                placeholder="Razão social ou nome do prospect"
              />
            </CampoForm>
            <CampoForm label="Regime" htmlFor="simulacao-regime">
              <Select id="simulacao-regime" value={perfil.regime} onChange={(e) => muda({ regime: e.target.value as Regime })}>
                {REGIMES.map((x) => (
                  <option key={x} value={x}>
                    {ROTULO_REGIME[x]}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>
          <fieldset className="mt-4">
            <legend className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">Setores</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {catalogo.setores.map((s) => (
                <Checkbox
                  key={s.codigo}
                  label={s.nome}
                  checked={perfil.setores.includes(s.codigo)}
                  onChange={(e) => muda({ setores: alterna(perfil.setores, s.codigo, e.target.checked) })}
                />
              ))}
            </div>
          </fieldset>
          <div className="mt-4">
            <Checkbox label="Empresa sem movimento" checked={perfil.semMovimento} onChange={(e) => muda({ semMovimento: e.target.checked })} />
          </div>
        </Card>

        {/* Duas colunas, e não três: os rótulos vêm do catálogo e chegam a 40
            letras ("Alvarás e licenças que a empresa mantém"); em três colunas
            quebravam em duas linhas e desciam o campo em relação ao vizinho. */}
        <Card className="p-4">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Volumes</h2>
          <FieldGrid>
            {volumes.map((c) => (
              <CampoForm key={c.chave} label={c.rotulo} htmlFor={`simulacao-volume-${c.chave}`} helper={c.ajuda}>
                <Input
                  id={`simulacao-volume-${c.chave}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={perfil.volumes[c.chave] || ""}
                  placeholder="0"
                  onChange={(e) => muda({ volumes: { ...perfil.volumes, [c.chave]: Math.max(0, Number(e.target.value) || 0) } })}
                />
              </CampoForm>
            ))}
          </FieldGrid>
        </Card>

        <Card className="p-4">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Operação</h2>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {marcadores.map((c) => (
              <div key={c.chave} className="min-w-0">
                <Checkbox
                  label={c.rotulo}
                  checked={!!perfil.marcadores[c.chave]}
                  onChange={(e) => muda({ marcadores: { ...perfil.marcadores, [c.chave]: e.target.checked } })}
                />
                {c.ajuda && <span className="block pl-6 mt-0.5 text-[length:var(--fs-helper)] text-fg-muted">{c.ajuda}</span>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-[14px] font-semibold text-fg mb-1">Situações que dão mais trabalho</h2>
          <p className="text-[12px] text-fg-muted mb-4">O percentual é o que cada setor disse que a situação acrescenta ao tempo dele.</p>
          <div className="grid gap-5 md:grid-cols-2">
            {catalogo.setores.map((s) => {
              const doSetor = catalogo.complexidades.filter((c) => c.setor === s.codigo);
              if (doSetor.length === 0) return null;
              // Um grupo por setor, com o título no desenho de rótulo de campo;
              // as caixas uma embaixo da outra (a `Checkbox` com rótulo é
              // inline-flex, e sem `flex-col` duas curtas dividiam a linha).
              return (
                <fieldset key={s.codigo} className="min-w-0">
                  <legend className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">{s.nome}</legend>
                  <div className="flex flex-col items-start gap-2">
                    {doSetor.map((c) => (
                      <Checkbox
                        key={c.id}
                        label={
                          <>
                            {c.nome} <span className="text-fg-muted tabular-nums">+{c.pct}%</span>
                          </>
                        }
                        checked={perfil.complexidades.includes(c.id)}
                        onChange={(e) => muda({ complexidades: alterna(perfil.complexidades, c.id, e.target.checked) })}
                      />
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <details>
            <summary className="text-[14px] font-semibold text-fg cursor-pointer">Detalhamento por atividade</summary>
            {/* Casco padrão dentro do cartão (30/09); a atividade, texto
                corrido com o código na frente, fica à esquerda. */}
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border mt-3">
              <table className="w-full min-w-[560px] text-[12px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-3">Atividade</th>
                    <th className="px-3">Vezes/mês</th>
                    <th className="px-3">Min por vez</th>
                    <th className="px-3">Min/mês</th>
                  </tr>
                </thead>
                <tbody>
                  {r.setores.flatMap((s) =>
                    s.atividades.map((a) => (
                      <tr key={`${s.codigo}-${a.id}`} className="border-b border-border">
                        <td className="px-3">
                          <span className="block text-left">
                            <span className="text-fg-muted tabular-nums mr-2">{a.id}</span>
                            {a.nome}
                          </span>
                        </td>
                        <td className="px-3 tabular-nums">{num(a.vezesMes, 2)}</td>
                        <td className="px-3 tabular-nums">{num(a.minutosExecucao)}</td>
                        <td className="px-3 tabular-nums">{num(a.minutosMes)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-fg-muted mt-2">
              Minutos já ajustados pela capacidade de cada equipe. A complexidade entra depois, no total do setor.
            </p>
          </details>
        </Card>
      </div>

      <Card className="p-4 lg:sticky lg:top-4 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Honorário mensal</p>
          <p className="text-[28px] font-semibold tabular-nums leading-tight">{brl(r.mensal.alvo)}</p>
          <p className="text-[12px] text-fg-muted">alvo, com {parametros.margemAlvoPct}% de margem</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
          <div>
            <dt className="text-fg-muted">Piso</dt>
            <dd className="font-medium tabular-nums">{brl(r.mensal.piso)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Tabela</dt>
            <dd className="font-medium tabular-nums">{brl(r.mensal.tabela)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Custo</dt>
            <dd className="font-medium tabular-nums">{brl(r.mensal.custo)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Horas/mês</dt>
            <dd className="font-medium tabular-nums">{horas(r.horasMes)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-fg-muted">Implantação (uma vez)</dt>
            <dd className="font-medium tabular-nums">{brl(r.implantacao.alvo)}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-fg-muted">
          Tabela é o preço de partida: dá {parametros.descontoMaximoPct}% de desconto e ainda chega ao alvo. Abaixo do piso,
          a {parametros.margemPisoPct > 0 ? `margem fica menor que ${parametros.margemPisoPct}%` : "empresa paga para atender"}.
        </p>

        {r.avulsos.length > 0 && (
          <div className="border-t border-border-soft pt-3">
            <p className="text-[11px] uppercase tracking-wide text-fg-muted mb-1.5">Avulsos (por processo, fora da mensalidade)</p>
            <div className="space-y-1 text-[12px]">
              {r.avulsos.map((a) => (
                <div key={a.id} className="flex justify-between gap-2">
                  <span className="min-w-0">{a.nome}</span>
                  <span className="tabular-nums text-fg-secondary shrink-0">{brl(a.precos.alvo)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border-soft pt-3 space-y-1.5 text-[12px]">
          {r.setores.map((s) => (
            <div key={s.codigo} className="flex justify-between gap-2">
              <span>
                {s.nome}
                {s.complexidadePct > 0 && <span className="text-fg-muted"> +{s.complexidadePct}%</span>}
              </span>
              <span className="tabular-nums text-fg-secondary">
                {horas(s.minutosMes / 60)} · {brl(s.custo)}
              </span>
            </div>
          ))}
        </div>

        {r.avisos.length > 0 && (
          <ul className="text-[11px] text-warning space-y-1 list-disc pl-4">
            {r.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}

        {podeSalvar && (
          <form
            className="border-t border-border-soft pt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setErro(null);
              startTransition(async () => {
                const res = await salvarProposta({ cliente, perfil, precoOferecido: oferecido });
                if ("error" in res) setErro(res.error);
                else router.push("/valora");
              });
            }}
          >
            <CampoForm label="Preço oferecido (opcional)" htmlFor="simulacao-oferecido">
              <Input
                id="simulacao-oferecido"
                prefix="R$"
                inputMode="decimal"
                value={oferecido}
                onChange={(e) => setOferecido(e.target.value)}
                placeholder="0,00"
              />
            </CampoForm>
            {/* 36px, a altura do campo logo acima (era `sm`, de barra de ferramentas). */}
            <Button type="submit" loading={pendente} disabled={pendente} className="w-full">
              <Save size={14} /> Salvar proposta
            </Button>
            {erro && <p className="text-[12px] text-danger">{erro}</p>}
          </form>
        )}
      </Card>
    </div>
  );
}
