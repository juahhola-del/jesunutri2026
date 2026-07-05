import csv
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs" / "abastecimiento_modelo" / "minimos_y_prediccion_julio_2026.csv"
OUTPUT = ROOT / "outputs" / "abastecimiento_modelo" / "duplicados_para_revision_nutri.txt"
ALLOWED_ORDER_KEYS = {
    "aceite maravilla",
    "aceite vegetal",
    "chuno",
    "fideos tallarin",
    "papel film",
    "vaso termico 300 cc",
}

DIFFERENT_PRODUCT_PAIRS = {
    tuple(sorted(("fideos", "tallarines"))),
    tuple(sorted(("agua 1 6 lt", "agua 600 ml"))),
    tuple(sorted(("flan con leche", "flan sin leche"))),
    tuple(sorted(("mermelada con azucar", "mermelada sin azucar"))),
    tuple(sorted(("sal", "sal sachet"))),
}


def normalize(value):
    text = unicodedata.normalize("NFKD", repair_mojibake(value).lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def repair_mojibake(value):
    text = str(value or "")
    for _ in range(2):
        try:
            repaired = text.encode("latin1").decode("utf-8")
        except UnicodeError:
            break
        if repaired == text:
            break
        text = repaired
    replacements = {
        "\u00c3\u00a1": "\u00e1",
        "\u00c3\u00a9": "\u00e9",
        "\u00c3\u00ad": "\u00ed",
        "\u00c3\u00b3": "\u00f3",
        "\u00c3\u00ba": "\u00fa",
        "\u00c3\u00b1": "\u00f1",
        "\u00c3\u0081": "\u00c1",
        "\u00c3\u0089": "\u00c9",
        "\u00c3\u008d": "\u00cd",
        "\u00c3\u0093": "\u00d3",
        "\u00c3\u009a": "\u00da",
        "\u00c3\u0091": "\u00d1",
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
    return text


def clean_display(value):
    return repair_mojibake(value)


def base_name(value):
    text = normalize(value)
    text = re.sub(r"\b\d+(?:\s*\d+)?\b", " ", text)
    text = re.sub(r"\b(ml|cc|gr|g|kg|lt|lts|unidad|unidades|sachet|sachets|con|sin|de|del|la|el|para|o|material)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def add_group(groups, title, key, row):
    if not key:
        return
    groups[(title, key)].append(row)


def compact_row(row):
    return (
        f"- {clean_display(row['producto'])} | stock {row['stock_actual']} | min {row['minimo_sugerido']} | "
        f"pedido julio {row['pedido_julio_sugerido']} | fuente {row['fuente']} | confianza {row['confianza']}"
    )


def get_pair_decision(grouped):
    names = tuple(sorted(normalize(row["producto"]) for row in grouped))
    if names in DIFFERENT_PRODUCT_PAIRS:
        return "DIFERENTES"
    return "MISMOS"


def main():
    rows = list(csv.DictReader(SOURCE.open(encoding="utf-8-sig")))
    groups = defaultdict(list)

    for row in rows:
        add_group(groups, "Misma referencia PAC", normalize(row.get("match_pac")), row)
        pedido_key = normalize(row.get("match_pedido"))
        if pedido_key in ALLOWED_ORDER_KEYS:
            add_group(groups, "Misma referencia de pedido", pedido_key, row)
        add_group(groups, "Nombre base similar", base_name(row.get("producto")), row)

    candidates = {}
    for (title, key), grouped in groups.items():
        unique_ids = {row["producto_id"] for row in grouped}
        unique_names = {normalize(row["producto"]) for row in grouped}
        if len(unique_ids) < 2 or len(unique_names) < 2:
            continue
        signature = tuple(sorted(unique_ids))
        entry = candidates.setdefault(signature, {
            "rows": sorted(grouped, key=lambda item: clean_display(item["producto"]).lower()),
            "criteria": []
        })
        criterion = f"{title}: {key}"
        if criterion not in entry["criteria"]:
            entry["criteria"].append(criterion)

    useful = sorted(candidates.values(), key=lambda item: clean_display(item["rows"][0]["producto"]).lower())

    lines = [
        "Duplicados o equivalencias consolidadas segun revision Nutri",
        "Fuente: minimos_y_prediccion_julio_2026.csv",
        "",
        "Origen de los repetidos:",
        "- El reporte anterior mostraba la misma pareja varias veces cuando calzaba por mas de un criterio.",
        "- Este reporte consolida por pareja de productos y lista todos los criterios detectados.",
        "",
        "Criterio:",
        "- Misma referencia PAC: dos productos del sistema calzaron contra el mismo producto del PAC.",
        "- Misma referencia de pedido: dos productos calzaron contra el mismo nombre de pedido mensual.",
        "- Nombre base similar: nombres parecidos tras quitar medidas/presentaciones.",
        "",
        "Lectura de observaciones:",
        "- DIFERENTES: la nutri indico que no se deben unir.",
        "- MISMOS: no habia observacion de diferencia, por lo tanto se tratan como equivalentes candidatos.",
        "",
    ]

    for index, entry in enumerate(useful, start=1):
        grouped = entry["rows"]
        lines.append(f"{index}. Decision nutri: {get_pair_decision(grouped)}")
        lines.append("Criterios detectados:")
        lines.extend(f"- {criterion}" for criterion in entry["criteria"])
        lines.append("Productos:")
        lines.extend(compact_row(row) for row in grouped)
        lines.append("")

    if not useful:
        lines.append("No se detectaron duplicados candidatos con los criterios actuales.")

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
