#!/usr/bin/env python3
"""Collecte en lecture seule. Produit le JSON importable dans Modération > NLW et imports."""
import argparse
import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from aredl_nlw_sync import (BASE, Client, normalize_list, extract_one, fetch_record_pages,
    identity, record_player, is_approved, is_100, video_of, youtube_thumbnail, verified_date)
from aredl_catalog_sync import normalized_catalog


def evidence(rec):
    video = None if rec.get('hide_video') else video_of(rec)
    return {'player': record_player(rec), 'video_url': video,
            'thumbnail_url': youtube_thumbnail(video), 'completed_at': verified_date(rec)}


def build_row(item, detail, records, complete, resolve):
    if not complete:
        raise ValueError('Pagination incomplète : niveau exclu, relancer la collecte')
    detail, records = copy.deepcopy(detail), copy.deepcopy(records)
    body = detail.get('data', detail)
    if not isinstance(body, dict) or str(body.get('id')) != item['aredl_id']:
        raise ValueError('Identité de la fiche AREDL incohérente')
    verifications = body.get('verifications', [])
    # Respecter les vidéos masquées à la source, dans toutes les preuves exportées.
    for r in records + verifications:
        if r.get('hide_video'):
            for field in ('video_url', 'video', 'link', 'url', 'proof_url', 'proof'):
                r.pop(field, None)
    # Un pays connu hors FR/BE n'a pas besoin d'une requête de profil supplémentaire.
    known_profiles = {}
    for rec in records + verifications:
        user = rec.get('submitted_by') or rec.get('player') or rec.get('user') or {}
        if isinstance(user, dict) and user.get('country') is not None and user.get('id'):
            known_profiles[str(user['id'])] = identity(user)
    def resolve_cached(pid):
        return known_profiles[pid] if pid in known_profiles else resolve(pid)
    extracted = extract_one(item, detail, [], resolve_cached, extra_records=records)
    victors = [evidence(r) for r in records if is_approved(r) and is_100(r)
               and record_player(r)['country'] == 'FR' and record_player(r)['name']]
    verifiers = [v for v in extracted['verifiers'] if v['player']['country'] == 'FR' and v['player']['name']]
    first = extracted['first_fr']
    if not victors and not verifiers:
        return None
    # Ne pas annoncer de première victoire certaine quand des dates ou pays manquent.
    unknown = any(not record_player(r)['country'] and str(record_player(r)['aredl_player_id']) not in known_profiles for r in records)
    first = first if first['status'] == 'first_dated_record' else {}
    return {'aredl_id': item['aredl_id'], 'gd_level_id': extracted['gd_level_id'],
            'aredl_rank': item['rank'], 'name': item['name'], 'records_complete': True,
            'publisher': identity(body.get('publisher'))['name'] or '',
            'verifiers_fr': verifiers, 'first_fr': first,
            'victor_fr': (first if first else (victors[0] if victors else {})),
            'first_is_historical': False,
            'undated_fr_records': sum(not v['completed_at'] for v in victors),
            'unknown_countries': unknown}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--start-rank', type=int, default=1, help='Premier rang AREDL à examiner (indépendant du rang DLFR)')
    p.add_argument('--end-rank', type=int, default=0, help='0 = fin du catalogue')
    p.add_argument('--output', default='out/aredl-fr-bulk.json')
    p.add_argument('--cache', default='.cache/aredl-bulk')
    p.add_argument('--max-record-pages', type=int, default=200)
    a = p.parse_args()
    if a.start_rank < 1 or (a.end_rank and a.end_rank < a.start_rank):
        p.error('Intervalle de rangs invalide')
    if not 1 <= a.max_record_pages <= 200:
        p.error('max-record-pages doit être entre 1 et 200')
    client = Client(BASE, a.cache)
    raw = client.get('/levels')
    items = normalize_list(raw)
    catalog, invalid = normalized_catalog(raw)
    variants = {r['aredl_id']: r for r in catalog}
    players = {}
    def resolve(pid):
        if pid not in players:
            data = client.get('/profile/' + quote(str(pid), safe=''))
            data = data.get('data', data)
            # La route profil peut envelopper l'identité dans user.
            players[pid] = identity(data.get('user', data))
        return players[pid]
    selected = [i for i in items if i['rank'] >= a.start_rank and (not a.end_rank or i['rank'] <= a.end_rank)]
    report = {'format': 'dlfr-aredl-fr-bulk-v1', 'generated_at': datetime.now(timezone.utc).isoformat(),
              'country': 'FR', 'start_aredl_rank': a.start_rank, 'end_aredl_rank': a.end_rank,
              'rows': [], 'problems': [], 'scanned': 0, 'total': len(selected), 'scan_complete': False}
    dest = Path(a.output); dest.parent.mkdir(parents=True, exist_ok=True)
    def checkpoint():
        tmp = dest.with_suffix('.tmp')
        tmp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
        tmp.replace(dest)
    for i, item in enumerate(selected, 1):
        try:
            variant = variants.get(item['aredl_id'])
            if not variant or variant['needs_variant_review']:
                raise ValueError('Variante Solo/2P ou identité à examiner manuellement')
            detail = client.get('/levels/' + quote(item['aredl_id'], safe=''))
            records, info = fetch_record_pages(client, item['aredl_id'], a.max_record_pages)
            row = build_row(item, detail, records, info['complete'] and not info['error'], resolve)
            if row:
                row['completion_mode'] = variant['completion_mode']
                report['rows'].append(row)
        except Exception as exc:
            report['problems'].append({'aredl_rank': item['rank'], 'name': item['name'], 'reason': str(exc)[:300]})
        report['scanned'] = i
        checkpoint()
        print(f"{i}/{len(selected)} — #{item['rank']} {item['name']} — {len(report['rows'])} niveaux FR", flush=True)
    report['scan_complete'] = not report['problems']
    checkpoint()
    print(f"JSON : {dest} ; {len(report['rows'])} niveaux admissibles ; {len(report['problems'])} problèmes à consulter")

if __name__ == '__main__':
    main()
