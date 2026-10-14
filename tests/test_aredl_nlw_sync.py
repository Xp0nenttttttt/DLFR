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


    def test_aredl_numeric_countries(self):
        self.assertEqual(a.country(250), 'FR')
        self.assertEqual(a.country('250'), 'FR')
        self.assertEqual(a.country(56), 'BE')
        self.assertEqual(a.country('056'), 'BE')
        self.assertIsNone(a.country(840))
        self.assertIsNone(a.country(None))

    def test_v2_verifier_submitted_by_and_achieved_at(self):
        detail = {"verifications": [{
            "id": "ver-1", "submitted_by": {"id": "u-1", "username": "spleen"},
            "achieved_at": "2024-04-01T18:00:00Z", "video_url": "https://example.test/video"
        }]}
        calls = []
        def resolver(uid):
            calls.append(uid)
            return {"aredl_player_id": uid, "name": "spleen", "country": "FR"}
        level = a.extract_one(self.level, detail, [], resolver)
        self.assertEqual(calls, ['u-1'])
        self.assertEqual(level['verifiers'][0]['player']['country'], 'FR')
        self.assertEqual(level['first_fr_be']['completed_at'], '2024-04-01T18:00:00+00:00')

    def test_v2_records_pagination_and_numeric_country(self):
        class Client:
            def __init__(self): self.paths=[]
            def get(self,path):
                self.paths.append(path)
                if '?page=1&' in path:
                    return {"page":1,"pages":2,"count":2,"data":{"data":[
                        {"id":"r1","submitted_by":{"id":"u1","global_name":"First", "country":250},
                         "achieved_at":"2021-01-01T00:00:00Z"}]}}
                return {"page":2,"pages":2,"count":2,"data":{"data":[
                    {"id":"r2","submitted_by":{"id":"u2","global_name":"Second", "country":56},
                     "achieved_at":"2022-01-01T00:00:00Z"}]}}
        client=Client()
        records,meta=a.fetch_record_pages(client,'lvl',max_pages=4)
        self.assertTrue(meta['complete'])
        self.assertEqual(meta['pages_fetched'],2)
        self.assertEqual(len(records),2)
        x=a.extract_one(self.level, {"verifications":[]}, [], extra_records=records)
        self.assertEqual(x['first_fr_be']['player']['name'],'First')
        self.assertEqual(x['first_be']['player']['name'],'Second')

    def test_records_pagination_incomplete_flag(self):
        class Client:
            def get(self,path): return {"page":1,"pages":100,"data":{"data":[]}}
        records,meta=a.fetch_record_pages(Client(), 'id', 1)
        self.assertFalse(meta['complete'])
        self.assertEqual(meta['total_pages'],100)

    def test_profile_error_does_not_erase_level(self):
        from argparse import Namespace
        class FakeClient:
            base='https://example.test/v2/api/aredl'
            def __init__(self): self.visited=[]
            def get(self,path):
                self.visited.append(path)
                if path=='/levels':
                    return [{"id":"id-219","name":"Cobwebs","position":219,"level_id":219219},
                            {"id":"id-220","name":"RUTHLESS","position":220,"level_id":220220}]
                if path=='/levels/id-220':
                    return {"verifications":[{"id":"v1","submitted_by":{"id":"u-fr","global_name":"X"},
                                              "achieved_at":"2024-01-01T00:00:00Z"}]}
                if path=='/profile/u-fr':
                    raise RuntimeError('404 profile not found')
                raise ValueError(path)
        c=FakeClient()
        args=Namespace(start_rank=220,end_rank=220,existing_json=None,
                       workers=1,resolve_players=True,records_url_template=None,
                       fetch_records=False)
        result=a.run(args,c)
        self.assertEqual(result['summary']['levels'],1)
        self.assertEqual(result['failures'],[])
        self.assertIn('/profile/u-fr', c.visited)
        self.assertEqual(result['levels'][0]['verifiers'],[])

if __name__ == '__main__':unittest.main()
