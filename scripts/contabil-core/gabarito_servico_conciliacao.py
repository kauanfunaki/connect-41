"""Gabarito do serviço da conciliação Razão × extrato e da planilha do relatório (Fase B2, 12/11/2026).

Plugin do pytest: roda os testes de integração do original (dev41tech/contabil-core) que chamam
`conciliar_razao_extrato` e grava cada chamada com a entrada e a saída exatas. A entrada é o que a
função lê do banco (a empresa, a conta bancária, a conta contábil vinculada e as transações do
período, com as MESMAS consultas, feitas aqui dentro do invólucro) mais o Razão e o SISPAG
recebidos. A saída é o relatório serializado pelo pydantic (o JSON da rota), ou a mensagem da
recusa. Depois acrescenta casos inventados, com semente fixa, para cada ramo da função: CNPJ, conta
contábil vinculada, período, cobertura do extrato, SISPAG, aplicação automática, parcelamento,
duplicidades e lotes do SISPAG com composição.

Para cada relatório, a planilha do original (`gerar_planilha`) é gerada, lida de volta pelo openpyxl
e gravada como "despejo": por folha, o título, as células (valor, tipo, formato de número, negrito e
preenchimento), as larguras, o painel congelado e o filtro. O porte em TypeScript repete as
chamadas (`src/lib/contabil-core/conciliacao/{servico,planilhaDoRelatorio}.test.ts`).

COMO A SAÍDA É GRAVADA: a função original roda de novo com um banco FALSO, que devolve os objetos
montados a partir da entrada gravada (já sanitizada). Assim a entrada do gabarito determina a saída
por inteiro. Na suíte, o banco falso também roda com a entrada sem sanitizar, e o resultado tem de
ser igual ao do banco de teste de verdade (senão o plugin aborta): é a prova de que o banco falso
responde como o real.

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, os
CNPJs que não são de exemplo viram fictícios começando com 9, o nome da empresa do Razão vira um
nome fictício fixo e os ids das transações viram UUIDs sequenciais.

Uso, a partir da raiz do contabil-core, com pytest e as dependências do projeto (os testes usam
SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/conciliacao/gabarito \\
        python -W ignore -m pytest -q -p gabarito_servico_conciliacao \\
        tests/integration/test_conciliacao_bancaria.py tests/integration/test_conciliacao_revisao.py \\
        tests/integration/test_conciliacao_financeiro.py
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import random
import types
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from gabarito_cruzamento import cenario_geral, cenario_sispag, sanitizar_texto

casos: dict[str, dict] = {}
_ORIGINAL: dict = {}
EMPRESA_FICTICIA = "EMPRESA EXEMPLO LTDA"
# Cada arquivo do gabarito fica abaixo disto (o limite de ~3 MB do repositório).
_MAX_BYTES = 2_500_000


# ─── O banco falso ───────────────────────────────────────────────────────────

class _Resultado:
    def __init__(self, valores):
        self.valores = list(valores)

    def scalar_one_or_none(self):
        return self.valores[0] if self.valores else None

    def scalars(self):
        return self

    def all(self):
        return list(self.valores)


class _BancoFalso:
    """Responde às quatro leituras de `conciliar_razao_extrato` com os objetos dados."""

    def __init__(self, empresa, agencia, conta, transacoes):
        self.empresa, self.agencia, self.conta, self.transacoes = empresa, agencia, conta, transacoes

    async def get(self, modelo, _id):
        from src.db.models import Empresa, PlanoConta

        if modelo is Empresa:
            return self.empresa
        if modelo is PlanoConta:
            return self.conta
        raise AssertionError(f"leitura inesperada: {modelo}")

    async def execute(self, consulta):
        from src.db.models import AgenciaBancaria, Transacao

        entidade = consulta.column_descriptions[0]["entity"]
        if entidade is AgenciaBancaria:
            return _Resultado([self.agencia] if self.agencia is not None else [])
        if entidade is Transacao:
            return _Resultado(self.transacoes)
        raise AssertionError(f"consulta inesperada: {entidade}")


# ─── Entrada: codificação, sanitização e reconstrução ───────────────────────

def _d(v: date | None) -> str | None:
    return v.isoformat() if v is not None else None


def _entrada(empresa, agencia, conta, transacoes, razao, sispag, *, sanitizar: bool) -> dict:
    s = sanitizar_texto if sanitizar else (lambda t: t)
    ids: dict[str, str] = {}

    def novo_id(t) -> str:
        chave = str(t.id)
        if not sanitizar:
            return chave
        if chave not in ids:
            ids[chave] = str(uuid.UUID(int=len(ids) + 1))
        return ids[chave]

    return {
        "empresa_cnpj": None if empresa is None else s(empresa.cnpj),
        "agencia": None if agencia is None else {
            "banco_sigla": agencia.banco_sigla,
            "agencia": agencia.agencia,
            "numero": agencia.numero,
            "tem_conta_contabil": bool(agencia.conta_contabil_id),
        },
        "conta": None if conta is None else {
            "conta_numero": conta.conta_numero, "codigo": conta.codigo, "descricao": s(conta.descricao),
        },
        "razao": {
            "empresa": (EMPRESA_FICTICIA if razao.empresa else "") if sanitizar else razao.empresa,
            "cnpj": s(razao.cnpj),
            "periodo_inicio": _d(razao.periodo_inicio),
            "periodo_fim": _d(razao.periodo_fim),
            "conta_codigo": razao.conta_codigo,
            "conta_classificacao": razao.conta_classificacao,
            "conta_descricao": s(razao.conta_descricao),
            "lancamentos": [
                [l.data.isoformat(), s(l.lote), s(l.historico), s(l.contrapartida), str(l.valor)]
                for l in razao.lancamentos
            ],
            "total_debito": str(razao.total_debito),
            "total_credito": str(razao.total_credito),
        },
        "sispag": None if sispag is None else {
            "conta": s(sispag.conta),
            "cnpj": s(sispag.cnpj),
            "pagamentos": [
                [p.data.isoformat(), str(p.valor), s(p.tipo), s(p.favorecido), s(p.documento), p.efetuado]
                for p in sispag.pagamentos
            ],
        },
        "transacoes": [
            [novo_id(t), t.data.isoformat(), t.ordem, str(t.valor), t.dc, s(t.historico)] for t in transacoes
        ],
    }


def _objetos(e: dict):
    """A entrada gravada de volta em objetos: o que o banco falso e a função recebem."""
    from src.domain.conciliacao_bancaria.razao import LancamentoRazao, RazaoConta
    from src.domain.conciliacao_bancaria.sispag import ConsultaSispag, PagamentoSispag

    ns = types.SimpleNamespace
    dia = date.fromisoformat
    empresa = None if e["empresa_cnpj"] is None else ns(cnpj=e["empresa_cnpj"])
    a = e["agencia"]
    agencia = None if a is None else ns(
        banco_sigla=a["banco_sigla"], agencia=a["agencia"], numero=a["numero"],
        conta_contabil_id=uuid.UUID(int=999_999) if a["tem_conta_contabil"] else None,
    )
    c = e["conta"]
    conta = None if c is None else ns(conta_numero=c["conta_numero"], codigo=c["codigo"], descricao=c["descricao"])
    r = e["razao"]
    razao = RazaoConta(
        empresa=r["empresa"], cnpj=r["cnpj"],
        periodo_inicio=dia(r["periodo_inicio"]) if r["periodo_inicio"] else None,
        periodo_fim=dia(r["periodo_fim"]) if r["periodo_fim"] else None,
        conta_codigo=r["conta_codigo"], conta_classificacao=r["conta_classificacao"],
        conta_descricao=r["conta_descricao"],
        lancamentos=[LancamentoRazao(dia(d), lote, h, cp, Decimal(v)) for d, lote, h, cp, v in r["lancamentos"]],
        total_debito=Decimal(r["total_debito"]), total_credito=Decimal(r["total_credito"]),
    )
    sp = e["sispag"]
    sispag = None if sp is None else ConsultaSispag(
        conta=sp["conta"], cnpj=sp["cnpj"],
        pagamentos=[PagamentoSispag(dia(d), Decimal(v), t, f, doc, ef) for d, v, t, f, doc, ef in sp["pagamentos"]],
    )
    transacoes = [
        ns(id=uuid.UUID(i), data=dia(d), ordem=o, valor=Decimal(v), dc=dc, historico=h)
        for i, d, o, v, dc, h in e["transacoes"]
    ]
    return empresa, agencia, conta, transacoes, razao, sispag


async def _rodar(empresa, agencia, conta, transacoes, razao, sispag) -> dict:
    """Saída da função original com o banco falso: o relatório como a rota devolve, ou a recusa."""
    from src.core.errors import AppError

    banco = _BancoFalso(empresa, agencia, conta, transacoes)
    try:
        rel = await _ORIGINAL["fn"](banco, empresa_id=uuid.UUID(int=1), agencia_id=uuid.UUID(int=2),
                                    razao=razao, sispag=sispag)
    except AppError as exc:
        return {"erro": {"tipo": type(exc).__name__, "mensagem": exc.message}}
    return {"relatorio": rel.model_dump(mode="json"), "_objeto": rel}


def _chave(e: dict) -> str:
    return json.dumps(e, sort_keys=True, ensure_ascii=False)


def _guardar(origem: str, entrada: dict, saida: dict) -> dict:
    caso = {"origem": origem, "entrada": entrada, **{k: v for k, v in saida.items() if not k.startswith("_")}}
    if "_objeto" in saida:
        caso["_planilha"] = despejo(saida["_objeto"])
    casos.setdefault(_chave(entrada), caso)
    return caso


# ─── A planilha, lida de volta ──────────────────────────────────────────────

def despejo(relatorio) -> list[dict]:
    """A planilha do original como o Excel a vê: lida de volta pelo openpyxl."""
    import openpyxl

    from src.domain.conciliacao_bancaria.exportar import gerar_planilha

    wb = openpyxl.load_workbook(io.BytesIO(gerar_planilha(relatorio)))
    folhas = []
    for ws in wb.worksheets:
        celulas = []
        for linha in ws.iter_rows():
            for c in linha:
                v = c.value
                fmt = c.number_format
                negrito = bool(c.font is not None and c.font.b)
                fill = c.fill.fgColor.rgb[-6:] if c.fill is not None and c.fill.fill_type == "solid" else None
                if v is None and fmt == "General" and not negrito and fill is None:
                    continue
                if isinstance(v, datetime):
                    assert v.time() == datetime.min.time(), v
                    tipo, v = "d", v.date().isoformat()
                elif isinstance(v, bool):
                    tipo = "b"
                elif isinstance(v, (int, float)):
                    tipo = "n"
                elif isinstance(v, str):
                    tipo = "s"
                elif v is None:
                    tipo = None
                else:
                    raise AssertionError(f"tipo inesperado na planilha: {type(v)}")
                celulas.append([c.coordinate, tipo, v, fmt, negrito, fill])
        larguras = {}
        for d in ws.column_dimensions.values():
            if d.customWidth and d.width is not None:
                for col in range(d.min, d.max + 1):
                    larguras[col] = d.width
        folhas.append({
            "titulo": ws.title,
            "celulas": celulas,
            "larguras": sorted([col, w] for col, w in larguras.items()),
            "congelado": ws.freeze_panes,
            "filtro": ws.auto_filter.ref,
        })
    return folhas


# ─── Gravação das chamadas da suíte ─────────────────────────────────────────

async def _ler_como_a_funcao(db, empresa_id, agencia_id, razao):
    """As mesmas consultas de `conciliar_razao_extrato`, antes dela."""
    from sqlalchemy import select

    from src.db.models import AgenciaBancaria, Empresa, PlanoConta, Transacao

    empresa = await db.get(Empresa, empresa_id)
    agencia = (await db.execute(select(AgenciaBancaria).where(
        AgenciaBancaria.id == agencia_id,
        AgenciaBancaria.empresa_id == empresa_id,
        AgenciaBancaria.deleted_at.is_(None),
    ))).scalar_one_or_none()
    conta = None
    if agencia is not None and agencia.conta_contabil_id:
        conta = await db.get(PlanoConta, agencia.conta_contabil_id)
    transacoes = []
    if agencia is not None and razao.periodo_inicio is not None and razao.periodo_fim is not None:
        transacoes = (await db.execute(
            select(Transacao).where(
                Transacao.empresa_id == empresa_id,
                Transacao.agencia_id == agencia_id,
                Transacao.deleted_at.is_(None),
                Transacao.data >= razao.periodo_inicio,
                Transacao.data <= razao.periodo_fim,
            ).order_by(Transacao.data, Transacao.ordem)
        )).scalars().all()
    # Cópias soltas da sessão: o que valia no momento da chamada.
    ns = types.SimpleNamespace
    copia = (
        None if empresa is None else ns(cnpj=empresa.cnpj),
        None if agencia is None else ns(banco_sigla=agencia.banco_sigla, agencia=agencia.agencia,
                                        numero=agencia.numero, conta_contabil_id=agencia.conta_contabil_id),
        None if conta is None else ns(conta_numero=conta.conta_numero, codigo=conta.codigo, descricao=conta.descricao),
        [ns(id=t.id, data=t.data, ordem=t.ordem, valor=t.valor, dc=t.dc, historico=t.historico) for t in transacoes],
    )
    return copia


def _comparavel(saida: dict) -> dict:
    return {k: v for k, v in saida.items() if not k.startswith("_")}


def pytest_configure(config):  # noqa: ARG001
    from src.api.v1 import conciliacao_bancaria as api
    from src.core.errors import AppError
    from src.domain.conciliacao_bancaria import revisao, service

    original = service.conciliar_razao_extrato
    if getattr(original, "__gabarito__", False):
        return
    _ORIGINAL["fn"] = original

    async def gravador(db, *, empresa_id, agencia_id, razao, sispag=None):
        lido = await _ler_como_a_funcao(db, empresa_id, agencia_id, razao)
        try:
            rel = await original(db, empresa_id=empresa_id, agencia_id=agencia_id, razao=razao, sispag=sispag)
        except AppError as exc:
            real = {"erro": {"tipo": type(exc).__name__, "mensagem": exc.message}}
            await _gravar_da_suite(lido, razao, sispag, real)
            raise
        await _gravar_da_suite(lido, razao, sispag, {"relatorio": rel.model_dump(mode="json")})
        return rel

    gravador.__gabarito__ = True
    for m in (service, revisao, api):
        m.conciliar_razao_extrato = gravador


async def _gravar_da_suite(lido, razao, sispag, real: dict) -> None:
    empresa, agencia, conta, transacoes = lido
    # A prova do banco falso: com a entrada como estava, ele dá o mesmo resultado do banco de teste.
    bruta = _entrada(empresa, agencia, conta, transacoes, razao, sispag, sanitizar=False)
    falso = _comparavel(await _rodar(*_objetos(bruta)))
    if falso != real:
        raise AssertionError("o banco falso não reproduz o resultado do banco de teste")
    entrada = _entrada(empresa, agencia, conta, transacoes, razao, sispag, sanitizar=True)
    _guardar("suite", entrada, await _rodar(*_objetos(entrada)))


# ─── Casos inventados ───────────────────────────────────────────────────────

CNPJ_EMPRESA = "12.345.678/0001-95"
CNPJ_DIGITOS = "12345678000195"


def _base(**mudancas) -> dict:
    """Um caso simples que passa por todas as conferências; cada caso inventado muda uma parte."""
    e = {
        "empresa_cnpj": CNPJ_EMPRESA,
        "agencia": {"banco_sigla": "ITAU", "agencia": "7285", "numero": "12287", "tem_conta_contabil": True},
        "conta": {"conta_numero": 2699, "codigo": "1.1.1.02.0015", "descricao": "BANCO ITAU"},
        "razao": {
            "empresa": EMPRESA_FICTICIA, "cnpj": CNPJ_DIGITOS,
            "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28",
            "conta_codigo": "2699", "conta_classificacao": "1.1.1.02.0015",
            "conta_descricao": "BANCO ITAU C/C 122870",
            "lancamentos": [
                ["2025-02-01", "3026001", "RETORNO DE SALDO NEGATIVO - ITAU", "1370", "-500.00"],
                ["2025-02-03", "3137001", "RECEBIMENTO CLIENTE ALFA", "504", "1200.00"],
                ["2025-02-10", "3137002", "PAGTO ENERGIA ELETRICA", "354", "-350.00"],
                ["2025-02-10", "3026002", "TRANSFERENCIA ENTRE CONTAS", "554", "-350.00"],
                ["2025-02-20", "3137003", "PGTO FORNECEDOR SEM PAR", "506", "-42.00"],
            ],
            "total_debito": "1200.00", "total_credito": "1242.00",
        },
        "sispag": None,
        "transacoes": [
            [str(uuid.UUID(int=1)), "2025-02-03", 1, "1200.00", "C", "PIX RECEBIDO CLIENTE ALFA"],
            [str(uuid.UUID(int=2)), "2025-02-10", 2, "350.00", "D", "SISPAG ENERGIA"],
            [str(uuid.UUID(int=3)), "2025-02-26", 3, "90.00", "D", "TARIFA BANCARIA"],
        ],
    }
    for caminho, valor in mudancas.items():
        alvo = e
        partes = caminho.split("__")
        for p in partes[:-1]:
            alvo = alvo[p]
        alvo[partes[-1]] = valor
    return json.loads(json.dumps(e))


def _tx(k: int, dia: str, valor: str, dc: str, hist: str, ordem: int | None = None) -> list:
    return [str(uuid.UUID(int=k)), dia, k if ordem is None else ordem, valor, dc, hist]


def _lanc(dia: str, valor: str, hist: str, lote: str = "1", contra: str = "500") -> list:
    return [dia, lote, hist, contra, valor]


def _sispag(pagamentos, conta="7285 / 12287-0", cnpj=CNPJ_DIGITOS) -> dict:
    return {"conta": conta, "cnpj": cnpj, "pagamentos": pagamentos}


def casos_dirigidos() -> list[dict]:
    """Um caso por ramo da função, montado à mão."""
    c = [_base()]
    # 1. CNPJ do Razão
    c += [
        _base(razao__cnpj="98765432000110"),
        _base(razao__cnpj=""),
        _base(empresa_cnpj=None, razao__cnpj="98765432000110"),
        _base(empresa_cnpj="12345678000195"),
        _base(empresa_cnpj="", razao__cnpj="12345678000195"),
        _base(razao__empresa=""),
    ]
    # 2. Conta contábil vinculada
    c += [
        _base(conta={"conta_numero": 2699, "codigo": "9.9.9", "descricao": "MESMO CODIGO"}),
        _base(conta={"conta_numero": 1, "codigo": "1.1.1.02.0015", "descricao": "MESMA CLASSIFICACAO"}),
        _base(conta={"conta_numero": 3100, "codigo": "1.1.1.02.0020", "descricao": "BANCO BRADESCO"}),
        _base(conta={"conta_numero": None, "codigo": "1.1.1.02.0020", "descricao": "SEM NUMERO"}),
        _base(conta={"conta_numero": 0, "codigo": "1.1.1.02.0020", "descricao": "NUMERO ZERO"}),
        _base(conta={"conta_numero": 0, "codigo": "x", "descricao": "ZERO IGUAL"}, razao__conta_codigo="0"),
        _base(conta={"conta_numero": None, "codigo": "", "descricao": "VAZIA"}, razao__conta_classificacao=""),
        _base(conta=None),
        _base(agencia__tem_conta_contabil=False, conta=None),
        _base(agencia__tem_conta_contabil=False, conta=None, razao__conta_codigo="", razao__conta_classificacao="",
              razao__conta_descricao=""),
        _base(agencia__tem_conta_contabil=False, conta=None, razao__conta_codigo="",
              razao__conta_descricao="=HYPERLINK(\"x\")"),
        _base(agencia__banco_sigla="BB", agencia__agencia="0001-9", agencia__numero="99.999-X",
              conta={"conta_numero": 77, "codigo": "1.1", "descricao": "OUTRA"}),
    ]
    # 3. Conta bancária não encontrada e período
    c += [
        _base(agencia=None),
        _base(agencia=None, razao__periodo_inicio=None),
        _base(razao__periodo_inicio=None),
        _base(razao__periodo_fim=None),
        _base(razao__periodo_inicio=None, razao__periodo_fim=None, razao__cnpj="98765432000110"),
    ]
    # 4. Sem extrato no período e cobertura (folga de 4 dias)
    c += [
        _base(transacoes=[]),
        _base(transacoes=[], agencia__banco_sigla="SICOOB", razao__periodo_inicio="2024-12-29"),
        _base(transacoes=[_tx(1, "2025-02-05", "1200.00", "C", "PIX"), _tx(2, "2025-02-24", "90.00", "D", "TARIFA")]),
        _base(transacoes=[_tx(1, "2025-02-06", "1200.00", "C", "PIX"), _tx(2, "2025-02-24", "90.00", "D", "TARIFA")]),
        _base(transacoes=[_tx(1, "2025-02-05", "1200.00", "C", "PIX"), _tx(2, "2025-02-23", "90.00", "D", "TARIFA")]),
        _base(transacoes=[_tx(1, "2025-02-14", "1200.00", "C", "PIX")]),
        _base(razao__periodo_inicio="2025-03-01", razao__periodo_fim="2025-02-01",
              transacoes=[_tx(1, "2025-02-14", "1200.00", "C", "PIX")]),
        _base(razao__periodo_inicio="2024-12-31", razao__periodo_fim="2025-01-01",
              transacoes=[_tx(1, "2024-12-31", "5.00", "C", "PIX")], razao__lancamentos=[]),
    ]
    # 5. SISPAG
    pag = [["2025-02-10", "350.00", "Conta Corrente", "FULANO EXEMPLO", "***", True]]
    c += [
        _base(sispag=_sispag(pag)),
        _base(sispag=_sispag(pag, cnpj="98765432000110")),
        _base(sispag=_sispag(pag, cnpj="")),
        _base(empresa_cnpj=None, sispag=_sispag(pag, cnpj="98765432000110")),
        _base(sispag=_sispag(pag, conta="0001 / 99999-9")),
        _base(sispag=_sispag(pag, conta="")),
        _base(sispag=_sispag(pag, conta="Agência 7285 conta 12287-0 (C/C)")),
        _base(sispag=_sispag(pag, conta="7285 / 1228")),
        _base(agencia__agencia="", agencia__numero="", sispag=_sispag(pag, conta="0001 / 99999-9")),
        _base(sispag=_sispag([["2025-03-10", "350.00", "Conta Corrente", "FORA", "", True]])),
        _base(sispag=_sispag([])),
        _base(sispag=_sispag([["2025-01-31", "1.00", "TED", "ANTES", "", True],
                              ["2025-02-28", "350.00", "TED", "NO FIM", "", True],
                              ["2025-03-01", "2.00", "TED", "DEPOIS", "", False]])),
        _base(sispag=_sispag(pag, cnpj="98765432000110"), razao__periodo_inicio=None),
        _base(sispag=_sispag(pag, conta="0001 / 99999-9"), transacoes=[]),
    ]
    # 6. Aplicação automática que o extrato não traz (as três espécies, singular e plural)
    aplic = [
        _lanc("2025-02-04", "5000.00", "RESGATE DE APLICAÇÃO AUTOMÁTICA"),
        _lanc("2025-02-05", "-4000.00", "OPERAÇÃO DE APLICAÇÃO AUTOMÁTICA"),
        _lanc("2025-02-06", "1234567.89", "RES APLIC AUT MAIS"),
        _lanc("2025-02-07", "12.34", "REND PAGO APLIC AUT MAIS"),
        _lanc("2025-02-08", "0.66", "REND PAGO APLIC AUT MAIS"),
        _lanc("2025-02-09", "-0.01", "APL APLIC AUT MAIS"),
        _lanc("2025-02-09", "-1E+3", "APL APLIC AUT MAIS"),
    ]
    base_lanc = _base()["razao"]["lancamentos"]
    c += [
        _base(razao__lancamentos=base_lanc + aplic[:2]),
        _base(razao__lancamentos=base_lanc + aplic),
        _base(razao__lancamentos=base_lanc + aplic[3:4]),
        _base(razao__lancamentos=base_lanc + aplic[3:5] + aplic[5:6]),
        _base(razao__lancamentos=base_lanc + aplic,
              transacoes=_base()["transacoes"] + [_tx(9, "2025-02-04", "5000.00", "C", "RESGATE APLIC AUT")]),
        _base(razao__lancamentos=base_lanc + aplic,
              transacoes=_base()["transacoes"] + [_tx(9, "2025-02-07", "12.34", "C", "REND PAGO APLIC AUT MAIS")]),
    ]
    # 7. Duplicidades, sinais, zeros, expoentes e textos que viram fórmula na planilha
    c += [
        _base(transacoes=_base()["transacoes"] + [_tx(4, "2025-02-26", "90.00", "D", "TARIFA BANCARIA")]),
        _base(transacoes=_base()["transacoes"] + [_tx(4, "2025-02-26", "0.00", "D", "ZERO"),
                                                   _tx(5, "2025-02-27", "0.00", "C", "ZERO")]),
        _base(razao__lancamentos=base_lanc + [_lanc("2025-02-26", "-90", "-TARIFA", "=1+1", "@SOMA"),
                                              _lanc("2025-02-27", "-0.00", "+ZERO", " -lote", "  =x"),
                                              _lanc("2025-02-27", "1E+2", "=CEM", "", "")]),
        _base(transacoes=[_tx(1, "2025-02-03", "1200.00", "C", "=PIX RECEBIDO"),
                          _tx(2, "2025-02-10", "350.00", "D", "-SISPAG"),
                          _tx(3, "2025-02-26", "1234567.89", "D", "@TARIFA")]),
        _base(razao__lancamentos=[]),
        _base(razao__lancamentos=[_lanc("2025-02-01", "-500.00", "SALDO ANTERIOR")]),
        _base(transacoes=[_tx(1, "2025-02-03", "1200.00", "C", "PIX", ordem=None),
                          _tx(2, "2025-02-03", "1200.00", "C", "PIX", ordem=None),
                          _tx(3, "2025-02-26", "90.00", "D", "TARIFA", ordem=None)]),
    ]
    # 8. Parcelamento: o aviso só sai de um grupo pendente com o Razão e as parcelas do extrato
    # juntos, e o único que junta os dois lados é o lote do SISPAG divergente. Para o agrupamento
    # (camada 3) não fechar antes, o dia tem mais de 20 linhas candidatas no extrato; o pagamento
    # que falta no Razão é de valor zero, para o Razão ainda somar as parcelas.
    def parcelamento(parcelas: list[str], razao_valor: str, k0: int = 2) -> dict:
        dia = "2025-02-12"
        tx = [_tx(1, "2025-02-03", "1200.00", "C", "PIX")]
        tx += [_tx(k0 + j, dia, v, "D", "Sispag Fornecedores") for j, v in enumerate(parcelas)]
        tx += [_tx(40 + j, dia, f"1.{j + 10:02d}", "D", "TARIFA") for j in range(20)]
        lanc = [_lanc("2025-02-03", "1200.00", "RECEBIMENTO CLIENTE ALFA"),
                _lanc(dia, f"-{razao_valor}", "PGTO FULANO EXEMPLO")]
        pags = [[dia, razao_valor, "Conta Corrente", "FULANO EXEMPLO", "", True],
                [dia, "0.00", "Conta Corrente", "BELTRANO EXEMPLO", "***", True]]
        return _base(razao__lancamentos=lanc, transacoes=tx, sispag=_sispag(pags))

    c += [
        parcelamento(["100.00", "100.00"], "200.00"),
        parcelamento(["100.00", "100.00", "100.03"], "300.03"),
        parcelamento(["100.00", "100.06"], "200.06"),
        parcelamento(["1000.00", "1000.00", "1000.05"], "3000.05"),
    ]
    # 9. Composição do lote por sugestão (valores repetidos: pelos valores é ambíguo, pelos lotes
    # em sequência não; a lacuna na numeração é o pagamento que falta, aqui de valor zero para o
    # sinal fechar). Mais de 20 lançamentos pequenos no dia seguram o agrupamento da camada 3.
    def sugestao(extrato: list[str], faltando: list[str], ordem: list[str], lotes: list[int] | None = None) -> dict:
        dia = "2025-02-12"
        nomes = ["ALFA", "BETA", "GAMA", "DELTA", "EPSILON", "ZETA"]
        lotes = lotes or [1001 + j for j in range(len(ordem))]
        lanc = [_lanc("2025-02-03", "1200.00", "RECEBIMENTO CLIENTE ALFA")]
        lanc += [_lanc(dia, f"-{v}", f"PGTO {nomes[j]} EXEMPLO", str(lotes[j])) for j, v in enumerate(ordem)]
        lanc += [_lanc(dia, f"-1.{j + 10:02d}", "TARIFA AVULSA", str(5000 + j)) for j in range(20)]
        tx = [_tx(1, "2025-02-03", "1200.00", "C", "PIX")]
        tx += [_tx(2 + j, dia, v, "D", "Sispag Fornecedores") for j, v in enumerate(extrato)]
        pags = [[dia, v, "Conta Corrente", f"{nomes[j]} EXEMPLO", "", True] for j, v in enumerate(ordem)]
        pags += [[dia, v, "Conta Corrente", f"FALTANTE {j} EXEMPLO", "", True] for j, v in enumerate(faltando)]
        return _base(razao__lancamentos=lanc, transacoes=tx, sispag=_sispag(pags))

    c += [
        sugestao(["180.00", "170.00"], ["30.00"], ["100.00", "50.00", "120.00", "50.00"], [1001, 1003, 1004, 1005]),
        sugestao(["170.00", "180.00"], ["30.00"], ["100.00", "50.00", "120.00", "50.00"], [1001, 1003, 1004, 1005]),
        sugestao(["150.00", "200.00"], ["30.00"], ["100.00", "50.00", "120.00", "50.00"], [1001, 1002, 1003, 1005]),
        sugestao(["180.00", "170.00", "80.00"], ["30.00"], ["100.00", "50.00", "120.00", "50.00", "80.00"],
                 [7, 9, 10, 11, 12]),
        sugestao(["180.00", "190.00"], ["30.00", "20.00"], ["100.00", "50.00", "120.00", "50.00"], [1, 3, 4, 6]),
        sugestao(["180.00", "170.00"], ["30.00"], ["100.00", "50.00", "120.00", "50.00"], [1001, 1002, 1003, 1004]),
        sugestao(["150.00", "150.00"], ["0.00"], ["100.00", "50.00", "100.00", "50.00"]),
        sugestao(["180.00", "150.00"], ["30.00"], ["100.00", "50.00", "100.00", "50.00"]),
    ]
    # 10. Transações com o mesmo id (o dicionário do original fica com a primeira posição e o último valor)
    c += [
        _base(transacoes=[_tx(1, "2025-02-03", "1200.00", "C", "PIX"), _tx(2, "2025-02-10", "350.00", "D", "SISPAG"),
                          _tx(1, "2025-02-26", "90.00", "D", "TARIFA")]),
    ]
    return c


def _escolher(rng: random.Random, opcoes):
    return opcoes[rng.randrange(len(opcoes))]


def _caso_aleatorio(rng: random.Random, com_sispag: bool) -> dict:
    """Razão e extrato dos cenários do gabarito do cruzamento, com as conferências sorteadas."""
    if com_sispag:
        razao, extrato, base, pagamentos = cenario_sispag(rng)
    else:
        razao, extrato, base, _ = cenario_geral(rng, rng.randint(1, 30))
        pagamentos = []
    inicio = base - timedelta(days=rng.choice([0, 0, 0, 1, 3, 5, 8]))
    fim = base + timedelta(days=rng.choice([5, 11, 12, 15, 20, 27]))
    # Lotes em sequência (como o Mister Contador numera) deixam a composição sugerir por lote.
    sequencia = com_sispag and rng.random() < 0.6
    primeiro = rng.randint(1, 9_000_000)
    lancamentos = [
        [i.data.isoformat(),
         str(primeiro + k) if sequencia else (str(rng.randint(1, 9_999_999)) if rng.random() < 0.9 else ""),
         i.historico, _escolher(rng, ["504", "354", "", "2700"]), str(i.valor)]
        for k, i in enumerate(razao)
    ]
    transacoes = []
    for k, i in enumerate(sorted(extrato, key=lambda i: i.data), start=1):
        valor = abs(i.valor).quantize(Decimal("0.01"))
        dc = "C" if i.valor > 0 or (i.valor == 0 and rng.random() < 0.5) else "D"
        transacoes.append([str(uuid.UUID(int=k)), i.data.isoformat(), k, str(valor), dc, i.historico])
    # O que o banco devolveria: só o período do Razão.
    transacoes = [t for t in transacoes if inicio.isoformat() <= t[1] <= fim.isoformat()]

    e = _base()
    e["razao"].update(periodo_inicio=inicio.isoformat(), periodo_fim=fim.isoformat(), lancamentos=lancamentos)
    e["transacoes"] = transacoes
    sorte = rng.random()
    if sorte < 0.05:
        e["razao"]["cnpj"] = "98765432000110"
    elif sorte < 0.10:
        e["conta"] = {"conta_numero": rng.choice([None, 0, 3100]), "codigo": "1.1.1.02.0020", "descricao": "OUTRO BANCO"}
    elif sorte < 0.25:
        e["agencia"]["tem_conta_contabil"] = False
        e["conta"] = None
    if com_sispag:
        conta = "7285 / 12287-0" if rng.random() < 0.93 else "0001 / 99999-9"
        cnpj = CNPJ_DIGITOS if rng.random() < 0.95 else "98765432000110"
        e["sispag"] = _sispag([
            [p.data.isoformat(), str(p.valor), p.tipo, p.favorecido, p.documento, p.efetuado] for p in pagamentos
        ], conta=conta, cnpj=cnpj)
    return e


def _assinatura(saida: dict) -> str:
    """O ramo que o caso exercita: a recusa, ou os avisos e os tipos de grupo."""
    if "erro" in saida:
        return "erro:" + saida["erro"]["mensagem"][:30]
    r = saida["relatorio"]
    avisos = sorted({a[:14] for a in r["avisos"]})
    extras = [
        "sispag" if r["sispag_usado"] else "",
        "explicada" if r["resumo"]["diferenca_explicada"] else "inexplicada",
        sorted({c["criterio"] for g in r["pendencias"] for c in g["composicoes"]}),
        "lote" if any(g["tipo"].startswith("LOTE_SISPAG") for g in r["pendencias"]) else "",
        "duplicidade" if any(g["tipo"].startswith("DUPLICIDADE") for g in r["pendencias"]) else "",
    ]
    return json.dumps([avisos, extras], ensure_ascii=False)


def casos_inventados() -> None:
    for e in casos_dirigidos():
        _guardar("dirigido", e, asyncio.run(_rodar(*_objetos(e))))

    # Sorteio: muitos candidatos, guardando poucos de cada ramo (o arquivo fica pequeno e o
    # gabarito cobre os ramos raros, como o aviso de parcelamento).
    rng = random.Random(20261112)
    por_ramo: dict[str, int] = {}
    guardados = 0
    for n in range(2400):
        e = _caso_aleatorio(rng, com_sispag=n % 2 == 1)
        saida = asyncio.run(_rodar(*_objetos(e)))
        ramo = _assinatura(saida)
        if por_ramo.get(ramo, 0) >= 4 and not (n % 60 == 0):
            continue
        por_ramo[ramo] = por_ramo.get(ramo, 0) + 1
        _guardar("sorteado", e, saida)
        guardados += 1
    print(f"\nsorteados: {guardados} de 2400 candidatos, {len(por_ramo)} ramos")


# ─── Gravação dos arquivos ──────────────────────────────────────────────────

def _escrever_partes(pasta: str, prefixo: str, itens: list[dict]) -> list[str]:
    """Grava `itens` em arquivos de até ~2,5 MB: `<prefixo>-1.json`, `<prefixo>-2.json`…"""
    for antigo in os.listdir(pasta):
        if antigo.startswith(prefixo + "-") and antigo.endswith(".json"):
            os.remove(os.path.join(pasta, antigo))
    linhas = [json.dumps(i, ensure_ascii=False, separators=(",", ":")) for i in itens]
    partes, atual, tamanho = [], [], 0
    for linha in linhas:
        if atual and tamanho + len(linha.encode()) > _MAX_BYTES:
            partes.append(atual)
            atual, tamanho = [], 0
        atual.append(linha)
        tamanho += len(linha.encode()) + 2
    if atual:
        partes.append(atual)
    nomes = []
    for k, parte in enumerate(partes, start=1):
        nome = f"{prefixo}-{k}.json"
        with open(os.path.join(pasta, nome), "w", encoding="utf-8", newline="\n") as f:
            f.write("[\n" + ",\n".join(parte) + "\n]\n")
        nomes.append(nome)
    return nomes


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    da_suite = len(casos)
    casos_inventados()

    ordenados = sorted(casos.values(), key=lambda c: ({"suite": 0, "dirigido": 1, "sorteado": 2}[c["origem"]], _chave(c["entrada"])))
    servico, planilhas = [], []
    for n, c in enumerate(ordenados, start=1):
        c["id"] = n
        planilha = c.pop("_planilha", None)
        servico.append({"id": n, **{k: v for k, v in c.items() if k != "id"}})
        if planilha is not None:
            planilhas.append({"id": n, "folhas": planilha})
    arquivos = _escrever_partes(pasta, "servico-conciliacao", servico)
    arquivos += _escrever_partes(pasta, "planilha-conciliacao", planilhas)
    erros = sum(1 for c in servico if "erro" in c)
    print(f"\ngabarito do serviço: {len(servico)} casos ({da_suite} da suíte, {erros} recusas), "
          f"{len(planilhas)} planilhas; arquivos: {', '.join(arquivos)}")
