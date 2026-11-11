"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Switch } from "@/components/ui/Switch";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, Cartao, TabelaNoDesktop } from "@/components/shared/ListaResponsiva";
import { useToast } from "@/components/ui/Toast";
import { salvarTextoAction } from "@/app/(app)/academia/actions";
import { NIVEIS, ROTULO_DO_NIVEL, type Nivel } from "@/lib/academia/regras";
import type { TextoNaTela } from "@/lib/academia/tipos";

type Rascunho = { id?: string; nivel: Nivel; conteudo: string; ativo: boolean };
const NOVO: Rascunho = { nivel: "medio", conteudo: "", ativo: true };
const LIMITE = { minimo: 40, maximo: 1500 };

/**
 * Os textos da digitação (10/11/2026): nível, o texto e se está ativo. Não se
 * exclui texto — desliga (o histórico de quem já digitou fica de pé). O texto
 * tem de caber em 60 s para quem digita bem: a precisão do Hub desconta o que
 * ficou sem digitar.
 */
export function TextosDaAcademia({ textos }: { textos: TextoNaTela[] }) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!rascunho) return;
    setErro("");
    iniciar(async () => {
      const r = await salvarTextoAction(rascunho);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      toast.success(rascunho.id ? "Texto atualizado." : "Texto cadastrado.");
      setRascunho(null);
      router.refresh();
    });
  }

  const tamanho = rascunho?.conteudo.trim().length ?? 0;
  const novo = (
    <Button size="sm" onClick={() => setRascunho(NOVO)} className="min-h-11 sm:min-h-0">
      <Plus size={14} aria-hidden /> Novo texto
    </Button>
  );

  return (
    <>
      {textos.length === 0 ? (
        <EmptyState icon={<FileText />} title="Nenhum texto ainda" description="Cadastre textos de cada nível para o teste de digitação. Os do 41 Hub entram pela importação." action={novo} />
      ) : (
        <CascoDaTabela contagem={contarItens(textos.length, "texto", "textos")} acoes={novo}>
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 w-28">Nível</th>
                  <th scope="col" className="py-2 pr-3">Texto</th>
                  <th scope="col" className="py-2 pr-3 w-28">Situação</th>
                  <th scope="col" className="py-2 pr-3 w-12"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {textos.map((t) => (
                  <tr key={t.id} className="border-b border-border-soft">
                    <td className="py-2.5 pr-3 text-ui">{ROTULO_DO_NIVEL[t.nivel]}</td>
                    <td className="py-2.5 pr-3 text-ui text-fg-secondary">
                      <span className="line-clamp-2">{t.conteudo}</span>
                      <span className="text-helper text-fg-muted">{t.conteudo.length} caracteres{t.doHub ? " · veio do 41 Hub" : ""}</span>
                    </td>
                    <td className="py-2.5 pr-3"><Selo tom={t.ativo ? "sucesso" : "neutro"}>{t.ativo ? "Ativo" : "Desligado"}</Selo></td>
                    <td className="py-2.5 pr-3 text-right">
                      <IconButton title="Editar texto" onClick={() => setRascunho({ id: t.id, nivel: t.nivel, conteudo: t.conteudo, ativo: t.ativo })}>
                        <Pencil size={14} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
          <CartoesNoCelular>
            {textos.map((t) => (
              <Cartao key={t.id}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui font-medium">{ROTULO_DO_NIVEL[t.nivel]}</span>
                  <Selo tom={t.ativo ? "sucesso" : "neutro"}>{t.ativo ? "Ativo" : "Desligado"}</Selo>
                </div>
                <p className="mt-1 line-clamp-3 text-ui text-fg-secondary">{t.conteudo}</p>
                <Button size="sm" variant="secondary" className="mt-2 min-h-11" onClick={() => setRascunho({ id: t.id, nivel: t.nivel, conteudo: t.conteudo, ativo: t.ativo })}>
                  <Pencil size={14} aria-hidden /> Editar
                </Button>
              </Cartao>
            ))}
          </CartoesNoCelular>
        </CascoDaTabela>
      )}

      <Modal open={rascunho !== null} onClose={() => setRascunho(null)} title={rascunho?.id ? "Editar texto" : "Novo texto"} maxWidth="max-w-2xl">
        {rascunho && (
          <form onSubmit={salvar} className="flex flex-col gap-4">
            <CampoForm label="Nível" htmlFor="texto-nivel" required>
              <Select id="texto-nivel" value={rascunho.nivel} onChange={(e) => setRascunho({ ...rascunho, nivel: e.target.value as Nivel })}>
                {NIVEIS.map((n) => (
                  <option key={n} value={n}>{ROTULO_DO_NIVEL[n]}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm
              label="Texto"
              htmlFor="texto-conteudo"
              required
              helper={`${tamanho} de até ${LIMITE.maximo} caracteres (mínimo ${LIMITE.minimo}). Para caber em 60 s: uns 200 no Fácil, 300 no Médio e 400 no Difícil.`}
            >
              <Textarea
                id="texto-conteudo"
                rows={7}
                value={rascunho.conteudo}
                maxLength={LIMITE.maximo}
                onChange={(e) => setRascunho({ ...rascunho, conteudo: e.target.value })}
              />
            </CampoForm>
            <Switch checked={rascunho.ativo} onCheckedChange={(ativo) => setRascunho({ ...rascunho, ativo })} rotulo="Ativo (entra no sorteio das rodadas)" />
            {erro && <Aviso>{erro}</Aviso>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRascunho(null)}>Cancelar</Button>
              <Button type="submit" loading={salvando}>Salvar</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
