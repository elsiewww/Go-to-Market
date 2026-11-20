"""Behavioral regression tests for a local, draft-only marketing pipeline."""

import csv
from datetime import date
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from marketing_ops import cli


AS_OF = date(2026, 11, 20)
OBSERVED = "2026-11-20T13:00:00+00:00"


def prospect(**overrides):
    result = {
        "kind": "prospect", "platform": "web", "url": "https://example.com/partners",
        "title": "Example organization", "text": "Public partner program description.",
        "observed_at": OBSERVED, "entity_key": "organization:example", "language": "en",
        "evidence": [{"url": "https://example.com/partners", "claim": "Runs a partner program.",
                      "observed_at": OBSERVED}],
        "fit": 30, "signal": 20, "contactability": 10,
        "offer_hypothesis": "a joint educational session",
    }
    result.update(overrides)
    return result


def content(**overrides):
    result = prospect(kind="content", url="https://example.com/news/update", title="Public update",
                      entity_key="article:example", text="An independently verified article summary.")
    result.update(overrides)
    return result


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.db = cli.connect(self.directory)

    def tearDown(self):
        self.db.close()
        self.temporary.cleanup()

    def count(self, table):
        return self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

    def report_payload(self):
        result = cli.report(self.db, self.directory, AS_OF)
        path = Path(result["reports"])
        return result, json.loads((path / "review.json").read_text()), path

    def test_invalid_item_rolls_back_the_whole_import(self):
        invalid = prospect(url="https://example.com/other", evidence=[])
        with self.assertRaisesRegex(ValueError, "evidence"):
            cli.ingest(self.db, {"items": [content(), invalid]})
        self.assertEqual(self.count("items"), 0)

    def test_invalid_check_prevents_otherwise_valid_item_import(self):
        with self.assertRaises(ValueError):
            cli.ingest(self.db, {"items": [content()], "source_checks": [{
                "source_id": "test", "url": "https://example.com/rss", "status": "success",
                "checked_at": OBSERVED,
            }]})
        self.assertEqual(self.count("items"), 0)
        self.assertEqual(self.count("source_checks"), 0)

    def test_duplicate_url_tracking_and_repeated_daily_are_idempotent(self):
        self.assertEqual(cli.ingest(self.db, {"items": [prospect()]} )["inserted"], 1)
        duplicate = prospect(url="https://example.com/partners?utm_source=test#section", platform="WEB")
        self.assertEqual(cli.ingest(self.db, {"items": [duplicate]})["duplicates"], 1)
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 1)
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 0)
        self.assertEqual(cli.daily(self.db, date(2026, 11, 21))["generated"], 0)
        self.assertEqual(self.count("drafts"), 1)

    def test_only_one_active_prospect_per_entity_across_pages(self):
        cli.ingest(self.db, {"items": [prospect(), prospect(url="https://example.com/about",
                                                         text="Another observed public page.")]})
        result = cli.daily(self.db, AS_OF)
        self.assertEqual(result["generated"], 1)
        self.assertEqual(result["held"], 1)

    def test_suppression_persists_and_hides_existing_drafts(self):
        cli.ingest(self.db, {"items": [prospect()]})
        cli.daily(self.db, AS_OF)
        cli.suppress(self.db, "organization:example", "Recipient opted out")
        self.db.close()
        self.db = cli.connect(self.directory)
        cli.ingest(self.db, {"items": [prospect(text="A newer public description.")]})
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 0)
        summary, payload, _ = self.report_payload()
        self.assertEqual(summary["queues"]["prospect"], 0)
        self.assertEqual(payload["item_status_counts"]["suppressed"], 2)
        item_id = self.db.execute("SELECT id FROM items LIMIT 1").fetchone()[0]
        with self.assertRaisesRegex(ValueError, "suppressed"):
            cli.mark(self.db, item_id, "sent")

    def test_sent_entity_is_not_recontacted_after_a_new_version(self):
        cli.ingest(self.db, {"items": [prospect()]})
        cli.daily(self.db, AS_OF)
        item_id = self.db.execute("SELECT id FROM items").fetchone()[0]
        cli.mark(self.db, item_id, "sent")
        cli.ingest(self.db, {"items": [prospect(text="Changed version after outreach.")]})
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 0)
        self.assertEqual(self.report_payload()[0]["queues"]["prospect"], 0)
        with self.assertRaisesRegex(ValueError, "reopened"):
            cli.mark(self.db, item_id, "reviewed")

    def test_source_fetch_failure_and_pending_adapters_are_visible(self):
        config = {"sources": [
            {"id": "rss", "url": "https://example.com/rss", "type": "rss", "enabled": True},
            {"id": "not-ready", "url": "https://example.com/unconfirmed", "type": "rss", "enabled": False},
            {"id": "youtube", "url": "https://example.com/video", "type": "youtube", "enabled": True},
        ]}
        with patch.object(cli, "fetch_feed", side_effect=OSError("access denied")) as fetch:
            result = cli.collect(self.db, config)
        fetch.assert_called_once_with("https://example.com/rss")
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["pending"], 2)
        summary, payload, _ = self.report_payload()
        self.assertEqual(summary["source_failures"], 1)
        self.assertEqual(summary["sources_pending"], 2)
        self.assertEqual({c["status"] for c in payload["source_coverage"]}, {"failed", "pending"})
        self.assertEqual(self.count("items"), 0)

    def test_rss_collection_imports_evidence_and_publication_date(self):
        feed = b"""<rss version="2.0"><channel><item><title>Official update</title>
          <link>https://example.com/update</link><description>Fact summary</description>
          <pubDate>Fri, 20 Nov 2026 08:00:00 -0500</pubDate></item></channel></rss>"""
        config = {"sources": [{"id": "rss", "url": "https://example.com/rss", "type": "rss", "enabled": True}]}
        with patch.object(cli, "fetch_feed", return_value=feed):
            self.assertEqual(cli.collect(self.db, config)["inserted"], 1)
            self.assertEqual(cli.collect(self.db, config)["duplicates"], 1)
        item = json.loads(self.db.execute("SELECT payload FROM items").fetchone()[0])
        self.assertEqual(item["published_at"], "2026-11-20T08:00:00-05:00")
        self.assertEqual(item["evidence"][0]["url"], "https://example.com/update")

    def test_well_formed_html_signin_response_is_a_failed_feed(self):
        config = {"sources": [{"id": "rss", "url": "https://example.com/rss", "type": "rss", "enabled": True}]}
        html = b"<html><head><title>Sign in</title></head><body>Please sign in</body></html>"
        with patch.object(cli, "fetch_feed", return_value=html):
            result = cli.collect(self.db, config)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["inserted"], 0)
        summary, payload, _ = self.report_payload()
        self.assertEqual(summary["source_failures"], 1)
        self.assertEqual(payload["source_coverage"][0]["status"], "failed")

    def test_valid_empty_rss_and_atom_feeds_are_successful_reads(self):
        feeds = {
            "rss": b"<rss version='2.0'><channel><title>Empty RSS</title></channel></rss>",
            "atom": b"<feed xmlns='http://www.w3.org/2005/Atom'><title>Empty Atom</title></feed>",
        }
        for kind, feed in feeds.items():
            with self.subTest(kind=kind), patch.object(cli, "fetch_feed", return_value=feed):
                result = cli.collect(self.db, {"sources": [{"id": kind, "url": "https://example.com/" + kind,
                                                           "type": kind, "enabled": True}]})
            self.assertEqual(result["failed"], 0)
            self.assertEqual(result["inserted"], 0)
        self.assertEqual({row[0] for row in self.db.execute("SELECT status FROM source_checks")}, {"ok"})

    def test_rss_without_channel_is_not_accepted_as_an_empty_feed(self):
        with self.assertRaises(ValueError):
            cli.parse_feed(b"<rss version='2.0'><title>Not a feed</title></rss>", {"platform": "rss"}, OBSERVED)

    def test_reverified_same_text_unholds_an_old_prospect(self):
        old = "2026-01-01T13:00:00+00:00"
        cli.ingest(self.db, {"items": [prospect(observed_at=old)]})
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 0)
        result = cli.ingest(self.db, {"items": [prospect(observed_at=OBSERVED)]})
        self.assertEqual(result["inserted"], 0)
        self.assertEqual(result["duplicates"], 1)
        self.assertEqual(result["refreshed"], 1)
        self.assertEqual(self.count("items"), 1)
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 1)
        item = json.loads(self.db.execute("SELECT payload FROM items").fetchone()[0])
        self.assertEqual(item["observed_at"], OBSERVED)
        self.assertEqual(cli.lead_score(item, AS_OF)["components"]["recency"], 0)

    def test_reviewed_duplicate_refresh_preserves_manual_draft_and_claimed_signal(self):
        old = "2026-11-19T13:00:00+00:00"
        signal = "2026-11-10T13:00:00+00:00"
        cli.ingest(self.db, {"items": [prospect(observed_at=old, signal_at=signal)]})
        cli.daily(self.db, AS_OF)
        item_id = self.db.execute("SELECT id FROM items").fetchone()[0]
        cli.mark(self.db, item_id, "reviewed")
        with self.db:
            self.db.execute("UPDATE drafts SET draft=? WHERE item_id=?", ("Manually edited and reviewed.", item_id))
        before_draft = dict(self.db.execute("SELECT * FROM drafts").fetchone())
        result = cli.ingest(self.db, {"items": [prospect(observed_at=OBSERVED, signal_at=OBSERVED,
                                                       fit=0, offer_hypothesis="a changed offer")]})
        self.assertEqual(result["refreshed"], 1)
        row = self.db.execute("SELECT * FROM items").fetchone()
        payload = json.loads(row["payload"])
        self.assertEqual(row["status"], "reviewed")
        self.assertEqual(payload["signal_at"], signal)
        self.assertEqual(payload["fit"], 30)
        self.assertEqual(payload["offer_hypothesis"], "a joint educational session")
        self.assertEqual(dict(self.db.execute("SELECT * FROM drafts").fetchone()), before_draft)
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 0)

    def test_sent_and_suppressed_duplicates_are_never_refreshed(self):
        old = "2026-11-19T13:00:00+00:00"
        for status in ("sent", "suppressed"):
            with self.subTest(status=status):
                url = f"https://example.com/{status}"
                entity = "organization:" + status
                cli.ingest(self.db, {"items": [prospect(url=url, entity_key=entity, observed_at=old)]})
                cli.daily(self.db, AS_OF)
                item_id = self.db.execute("SELECT id FROM items WHERE entity_key=?", (entity,)).fetchone()[0]
                if status == "sent":
                    cli.mark(self.db, item_id, status)
                else:
                    cli.suppress(self.db, entity, "Do not contact")
                before = dict(self.db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone())
                result = cli.ingest(self.db, {"items": [prospect(url=url, entity_key=entity, observed_at=OBSERVED)]})
                self.assertEqual(result["refreshed"], 0)
                self.assertEqual(dict(self.db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()), before)

    def test_older_duplicate_does_not_regress_observation_or_metadata(self):
        cli.ingest(self.db, {"items": [prospect(observed_at=OBSERVED)]})
        before = dict(self.db.execute("SELECT * FROM items").fetchone())
        result = cli.ingest(self.db, {"items": [prospect(observed_at="2026-11-01T13:00:00+00:00", title="Older title")]})
        self.assertEqual(result["refreshed"], 0)
        self.assertEqual(dict(self.db.execute("SELECT * FROM items").fetchone()), before)

    def test_duplicate_evidence_merge_uses_canonical_url_and_keeps_latest_observation(self):
        old = "2026-11-18T13:00:00+00:00"
        first = {"url": "https://example.com/partners", "claim": "Runs a partner program.", "observed_at": old}
        retained = {"url": "https://example.com/about", "claim": "Existing background evidence.", "observed_at": OBSERVED}
        cli.ingest(self.db, {"items": [prospect(observed_at=old, evidence=[first, retained])]})
        fresh = {**first, "url": "https://example.com/partners?utm_source=repeat", "observed_at": OBSERVED}
        older_retained = {**retained, "observed_at": old}
        new_claim = {"url": "https://example.com/news", "claim": "Newly checked supporting fact.", "observed_at": OBSERVED}
        result = cli.ingest(self.db, {"items": [prospect(observed_at=OBSERVED, evidence=[fresh, older_retained, new_claim])]})
        self.assertEqual(result["refreshed"], 1)
        evidence = json.loads(self.db.execute("SELECT payload FROM items").fetchone()[0])["evidence"]
        self.assertEqual(len(evidence), 3)
        by_claim = {entry["claim"]: entry for entry in evidence}
        self.assertEqual(by_claim[first["claim"]]["observed_at"], OBSERVED)
        self.assertEqual(by_claim[retained["claim"]]["observed_at"], OBSERVED)

    def test_ny_local_date_controls_freshness_not_utc_calendar_date(self):
        # 00:30 UTC Nov 14 is still Nov 13 in New York, exactly seven days ago.
        item = cli.validate_item(prospect(observed_at="2026-11-14T00:30:00+00:00",
                                           signal_at="2026-11-14T00:30:00+00:00"))
        score = cli.lead_score(item, AS_OF)
        self.assertEqual(score["age_days"], 7)
        self.assertEqual(score["signal_age_days"], 7)
        self.assertEqual(score["components"]["recency"], 20)
        item["signal_at"] = "2026-11-13T00:30:00+00:00"
        self.assertEqual(cli.lead_score(item, AS_OF)["components"]["recency"], 12)

    def test_fresh_observation_of_static_page_gets_no_recency_bonus(self):
        item = cli.validate_item(prospect(observed_at=OBSERVED))
        score = cli.lead_score(item, AS_OF)
        self.assertEqual(score["age_days"], 0)
        self.assertEqual(score["components"]["recency"], 0)
        self.assertIsNone(score["signal_age_days"])
        self.assertEqual(score["signal_freshness"], "unknown")

    def test_verified_recent_signal_gets_recency_bonus(self):
        item = cli.validate_item(prospect(signal_at="2026-11-18T14:00:00+00:00"))
        score = cli.lead_score(item, AS_OF)
        self.assertEqual(score["signal_age_days"], 2)
        self.assertEqual(score["components"]["recency"], 20)

    def test_future_signal_does_not_get_recency_bonus(self):
        item = cli.validate_item(prospect(signal_at="2026-11-22T14:00:00+00:00"))
        score = cli.lead_score(item, AS_OF)
        self.assertEqual(score["signal_age_days"], -2)
        self.assertEqual(score["components"]["recency"], 0)
        self.assertEqual(score["signal_freshness"], "future")

    def test_old_article_is_not_news_just_because_observed_today(self):
        cli.ingest(self.db, {"items": [content(published_at="2025-11-20T13:00:00+00:00")]})
        result = cli.daily(self.db, AS_OF)
        self.assertEqual(result["generated"], 0)
        self.assertEqual(result["held"], 1)

    def test_future_evidence_is_held_until_its_local_date(self):
        cli.ingest(self.db, {"items": [prospect(observed_at="2026-11-22T14:00:00+00:00")]})
        self.assertEqual(cli.daily(self.db, AS_OF)["generated"], 0)
        self.assertEqual(cli.daily(self.db, date(2026, 11, 22))["generated"], 1)

    def test_content_prospect_and_reply_have_separate_review_queues(self):
        reply = prospect(kind="reply", url="https://example.com/conversations/1", text="Incoming question.")
        cli.ingest(self.db, {"items": [content(), prospect(), reply]})
        cli.daily(self.db, AS_OF)
        summary, payload, _ = self.report_payload()
        self.assertEqual(summary["queues"], {"content": 1, "prospect": 1, "reply": 1})
        self.assertEqual(payload["mode"], "draft_only")
        self.assertTrue(all(item["review_required"] for queue in payload["queues"].values() for item in queue))
        draft = payload["queues"]["prospect"][0]["draft"]
        self.assertIn("Runs a partner program.", draft)
        self.assertIn("would like to explore", draft)
        self.assertNotIn("guarantee", draft.lower())

    def test_csv_cells_cannot_be_formulas(self):
        cli.ingest(self.db, {"items": [content(title='=HYPERLINK("https://example.com")')]})
        cli.daily(self.db, AS_OF)
        _, _, directory = self.report_payload()
        with (directory / "review.csv").open(newline="") as stream:
            row = next(csv.DictReader(stream))
        self.assertTrue(row["title"].startswith("'="))

    def test_second_process_lock_cannot_enter(self):
        with cli.locked(self.directory):
            with self.assertRaisesRegex(ValueError, "active"):
                with cli.locked(self.directory):
                    self.fail("a second lock was accepted")
        with cli.locked(self.directory):
            pass

    def test_kind_whitespace_is_normalized_before_storage(self):
        item = cli.validate_item(content(kind=" content "))
        self.assertEqual(item["kind"], "content")
        cli.ingest(self.db, {"items": [item]})
        cli.daily(self.db, AS_OF)
        self.assertEqual(self.report_payload()[0]["queues"]["content"], 1)

    def test_private_literal_addresses_are_not_public_evidence(self):
        for url in ("https://127.0.0.1/feed", "https://169.254.169.254/latest/",
                    "https://10.0.0.1/feed", "https://[::1]/feed"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                cli.public_url(url)

    def test_naive_timestamps_and_out_of_range_scores_are_rejected(self):
        for overrides in ({"observed_at": "2026-11-20T13:00:00"}, {"fit": 36}, {"signal": True}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                cli.ingest(self.db, {"items": [prospect(**overrides)]})
        self.assertEqual(self.count("items"), 0)


if __name__ == "__main__":
    unittest.main()
