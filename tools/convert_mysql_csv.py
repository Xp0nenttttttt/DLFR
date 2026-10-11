#!/usr/bin/env python3
"""Convertit des exports CSV phpMyAdmin en CSV compatibles Supabase.

Ne copie JAMAIS les mots de passe / emails / secrets utilisateurs.
Usage:
  python tools/convert_mysql_csv.py --input-dir /chemin/exports_mysql --output-dir imports

Importer la sortie dans Supabase Table Editor, table par table, dans l'ordre indiqué.
"""
import argparse
import csv
from pathlib import Path


def load_csv(path):
    if not path.exists():
        return []
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        sample = f.read(8192)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(f, dialect=dialect)
        if not reader.fieldnames:
            raise ValueError(f'{path.name}: fichier sans en-têtes de colonnes')
        return list(reader)


def clean(v):
    return str(v or '').strip() if v not in (r'\N', 'NULL', None) else ''


def truth(v):
    return clean(v).lower() in ('1', 'true', 'yes', 'oui')


def b(v):
    return 'true' if truth(v) else 'false'


def field(row, name, default=''):
    return clean(row.get(name, default))


def name_key(name):
    return clean(name).lower()


def write_csv(out, table, rows, columns):
    if not rows:
        print(f'  {table}: aucun enregistrement (non généré)')
        return
    path = out / (table + '.csv')
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, '') for col in columns})
    print(f'  {table}: {len(rows)} lignes')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input-dir', required=True, type=Path)
    p.add_argument('--output-dir', default=Path('imports'), type=Path)
    args = p.parse_args()
    src, out = args.input_dir, args.output_dir
    if not src.exists():
        p.error(f'dossier introuvable : {src}')
    out.mkdir(parents=True, exist_ok=True)

    users = load_csv(src / 'users.csv')
    demons = load_csv(src / 'demons.csv')
    records = load_csv(src / 'completions.csv')
    if not demons:
        p.error('Fichier demons.csv manquant ou vide. Exporter les tables en CSV avec la première ligne des noms de colonnes.')
    print('Conversion des exports MySQL (les mots de passe ne sont jamais importés) :')

    players = {}
    for u in users:
        name = field(u, 'username')
        if not name:
            continue
        k = name_key(name)
        players[k] = {
            'player_key': k, 'legacy_id': field(u, 'id'), 'username': name,
            'display_name': field(u, 'display_name'),
            'country_code': field(u, 'country_code').upper(),
            'has_account': 'true', 'legacy_role': field(u, 'role', 'player') or 'player',
            'points': field(u, 'points', '0') or '0', 'bonus_points': field(u, 'bonus_points', '0') or '0',
            'hidden_from_stats': 'false',
        }

    def ensure_player(n):
        name = clean(n)
        if not name:
            return
        k = name_key(name)
        if k not in players:
            players[k] = {'player_key': k, 'legacy_id': '', 'username': name,
                'display_name': name, 'country_code': '', 'has_account': 'false',
                'legacy_role': 'player', 'points': '0', 'bonus_points': '0',
                'hidden_from_stats': 'false'}

    for d in demons:
        for col in ('publisher', 'verifier', 'creator'):
            ensure_player(field(d, col))
        for extra in field(d, 'creator_more').split(','):
            ensure_player(extra)
    for r in records:
        ensure_player(field(r, 'player'))

    visibility = load_csv(src / 'player_visibility.csv')
    for v in visibility:
        k = name_key(field(v, 'player_key'))
        if k in players:
            players[k]['hidden_from_stats'] = b(v.get('is_hidden'))

    write_csv(out, 'players', list(players.values()),
       ['player_key','legacy_id','username','display_name','country_code','has_account','legacy_role','points','bonus_points','hidden_from_stats'])

    demon_out = []
    dc = ['id','position','name','difficulty','requirement','creator','creator_more','publisher',
      'verifier','publisher_user_id','verifier_user_id','video_url','thumbnail_url','description',
      'level_id','level_length','song','object_count','legacy','created_at']
    for d in demons:
        row = {c:field(d,c) for c in dc}
        row['legacy'] = b(d.get('legacy'))
        row['difficulty'] = row['difficulty'] or 'Extreme Demon'
        row['requirement'] = row['requirement'] or '100'
        row['publisher'] = row['publisher'] or ''
        demon_out.append(row)
    write_csv(out, 'demons', demon_out, dc)

    rc = ['id','demon_id','player','video_url','progress','placement','created_at']
    write_csv(out,'completions',[{c:field(r,c) for c in rc} for r in records],rc)

    optional = {
      'news_items': ['id','headline','body','player_name','is_published','created_at'],
      'profile_titles':['id','label','description','color','is_active'],
      'player_profile_titles':['player_key','title_id'],
      'player_profiles':['player_key','bio','banner_url','social_url','highlight_1','highlight_2','highlight_3','updated_at'],
      'hall_of_fame':['id','player_key','headline','description','award_year','category','source_url','is_published','created_at'],
      'player_stat_snapshots':['snapshot_day','player_key','points','rank_position','completions','hardest_demon'],
      'demon_position_history':['id','demon_id','old_position','new_position','note','created_at'],
    }
    booleans={'is_published','is_active'}
    for table, cols in optional.items():
        source=load_csv(src/(table+'.csv'))
        outrows=[]
        for r in source:
            obj={c:field(r,c) for c in cols}
            for c in booleans.intersection(obj):obj[c]=b(obj[c])
            if 'player_key' in obj:obj['player_key']=name_key(obj['player_key'])
            outrows.append(obj)
        write_csv(out,table,outrows,cols)
    print('\nTERMINÉ. Importer dans cet ordre : players, demons, completions, puis les tables optionnelles.')
    print('IMPORTANT : le dossier imports/ est ignoré par Git. Ne publier AUCUN export brut MySQL.')

if __name__ == '__main__':
    main()
