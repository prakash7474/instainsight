#!/usr/bin/env python3
"""
Instagram Insights Parser
Parses Instagram data export HTML files and outputs structured JSON insights.

Usage:
    python instagram_insights.py /path/to/instagram_export.zip
    python instagram_insights.py /path/to/connections/followers_and_following/

Output: Writes insights.json to current directory (or use --output)
"""

import argparse
import json
import os
import re
import zipfile
from collections import OrderedDict
from pathlib import Path


FILE_MAP = {
    "followers": "followers_1.html",
    "following": "following.html",
    "blocked": "blocked_profiles.html",
    "close_friends": "close_friends.html",
    "hidden_story": "hide_story_from.html",
    "pending_requests": "pending_follow_requests.html",
    "recent_requests": "recent_follow_requests.html",
    "recently_unfollowed": "recently_unfollowed_profiles.html",
}


def extract_usernames_from_html(html: str) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    pattern = re.compile(
        r'<a[^>]+href="https?://(?:www\.)?instagram\.com/([^"/?#]+)',
        re.IGNORECASE,
    )
    for match in pattern.finditer(html):
        username = match.group(1).strip().rstrip("/").lower()
        if username and username not in seen and len(username) >= 2:
            seen.add(username)
            result.append(username)
    return result


def normalize_username(username: str) -> str:
    return username.strip().rstrip("/").lower()


def deduplicate_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = normalize_username(item)
        if key and key not in seen:
            seen.add(key)
            result.append(key)
    return result


def read_file_content(source: Path, filename: str) -> str | None:
    if source.is_dir():
        filepath = source / filename
        if filepath.exists():
            return filepath.read_text(encoding="utf-8")
        return None

    with zipfile.ZipFile(source, "r") as zf:
        prefix = "connections/followers_and_following/"
        for candidate in [f"{prefix}{filename}", filename]:
            if candidate in zf.namelist():
                return zf.read(candidate).decode("utf-8")
    return None


def parse_all_files(source: Path) -> dict[str, list[str]]:
    datasets: dict[str, list[str]] = {}

    for key, filename in FILE_MAP.items():
        content = read_file_content(source, filename)
        if content:
            usernames = extract_usernames_from_html(content)
            datasets[key] = deduplicate_preserve_order(usernames)
        else:
            datasets[key] = []
            print(f"[warn] {filename} not found in {source}")

    return datasets


def compute_insights(datasets: dict[str, list[str]]) -> dict:
    followers_set = set(datasets["followers"])
    following_set = set(datasets["following"])

    not_following_back = [
        u for u in datasets["following"] if u not in followers_set
    ]
    fans = [u for u in datasets["followers"] if u not in following_set]
    mutuals = [u for u in datasets["following"] if u in followers_set]

    return OrderedDict([
        ("stats", OrderedDict([
            ("followers", len(datasets["followers"])),
            ("following", len(datasets["following"])),
            ("not_following_back", len(not_following_back)),
            ("fans", len(fans)),
            ("mutuals", len(mutuals)),
            ("recently_unfollowed", len(datasets["recently_unfollowed"])),
            ("pending_requests", len(datasets["pending_requests"])),
        ])),
        ("lists", OrderedDict([
            ("not_following_back", not_following_back),
            ("fans", fans),
            ("mutuals", mutuals),
            ("recently_unfollowed", datasets["recently_unfollowed"]),
            ("blocked", datasets["blocked"]),
            ("close_friends", datasets["close_friends"]),
            ("hidden_story", datasets["hidden_story"]),
        ])),
    ])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse Instagram data export and generate insights"
    )
    parser.add_argument(
        "source",
        help="Path to Instagram ZIP export or connections/followers_and_following/ directory",
    )
    parser.add_argument(
        "--output", "-o",
        default="insights.json",
        help="Output JSON file path (default: insights.json)",
    )
    parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        default=True,
        help="Pretty-print JSON output (default: true)",
    )
    args = parser.parse_args()

    source_path = Path(args.source)

    if not source_path.exists():
        print(f"[error] {args.source} does not exist")
        return

    if source_path.is_dir():
        required = ["followers_1.html", "following.html"]
        missing = [f for f in required if not (source_path / f).exists()]
        if missing:
            print(
                f"[error] Missing required files in directory: {', '.join(missing)}"
            )
            print("Expected files:", ", ".join(FILE_MAP.values()))
            return

    print(f"[info] Reading from: {source_path}")
    datasets = parse_all_files(source_path)
    print(f"[info] Parsed {len(datasets)} datasets")

    insights = compute_insights(datasets)

    indent = 2 if args.pretty else None
    output_path = Path(args.output)
    output_path.write_text(
        json.dumps(insights, indent=indent, ensure_ascii=False),
        encoding="utf-8",
    )

    stats = insights["stats"]
    print(f"\n{'='*40}")
    print(f"  Followers:          {stats['followers']}")
    print(f"  Following:          {stats['following']}")
    print(f"  Not Following Back: {stats['not_following_back']}")
    print(f"  Fans:               {stats['fans']}")
    print(f"  Mutuals:            {stats['mutuals']}")
    print(f"  Recently Unfollowed: {stats['recently_unfollowed']}")
    print(f"  Pending Requests:    {stats['pending_requests']}")
    print(f"{'='*40}")
    print(f"[done] Insights written to {output_path.resolve()}")


if __name__ == "__main__":
    main()
