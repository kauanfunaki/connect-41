"use client";

import { useState, useTransition } from "react";
import { LayoutList } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Aviso } from "@/components/ui/Aviso";
import { Badge } from "@/components/ui/Badge";
import { MODELOS, modeloDoCodigo, type CodigoDoModelo } from "@/lib/dre/estrutura";
import { preverTrocaDeModelo, trocarModeloDoDre, type PreviaDaTroca } from "@/app/(app)/dre/actions";

// O modelo do DRE da empresa (21/10/2026, pedido do Kauan): a visualização do
// DRE depende do cliente — o padrão, ou um customizado. O botão fica ao lado
// dos controles do topo e diz o modelo em uso; o painel lista os modelos,
// mostra o que a troca refaz antes de fazer e pede a confirmação. Trocar é da
// coordenação do setor; quem não pode vê o modelo e o porquê.

type Props = {
  companyId: string;
  modelo: CodigoDoModelo;
  podeTrocar: boolean;
};

export function SeletorDoModeloDoDre({ companyId, modelo, podeTrocar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<CodigoDoModelo>(modelo);
  const [previa, setPrevia] = useState<PreviaDaTroca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const atual = modeloDoCodigo(modelo);

  function fechar() {
    setAberto(false);
    setEscolhido(modelo);
    setPrevia(null);
    setErro(null);
  }

  function escolher(codigo: CodigoDoModelo) {
    setEscolhido(codigo);
    setPrevia(null);
    setErro(null);
    if (codigo === modelo || !podeTrocar) return;
    iniciar(async () => {
      const r = await preverTrocaDeModelo(companyId, codigo);
      if ("error" in r) setErro(r.error);
      else setPrevia(r.previa);
    });
  }

  function confirmar() {
    iniciar(async () => {
      const r = await trocarModeloDoDre(companyId, escolhido);
      if (r && "error" in r) {
        setErro(r.error);
        return;
      }
      setAberto(false);
      setPrevia(null);
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberto(true)} title={atual.descricao}>
        <LayoutList size={14} /> Modelo: {atual.codigo === "padrao" ? "Padrão" : "Customizado"}
      </Button>
      <SlideOver open={aberto} onClose={fechar} title="Modelo do DRE desta empresa" width="max-w-xl" fundo="leve">
        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          <p className="text-ui text-fg-secondary">
            A visualização do DRE depende do cliente. O modelo vale para esta empresa em todas as telas da DRE: o mês, o
            ano, a DRE econômica, as análises, o orçamento e a exportação.
          </p>

          <RadioGroup<CodigoDoModelo>
            legenda="Modelo"
            legendaOculta
            valor={escolhido}
            onChange={escolher}
            disabled={!podeTrocar || ocupado}
            opcoes={MODELOS.map((m) => ({
              valor: m.codigo,
              rotulo: (
                <span className="inline-flex items-center gap-2">
                  {m.nome}
                  {m.codigo === modelo && <Badge variant="info">Em uso</Badge>}
                </span>
              ),
              descricao: m.descricao,
            }))}
          />

          {!podeTrocar && (
            <Aviso tom="neutro">Só a coordenação do setor troca o modelo do DRE de uma empresa.</Aviso>
          )}

          {erro && <Aviso tom="perigo">{erro}</Aviso>}

          {podeTrocar && escolhido !== modelo && (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              {ocupado && !previa ? (
                <p className="text-ui text-fg-muted">Conferindo o que muda…</p>
              ) : previa ? (
                <ResumoDaTroca previa={previa} paraPorArea={escolhido === "por_area"} />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={confirmar} disabled={ocupado || !previa}>
                  Usar este modelo
                </Button>
                <Button variant="ghost" size="sm" onClick={fechar} disabled={ocupado}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </SlideOver>
    </>
  );
}

function ResumoDaTroca({ previa, paraPorArea }: { previa: PreviaDaTroca; paraPorArea: boolean }) {
  const f = previa.porFonte;
  const linhas = [
    { n: f.historico, texto: "pelo histórico de classificação (o que alguém escolheu na DRE ou no plano)" },
    { n: f.de_para, texto: "pelo nome, no de-para do Omie daquela época" },
    { n: f.plano, texto: "pelo nome, no plano padrão do escritório daquela época" },
    { n: f.unico, texto: "sem dúvida possível (receita, impostos, outras receitas)" },
    { n: f.mesmo_codigo, texto: "em outras despesas, onde já estavam (sem sinal de que eram investimento)" },
  ].filter((l) => l.n > 0);

  return (
    <div className="flex flex-col gap-2 text-ui text-fg">
      <p>
        De <strong>{previa.de}</strong> para <strong>{previa.para}</strong>.
      </p>
      {paraPorArea ? (
        <>
          <p className="text-fg-secondary">
            A classificação desta empresa é refeita nos grupos do modelo, categoria por categoria:
          </p>
          {linhas.length > 0 ? (
            <ul className="list-disc pl-5 text-fg-secondary">
              {linhas.map((l) => (
                <li key={l.texto}>
                  <strong className="text-fg">{l.n}</strong> {l.texto}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-secondary">Nenhuma categoria classificada para refazer.</p>
          )}
        </>
      ) : (
        <p className="text-fg-secondary">
          As categorias voltam aos grupos do padrão pelo de-para (CMV, mão de obra e comerciais viram custo operacional;
          pessoal, diretoria, administrativas e financeiras, custo administrativo; investimentos, outras despesas).
        </p>
      )}
      {previa.totalSemGrupo > 0 && (
        <Aviso tom="atencao">
          <span className="text-fg">
            <strong>{previa.totalSemGrupo}</strong> {previa.totalSemGrupo === 1 ? "categoria fica" : "categorias ficam"} sem
            grupo e {previa.totalSemGrupo === 1 ? "vai" : "vão"} para “Classificar”: {previa.semGrupo.join(", ")}
            {previa.totalSemGrupo > previa.semGrupo.length ? "…" : "."}
          </span>
        </Aviso>
      )}
      <p className="text-fg-muted text-fs-2">
        {previa.gravacoes === 0
          ? "Nada a gravar na classificação: só o modelo muda."
          : `${previa.gravacoes} ${previa.gravacoes === 1 ? "classificação é gravada" : "classificações são gravadas"} nesta empresa. O plano do escritório não muda.`}
      </p>
    </div>
  );
}
