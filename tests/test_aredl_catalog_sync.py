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
    def test_duplicate_gd_blocks_both(self):
        rows, invalid = normalized_catalog({'levels':[{'id':'a-1','name':'A','position':1,'level_id':123},
                                                      {'id':'a-2','name':'B','position':2,'level_id':123}]})
        self.assertFalse(rows)
        self.assertTrue(invalid)
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

if __name__=='__main__':unittest.main()
