import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("tec_sync", ROOT / "tools" / "tec_sync.py")
tec_sync = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(tec_sync)


class TecSyncTest(unittest.TestCase):
    def test_normalizes_statistics_and_visible_attempt(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "snapshot.json"
            payload = tec_sync.write_snapshot(
                [{"id": "42", "name": "Java", "subject": "specific", "respondidas": 10, "aproveitamento": 70}],
                output,
                "test",
                [{"id": "900", "cadernoId": "42", "correct": False, "attemptedAt": "2026-09-14T12:00:00Z"}],
            )
            self.assertEqual(payload["version"], 2)
            self.assertEqual(payload["cadernos"][0]["correct"], 7)
            self.assertEqual(payload["questionAttempts"][0]["id"], "900")
            self.assertFalse(payload["questionAttempts"][0]["correct"])
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["source"], "test")

    def test_discards_invalid_attempt_without_discarding_caderno(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "snapshot.json"
            payload = tec_sync.write_snapshot([{"id": "1", "respondidas": 1, "acertos": 1}], output, "test", [{"id": "", "correct": True}])
            self.assertEqual(len(payload["questionAttempts"]), 0)
            self.assertEqual(len(payload["cadernos"]), 1)


if __name__ == "__main__":
    unittest.main()
