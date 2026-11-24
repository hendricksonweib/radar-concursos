"""Gera js/municipais.js com concursos municipais de DEMONSTRAÇÃO.

Uso:  python3 tools/gerar_municipais.py caminho/para/municipios.json
O JSON vem de https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado
Em produção isso é substituído pelos coletores reais (ver README).
"""
import json, random, sys, datetime, os

random.seed(42)
HOJE = datetime.date(2026, 11, 24)

CAPITAIS = {1100205, 1302603, 1200401, 5002704, 1600303, 5300108, 1400100, 5103403, 1721000,
            3550308, 2211001, 3304557, 1501402, 5208707, 2927408, 4205407, 2111300, 2704302,
            4314902, 4106902, 3106200, 2304400, 2611606, 2507507, 2800308, 2408102, 3205309}

CARGOS = [  # nome, nivel, area, sal_min, sal_max
    ("Professor de Educação Básica", "Superior", "Educação", 3500, 5800),
    ("Enfermeiro", "Superior", "Saúde", 4000, 6800),
    ("Médico Clínico Geral", "Superior", "Saúde", 9000, 18000),
    ("Guarda Civil Municipal", "Médio", "Policial", 2800, 4800),
    ("Agente Administrativo", "Médio", "Administrativa", 2100, 3600),
    ("Auditor Fiscal de Tributos", "Superior", "Fiscal", 9000, 22000),
    ("Procurador Municipal", "Superior", "Jurídica", 12000, 26000),
    ("Analista de Tecnologia da Informação", "Superior", "TI", 6000, 11000),
    ("Agente Comunitário de Saúde", "Fundamental", "Saúde", 1800, 2500),
    ("Motorista", "Fundamental", "Administrativa", 2000, 2900),
    ("Assistente Social", "Superior", "Assistência Social", 3500, 5800),
    ("Engenheiro Civil", "Superior", "Engenharia", 7000, 12000),
    ("Técnico de Enfermagem", "Médio", "Saúde", 2400, 3600),
    ("Fiscal de Obras e Posturas", "Médio", "Fiscal", 3000, 5200),
]
BANCAS = ["Cebraspe", "FGV", "FCC", "Vunesp", "Instituto AOCP", "IBFC", "Fundatec", "Instituto Consulplan",
          "Avança SP", "Idecan", "Objetiva", "Quadrix"]
STATUS = ["edital_aberto"] * 5 + ["previsto"] * 2 + ["autorizado"] * 2 + ["encerrado"]


def main(path):
    muns = json.load(open(path))
    por_uf = {}
    for m in muns:
        por_uf.setdefault(m["UF-sigla"], []).append(m)
    out, i = [], 0
    for uf, lista in sorted(por_uf.items()):
        n = max(1, min(len(lista), round(len(lista) ** 0.5 * 1.3)))
        caps = [m for m in lista if m["municipio-id"] in CAPITAIS]
        resto = [m for m in lista if m["municipio-id"] not in CAPITAIS]
        escolhidos = caps + random.sample(resto, min(len(resto), n - len(caps)))
        for m in escolhidos:
            for orgao in (["Prefeitura"] + (["Câmara Municipal"] if random.random() < 0.25 else [])):
                i += 1
                status = random.choice(STATUS)
                pub = HOJE - datetime.timedelta(days=random.randint(0, 60))
                ate = HOJE + datetime.timedelta(days=random.randint(3, 45))
                k = random.randint(1, 4) if orgao == "Prefeitura" else 1
                cargos = random.sample(CARGOS if orgao == "Prefeitura" else CARGOS[4:5] + CARGOS[6:8], k)
                out.append({
                    "id": f"m{i}",
                    "orgao": f"{orgao} de {m['municipio-nome']}",
                    "sigla": ("PM " if orgao == "Prefeitura" else "CM ") + m["municipio-nome"],
                    "esfera": "municipal", "tipo": "publico",
                    "ufs": [uf], "mun": m["municipio-id"], "munNome": m["municipio-nome"],
                    "banca": random.choice(BANCAS) if status != "previsto" else None,
                    "status": status,
                    "publicado": pub.isoformat(),
                    "inscricoesAte": ate.isoformat() if status == "edital_aberto" else None,
                    "cargos": [{"nome": c[0], "nivel": c[1], "area": c[2],
                                "salario": round(random.uniform(c[3], c[4]) / 10) * 10,
                                "vagas": random.randint(1, 40) if m["municipio-id"] not in CAPITAIS else random.randint(10, 200)}
                               for c in cargos],
                })
    dest = os.path.join(os.path.dirname(__file__), "..", "js", "municipais.js")
    with open(dest, "w") as f:
        f.write("// Gerado por tools/gerar_municipais.py — DADOS DE DEMONSTRAÇÃO\n")
        f.write("window.CONCURSOS_MUNICIPAIS = ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(len(out), "concursos municipais gerados")


if __name__ == "__main__":
    main(sys.argv[1])
