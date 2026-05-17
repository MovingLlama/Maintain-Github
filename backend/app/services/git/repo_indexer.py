"""
Repository indexing service: walks a cloned repo and generates a structured summary
for token-efficient context injection in AI chats.
"""
import logging
import hashlib
import os
from pathlib import Path
from typing import Any
from datetime import datetime, timezone

from app.services.git.git_service import GitService

logger = logging.getLogger(__name__)

# Files considered "key" for summarization
KEY_FILE_NAMES = {
    "README.md", "README.rst", "README", "LICENSE", "CHANGELOG.md",
    "Makefile", "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "package.json", "requirements.txt", "Pipfile", "pyproject.toml",
    "Cargo.toml", "go.mod", "Gemfile", "build.gradle", "pom.xml",
    ".gitignore", ".env.example", "tsconfig.json", "vite.config.ts",
    "tailwind.config.js", "postcss.config.js",
}

# Maximum file size to consider for key files (bytes)
MAX_KEY_FILE_SIZE = 50 * 1024  # 50KB

# Directories to ignore during indexing
IGNORE_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv",
    "dist", "build", ".next", "target", ".cache", ".idea", ".vscode",
    "vendor", ".pytest_cache", ".mypy_cache", ".tox", "egg-info",
}

# File extensions to language mapping
EXT_LANGUAGE_MAP = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
    ".tsx": "TypeScript React", ".jsx": "JavaScript React",
    ".rs": "Rust", ".go": "Go", ".java": "Java",
    ".cpp": "C++", ".c": "C", ".h": "C Header",
    ".rb": "Ruby", ".php": "PHP", ".cs": "C#",
    ".swift": "Swift", ".kt": "Kotlin",
    ".css": "CSS", ".scss": "SCSS", ".less": "LESS",
    ".html": "HTML", ".htm": "HTML",
    ".md": "Markdown", ".rst": "reStructuredText",
    ".json": "JSON", ".yaml": "YAML", ".yml": "YAML",
    ".toml": "TOML", ".ini": "INI", ".cfg": "Config",
    ".sh": "Shell", ".bash": "Bash", ".zsh": "Zsh",
    ".sql": "SQL", ".graphql": "GraphQL",
    ".dockerfile": "Dockerfile",
}


def _get_language(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if not ext and Path(file_path).name.lower() in ("dockerfile", "makefile"):
        return "Config"
    return EXT_LANGUAGE_MAP.get(ext, "Other")


def _compute_content_hash(file_tree: dict) -> str:
    """Compute a hash of the file tree structure for change detection."""
    sha = hashlib.sha256()
    sha.update(json.dumps(file_tree, sort_keys=True).encode())
    return sha.hexdigest()


import json


def index_repository(repo_path: str) -> dict[str, Any]:
    """
    Walk a repository and generate a structured summary.
    Returns a dict with: file_tree_json, key_files_json, languages_json,
    total_files, total_size, content_hash.
    """
    base = Path(repo_path)
    if not base.exists():
        raise FileNotFoundError(f"Repository path does not exist: {repo_path}")

    file_tree: dict[str, Any] = {}
    key_files: list[dict[str, Any]] = []
    languages: dict[str, dict[str, int]] = {}
    total_files = 0
    total_size = 0

    def walk_directory(current: Path, tree: dict) -> None:
        nonlocal total_files, total_size
        try:
            entries = sorted(current.iterdir(), key=lambda e: (not e.is_dir(), e.name))
        except PermissionError:
            return

        for entry in entries:
            if entry.name in IGNORE_DIRS and entry.is_dir():
                continue
            if entry.name.startswith(".") and entry.is_dir() and entry.name not in (".github",):
                continue

            rel_path = str(entry.relative_to(base))

            if entry.is_dir():
                tree[entry.name] = {}
                walk_directory(entry, tree[entry.name])
            else:
                try:
                    stat = entry.stat()
                    file_size = stat.st_size
                except OSError:
                    file_size = 0

                total_files += 1
                total_size += file_size
                lang = _get_language(entry.name)

                if lang not in languages:
                    languages[lang] = {"count": 0, "size": 0}
                languages[lang]["count"] += 1
                languages[lang]["size"] += file_size

                tree[entry.name] = {
                    "size": file_size,
                    "language": lang,
                }

                # Identify key files
                if entry.name in KEY_FILE_NAMES or (
                    file_size < MAX_KEY_FILE_SIZE and lang not in ("Other",)
                ):
                    try:
                        content = entry.read_text(encoding="utf-8", errors="replace")[:2000]
                    except Exception:
                        content = "[binary or unreadable]"
                    key_files.append({
                        "path": rel_path,
                        "size": file_size,
                        "language": lang,
                        "preview": content[:500],
                    })

    walk_directory(base, file_tree)

    # Compute percentages for language stats
    if total_files > 0:
        for lang_data in languages.values():
            lang_data["percentage"] = round(lang_data["count"] / total_files * 100, 1)

    # Sort key files by relevance (README first, then by path)
    key_files.sort(key=lambda f: (
        0 if "readme" in f["path"].lower() else 1,
        f["path"],
    ))

    # Limit key files to top 20
    key_files = key_files[:20]

    file_tree_json = file_tree
    content_hash = _compute_content_hash(file_tree_json)

    # Generate a text summary
    lang_summary = ", ".join(
        f"{lang}: {data['count']} files ({data['percentage']}%)"
        for lang, data in sorted(languages.items(), key=lambda x: -x[1]["count"])[:8]
    )

    summary_text = (
        f"Repository with {total_files} files ({total_size / 1024:.0f} KB).\n"
        f"Languages: {lang_summary}.\n"
        f"Key files: {', '.join(f['path'] for f in key_files[:10])}"
    )

    return {
        "file_tree_json": file_tree_json,
        "key_files_json": key_files,
        "languages_json": {
            lang: {"count": data["count"], "percentage": data["percentage"]}
            for lang, data in languages.items()
        },
        "total_files": total_files,
        "total_size": total_size,
        "content_hash": content_hash,
        "summary_text": summary_text,
    }
