import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import aredl_nlw_sync as a

class TestNLW(unittest.TestCase):
    def setUp(self):
        self.level = {"aredl_id":"aredl-uuid", "rank":220,"name":"TestLevel", "gd_level_id":"123456"}

    def test_only_over_219(self):
        from argparse import Namespace
        class Stub:
            base='offline'
            def get(self,path):
                if path=='/levels':
                    return [{"id":"a", "name":"Cobwebs", "position":219,"level_id":111},
                            {"id":"b", "name":"TestLevel", "position":220,"level_id":123456}]
                return {"verifications":[]}
        ns=Namespace(start_rank=220,end_rank=220,existing_json=None,workers=1,resolve_players=False,records_url_template=None)
        result=a.run(ns,Stub())
        self.assertEqual(result['summary']['levels'],1)
        self.assertEqual(result['levels'][0]['rank'],220)

    def test_keep_manual_even_when_name_changes(self):
        result=a.extract_one(self.level, {"name":"New Name", "verifications":[]}, [{"level_id":"123456","name":"Old Name"}])
        self.assertEqual(result['action'],'MATCH_MANUAL_KEEP')

    def test_name_collision_not_merged(self):
        result=a.extract_one(self.level, {}, [{"level_id":"999999","name":"TestLevel"}])
        self.assertEqual(result['action'],'REVIEW_SAME_NAME_DIFFERENT_ID')

    def test_verifier_french_belgian_only_and_unknown(self):
        detail={"verifications":[
            {"player":{"id":"p1","name":"A","country_code":"FR"}},
            {"player":{"id":"p2","name":"B","country":"Belgium"}},
            {"player":{"id":"p3","name":"C","country":"US"}},
            {"player":{"id":"p4","name":"D"}}]}
        x=a.extract_one(self.level,detail,[])
        self.assertEqual([v['player']['name'] for v in x['verifiers']], ['A','B'])
        self.assertEqual([v['name'] for v in x['unresolved_verifiers']], ['D'])

    def test_first_dated_record_not_submission_date(self):
        records=[
            {"player":{"id":"a","name":"A","country":"FR"},"submitted_at":"2020-01-01T00:00:00Z"},
            {"player":{"id":"b","name":"B","country":"BE"},"completed_at":"2022-01-02T00:00:00Z"},
            {"player":{"id":"c","name":"C","country":"FR"},"completed_at":"2021-01-02T00:00:00Z"},
            {"player":{"id":"d","name":"D","country":"FR"},"completed_at":"2020-01-01T00:00:00Z","progress":60},
        ]
        x=a.extract_one(self.level,{"records":records},[])
        self.assertEqual(x['first_fr_be']['player']['name'],'C')
        self.assertEqual(x['first_be']['player']['name'],'B')

    def test_unknown_no_invented_first(self):
        x=a.extract_one(self.level,{"records":[{"player":{"name":"A","country":"FR"},"created_at":"2020-01-01T00:00:00Z"}]},[])
        self.assertEqual(x['first_fr_be']['status'],'unknown')

    def test_unknown_country_no_inference(self):
        x=a.extract_one(self.level,{"verifications":[{"player":{"name":"FrenchGuy"}}]},[])
        self.assertEqual(x['verifiers'],[])

    def test_requires_rank_and_aredl_id(self):
        with self.assertRaises(ValueError):a.normalize_list([{"name":"X", "position":220}])

    def test_gid_is_stable(self):
        self.assertEqual(a.numeric_id(123),'123')
        self.assertIsNone(a.numeric_id('not a GD level ID'))

if __name__ == '__main__':unittest.main()
