import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from aredl_bulk_fr import build_row

class BulkTests(unittest.TestCase):
    def setUp(self):
        self.item = {'aredl_id':'a','gd_level_id':'100','name':'Test','rank':238}
        self.detail = {'id':'a','publisher':{'global_name':'Creator'},'verifications':[]}
    def record(self, country=250, **kw):
        return {'id':'rec', 'submitted_by':{'id':'player','global_name':'Victor','country':country},
                'achieved_at':'2020-01-01T00:00:00Z', 'video_url':'https://youtu.be/abcdefghijk', **kw}
    def build(self, records, **kw):
        return build_row(self.item,self.detail,records,True,lambda _:None,**kw)
    def test_fr(self):
        r=self.build([self.record()]);self.assertEqual(r['first_fr']['player']['name'],'Victor')
        self.assertEqual(r['publisher'],'Creator')
    def test_undated(self):
        r=self.build([self.record(achieved_at=None)])
        self.assertEqual(r['first_fr'],{});self.assertEqual(r['victor_fr']['player']['name'],'Victor')
    def test_country_and_progress(self):
        for r in [self.record(56),self.record(840),self.record(progress=99),self.record(status='rejected')]:
            self.assertIsNone(self.build([r]))
    def test_incomplete(self):
        with self.assertRaisesRegex(ValueError,'Pagination'):
            build_row(self.item,self.detail,[],False,lambda _:None)
    def test_hidden_video(self):
        r=self.build([self.record(hide_video=True)])
        self.assertIsNone(r['first_fr']['video_url']);self.assertIsNone(r['victor_fr']['video_url'])
    def test_verifier_without_records(self):
        self.detail['verifications']=[self.record()]
        self.assertTrue(self.build([])['verifiers_fr'])
    def test_known_non_fr_not_fetched(self):
        def fail(_): raise AssertionError('Known non-FR must not require a profile request')
        self.assertIsNone(build_row(self.item,self.detail,[self.record(840)],True,fail))
    def test_same_date_ambiguous(self):
        r2=self.record();r2['submitted_by']={'id':'p2','global_name':'Other','country':250}
        self.assertEqual(self.build([self.record(),r2])['first_fr'],{})

if __name__=='__main__': unittest.main()
