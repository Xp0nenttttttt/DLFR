import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from aredl_catalog_sync import normalized_catalog, run, endpoint, rpc

class CatalogSyncTests(unittest.TestCase):
    def test_catalog_success(self):
        data = {'levels': [
            {'id':'a-1','name':'Level One','position':1,'level_id':123},
            {'id':'a-2','name':'Level Two','position':2,'level_id':124}]}
        rows, invalid = normalized_catalog(data)
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]['gd_level_id'],'123')
        self.assertFalse(invalid)
    def test_missing_gd_skipped(self):
        rows, invalid = normalized_catalog({'levels':[{'id':'a-1','name':'Level One','position':1}]})
        self.assertFalse(rows)
        self.assertEqual(len(invalid),1)
    def test_duplicate_gd_unknown_variant_is_staged_for_review(self):
        rows, invalid = normalized_catalog({'levels':[{'id':'a-1','name':'A','position':1,'level_id':123},
                                                      {'id':'a-2','name':'B','position':2,'level_id':123}]})
        self.assertEqual(len(rows),2)
        self.assertFalse(invalid)
        self.assertTrue(all(x['shared_gd_level'] and x['needs_variant_review'] for x in rows))
    def test_solo_2p_share_gd_but_have_separate_aredl_keys(self):
        rows, invalid = normalized_catalog({'levels':[{'id':'aredl-solo','name':'Duality (Solo)','position':11,'level_id':555},
                                                      {'id':'aredl-2p','name':'Duality (2P)','position':22,'level_id':555}]})
        self.assertEqual(len(rows),2)
        self.assertEqual([x['completion_mode'] for x in rows],['solo','two_player'])
        self.assertTrue(all(x['shared_gd_level'] and not x['needs_variant_review'] for x in rows))
        self.assertFalse(invalid)
    def test_duplicate_aredl_identity_still_quarantined(self):
        rows, invalid = normalized_catalog({'levels':[{'id':'id1','name':'A','position':1,'level_id':99},
                                                      {'id':'id1','name':'B','position':2,'level_id':100}]})
        self.assertFalse(rows)
        self.assertEqual(len(invalid),2)
        self.assertTrue(all(x['issue_type']=='duplicate' for x in invalid))
    def test_mode_preview_without_secrets(self):
        res=run([{'gd_level_id':'1'}], 'preview')
        self.assertEqual(res['scanned'],1)
    def test_no_http_for_preview(self):
        self.assertEqual(endpoint('https://abc.supabase.co'),'https://abc.supabase.co/rest/v1/rpc/dlfr_aredl_catalog_batch')
        with self.assertRaises(ValueError): endpoint('http://example.com')
    def test_stage_and_publish_batched(self):
        seen=[]
        def stub(url,key,rows,publish):
            seen.append((len(rows),publish))
            return {'staged':len(rows),'created':len(rows) if publish else 0,'matched':0,'conflicts':0,'skipped':0}
        rows=[{'gd_level_id':str(i+1)} for i in range(105)]
        res=run(rows,'publish','https://test.supabase.co','x'*30,batch_size=40,request_rpc=stub)
        self.assertEqual([n for n,_ in seen],[40,40,25])
        self.assertTrue(all(b for _,b in seen))
        self.assertEqual(res['created'],105)
    def test_conflicts_returned(self):
        res=run([{'gd_level_id':'99'}],'stage','https://test.supabase.co','x'*30,
                request_rpc=lambda *args:{'staged':1,'created':0,'matched':0,'conflicts':1,'skipped':0,
                                          'conflict_details':[{'gd_level_id':'99','reason':'collision'}]})
        self.assertEqual(len(res['conflict_details']),1)
    def test_missing_secret_rejected(self):
        with self.assertRaises(ValueError): rpc('https://example.org','',[],False)


class QuarantineReportsTests(unittest.TestCase):
    @staticmethod
    def sample():
        return {'levels':[
          {'id':'a1','position':1,'name':'Good A','level_id':111},
          {'id':'a2','position':2,'name':'No ID'},
          {'id':'a3','position':3,'name':'Collision A','level_id':333},
          {'id':'a4','position':4,'name':'Collision B','level_id':333},
          {'id':'a5','position':5,'name':'Good B','level_id':555},
        ]}

    def test_every_duplicate_is_quarantined_and_valid_kept(self):
        rows, invalid = normalized_catalog(self.sample())
        self.assertEqual([r['aredl_rank'] for r in rows], [1, 3, 4, 5])
        self.assertEqual([r['aredl_rank'] for r in invalid], [2])
        self.assertIn('absent', invalid[0]['reason'])
        self.assertTrue(all(x['needs_variant_review'] for x in rows if x['gd_level_id'] == '333'))

    def test_reversed_catalog_same_result(self):
        rows_a, invalid_a = normalized_catalog(self.sample())
        rows_b, invalid_b = normalized_catalog({'levels':list(reversed(self.sample()['levels']))})
        self.assertEqual(rows_a,rows_b)
        self.assertEqual(invalid_a,invalid_b)

    def test_main_publish_blocked_but_reports_written(self):
        from aredl_catalog_sync import main
        with tempfile.TemporaryDirectory() as d:
            fixture = Path(d)/'api.json'
            fixture.write_text(json.dumps(self.sample()), encoding='utf8')
            out=Path(d)/'report'
            with patch.object(sys,'argv',['sync','--mode','publish','--catalog-json',str(fixture),'--output',str(out)]),patch('aredl_catalog_sync.run') as mocked:
                self.assertEqual(main(), 2)
                mocked.assert_not_called()
            self.assertTrue((Path(d)/'report.invalid.csv').exists())
            self.assertEqual(json.loads((Path(d)/'report.json').read_text())['status'],'BLOCKED_REVIEW_REQUIRED')
            self.assertEqual(len((Path(d)/'report.invalid.csv').read_text(encoding='utf-8-sig').splitlines()), 2)

    def test_explicit_partial_publish_only_valid_rows(self):
        from aredl_catalog_sync import main
        with tempfile.TemporaryDirectory() as d:
            fixture = Path(d)/'api.json'
            fixture.write_text(json.dumps(self.sample()), encoding='utf8')
            out=Path(d)/'report'
            def fake_run(rows, mode, url, secret, batch_size):
                self.assertEqual(mode, 'publish')
                self.assertEqual([r['aredl_rank'] for r in rows], [1,3,4,5])
                return {'scanned':len(rows),'staged':4,'created':4,'matched':0,'conflicts':0,'skipped':0, 'conflict_details':[]}
            with patch.object(sys,'argv',['sync','--mode','publish','--catalog-json',str(fixture),'--output',str(out),'--allow-partial-publish']),patch('aredl_catalog_sync.run', side_effect=fake_run) as mocked:
                self.assertEqual(main(),0)
            self.assertEqual(mocked.call_count,1)
            report=json.loads((Path(d)/'report.json').read_text())
            self.assertEqual(report['status'],'COMPLETED_WITH_EXCEPTIONS')
            self.assertEqual(report['invalid_count'],1)
            self.assertEqual(report['created'],4)

    def test_stage_valid_rows_with_exceptions(self):
        from aredl_catalog_sync import main
        with tempfile.TemporaryDirectory() as d:
            fixture = Path(d)/'api.json'
            fixture.write_text(json.dumps(self.sample()), encoding='utf8')
            out=Path(d)/'report'
            with patch.object(sys,'argv',['sync','--mode','stage','--catalog-json',str(fixture),'--output',str(out)]),patch('aredl_catalog_sync.run',return_value={'scanned':4,'staged':4,'created':0,'matched':0,'conflicts':0,'skipped':0,'conflict_details':[]}) as mocked:
                self.assertEqual(main(),0)
                self.assertEqual([x['aredl_rank'] for x in mocked.call_args.args[0]],[1,3,4,5])

    def test_network_rpc_error_does_not_erase_diagnostic(self):
        from aredl_catalog_sync import main
        with tempfile.TemporaryDirectory() as d:
            fixture = Path(d)/'api.json'
            fixture.write_text(json.dumps(self.sample()), encoding='utf8')
            out=Path(d)/'report'
            with patch.object(sys,'argv',['sync','--mode','stage','--catalog-json',str(fixture),'--output',str(out)]),patch('aredl_catalog_sync.run',side_effect=RuntimeError('fake RPC fail')):
                with self.assertRaisesRegex(RuntimeError,'fake RPC fail'):
                    main()
            self.assertEqual(json.loads((Path(d)/'report.json').read_text())['status'],'ERROR_DURING_IMPORT')
            self.assertTrue((Path(d)/'report.invalid.csv').exists())

if __name__ == "__main__":
    unittest.main()
