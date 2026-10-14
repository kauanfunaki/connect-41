"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, FileText, PartyPopper, Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { UFS } from "@/lib/ufs";
import { MAX_MB_DO_CURRICULO } from "@/lib/curriculo";
import {
  CANDIDATURA_VAZIA,
  DISPONIBILIDADES,
  PASSOS_DA_CANDIDATURA,
  camposParaEnvio,
  primeiroPassoComErro,
  problemaNoCurriculo,
  tamanhoLegivel,
  validarPasso,
  type DadosDaCandidatura,
  type ErrosDaCandidatura,
} from "@/lib/carreiras/candidatura";

type Props = {
  slug: string;
  vagaId: string;
  /** Carimbo de tempo assinado pelo servidor ao montar a página — ver `src/lib/carreiras/antiRobo.ts`. */
  carimbo: string;
  tituloDaVaga: string;
  empresa: string;
  /** Quem conduz o processo ("41 Tallent"). */
  conduzidoPor: string;
  contaHref: string;
  /** O resumo do portal (`/privacidade`). */
  privacidadeHref: string;
  /** A política de privacidade oficial da 41 Tallent. */
  politicaHref: string;
  vagasHref: string;
};

/**
 * A candidatura em passos (15/10/2026): Seus dados → Currículo → Perguntas →
 * Revisão. Cada passo confere o que tem antes de seguir, em português, com as
 * mesmas regras da rota. O envio é o MESMO de antes: um POST multipart para
 * `/api/carreiras/apply` com os mesmos campos — inclusive o campo-armadilha
 * (`website`) e o carimbo de tempo, que são a defesa contra robô.
 *
 * Os passos ficam todos no formulário (os de fora só escondidos): o
 * campo-armadilha e os seletores vão no envio como sempre foram.
 */
export function CandidaturaEmPassos({ slug, vagaId, carimbo, tituloDaVaga, empresa, conduzidoPor, contaHref, privacidadeHref, politicaHref, vagasHref }: Props) {
  const [passo, setPasso] = useState(0);
  const [dados, setDados] = useState<DadosDaCandidatura>(CANDIDATURA_VAZIA);
  const [erros, setErros] = useState<ErrosDaCandidatura>({});
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroDoEnvio, setErroDoEnvio] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const tituloDoPasso = useRef<HTMLHeadingElement>(null);
  const campoDoArquivo = useRef<HTMLInputElement>(null);

  const chave = PASSOS_DA_CANDIDATURA[passo]!.chave;

  function mudar<K extends keyof DadosDaCandidatura>(k: K, v: DadosDaCandidatura[K]) {
    setDados((d) => ({ ...d, [k]: v }));
    if (erros[k]) setErros((e) => ({ ...e, [k]: undefined }));
  }

  function irPara(n: number) {
    setPasso(n);
    setErroDoEnvio(null);
    // Depois de desenhar o passo novo: o título dele recebe o foco (o leitor
    // de tela anuncia onde a pessoa está) e o topo do formulário aparece.
    requestAnimationFrame(() => {
      tituloDoPasso.current?.focus({ preventScroll: true });
      document.getElementById("candidatura")?.scrollIntoView({ block: "start" });
    });
  }

  function focarPrimeiroErro(e: ErrosDaCandidatura) {
    const primeiro = Object.keys(e)[0];
    if (!primeiro) return;
    requestAnimationFrame(() => {
      const alvo = primeiro === "resume" ? campoDoArquivo.current : document.getElementById(`cand-${primeiro}`);
      alvo?.focus();
    });
  }

  function continuar() {
    const e = validarPasso(chave, dados);
    if (Object.keys(e).length > 0) {
      setErros(e);
      focarPrimeiroErro(e);
      return;
    }
    irPara(passo + 1);
  }

  function escolherArquivo(f: File | null) {
    if (!f) return;
    const info = { nome: f.name, tipo: f.type, bytes: f.size };
    const problema = problemaNoCurriculo(info);
    if (problema) {
      setErros((e) => ({ ...e, resume: problema }));
      if (campoDoArquivo.current) campoDoArquivo.current.value = "";
      return;
    }
    setArquivo(f);
    mudar("resume", info);
  }

  function tirarArquivo() {
    setArquivo(null);
    mudar("resume", null);
    if (campoDoArquivo.current) campoDoArquivo.current.value = "";
  }

  async function enviar() {
    const voltarPara = primeiroPassoComErro(dados);
    if (voltarPara) {
      const n = PASSOS_DA_CANDIDATURA.findIndex((p) => p.chave === voltarPara);
      const e = validarPasso(voltarPara, dados);
      setErros(e);
      if (n !== passo) irPara(n);
      focarPrimeiroErro(e);
      return;
    }
    if (!formulario.current) return;

    setEnviando(true);
    setErroDoEnvio(null);
    // O formulário inteiro (com o campo-armadilha e os seletores), e por cima
    // os valores já conferidos e no formato que a rota lê.
    const form = new FormData(formulario.current);
    for (const [k, v] of Object.entries(camposParaEnvio(dados))) form.set(k, v);
    form.delete("resume");
    if (arquivo) form.set("resume", arquivo);
    form.set("slug", slug);
    form.set("vagaId", vagaId);
    form.set("carimbo", carimbo);

    try {
      const res = await fetch("/api/carreiras/apply", { method: "POST", body: form });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroDoEnvio(corpo.error ?? "Não foi possível enviar a candidatura. Tente novamente.");
        return;
      }
      setEnviada(true);
      requestAnimationFrame(() => document.getElementById("candidatura")?.scrollIntoView({ block: "start" }));
    } catch {
      setErroDoEnvio("Não foi possível enviar. Confira sua conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviada) {
    return (
      <div className="t41-sucesso" role="status">
        <span className="t41-sucesso__marca">
          <PartyPopper size={28} aria-hidden="true" />
        </span>
        <h2>Candidatura enviada!</h2>
        <p style={{ marginTop: 8, color: "var(--t41-suave)" }}>
          Recebemos sua candidatura para <strong style={{ color: "var(--t41-tinta)" }}>{tituloDaVaga}</strong> ({empresa}).
        </p>
        <ol>
          <li>
            <strong>A equipe da {conduzidoPor} analisa as candidaturas</strong>
            Seus dados e o currículo chegam direto a quem conduz o processo.
          </li>
          <li>
            <strong>Se o seu perfil avançar, entramos em contato</strong>
            Pelo e-mail ou telefone que você informou.
          </li>
          <li>
            <strong>Acompanhe quando quiser</strong>
            Peça um link de acesso com o e-mail da inscrição e veja a etapa de cada candidatura.
          </li>
        </ol>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
          <Link href={contaHref} className="t41-botao t41-botao--primario">
            Acompanhar minhas candidaturas
          </Link>
          <Link href={vagasHref} className="t41-botao t41-botao--contorno">
            Ver outras vagas
          </Link>
        </div>
      </div>
    );
  }

  const erro = (k: keyof DadosDaCandidatura): ReactNode =>
    erros[k] ? (
      <p id={`cand-${k}-erro`} className="t41-campo__erro">
        <CircleAlert size={16} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
        {erros[k]}
      </p>
    ) : null;
  const marcar = (k: keyof DadosDaCandidatura) => ({
    "aria-invalid": erros[k] ? true : undefined,
    "aria-describedby": erros[k] ? `cand-${k}-erro` : undefined,
  });

  return (
    <>
      <div className="t41-candidatura__topo">
        <p className="t41-selo t41-selo--lilas">Candidatura</p>
        <h2>Candidate-se a esta vaga</h2>
        <p>Quatro passos rápidos. Sem criar conta nem senha.</p>
        <ol className="t41-passador" aria-label="Passos da candidatura">
          {PASSOS_DA_CANDIDATURA.map((p, i) => (
            <li key={p.chave} data-estado={i < passo ? "feito" : i === passo ? "atual" : "futuro"} aria-current={i === passo ? "step" : undefined}>
              <span className="t41-passador__barra" aria-hidden="true" />
              <span className="t41-passador__rotulo">
                <span className="t41-passador__n">{i < passo ? <Check size={14} aria-label="feito" /> : `${i + 1}.`}</span>
                <span className="t41-passador__texto">{p.rotulo}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <form
        ref={formulario}
        className="t41-candidatura__corpo"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (passo < PASSOS_DA_CANDIDATURA.length - 1) continuar();
          else void enviar();
        }}
      >
        {/* 1. Seus dados */}
        <fieldset hidden={chave !== "dados"}>
          <legend className="t41-sr">Passo 1 de 4: seus dados</legend>
          {chave === "dados" && (
            <h3 ref={tituloDoPasso} tabIndex={-1} className="t41-passo-titulo">
              Seus dados
            </h3>
          )}
          <p className="t41-passo-ajuda">É por eles que a equipe entra em contato. Campos com * são obrigatórios.</p>
          <div className="t41-campos t41-campos--duas">
            <div className="t41-campo t41-campo--inteiro">
              <label htmlFor="cand-name" className="t41-campo__rotulo">
                Nome completo *
              </label>
              <Input id="cand-name" name="name" autoComplete="name" maxLength={120} value={dados.name} onChange={(e) => mudar("name", e.target.value)} className="t41-entrada" {...marcar("name")} />
              {erro("name")}
            </div>
            <div className="t41-campo">
              <label htmlFor="cand-email" className="t41-campo__rotulo">
                E-mail *
              </label>
              <Input
                id="cand-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={120}
                value={dados.email}
                onChange={(e) => mudar("email", e.target.value)}
                className="t41-entrada"
                {...marcar("email")}
              />
              {erro("email")}
            </div>
            <div className="t41-campo">
              <label htmlFor="cand-phone" className="t41-campo__rotulo">
                Telefone / WhatsApp <span>(opcional)</span>
              </label>
              <Input
                id="cand-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={30}
                placeholder="(41) 99999-0000"
                value={dados.phone}
                onChange={(e) => mudar("phone", e.target.value)}
                className="t41-entrada"
                {...marcar("phone")}
              />
              {erro("phone")}
            </div>
            <div className="t41-campo">
              <label htmlFor="cand-city" className="t41-campo__rotulo">
                Cidade <span>(opcional)</span>
              </label>
              <Input id="cand-city" name="city" autoComplete="address-level2" maxLength={80} value={dados.city} onChange={(e) => mudar("city", e.target.value)} className="t41-entrada" {...marcar("city")} />
              {erro("city")}
            </div>
            <div className="t41-campo">
              <label htmlFor="cand-stateCode" className="t41-campo__rotulo">
                Estado <span>(opcional)</span>
              </label>
              <Select id="cand-stateCode" name="stateCode" value={dados.stateCode} onChange={(e) => mudar("stateCode", e.target.value)} className="t41-entrada" {...marcar("stateCode")}>
                <option value="">Selecione</option>
                {UFS.map((uf) => (
                  <option key={uf.value} value={uf.value}>
                    {uf.label}
                  </option>
                ))}
              </Select>
              {erro("stateCode")}
            </div>
          </div>
        </fieldset>

        {/* 2. Currículo */}
        <fieldset hidden={chave !== "curriculo"}>
          <legend className="t41-sr">Passo 2 de 4: currículo</legend>
          {chave === "curriculo" && (
            <h3 ref={tituloDoPasso} tabIndex={-1} className="t41-passo-titulo">
              Currículo
            </h3>
          )}
          <p className="t41-passo-ajuda">Opcional. Com ele, a equipe conhece melhor a sua experiência. Só PDF, de até {MAX_MB_DO_CURRICULO} MB.</p>
          <div className="t41-campos">
            <div
              className="t41-soltar"
              data-arrastando={arrastando ? "true" : undefined}
              hidden={!!arquivo}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                escolherArquivo(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <input
                ref={campoDoArquivo}
                id="cand-resume"
                type="file"
                accept="application/pdf,.pdf"
                aria-label={`Escolher o currículo em PDF, de até ${MAX_MB_DO_CURRICULO} MB`}
                aria-describedby={erros.resume ? "cand-resume-erro" : undefined}
                onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              />
              <span className="t41-soltar__icone" aria-hidden="true">
                <Upload size={24} />
              </span>
              <strong aria-hidden="true">Escolha o PDF do currículo</strong>
              <span aria-hidden="true">ou arraste o arquivo para cá · até {MAX_MB_DO_CURRICULO} MB</span>
            </div>
            {arquivo && (
              <div className="t41-arquivo">
                <span className="t41-fato__icone" aria-hidden="true">
                  <FileText size={20} />
                </span>
                <span className="t41-arquivo__nome">
                  <strong>{arquivo.name}</strong>
                  <span className="t41-num">PDF · {tamanhoLegivel(arquivo.size)}</span>
                </span>
                <button type="button" className="t41-botao t41-botao--fantasma t41-botao--pequeno" onClick={() => campoDoArquivo.current?.click()}>
                  Trocar
                </button>
                <button type="button" className="t41-botao t41-botao--fantasma t41-botao--pequeno" onClick={tirarArquivo} aria-label="Tirar o currículo">
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            )}
            {erro("resume")}
          </div>
        </fieldset>

        {/* 3. Perguntas — as mesmas três do WhatsApp do Recrutamento. */}
        <fieldset hidden={chave !== "perguntas"}>
          <legend className="t41-sr">Passo 3 de 4: perguntas da vaga</legend>
          {chave === "perguntas" && (
            <h3 ref={tituloDoPasso} tabIndex={-1} className="t41-passo-titulo">
              Algumas perguntas rápidas
            </h3>
          )}
          <p className="t41-passo-ajuda">Respondidas aqui, ninguém pergunta de novo depois.</p>
          <div className="t41-campos t41-campos--duas">
            <div className="t41-campo">
              <label htmlFor="cand-pretensaoSalarial" className="t41-campo__rotulo">
                Pretensão salarial (por mês) *
              </label>
              <Input
                id="cand-pretensaoSalarial"
                name="pretensaoSalarial"
                inputMode="decimal"
                prefix="R$"
                placeholder="3.500,00"
                maxLength={14}
                value={dados.pretensaoSalarial}
                onChange={(e) => mudar("pretensaoSalarial", e.target.value)}
                className="t41-entrada"
                {...marcar("pretensaoSalarial")}
              />
              {erro("pretensaoSalarial")}
            </div>
            <div className="t41-campo">
              <label htmlFor="cand-disponibilidade" className="t41-campo__rotulo">
                Quando pode começar? *
              </label>
              <Select
                id="cand-disponibilidade"
                name="disponibilidade"
                value={dados.disponibilidade}
                onChange={(e) => mudar("disponibilidade", e.target.value)}
                className="t41-entrada"
                {...marcar("disponibilidade")}
              >
                <option value="">Selecione</option>
                {DISPONIBILIDADES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              {erro("disponibilidade")}
            </div>
            <div className="t41-campo t41-campo--inteiro">
              <label htmlFor="cand-deslocamentoMinutos" className="t41-campo__rotulo">
                Quanto tempo você levaria até o local de trabalho? <span>(opcional)</span>
              </label>
              <div style={{ maxWidth: 280 }}>
              <Input
                id="cand-deslocamentoMinutos"
                name="deslocamentoMinutos"
                inputMode="numeric"
                suffix="minutos"
                placeholder="Ex.: 30"
                maxLength={3}
                value={dados.deslocamentoMinutos}
                onChange={(e) => mudar("deslocamentoMinutos", e.target.value.replace(/[^\d]/g, ""))}
                className="t41-entrada"
                {...marcar("deslocamentoMinutos")}
              />
              </div>
              <p className="t41-campo__ajuda">Só o tempo, em minutos — não pedimos endereço.</p>
              {erro("deslocamentoMinutos")}
            </div>
          </div>
        </fieldset>

        {/* 4. Revisão */}
        <fieldset hidden={chave !== "revisao"}>
          <legend className="t41-sr">Passo 4 de 4: revisão e envio</legend>
          {chave === "revisao" && (
            <h3 ref={tituloDoPasso} tabIndex={-1} className="t41-passo-titulo">
              Confira e envie
            </h3>
          )}
          <p className="t41-passo-ajuda">Veja se está tudo certo. Dá para voltar e corrigir qualquer passo.</p>
          <div className="t41-revisao">
            <Resumo titulo="Seus dados" editar={() => irPara(0)}>
              <dt>Nome</dt>
              <dd>{dados.name || "—"}</dd>
              <dt>E-mail</dt>
              <dd>{dados.email || "—"}</dd>
              {dados.phone && (
                <>
                  <dt>Telefone</dt>
                  <dd>{dados.phone}</dd>
                </>
              )}
              {(dados.city || dados.stateCode) && (
                <>
                  <dt>Cidade</dt>
                  <dd>{[dados.city, dados.stateCode].filter(Boolean).join(" – ")}</dd>
                </>
              )}
            </Resumo>
            <Resumo titulo="Currículo" editar={() => irPara(1)}>
              <dt>Arquivo</dt>
              <dd>{arquivo ? `${arquivo.name} (${tamanhoLegivel(arquivo.size)})` : "Sem currículo"}</dd>
            </Resumo>
            <Resumo titulo="Perguntas" editar={() => irPara(2)}>
              <dt>Pretensão</dt>
              <dd className="t41-num">{dados.pretensaoSalarial ? `R$ ${dados.pretensaoSalarial} por mês` : "—"}</dd>
              <dt>Começa</dt>
              <dd>{dados.disponibilidade || "—"}</dd>
              {dados.deslocamentoMinutos && (
                <>
                  <dt>Até o local</dt>
                  <dd className="t41-num">{dados.deslocamentoMinutos} minutos</dd>
                </>
              )}
            </Resumo>
          </div>

          <label htmlFor="cand-consent" className="t41-consentimento">
            <Checkbox
              id="cand-consent"
              name="consent"
              value="true"
              checked={dados.consent}
              onChange={(e) => mudar("consent", e.target.checked)}
              aria-describedby={erros.consent ? "cand-consent-erro" : undefined}
            />
            <span>
              Autorizo o uso dos meus dados pessoais para participação neste processo seletivo (LGPD).{" "}
              <a href={politicaHref} target="_blank" rel="noopener" className="t41-link">
                Ler a política de privacidade
              </a>{" "}
              ·{" "}
              <Link href={privacidadeHref} target="_blank" rel="noopener" className="t41-link">
                o resumo
              </Link>
            </span>
          </label>
          {erro("consent")}
        </fieldset>

        {/* Campo-armadilha: invisível para quem usa o formulário, preenchido por
            robô que completa todo campo que acha. Fora da tela em vez de
            `display: none`, que parte dos robôs sabe ignorar; fora da ordem de
            tabulação e escondido do leitor de tela. Igual ao formulário de antes. */}
        <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="website">Site</label>
          <Input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div aria-live="assertive">
          {erroDoEnvio && (
            <p className="t41-alerta" role="alert">
              <CircleAlert size={18} aria-hidden="true" style={{ flex: "none", marginTop: 2 }} />
              {erroDoEnvio}
            </p>
          )}
        </div>

        <div className="t41-navegacao">
          {passo > 0 ? (
            <button type="button" className="t41-botao t41-botao--fantasma" onClick={() => irPara(passo - 1)}>
              <ArrowLeft size={17} aria-hidden="true" /> Voltar
            </button>
          ) : (
            <span />
          )}
          {passo < PASSOS_DA_CANDIDATURA.length - 1 ? (
            <button type="submit" className="t41-botao t41-botao--primario">
              Continuar <ArrowRight size={17} aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" className="t41-botao t41-botao--primario" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar candidatura"}
              {!enviando && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          )}
        </div>
      </form>
    </>
  );
}

function Resumo({ titulo, editar, children }: { titulo: string; editar: () => void; children: ReactNode }) {
  return (
    <div className="t41-revisao__grupo">
      <div className="t41-revisao__topo">
        <h4>{titulo}</h4>
        <button type="button" className="t41-botao t41-botao--fantasma t41-botao--pequeno" onClick={editar}>
          Editar <span className="t41-sr">{titulo.toLowerCase()}</span>
        </button>
      </div>
      <dl>{children}</dl>
    </div>
  );
}
