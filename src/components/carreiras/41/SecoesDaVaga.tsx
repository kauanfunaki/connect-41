import Image from "next/image";
import { Banknote, Briefcase, CalendarClock, Check, Layers, MapPin, Users, Laptop } from "lucide-react";
import { MARCA_41_CARREIRAS } from "@/lib/carreiras/enderecoDeCarreiras";
import { beneficiosDaVaga } from "@/lib/carreiras/portal";
import { fatosDaVaga, type ChaveDoFato } from "@/lib/carreiras/apresentacao";
import type { VagaDetalhada } from "@/lib/carreiras/vagasDoPortal";
import { DescricaoDaVaga } from "./DescricaoDaVaga";
import logo41Tallent from "../../../../public/41-tallent/logo.png";

const ICONE: Record<ChaveDoFato, React.ReactNode> = {
  contrato: <Briefcase size={19} aria-hidden="true" />,
  modelo: <Laptop size={19} aria-hidden="true" />,
  local: <MapPin size={19} aria-hidden="true" />,
  salario: <Banknote size={19} aria-hidden="true" />,
  area: <Layers size={19} aria-hidden="true" />,
  quantidade: <Users size={19} aria-hidden="true" />,
  prazo: <CalendarClock size={19} aria-hidden="true" />,
};

/** Os fatos da vaga, em grade com ícones — só os que existem (contrato, modelo, local, salário publicado, área, vagas, prazo). */
export function FatosDaVaga({ vaga, semPrazo = false, className = "" }: { vaga: VagaDetalhada; semPrazo?: boolean; className?: string }) {
  const fatos = fatosDaVaga(vaga).filter((f) => !(semPrazo && f.chave === "prazo"));
  if (fatos.length === 0) return null;
  return (
    <ul className={`t41-fatos ${className}`.trim()} aria-label="Resumo da vaga">
      {fatos.map((f) => (
        <li key={f.chave} className="t41-fato">
          <span className="t41-fato__icone">{ICONE[f.chave]}</span>
          <span>
            <span className="t41-fato__rotulo">{f.rotulo}</span>
            <span className="t41-fato__valor">{f.valor}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Processo conduzido pela 41 Tallent" — o selo de quem cuida da vaga. */
export function ConduzidoPela41Tallent() {
  return (
    <aside className="t41-conduzido" aria-label={`Processo conduzido pela ${MARCA_41_CARREIRAS.recrutamento}`}>
      <span className="t41-conduzido__logo">
        <Image src={logo41Tallent} alt={MARCA_41_CARREIRAS.recrutamento} width={92} height={92} />
      </span>
      <div>
        <p className="t41-selo t41-selo--roxo" style={{ marginTop: 0 }}>
          Processo conduzido pela {MARCA_41_CARREIRAS.recrutamento}
        </p>
        <p>
          Sua candidatura chega direto à equipe de recrutamento da <strong>{MARCA_41_CARREIRAS.recrutamento}</strong>. Se o seu perfil
          avançar, ela entra em contato pelo e-mail ou telefone informado.
        </p>
      </div>
    </aside>
  );
}

/**
 * O corpo da vaga, igual na página dela e no painel ao lado da lista: sobre
 * a vaga, requisitos (obrigatórios × desejáveis), benefícios e o selo de quem
 * conduz. Bloco sem conteúdo não aparece.
 */
export function SecoesDaVaga({ vaga, titulo: Titulo = "h2" }: { vaga: VagaDetalhada; titulo?: "h2" | "h3" }) {
  const Grupo = Titulo === "h2" ? "h3" : "h4";
  const beneficios = beneficiosDaVaga(vaga.benefits);
  const { obrigatorios, desejaveis } = vaga.requisitos;
  const temRequisitos = obrigatorios.length > 0 || desejaveis.length > 0;
  const descricao = vaga.publicDescription?.trim();

  return (
    <>
      {descricao && (
        <section className="t41-bloco" aria-labelledby={`sobre-${vaga.id}`}>
          <Titulo id={`sobre-${vaga.id}`} className="t41-bloco__titulo">
            Sobre a vaga
          </Titulo>
          <div className="t41-bloco__corpo">
            <DescricaoDaVaga texto={descricao} />
          </div>
        </section>
      )}

      {temRequisitos && (
        <section className="t41-bloco" aria-labelledby={`requisitos-${vaga.id}`}>
          <Titulo id={`requisitos-${vaga.id}`} className="t41-bloco__titulo">
            Requisitos
          </Titulo>
          <div className={`t41-bloco__corpo t41-requisitos${obrigatorios.length > 0 && desejaveis.length > 0 ? " t41-requisitos--dois" : ""}`}>
            {obrigatorios.length > 0 && (
              <div className="t41-requisitos__grupo">
                <Grupo>Obrigatórios</Grupo>
                <ul>
                  {obrigatorios.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {desejaveis.length > 0 && (
              <div className="t41-requisitos__grupo t41-requisitos__grupo--desejavel">
                <Grupo>Desejáveis</Grupo>
                <ul>
                  {desejaveis.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {beneficios.length > 0 && (
        <section className="t41-bloco" aria-labelledby={`beneficios-${vaga.id}`}>
          <Titulo id={`beneficios-${vaga.id}`} className="t41-bloco__titulo">
            Benefícios
          </Titulo>
          <ul className="t41-bloco__corpo t41-beneficios">
            {beneficios.map((b) => (
              <li key={b}>
                <Check size={17} aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConduzidoPela41Tallent />
    </>
  );
}
