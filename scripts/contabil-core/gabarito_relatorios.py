"""Gabarito dos relatórios do Contábil Core (Bloco D, Fase D2, 26/11/2026): DRE, Balancete e Livro Caixa.

Plugin do pytest: roda os testes do original (dev41tech/contabil-core) dos relatórios e grava cada chamada de
`RelatoriosService.dre`, `.balancete` e `.livro_caixa` (`src/domain/relatorios/service.py`): a entrada (o que o
serviço pode ler do banco e os argumentos) e a resposta exata (`model_dump(mode="json")`, sem o `empresa_id`).
Depois acrescenta casos inventados, com semente fixa: um plano com hierarquia (sintéticas e analíticas de
ativo, passivo, patrimônio líquido, receita, custo, despesa, resultado e um tipo fora da lista), contas
apagadas com e sem movimento, o mesmo código numa conta viva e numa apagada, uma conta de outra empresa;
partidas vivas e canceladas, nas bordas do período (com horas diferentes da meia-noite UTC), de outra empresa;
várias contas bancárias (ativa, inativa, apagada, sem dígito, de outra empresa) com transações vivas e
desfeitas, várias no mesmo dia; valores de um centavo a 13 dígitos; e os períodos: sem datas, só uma das
pontas, o mês, um dia, a virada do mês e do ano, um período vazio e o invertido.
O porte em TypeScript repete tudo em `src/lib/contabil-core/relatorios/relatorios.test.ts`.

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a entrada
gravada (sanitizada). As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o resultado tem
de ser igual ao da suíte de verdade (senão o plugin aborta). O banco montado se comporta como o PostgreSQL da
produção onde o SQLite difere:
- os instantes são comparados em UTC (o `_instalar_pg` de `gabarito_exportacao.py`);
- o `SUM` do dinheiro é exato (o SQLite guarda `Numeric` como `REAL` e soma em ponto flutuante: com valores de
  13 dígitos a soma perde centavos; o PostgreSQL soma `numeric` sem arredondar).

O PERÍODO dos casos inventados é o que a tela do original manda: `data_de` à meia-noite e `data_ate` às
23:59:59.999 do dia, que o servidor da produção (em UTC) lê como UTC. No DRE e no Balancete eles vão como
instantes; no Livro Caixa, como datas.

Dados: os textos (históricos, códigos e descrições) passam pelo sanitizador (GABARITO_NOMES e CNPJs fictícios
começando com 9). A razão social da empresa não é gravada.

Uso, a partir da raiz do contabil-core (os testes usam SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/relatorios/gabarito \\
        python -I -W ignore -m pytest -q -p gabarito_relatorios tests/integration/test_relatorios.py
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
from datetime import UTC, date, datetime, time
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gabarito_exportacao as GE  # noqa: E402
from gabarito_cruzamento import sanitizar_texto  # noqa: E402
from gabarito_revisao import _escrever_partes  # noqa: E402

_ORIGINAL: dict = {}
_DA_SUITE: list[tuple[str, dict, dict]] = []
_MUNDOS: dict[str, dict] = {}
_DENTRO = {"sim": False}
casos: dict[str, dict] = {}

EMPRESA_ID = "00000000-0000-0000-0000-00000000e3a5"
_APAGADO = datetime(2026, 1, 9, tzinfo=UTC)


def _registrar(mundo: dict) -> str:
    """Os mundos inventados vão uma vez só para `relatorios-mundos.json`; o caso leva a chave."""
    k = f"m{len(_MUNDOS) + 1}"
    _MUNDOS[k] = mundo
    return k


def _iso(v):
    if v is None:
        return None
    return v.isoformat()


def _din(v) -> str | None:
    return None if v is None else str(Decimal(str(v)))


def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


# ─── O SUM exato no banco montado ───────────────────────────────────────────

class _Soma:
    """`sum()` do SQLite trocado: no modo PostgreSQL, soma exata em `Decimal` e devolve o texto."""

    def __init__(self):
        self.exata: Decimal | None = None
        self.flutuante: float | int | None = None

    def step(self, v):
        if v is None:
            return
        if GE._EM_CURSO["pg"]:
            # Cada valor de `Numeric(15,2)` tem até 15 dígitos: o `repr` do double devolve o decimal exato.
            d = Decimal(repr(v)) if isinstance(v, float) else Decimal(str(v))
            self.exata = d if self.exata is None else self.exata + d
        else:
            self.flutuante = v if self.flutuante is None else self.flutuante + v

    def finalize(self):
        if GE._EM_CURSO["pg"]:
            return None if self.exata is None else str(self.exata)
        return self.flutuante


def _instalar_soma() -> None:
    """O resultado de texto do `sum()` exato volta como `Decimal` (o `Numeric` do SQLite só espera número)."""
    from sqlalchemy.sql import sqltypes

    r0 = sqltypes.Numeric.result_processor

    def result_processor(self, dialect, coltype):
        p = r0(self, dialect, coltype)

        def proc(v):
            if isinstance(v, str):
                return Decimal(v)
            return p(v) if p else v
        return proc

    sqltypes.Numeric.result_processor = result_processor


class _Montado(GE._Montado):
    async def abrir(self):
        from sqlalchemy import event
        from sqlalchemy.ext.asyncio import create_async_engine

        from src.db.functions import registrar_funcoes_sqlite
        from src.db.models import Base

        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:", query_cache_size=0)
        registrar_funcoes_sqlite(self.engine)

        @event.listens_for(self.engine.sync_engine, "connect")
        def _funcoes(dbapi, _rec):
            # O adaptador do aiosqlite só expõe `create_function`; o agregado é criado na thread da conexão.
            from sqlalchemy.util.concurrency import await_

            bruta = dbapi.driver_connection
            await_(bruta._execute(bruta._conn.create_aggregate, "sum", 1, _Soma))

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def rodar(self, metodo: str, e: dict, pg: bool = True) -> dict:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        factory = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with factory() as db:
            try:
                GE._EM_CURSO["montado"] = True
                GE._EM_CURSO["pg"] = pg
                _DENTRO["sim"] = True
                return await _executar(db, metodo, e)
            finally:
                GE._EM_CURSO["montado"] = False
                GE._EM_CURSO["pg"] = False
                _DENTRO["sim"] = False
                await db.rollback()


# ─── Foto (o que o serviço pode ler) ────────────────────────────────────────

async def _foto(db, empresa_id) -> dict:
    from sqlalchemy import select

    from src.db.models import AgenciaBancaria, PlanoConta, RegistroContabil, Transacao

    async def todas(modelo):
        return list((await db.execute(select(modelo))).scalars())

    def quem(x):
        return "esta" if x.empresa_id == empresa_id else "outra"

    return {
        "contas": [{"id": str(c.id), "empresa": quem(c), "codigo": c.codigo, "descricao": c.descricao, "tipo": c.tipo,
                    "apagada": c.deleted_at is not None, "ordem_insercao": k} for k, c in enumerate(await todas(PlanoConta))],
        "registros": [{"id": str(r.id), "empresa": quem(r), "conta_id": str(r.conta_id), "agencia_id": str(r.agencia_id), "dc": r.dc,
                       "valor": _din(r.valor), "data_lancamento": GE._iso(r.data_lancamento), "apagado": r.deleted_at is not None,
                       "ordem_insercao": k} for k, r in enumerate(await todas(RegistroContabil))],
        "agencias": [{"id": str(a.id), "empresa": quem(a), "banco_sigla": a.banco_sigla, "agencia": a.agencia, "numero": a.numero,
                      "digito": a.digito, "ativa": a.ativa, "apagada": a.deleted_at is not None, "ordem_insercao": k}
                     for k, a in enumerate(await todas(AgenciaBancaria))],
        "transacoes": [{"id": str(t.id), "empresa": quem(t), "agencia_id": str(t.agencia_id), "data": t.data.isoformat()[:10], "valor": _din(t.valor),
                        "historico": t.historico, "dc": t.dc, "apagada": t.deleted_at is not None, "ordem_insercao": k}
                       for k, t in enumerate(await todas(Transacao))],
    }


# ─── O banco montado ────────────────────────────────────────────────────────

async def _base(db, e: dict):
    from src.db.models import AgenciaBancaria, Empresa, PlanoConta, RegistroContabil, Tenant, Transacao

    tenant = Tenant(nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    db.add(tenant)
    await db.flush()
    empresa = Empresa(id=uuid.UUID(EMPRESA_ID), tenant_id=tenant.id, razao_social="EMPRESA EXEMPLO LTDA", cnpj="12.345.678/0001-95",
                      regime_tributario="simples_nacional")
    outra = Empresa(tenant_id=tenant.id, razao_social="OUTRA EMPRESA LTDA", cnpj="99.999.999/0001-91", regime_tributario="simples_nacional")
    db.add_all([empresa, outra])
    await db.flush()

    def de(x):
        return outra.id if x.get("empresa") == "outra" else empresa.id

    for a in sorted(e["agencias"], key=lambda a: a["ordem_insercao"]):
        db.add(AgenciaBancaria(id=uuid.UUID(a["id"]), empresa_id=de(a), banco_sigla=a["banco_sigla"], agencia=a["agencia"], numero=a["numero"],
                               digito=a["digito"], ativa=a["ativa"], deleted_at=_APAGADO if a["apagada"] else None))
        await db.flush()
    for c in sorted(e["contas"], key=lambda c: c["ordem_insercao"]):
        db.add(PlanoConta(id=uuid.UUID(c["id"]), empresa_id=de(c), codigo=c["codigo"], descricao=c["descricao"], tipo=c["tipo"],
                          deleted_at=_APAGADO if c["apagada"] else None))
        await db.flush()
    for t in sorted(e["transacoes"], key=lambda t: t["ordem_insercao"]):
        db.add(Transacao(id=uuid.UUID(t["id"]), empresa_id=de(t), agencia_id=uuid.UUID(t["agencia_id"]), data=date.fromisoformat(t["data"]),
                         valor=Decimal(t["valor"]), historico=t["historico"], dc=t["dc"], hash_dedup=t["id"].replace("-", "") * 2,
                         deleted_at=_APAGADO if t["apagada"] else None))
        await db.flush()
    for r in sorted(e["registros"], key=lambda r: r["ordem_insercao"]):
        db.add(RegistroContabil(
            id=uuid.UUID(r["id"]), empresa_id=de(r), conta_id=uuid.UUID(r["conta_id"]), agencia_id=uuid.UUID(r["agencia_id"]),
            descricao="x", historico="x", historico_extrato="x", dc=r["dc"], tipo_regra="manual", valor=Decimal(r["valor"]),
            data_lancamento=GE._dt(r["data_lancamento"]), deleted_at=_APAGADO if r["apagado"] else None,
            cancelado_em=_APAGADO if r["apagado"] else None,
        ))
        await db.flush()
    return empresa


async def _executar(db, metodo: str, e: dict) -> dict:
    from src.domain.relatorios.service import RelatoriosService

    empresa = await _base(db, e)
    svc = RelatoriosService(db, empresa.id)
    if metodo == "livro_caixa":
        dia = lambda v: date.fromisoformat(v) if v else None  # noqa: E731
        r = await _ORIGINAL["livro_caixa"](svc, data_de=dia(e["data_de"]), data_ate=dia(e["data_ate"]))
    else:
        r = await _ORIGINAL[metodo](svc, data_de=GE._dt(e["data_de"]), data_ate=GE._dt(e["data_ate"]))
    saida = r.model_dump(mode="json")
    saida.pop("empresa_id")
    return saida


# ─── Gravação da suíte ──────────────────────────────────────────────────────

def pytest_configure(config):  # noqa: ARG001
    from src.domain.relatorios.service import RelatoriosService as R

    if getattr(R, "__gabarito_relatorios__", False):
        return
    R.__gabarito_relatorios__ = True
    if not getattr(GE, "_PG_INSTALADO", False):
        GE._instalar_pg()
        GE._PG_INSTALADO = True
    _instalar_soma()
    _ORIGINAL.update(dre=R.dre, balancete=R.balancete, livro_caixa=R.livro_caixa)

    def gravador(metodo):
        async def chamar(self, data_de=None, data_ate=None):
            if _DENTRO["sim"]:
                return await _ORIGINAL[metodo](self, data_de=data_de, data_ate=data_ate)
            entrada = {**await _foto(self._db, self._empresa_id), "data_de": _iso(data_de), "data_ate": _iso(data_ate)}
            r = await _ORIGINAL[metodo](self, data_de=data_de, data_ate=data_ate)
            saida = r.model_dump(mode="json")
            saida.pop("empresa_id")
            _DA_SUITE.append((metodo, entrada, saida))
            return r
        return chamar

    R.dre = gravador("dre")
    R.balancete = gravador("balancete")
    R.livro_caixa = gravador("livro_caixa")


# ─── Sanitização ────────────────────────────────────────────────────────────

def _sanitizar(e: dict, saida: dict) -> tuple[dict, dict]:
    e, saida = copy.deepcopy(e), copy.deepcopy(saida)
    for x in e.get("contas", []):
        x["codigo"], x["descricao"] = _s(x["codigo"]), _s(x["descricao"])
    for x in e.get("transacoes", []):
        x["historico"] = _s(x["historico"])
    for g in saida.get("grupos", []):
        for x in g["linhas"]:
            x["codigo"], x["descricao"] = _s(x["codigo"]), _s(x["descricao"])
    for x in saida.get("linhas", []):
        x["codigo"], x["descricao"] = _s(x["codigo"]), _s(x["descricao"])
    for a in saida.get("agencias", []):
        a["descricao"] = _s(a["descricao"])
        for x in a["lancamentos"]:
            x["historico"] = _s(x["historico"])
    return e, saida


# ─── Inventados ─────────────────────────────────────────────────────────────

_IDS = itertools.count(1)


def _uid(prefixo: int) -> str:
    return str(uuid.UUID(int=(prefixo << 96) | next(_IDS)))


_PLANO = [
    ("1", "ATIVO", "ativo"), ("1.1", "ATIVO CIRCULANTE", "ativo"), ("1.1.1", "Caixa", "ativo"), ("1.1.2", "Bancos", "ativo"),
    ("1.1.2.01", "Banco conta movimento A", "ativo"), ("1.1.2.02", "Banco conta movimento B", "ativo"),
    ("1.1.B.0123456789abcdef", "Conta bancária sintética", "ativo"),
    ("2", "PASSIVO", "passivo"), ("2.1", "PASSIVO CIRCULANTE", "passivo"), ("2.1.1", "Fornecedores", "passivo"),
    ("2.1.2", "Impostos a recolher", "passivo"), ("2.3", "PATRIMÔNIO LÍQUIDO", "patrimonio_liquido"), ("2.3.1", "Capital social", "patrimonio_liquido"),
    ("3", "RECEITAS", "receita"), ("3.1", "RECEITA BRUTA", "receita"), ("3.1.1", "Receita de serviços", "receita"),
    ("3.1.2", "Receita de vendas", "receita"), ("3.1.9", "Receitas financeiras", "receita"), ("3.1.10", "Outras receitas", "receita"),
    ("3.2", "CUSTOS", "custo"), ("3.2.1", "Custo dos serviços prestados", "custo"), ("3.2.2", "Custo das mercadorias", "custo"),
    ("4", "DESPESAS", "despesa"), ("4.1", "DESPESAS ADMINISTRATIVAS", "despesa"), ("4.1.1", "Aluguel", "despesa"),
    ("4.1.2", "Tarifas bancárias", "despesa"), ("4.1.3", "Salários e encargos", "despesa"), ("4.1.10", "Despesas diversas", "despesa"),
    ("5.1", "Resultado do exercício", "resultado"), ("9.9", "Conta de compensação", "compensacao"),
]
_VALORES = ["0.01", "0.10", "1.00", "12.34", "99.99", "1234.56", "10000.00", "1500.50", "250000.00", "9999999999999.99", "1234567890123.45", "0.00"]
_DIAS = ["2025-12-31", "2026-01-01", "2026-02-28", "2026-03-01", "2026-03-02", "2026-03-15", "2026-03-31", "2026-04-01", "2026-04-30"]
_HORAS = ["T00:00:00+00:00"] * 6 + ["T02:00:00+00:00", "T23:30:00+00:00", "T12:00:00+00:00"]
_PERIODOS = [
    (None, None), ("2026-03-01", "2026-03-31"), ("2026-03-01", None), (None, "2026-03-31"), ("2026-03-15", "2026-03-15"),
    ("2026-03-31", "2026-04-01"), ("2025-12-31", "2026-01-01"), ("2027-01-01", "2027-01-31"), ("2026-04-01", "2026-03-01"),
]


def _agencias(rng: random.Random) -> list[dict]:
    def ag(sigla, agencia, numero, digito, ativa=True, apagada=False, empresa="esta"):
        return {"id": _uid(0xA6), "empresa": empresa, "banco_sigla": sigla, "agencia": agencia, "numero": numero, "digito": digito,
                "ativa": ativa, "apagada": apagada}

    lista = [
        ag("ITAU", "1234", "56789", "0"), ag("BB", "0001", "12345", None), ag("SICOOB", "3069", "55555", ""),
        ag("CAIXA", "0420", "1001", "7", ativa=False), ag("SAFRA", "0005", "77777", None, apagada=True),
        ag("BB", "0001", "12345", "X", empresa="outra"), ag("BRADESCO", "0001", "00099", "1"),
    ]
    k = rng.randint(0, len(lista))
    escolhidas = lista if rng.random() < 0.7 else lista[:k]
    rng.shuffle(escolhidas)
    for i, a in enumerate(escolhidas):
        a["ordem_insercao"] = i
    return escolhidas


def _contas(rng: random.Random) -> list[dict]:
    contas = []
    for codigo, descricao, tipo in _PLANO:
        contas.append({"id": _uid(0xC0), "empresa": "esta", "codigo": codigo, "descricao": descricao, "tipo": tipo, "apagada": rng.random() < 0.1})
    # O mesmo código numa conta apagada (o legado de antes da trava) e uma conta de outra empresa com o código de uma desta.
    contas.append({"id": _uid(0xC0), "empresa": "esta", "codigo": "4.1.2", "descricao": "Tarifas (conta antiga)", "tipo": "despesa", "apagada": True})
    contas.append({"id": _uid(0xC0), "empresa": "esta", "codigo": "3.1.1", "descricao": "Receita antiga", "tipo": "receita", "apagada": True})
    contas.append({"id": _uid(0xC0), "empresa": "outra", "codigo": "3.1.1", "descricao": "Receita da outra empresa", "tipo": "receita", "apagada": False})
    rng.shuffle(contas)
    for i, c in enumerate(contas):
        c["ordem_insercao"] = i
    return contas


def _mundo(rng: random.Random, vazio: bool = False) -> dict:
    agencias = _agencias(rng)
    contas = _contas(rng)
    registros, transacoes = [], []
    if not vazio:
        ags = [a for a in agencias] or [{"id": _uid(0xA6), "empresa": "esta"}]
        analiticas = [c for c in contas if c["codigo"].count(".") >= 2 or c["codigo"] in ("5.1", "9.9")]
        for k in range(rng.randint(0, 90)):
            conta = rng.choice(analiticas if rng.random() < 0.85 else contas)
            registros.append({
                "id": _uid(0x8A), "empresa": "outra" if rng.random() < 0.05 else "esta", "conta_id": conta["id"],
                "agencia_id": rng.choice(ags)["id"], "dc": rng.choice("DC"), "valor": rng.choice(_VALORES[:-3] if rng.random() < 0.8 else _VALORES),
                "data_lancamento": rng.choice(_DIAS) + rng.choice(_HORAS), "apagado": rng.random() < 0.15, "ordem_insercao": k,
            })
        for k in range(rng.randint(0, 60)):
            a = rng.choice(ags)
            transacoes.append({
                "id": _uid(0x7A), "empresa": a["empresa"], "agencia_id": a["id"], "data": rng.choice(_DIAS),
                "valor": rng.choice(_VALORES[:-3] if rng.random() < 0.85 else _VALORES), "historico": rng.choice(
                    ["DEPOSITO", "PAGAMENTO FORNECEDOR", "TED RECEBIDA", "TARIFA BANCÁRIA", "PIX ENVIADO Ção", "SALDO ANTERIOR"]) + f" {k}",
                "dc": rng.choice("DC"), "apagada": rng.random() < 0.1, "ordem_insercao": k,
            })
    return {"contas": contas, "registros": registros, "agencias": agencias, "transacoes": transacoes}


def _instante(dia: str | None, fim: bool) -> str | None:
    if dia is None:
        return None
    hora = time(23, 59, 59, 999000) if fim else time(0, 0)
    return datetime.combine(date.fromisoformat(dia), hora, tzinfo=UTC).isoformat(timespec="milliseconds")


def casos_inventados(rng: random.Random) -> list[tuple[str, dict]]:
    saida = []
    for rodada in range(14):
        mundo = _registrar(_mundo(rng, vazio=rodada == 13))
        for de, ate in _PERIODOS:
            for metodo in ("dre", "balancete"):
                saida.append((metodo, {"mundo": mundo, "de": de, "ate": ate, "data_de": _instante(de, False), "data_ate": _instante(ate, True)}))
            saida.append(("livro_caixa", {"mundo": mundo, "de": de, "ate": ate, "data_de": de, "data_ate": ate}))
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _guardar(metodo: str, origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": metodo, "origem": origem, "entrada": entrada, "saida": saida}
    casos.setdefault(json.dumps([metodo, entrada], sort_keys=True, ensure_ascii=False), caso)


async def _tudo() -> None:
    montado = _Montado()
    await montado.abrir()
    try:
        for metodo, entrada, real in _DA_SUITE:
            refeito = await montado.rodar(metodo, entrada, pg=False)
            if refeito != real:
                raise AssertionError(f"o banco montado não repete a suíte ({metodo}):\n{json.dumps(refeito, ensure_ascii=False)[:3000]}\n"
                                     f"{json.dumps(real, ensure_ascii=False)[:3000]}")
            limpa, _ = _sanitizar(entrada, real)
            _guardar(metodo, "suite", limpa, await montado.rodar(metodo, limpa))
        rng = random.Random(20261126)
        for metodo, e in casos_inventados(rng):
            _guardar(metodo, "inventado", e, await montado.rodar(metodo, {**_MUNDOS[e["mundo"]], **e}))
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
    arquivos = _escrever_partes(pasta, "relatorios", itens)
    with open(os.path.join(pasta, "relatorios-mundos.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(_MUNDOS, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    arquivos.append("relatorios-mundos.json")
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        n = por_tipo.setdefault(c["tipo"], [0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
    resumo = ", ".join(f"{t}: {n} ({s} da suíte)" for t, (n, s) in sorted(por_tipo.items()))
    print(f"\ngabarito dos relatórios: {len(itens)} casos — {resumo}; arquivos: {', '.join(arquivos)}")
