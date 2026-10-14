#!/usr/bin/env python3
"""Convertit l'aperçu AREDL en plan d'import de STAGING, jamais en démons/records.

Aucune connexion réseau ni clé Supabase. Le fichier SQL généré n'est jamais
exécuté par ce script. Son application, après inspection et création de la table,
doit être une action humaine explicite dans l'éditeur SQL Supabase.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID


def allowed_uuid(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def valid_gd_id(value):
    v = str(value or "").strip()
    return v if re.fullmatch(r"[1-9][0-9]*", v) else None


def q(value):
    """Littéral SQL PostgreSQL (standard_conforming_strings=on dans l'output)."""
    return "'" + str(value).replace("'", "''") + "'"


def json_sql(value):
    return q(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def build_plan(data):
    scope = data.get("scope", {})
    if (not scope.get("anchor_verified") or int(scope.get("start_rank") or 0) < 220
            or ("FR" not in scope.get("countries", []) or "BE" not in scope.get("countries", []))):
        raise ValueError("Frontière Cobwebs #219 / pays FR-BE non confirmés : plan bloqué, relancer la V2.9.3")
    if data.get("failures"):
        raise ValueError("Échecs de niveaux dans l'import AREDL : impossible de préparer cette tranche")
    items = data.get("levels")
    if not isinstance(items, list):
        raise ValueError("Champ levels invalide")
    gd_counts = Counter(valid_gd_id(x.get("gd_level_id")) for x in items)
    aredl_counts = Counter(str(x.get("aredl_id")) for x in items)
    included, excluded = [], []
    export_supplied = bool(scope.get("existing_export_supplied"))
    for row in items:
        r = row.get("rank")
        gid = valid_gd_id(row.get("gd_level_id"))
        aid = allowed_uuid(row.get("aredl_id"))
        why = None
        if not isinstance(r, int) or r < 220:
            why = "INVALID_OR_OUT_OF_SCOPE_RANK"
        elif not gid or not aid or not row.get("name"):
            why = "INVALID_IDENTIFIERS"
        elif gd_counts[gid] > 1 or aredl_counts[str(row.get("aredl_id"))] > 1:
            why = "DUPLICATE_IN_AREDL_BATCH"
        elif row.get("action") in ("CONFLICT_MULTIPLE_MATCHES", "CONFLICT_DUPLICATE_GD_ID", "REVIEW_SAME_NAME_DIFFERENT_ID", "REVIEW_MISSING_GD_ID"):
            why = "EXISTING_DLFR_CONFLICT"
        elif row.get("record_fetch_error") or row.get("records_complete") is not True:
            why = "RECORDS_NOT_EXHAUSTIVE"
        if why:
            excluded.append({"rank": r, "name": row.get("name"), "gd_level_id": gid, "reason": why})
            continue
        # Aucun score, complétion, propriété du profil ni statut de modération ne
        # sont jamais écrits dans les vraies tables ici.
        first = row.get("first_fr_be", {})
        first = first if first.get("status") == "first_dated_record" else {}
        verifiers = [v for v in row.get("verifiers", []) if v.get("player", {}).get("country") in ("FR", "BE")]
        action = row.get("action") or "UNKNOWN"
        if not export_supplied and action == "NEW_CANDIDATE":
            action = "NO_DLFR_EXPORT_REVIEW"
        included.append({
            "gd_level_id": gid, "aredl_id": aid, "aredl_rank": r,
            "aredl_name": row["name"], "source_action": action,
            "verifiers_fr_be": verifiers,
            "first_observed_fr_be": first,
            "source_payload": {"source": "AREDL", "records_complete": True,
                               "records_inspected": row.get("records_inspected"),
                               "unresolved_verifiers": row.get("unresolved_verifiers", []),
                               "first_fr": row.get("first_fr"),
                               "first_be": row.get("first_be"),
                               "aredl_id": aid, "gd_level_id": gid,
                               "observed_first_not_historical_proof": True},
        })
    return {"status": "STAGING_ONLY_REVIEW_REQUIRED", "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": scope, "source_generated_at": data.get("generated_at"),
            "counts": {"total": len(items), "stage_candidates": len(included), "excluded": len(excluded)},
            "included": included, "excluded": excluded,
            "warnings": (["Pas d'export DLFR fourni : il faut rapprocher les validations manuelles avant publication."]
                         if not export_supplied else []) +
                        ["Le premier record daté observé n'est pas forcément la première victoire historique.",
                         "Ce plan n'est pas publié : il exige une validation humaine."]}


def to_sql(plan):
    lines = ["-- DLFR V2.9.3 : INSERTION EN STAGING UNIQUEMENT (APRES VALIDATION HUMAINE)",
             "-- Lire supabase/09_nlw_aredl_stage_OPTIONNEL.sql et appliquer la migration d'abord.",
             "-- Ne modifie JAMAIS public.demons, public.completions ou public.players.",
             "-- Rejouable : un badge de modération/une modification manuelle n'est pas écrasé.",
             "SET standard_conforming_strings = on;", "BEGIN;"]
    for x in plan["included"]:
        vals = ", ".join([q(x["gd_level_id"]), q(x["aredl_id"]), str(x["aredl_rank"]),
                          q(x["aredl_name"]), q(x["source_action"]),
                          json_sql(x["verifiers_fr_be"]), json_sql(x["first_observed_fr_be"]),
                          json_sql(x["source_payload"])])
        lines += [
            "INSERT INTO public.dlfr_aredl_nlw_stage",
            "(gd_level_id,aredl_id,aredl_rank,aredl_name,source_action,verifiers_fr_be,first_observed_fr_be,source_payload)",
            f"VALUES ({vals})",
            "ON CONFLICT (gd_level_id) DO UPDATE SET",
            "  aredl_rank=EXCLUDED.aredl_rank, aredl_name=EXCLUDED.aredl_name,",
            "  source_action=EXCLUDED.source_action, verifiers_fr_be=EXCLUDED.verifiers_fr_be,",
            "  first_observed_fr_be=EXCLUDED.first_observed_fr_be, source_payload=EXCLUDED.source_payload,",
            "  updated_at=now()",
            "WHERE public.dlfr_aredl_nlw_stage.aredl_id=EXCLUDED.aredl_id",
            "  AND public.dlfr_aredl_nlw_stage.review_state='pending'",
            "  AND public.dlfr_aredl_nlw_stage.manually_locked=false;",
        ]
    lines += ["COMMIT;", "-- Fin : toutes les entrées sont en attente de revue, aucune publication."]
    return "\n".join(lines) + "\n"


def write_csv(path, plan):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        cols = ["rank", "name", "gd_level_id", "decision", "reason", "first_record", "verifiers"]
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for x in plan["included"]:
            w.writerow({"rank": x["aredl_rank"], "name": x["aredl_name"], "gd_level_id": x["gd_level_id"],
                        "decision": x["source_action"], "reason": "STAGING_ONLY",
                        "first_record": x["first_observed_fr_be"].get("player", {}).get("name", ""),
                        "verifiers": "; ".join(v.get("player", {}).get("name", "") for v in x["verifiers_fr_be"])})
        for x in plan["excluded"]:
            w.writerow({"rank": x["rank"], "name": x["name"], "gd_level_id": x["gd_level_id"],
                        "decision": "EXCLUDED", "reason": x["reason"]})



def media_review_export(plan):
    """Fichier destiné à la revue humaine, pas une publication automatique."""
    result = []
    for row in plan["included"]:
        first = row.get("first_observed_fr_be") or {}
        result.append({"gd_level_id": row["gd_level_id"],
                       "aredl_id": row["aredl_id"], "aredl_rank": row["aredl_rank"],
                       "name": row["aredl_name"], "approved": False,
                       "records_complete": True,
                       "verifiers": row["verifiers_fr_be"],
                       "first_fr_be": first,
                       "notice": "Premier record FR/BE daté disponible, pas nécessairement première victoire historique."})
    return {"schema_version": 1, "status": "REVIEW_REQUIRED", "levels": result}


def main():
    p = argparse.ArgumentParser(description="Prépare un staging SQL sécurisé, sans exécution")
    p.add_argument("--input", default="out/aredl-nlw-review.json")
    p.add_argument("--output", default="out/aredl-nlw-stage")
    args = p.parse_args()
    plan = build_plan(json.loads(Path(args.input).read_text(encoding="utf-8")))
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.with_suffix(".json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    target.with_suffix(".sql").write_text(to_sql(plan), encoding="utf-8")
    write_csv(target.with_suffix(".csv"), plan)
    media_path = target.with_name(target.name + "-media.json")
    media_path.write_text(json.dumps(media_review_export(plan), ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status":plan["status"], **plan["counts"], "warning": "AUCUNE ECRITURE SUPABASE"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
