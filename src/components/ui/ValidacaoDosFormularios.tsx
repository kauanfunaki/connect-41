"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle } from "lucide-react";
import {
  alvoDoCampo,
  ancoraVisivel,
  ehCampoDeTexto,
  emValidacaoSilenciosa,
  instalarValidacaoSilenciosa,
  mensagemDoCampo,
  posicaoDoBalao,
} from "@/components/ui/validacaoDoCampo";

type CampoDeFormulario = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Aviso = { campo: CampoDeFormulario; alvo: HTMLElement; mensagem: string };

function ehCampoDeFormulario(el: EventTarget | null): el is CampoDeFormulario {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

/**
 * Validação dos formulários no visual do Connect (08/10/2026), montada uma vez
 * no layout raiz — cobre equipe, portal e telas públicas.
 *
 * O navegador valida (`required`, `type="email"`, `minLength`,
 * `setCustomValidity`…) e avisa com o evento `invalid`; aqui ele é cancelado
 * (some o balão "Preencha este campo" do Chrome), o foco vai ao primeiro campo
 * inválido — ao gatilho, no caso do `Select`, pelo `data-c41-foco` — e a
 * mensagem aparece num balão próprio junto do campo, que some ao corrigir, ao
 * sair do campo, com Esc ou ao clicar em outro lugar.
 *
 * Fica de fora: formulário com `noValidate` (tem validação própria —
 * EmpresaForm, PessoaForm, a ficha do portal) e o `checkValidity()`, que só
 * pergunta. O `reportValidity()` (NovoComunicadoForm) mostra o balão, como
 * mostrava o do navegador.
 */
export function ValidacaoDosFormularios() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const balaoRef = useRef<HTMLDivElement>(null);
  const setaRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    instalarValidacaoSilenciosa();
    // O envio dispara `invalid` em todos os campos inválidos, em ordem, na
    // mesma tarefa: o primeiro ganha o balão, os outros só são cancelados.
    let jaTratado = false;
    function invalido(e: Event) {
      const campo = e.target;
      if (!ehCampoDeFormulario(campo) || emValidacaoSilenciosa() || campo.form?.noValidate) return;
      e.preventDefault();
      if (jaTratado) return;
      jaTratado = true;
      setTimeout(() => {
        jaTratado = false;
      }, 0);
      const alvo = alvoDoCampo<HTMLElement>(campo, (id) => document.getElementById(id));
      alvo.focus();
      setAviso({ campo, alvo, mensagem: mensagemDoCampo(campo) });
    }
    document.addEventListener("invalid", invalido, true);
    return () => document.removeEventListener("invalid", invalido, true);
  }, []);

  const campo = aviso?.campo;
  const alvo = aviso?.alvo;

  // Some ao corrigir (ou troca a mensagem, se o erro mudou: o e-mail que
  // deixou de estar vazio mas ainda não é e-mail), ao sair do campo, com Esc,
  // a qualquer clique e no `reset`.
  useEffect(() => {
    if (!campo || !alvo) return;
    const fechar = () => setAviso(null);
    function mudou() {
      if (campo!.validity.valid) fechar();
      else setAviso((a) => (a ? { ...a, mensagem: mensagemDoCampo(campo!) } : a));
    }
    // Fora de um campo de texto (o gatilho do Select, a caixa de marcar),
    // qualquer tecla é a pessoa mexendo nele — o painel do Select, aberto
    // pelo teclado, não pode ficar embaixo do balão.
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" || !ehCampoDeTexto(alvo!)) fechar();
    }
    const form = campo.form;
    campo.addEventListener("input", mudou);
    campo.addEventListener("change", mudou);
    alvo.addEventListener("blur", fechar);
    alvo.addEventListener("keydown", tecla);
    document.addEventListener("mousedown", fechar, true);
    form?.addEventListener("reset", fechar);
    return () => {
      campo.removeEventListener("input", mudou);
      campo.removeEventListener("change", mudou);
      alvo.removeEventListener("blur", fechar);
      alvo.removeEventListener("keydown", tecla);
      document.removeEventListener("mousedown", fechar, true);
      form?.removeEventListener("reset", fechar);
    };
  }, [campo, alvo]);

  // Acompanha o campo a cada quadro (rolagem, layout que mexe, modal que
  // anima) escrevendo direto no estilo, sem redesenhar o React. Campo que
  // saiu da tela (troca de página) leva o balão junto.
  useLayoutEffect(() => {
    if (!alvo) return;
    function posicionar(): boolean {
      const balao = balaoRef.current;
      const seta = setaRef.current;
      if (!alvo!.isConnected || !balao || !seta) return false;
      const r = ancoraVisivel<HTMLElement>(alvo!).getBoundingClientRect();
      const p = posicaoDoBalao(
        r,
        { largura: balao.offsetWidth, altura: balao.offsetHeight },
        { largura: window.innerWidth, altura: window.innerHeight }
      );
      balao.style.top = `${p.top}px`;
      balao.style.left = `${p.left}px`;
      balao.style.transformOrigin = p.emCima ? "bottom left" : "top left";
      seta.style.left = `${p.seta - 5}px`;
      seta.dataset.lado = p.emCima ? "cima" : "baixo";
      return true;
    }
    let quadro = 0;
    function acompanhar() {
      if (posicionar()) quadro = requestAnimationFrame(acompanhar);
      else setAviso(null);
    }
    posicionar();
    quadro = requestAnimationFrame(acompanhar);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);

  if (!aviso) return null;

  // `z-[55]`: acima do modal (z-50), abaixo do painel do Select (z-[60]).
  return createPortal(
    <div
      ref={balaoRef}
      role="alert"
      data-c41-aviso-do-campo=""
      style={{ top: -9999, left: -9999 }}
      className="c41-surgir pointer-events-none fixed z-[55] flex max-w-[min(20rem,calc(100vw-1rem))] items-start gap-2 rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-ui text-fg shadow-lg"
    >
      <span
        ref={setaRef}
        aria-hidden
        className="absolute size-2.5 rotate-45 border-border-strong bg-surface-elevated data-[lado=baixo]:-top-[5.5px] data-[lado=baixo]:border-l data-[lado=baixo]:border-t data-[lado=cima]:-bottom-[5.5px] data-[lado=cima]:border-r data-[lado=cima]:border-b"
      />
      <AlertCircle size={15} aria-hidden className="mt-px flex-shrink-0 text-danger" />
      <span>{aviso.mensagem}</span>
    </div>,
    document.body
  );
}
