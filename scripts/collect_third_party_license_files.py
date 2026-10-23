#!/usr/bin/env python3
"""Copy original third-party LICENSE/NOTICE files from Evalyn's installed dependencies.

Run from the repository root after npm ci in frontend and with the intended
backend .venv activated. This utility does not create a project-level licence.
"""

from __future__ import annotations

import argparse
import importlib.metadata as metadata
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LICENSE_FILE = re.compile(
    r"^(?:LICENSE|LICENCE|UNLICENSE|COPYING|NOTICE|COPYRIGHT|"
    r"THIRD[-_ ]?PARTY(?:[-_ ]?(?:LICENSES?|NOTICES?))?|PATENTS|AUTHORS)"
    r"(?:$|[._ -].*)",
    re.IGNORECASE,
)
SKIP_DIRS = {".git", ".github", "node_modules", "__tests__", "test", "tests", "fixtures"}
LEGAL_DIRS = {"license", "licenses", "licence", "licences", "legal", "notice", "notices",
              "third_party", "third-party", "thirdparty"}
MAX_TEXT_BYTES = 2 * 1024 * 1024


def norm_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower().strip()


def safe_name(value: str) -> str:
    return (re.sub(r"[^A-Za-z0-9._@+-]+", "_", value.strip())[:180] or "unknown")


def url_from_npm_metadata(package_meta: dict[str, Any], package_name: str) -> str:
    """Return the upstream homepage/repository URL, or the official npm package page."""
    homepage = package_meta.get("homepage")
    if isinstance(homepage, str) and homepage.startswith(("https://", "http://")):
        return homepage

    repository = package_meta.get("repository")
    if isinstance(repository, dict):
        repository = repository.get("url")
    if isinstance(repository, str) and repository.strip():
        url = repository.strip()
        for prefix in ("git+", "git://"):
            if url.startswith(prefix):
                url = "https://" + url[len(prefix):] if prefix == "git://" else url[4:]
                break
        if url.endswith(".git"):
            url = url[:-4]
        if url.startswith(("https://", "http://")):
            return url

    # Official package-registry page fallback; this is a package URL, not
    # a claim that the licence text itself is hosted at this URL.
    return "https://www.npmjs.com/package/" + package_name


def url_from_python_metadata(dist: metadata.Distribution, package_name: str) -> str:
    """Prefer upstream project URLs from metadata; fall back to the PyPI page."""
    preferred_labels = {"homepage", "source", "source code", "repository", "repository url"}
    project_urls = dist.metadata.get_all("Project-URL") or []
    candidates: list[tuple[str, str]] = []
    for item in project_urls:
        label, separator, url = item.partition(",")
        if separator and url.strip().startswith(("https://", "http://")):
            candidates.append((label.strip().lower(), url.strip()))

    for label, url in candidates:
        if label in preferred_labels:
            return url

    home_page = str(dist.metadata.get("Home-page") or "").strip()
    if home_page.startswith(("https://", "http://")):
        return home_page
    for _, url in candidates:
        return url

    # Official Python Package Index page fallback; not a direct licence-file URL.
    return "https://pypi.org/project/" + package_name + "/"


def is_legal_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() not in {
        ".map", ".png", ".jpg", ".jpeg", ".gif", ".pdf"
    } and bool(LICENSE_FILE.match(path.name))


def read_original_text(path: Path) -> str | None:
    try:
        if path.stat().st_size > MAX_TEXT_BYTES:
            return None
        raw = path.read_bytes()
        if b"\x00" in raw:
            return None
        return raw.decode("utf-8-sig", errors="replace")
    except OSError:
        return None


def package_legal_files(package_root: Path) -> list[Path]:
    if not package_root.is_dir():
        return []
    found: set[Path] = set()
    try:
        for item in package_root.iterdir():
            if is_legal_file(item):
                found.add(item)
    except OSError:
        return []

    for current, dirs, files in os.walk(package_root):
        current_path = Path(current)
        try:
            relative = current_path.relative_to(package_root)
        except ValueError:
            dirs[:] = []
            continue
        dirs[:] = [
            name for name in dirs
            if name.lower() not in SKIP_DIRS
            and (
                current_path == package_root
                or name.lower() in LEGAL_DIRS
            )
        ]
        if not any(part.lower() in LEGAL_DIRS for part in relative.parts):
            continue
        for filename in files:
            candidate = current_path / filename
            if is_legal_file(candidate):
                found.add(candidate)
    return sorted(found, key=lambda p: str(p).lower())


def copy_original(
    source: Path, ecosystem_dir: Path, package_label: str, relative_path: str,
    source_label: str,
) -> dict[str, str] | None:
    text = read_original_text(source)
    if text is None:
        return None
    parts = [p for p in Path(relative_path).parts if p not in {"", ".", "..", "/", "\\"}]
    safe_relative = Path(*(safe_name(part) for part in parts)) if parts else Path(source.name)
    destination = ecosystem_dir / safe_name(package_label) / safe_relative
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        # Preserve the original distributed file bytes. The text is read above
        # only to reject binary/non-text files; no licence terms are rewritten.
        shutil.copyfile(source, destination)
    except OSError:
        return None
    return {
        "copied_path": destination.relative_to(ecosystem_dir.parent).as_posix(),
        "original_path": source_label,
        "filename": source.name,
    }


def collect_npm(frontend: Path, output: Path) -> list[dict[str, Any]]:
    lock_path = frontend / "package-lock.json"
    if not lock_path.is_file():
        return [{
            "ecosystem": "npm", "package": "(frontend)", "version": "",
            "declared_license": "", "status": "package-lock.json not found", "files": [],
        }]
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        return [{
            "ecosystem": "npm", "package": "(frontend)", "version": "",
            "declared_license": "", "status": f"could not parse package-lock.json: {exc}",
            "files": [],
        }]

    records: list[dict[str, Any]] = []
    for install_path, lock_info in (lock.get("packages") or {}).items():
        if not install_path or not install_path.startswith("node_modules/"):
            continue
        root = frontend / Path(install_path)
        package_json = root / "package.json"
        package_meta: dict[str, Any] = {}
        if package_json.is_file():
            try:
                package_meta = json.loads(package_json.read_text(encoding="utf-8-sig"))
            except (OSError, json.JSONDecodeError):
                pass
        name = str(package_meta.get("name") or install_path.split("node_modules/")[-1])
        version = str(lock_info.get("version") or package_meta.get("version") or "unknown")
        license_label = package_meta.get("license") or lock_info.get("license") or ""
        label = f"{name}@{version} [{install_path}]"
        copied: list[dict[str, str]] = []
        for source in package_legal_files(root):
            try:
                relative = source.relative_to(root).as_posix()
            except ValueError:
                relative = source.name
            item = copy_original(source, output / "npm", label, relative, f"{install_path}/{relative}")
            if item:
                copied.append(item)
        records.append({
            "ecosystem": "npm", "package": name, "version": version,
            "package_url": url_from_npm_metadata(package_meta, name),
            "declared_license": str(license_label), "install_path": install_path,
            "status": "copied original file(s)" if copied else (
                "package not installed" if not root.is_dir()
                else "no matching LICENSE/NOTICE/COPYING file found"
            ),
            "files": copied,
        })
    return records


def names_from_requirements(backend: Path) -> set[str]:
    names: set[str] = set()
    for req_file in (backend / "requirements.txt", backend / "requirements-queue.txt"):
        if not req_file.is_file():
            continue
        for line in req_file.read_text(encoding="utf-8-sig", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            match = re.match(
                r"^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[.*?\])?\s*"
                r"(?:===|==|>=|<=|~=|!=|>|<|;|$)",
                line,
            )
            if match:
                names.add(norm_name(match.group(1)))
    return names


def collect_python(
    backend: Path, output: Path, requirements_only: bool
) -> tuple[list[dict[str, Any]], list[str]]:
    expected = names_from_requirements(backend)
    installed: set[str] = set()
    records: list[dict[str, Any]] = []

    for dist in metadata.distributions():
        try:
            name = str(dist.metadata.get("Name") or "unknown")
            version = str(dist.version or "unknown")
        except Exception:
            continue
        normalized = norm_name(name)
        if requirements_only and expected and normalized not in expected:
            continue
        installed.add(normalized)
        declared = dist.metadata.get("License-Expression") or dist.metadata.get("License") or ""
        package_url = url_from_python_metadata(dist, name)
        label = f"{name}@{version}"
        copied: list[dict[str, str]] = []
        try:
            entries = list(dist.files or [])
        except Exception:
            entries = []
        for entry in entries:
            rel = Path(str(entry))
            if not LICENSE_FILE.match(rel.name):
                continue
            try:
                source = Path(dist.locate_file(entry))
                if not source.is_file():
                    continue
                safe_parts = [part for part in rel.parts if part not in {"", ".", "..", "/", "\\"}]
                relative = Path(*safe_parts).as_posix() if safe_parts else source.name
                item = copy_original(source, output / "python", label, relative, f"{name}=={version}/{rel.as_posix()}")
                if item:
                    copied.append(item)
            except (OSError, TypeError, ValueError):
                continue
        records.append({
            "ecosystem": "python", "package": name, "version": version,
            "package_url": package_url,
            "declared_license": str(declared),
            "status": "copied original file(s)" if copied else
                      "no matching installed LICENSE/NOTICE/COPYING file found",
            "files": copied,
        })
    return records, sorted(expected - installed) if requirements_only and expected else []


def write_reports(
    output: Path, records: list[dict[str, Any]], missing_python: list[str]
) -> None:
    copied_count = sum(len(row.get("files", [])) for row in records)
    no_file = [row for row in records if not row.get("files")]
    lines = [
        "# Collected Third-Party Licence and Notice Files",
        "",
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "> Copies of original files found in installed dependency distributions. This is an inventory, not legal approval and not a licence grant for Evalyn.",
        "",
        f"- Dependency entries checked: {len(records)}",
        f"- Original licence or notice files copied: {copied_count}",
        f"- Entries with no matching file copied: {len(no_file)}",
        "",
        "## Dependency inventory",
        "",
        "| Ecosystem | Package | Version | Declared licence metadata | Package URL | Copy status |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in records:
        lic = str(row.get("declared_license") or "Not declared").replace("|", "\\|").replace("\n", " ")
        status = str(row.get("status") or "").replace("|", "\\|").replace("\n", " ")
        package_url = str(row.get("package_url") or "Not available").replace("|", "%7C")
        lines.append(
            f"| {row.get('ecosystem')} | {row.get('package')} | {row.get('version')} | {lic} | {package_url} | {status} |"
        )
        for f in row.get("files") or []:
            lines.append(f"  - Copied: {f['copied_path']} (original: {f['original_path']})")

    if missing_python:
        lines.extend([
            "", "## Pinned Python packages not present in the active interpreter", "",
            "These names are in the backend requirements files but were not found in the Python environment running this script:", "",
        ])
        lines.extend(f"- {name}" for name in missing_python)

    if no_file:
        lines.extend([
            "", "## Manual follow-up required", "",
            "No matching original licence/notice file was copied for these entries. This does not prove the licence is absent; inspect the exact upstream distribution and licence expression.", "",
        ])
        for row in no_file:
            lines.append(
                f"- {row.get('ecosystem')}: {row.get('package')} {row.get('version')} — {row.get('status')}"
            )
    lines.extend([
        "", "## Important", "",
        "- Preserve upstream text and required attribution; do not substitute generic licence templates for the copied package files.",
        "- Dual-license expressions need a decision about which terms apply to the actual use and distribution.",
        "- This tool does not scan container operating-system packages, hosted APIs, model weights, fonts outside package distributions, logos, images or arbitrary copied materials.",
        "- This output does not create a root LICENSE file for Evalyn.",
        "",
    ])
    (output / "THIRD_PARTY_LICENSES_INDEX.md").write_text(
        "\n".join(lines), encoding="utf-8", newline="\n"
    )

    # Build a consolidated notices file using only original text files copied
    # above. The surrounding package/source headers are generated metadata;
    # no missing licence text is fabricated.
    notices_path = output.parent.parent / "THIRD_PARTY_NOTICES.txt"
    notice_lines = [
        "THIRD-PARTY LICENCE AND NOTICE FILES",
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "The licence/notice bodies below are copied from files found in installed dependency distributions.",
        "Package labels and URLs are metadata for identification; they are not licence terms.",
        "Packages without a copied file are listed in third_party_licenses/generated/THIRD_PARTY_LICENSES_INDEX.md for manual follow-up.",
        "",
    ]
    for row in records:
        files = row.get("files") or []
        if not files:
            continue
        for file_info in files:
            copied_path = output / file_info["copied_path"]
            try:
                body = copied_path.read_text(encoding="utf-8-sig", errors="replace")
            except OSError:
                continue
            notice_lines.extend([
                "=" * 78,
                f"Package: {row.get('package', 'unknown')} {row.get('version', '')}".strip(),
                f"Ecosystem: {row.get('ecosystem', 'unknown')}",
                f"Package URL: {row.get('package_url') or 'Not available'}",
                f"Declared licence metadata: {row.get('declared_license') or 'Not declared'}",
                f"Original file path within dependency: {file_info.get('original_path', file_info.get('filename', 'unknown'))}",
                "-" * 78,
                body.rstrip("\r\n"),
                "",
                "",
            ])
    notices_path.write_text("\n".join(notice_lines).rstrip() + "\n", encoding="utf-8", newline="\n")

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "python": sys.version,
        "records": records,
        "requirements_names_not_installed": missing_python,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Copy original licence and notice files from installed Evalyn dependencies."
    )
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="repository root")
    parser.add_argument(
        "--requirements-only", action="store_true",
        help="limit the Python inventory to package names listed in backend requirements; by default, include the entire active environment so indirect and separately installed packages are visible",
    )
    args = parser.parse_args()
    root = args.root.resolve()
    output = (root / "third_party_licenses" / "generated").resolve()

    if not (root / "frontend").is_dir() or not (root / "backend").is_dir():
        print(f"Expected frontend and backend folders beneath {root}", file=sys.stderr)
        return 2
    if output.exists():
        print(
            f"Output already exists: {output}\n"
            "Inspect it before moving/removing only this generated folder and rerunning.",
            file=sys.stderr,
        )
        return 2
    notices_path = root / "THIRD_PARTY_NOTICES.txt"
    if notices_path.exists():
        print(
            f"Refusing to overwrite existing notices file: {notices_path}\n"
            "Inspect and back it up first, then rerun only if replacing it is intended.",
            file=sys.stderr,
        )
        return 2

    output.mkdir(parents=True)
    records = collect_npm(root / "frontend", output)
    python_records, missing_python = collect_python(root / "backend", output, args.requirements_only)
    records.extend(python_records)
    write_reports(output, records, missing_python)
    copied = sum(len(row.get("files", [])) for row in records)
    missing = sum(1 for row in records if not row.get("files"))
    print(f"Copied {copied} original licence/notice file(s).")
    print(f"Entries needing manual follow-up: {missing}.")
    print(f"Index: {output / 'THIRD_PARTY_LICENSES_INDEX.md'}")
    print(f"Combined notices from copied original files: {root / 'THIRD_PARTY_NOTICES.txt'}")
    print("Review the copied files and generated index before committing them.")
    print("No root project licence was created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
