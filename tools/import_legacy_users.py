#!/usr/bin/env python3
"""Import privé des identifiants de l'ancienne DLFR. Python standard library uniquement.
Ne JAMAIS publier le dump, les hashes, ni la clé service_role sur GitHub.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BCRYPT = re.compile(r'^\$2[aby]\$\d\d\$.{53}$')
USERNAME = re.compile(r'^[a-z0-9_-]{3,24}$')


def tuples_from_users_dump(sql):
    matched = re.search(r'INSERT\s+INTO\s+`users`\s+VALUES\s*', sql, re.I)
    if not matched:
        raise ValueError("Section INSERT INTO `users` introuvable dans l'export.")
    i = matched.end()
    rows = []
    row = None
    value = []
    in_string = False
    escaped = False
    while i < len(sql):
        char = sql[i]
        i += 1
        if in_string:
            if escaped:
                value.append(char if char not in ('0', 'n', 'r', 't') else {'0': '\0','n':'\n','r':'\r','t':'\t'}[char])
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == "'":
                if i < len(sql) and sql[i] == "'":
                    value.append("'")
                    i += 1
                else:
                    in_string = False
            else:
                value.append(char)
            continue
        if char == "'":
            in_string = True
        elif char == '(':
            if row is not None:
                raise ValueError('Parenthèses imbriquées inattendues')
            row = []
            value = []
        elif char in ',)':
            if row is None:
                continue
            data = ''.join(value).strip()
            row.append(None if data == 'NULL' else data)
            value = []
            if char == ')':
                rows.append(row)
                row = None
        elif char == ';':
            if row is not None:
                raise ValueError('Ligne utilisateurs interrompue')
            break
        elif row is not None and not char.isspace():
            value.append(char)
    if in_string or not rows:
        raise ValueError('Export utilisateurs incomplet')
    return rows


def extract_users(sql):
    items = []
    ignored = []
    seen = set()
    for row in tuples_from_users_dump(sql):
        if len(row) != 22:
            raise ValueError(f"Ligne utilisateur avec {len(row)} colonnes au lieu de 22")
        uid, handle, hashed, is_banned = row[0], (row[1] or '').lower(), row[12], row[16]
        if not USERNAME.fullmatch(handle) or not BCRYPT.fullmatch(hashed or ''):
            ignored.append({'id': uid, 'reason': 'pseudo ou hash non compatible'})
            continue
        if handle in seen:
            raise ValueError('Pseudo historique répété')
        seen.add(handle)
        items.append({'legacy_user_id': int(uid), 'username_key': handle,
                      'password_hash': hashed, 'is_banned': is_banned == '1'})
    return items, ignored


def publish_batch(base, token, batch):
    payload = json.dumps(batch, ensure_ascii=False).encode('utf8')
    request = Request(f"{base}/rest/v1/dlfr_legacy_credentials", data=payload, method='POST',
                      headers={'apikey': token, 'Authorization': 'Bearer ' + token,
                               'Content-Type': 'application/json',
                               'Prefer': 'resolution=ignore-duplicates,return=minimal'})
    try:
        with urlopen(request, timeout=30) as res:
            if res.status not in (200, 201, 204):
                raise ValueError(f'Requête Supabase échouée (HTTP {res.status})')
    except HTTPError as exc:
        # Ne jamais imprimer le corps des erreurs, qui peut contenir des données sensibles.
        raise RuntimeError(f'Import refusé par Supabase (HTTP {exc.code}). Vérifie la migration SQL V57 et les permissions.') from None
    except URLError:
        raise RuntimeError('Supabase inaccessible. Vérifie la connexion réseau.') from None


def main():
    parser = argparse.ArgumentParser(description='Import sécurisé des anciens comptes DLFR')
    parser.add_argument('dump', type=Path, help='Chemin vers le dump SQL privé de l’ancien site')
    parser.add_argument('--execute', action='store_true', help='Importer en base, sans écraser les comptes déjà importés')
    args = parser.parse_args()
    accounts, ignored = extract_users(args.dump.read_text(encoding='utf-8-sig'))
    print(f'Export analysé : {len(accounts)} comptes compatibles ; {len(ignored)} ignoré(s) ; {sum(x["is_banned"] for x in accounts)} banni(s).')
    if ignored:
        print('IDs à examiner manuellement :', ', '.join(str(x['id']) for x in ignored))
    if not args.execute:
        print('MODE SIMULATION : aucun hash envoyé. Pour importer, ajoute --execute.')
        return
    base = os.environ.get('SUPABASE_URL', '').rstrip('/')
    service = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', base) or not service:
        raise SystemExit('Configure SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans le terminal, puis relance.')
    if input(f'Importer {len(accounts)} comptes dans {base} ? Écris IMPORTER : ') != 'IMPORTER':
        raise SystemExit('Import annulé.')
    for start in range(0, len(accounts), 15):
        publish_batch(base, service, accounts[start:start + 15])
    print('Import terminé. Les hashs restent dans Supabase (table à accès service_role seulement).')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError) as exc:
        print('Erreur :', exc, file=sys.stderr)
        sys.exit(1)
