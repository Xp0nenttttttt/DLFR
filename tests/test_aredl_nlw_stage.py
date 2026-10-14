import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from aredl_nlw_stage_plan import build_plan, to_sql, valid_gd_id


def preview(rows, export=False, anchor=True):
    return {"scope": {"start_rank":220,"end_rank":319,"countries":["FR","BE"],
                      "existing_export_supplied": export, "anchor_verified":anchor},
            "failures":[],"levels":rows}

def level(i, **kw):
    data={"rank":220+i,"name":f"Level {i}","gd_level_id":str(1_000_000+i),
          "aredl_id":f"6e4aa435-2b39-44c4-9788-{396000000000+i:012d}",
          "action":"NEW_CANDIDATE", "records_complete":True,"verifiers":[],
          "first_fr_be":{"status":"unknown"},"records_inspected":25,
          "unresolved_verifiers":[],"first_fr":{},"first_be":{}}
    data.update(kw)
    return data

class TestPlan(unittest.TestCase):
    def test_staging_only_and_review_when_no_export(self):
        p=build_plan(preview([level(0)]))
        self.assertEqual(p['counts']['stage_candidates'],1)
        self.assertEqual(p['included'][0]['source_action'],'NO_DLFR_EXPORT_REVIEW')
        s=to_sql(p)
        self.assertIn('public.dlfr_aredl_nlw_stage',s)
        self.assertNotIn('INSERT INTO public.demons',s)
        self.assertNotIn('INSERT INTO public.completions',s)
        self.assertIn("manually_locked=false",s)
        self.assertIn("review_state='pending'",s)

    def test_incomplete_records_are_excluded(self):
        p=build_plan(preview([level(0, records_complete=False),level(1)]))
        self.assertEqual(p['counts']['stage_candidates'],1)
        self.assertEqual(p['excluded'][0]['reason'],'RECORDS_NOT_EXHAUSTIVE')

    def test_level_already_manually_approved_stays_staged_only(self):
        p=build_plan(preview([level(0,action='MATCH_MANUAL_KEEP')],export=True))
        self.assertEqual(p['included'][0]['source_action'],'MATCH_MANUAL_KEEP')
        self.assertEqual(p['counts']['stage_candidates'],1)

    def test_conflict_cannot_be_staged(self):
        p=build_plan(preview([level(0,action='REVIEW_SAME_NAME_DIFFERENT_ID')]))
        self.assertEqual(p['counts']['stage_candidates'],0)

    def test_duplicate_gd_id(self):
        p=build_plan(preview([level(0),level(1,gd_level_id='1000000')]))
        self.assertEqual(p['counts']['stage_candidates'],0)
        self.assertEqual(p['counts']['excluded'],2)

    def test_bad_anchor_blocks_everything(self):
        with self.assertRaises(ValueError):build_plan(preview([level(0)],anchor=False))

    def test_invalid_gd_id(self):
        self.assertIsNone(valid_gd_id('0'))
        self.assertIsNone(valid_gd_id('12 OR 1=1'))

    def test_escape_quotes_sql(self):
        p=build_plan(preview([level(0,name="L'Enfer; DROP TABLE demons;")]))
        s=to_sql(p)
        self.assertIn("L''Enfer",s)
        self.assertIn("ON CONFLICT (gd_level_id)",s)

if __name__ == '__main__': unittest.main()
