import json
import zipfile
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from instagram_insights import (
    extract_usernames_from_html,
    normalize_username,
    deduplicate_preserve_order,
    compute_insights,
    parse_all_files,
    read_file_content,
    FILE_MAP,
)


SAMPLE_FOLLOWERS_HTML = """
<html>
<body>
  <div class="pam">
    <a href="https://www.instagram.com/alice/">Alice</a>
    <a href="https://www.instagram.com/bob/">Bob</a>
    <a href="https://www.instagram.com/charlie/">Charlie</a>
  </div>
</body>
</html>
"""

SAMPLE_FOLLOWING_HTML = """
<html>
<body>
  <div class="pam">
    <a href="https://www.instagram.com/alice/">Alice</a>
    <a href="https://www.instagram.com/bob/">Bob</a>
    <a href="https://www.instagram.com/dave/">Dave</a>
  </div>
</body>
</html>
"""

SAMPLE_BLOCKED_HTML = """
<html>
<body>
  <div class="pam">
    <a href="https://www.instagram.com/blocked_user/">Blocked</a>
  </div>
</body>
</html>
"""

SAMPLE_CLOSE_FRIENDS_HTML = """
<html>
<body>
  <div class="pam">
    <a href="https://www.instagram.com/alice/">Alice</a>
    <a href="https://www.instagram.com/bob/">Bob</a>
  </div>
</body>
</html>
"""

SAMPLE_EMPTY_HTML = """
<html><body></body></html>
"""


class TestExtractUsernames:
    def test_extracts_from_anchor_tags(self):
        result = extract_usernames_from_html(SAMPLE_FOLLOWERS_HTML)
        assert result == ["alice", "bob", "charlie"]

    def test_removes_trailing_slash(self):
        html = '<a href="https://www.instagram.com/testuser/">text</a>'
        result = extract_usernames_from_html(html)
        assert result == ["testuser"]

    def test_handles_www_prefix(self):
        html = '<a href="https://www.instagram.com/user1/">text</a>'
        result = extract_usernames_from_html(html)
        assert result == ["user1"]

    def test_handles_no_www(self):
        html = '<a href="https://instagram.com/user1/">text</a>'
        result = extract_usernames_from_html(html)
        assert result == ["user1"]

    def test_deduplicates_preserve_order(self):
        html = """
        <a href="https://www.instagram.com/alice/">A</a>
        <a href="https://www.instagram.com/bob/">B</a>
        <a href="https://www.instagram.com/alice/">C</a>
        """
        result = extract_usernames_from_html(html)
        assert result == ["alice", "bob"]

    def test_lowercases_usernames(self):
        html = '<a href="https://www.instagram.com/Alice/">text</a>'
        result = extract_usernames_from_html(html)
        assert result == ["alice"]

    def test_returns_empty_list_for_no_links(self):
        result = extract_usernames_from_html(SAMPLE_EMPTY_HTML)
        assert result == []

    def test_skips_non_instagram_links(self):
        html = '<a href="https://example.com/user/">text</a>'
        result = extract_usernames_from_html(html)
        assert result == []

    def test_skips_short_usernames(self):
        html = '<a href="https://www.instagram.com/a/">text</a>'
        result = extract_usernames_from_html(html)
        assert result == []

    def test_handles_href_with_query_params(self):
        html = '<a href="https://www.instagram.com/user1/?hl=en">text</a>'
        result = extract_usernames_from_html(html)
        assert result == ["user1"]


class TestNormalizeUsername:
    def test_strips_whitespace(self):
        assert normalize_username("  alice  ") == "alice"

    def test_removes_trailing_slash(self):
        assert normalize_username("alice/") == "alice"

    def test_lowercases(self):
        assert normalize_username("Alice") == "alice"

    def test_handles_at_prefix(self):
        assert normalize_username("@alice") == "@alice"


class TestDeduplicatePreserveOrder:
    def test_removes_duplicates(self):
        result = deduplicate_preserve_order(["alice", "bob", "alice", "charlie"])
        assert result == ["alice", "bob", "charlie"]

    def test_preserves_order(self):
        result = deduplicate_preserve_order(["c", "a", "b", "a", "c"])
        assert result == ["c", "a", "b"]

    def test_normalizes_before_comparison(self):
        result = deduplicate_preserve_order(["Alice/", "alice", "ALICE"])
        assert result == ["alice"]

    def test_skips_empty_strings(self):
        result = deduplicate_preserve_order(["alice", "", "bob"])
        assert result == ["alice", "bob"]


class TestComputeInsights:
    def test_not_following_back(self):
        followers = ["alice", "bob", "charlie"]
        following = ["alice", "bob", "dave"]
        datasets = {
            "followers": followers,
            "following": following,
            "recently_unfollowed": [],
            "pending_requests": [],
            "blocked": [],
            "close_friends": [],
            "hidden_story": [],
        }
        insights = compute_insights(datasets)
        assert insights["stats"]["not_following_back"] == 1
        assert insights["lists"]["not_following_back"] == ["dave"]

    def test_fans(self):
        followers = ["alice", "bob", "charlie"]
        following = ["alice", "bob"]
        datasets = {
            "followers": followers,
            "following": following,
            "recently_unfollowed": [],
            "pending_requests": [],
            "blocked": [],
            "close_friends": [],
            "hidden_story": [],
        }
        insights = compute_insights(datasets)
        assert insights["stats"]["fans"] == 1
        assert insights["lists"]["fans"] == ["charlie"]

    def test_mutuals(self):
        followers = ["alice", "bob", "charlie"]
        following = ["alice", "bob", "dave"]
        datasets = {
            "followers": followers,
            "following": following,
            "recently_unfollowed": [],
            "pending_requests": [],
            "blocked": [],
            "close_friends": [],
            "hidden_story": [],
        }
        insights = compute_insights(datasets)
        assert insights["stats"]["mutuals"] == 2
        assert set(insights["lists"]["mutuals"]) == {"alice", "bob"}

    def test_preserves_following_order_in_not_following_back(self):
        followers = ["bob"]
        following = ["zoe", "alice", "dave"]
        datasets = {
            "followers": followers,
            "following": following,
            "recently_unfollowed": [],
            "pending_requests": [],
            "blocked": [],
            "close_friends": [],
            "hidden_story": [],
        }
        insights = compute_insights(datasets)
        assert insights["lists"]["not_following_back"] == ["zoe", "alice", "dave"]

    def test_full_insights_structure(self):
        followers = ["alice", "bob"]
        following = ["bob", "charlie"]
        datasets = {
            "followers": followers,
            "following": following,
            "recently_unfollowed": ["old_friend"],
            "pending_requests": ["new_guy"],
            "blocked": ["spammer"],
            "close_friends": ["alice"],
            "hidden_story": ["stalker"],
        }
        insights = compute_insights(datasets)
        assert insights["stats"]["followers"] == 2
        assert insights["stats"]["following"] == 2
        assert insights["stats"]["not_following_back"] == 1
        assert insights["stats"]["fans"] == 1
        assert insights["stats"]["mutuals"] == 1
        assert insights["stats"]["recently_unfollowed"] == 1
        assert insights["stats"]["pending_requests"] == 1
        assert insights["lists"]["blocked"] == ["spammer"]
        assert insights["lists"]["close_friends"] == ["alice"]
        assert insights["lists"]["hidden_story"] == ["stalker"]


class TestReadFileContent:
    def test_reads_from_directory(self, tmp_path):
        d = tmp_path / "data"
        d.mkdir()
        f = d / "followers_1.html"
        f.write_text(SAMPLE_FOLLOWERS_HTML, encoding="utf-8")
        content = read_file_content(d, "followers_1.html")
        assert content == SAMPLE_FOLLOWERS_HTML

    def test_returns_none_if_missing_from_directory(self, tmp_path):
        d = tmp_path / "empty"
        d.mkdir()
        content = read_file_content(d, "missing.html")
        assert content is None

    def test_reads_from_zip(self, tmp_path):
        zip_path = tmp_path / "export.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr(
                "connections/followers_and_following/followers_1.html",
                SAMPLE_FOLLOWERS_HTML,
            )
        content = read_file_content(zip_path, "followers_1.html")
        assert content == SAMPLE_FOLLOWERS_HTML

    def test_returns_none_if_missing_from_zip(self, tmp_path):
        zip_path = tmp_path / "empty.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            pass
        content = read_file_content(zip_path, "missing.html")
        assert content is None


class TestParseAllFiles:
    def test_parses_all_available_files(self, tmp_path):
        d = tmp_path / "data"
        d.mkdir()
        (d / "followers_1.html").write_text(SAMPLE_FOLLOWERS_HTML, encoding="utf-8")
        (d / "following.html").write_text(SAMPLE_FOLLOWING_HTML, encoding="utf-8")
        (d / "close_friends.html").write_text(SAMPLE_CLOSE_FRIENDS_HTML, encoding="utf-8")

        datasets = parse_all_files(d)
        assert datasets["followers"] == ["alice", "bob", "charlie"]
        assert datasets["following"] == ["alice", "bob", "dave"]
        assert datasets["close_friends"] == ["alice", "bob"]
        assert datasets["blocked"] == []
        assert datasets["hidden_story"] == []

    def test_handles_empty_directory(self, tmp_path):
        d = tmp_path / "empty"
        d.mkdir()
        datasets = parse_all_files(d)
        for key in FILE_MAP:
            assert datasets[key] == [], f"{key} should be empty"


class TestFullPipeline:
    def test_end_to_end_with_directory(self, tmp_path):
        d = tmp_path / "export"
        d.mkdir()

        followers_html = """
        <a href="https://www.instagram.com/alice/">A</a>
        <a href="https://www.instagram.com/bob/">B</a>
        <a href="https://www.instagram.com/charlie/">C</a>
        """
        following_html = """
        <a href="https://www.instagram.com/alice/">A</a>
        <a href="https://www.instagram.com/bob/">B</a>
        <a href="https://www.instagram.com/dave/">D</a>
        """

        (d / "followers_1.html").write_text(followers_html, encoding="utf-8")
        (d / "following.html").write_text(following_html, encoding="utf-8")

        datasets = parse_all_files(d)
        insights = compute_insights(datasets)

        assert insights["stats"]["followers"] == 3
        assert insights["stats"]["following"] == 3
        assert insights["stats"]["not_following_back"] == 1
        assert insights["stats"]["fans"] == 1
        assert insights["stats"]["mutuals"] == 2
        assert insights["lists"]["not_following_back"] == ["dave"]
        assert insights["lists"]["fans"] == ["charlie"]
        assert insights["lists"]["mutuals"] == ["alice", "bob"]
