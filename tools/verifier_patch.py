"""Contrôle hors ligne, sans accès Supabase et sans lecture de secrets."""
from pathlib import Path
import csv,re
base=Path(__file__).resolve().parents[1]
src=(base/'supabase/02_charger_dump.sql').read_text(encoding='utf-8')
assert 'BEGIN;' in src and src.rstrip().endswith('COMMIT;')
for sensitive in ('password_hash','discord_link_code_hash','email','discord_user_id','staff_roles','@gmail.com'):
    assert sensitive not in src.lower(), f'Donnée interdite : {sensitive}'
assert src.count('INSERT INTO dlfr_legacy.')>=5
assert 'INSERT INTO public.' not in src
with (base/'rapports/niveaux_historiques.csv').open(encoding='utf-8-sig') as f:
    levels=list(csv.DictReader(f,delimiter=';'))
with (base/'rapports/records_historiques.csv').open(encoding='utf-8-sig') as f:
    records=list(csv.DictReader(f,delimiter=';'))
assert len(levels)==161, len(levels)
assert len(records)==290, len(records)
assert sorted(int(x['Position historique']) for x in levels if int(x['Position historique'])<=150)==list(range(1,151))
assert len([x for x in levels if int(x['Position historique'])<=75 and int(x['Minimum de record (%)'])<100])==73
assert len([x for x in records if int(x['Progression'])<100])==6
assert not any('assets/flags' in str(x) for x in base.rglob('*'))
print('OK : 161 niveaux, 290 records, 73 minimums Top 75, 6 progressions partielles, aucun secret ou drapeau.')
