"""Gabarito do NEO com notas fiscais e comprovantes (Bloco C, Fase C2, 19/11/2026).

Plugin do pytest: roda os testes do NEO do original (dev41tech/contabil-core, `tests/integration/test_neo.py`)
e grava cada chamada que envolve nota fiscal ou comprovante:

- `NeoEngine.processar` com alguma nota ou comprovante na empresa;
- `_selecionar_comprovante_candidato`, `_selecionar_nota_candidata`, `_tentar_associar_comprovante`,
  `_tentar_associar_nota_fiscal`, `_resolver_contraparte_candidata` e `_resolver_contraparte_sombra`,
  chamados direto pela suíte.

A entrada é o que o motor leu do banco (empresa, contas bancárias, regras, contrapartes, transações,
decisões abertas, notas e comprovantes) e o estado da execução (os documentos já consumidos, o CNPJ da
empresa); a saída é o resultado (as contagens do `NeoResultado`, a candidata, a contraparte com a origem e
o número da nota) e o que mudou no banco: o status de cada transação, a decisão gravada, a partida da
classificação e a ligação de cada documento.

Depois acrescenta mundos inventados, com semente fixa: transações, regras, contrapartes, notas e
comprovantes sorteados em volta das tolerâncias (R$ 0,01, 3 e 7 dias, a meia-noite da ponta), da direção
da nota, dos dois candidatos, do número da nota no histórico (a nota da contraparte e a de outro CNPJ) e
do modo sombra.

COMO A SAÍDA É GRAVADA: o motor original roda de novo num SQLite em memória montado só com a entrada
(sanitizada). As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o resultado tem de
ser igual ao da suíte de verdade (senão o plugin aborta). O banco montado compara a janela de datas como o
PostgreSQL da produção: o dia do extrato menos e mais N dias vira a meia-noite daqueles dias, e a ponta
entra (o SQLite comparava o texto e deixava de fora o pagamento à meia-noite do último dia).

Uso, a partir da raiz do contabil-core:
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/motor/gabarito/documentos \\
        python -I -W ignore -m pytest -q -p gabarito_neo_documentos tests/integration/test_neo.py
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import sys
import uuid
from types import SimpleNamespace
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402
from gabarito_revisao import _escrever_partes  # noqa: E402

_ORIGINAL: dict = {}
_EM_CURSO = {"dentro": 0, "montado": False, "datas_pg": False}
_DA_SUITE: list[tuple[dict, dict]] = []
casos: dict[str, dict] = {}


def _dv(d: str, pesos) -> str:
    resto = sum(int(a) * p for a, p in zip(d, pesos)) % 11
    return "0" if resto < 2 else str(11 - resto)


def cnpj(base12: str, formatado: bool = True) -> str:
    d = base12 + _dv(base12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    d += _dv(d, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if formatado else d


# ─── Instantâneo do banco ───────────────────────────────────────────────────

def _utc(v):
    if v is None:
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        # Um `date` gravado em coluna com fuso: o PostgreSQL o lê como a meia-noite (sessão em UTC).
        v = datetime.combine(v, time(), tzinfo=UTC)
    return (v.replace(tzinfo=UTC) if v.tzinfo is None else v.astimezone(UTC)).isoformat()


def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


_TEXTOS = ("historico", "descricao", "razao_social", "nome_fantasia", "documento", "cnpj", "cnpj_emitente", "cnpj_destinatario",
           "cpf_cnpj", "numero", "motivo")


def _sanitizar(v):
    if isinstance(v, dict):
        return {k: (_s(x) if k in _TEXTOS else _sanitizar(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [_sanitizar(x) for x in v]
    return v


async def _instantaneo(db, empresa_id) -> dict:
    from sqlalchemy import select

    from src.db.models import AgenciaBancaria, Comprovante, Contraparte, Empresa, NeoDecisao, NotaFiscal, Regra, Transacao

    emp = await db.get(Empresa, empresa_id)
    q = lambda M: select(M).where(M.empresa_id == empresa_id)  # noqa: E731
    agencias = (await db.execute(q(AgenciaBancaria))).scalars().all()
    regras = (await db.execute(q(Regra))).scalars().all()
    contrapartes = (await db.execute(q(Contraparte))).scalars().all()
    transacoes = (await db.execute(q(Transacao).order_by(Transacao.data, Transacao.id))).scalars().all()
    decisoes = (await db.execute(q(NeoDecisao).where(NeoDecisao.resultado == "sem_regra"))).scalars().all()
    notas = (await db.execute(q(NotaFiscal))).scalars().all()
    comprovantes = (await db.execute(q(Comprovante))).scalars().all()
    return {
        "empresa": {"cnpj": emp.cnpj if emp else None},
        "agencias": [{"id": str(a.id), "apagada": a.deleted_at is not None} for a in agencias],
        "regras": [{"id": str(r.id), "agencia_id": str(r.agencia_id) if r.agencia_id else None, "historico": r.historico, "dc": r.dc,
                    "conta_id": str(r.conta_id), "descricao": r.descricao, "manter_historico": bool(r.manter_historico), "tipo": r.tipo,
                    "ativa": bool(r.ativa), "apagada": r.deleted_at is not None} for r in regras],
        "contrapartes": [{"id": str(c.id), "documento": c.documento, "tipo": c.tipo, "origem": c.origem, "razao_social": c.razao_social,
                          "nome_fantasia": c.nome_fantasia, "conta_contabil_id": str(c.conta_contabil_id) if c.conta_contabil_id else None,
                          "ativa": bool(c.ativa), "apagada": c.deleted_at is not None} for c in contrapartes],
        "transacoes": [{"id": str(t.id), "agencia_id": str(t.agencia_id), "data": t.data.isoformat(), "valor": str(t.valor), "historico": t.historico,
                        "dc": t.dc, "status": t.status, "apagada": t.deleted_at is not None, "recusada": t.auto_recusado_em is not None}
                       for t in transacoes],
        "decisoes_abertas": sorted({str(d.transacao_id) for d in decisoes}),
        "notas": [{"id": str(n.id), "numero": n.numero, "cnpj_emitente": n.cnpj_emitente, "cnpj_destinatario": n.cnpj_destinatario,
                   "valor": str(n.valor), "data_emissao": _utc(n.data_emissao), "status": n.status,
                   "transacao_id": str(n.transacao_id) if n.transacao_id else None, "apagada": n.deleted_at is not None} for n in notas],
        "comprovantes": [{"id": str(c.id), "cpf_cnpj": c.cpf_cnpj, "valor_pago": str(c.valor_pago), "data_pagamento": _utc(c.data_pagamento),
                          "transacao_id": str(c.transacao_id) if c.transacao_id else None, "apagado": c.deleted_at is not None}
                         for c in comprovantes],
    }


async def _depois(db, empresa_id, antes_decisoes: dict) -> dict:
    """O que mudou: o status das transações, a decisão gravada, a partida da classificação e os documentos."""
    from sqlalchemy import select

    from src.db.models import Comprovante, NeoDecisao, NotaFiscal, RegistroContabil, Transacao

    transacoes = (await db.execute(select(Transacao).where(Transacao.empresa_id == empresa_id))).scalars().all()
    decisoes = (await db.execute(select(NeoDecisao).where(NeoDecisao.empresa_id == empresa_id))).scalars().all()
    registros = (await db.execute(select(RegistroContabil).where(RegistroContabil.empresa_id == empresa_id,
                                                                 RegistroContabil.deleted_at.is_(None)))).scalars().all()
    notas = (await db.execute(select(NotaFiscal).where(NotaFiscal.empresa_id == empresa_id))).scalars().all()
    comprovantes = (await db.execute(select(Comprovante).where(Comprovante.empresa_id == empresa_id))).scalars().all()
    escritas = {}
    for d in decisoes:
        marca = (d.resultado, d.estrategia, d.motivo, d.processado_em)
        if antes_decisoes.get(str(d.id)) == marca:
            continue
        escritas[str(d.transacao_id)] = {
            "resultado": d.resultado, "estrategia": d.estrategia, "motivo": d.motivo, "regra_id": str(d.regra_id) if d.regra_id else None,
            "conta_id": str(d.conta_id) if d.conta_id else None, "contraparte_id": str(d.contraparte_id) if d.contraparte_id else None,
            "conta_contraparte_id": str(d.conta_contraparte_id) if d.conta_contraparte_id else None,
            "origem_evidencia": d.origem_evidencia, "conta_divergente": d.conta_divergente,
        }
    partidas = {}
    for r in registros:
        if r.descricao.startswith("CONTRAPARTIDA BANCARIA") or r.descricao.lower().startswith("contrapartida bancária"):
            continue
        partidas[str(r.transacao_id)] = {"conta_id": str(r.conta_id), "descricao": r.descricao, "historico": r.historico, "dc": r.dc,
                                         "tipo_regra": r.tipo_regra}
    return {
        "status": {str(t.id): t.status for t in transacoes},
        "decisoes": escritas,
        "partidas": partidas,
        "notas": {str(n.id): {"transacao_id": str(n.transacao_id) if n.transacao_id else None, "status": n.status} for n in notas},
        "comprovantes": {str(c.id): str(c.transacao_id) if c.transacao_id else None for c in comprovantes},
    }


async def _marcas(db, empresa_id) -> dict:
    from sqlalchemy import select

    from src.db.models import NeoDecisao

    return {str(d.id): (d.resultado, d.estrategia, d.motivo, d.processado_em)
            for d in (await db.execute(select(NeoDecisao).where(NeoDecisao.empresa_id == empresa_id))).scalars().all()}


def _tem_documento(e: dict) -> bool:
    return bool(e["notas"] or e["comprovantes"])


def _resultado(r) -> dict:
    return {k: getattr(r, k) for k in ("total_pendentes", "associadas", "sem_regra", "erros", "comprovantes_associados", "notas_associadas",
                                       "classificadas_por_contraparte", "bloqueadas_valor_suspeito")}


def _contraparte(encontrado) -> dict | None:
    if encontrado is None:
        return None
    c, origem, numero = encontrado
    return {"contraparte_id": str(c.id), "origem": origem, "numero_nf": numero}


def _sombra(r) -> dict | None:
    if r is None:
        return None
    return {"contraparte_id": str(r.contraparte_id), "origem": r.origem_evidencia, "conta_contraparte_id": str(r.conta_contraparte_id),
            "conta_divergente": r.conta_divergente, "historico_sugerido": r.historico_sugerido}


# ─── Execução de uma chamada (na suíte e no banco montado) ──────────────────

async def _chamar(engine, db, chamada: dict) -> dict:
    """Roda a chamada gravada no motor e devolve a saída (sem o que mudou no banco)."""
    from sqlalchemy import select

    from src.db.models import Comprovante, NotaFiscal, Transacao

    async def transacao(tid):
        return (await db.execute(select(Transacao).where(Transacao.id == uuid.UUID(tid)))).scalar_one()

    tipo = chamada["tipo"]
    if tipo == "processar":
        r = await engine.processar(agencia_id=uuid.UUID(chamada["agencia_id"]) if chamada.get("agencia_id") else None, mes=chamada.get("mes"))
        return {"resultado": _resultado(r)}
    t = await transacao(chamada["transacao_id"])
    if tipo in ("comprovante", "nota"):
        f = engine._selecionar_comprovante_candidato if tipo == "comprovante" else engine._selecionar_nota_candidata
        c = await f(t)
        return {"candidato": str(c.id) if c else None}
    if tipo in ("tentar_comprovante", "tentar_nota"):
        f = engine._tentar_associar_comprovante if tipo == "tentar_comprovante" else engine._tentar_associar_nota_fiscal
        return {"associou": await f(t)}
    comp = (await db.execute(select(Comprovante).where(Comprovante.id == uuid.UUID(chamada["comprovante_id"])))).scalar_one() if chamada.get("comprovante_id") else None
    nota = (await db.execute(select(NotaFiscal).where(NotaFiscal.id == uuid.UUID(chamada["nota_id"])))).scalar_one() if chamada.get("nota_id") else None
    if tipo == "resolver":
        return {"contraparte": _contraparte(await engine._resolver_contraparte_candidata(t, comp, nota))}
    # A sombra só lê a conta da regra (a suíte passa regras que nem estão no banco).
    regra = SimpleNamespace(id=chamada["regra_id"], conta_id=uuid.UUID(chamada["regra_conta_id"]))
    return {"sombra": _sombra(await engine._resolver_contraparte_sombra(t, regra, comp, nota))}


def _estado(engine) -> dict:
    return {"cnpj_definido": engine._empresa_cnpj is not None,
            "comprovantes_consumidos": sorted(str(x) for x in engine._comprovantes_consumidos),
            "notas_consumidas": sorted(str(x) for x in engine._notas_consumidas)}


def _aplicar_estado(engine, chamada: dict, cnpj_empresa: str | None) -> None:
    if chamada.get("cnpj_definido"):
        engine._empresa_cnpj = cnpj_empresa
    engine._comprovantes_consumidos = {uuid.UUID(x) for x in chamada.get("comprovantes_consumidos", [])}
    engine._notas_consumidas = {uuid.UUID(x) for x in chamada.get("notas_consumidas", [])}


# ─── Banco montado ──────────────────────────────────────────────────────────

def _datas_como_pg(conn, cursor, statement, parameters, context, executemany):  # noqa: ARG001
    """A janela de datas das candidatas comparada como o PostgreSQL (meia-noite da ponta inclusa)."""
    if not _EM_CURSO["datas_pg"] or ("comprovantes.data_pagamento" not in statement and "notas_fiscais.data_emissao" not in statement):
        return statement, parameters

    def troca(p):
        if isinstance(p, date) and not isinstance(p, datetime):
            return datetime.combine(p, time()).strftime("%Y-%m-%d %H:%M:%S.%f")
        if isinstance(p, str) and len(p) == 10 and p[4] == "-" and p[7] == "-":
            return p + " 00:00:00.000000"
        return p

    if isinstance(parameters, dict):
        return statement, {k: troca(v) for k, v in parameters.items()}
    return statement, tuple(troca(v) for v in parameters)


class _Montado:
    async def abrir(self):
        from sqlalchemy import event
        from sqlalchemy.ext.asyncio import create_async_engine

        from src.db.functions import registrar_funcoes_sqlite
        from src.db.models import Base

        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        registrar_funcoes_sqlite(self.engine)
        event.listen(self.engine.sync_engine, "before_cursor_execute", _datas_como_pg, retval=True)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def fechar(self):
        await self.engine.dispose()

    async def rodar(self, e: dict, datas_pg: bool = True) -> dict:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        from src.domain.neo.engine import NeoEngine

        factory = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with factory() as db:
            _EM_CURSO["montado"] = True
            _EM_CURSO["datas_pg"] = datas_pg
            try:
                empresa_id = await _base(db, e)
                marcas = await _marcas(db, empresa_id)
                engine = NeoEngine(db=db, empresa_id=empresa_id)
                _aplicar_estado(engine, e["chamada"], e["empresa"]["cnpj"])
                saida = await _chamar(engine, db, e["chamada"])
                await db.flush()
                saida["depois"] = await _depois(db, empresa_id, marcas)
                return saida
            finally:
                _EM_CURSO["montado"] = False
                _EM_CURSO["datas_pg"] = False
                await db.rollback()


async def _base(db, e: dict):
    from src.db.models import AgenciaBancaria, Comprovante, Contraparte, Empresa, NeoDecisao, NotaFiscal, PlanoConta, Regra, Tenant, Transacao
    from src.core.texto import normalizar_historico_contabil  # noqa: F401

    tenant = Tenant(nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    db.add(tenant)
    await db.flush()
    empresa = Empresa(tenant_id=tenant.id, razao_social="EMPRESA EXEMPLO LTDA", cnpj=e["empresa"]["cnpj"] or cnpj("123456780001"),
                      regime_tributario="simples_nacional")
    db.add(empresa)
    await db.flush()
    for k, a in enumerate(e["agencias"]):
        db.add(AgenciaBancaria(id=uuid.UUID(a["id"]), empresa_id=empresa.id, banco_sigla="ITAU", agencia="0001", numero=f"{k:05d}", ativa=True,
                               deleted_at=datetime(2026, 1, 1, tzinfo=UTC) if a["apagada"] else None))
    contas = {r["conta_id"] for r in e["regras"]} | {c["conta_contabil_id"] for c in e["contrapartes"] if c["conta_contabil_id"]}
    for k, cid in enumerate(sorted(contas)):
        db.add(PlanoConta(id=uuid.UUID(cid), empresa_id=empresa.id, codigo=f"9.{k}", descricao=f"Conta {k}", tipo="despesa"))
    await db.flush()
    for r in e["regras"]:
        db.add(Regra(id=uuid.UUID(r["id"]), empresa_id=empresa.id, conta_id=uuid.UUID(r["conta_id"]),
                     agencia_id=uuid.UUID(r["agencia_id"]) if r["agencia_id"] else None, descricao=r["descricao"], historico=r["historico"],
                     historico_normalizado=r["historico"].strip().lower() + ("" if r["ativa"] and not r["apagada"] else f"#{r['id']}"),
                     dc=r["dc"], tipo=r["tipo"], manter_historico=r["manter_historico"], ativa=r["ativa"],
                     deleted_at=datetime(2026, 1, 1, tzinfo=UTC) if r["apagada"] else None))
    for c in e["contrapartes"]:
        db.add(Contraparte(id=uuid.UUID(c["id"]), empresa_id=empresa.id, tipo=c["tipo"], documento=c["documento"], razao_social=c["razao_social"],
                           nome_fantasia=c["nome_fantasia"], conta_contabil_id=uuid.UUID(c["conta_contabil_id"]) if c["conta_contabil_id"] else None,
                           origem=c["origem"], ativa=c["ativa"], deleted_at=datetime(2026, 1, 1, tzinfo=UTC) if c["apagada"] else None))
    await db.flush()
    for t in e["transacoes"]:
        db.add(Transacao(id=uuid.UUID(t["id"]), empresa_id=empresa.id, agencia_id=uuid.UUID(t["agencia_id"]), data=date.fromisoformat(t["data"]),
                         valor=Decimal(t["valor"]), historico=t["historico"], dc=t["dc"], status=t["status"], hash_dedup=t["id"].replace("-", "") * 2,
                         deleted_at=datetime(2026, 1, 1, tzinfo=UTC) if t["apagada"] else None,
                         auto_recusado_em=datetime(2026, 1, 1, tzinfo=UTC) if t["recusada"] else None))
    await db.flush()
    for tid in e["decisoes_abertas"]:
        db.add(NeoDecisao(empresa_id=empresa.id, transacao_id=uuid.UUID(tid), resultado="sem_regra", motivo="aberta antes",
                          processado_em=datetime(2026, 1, 1, tzinfo=UTC)))
    for k, n in enumerate(e["notas"]):
        db.add(NotaFiscal(id=uuid.UUID(n["id"]), empresa_id=empresa.id, tipo="nfse", numero=n["numero"], cnpj_emitente=n["cnpj_emitente"],
                          cnpj_destinatario=n["cnpj_destinatario"], valor=Decimal(n["valor"]), data_emissao=datetime.fromisoformat(n["data_emissao"]),
                          status=n["status"], transacao_id=uuid.UUID(n["transacao_id"]) if n["transacao_id"] else None, dedup_key=f"{k:064d}",
                          origem="xml_assinado", deleted_at=datetime(2026, 1, 1, tzinfo=UTC) if n["apagada"] else None))
    for c in e["comprovantes"]:
        db.add(Comprovante(id=uuid.UUID(c["id"]), empresa_id=empresa.id, cpf_cnpj=c["cpf_cnpj"], valor_pago=Decimal(c["valor_pago"]),
                           data_pagamento=datetime.fromisoformat(c["data_pagamento"]) if c["data_pagamento"] else None,
                           transacao_id=uuid.UUID(c["transacao_id"]) if c["transacao_id"] else None,
                           deleted_at=datetime(2026, 1, 1, tzinfo=UTC) if c["apagado"] else None))
    await db.flush()
    return empresa.id


# ─── Gravação na suíte ──────────────────────────────────────────────────────

def pytest_configure(config):  # noqa: ARG001
    from src.domain.neo import engine as E

    if getattr(E, "__gabarito__", False):
        return
    E.__gabarito__ = True
    _ORIGINAL["E"] = E
    Motor = E.NeoEngine
    originais = {n: getattr(Motor, n) for n in ("processar", "_selecionar_comprovante_candidato", "_selecionar_nota_candidata",
                                                 "_tentar_associar_comprovante", "_tentar_associar_nota_fiscal",
                                                 "_resolver_contraparte_candidata", "_resolver_contraparte_sombra")}

    def gravar(nome, montar):
        async def f(self, *args, **kw):
            if _EM_CURSO["montado"] or _EM_CURSO["dentro"]:
                return await originais[nome](self, *args, **kw)
            entrada = await _instantaneo(self._db, self._empresa_id)
            chamada = {**montar(*args, **kw), **_estado(self)}
            marcas = await _marcas(self._db, self._empresa_id)
            _EM_CURSO["dentro"] += 1
            try:
                r = await originais[nome](self, *args, **kw)
            finally:
                _EM_CURSO["dentro"] -= 1
            if _tem_documento(entrada):
                saida = {"processar": lambda: {"resultado": _resultado(r)},
                         "_selecionar_comprovante_candidato": lambda: {"candidato": str(r.id) if r else None},
                         "_selecionar_nota_candidata": lambda: {"candidato": str(r.id) if r else None},
                         "_tentar_associar_comprovante": lambda: {"associou": r},
                         "_tentar_associar_nota_fiscal": lambda: {"associou": r},
                         "_resolver_contraparte_candidata": lambda: {"contraparte": _contraparte(r)},
                         "_resolver_contraparte_sombra": lambda: {"sombra": _sombra(r)}}[nome]()
                await self._db.flush()
                saida["depois"] = await _depois(self._db, self._empresa_id, marcas)
                _DA_SUITE.append(({**entrada, "chamada": chamada}, saida))
            return r
        return f

    def tid(t):
        return {"transacao_id": str(t.id)}

    def docs(t, comprovante_candidato=None, nota_candidata=None):
        return {"transacao_id": str(t.id), "comprovante_id": str(comprovante_candidato.id) if comprovante_candidato else None,
                "nota_id": str(nota_candidata.id) if nota_candidata else None}

    Motor.processar = gravar("processar", lambda agencia_id=None, mes=None, progresso=None: {
        "tipo": "processar", "agencia_id": str(agencia_id) if agencia_id else None, "mes": mes})
    Motor._selecionar_comprovante_candidato = gravar("_selecionar_comprovante_candidato", lambda t: {"tipo": "comprovante", **tid(t)})
    Motor._selecionar_nota_candidata = gravar("_selecionar_nota_candidata", lambda t: {"tipo": "nota", **tid(t)})
    Motor._tentar_associar_comprovante = gravar("_tentar_associar_comprovante", lambda t: {"tipo": "tentar_comprovante", **tid(t)})
    Motor._tentar_associar_nota_fiscal = gravar("_tentar_associar_nota_fiscal", lambda t: {"tipo": "tentar_nota", **tid(t)})
    Motor._resolver_contraparte_candidata = gravar("_resolver_contraparte_candidata", lambda t, comprovante_candidato=None, nota_candidata=None: {
        "tipo": "resolver", **docs(t, comprovante_candidato, nota_candidata)})
    Motor._resolver_contraparte_sombra = gravar("_resolver_contraparte_sombra", lambda t, regra, comprovante_candidato=None, nota_candidata=None: {
        "tipo": "sombra", "regra_id": str(regra.id), "regra_conta_id": str(regra.conta_id), **docs(t, comprovante_candidato, nota_candidata)})


# ─── Mundos inventados ──────────────────────────────────────────────────────

EMPRESA = cnpj("123456780001")
FORNECEDOR = cnpj("999999990001")
CLIENTE = cnpj("111111110001")
OUTRO = cnpj("999999990002")


def _id(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def mundo(rng: random.Random) -> dict:
    agencia = _id(rng)
    contas = {k: _id(rng) for k in ("forn", "cli", "outro", "regra", "regra2")}
    contrapartes = [
        {"id": _id(rng), "documento": FORNECEDOR.replace(".", "").replace("/", "").replace("-", ""), "tipo": "fornecedor", "origem": "manual",
         "razao_social": "FORNECEDOR EXEMPLO LTDA", "nome_fantasia": rng.choice([None, "EXEMPLO"]), "conta_contabil_id": contas["forn"],
         "ativa": True, "apagada": False},
        {"id": _id(rng), "documento": CLIENTE.replace(".", "").replace("/", "").replace("-", ""), "tipo": rng.choice(["cliente", "ambos"]),
         "origem": "manual", "razao_social": "CLIENTE MODELO SA", "nome_fantasia": None, "conta_contabil_id": contas["cli"], "ativa": True,
         "apagada": False},
    ]
    if rng.random() < 0.3:
        contrapartes.append({"id": _id(rng), "documento": OUTRO.replace(".", "").replace("/", "").replace("-", ""), "tipo": "fornecedor",
                             "origem": "nota_fiscal", "razao_social": "TERCEIRO QUALQUER ME", "nome_fantasia": None, "conta_contabil_id": contas["outro"],
                             "ativa": rng.random() < 0.8, "apagada": False})
    regras = []
    if rng.random() < 0.4:
        regras.append({"id": _id(rng), "agencia_id": None, "historico": "PIX ENVIADO", "dc": "D", "conta_id": contas["regra"],
                       "descricao": "PAGAMENTO VIA PIX", "manter_historico": rng.random() < 0.3, "tipo": "automatica", "ativa": True, "apagada": False})
    if rng.random() < 0.2:
        regras.append({"id": _id(rng), "agencia_id": agencia, "historico": "TED RECEBIDA", "dc": "C", "conta_id": contas["regra2"],
                       "descricao": "RECEBIMENTO TED", "manter_historico": False, "tipo": "automatica", "ativa": True, "apagada": False})
    base = date(2026, 3, 10)
    historicos_d = ["PIX ENVIADO FORNECEDOR EXEMPLO", "PAGTO BOLETO DIVERSOS", f"PIX ENVIADO {FORNECEDOR}", "TARIFA BANCARIA",
                    "PAGAMENTO FORNECEDOR EXEMPLO LTDA", f"TED {OUTRO} TERCEIRO", "DEBITO AUTOMATICO"]
    historicos_c = ["TED RECEBIDA CLIENTE MODELO", "DEPOSITO AVULSO", f"PIX RECEBIDO {CLIENTE}", "CREDITO CLIENTE MODELO SA", "RECEBIMENTO DIVERSO"]
    transacoes = []
    for _ in range(rng.randint(1, 4)):
        dc = rng.choice("DDC")
        transacoes.append({"id": _id(rng), "agencia_id": agencia, "data": (base + timedelta(days=rng.randint(-2, 2))).isoformat(),
                           "valor": rng.choice(["150.00", "150.01", "1500.00", "89.90", "150.02"]),
                           "historico": rng.choice(historicos_d if dc == "D" else historicos_c), "dc": dc,
                           "status": rng.choice(["pendente"] * 6 + ["processada"]), "apagada": rng.random() < 0.05, "recusada": rng.random() < 0.05})

    def instante():
        dia = base + timedelta(days=rng.randint(-10, 10))
        hora = rng.choice([time(0, 0), time(0, 0), time(10, 30), time(23, 59, 59)])
        return datetime.combine(dia, hora, tzinfo=UTC).isoformat()

    notas = []
    for _ in range(rng.randint(0, 3)):
        sentido = rng.choice(["recebida", "recebida", "emitida", "terceiros", "propria"])
        emit, dest = {"recebida": (rng.choice([FORNECEDOR, OUTRO, CLIENTE]), EMPRESA),
                      "emitida": (EMPRESA, rng.choice([CLIENTE, FORNECEDOR, None])),
                      "terceiros": (FORNECEDOR, OUTRO), "propria": (EMPRESA, EMPRESA)}[sentido]
        if rng.random() < 0.2 and emit:
            emit = emit.replace(".", "").replace("/", "").replace("-", "")
        notas.append({"id": _id(rng), "numero": str(rng.randint(1, 99999)), "cnpj_emitente": emit, "cnpj_destinatario": dest,
                      "valor": rng.choice(["150.00", "150.01", "149.99", "1500.00", "89.90", "150.02"]), "data_emissao": instante(),
                      "status": rng.choice(["pendente"] * 5 + ["associada", "cancelada"]), "transacao_id": None, "apagada": rng.random() < 0.08})
    comprovantes = []
    for _ in range(rng.randint(0, 3)):
        comprovantes.append({"id": _id(rng), "cpf_cnpj": rng.choice([FORNECEDOR, FORNECEDOR.replace(".", ""), OUTRO, "123.456.789-09", None, ""]),
                             "valor_pago": rng.choice(["150.00", "150.01", "1500.00", "89.90", "150.02", "149.98"]),
                             "data_pagamento": rng.choice([instante(), instante(), None]), "transacao_id": None, "apagado": rng.random() < 0.08})
    for n in notas:
        if n["status"] == "associada" and transacoes:
            n["transacao_id"] = rng.choice(transacoes)["id"]
    for c in comprovantes:
        if rng.random() < 0.1 and transacoes:
            c["transacao_id"] = rng.choice(transacoes)["id"]
    abertas = sorted({t["id"] for t in transacoes if rng.random() < 0.3 and t["status"] == "pendente"})
    chamada = {"tipo": "processar", "agencia_id": agencia if rng.random() < 0.15 else None, "mes": rng.choice([None, None, "2026-03", "2026-02"]),
               "cnpj_definido": False, "comprovantes_consumidos": [], "notas_consumidas": []}
    return {"empresa": {"cnpj": EMPRESA}, "agencias": [{"id": agencia, "apagada": False}], "regras": regras, "contrapartes": contrapartes,
            "transacoes": transacoes, "decisoes_abertas": abertas, "notas": notas, "comprovantes": comprovantes, "chamada": chamada}


def mundos_das_pontas(rng: random.Random) -> list[dict]:
    """As pontas da janela, uma a uma: 3 e 7 dias, à meia-noite e às 00h00min01, antes e depois."""
    saida = []
    for dias, alvo in ((3, "comprovante"), (4, "comprovante"), (7, "nota"), (8, "nota")):
        for sinal in (-1, 1):
            for hora in (time(0, 0), time(0, 0, 1), time(23, 59, 59)):
                m = mundo(rng)
                t = {"id": _id(rng), "agencia_id": m["agencias"][0]["id"], "data": "2026-03-10", "valor": "150.00",
                     "historico": "PAGAMENTO DIVERSO", "dc": "D", "status": "pendente", "apagada": False, "recusada": False}
                instante = datetime.combine(date(2026, 3, 10) + timedelta(days=sinal * dias), hora, tzinfo=UTC).isoformat()
                m["transacoes"] = [t]
                m["regras"] = []
                if alvo == "comprovante":
                    m["notas"] = []
                    m["comprovantes"] = [{"id": _id(rng), "cpf_cnpj": FORNECEDOR, "valor_pago": "150.00", "data_pagamento": instante,
                                          "transacao_id": None, "apagado": False}]
                else:
                    m["comprovantes"] = []
                    m["notas"] = [{"id": _id(rng), "numero": "321", "cnpj_emitente": FORNECEDOR, "cnpj_destinatario": EMPRESA, "valor": "150.00",
                                   "data_emissao": instante, "status": "pendente", "transacao_id": None, "apagada": False}]
                m["decisoes_abertas"] = []
                m["chamada"]["mes"] = None
                m["chamada"]["agencia_id"] = None
                saida.append(m)
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _guardar(origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": entrada["chamada"]["tipo"], "origem": origem, "entrada": entrada, "saida": saida}
    casos.setdefault(json.dumps(entrada, sort_keys=True, ensure_ascii=False), caso)


async def _tudo() -> None:
    montado = _Montado()
    await montado.abrir()
    try:
        for entrada, real in _DA_SUITE:
            refeito = await montado.rodar(entrada, datas_pg=False)
            if refeito != real:
                raise AssertionError(f"o banco montado não repete a suíte ({entrada['chamada']['tipo']}):\n"
                                     f"{json.dumps(refeito, ensure_ascii=False, default=str)[:3000]}\n{json.dumps(real, ensure_ascii=False, default=str)[:3000]}")
            limpa = _sanitizar(entrada)
            _guardar("suite", limpa, await montado.rodar(limpa))
        rng = random.Random(20261119)
        for _ in range(260):
            e = mundo(rng)
            _guardar("inventado", e, await montado.rodar(e))
        for e in mundos_das_pontas(rng):
            _guardar("inventado", e, await montado.rodar(e))
    finally:
        await montado.fechar()


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    asyncio.run(_tudo())
    ordem = {"suite": 0, "inventado": 1}
    lista = sorted(casos.values(), key=lambda c: (ordem[c["origem"]], c["tipo"]))
    itens = [{"id": n, **c} for n, c in enumerate(lista, start=1)]
    arquivos = _escrever_partes(pasta, "neo-documentos", itens)
    por: dict[str, int] = {}
    ligados = {"comprovantes": 0, "notas": 0}
    for c in itens:
        chave = f"{c['tipo']} ({c['origem']})"
        por[chave] = por.get(chave, 0) + 1
        r = c["saida"].get("resultado")
        if r:
            ligados["comprovantes"] += r["comprovantes_associados"]
            ligados["notas"] += r["notas_associadas"]
    print(f"\ngabarito do NEO com documentos: {len(itens)} casos {por}; documentos ligados: {ligados}; arquivos: {', '.join(arquivos)}")
