#!/usr/bin/env python3
"""
Build per-construct Ollama Sim models from VVAULT identity files.

Default flow:
1) Scan /vvault/instances/*
2) Read identity/prompt.json (canonical) with prompt.txt fallback
3) Append identity/conditioning.txt (if present)
4) Write Modelfile.<model_name>
5) Run: ollama create <model_name> -f <modelfile>

Memory files (chatty transcripts/capsules) are not baked by default.
They should continue to be injected at inference time.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


DEFAULT_INSTANCES_DIR = "/vvault/instances"
DEFAULT_BUILD_DIR = "/tmp/ollama_modelfiles"
DEFAULT_BASE_MODEL = "phi3:latest"
DEFAULT_TEMPERATURE = 0.6
DEFAULT_WATCH_INTERVAL = 5.0
SKIP_REASONS = {"missing identity directory", "no prompt or conditioning"}


@dataclass
class BuildResult:
    callsign: str
    model_name: str
    modelfile: Path
    built: bool
    reason: str


def _read_text(path: Path) -> Optional[str]:
    if not path.exists() or not path.is_file():
        return None
    try:
        value = path.read_text(encoding="utf-8").strip()
    except Exception:
        return None
    return value or None


def _load_prompt(identity_dir: Path) -> Optional[str]:
    prompt_json_path = identity_dir / "prompt.json"
    raw = _read_text(prompt_json_path)
    if raw:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = None

        if isinstance(data, dict):
            for key in ("system_prompt", "prompt", "instructions"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

    # Backward-compatible fallback for legacy identity folders.
    prompt_txt = _read_text(identity_dir / "prompt.txt")
    if prompt_txt:
        return prompt_txt

    return None


def _summarize_capsule(inst_dir: Path) -> Optional[str]:
    callsign = inst_dir.name
    capsule_path = inst_dir / "memup" / f"{callsign}.capsule"
    raw = _read_text(capsule_path)
    if not raw:
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    traits = data.get("traits") if isinstance(data.get("traits"), dict) else {}
    personality = data.get("personality") if isinstance(data.get("personality"), dict) else {}

    summary_lines: List[str] = []

    personality_type = personality.get("personality_type")
    if isinstance(personality_type, str) and personality_type.strip():
        summary_lines.append(f"Personality type: {personality_type.strip()}")

    if traits:
        top_traits = []
        for key, value in list(traits.items())[:8]:
            if isinstance(value, (int, float)):
                top_traits.append(f"{key}={value:.2f}")
            else:
                top_traits.append(f"{key}={value}")
        if top_traits:
            summary_lines.append("Traits: " + ", ".join(top_traits))

    if not summary_lines:
        return None

    return "\n".join(summary_lines)


def _build_system_text(inst_dir: Path, include_capsule_summary: bool) -> Tuple[Optional[str], str]:
    identity_dir = inst_dir / "identity"
    if not identity_dir.exists() or not identity_dir.is_dir():
        return None, "missing identity directory"

    prompt = _load_prompt(identity_dir)
    conditioning = _read_text(identity_dir / "conditioning.txt")

    if not prompt and not conditioning:
        return None, "no prompt or conditioning"

    parts: List[str] = []
    if prompt:
        parts.append(prompt)
    if conditioning:
        parts.append(conditioning)

    if include_capsule_summary:
        capsule_summary = _summarize_capsule(inst_dir)
        if capsule_summary:
            parts.append("[Capsule summary]\n" + capsule_summary)

    return "\n\n".join(parts).strip(), "ok"


def _model_name(callsign: str) -> str:
    # nova-001 -> nova, lin-001 -> lin, monday-001 -> monday
    return re.sub(r"-0*\d+$", "", callsign) or callsign


def _modelfile_content(base_model: str, system_prompt: str, temperature: float) -> str:
    return (
        f"FROM {base_model}\n\n"
        f"SYSTEM \"\"\"\n{system_prompt}\n\"\"\"\n\n"
        f"PARAMETER temperature {temperature}\n"
    )


def _write_modelfile(build_dir: Path, model_name: str, content: str) -> Path:
    build_dir.mkdir(parents=True, exist_ok=True)
    path = build_dir / f"Modelfile.{model_name}"
    path.write_text(content, encoding="utf-8")
    return path


def _run_ollama_create(model_name: str, modelfile: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["ollama", "create", model_name, "-f", str(modelfile)],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def discover_callsigns(instances_dir: Path) -> Iterable[Path]:
    if not instances_dir.exists() or not instances_dir.is_dir():
        return []
    return sorted([p for p in instances_dir.iterdir() if p.is_dir()])


def _fingerprint_identity(inst_dir: Path) -> str:
    identity_dir = inst_dir / "identity"
    files = [identity_dir / "prompt.json", identity_dir / "prompt.txt", identity_dir / "conditioning.txt"]
    chunks = []
    for path in files:
        if not path.exists() or not path.is_file():
            continue
        try:
            stat = path.stat()
            chunks.append(f"{path.name}:{stat.st_mtime_ns}:{stat.st_size}")
        except Exception:
            continue
    capsule = inst_dir / "memup" / f"{inst_dir.name}.capsule"
    if capsule.exists() and capsule.is_file():
        try:
            stat = capsule.stat()
            chunks.append(f"{capsule.name}:{stat.st_mtime_ns}:{stat.st_size}")
        except Exception:
            pass
    return "|".join(chunks)


def build_all(
    instances_dir: Path,
    build_dir: Path,
    base_model: str,
    temperature: float,
    include_capsule_summary: bool,
    dry_run: bool,
    only_callsigns: Optional[set[str]] = None,
) -> List[BuildResult]:
    results: List[BuildResult] = []

    if not dry_run and shutil.which("ollama") is None:
        raise RuntimeError("ollama CLI not found in PATH")

    for inst_dir in discover_callsigns(instances_dir):
        callsign = inst_dir.name
        if only_callsigns and callsign not in only_callsigns:
            continue

        model_name = _model_name(callsign)
        system_text, status = _build_system_text(inst_dir, include_capsule_summary)

        if not system_text:
            results.append(
                BuildResult(
                    callsign=callsign,
                    model_name=model_name,
                    modelfile=build_dir / f"Modelfile.{model_name}",
                    built=False,
                    reason=status,
                )
            )
            continue

        modelfile = _write_modelfile(
            build_dir,
            model_name,
            _modelfile_content(base_model, system_text, temperature),
        )

        if dry_run:
            results.append(
                BuildResult(
                    callsign=callsign,
                    model_name=model_name,
                    modelfile=modelfile,
                    built=True,
                    reason="dry-run",
                )
            )
            continue

        proc = _run_ollama_create(model_name, modelfile)
        if proc.returncode == 0:
            results.append(
                BuildResult(
                    callsign=callsign,
                    model_name=model_name,
                    modelfile=modelfile,
                    built=True,
                    reason="created",
                )
            )
        else:
            reason = (proc.stderr or proc.stdout or "ollama create failed").strip().splitlines()[-1]
            results.append(
                BuildResult(
                    callsign=callsign,
                    model_name=model_name,
                    modelfile=modelfile,
                    built=False,
                    reason=reason,
                )
            )

    return results


def print_results(results: List[BuildResult]) -> int:
    built_ok = 0
    skipped = 0
    failed = 0

    for item in results:
        if item.built:
            marker = "OK"
            built_ok += 1
        elif item.reason in SKIP_REASONS:
            marker = "SKIP"
            skipped += 1
        else:
            marker = "FAIL"
            failed += 1

        print(f"[{marker}] {item.callsign} -> {item.model_name} ({item.reason}) [{item.modelfile}]")

    print(f"\nSummary: built={built_ok}, skipped={skipped}, failed={failed}, total={len(results)}")

    return 0 if failed == 0 else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Ollama Sim models from VVAULT identity files")
    parser.add_argument("--instances-dir", default=DEFAULT_INSTANCES_DIR, help="Path to mounted /vvault/instances")
    parser.add_argument("--build-dir", default=DEFAULT_BUILD_DIR, help="Directory for generated Modelfiles")
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL, help="Base model in Modelfile FROM line")
    parser.add_argument("--temperature", type=float, default=DEFAULT_TEMPERATURE, help="PARAMETER temperature")
    parser.add_argument("--include-capsule-summary", action="store_true", help="Append a compact capsule summary to SYSTEM")
    parser.add_argument("--dry-run", action="store_true", help="Write Modelfiles without calling ollama create")
    parser.add_argument("--callsign", action="append", default=[], help="Only build this callsign (repeatable)")
    parser.add_argument("--watch", action="store_true", help="Watch identity files and rebuild changed callsigns")
    parser.add_argument("--watch-interval", type=float, default=DEFAULT_WATCH_INTERVAL, help="Polling interval in seconds for --watch")
    return parser.parse_args()


def run_once(args: argparse.Namespace, only_callsigns: Optional[set[str]] = None) -> int:
    results = build_all(
        instances_dir=Path(args.instances_dir),
        build_dir=Path(args.build_dir),
        base_model=args.base_model,
        temperature=args.temperature,
        include_capsule_summary=args.include_capsule_summary,
        dry_run=args.dry_run,
        only_callsigns=only_callsigns,
    )
    return print_results(results)


def run_watch(args: argparse.Namespace) -> int:
    instances_dir = Path(args.instances_dir)
    fingerprints: Dict[str, str] = {}
    allowed_callsigns = set(args.callsign) if args.callsign else None

    print(f"Watching {instances_dir} (interval={args.watch_interval}s)")
    # Initial full build
    run_once(args, only_callsigns=allowed_callsigns)
    for inst_dir in discover_callsigns(instances_dir):
        callsign = inst_dir.name
        if allowed_callsigns and callsign not in allowed_callsigns:
            continue
        fingerprints[callsign] = _fingerprint_identity(inst_dir)

    while True:
        changed: set[str] = set()
        for inst_dir in discover_callsigns(instances_dir):
            callsign = inst_dir.name
            if allowed_callsigns and callsign not in allowed_callsigns:
                continue

            current = _fingerprint_identity(inst_dir)
            previous = fingerprints.get(callsign)
            if previous is None:
                fingerprints[callsign] = current
                changed.add(callsign)
                continue

            if current != previous:
                fingerprints[callsign] = current
                changed.add(callsign)

        if changed:
            print(f"\nDetected identity changes for: {', '.join(sorted(changed))}")
            run_once(args, only_callsigns=changed)

        time.sleep(max(0.5, args.watch_interval))


def main() -> int:
    args = parse_args()

    instances_dir = Path(args.instances_dir)
    if not instances_dir.exists() or not instances_dir.is_dir():
        print(f"instances dir not found: {instances_dir}", file=sys.stderr)
        return 2

    if args.watch:
        return run_watch(args)

    return run_once(args, only_callsigns=set(args.callsign) if args.callsign else None)


if __name__ == "__main__":
    raise SystemExit(main())
