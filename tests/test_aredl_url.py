"""Tests autonomes, sans requêtes externes."""
import io
import json
import sys
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import aredl_nlw_sync as m


class Response(io.BytesIO):
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        self.close()


class TestAredlRoutes(unittest.TestCase):
    def test_correct_base_url(self):
        self.assertEqual(m.BASE, "https://api.aredl.net/v2/api/aredl")

    def test_list_request_uses_aredl_prefix(self):
        seen = []
        def fake_urlopen(req, timeout):
            seen.append(req.full_url)
            return Response(json.dumps([{
                "id": "abc", "name": "Cobwebs", "position": 219, "level_id": 100
            }]).encode())
        with patch.object(m, "urlopen", fake_urlopen):
            result = m.Client(m.BASE, cache_dir=None, pause=0).get("/levels")
        self.assertEqual(seen, ["https://api.aredl.net/v2/api/aredl/levels"])
        self.assertEqual(result[0]["name"], "Cobwebs")

    def test_404_mentions_real_url(self):
        def fake_404(req, timeout):
            raise HTTPError(req.full_url, 404, "Not Found", {}, None)
        with patch.object(m, "urlopen", fake_404):
            with self.assertRaisesRegex(RuntimeError, r"/aredl/levels"):
                m.Client(m.BASE, cache_dir=None, pause=0).get("/levels")

if __name__ == "__main__":
    unittest.main()
