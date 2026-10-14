#!/usr/bin/env python3
"""Catalogue AREDL -> table de contrôle DLFR, publication optionnelle.

Seule la clé SERVICE_ROLE (GitHub Actions secrets) peut appeler la RPC sécurisée.
Ne télécharge PAS les records/victoires : uniquement le catalogue AREDL.
"""
from __future__ import annotations
import argparse
from collections import Counter
import csv
import io
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from aredl_nlw_sync import Client, BASE, normalize_list


def normalized_catalog(raw):
    """Sépare les fiches publiables des anomalies, sans inventer d'ID.

    Deux entrées ayant un même ID GD/AREDL sont TOUTES DEUX mises en
    quarantaine, indépendamment de leur ordre dans le catalogue.
    """
    normalized = normalize_list(raw)
    candidates, invalid = [], []
    for level in normalized:
        gd = level.get('gd_level_id')
        aid = str(level.get('aredl_id') or '').strip()
        name = str(level.get('name') or '').strip()
        rank = level.get('rank')
        row = {'gd_level_id': gd, 'aredl_id': aid, 'aredl_rank': rank, 'aredl_name': name}
        problems = []
        if not gd:
            problems.append('ID Geometry Dash absent ou invalide')
        if not aid:
            problems.append('ID AREDL absent')
        if not name:
            problems.append('nom absent')
        if not isinstance(rank, int) or rank < 1:
            problems.append('rang absent ou invalide')
        if problems:
            invalid.append({**row, 'reason': '; '.join(problems), 'issue_type': 'missing_data'})
        else:
            candidates.append(row)

    gd_counts = Counter(x['gd_level_id'] for x in candidates)
    aredl_counts = Counter(x['aredl_id'] for x in candidates)
    valid = []
    for row in candidates:
        problems = []
        if gd_counts[row['gd_level_id']] > 1:
            problems.append('ID Geometry Dash dupliqué')
        if aredl_counts[row['aredl_id']] > 1:
            problems.append('ID AREDL dupliqué')
        if problems:
            invalid.append({**row, 'reason': '; '.join(problems), 'issue_type': 'duplicate'})
        else:
            valid.append(row)
    invalid.sort(key=lambda x: (x['aredl_rank'] or 0, x['aredl_name']))
    return valid, invalid


def endpoint(base: str) -> str:
    if not base.startswith('https://'):
        raise ValueError('SUPABASE_URL doit être https://...')
    return base.rstrip('/') + '/rest/v1/rpc/dlfr_aredl_catalog_batch'


def rpc(url, secret, rows, publish, attempts=3):
    if not secret or len(secret) < 20:
        raise ValueError('SUPABASE_SERVICE_ROLE_KEY absent ou invalide')
    body = json.dumps({'p_rows': rows, 'p_publish': publish}, ensure_ascii=False).encode('utf-8')
    headers = {
        'apikey': secret,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'DLFR-AREDL-Sync/3.0.5'}
    # Les nouvelles clés sb_secret_* ne sont PAS des JWT.
    # Les anciennes clés service_role JWT utilisent les deux headers.
    if not secret.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + secret
    req = Request(url, data=body, headers=headers, method='POST')
    for attempt in range(attempts):
        try:
            with urlopen(req, timeout=55) as response:
                value = json.load(response)
            if not isinstance(value, dict):
                raise RuntimeError('Format de réponse Supabase inattendu: '+repr(value)[:300])
            return value
        except HTTPError as error:
            message = error.read(1200).decode('utf8', 'replace')
            if error.code in (429, 500, 502, 503, 504) and attempt < attempts-1:
                time.sleep((attempt+1)*3)
                continue
            raise RuntimeError(f'Erreur HTTP Supabase {error.code}: {message}') from error
        except URLError:
            if attempt == attempts-1:
                raise
            time.sleep((attempt+1)*3)
    raise RuntimeError('Supabase indisponible')


def run(rows, mode, url=None, secret=None, batch_size=75, request_rpc=rpc):
    summary = {'mode': mode, 'scanned': len(rows), 'staged': 0, 'created': 0,
               'matched': 0, 'conflicts': 0, 'skipped': 0, 'conflict_details': []}
    if mode == 'preview':
        return summary
    target = endpoint(url or '')
    for n in range(0, len(rows), batch_size):
        batch = rows[n:n+batch_size]
        result = request_rpc(target, secret, batch, mode == 'publish')
        for name in ('staged','created','matched','conflicts','skipped'):
            summary[name] += int(result.get(name, 0))
        summary['conflict_details'].extend(result.get('conflict_details') or [])
        print(f'Lot {n//batch_size+1}: {len(batch)} niveaux, '+
              f"créés {result.get('created',0)}, rapprochés {result.get('matched',0)}, conflits {result.get('conflicts',0)}", flush=True)
    return summary


def save_reports(path, rows, invalid, summary):
    """Toujours fournir un rapport même lorsque la publication est bloquée."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=['aredl_rank', 'aredl_name', 'gd_level_id', 'aredl_id'])
        writer.writeheader()
        writer.writerows(rows)
    invalid_file = path.parent / (path.name + '.invalid.csv')
    with invalid_file.open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=['aredl_rank', 'aredl_name', 'gd_level_id', 'aredl_id', 'issue_type', 'reason'])
        writer.writeheader()
        writer.writerows(invalid)
    path.with_suffix('.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    return [path.with_suffix('.csv'), invalid_file, path.with_suffix('.json')]


def main():
    p = argparse.ArgumentParser(description='Synchronisation globale AREDL (sans records)')
    p.add_argument('--mode', choices=['preview', 'stage', 'publish'], default='preview')
    p.add_argument('--catalog-json', default='', help='Données /levels pour tests hors-ligne')
    p.add_argument('--output', default='out/aredl-global')
    p.add_argument('--batch-size', type=int, default=75)
    p.add_argument('--allow-partial-publish', action='store_true',
                   help='Confirmer la publication des seules fiches valides ; exceptions exclues et rapportées')
    args = p.parse_args()
    if not 1 <= args.batch_size <= 100:
        p.error('Taille de lot comprise entre 1 et 100')
    payload = (json.loads(Path(args.catalog_json).read_text(encoding='utf8'))
               if args.catalog_json else Client(BASE, cache_dir=None).get('/levels'))
    rows, invalid = normalized_catalog(payload)
    path = Path(args.output)
    report = {'mode': args.mode, 'total_levels': len(rows) + len(invalid),
              'valid_levels': len(rows), 'invalid_count': len(invalid),
              'invalid': invalid, 'status': 'PREVIEW', 'publish_blocked': False}
    # Le rapport existe AVANT les vérifications susceptibles de terminer le workflow.
    save_reports(path, rows, invalid, report)
    print(f'Catalogue : {len(rows)} valides, {len(invalid)} en quarantaine.', flush=True)
    if invalid:
        print('Exemples des anomalies :', flush=True)
        for entry in invalid[:6]:
            print(f"  AREDL #{entry['aredl_rank']} {entry['aredl_name']}: {entry['reason']}", flush=True)
    if not rows:
        report['status'] = 'BLOCKED_NO_VALID_LEVELS'
        save_reports(path, rows, invalid, report)
        print('Aucun niveau AREDL valide : aucun envoi Supabase.', file=sys.stderr)
        return 2
    if invalid and args.mode == 'publish' and not args.allow_partial_publish:
        report['status'] = 'BLOCKED_REVIEW_REQUIRED'
        report['publish_blocked'] = True
        save_reports(path, rows, invalid, report)
        print(f'Publication bloquée : {len(invalid)} anomalies. Le rapport est disponible ' +
              f'dans {path.parent / (path.name + ".invalid.csv")}.', file=sys.stderr)
        print('Après vérification, relancer avec --allow-partial-publish pour publier ' +
              'UNIQUEMENT les niveaux valides.', file=sys.stderr)
        return 2
    if invalid and args.mode == 'publish':
        print(f'PUBLICATION PARTIELLE CONFIRMÉE : {len(invalid)} fiches exclues, ' +
              'aucun ID GD inventé.', flush=True)
    try:
        result = run(rows, args.mode, os.getenv('SUPABASE_URL'),
                     os.getenv('SUPABASE_SECRET_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY'),
                     args.batch_size)
        report.update(result)
        report['status'] = ('COMPLETED_WITH_EXCEPTIONS' if invalid else 'COMPLETED')
    except Exception as exc:
        report['status'] = 'ERROR_DURING_IMPORT'
        report['error'] = str(exc)
        save_reports(path, rows, invalid, report)
        raise
    save_reports(path, rows, invalid, report)
    print(json.dumps({k: v for k, v in report.items() if k not in ('invalid', 'conflict_details')},
                     indent=2, ensure_ascii=False))
    print('Rapports :', path.with_suffix('.csv'),
          path.parent / (path.name + '.invalid.csv'), path.with_suffix('.json'))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('IMPORT ARRÊTÉ :', exc, file=sys.stderr)
        sys.exit(1)
