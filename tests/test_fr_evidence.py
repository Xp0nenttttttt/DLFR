import sys
import csv
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'tools'))
import aredl_fr_evidence_sync as fr

class FakeClient:
    def get(self,path):
        if path == '/levels':
            return {'data': []}
        if path.startswith('/levels/') and '/records?' not in path:
            return {'data':{'verifications':[
                {'submitted_by':{'id':'p-fr','name':'JoueurFR','country':250},'video_url':'https://youtu.be/OKEHsJPaeQY','achieved_at':'2024-01-02T00:00:00Z'},
                {'submitted_by':{'id':'p-be','name':'JoueurBE','country':56},'achieved_at':'2023-02-01T00:00:00Z'}]}}
        if '/records?' in path:
            return {'pages':1,'data':[
                {'id':'fr01','submitted_by':{'id':'p-fr','name':'JoueurFR','country':250},'progress':100,'achieved_at':'2024-01-01T00:00:00Z'},
                {'id':'be01','submitted_by':{'id':'p-be','name':'JoueurBE','country':56},'progress':100,'achieved_at':'2023-02-01T00:00:00Z'}]}
        raise AssertionError(path)

class Tests(unittest.TestCase):
    def test_fr_only_not_belgian(self):
        rows,problems=fr.collect([{'aredl_id':'x','gd_level_id':'123','rank':220,'name':'Test'}],FakeClient(),resolve_players=False)
        self.assertFalse(problems)
        self.assertEqual(len(rows),1)
        self.assertTrue(rows[0]['records_complete'])
        self.assertEqual([x['player']['country'] for x in rows[0]['verifiers_fr']],['FR'])
        self.assertEqual(rows[0]['first_fr']['player']['country'],'FR')
        self.assertEqual(rows[0]['first_fr']['record_id'],'fr01')
    def test_incomplete_never_generates_first(self):
        class Bad(FakeClient):
            def get(self,path):
                if '/records?' in path:
                    return {'pages':30,'data':[]}
                return super().get(path)
        rows,problems=fr.collect([{'aredl_id':'x','gd_level_id':'123','rank':220,'name':'Test'}],Bad(),max_pages=1,resolve_players=False)
        self.assertTrue(problems)
        self.assertFalse(rows[0]['records_complete'])
        self.assertFalse(rows[0]['first_fr'])

    def test_csv_extra_json_field_does_not_break(self):
        with tempfile.TemporaryDirectory() as d:
            csv_file = Path(d) / 'evidence.csv'
            rows = [{
                'aredl_rank': 220, 'aredl_name': 'Test', 'aredl_id': 'id-1',
                'gd_level_id': '123', 'records_complete': True, 'records_seen': 114,
                'verifiers_fr': [{'player': {'name': 'JoueurFR', 'country': 'FR'}}],
                'first_fr': {'player': {'name': 'JoueurFR'}, 'record_id': 'r1'},
                'future_unexpected_field': 'do not crash',
            }]
            fr.write_review_csv(csv_file, rows)
            with csv_file.open(encoding='utf-8-sig', newline='') as f:
                exported = list(csv.DictReader(f))
            self.assertEqual(len(exported), 1)
            self.assertEqual(exported[0]['records_seen'], '114')
            self.assertEqual(exported[0]['first_fr'], 'JoueurFR')
            self.assertEqual(exported[0]['verifiers_fr'], 'JoueurFR')
            self.assertNotIn('future_unexpected_field', exported[0])
            self.assertEqual(rows[0]['first_fr']['record_id'], 'r1')

    def test_csv_without_first_fr_or_verifiers(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'review.csv'
            fr.write_review_csv(p, [{'aredl_rank': 220, 'aredl_name': 'No FR',
                                    'verifiers_fr': [], 'first_fr': {}}])
            with p.open(encoding='utf-8-sig', newline='') as f:
                row = list(csv.DictReader(f))[0]
            self.assertEqual(row['first_fr'], '')
            self.assertEqual(row['verifiers_fr'], '')
            self.assertEqual(row['records_seen'], '')

    def test_full_stage_preserves_json_evidence(self):
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as d:
            output = str(Path(d) / 'aredl-fr-review')
            entries = [{'aredl_id':'x','gd_level_id':'123','rank':220,'name':'Test'}]
            sent = []
            def staging(url, secret, rows):
                sent.extend(rows)
                return {'updated': len(rows), 'skipped': 0}
            with patch.object(fr, 'Client', return_value=FakeClient()), \
                 patch.object(fr, 'normalize_list', return_value=entries), \
                 patch.object(fr, 'stage_rows', side_effect=staging), \
                 contextlib.redirect_stdout(io.StringIO()):
                rc = fr.main(['--start-rank','220','--end-rank','220',
                              '--mode','stage','--output',output])
            self.assertEqual(rc, 0)
            self.assertEqual(sent[0]['first_fr']['record_id'], 'fr01')
            self.assertTrue(sent[0]['records_complete'])
            report = json.loads(Path(output + '.json').read_text(encoding='utf8'))
            self.assertEqual(report['supabase']['updated'], 1)

    def test_full_preview_creates_csv_and_json(self):
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as d:
            output = str(Path(d) / 'aredl-fr-review')
            entries = [{'aredl_id':'x','gd_level_id':'123','rank':220,'name':'Test'}]
            with patch.object(fr, 'Client', return_value=FakeClient()), \
                 patch.object(fr, 'normalize_list', return_value=entries), \
                 contextlib.redirect_stdout(io.StringIO()):
                rc = fr.main(['--start-rank','220','--end-rank','220',
                              '--mode','preview','--output',output])
            self.assertEqual(rc, 0)
            with Path(output + '.csv').open(encoding='utf-8-sig',newline='') as f:
                records = list(csv.DictReader(f))
            self.assertEqual(records[0]['first_fr'], 'JoueurFR')
            self.assertTrue(records[0]['records_seen'].isdigit())
            report = json.loads(Path(output + '.json').read_text(encoding='utf8'))
            self.assertEqual(report['rows'][0]['first_fr']['record_id'], 'fr01')
            self.assertEqual(report['status'], 'READY_FOR_REVIEW')

if __name__=='__main__':unittest.main()
