"""Gabarito do painel do Contábil Core (Bloco D, Fase D1, 26/11/2026): as divergências da sombra do NEO
("Conflitos e qualidade"), as estatísticas da empresa e a carteira do escritório.

Plugin do pytest: roda os testes do original (dev41tech/contabil-core) e grava cada chamada de
`consultar_divergencias` (`src/domain/neo/consultas.py`), `StatsService.obter` (`src/domain/stats/service.py`)
e `listar_carteira` (`src/domain/carteira/service.py`): a entrada (o que a consulta leu do banco e os
argumentos; nas estatísticas, também o "agora") e a resposta exata (`model_dump(mode="json")`). Depois
acrescenta casos inventados, com semente fixa:
- divergências: medições avaliadas (verdadeiro, falso) e não avaliadas (nulo), pares de contas com somas
  iguais, transação desfeita, decisões repetidas da mesma transação, outra empresa, os filtros de mês e
  conta bancária, mais de dez divergentes (a amostra é limitada);
- estatísticas: transações com e sem lançamento vivo, partidas canceladas, notas e comprovantes nas pontas do
  mês, contas bancárias ativas, inativas e apagadas, o "agora" em vários meses e a janela de 1 a 24 meses;
- carteira: empresas sem extrato, só com pendências, com erros, inativas e apagadas, de outro escritório, o
  escopo do usuário, transações fora do mês e desfeitas, empates de pendências.
O porte em TypeScript repete tudo em `src/lib/contabil-core/painel/painel.test.ts`.

COMO A SAÍDA É GRAVADA: a consulta original roda de novo num SQLite em memória montado só com a entrada
gravada (sanitizada). As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o resultado tem
de ser igual ao da suíte de verdade (senão o plugin aborta). O banco montado se comporta como o PostgreSQL da
produção nos instantes (comparados em UTC, com o fuso na volta), como em `gabarito_exportacao.py`.

Dados: as razões sociais não são gravadas: viram "EMPRESA 01 LTDA", "EMPRESA 02 LTDA"… na ordem alfabética
das originais (a carteira ordena por elas). Os históricos e as contas passam pelo sanitizador
(GABARITO_NOMES e CNPJs fictícios começando com 9).

Uso, a partir da raiz do contabil-core (os testes usam SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/painel/gabarito \\
        python -I -W ignore -m pytest -q -p gabarito_painel tests/integration/test_neo.py tests/integration/test_stats.py \\
        tests/integration/test_fase3_backend.py -k "divergencias or stats or carteira"
"""
from __future__ import annotations

import asyncio
import copy
import itertools
import json
import os
import random
import sys
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gabarito_exportacao as GE  # noqa: E402
from gabarito_cruzamento import sanitizar_texto  # noqa: E402
from gabarito_revisao import _escrever_partes  # noqa: E402

_ORIGINAL: dict = {}
_DA_SUITE: list[tuple[str, dict, dict]] = []
casos: dict[str, dict] = {}
_DENTRO = {"sim": False}
_MUNDOS: dict[str, dict] = {}


def _registrar(mundo: dict) -> str:
    """Os mundos inventados vão uma vez só para `painel-mundos.json`; o caso leva a chave."""
    k = f"m{len(_MUNDOS) + 1}"
    _MUNDOS[k] = mundo
    return k

EMPRESA_ID = "00000000-0000-0000-0000-00000000e3a5"
TENANT_ID = "00000000-0000-0000-0000-0000000007a1"
USUARIO_ID = "00000000-0000-0000-0000-00000000005e"


def _iso(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v.replace(tzinfo=UTC) if v.tzinfo is None else v).isoformat()
    return v.isoformat()


def _din(v) -> str | None:
    return None if v is None else str(Decimal(str(v)))


def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


# ─── Fotos (o que cada consulta pode ler) ───────────────────────────────────

async def _todas(db, modelo):
    from sqlalchemy import select

    return list((await db.execute(select(modelo))).scalars())


async def _foto_divergencias(db, empresa_id) -> dict:
    from src.db.models import AgenciaBancaria, NeoDecisao, PlanoConta, Transacao

    def quem(x):
        return "esta" if x.empresa_id == empresa_id else "outra"

    return {
        "agencias": [{"id": str(a.id), "empresa": quem(a)} for a in await _todas(db, AgenciaBancaria)],
        "contas": [{"id": str(c.id), "empresa": quem(c), "codigo": c.codigo, "descricao": c.descricao} for c in await _todas(db, PlanoConta)],
        "transacoes": [{"id": str(t.id), "empresa": quem(t), "agencia_id": str(t.agencia_id), "data": t.data.isoformat(), "valor": _din(t.valor),
                        "historico": t.historico, "apagada": t.deleted_at is not None} for t in await _todas(db, Transacao)],
        "decisoes": [{"id": str(d.id), "empresa": quem(d), "transacao_id": str(d.transacao_id), "conta_id": str(d.conta_id) if d.conta_id else None,
                      "conta_contraparte_id": str(d.conta_contraparte_id) if d.conta_contraparte_id else None,
                      "contraparte_id": str(d.contraparte_id) if d.contraparte_id else None, "origem_evidencia": d.origem_evidencia,
                      "conta_divergente": d.conta_divergente, "resultado": d.resultado, "ordem_insercao": k}
                     for k, d in enumerate(await _todas(db, NeoDecisao))],
    }


async def _foto_stats(db, empresa_id) -> dict:
    from src.db.models import AgenciaBancaria, Comprovante, NotaFiscal, RegistroContabil, Transacao

    def quem(x):
        return "esta" if x.empresa_id == empresa_id else "outra"

    return {
        "agencias": [{"id": str(a.id), "empresa": quem(a), "banco_sigla": a.banco_sigla, "agencia": a.agencia, "numero": a.numero, "ativa": a.ativa,
                      "apagada": a.deleted_at is not None, "ordem_insercao": k} for k, a in enumerate(await _todas(db, AgenciaBancaria))],
        "transacoes": [{"id": str(t.id), "empresa": quem(t), "agencia_id": str(t.agencia_id), "data": t.data.isoformat(), "apagada": t.deleted_at is not None}
                       for t in await _todas(db, Transacao)],
        "registros": [{"id": str(r.id), "empresa": quem(r), "transacao_id": str(r.transacao_id) if r.transacao_id else None,
                       "agencia_id": str(r.agencia_id), "conta_id": str(r.conta_id), "lancamento_id": str(r.lancamento_id), "dc": r.dc,
                       "ordem_composicao": r.ordem_composicao, "data_lancamento": _iso(r.data_lancamento), "apagado": r.deleted_at is not None}
                      for r in await _todas(db, RegistroContabil)],
        "notas": [{"id": str(n.id), "empresa": quem(n), "data_emissao": _iso(n.data_emissao), "apagada": n.deleted_at is not None}
                  for n in await _todas(db, NotaFiscal)],
        "comprovantes": [{"id": str(c.id), "empresa": quem(c), "data_pagamento": _iso(c.data_pagamento), "apagado": c.deleted_at is not None}
                         for c in await _todas(db, Comprovante)],
    }


async def _foto_carteira(db, tenant_id, user_id, role) -> dict:
    from sqlalchemy import select

    from src.db.models import Empresa, Permissao, Transacao

    permitidas = {p.empresa_id for p in (await db.execute(select(Permissao).where(Permissao.usuario_id == user_id))).scalars()}
    return {
        "empresas": [{"id": str(e.id), "razao_social": e.razao_social, "ativa": e.ativa, "apagada": e.deleted_at is not None,
                      "do_escritorio": e.tenant_id == tenant_id, "permitida": e.id in permitidas, "ordem_insercao": k}
                     for k, e in enumerate(await _todas(db, Empresa))],
        "transacoes": [{"id": str(t.id), "empresa_id": str(t.empresa_id), "data": t.data.isoformat(), "valor": _din(t.valor), "status": t.status,
                        "apagada": t.deleted_at is not None} for t in await _todas(db, Transacao)],
        "admin": role == "admin",
    }


# ─── O banco montado ────────────────────────────────────────────────────────

class _Montado(GE._Montado):
    async def rodar(self, tipo: str, e: dict, pg: bool = True) -> dict:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        factory = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with factory() as db:
            try:
                GE._EM_CURSO["montado"] = True
                GE._EM_CURSO["pg"] = pg
                _DENTRO["sim"] = True
                return await _executar(db, tipo, e)
            finally:
                GE._EM_CURSO["montado"] = False
                GE._EM_CURSO["pg"] = False
                _DENTRO["sim"] = False
                await db.rollback()


_APAGADO = datetime(2026, 1, 9, tzinfo=UTC)


async def _base(db, tipo: str, e: dict):
    from src.db.models import (AgenciaBancaria, Comprovante, Empresa, NeoDecisao, NotaFiscal, Permissao, PlanoConta,
                               RegistroContabil, Tenant, Transacao, Usuario)

    tenant = Tenant(id=uuid.UUID(TENANT_ID), nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    outro = Tenant(nome="Outro escritório", cnpj="00.000.000/0002-00")
    db.add_all([tenant, outro])
    await db.flush()
    usuario = Usuario(id=uuid.UUID(USUARIO_ID), tenant_id=tenant.id, email="gabarito@example.com", nome="Pessoa do gabarito", senha_hash="x",
                      role="admin" if e.get("admin", True) else "contador")
    db.add(usuario)
    if tipo == "carteira":
        for emp in sorted(e["empresas"], key=lambda x: x["ordem_insercao"]):
            db.add(Empresa(id=uuid.UUID(emp["id"]), tenant_id=tenant.id if emp["do_escritorio"] else outro.id, razao_social=emp["razao_social"],
                           cnpj=f"9{emp['ordem_insercao']:013d}", regime_tributario="simples_nacional", ativa=emp["ativa"],
                           deleted_at=_APAGADO if emp["apagada"] else None))
            await db.flush()
            if emp["permitida"]:
                db.add(Permissao(usuario_id=usuario.id, empresa_id=uuid.UUID(emp["id"]), modulos="*"))
        await db.flush()
        agencias = {}
        for t in e["transacoes"]:
            if t["empresa_id"] not in agencias:
                a = AgenciaBancaria(empresa_id=uuid.UUID(t["empresa_id"]), banco_sigla="BB", agencia="1", numero=t["empresa_id"][-8:])
                db.add(a)
                await db.flush()
                agencias[t["empresa_id"]] = a.id
            db.add(Transacao(id=uuid.UUID(t["id"]), empresa_id=uuid.UUID(t["empresa_id"]), agencia_id=agencias[t["empresa_id"]],
                             data=date.fromisoformat(t["data"]), valor=Decimal(t["valor"]), historico="MOVIMENTO", dc="D", status=t["status"],
                             hash_dedup=t["id"].replace("-", "") * 2, deleted_at=_APAGADO if t["apagada"] else None))
        await db.flush()
        return None

    empresa = Empresa(id=uuid.UUID(EMPRESA_ID), tenant_id=tenant.id, razao_social="EMPRESA EXEMPLO LTDA", cnpj="12.345.678/0001-95",
                      regime_tributario="simples_nacional")
    outra = Empresa(tenant_id=tenant.id, razao_social="OUTRA EMPRESA LTDA", cnpj="99.999.999/0001-91", regime_tributario="simples_nacional")
    db.add_all([empresa, outra])
    await db.flush()

    def de(x):
        return outra.id if x.get("empresa") == "outra" else empresa.id

    for a in sorted(e["agencias"], key=lambda a: a.get("ordem_insercao", 0)):
        db.add(AgenciaBancaria(id=uuid.UUID(a["id"]), empresa_id=de(a), banco_sigla=a.get("banco_sigla", "BB"), agencia=a.get("agencia", "0001"),
                               numero=a.get("numero", a["id"][-10:]), ativa=a.get("ativa", True), deleted_at=_APAGADO if a.get("apagada") else None))
        await db.flush()
    conta_qualquer = PlanoConta(empresa_id=empresa.id, codigo="9.9.9.gabarito", descricao="Conta do gabarito", tipo="despesa")
    db.add(conta_qualquer)
    for c in e.get("contas", []):
        db.add(PlanoConta(id=uuid.UUID(c["id"]), empresa_id=de(c), codigo=c["codigo"], descricao=c["descricao"], tipo="despesa"))
    await db.flush()
    for t in e["transacoes"]:
        db.add(Transacao(id=uuid.UUID(t["id"]), empresa_id=de(t), agencia_id=uuid.UUID(t["agencia_id"]), data=date.fromisoformat(t["data"]),
                         valor=Decimal(t.get("valor") or "1.00"), historico=t.get("historico", "MOVIMENTO"), dc="D",
                         hash_dedup=t["id"].replace("-", "") * 2, deleted_at=_APAGADO if t["apagada"] else None))
        await db.flush()
    if tipo == "divergencias":
        # A contraparte não é lida pela consulta (só o id dela vai na amostra); o SQLite da suíte não confere a chave estrangeira.
        for d in sorted(e["decisoes"], key=lambda d: d["ordem_insercao"]):
            db.add(NeoDecisao(id=uuid.UUID(d["id"]), empresa_id=de(d), transacao_id=uuid.UUID(d["transacao_id"]),
                              conta_id=uuid.UUID(d["conta_id"]) if d["conta_id"] else None,
                              conta_contraparte_id=uuid.UUID(d["conta_contraparte_id"]) if d["conta_contraparte_id"] else None,
                              contraparte_id=uuid.UUID(d["contraparte_id"]) if d["contraparte_id"] else None, origem_evidencia=d["origem_evidencia"],
                              conta_divergente=d["conta_divergente"], resultado=d.get("resultado") or "associada"))
            await db.flush()
        return empresa
    # stats
    for r in e["registros"]:
        db.add(RegistroContabil(
            id=uuid.UUID(r["id"]), empresa_id=de(r), transacao_id=uuid.UUID(r["transacao_id"]) if r["transacao_id"] else None,
            lancamento_id=uuid.UUID(r["lancamento_id"]), ordem_composicao=r["ordem_composicao"], conta_id=conta_qualquer.id,
            agencia_id=uuid.UUID(r["agencia_id"]), descricao="x", historico="x", historico_extrato="x", dc=r["dc"], tipo_regra="manual",
            valor=Decimal("1.00"), data_lancamento=GE._dt(r["data_lancamento"]), deleted_at=_APAGADO if r["apagado"] else None,
        ))
        await db.flush()
    for n in e["notas"]:
        db.add(NotaFiscal(id=uuid.UUID(n["id"]), empresa_id=de(n), tipo="nfe", numero="1", cnpj_emitente="11.111.111/0001-11", valor=Decimal("1.00"),
                          data_emissao=GE._dt(n["data_emissao"]), status="pendente", dedup_key=n["id"].replace("-", "") * 2,
                          deleted_at=_APAGADO if n["apagada"] else None))
    for c in e["comprovantes"]:
        db.add(Comprovante(id=uuid.UUID(c["id"]), empresa_id=de(c), valor_pago=Decimal("1.00"), data_pagamento=GE._dt(c["data_pagamento"]),
                           deleted_at=_APAGADO if c["apagado"] else None))
    await db.flush()
    return empresa


class _Agora:
    """Troca o `datetime` do módulo das estatísticas por um com o "agora" gravado."""

    def __init__(self, modulo, agora: datetime):
        self.modulo, self.agora = modulo, agora

    def __enter__(self):
        agora = self.agora

        class _Congelado(datetime):
            @classmethod
            def now(cls, tz=None):
                return agora if tz is None else agora.astimezone(tz)

        self.antes = self.modulo.datetime
        self.modulo.datetime = _Congelado
        return self

    def __exit__(self, *_):
        self.modulo.datetime = self.antes


async def _executar(db, tipo: str, e: dict) -> dict:
    from src.domain.carteira import service as C
    from src.domain.neo import consultas as N
    from src.domain.stats import service as S

    empresa = await _base(db, tipo, e)
    if tipo == "divergencias":
        r = await _ORIGINAL["divergencias"](db, empresa.id, mes=e["mes"], agencia_id=uuid.UUID(e["agencia_id"]) if e["agencia_id"] else None)
    elif tipo == "stats":
        with _Agora(S, datetime.fromisoformat(e["agora"])):
            r = await _ORIGINAL["obter"](S.StatsService(db, empresa.id), meses=e["meses"])
    else:
        r = await _ORIGINAL["carteira"](db, tenant_id=uuid.UUID(TENANT_ID), user_id=uuid.UUID(USUARIO_ID),
                                        role="admin" if e["admin"] else "contador", mes=e["mes"])
    del N, C
    return r.model_dump(mode="json")


# ─── Gravação da suíte ──────────────────────────────────────────────────────

def pytest_configure(config):  # noqa: ARG001
    from src.api.v1 import carteira as rota_carteira
    from src.api.v1 import neo as rota_neo
    from src.domain import carteira as pacote_carteira
    from src.domain.carteira import service as C
    from src.domain.neo import consultas as N
    from src.domain.stats import service as S

    if getattr(N, "__gabarito_painel__", False):
        return
    N.__gabarito_painel__ = True
    if not getattr(GE, "_PG_INSTALADO", False):
        GE._instalar_pg()
        GE._PG_INSTALADO = True
    _ORIGINAL.update(divergencias=N.consultar_divergencias, obter=S.StatsService.obter, carteira=C.listar_carteira)

    async def divergencias(db, empresa_id, *, mes=None, agencia_id=None):
        if _DENTRO["sim"]:
            return await _ORIGINAL["divergencias"](db, empresa_id, mes=mes, agencia_id=agencia_id)
        entrada = {**await _foto_divergencias(db, empresa_id), "mes": mes, "agencia_id": str(agencia_id) if agencia_id else None}
        r = await _ORIGINAL["divergencias"](db, empresa_id, mes=mes, agencia_id=agencia_id)
        _DA_SUITE.append(("divergencias", entrada, r.model_dump(mode="json")))
        return r

    async def obter(self, meses: int = 12):
        if _DENTRO["sim"]:
            return await _ORIGINAL["obter"](self, meses=meses)
        agora = datetime.now(UTC)
        entrada = {**await _foto_stats(self._db, self._empresa_id), "meses": meses, "agora": agora.isoformat()}
        with _Agora(S, agora):
            r = await _ORIGINAL["obter"](self, meses=meses)
        _DA_SUITE.append(("stats", entrada, r.model_dump(mode="json")))
        return r

    async def carteira(db, *, tenant_id, user_id, role, mes):
        r = await _ORIGINAL["carteira"](db, tenant_id=tenant_id, user_id=user_id, role=role, mes=mes)
        if not _DENTRO["sim"]:
            entrada = {**await _foto_carteira(db, tenant_id, user_id, role), "mes": mes}
            _DA_SUITE.append(("carteira", entrada, r.model_dump(mode="json")))
        return r

    N.consultar_divergencias = divergencias
    rota_neo._consultar_divergencias = divergencias
    S.StatsService.obter = obter
    C.listar_carteira = carteira
    pacote_carteira.listar_carteira = carteira
    rota_carteira.listar_carteira = carteira


# ─── Sanitização ────────────────────────────────────────────────────────────

def _sanitizar(tipo: str, e: dict, saida: dict) -> tuple[dict, dict]:
    e, saida = copy.deepcopy(e), copy.deepcopy(saida)
    if tipo == "carteira":
        # A razão social da suíte vira "EMPRESA NN LTDA", na ordem alfabética das originais.
        nomes = {n: f"EMPRESA {k + 1:02d} LTDA" for k, n in enumerate(sorted({x["razao_social"] for x in e["empresas"]}))}
        for x in e["empresas"]:
            x["razao_social"] = nomes[x["razao_social"]]
        for x in saida["items"]:
            x["razao_social"] = nomes[x["razao_social"]]
    for chave in ("transacoes", "contas"):
        for x in e.get(chave, []):
            for campo in ("historico", "codigo", "descricao"):
                if campo in x:
                    x[campo] = _s(x[campo])
    for x in saida.get("amostra", []):
        x["historico"] = _s(x["historico"])
    for lista in (saida.get("amostra", []), saida.get("por_conta", [])):
        for x in lista:
            for campo in ("conta_regra_codigo", "conta_regra_descricao", "conta_contraparte_codigo", "conta_contraparte_descricao"):
                x[campo] = _s(x[campo])
    return e, saida


# ─── Inventados ─────────────────────────────────────────────────────────────

_IDS = itertools.count(1)


def _uid(prefixo: int) -> str:
    return str(uuid.UUID(int=(prefixo << 96) | next(_IDS)))


def casos_divergencias(rng: random.Random) -> list[dict]:
    saida = []
    for rodada in range(14):
        agencias = [{"id": _uid(0xA6), "empresa": "esta"}, {"id": _uid(0xA6), "empresa": "esta"}, {"id": _uid(0xA6), "empresa": "outra"}]
        contas = [{"id": _uid(0xC0), "empresa": "esta", "codigo": f"4.8.{k}", "descricao": f"Conta relatório {k}"} for k in range(1, 6)]
        contrapartes = [_uid(0xCA) for _ in range(4)]
        transacoes, decisoes = [], []
        dias = ["2026-02-28", "2026-03-01", "2026-03-15", "2026-03-31", "2026-04-01"]
        valores = ["20.00", "50000.00", "1000.00", "300.00", "20.00", "0.01", "99999.00", "1234.56"]
        for k in range(rng.randint(4, 24 if rodada % 3 else 40)):
            ag = rng.choice(agencias[:2] if rng.random() < 0.95 else agencias)
            t = {"id": _uid(0x7A), "empresa": ag["empresa"], "agencia_id": ag["id"], "data": rng.choice(dias), "valor": rng.choice(valores),
                 "historico": f"CASO SHADOW {k}", "apagada": rng.random() < 0.1}
            transacoes.append(t)
            for _ in range(1 if rng.random() < 0.85 else 2):
                divergente = rng.choice([True, True, False, None])
                regra, contra = rng.choice(contas), rng.choice(contas)
                decisoes.append({
                    "id": _uid(0xDA), "empresa": t["empresa"], "transacao_id": t["id"], "conta_id": regra["id"],
                    "conta_contraparte_id": contra["id"] if divergente is not None or rng.random() < 0.5 else None,
                    "contraparte_id": rng.choice(contrapartes) if divergente is not None else None,
                    "origem_evidencia": rng.choice(["historico", "nome", "nota_fiscal", "comprovante"]) if divergente is not None else None,
                    "conta_divergente": divergente, "resultado": "associada", "ordem_insercao": len(decisoes),
                })
        base = {"mundo": _registrar({"agencias": agencias, "contas": contas, "transacoes": transacoes, "decisoes": decisoes})}
        for mes, ag in [(None, None), ("2026-03", None), ("2026-03", agencias[0]["id"]), (None, agencias[1]["id"]), ("2026-02", None),
                        ("2026-04", agencias[0]["id"]), (None, agencias[2]["id"]), ("2025-12", None)]:
            saida.append({**base, "mes": mes, "agencia_id": ag})
    return saida


def casos_stats(rng: random.Random) -> list[dict]:
    saida = []
    agoras = ["2026-11-26T15:00:00+00:00", "2026-01-15T12:00:00+00:00", "2026-12-31T23:30:00+00:00", "2026-03-01T01:00:00+00:00",
              "2027-02-28T10:00:00+00:00", "2026-03-31T12:00:00+00:00"]
    for rodada in range(10):
        agencias = [
            {"id": _uid(0xA6), "empresa": "esta", "banco_sigla": "ITAU", "agencia": "0001", "numero": "12345", "ativa": True, "apagada": False, "ordem_insercao": 0},
            {"id": _uid(0xA6), "empresa": "esta", "banco_sigla": "BB", "agencia": "1234", "numero": "99887", "ativa": False, "apagada": False, "ordem_insercao": 1},
            {"id": _uid(0xA6), "empresa": "esta", "banco_sigla": "SICOOB", "agencia": "3069", "numero": "55555", "ativa": True, "apagada": True, "ordem_insercao": 2},
            {"id": _uid(0xA6), "empresa": "outra", "banco_sigla": "SAFRA", "agencia": "0005", "numero": "77777", "ativa": True, "apagada": False, "ordem_insercao": 3},
            {"id": _uid(0xA6), "empresa": "esta", "banco_sigla": "CAIXA", "agencia": "0420", "numero": "1001", "ativa": True, "apagada": False, "ordem_insercao": 4},
        ]
        inicio = date(2024, 9, 1)
        transacoes, registros, notas, comprovantes = [], [], [], []
        for _ in range(rng.randint(10, 60)):
            ag = rng.choice(agencias)
            dia = inicio + timedelta(days=rng.randint(0, 1000))
            t = {"id": _uid(0x7A), "empresa": ag["empresa"], "agencia_id": ag["id"], "data": dia.isoformat(), "apagada": rng.random() < 0.1}
            transacoes.append(t)
            if rng.random() < 0.6:
                for leg in range(rng.choice([1, 2, 2, 4])):
                    hora = rng.choice(["T00:00:00+00:00", "T23:30:00+00:00", "T02:00:00+00:00"])
                    registros.append({"id": _uid(0x8A), "empresa": t["empresa"], "transacao_id": t["id"], "agencia_id": ag["id"], "conta_id": None,
                                      "lancamento_id": _uid(0x1A), "dc": "DC"[leg % 2], "ordem_composicao": leg + 1,
                                      "data_lancamento": dia.isoformat() + hora, "apagado": rng.random() < 0.2})
        for _ in range(rng.randint(0, 6)):
            registros.append({"id": _uid(0x8A), "empresa": "esta", "transacao_id": None, "agencia_id": agencias[0]["id"], "conta_id": None,
                              "lancamento_id": _uid(0x1A), "dc": "D", "ordem_composicao": None,
                              "data_lancamento": (inicio + timedelta(days=rng.randint(0, 1000))).isoformat() + "T00:00:00+00:00", "apagado": False})
        pontas = ["T00:00:00+00:00", "T23:59:59.999000+00:00", "T12:00:00+00:00"]
        for _ in range(rng.randint(0, 20)):
            notas.append({"id": _uid(0x4F), "empresa": rng.choice(["esta"] * 9 + ["outra"]),
                          "data_emissao": (inicio + timedelta(days=rng.randint(0, 1000))).isoformat() + rng.choice(pontas), "apagada": rng.random() < 0.1})
        for _ in range(rng.randint(0, 20)):
            comprovantes.append({"id": _uid(0xC2), "empresa": rng.choice(["esta"] * 9 + ["outra"]),
                                 "data_pagamento": None if rng.random() < 0.15 else (inicio + timedelta(days=rng.randint(0, 1000))).isoformat() + rng.choice(pontas),
                                 "apagado": rng.random() < 0.1})
        base = {"mundo": _registrar({"agencias": agencias, "transacoes": transacoes, "registros": registros, "notas": notas, "comprovantes": comprovantes})}
        for meses in (12, 1, 24, 3, 13):
            saida.append({**base, "meses": meses, "agora": agoras[(rodada + meses) % len(agoras)]})
    # Sem movimento nenhum.
    saida.append({"agencias": [], "transacoes": [], "registros": [], "notas": [], "comprovantes": [], "meses": 12, "agora": agoras[0]})
    return saida


NOMES = ["EMPRESA ALFA LTDA", "EMPRESA BETA LTDA", "EMPRESA DELTA LTDA", "EMPRESA GAMA LTDA", "EMPRESA OMEGA LTDA", "EMPRESA SIGMA LTDA",
         "EMPRESA ZETA LTDA", "EMPRESA ALFA LTDA"]


def casos_carteira(rng: random.Random) -> list[dict]:
    saida = []
    for rodada in range(10):
        empresas = []
        for k, nome in enumerate(NOMES):
            empresas.append({"id": _uid(0xEA), "razao_social": nome, "ativa": rng.random() < 0.85, "apagada": rng.random() < 0.1,
                             "do_escritorio": rng.random() < 0.9, "permitida": rng.random() < 0.6, "ordem_insercao": k})
        transacoes = []
        dias = ["2026-07-31", "2026-08-01", "2026-08-10", "2026-08-31", "2026-09-01", "2024-02-29", "2026-02-28", "2026-12-31"]
        valores = ["100.50", "20.00", "3.00", "70.00", "0.01", "12345.67"]
        for emp in empresas:
            if rng.random() < 0.25:
                continue
            for _ in range(rng.randint(0, 8)):
                transacoes.append({"id": _uid(0x7A), "empresa_id": emp["id"], "data": rng.choice(dias), "valor": rng.choice(valores),
                                   "status": rng.choice(["pendente", "pendente", "processada", "erro"]), "apagada": rng.random() < 0.1})
        mundo = _registrar({"empresas": empresas, "transacoes": transacoes})
        for mes in ("2026-08", "2026-07", "2024-02", "2026-12", "2030-01"):
            for admin in (True, False):
                saida.append({"mundo": mundo, "admin": admin, "mes": mes})
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _guardar(tipo: str, origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": tipo, "origem": origem, "entrada": entrada, "saida": saida}
    casos.setdefault(json.dumps([tipo, entrada], sort_keys=True, ensure_ascii=False), caso)


async def _tudo() -> None:
    montado = _Montado()
    await montado.abrir()
    try:
        for tipo, entrada, real in _DA_SUITE:
            refeito = await montado.rodar(tipo, entrada, pg=False)
            if refeito != real:
                raise AssertionError(f"o banco montado não repete a suíte ({tipo}):\n{json.dumps(refeito, ensure_ascii=False)[:3000]}\n"
                                     f"{json.dumps(real, ensure_ascii=False)[:3000]}")
            limpa, _ = _sanitizar(tipo, entrada, real)
            _guardar(tipo, "suite", limpa, await montado.rodar(tipo, limpa))
        rng = random.Random(20261126)
        for tipo, gerar in (("divergencias", casos_divergencias), ("stats", casos_stats), ("carteira", casos_carteira)):
            for e in gerar(rng):
                completo = {**_MUNDOS[e["mundo"]], **e} if "mundo" in e else e
                _guardar(tipo, "inventado", e, await montado.rodar(tipo, completo))
    finally:
        await montado.fechar()


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    os.makedirs(pasta, exist_ok=True)
    asyncio.run(_tudo())
    ordem = {"suite": 0, "inventado": 1}
    lista = sorted(casos.values(), key=lambda c: (c["tipo"], ordem[c["origem"]]))
    itens = [{"id": n, **c} for n, c in enumerate(lista, start=1)]
    arquivos = _escrever_partes(pasta, "painel", itens)
    with open(os.path.join(pasta, "painel-mundos.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(_MUNDOS, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    arquivos.append("painel-mundos.json")
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        n = por_tipo.setdefault(c["tipo"], [0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
    resumo = ", ".join(f"{t}: {n} ({s} da suíte)" for t, (n, s) in sorted(por_tipo.items()))
    print(f"\ngabarito do painel: {len(itens)} casos — {resumo}; arquivos: {', '.join(arquivos)}")
