#!/usr/bin/env python3
"""AREDL -> DLFR NLW : import PREVIEW, jamais d'écriture SQL. Python stdlib.

Identités : le niveau est identifié par son ID Geometry Dash (gd_level_id) ;
la fiche AREDL par son id AREDL, les joueurs par leur identifiant AREDL.
Les pseudos ne servent JAMAIS de clé de rapprochement automatique.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE = "https://api.aredl.net/v2/api/aredl"
UA = "DLFR-NLW-Preview/1.0 (respectful read-only sync)"
COUNTRIES = {"FR": "FR", "FRANCE": "FR", "FRA": "FR", "FRENCH": "FR",
             "BE": "BE", "BELGIUM": "BE", "BELGIQUE": "BE", "BEL": "BE", "BELGIAN": "BE"}
# AREDL uses ISO 3166-1 *numeric* values in user.country (not ISO alpha-2).
NUMERIC_COUNTRIES = {250: "FR", 56: "BE"}


def obj(value):
    return value if isinstance(value, dict) else {}


def pick(row, *names):
    row = obj(row)
    for name in names:
        value = row.get(name)
        if value is not None and value != "":
            return value
    return None


def numeric_id(value):
    if isinstance(value, dict):
        value = pick(value, "id", "level_id")
    if value is None or isinstance(value, bool):
        return None
    s = str(value).strip()
    return s if s.isdecimal() and int(s) > 0 else None


def country(value):
    if isinstance(value, dict):
        value = pick(value, "country_code", "iso2", "code", "name", "country")
    if isinstance(value, int) and not isinstance(value, bool):
        return NUMERIC_COUNTRIES.get(value)
    if not isinstance(value, str):
        return None
    value = value.strip().upper()
    if value.isdecimal():
        return NUMERIC_COUNTRIES.get(int(value))
    return COUNTRIES.get(value)


def identity(entity):
    if isinstance(entity, str):
        return {"aredl_player_id": None, "name": entity, "country": None}
    entity = obj(entity)
    return {
        "aredl_player_id": str(pick(entity, "player_id", "user_id", "id", "uuid") or "") or None,
        "name": str(pick(entity, "global_name", "display_name", "username", "name") or "") or None,
        "country": country(pick(entity, "country_code", "country", "nationality", "country_name")),
    }


def unwrap_collection(payload, possible_keys):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in possible_keys:
            v = payload.get(k)
            if isinstance(v, list):
                return v
            if isinstance(v, dict):
                inner = unwrap_collection(v, possible_keys)
                if inner is not None:
                    return inner
    return None


def verified_date(record):
    """N'invente JAMAIS une date de victoire depuis created_at/submitted_at."""
    raw = pick(record, "achieved_at", "completed_at", "completion_date", "beaten_at", "victory_date")
    if not isinstance(raw, str):
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            return None  # impossible d'ordonner sûrement les dates sans fuseau
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def record_player(record):
    record = obj(record)
    nested = pick(record, "submitted_by", "player", "user", "submitter")
    data = identity(nested)
    if not data["aredl_player_id"]:
        v = pick(record, "player_id", "user_id")
        if v is not None:
            data["aredl_player_id"] = str(v)
    if not data["name"]:
        data["name"] = pick(record, "player_name", "username")
    if not data["country"]:
        data["country"] = country(pick(record, "country", "country_code"))
    return data


def is_approved(record):
    record = obj(record)
    v = pick(record, "status", "state")
    return v is None or str(v).lower() in ("approved", "accepted", "verified", "valid")


def is_100(record):
    progress = pick(record, "progress", "percentage", "percent")
    if progress is None:
        return True  # la collection 'victors' représente déjà des victoires
    try:
        return float(progress) == 100.0
    except (ValueError, TypeError):
        return False


def first_victor(records, target=None):
    eligible = []
    for rec in records:
        if not isinstance(rec, dict) or not is_approved(rec) or not is_100(rec):
            continue
        p = record_player(rec)
        if p["country"] not in ({target} if target else {"FR", "BE"}):
            continue
        date = verified_date(rec)
        if date:
            eligible.append((date, p, str(pick(rec, "id", "record_id") or "") or None))
    eligible.sort(key=lambda x: x[0])
    if not eligible:
        return {"status": "unknown", "reason": "aucune victoire datée ET localisée dans les records disponibles"}
    if len(eligible) > 1 and eligible[0][0] == eligible[1][0]:
        return {"status": "ambiguous", "reason": "égalité de date, examen humain nécessaire"}
    date, p, rid = eligible[0]
    return {"status": "first_dated_record", "record_id": rid,
            "player": p, "completed_at": date,
            "note": "Plus ancien record FR/BE daté disponible, pas forcément première victoire historique"}


class Client:
    def __init__(self, base, cache_dir, offline=False, pause=0.23):
        self.base = base.rstrip("/")
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.offline = offline
        self.pause = pause
        self.lock = threading.Lock()
        self.last_call = 0.0

    def get(self, path):
        if self.cache_dir:
            filename = re.sub(r"[^a-zA-Z0-9_-]+", "_", path.strip("/")) + ".json"
            file = self.cache_dir / filename
            if file.is_file() and (self.offline or time.time() - file.stat().st_mtime < (3600 if path == "/levels" else 86400)):
                return json.loads(file.read_text(encoding="utf8"))
        if self.offline:
            raise ValueError(f"Mode hors ligne : fichier cache manquant pour {path}")
        req = Request(self.base + path, headers={"Accept": "application/json", "User-Agent": UA})
        for attempt in range(4):
            with self.lock:
                wait = max(0.0, self.pause - (time.monotonic() - self.last_call))
                if wait:
                    time.sleep(wait)
                self.last_call = time.monotonic()
            try:
                with urlopen(req, timeout=25) as response:
                    payload = json.load(response)
                if self.cache_dir:
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf8")
                return payload
            except HTTPError as e:
                if e.code == 404:
                    raise RuntimeError(
                        f"AREDL a renvoyé HTTP 404 pour {req.full_url}. "
                        "La route semble incorrecte ou a changé. "
                        "Vérifie la base AREDL dans le script et sa documentation : "
                        "https://api.aredl.net/v2/docs"
                    ) from e
                if e.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise
                time.sleep(2 ** attempt * 3)
            except URLError:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt * 2)
        raise RuntimeError("AREDL injoignable")


def normalize_list(payload):
    levels = unwrap_collection(payload, ("levels", "data", "results", "items"))
    if levels is None:
        raise ValueError("Structure /levels inconnue : aucune liste trouvée, arrêt sans résultat")
    parsed = []
    for item in levels:
        if not isinstance(item, dict):
            continue
        rank = pick(item, "position", "rank", "list_position")
        try:
            rank = int(rank)
        except (ValueError, TypeError):
            raise ValueError(f"Rang absent ou invalide sur le niveau {item.get('name')!r}. Pas de rang deviné.")
        aid = pick(item, "id", "uuid", "aredl_id")
        if rank < 1 or not aid:
            raise ValueError(f"Donnée incorrecte pour {item.get('name')!r}")
        parsed.append({"aredl_id": str(aid), "rank": rank, "name": str(item.get("name") or ""),
                       "gd_level_id": numeric_id(pick(item, "level_id", "gd_level_id", "gd_id")),
                       "raw": item})
    ranks = [x["rank"] for x in parsed]
    if len(set(ranks)) != len(ranks):
        raise ValueError("Rangs AREDL en doublon : vérification nécessaire")
    return sorted(parsed, key=lambda x: x["rank"])


def read_existing(path):
    if not path:
        return []
    p = json.loads(Path(path).read_text(encoding="utf8"))
    if isinstance(p, list):
        return p
    if isinstance(p, dict):
        return p.get("demons", [])
    raise ValueError("Format --existing-json invalide")


def level_action(source, existing):
    matches_gid = [d for d in existing if numeric_id(pick(d, "level_id", "gd_level_id")) == source["gd_level_id"]] if source["gd_level_id"] else []
    if len(matches_gid) > 1:
        return "CONFLICT_MULTIPLE_MATCHES"
    if matches_gid:
        return "MATCH_MANUAL_KEEP"  # ne jamais écraser le staff
    same_name = [d for d in existing if str(d.get("name", "")).casefold() == source["name"].casefold()]
    if same_name:
        return "REVIEW_SAME_NAME_DIFFERENT_ID"
    if not source["gd_level_id"]:
        return "REVIEW_MISSING_GD_ID"
    return "NEW_CANDIDATE"


def extract_one(item, detail, existing, resolve_player=None, extra_records=None):
    # detail may be wrapped; fail closed when no object supplied
    if not isinstance(detail, dict):
        raise ValueError("Détail AREDL absent ou invalide")
    body = obj(detail.get("data")) if isinstance(detail.get("data"), dict) else detail
    gid = numeric_id(pick(body, "level_id", "gd_level_id", "gd_id")) or item["gd_level_id"]
    source = {k: item[k] for k in ("aredl_id", "rank", "name")}
    source["gd_level_id"] = gid
    source["source"] = "aredl"
    source["rated"] = True  # AREDL = All Rated Extreme Demons
    source["verifiers"] = []
    verifications = unwrap_collection(body, ("verifications", "verifiers")) or []
    unresolved_verifiers = []
    for ver in verifications:
        if not isinstance(ver, dict):
            continue
        p = record_player(ver)
        secondary = identity(pick(ver, "submitted_by", "verified_by", "verifier"))
        for key in ("aredl_player_id", "name", "country"):
            if not p[key]:
                p[key] = secondary[key]
        if p["aredl_player_id"] and not p["country"] and resolve_player:
            other = resolve_player(p["aredl_player_id"])
            if other:
                p["country"] = other["country"]
                p["name"] = p["name"] or other["name"]
        # Conserver dans la copie locale pour rechercher la premiere victoire,
        # sans modifier la reponse API mise en cache.
        if p["country"]:
            ver["country_code"] = p["country"]
        # IMPORTANT: si pays inconnu on ne l'infère jamais à partir du pseudo
        if p["country"] in ("FR", "BE"):
            source["verifiers"].append({"player": p, "video_url": pick(ver, "video_url", "video", "url"),
                                        "verification_id": pick(ver, "id", "verification_id"),
                                        "achieved_at": verified_date(ver)})
        elif p["name"] and not (pick(obj(pick(ver, "submitted_by", "player", "user", "submitter", "verified_by", "verifier")), "country_code", "country", "nationality") or pick(ver, "country_code", "country")):
            unresolved_verifiers.append({"name": p["name"], "aredl_player_id": p["aredl_player_id"], "reason": "pays non confirmé"})
    source["unresolved_verifiers"] = unresolved_verifiers
    records = extra_records if extra_records is not None else (unwrap_collection(body, ("records", "victors", "completions")) or [])
    if resolve_player:
        for rec in records:
            if not isinstance(rec, dict):
                continue
            p = record_player(rec)
            if not p["country"] and p["aredl_player_id"]:
                other = resolve_player(p["aredl_player_id"])
                if other and other["country"]:
                    # enrichir dans une copie en mémoire, pour utiliser country dans first_victor
                    rec["country_code"] = other["country"]
    # Les verifications sont dans une autre table AREDL que les records ordinaires.
    # Une verification francaise/belge peut constituer la premiere victoire.
    dated_verifications = []
    for ver in verifications:
        if isinstance(ver, dict):
            dated_verifications.append(ver)
    records = list(records) + dated_verifications
    source["first_fr_be"] = first_victor(records)
    source["first_fr"] = first_victor(records, "FR")
    source["first_be"] = first_victor(records, "BE")
    source["records_inspected"] = len(records)
    source["action"] = level_action(source, existing)
    source["needs_review"] = bool(source["unresolved_verifiers"]) or source["action"] != "NEW_CANDIDATE" or source["first_fr_be"]["status"] != "first_dated_record"
    return source



def fetch_record_pages(client, aredl_id, max_pages=25):
    """Récupère toutes les pages dans la limite imposée, sans jeter les pages lues.

    Une erreur sur une page ultérieure conserve les précédentes et force
    complete=False. Aucun premier record ne pourra alors être publié comme sûr.
    """
    if not 1 <= max_pages <= 200:
        raise ValueError("--max-record-pages doit être entre 1 et 200")
    all_records = []
    known_pages = None
    for page in range(1, max_pages + 1):
        path = f"/levels/{quote(str(aredl_id), safe='')}/records?page={page}&per_page=100"
        try:
            payload = client.get(path)
            found = unwrap_collection(payload, ("data", "records", "results", "items"))
            if found is None or any(not isinstance(x, dict) for x in found):
                raise ValueError(f"Schéma records inattendu pour {path}")
        except (HTTPError, URLError, ValueError, RuntimeError) as exc:
            return all_records, {"complete": False, "pages_fetched": page-1,
                                 "total_pages": known_pages,
                                 "error": f"Page {page}: {exc}"}
        all_records.extend(found)
        pages = obj(payload).get("pages")
        if isinstance(pages, int) and not isinstance(pages, bool) and pages >= 0:
            known_pages = pages
            if page >= pages:
                return all_records, {"complete": True, "pages_fetched": page,
                                     "total_pages": pages, "error": None}
        elif len(found) < 100:
            return all_records, {"complete": True, "pages_fetched": page,
                                 "total_pages": None, "error": None}
    return all_records, {"complete": False, "pages_fetched": max_pages,
                         "total_pages": known_pages, "error": None}


def save_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as fp:
        writer = csv.DictWriter(fp, fieldnames=["rank", "name", "gd_level_id", "aredl_id", "action",
                                                "verifier_fr_be", "verifier_country", "first_record_fr_be",
                                                "first_record_country", "first_record_date", "first_record_status", "records_inspected", "records_complete", "record_fetch_error"])
        writer.writeheader()
        for x in rows:
            ver = x["verifiers"]
            first = x["first_fr_be"]
            writer.writerow({"rank": x["rank"], "name": x["name"], "gd_level_id": x["gd_level_id"],
                             "aredl_id": x["aredl_id"], "action": x["action"],
                             "verifier_fr_be": "; ".join(str(z["player"]["name"]) for z in ver),
                             "verifier_country": "; ".join(str(z["player"]["country"]) for z in ver),
                             "first_record_fr_be": obj(first.get("player")).get("name"),
                             "first_record_country": obj(first.get("player")).get("country"),
                             "first_record_date": first.get("completed_at"), "first_record_status": first["status"],
                             "records_inspected": x["records_inspected"],
                             "records_complete": x.get("records_complete"),
                             "record_fetch_error": x.get("record_fetch_error")})


def run(args, client):
    listed = normalize_list(client.get("/levels"))
    anchor = next((x for x in listed if x["name"].strip().casefold() == "cobwebs"), None)
    boundary = next((x for x in listed if x["rank"] == 219), None)
    warnings = []
    if not anchor or anchor["rank"] != 219:
        warnings.append(f"ATTENTION: Cobwebs non confirmé au rang 219 (rang observé: {anchor['rank'] if anchor else 'inconnu'}). Vérifier la frontière avant publication.")
    if boundary and boundary["name"].strip().casefold() != "cobwebs":
        warnings.append(f"Rang 219 actuellement : {boundary['name']}. Pas de changement automatique de frontière.")
    selected = [x for x in listed if x["rank"] >= args.start_rank and (args.end_rank is None or x["rank"] <= args.end_rank)]
    existing = read_existing(args.existing_json)
    if not args.existing_json:
        warnings.append("Aucun export DLFR fourni : doublons avec les validations manuelles non vérifiés. Staging uniquement, sans publication.")
    rows, failures = [], []
    player_cache = {}
    players_lock = threading.Lock()
    def resolve_player(aredl_player_id):
        if not args.resolve_players:
            return None
        with players_lock:
            if aredl_player_id in player_cache:
                return player_cache[aredl_player_id]
            # On sérialise la résolution : pas de requêtes répétées pour un même joueur.
            try:
                raw = client.get("/profile/" + quote(str(aredl_player_id), safe=""))
                value = identity(obj(raw).get("data") if isinstance(obj(raw).get("data"), dict) else raw)
            except (HTTPError, URLError, ValueError, KeyError, RuntimeError) as exc:
                # Profil inconnu ou route devenue inaccessible : ne JAMAIS supprimer
                # le niveau entier ou inferer la nationalite depuis le pseudo.
                value = None
            player_cache[aredl_player_id] = value
            return value
    def work(x):
        detail = client.get("/levels/" + quote(x["aredl_id"], safe=""))
        extra_records = None
        record_meta = None
        record_error = None
        if getattr(args, "fetch_records", False):
            try:
                extra_records, record_meta = fetch_record_pages(client, x["aredl_id"], args.max_record_pages)
            except Exception as exc:
                record_error = str(exc)
                extra_records = []
                record_meta = {"complete": False, "pages_fetched": 0, "total_pages": None}
        elif args.records_url_template:
            path = args.records_url_template.replace("{id}", quote(x["aredl_id"], safe=""))
            payload = client.get(path)
            extra_records = unwrap_collection(payload, ("records", "victors", "completions", "data"))
            if extra_records is None:
                raise ValueError("Endpoint records non conforme : aucune liste de records")
        result = extract_one(x, detail, existing, resolve_player, extra_records)
        result["records_complete"] = record_meta["complete"] if record_meta else None
        result["records_pages_fetched"] = record_meta["pages_fetched"] if record_meta else 0
        result["records_total_pages"] = record_meta["total_pages"] if record_meta else None
        result["record_fetch_error"] = record_error or (record_meta.get("error") if record_meta else None)
        if result["record_fetch_error"] or (record_meta and not record_meta["complete"]):
            result["needs_review"] = True
        return result
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        futures = {pool.submit(work, x): x for x in selected}
        for fut in as_completed(futures):
            x = futures[fut]
            try:
                rows.append(fut.result())
            except Exception as exc:
                failures.append({"rank": x["rank"], "name": x["name"], "error": str(exc)})
    rows.sort(key=lambda x: x["rank"])
    if failures:
        warnings.append(f"{len(failures)} fiches en erreur : NE PAS publier cette tranche incomplète.")
    fetch_errors = sum(bool(x.get("record_fetch_error")) for x in rows)
    partial_records = sum(x.get("records_complete") is False for x in rows)
    if fetch_errors:
        warnings.append(f"{fetch_errors} lectures des records AREDL en erreur : premiere victoire a verifier.")
    if partial_records:
        warnings.append(f"{partial_records} jeux de records non exhaustifs (pagination/erreur). Aucune premiere victoire historique certifiee.")
    seen = {}
    for row in rows:
        gid = row["gd_level_id"]
        if gid and gid in seen:
            row["action"] = "CONFLICT_DUPLICATE_GD_ID"
            seen[gid]["action"] = "CONFLICT_DUPLICATE_GD_ID"
        if gid:
            seen[gid] = row
    is_anchor_valid = bool(anchor and anchor["rank"] == 219 and boundary and boundary["name"].strip().casefold() == "cobwebs")
    incomplete = bool(failures or partial_records or fetch_errors or not is_anchor_valid)
    return {"generated_at": datetime.now(timezone.utc).isoformat(),
            "status": "INCOMPLETE_REVIEW_REQUIRED" if incomplete else "PREVIEW_REVIEW_REQUIRED",
            "source": client.base, "scope": {"start_rank": args.start_rank, "end_rank": args.end_rank,
            "countries": ["FR", "BE"], "mode": "preview_only",
            "existing_export_supplied": bool(args.existing_json),
            "anchor_verified": is_anchor_valid},
            "summary": {"levels": len(rows), "with_fr_be_verifier": sum(bool(x["verifiers"]) for x in rows),
            "with_first_dated_record": sum(x["first_fr_be"]["status"] == "first_dated_record" for x in rows),
            "manual_matches": sum(x["action"] == "MATCH_MANUAL_KEEP" for x in rows),
            "record_fetch_errors": fetch_errors, "partial_records": partial_records},
            "warnings": warnings, "failures": failures, "levels": rows}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Prévisualisation NLW AREDL FR/BE (sans écriture Supabase)")
    parser.add_argument("--start-rank", type=int, default=220)
    parser.add_argument("--end-rank", type=int, default=319)
    parser.add_argument("--existing-json", help="Export JSON facultatif des demons DLFR (lecture seule)")
    parser.add_argument("--base-url", default=BASE)
    parser.add_argument("--cache-dir", default=".cache/aredl")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--resolve-players", action="store_true", help="Interroger /profile/{id} si le pays est inconnu ; signaler les cas non resolus")
    parser.add_argument("--records-url-template", help="Chemin validé pour les records, contenant {id} ; aucun endpoint deviné par défaut")
    parser.add_argument("--fetch-records", action="store_true", help="Lire /levels/{id}/records (victors, pagination incluse)")
    parser.add_argument("--max-record-pages", type=int, default=25, help="Maximum de pages de 100 records par niveau, 25 par défaut (max 200)")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--output", default="out/aredl-nlw-review")
    args = parser.parse_args(argv)
    if not 1 <= args.max_record_pages <= 200:
        parser.error("--max-record-pages doit être entre 1 et 200")
    if args.start_rank < 220 or (args.end_rank is not None and args.end_rank < args.start_rank):
        parser.error("Périmètre autorisé : rang AREDL >= 220 et end_rank >= start_rank")
    client = Client(args.base_url, args.cache_dir, args.offline)
    result = run(args, client)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.with_suffix(".json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    save_csv(target.with_suffix(".csv"), result["levels"])
    print(json.dumps({"status": result["status"], **result["summary"], "warnings": result["warnings"],
                      "failures": len(result["failures"]), "files": [str(target.with_suffix('.json')), str(target.with_suffix('.csv'))]},
                     ensure_ascii=False, indent=2))
    return 2 if result["status"] == "INCOMPLETE_REVIEW_REQUIRED" else 0


if __name__ == "__main__":
    sys.exit(main())
