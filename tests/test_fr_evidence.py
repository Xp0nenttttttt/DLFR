import sys
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'tools'))
import aredl_fr_evidence_sync as fr

class FakeClient:
    def get(self,path):
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

if __name__=='__main__':unittest.main()
