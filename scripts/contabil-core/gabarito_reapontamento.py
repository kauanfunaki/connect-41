"""Gabarito do reapontamento da conta bancária sintética (Bloco D, Fase D0, 26/11/2026).

Plugin do pytest: roda os testes de agências do original (dev41tech/contabil-core,
`tests/integration/test_agencias.py`) e grava cada chamada de `ReapontamentoService.reapontar`
(`src/domain/agencias/service.py:228-343`): a entrada (as linhas que o serviço lê e grava, de todas as
empresas, marcadas "esta" ou "outra") e a saída exata (o relatório e o que mudou: a conta de cada partida e
de cada decisão do NEO e as contas desativadas). Depois acrescenta casos inventados, com semente fixa:
várias contas bancárias, conta bancária sem a sintética, sintética já desativada, sintética com regra,
contraparte ou gasto de cartão apontando (vivos e apagados), decisões com a sintética como conta e como
conta da contraparte, partidas canceladas, conta bancária inativa, apagada ou sem vínculo, vinculada à
própria sintética, a outra empresa, o código com outra caixa e a conta vinculada já excluída. O porte em
TypeScript repete tudo em `src/lib/contabil-core/cadastro/reapontamento.test.ts`, com o mesmo laço do
servidor (`cadastro/reapontamento.ts`) sobre um banco montado com a mesma entrada.

A entrada traz também três referências que só o porte conta (outra conta bancária vinculada à sintética,
conta filha da sintética e componente de distribuição de fatura salvo nela). O original não as lê; o banco
montado cria as duas primeiras (que existem nas tabelas do original) e não cria a distribuição (o original
não abre essa tabela). Os casos em que elas mudam o resultado são divergências contadas no teste.

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a entrada. As
chamadas da suíte também rodam assim e o resultado tem de ser igual ao da suíte de verdade (senão o plugin
aborta). Nada aqui depende do que o SQLite faz diferente do PostgreSQL: o serviço só compara ids e o código
(que o SQLite compara byte a byte, como o PostgreSQL), e o `rowcount` do `UPDATE` conta as linhas achadas
nos dois.

Dados: nada de cliente. Os textos da suíte são de exemplo ("BB", "1622"); os da conta bancária passam pelo
`sanitizar_texto` (GABARITO_NOMES, fora do git), por garantia. Os ids inventados começam por letra (no SQLite
a coluna UUID tem afinidade numérica), e os documentos das contrapartes começam com 9.

Uso, a partir da raiz do contabil-core (o `-I` ignora o PYTHONPATH, então o caminho do plugin entra pelo `-c`):
    GABARITO_DIR=<connect>/src/lib/contabil-core/cadastro/gabarito/reapontamento \\
        python -I -B -W ignore -c "import sys; sys.path.insert(0, '<connect>/scripts/contabil-core'); import pytest; \\
        sys.exit(pytest.main(['-q', '-p', 'no:cacheprovider', '-p', 'gabarito_reapontamento', \\
        'tests/integration/test_agencias.py']))"
"""
from __future__ import annotations

import asyncio
import itertools
import json
import os
import random
import sys
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402
from gabarito_revisao import _escrever_partes  # noqa: E402

_ORIGINAL: dict = {}
_EM: dict = {"montado": False}
_DA_SUITE: list[tuple[dict, dict]] = []
casos: list[dict] = []

_A = 0xA << 124
TENANT_ID = uuid.UUID(int=_A | 0x7E0)
EMPRESA_ID = uuid.UUID(int=_A | 0xE1)
OUTRA_ID = uuid.UUID(int=_A | 0xE2)


# ─── O que o serviço lê e grava ─────────────────────────────────────────────

async def _estado(db, empresa_id) -> dict:
    """As linhas das tabelas que o serviço toca, de todas as empresas, na ordem de criação."""
    from sqlalchemy import select

    from src.db.models import AgenciaBancaria, Contraparte, LancamentoCartao, NeoDecisao, PlanoConta, RegistroContabil, Regra

    def emp(x):
        return "esta" if x == empresa_id else "outra"

    def i(x):
        return None if x is None else str(x)

    async def linhas(modelo, *colunas):
        ordem = (modelo.created_at, modelo.id) if hasattr(modelo, "created_at") else (modelo.id,)
        return (await db.execute(select(*colunas).order_by(*ordem))).all()

    A, P, R, D, G, C, L = AgenciaBancaria, PlanoConta, RegistroContabil, NeoDecisao, Regra, Contraparte, LancamentoCartao
    return {
        "agencias": [
            {"id": i(a.id), "empresa": emp(a.empresa_id), "banco_sigla": a.banco_sigla, "agencia": a.agencia, "numero": a.numero,
             "digito": a.digito, "ativa": a.ativa, "conta_contabil_id": i(a.conta_contabil_id), "apagada": a.deleted_at is not None}
            for a in await linhas(A, A.id, A.empresa_id, A.banco_sigla, A.agencia, A.numero, A.digito, A.ativa, A.conta_contabil_id, A.deleted_at)
        ],
        "contas": [
            {"id": i(c.id), "empresa": emp(c.empresa_id), "codigo": c.codigo, "conta_numero": c.conta_numero, "pai_id": i(c.pai_id),
             "apagada": c.deleted_at is not None}
            for c in await linhas(P, P.id, P.empresa_id, P.codigo, P.conta_numero, P.pai_id, P.deleted_at)
        ],
        "registros": [
            {"id": i(r.id), "empresa": emp(r.empresa_id), "conta_id": i(r.conta_id), "agencia_id": i(r.agencia_id), "apagado": r.deleted_at is not None}
            for r in await linhas(R, R.id, R.empresa_id, R.conta_id, R.agencia_id, R.deleted_at)
        ],
        "decisoes": [
            {"id": i(d.id), "empresa": emp(d.empresa_id), "conta_id": i(d.conta_id), "conta_contraparte_id": i(d.conta_contraparte_id)}
            for d in await linhas(D, D.id, D.empresa_id, D.conta_id, D.conta_contraparte_id)
        ],
        "regras": [
            {"id": i(g.id), "empresa": emp(g.empresa_id), "conta_id": i(g.conta_id), "ativa": g.ativa, "apagada": g.deleted_at is not None}
            for g in await linhas(G, G.id, G.empresa_id, G.conta_id, G.ativa, G.deleted_at)
        ],
        "contrapartes": [
            {"id": i(c.id), "empresa": emp(c.empresa_id), "conta_contabil_id": i(c.conta_contabil_id), "apagada": c.deleted_at is not None}
            for c in await linhas(C, C.id, C.empresa_id, C.conta_contabil_id, C.deleted_at)
        ],
        "lancamentos_cartao": [
            {"id": i(x.id), "empresa": emp(x.empresa_id), "conta_id": i(x.conta_id), "apagado": x.deleted_at is not None}
            for x in await linhas(L, L.id, L.empresa_id, L.conta_id, L.deleted_at)
        ],
        # Só o porte lê (o original não abre `fatura_distribuicoes`): a suíte não as cria.
        "distribuicoes": [],
    }


def _mudancas(antes: dict, depois: dict) -> dict:
    """O que o serviço mudou: a conta de cada partida e de cada decisão, e as contas desativadas."""
    reg = {r["id"]: r["conta_id"] for r in antes["registros"]}
    dec = {d["id"]: (d["conta_id"], d["conta_contraparte_id"]) for d in antes["decisoes"]}
    apagadas = {c["id"] for c in antes["contas"] if c["apagada"]}
    return {
        "registros": {r["id"]: r["conta_id"] for r in depois["registros"] if reg.get(r["id"]) != r["conta_id"]},
        "decisoes": {
            d["id"]: {"conta_id": d["conta_id"], "conta_contraparte_id": d["conta_contraparte_id"]}
            for d in depois["decisoes"] if dec.get(d["id"]) != (d["conta_id"], d["conta_contraparte_id"])
        },
        "contas_desativadas": [c["id"] for c in depois["contas"] if c["apagada"] and c["id"] not in apagadas],
    }


async def _chamar(db, empresa_id) -> dict:
    from src.domain.agencias.service import ReapontamentoService

    antes = await _estado(db, empresa_id)
    relatorio = await _ORIGINAL["reapontar"](ReapontamentoService(db=db, empresa_id=empresa_id))
    await db.flush()
    depois = await _estado(db, empresa_id)
    return {"relatorio": relatorio, "mudou": _mudancas(antes, depois)}


# ─── O banco montado com a entrada ──────────────────────────────────────────

_ENGINE: dict = {}


async def _engine():
    if "e" not in _ENGINE:
        from sqlalchemy.ext.asyncio import create_async_engine

        from src.db.functions import registrar_funcoes_sqlite
        from src.db.models import Base

        engine = create_async_engine("sqlite+aiosqlite:///:memory:", query_cache_size=0)
        registrar_funcoes_sqlite(engine)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _ENGINE["e"] = engine
    return _ENGINE["e"]


async def _montar(db, e: dict) -> None:
    from src.db.models import (
        AgenciaBancaria, CartaoCredito, Contraparte, Empresa, FaturaCartao, LancamentoCartao, NeoDecisao, PlanoConta, RegistroContabil, Regra,
        Tenant, Transacao,
    )

    base = datetime(2026, 1, 1, tzinfo=UTC)
    ordem = itertools.count(1)

    def quando():
        return base + timedelta(minutes=next(ordem))

    apagado = datetime(2026, 3, 9, tzinfo=UTC)
    db.add(Tenant(id=TENANT_ID, nome="Escritório do gabarito", cnpj="00.000.000/0001-00"))
    await db.flush()
    db.add_all([
        Empresa(id=EMPRESA_ID, tenant_id=TENANT_ID, razao_social="EMPRESA EXEMPLO LTDA", cnpj="96.385.274/0001-03", regime_tributario="simples_nacional"),
        Empresa(id=OUTRA_ID, tenant_id=TENANT_ID, razao_social="OUTRA EMPRESA", cnpj="97.418.529/0001-07", regime_tributario="simples_nacional"),
    ])
    await db.flush()

    def eid(x):
        return OUTRA_ID if x["empresa"] == "outra" else EMPRESA_ID

    def u(x):
        return None if x is None else uuid.UUID(x)

    for c in e["contas"]:
        db.add(PlanoConta(id=u(c["id"]), empresa_id=eid(c), codigo=c["codigo"], conta_numero=c["conta_numero"], descricao=f"Conta {c['codigo']}",
                          tipo="ativo", tipo_sa="A", created_at=quando(), deleted_at=apagado if c["apagada"] else None))
    await db.flush()
    for c in e["contas"]:
        if c["pai_id"]:
            (await db.get(PlanoConta, u(c["id"]))).pai_id = u(c["pai_id"])
    await db.flush()
    for a in e["agencias"]:
        db.add(AgenciaBancaria(id=u(a["id"]), empresa_id=eid(a), banco_sigla=a["banco_sigla"], agencia=a["agencia"], numero=a["numero"], digito=a["digito"],
                               ativa=a["ativa"], conta_contabil_id=u(a["conta_contabil_id"]), created_at=quando(),
                               deleted_at=apagado if a["apagada"] else None))
    # Uma conta bancária de apoio por empresa, sem conta contábil (o serviço a ignora): dá agência às partidas e
    # às transações das decisões.
    apoio = {}
    for empresa, n in ((EMPRESA_ID, "esta"), (OUTRA_ID, "outra")):
        apoio[n] = AgenciaBancaria(empresa_id=empresa, banco_sigla="ZZ", agencia="0", numero=f"apoio-{n}", ativa=True, created_at=quando())
        db.add(apoio[n])
    await db.flush()
    for r in e["registros"]:
        db.add(RegistroContabil(
            id=u(r["id"]), empresa_id=eid(r), transacao_id=None, lancamento_id=uuid.uuid4(), conta_id=u(r["conta_id"]),
            agencia_id=u(r["agencia_id"]) if r["agencia_id"] else apoio[r["empresa"]].id, descricao="X", historico="X", historico_extrato="X",
            dc="D", tipo_regra="automatica", valor=Decimal("1.00"), data_lancamento=base, created_at=quando(),
            deleted_at=apagado if r["apagado"] else None,
        ))
    for k, d in enumerate(e["decisoes"]):
        t = Transacao(empresa_id=eid(d), agencia_id=apoio[d["empresa"]].id, data=date(2026, 1, 5), valor=Decimal("1.00"), historico="X", dc="D",
                      status="processada", hash_dedup=f"{k:064x}", created_at=quando())
        db.add(t)
        await db.flush()
        db.add(NeoDecisao(id=u(d["id"]), empresa_id=eid(d), transacao_id=t.id, conta_id=u(d["conta_id"]), conta_contraparte_id=u(d["conta_contraparte_id"]),
                          resultado="associada"))
    for k, g in enumerate(e["regras"]):
        db.add(Regra(id=u(g["id"]), empresa_id=eid(g), conta_id=u(g["conta_id"]), descricao="Regra", historico=f"REGRA {k}",
                     historico_normalizado=f"regra {k}", dc="D", tipo="automatica", ativa=g["ativa"], created_at=quando(),
                     deleted_at=apagado if g["apagada"] else None))
    for k, c in enumerate(e["contrapartes"]):
        db.add(Contraparte(id=u(c["id"]), empresa_id=eid(c), tipo="fornecedor", documento=f"9{k:013d}", razao_social=f"CONTRAPARTE {k}",
                           conta_contabil_id=u(c["conta_contabil_id"]), origem="manual", created_at=quando(),
                           deleted_at=apagado if c["apagada"] else None))
    await db.flush()
    if e["lancamentos_cartao"]:
        faturas = {}
        for empresa, n in ((EMPRESA_ID, "esta"), (OUTRA_ID, "outra")):
            cartao = CartaoCredito(empresa_id=empresa, nome="Cartão", bandeira="visa", ultimos_digitos="0000", dia_fechamento=1, dia_vencimento=10,
                                   ativo=True, created_at=quando())
            db.add(cartao)
            await db.flush()
            faturas[n] = FaturaCartao(empresa_id=empresa, cartao_id=cartao.id, competencia="2026-01", valor_total=Decimal("0"), status="aberta",
                                      created_at=quando())
            db.add(faturas[n])
        await db.flush()
        for x in e["lancamentos_cartao"]:
            db.add(LancamentoCartao(id=u(x["id"]), empresa_id=eid(x), fatura_id=faturas[x["empresa"]].id, data_compra=base, descricao="Gasto",
                                    valor=Decimal("1.00"), conta_id=u(x["conta_id"]), created_at=quando(), deleted_at=apagado if x["apagado"] else None))
    await db.flush()


async def _rodar(e: dict) -> dict:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    factory = async_sessionmaker(await _engine(), expire_on_commit=False, autoflush=False)
    async with factory() as db:
        _EM["montado"] = True
        try:
            await _montar(db, e)
            return await _chamar(db, EMPRESA_ID)
        finally:
            _EM["montado"] = False
            await db.rollback()


# ─── Gravação da suíte ──────────────────────────────────────────────────────

def pytest_configure(config):  # noqa: ARG001
    from src.domain.agencias import service as S

    if getattr(S, "__gabarito__", False):
        return
    S.__gabarito__ = True
    original = S.ReapontamentoService.reapontar
    _ORIGINAL["reapontar"] = original

    async def reapontar(self):
        if _EM["montado"]:
            return await original(self)
        db, empresa_id = self._db, self._empresa_id
        antes = await _estado(db, empresa_id)
        relatorio = await original(self)
        await db.flush()
        depois = await _estado(db, empresa_id)
        # Só as linhas desta empresa: as de outros testes não importam ao serviço (que lê as agências e as contas
        # da empresa) e colidiriam nas unicidades ao virar "a outra" no banco montado.
        entrada = {k: [x for x in v if x.get("empresa") == "esta"] for k, v in antes.items()}
        _DA_SUITE.append((entrada, {"relatorio": relatorio, "mudou": _mudancas(antes, depois)}))
        return relatorio

    S.ReapontamentoService.reapontar = reapontar


# ─── Casos inventados ───────────────────────────────────────────────────────

class Mundo:
    """Uma empresa (mais a outra) montada por sorteio; `entrada()` devolve o formato do gabarito."""

    def __init__(self, rng: random.Random):
        self.rng = rng
        self.e = {k: [] for k in ("agencias", "contas", "registros", "decisoes", "regras", "contrapartes", "lancamentos_cartao", "distribuicoes")}
        self.n = itertools.count(1)

    def id(self) -> str:
        return str(uuid.UUID(int=_A | (self.rng.getrandbits(100) << 20) | next(self.n)))

    def conta(self, codigo: str | None = None, empresa="esta", apagada=False, conta_numero=None, pai_id=None) -> dict:
        c = {"id": self.id(), "empresa": empresa, "codigo": codigo or f"1.1.1.{next(self.n):03d}", "conta_numero": conta_numero, "pai_id": pai_id,
             "apagada": apagada}
        self.e["contas"].append(c)
        return c

    def agencia(self, empresa="esta", conta_id=None, ativa=True, apagada=False, digito=None) -> dict:
        k = next(self.n)
        a = {"id": self.id(), "empresa": empresa, "banco_sigla": self.rng.choice(["BB", "ITAU", "SICOOB", "756", "BRADESCO"]),
             "agencia": f"{1000 + k}", "numero": f"{20000 + k}", "digito": digito, "ativa": ativa, "conta_contabil_id": conta_id, "apagada": apagada}
        self.e["agencias"].append(a)
        return a

    def sintetica(self, a: dict, apagada=False, caixa_alta=False) -> dict:
        codigo = f"1.1.B.{uuid.UUID(a['id']).hex[:16]}"
        if caixa_alta:
            codigo = "1.1.b." + codigo[6:].upper()
        return self.conta(codigo, empresa=a["empresa"], apagada=apagada)

    def registros(self, conta: dict, agencia: dict | None, n: int, apagados=0) -> None:
        for k in range(n):
            self.e["registros"].append({"id": self.id(), "empresa": conta["empresa"], "conta_id": conta["id"],
                                        "agencia_id": agencia["id"] if agencia else None, "apagado": k < apagados})

    def decisao(self, empresa="esta", conta_id=None, conta_contraparte_id=None) -> None:
        self.e["decisoes"].append({"id": self.id(), "empresa": empresa, "conta_id": conta_id, "conta_contraparte_id": conta_contraparte_id})

    def regra(self, conta: dict, ativa=True, apagada=False) -> None:
        self.e["regras"].append({"id": self.id(), "empresa": conta["empresa"], "conta_id": conta["id"], "ativa": ativa, "apagada": apagada})

    def contraparte(self, conta: dict, apagada=False) -> None:
        self.e["contrapartes"].append({"id": self.id(), "empresa": conta["empresa"], "conta_contabil_id": conta["id"], "apagada": apagada})

    def gasto(self, conta: dict | None, empresa="esta", apagado=False) -> None:
        self.e["lancamentos_cartao"].append({"id": self.id(), "empresa": empresa, "conta_id": conta["id"] if conta else None, "apagado": apagado})

    def distribuicao(self, contas: list[dict], fatura_apagada=False) -> None:
        partes = {self.id(): [{"conta_id": c["id"], "historico": "Gasto", "valor": "1.00"}] for c in contas}
        self.e["distribuicoes"].append({"id": self.id(), "empresa": "esta", "fatura_apagada": fatura_apagada, "distribuicoes": partes})

    def entrada(self) -> dict:
        return json.loads(json.dumps(self.e))


def _agencia_corrigida(m: Mundo, *, n_reg=None, n_dec=None, **kw) -> tuple[dict, dict, dict]:
    """A conta bancária com a conta real vinculada e a sintética viva com partidas e decisões."""
    rng = m.rng
    real = m.conta(conta_numero=rng.randint(1, 9999))
    a = m.agencia(conta_id=real["id"], **kw)
    s = m.sintetica(a)
    m.registros(s, a, rng.randint(0, 6) if n_reg is None else n_reg, apagados=rng.randint(0, 1))
    for _ in range(rng.randint(0, 3) if n_dec is None else n_dec):
        lado = rng.random()
        m.decisao(conta_id=s["id"] if lado < 0.7 else real["id"], conta_contraparte_id=s["id"] if lado > 0.5 else None)
    return a, real, s


def casos_inventados(rng: random.Random) -> list[tuple[str, dict]]:
    out: list[tuple[str, dict]] = []

    def caso(nome: str, m: Mundo):
        out.append((nome, m.entrada()))

    # O caminho normal, de uma a quatro contas bancárias.
    for _ in range(12):
        m = Mundo(rng)
        for _ in range(rng.randint(1, 4)):
            _agencia_corrigida(m, digito=rng.choice([None, "", "7"]))
        caso("normal", m)

    # Nada a corrigir: sem sintética, sintética já desativada, sem vínculo, apagada, código com outra caixa.
    m = Mundo(rng)
    real = m.conta(conta_numero=10)
    m.agencia(conta_id=real["id"])
    caso("sem_sintetica", m)
    m = Mundo(rng)
    real = m.conta(conta_numero=11)
    a = m.agencia(conta_id=real["id"])
    s = m.sintetica(a, apagada=True)
    m.registros(s, a, 3)
    caso("sintetica_ja_desativada", m)
    m = Mundo(rng)
    a = m.agencia(conta_id=None)
    s = m.sintetica(a)
    m.registros(s, a, 2)
    caso("agencia_sem_vinculo", m)
    m = Mundo(rng)
    real = m.conta(conta_numero=12)
    a = m.agencia(conta_id=real["id"], apagada=True)
    s = m.sintetica(a)
    m.registros(s, a, 2)
    caso("agencia_apagada", m)
    m = Mundo(rng)
    real = m.conta(conta_numero=13)
    a = m.agencia(conta_id=real["id"])
    s = m.sintetica(a, caixa_alta=True)
    m.registros(s, a, 2)
    caso("codigo_com_outra_caixa", m)

    # Conta bancária inativa continua (o original não olha `ativa`).
    for _ in range(3):
        m = Mundo(rng)
        _agencia_corrigida(m, ativa=False)
        if rng.random() < 0.6:
            _agencia_corrigida(m)
        caso("agencia_inativa", m)

    # As referências do original: regra, contraparte e gasto de cartão (vivos, inativos e apagados).
    for alvo in ("regra", "regra_inativa", "regra_apagada", "contraparte", "contraparte_apagada", "gasto", "gasto_apagado", "varias"):
        for _ in range(2):
            m = Mundo(rng)
            a, real, s = _agencia_corrigida(m)
            if alvo.startswith("regra") or alvo == "varias":
                m.regra(s, ativa=alvo != "regra_inativa", apagada=alvo == "regra_apagada")
            if alvo.startswith("contraparte") or alvo == "varias":
                m.contraparte(s, apagada=alvo == "contraparte_apagada")
            if alvo.startswith("gasto") or alvo == "varias":
                m.gasto(s, apagado=alvo == "gasto_apagado")
                m.gasto(real)
            if rng.random() < 0.5:
                _agencia_corrigida(m)
            caso(f"referencia_{alvo}", m)

    # Decisões: a sintética como conta, como conta da contraparte e como as duas.
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m, n_reg=2, n_dec=0)
    m.decisao(conta_id=s["id"])
    m.decisao(conta_contraparte_id=s["id"])
    m.decisao(conta_id=s["id"], conta_contraparte_id=s["id"])
    m.decisao(conta_id=real["id"], conta_contraparte_id=real["id"])
    caso("decisoes", m)

    # Partidas canceladas também vão (o original não olha `deleted_at`).
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m, n_reg=0, n_dec=0)
    m.registros(s, a, 4, apagados=4)
    caso("partidas_canceladas", m)

    # A outra empresa não é tocada (nem a sintética dela, nem as partidas).
    for _ in range(2):
        m = Mundo(rng)
        _agencia_corrigida(m)
        real_o = m.conta(empresa="outra", conta_numero=40)
        a_o = m.agencia(empresa="outra", conta_id=real_o["id"])
        s_o = m.sintetica(a_o)
        m.registros(s_o, a_o, 3)
        m.decisao(empresa="outra", conta_id=s_o["id"])
        caso("outra_empresa", m)

    # A conta vinculada já excluída: o original move para ela assim mesmo.
    m = Mundo(rng)
    real = m.conta(conta_numero=50, apagada=True)
    a = m.agencia(conta_id=real["id"])
    s = m.sintetica(a)
    m.registros(s, a, 2)
    caso("conta_vinculada_excluida", m)

    # Partidas de outra conta bancária na sintética (o original move todas as da conta, não só as da agência).
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m, n_reg=2, n_dec=0)
    b = m.agencia(conta_id=m.conta(conta_numero=60)["id"])
    m.registros(s, b, 2)
    caso("partidas_de_outra_agencia", m)

    # Divergência: a conta bancária ainda vinculada à PRÓPRIA sintética (o estado em que o NEO a deixa).
    for _ in range(3):
        m = Mundo(rng)
        a = m.agencia()
        s = m.sintetica(a)
        a["conta_contabil_id"] = s["id"]
        m.registros(s, a, rng.randint(0, 3))
        m.decisao(conta_id=s["id"])
        if rng.random() < 0.6:
            _agencia_corrigida(m)
        caso("vinculada_a_propria_sintetica", m)

    # Divergência: referências que só o porte conta.
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m)
    m.agencia(conta_id=s["id"])
    caso("connect_outra_agencia_na_sintetica", m)
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m)
    m.conta(pai_id=s["id"])
    caso("connect_conta_filha", m)
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m)
    m.conta(pai_id=s["id"], apagada=True)
    caso("connect_conta_filha_apagada", m)
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m)
    m.distribuicao([s, real])
    caso("connect_distribuicao", m)
    m = Mundo(rng)
    a, real, s = _agencia_corrigida(m)
    m.distribuicao([s], fatura_apagada=True)
    m.distribuicao([real])
    caso("connect_distribuicao_de_fatura_apagada", m)
    return out


# ─── Fim: repete a suíte no banco montado e grava ──────────────────────────

def _sanitizar(e: dict) -> dict:
    e = json.loads(json.dumps(e))
    for a in e["agencias"]:
        for k in ("banco_sigla", "agencia", "numero", "digito"):
            if isinstance(a[k], str):
                a[k] = sanitizar_texto(a[k])
    return e


async def _tudo() -> None:
    for entrada, saida in _DA_SUITE:
        repetida = await _rodar(entrada)
        if repetida != saida:
            raise SystemExit("o banco montado não repete a suíte:\n" + json.dumps(saida, ensure_ascii=False) + "\n" + json.dumps(repetida, ensure_ascii=False))
        limpa = _sanitizar(entrada)
        casos.append({"tipo": "suite", "origem": "suite", "entrada": limpa, "saida": await _rodar(limpa)})
    rng = random.Random(20261126)
    for nome, entrada in casos_inventados(rng):
        casos.append({"tipo": nome, "origem": "inventado", "entrada": entrada, "saida": await _rodar(entrada)})


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    asyncio.run(_tudo())
    if not _DA_SUITE:
        raise SystemExit("a suíte não chamou o reapontamento")
    itens = [{"id": n, **c} for n, c in enumerate(casos, start=1)]
    os.makedirs(pasta, exist_ok=True)
    arquivos = _escrever_partes(pasta, "reapontamento", itens)
    por: dict[str, int] = {}
    for c in itens:
        por[c["origem"]] = por.get(c["origem"], 0) + 1
    relatos = sum(len(c["saida"]["relatorio"]) for c in itens)
    print(f"\ngabarito do reapontamento: {len(itens)} casos {por}, {relatos} linhas de relatório; arquivos: {', '.join(arquivos)}")
