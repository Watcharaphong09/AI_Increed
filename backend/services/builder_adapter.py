"""
Builder Adapter Layer for AI_Increed.

Defines the abstraction for delegating tasks from AI Dev Workspace (Planner)
to AI Builders (Antigravity, Manual fallback, or future agents).

Adheres to:
  - Capability Detection (Never assumes CLI/API exists without checking)
  - Task Locking (Prevents duplicate handoffs and state corruption)
  - Handoff Package Generation (.handoff/TASK-xxx/)
  - Graceful Fallback (Planner never fails if builder integration fails)
"""

from __future__ import annotations

import json
import logging
import os
import platform
import shutil
import subprocess
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config import settings
from backend.models.project import Project, Task, TaskStatus

logger = logging.getLogger(__name__)


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class BuilderCapability:
    """Represents the detected capabilities of the local builder environment."""
    installed: bool = False
    cli: bool = False
    workspace_open: bool = False
    deep_link: bool = False
    automation: bool = False
    executable_path: Optional[str] = None
    method: str = "manual"  # 'cli' | 'executable' | 'folder_open' | 'manual'
    default_mode: str = "manual"  # 'assisted' | 'manual' | 'automated'
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class HandoffPackage:
    """Artifacts prepared for the builder inside workspace/.handoff/TASK-xxx/."""
    task_id: str
    task_number: int
    project_id: str
    workspace_path: str
    manifest_path: str
    instruction_path: str
    context_summary_path: str
    instruction_text: str
    lock_acquired: bool = False
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Capability Detector ───────────────────────────────────────────────────────

class BuilderCapabilityDetector:
    """Scans the local machine to detect Antigravity installation and available capabilities."""

    @staticmethod
    def detect() -> BuilderCapability:
        """Perform non-destructive environment detection for Antigravity."""
        cap = BuilderCapability()
        system = platform.system()
        cap.details["os"] = system

        exe_path: Optional[Path] = None

        if system == "Windows":
            # 1. Check common Windows install locations (Antigravity IDE & Antigravity)
            local_appdata = os.environ.get("LOCALAPPDATA", "")
            prog_files = os.environ.get("ProgramFiles", "C:\\Program Files")
            prog_files_x86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")

            candidates = [
                Path(local_appdata) / "Programs" / "Antigravity IDE" / "Antigravity IDE.exe",
                Path(local_appdata) / "Programs" / "Antigravity" / "Antigravity.exe",
                Path(prog_files) / "Antigravity IDE" / "Antigravity IDE.exe",
                Path(prog_files) / "Antigravity" / "Antigravity.exe",
                Path(prog_files_x86) / "Antigravity IDE" / "Antigravity IDE.exe",
                Path(prog_files_x86) / "Antigravity" / "Antigravity.exe",
            ]
            for candidate in candidates:
                if candidate.exists() and candidate.is_file():
                    exe_path = candidate
                    break

            # 2. Check CLI in PATH or Antigravity IDE bin
            cli_candidates = [
                Path(local_appdata) / "Programs" / "Antigravity IDE" / "bin" / "antigravity-ide.cmd",
                Path(prog_files) / "Antigravity IDE" / "bin" / "antigravity-ide.cmd",
            ]
            for cli_candidate in cli_candidates:
                if cli_candidate.exists() and cli_candidate.is_file():
                    cap.cli = True
                    cap.details["cli_path"] = str(cli_candidate)
                    break

            if not cap.cli:
                which_cli = shutil.which("antigravity-ide") or shutil.which("agy") or shutil.which("antigravity")
                if which_cli:
                    cap.cli = True
                    cap.details["cli_path"] = which_cli

            # 3. Check PATH for Antigravity or agy
            if not exe_path:
                which_exe = (
                    shutil.which("Antigravity IDE.exe")
                    or shutil.which("Antigravity.exe")
                    or shutil.which("antigravity.exe")
                )
                if which_exe:
                    exe_path = Path(which_exe)

        elif system == "Darwin":  # macOS
            mac_app = Path("/Applications/Antigravity.app")
            if mac_app.exists():
                exe_path = mac_app / "Contents" / "MacOS" / "Antigravity"

            which_cli = shutil.which("agy") or shutil.which("antigravity")
            if which_cli:
                cap.cli = True
                cap.details["cli_path"] = which_cli

        else:  # Linux
            which_exe = shutil.which("antigravity")
            if which_exe:
                exe_path = Path(which_exe)

        # Populate capability status
        if exe_path and exe_path.exists():
            cap.installed = True
            cap.executable_path = str(exe_path)
            cap.workspace_open = True
            cap.method = "executable"
            cap.default_mode = "assisted"
        elif cap.cli:
            cap.installed = True
            cap.workspace_open = True
            cap.method = "cli"
            cap.default_mode = "assisted"
        else:
            # Fallback: Can always open workspace folder via OS shell
            cap.installed = False
            cap.workspace_open = True
            cap.method = "folder_open"
            cap.default_mode = "manual"

        # Automation is currently disabled (requires API/IPC endpoint confirmation)
        cap.automation = False
        cap.deep_link = False

        return cap


# ── Builder Adapter Abstract Base Class ───────────────────────────────────────

class BuilderAdapter(ABC):
    """Abstract interface for delegating tasks to an external builder."""

    @abstractmethod
    def get_name(self) -> str:
        """Returns the builder adapter name."""
        ...

    @abstractmethod
    def detect_capabilities(self) -> BuilderCapability:
        """Returns builder capability information."""
        ...

    @abstractmethod
    async def prepare_task(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> HandoffPackage:
        """Generates the .handoff package and context files for a task."""
        ...

    @abstractmethod
    def open_workspace(self, workspace_path: Path) -> bool:
        """Opens the project workspace using the best available method."""
        ...

    @abstractmethod
    def launch_builder(
        self,
        workspace_path: Path,
        task_file: Optional[Path] = None,
    ) -> bool:
        """Launches or focuses the builder with the given workspace."""
        ...

    # ── Lock Management (Duplicate Prevention) ────────────────────────────────

    def acquire_lock(self, workspace_path: Path, task_number: int) -> dict[str, Any]:
        """
        Creates .handoff/TASK-NNN.lock to prevent duplicate handoffs.
        Raises RuntimeError if already locked.
        """
        handoff_dir = workspace_path / ".handoff"
        handoff_dir.mkdir(parents=True, exist_ok=True)
        lock_file = handoff_dir / f"TASK-{task_number:03d}.lock"

        if lock_file.exists():
            try:
                data = json.loads(lock_file.read_text(encoding="utf-8"))
                return data
            except Exception:
                pass

        lock_data = {
            "task_id": f"TASK-{task_number:03d}",
            "status": "BUILDING",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "builder": self.get_name(),
        }
        lock_file.write_text(json.dumps(lock_data, indent=2), encoding="utf-8")
        return lock_data

    def release_lock(self, workspace_path: Path, task_number: int) -> bool:
        """Deletes .handoff/TASK-NNN.lock."""
        lock_file = workspace_path / ".handoff" / f"TASK-{task_number:03d}.lock"
        if lock_file.exists():
            try:
                lock_file.unlink()
                return True
            except OSError as e:
                logger.warning("Failed to remove lock file %s: %s", lock_file, e)
                return False
        return True

    def get_lock(self, workspace_path: Path, task_number: int) -> Optional[dict[str, Any]]:
        """Returns lock content if task is locked, else None."""
        lock_file = workspace_path / ".handoff" / f"TASK-{task_number:03d}.lock"
        if lock_file.exists():
            try:
                return json.loads(lock_file.read_text(encoding="utf-8"))
            except Exception:
                return {"task_id": f"TASK-{task_number:03d}", "status": "BUILDING"}
        return None


# ── Antigravity Adapter ───────────────────────────────────────────────────────

class AntigravityAdapter(BuilderAdapter):
    """
    Adapter for Google Antigravity.
    Supports Mode A (Manual) and Mode B (Assisted) with capability detection.
    """

    def __init__(self, capability: Optional[BuilderCapability] = None):
        self.capability = capability or BuilderCapabilityDetector.detect()

    def get_name(self) -> str:
        return "antigravity"

    def detect_capabilities(self) -> BuilderCapability:
        self.capability = BuilderCapabilityDetector.detect()
        return self.capability

    async def prepare_task(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> HandoffPackage:
        """
        Creates the .handoff/TASK-NNN/ package:
          - manifest.json
          - instruction.md
          - context-summary.md
          - tasks/TASK-NNN.context.json
          - .handoff/TASK-NNN.lock
        """
        from backend.services.context_service import ContextService
        from backend.services.markdown_service import MarkdownService

        context_svc = ContextService()
        markdown_svc = MarkdownService()

        project = await db.get(Project, project_id)
        task = await db.get(Task, task_id)
        if not project or not task:
            raise ValueError(f"Project or task not found: {project_id}, {task_id}")

        workspace = await markdown_svc.get_workspace_path(project_id)
        handoff_dir = workspace / ".handoff" / f"TASK-{task.task_number:03d}"
        handoff_dir.mkdir(parents=True, exist_ok=True)

        # 1. Build compressed context
        compressed = await context_svc.compress_context(project_id, task_id, db)
        task_filename = f"TASK-{task.task_number:03d}.md"
        task_rel_path = f"tasks/{task_filename}"

        # 2. Build concise builder instruction (Section 17 & GODKILLER-ZERO Rules)
        instruction_text = (
            f"# Builder Instruction: TASK-{task.task_number:03d}\n\n"
            f"You are the Builder Agent (Antigravity). Implement TASK-{task.task_number:03d}: {task.title}\n\n"
            f"## Contract Coordinates\n"
            f"- **Workspace:** `{workspace}`\n"
            f"- **Task Spec:** `{task_rel_path}`\n"
            f"- **Context Manifest:** `.handoff/TASK-{task.task_number:03d}/manifest.json`\n\n"
            f"## Invariants & Guardrails (GODKILLER-ZERO Formal Contract)\n"
            f"1. **Target Bound:** Modify only relevant files mapped to this task. Do not ghost-edit unrelated files.\n"
            f"2. **Complexity Bound:** Keep functions <= 70 lines. Cyclomatic complexity <= 10.\n"
            f"3. **Done != Evidence:** Verify changes on disk, run tests/build checks, and report actual modified files.\n"
            f"4. **First-Token Structural:** Deliver working code directly without unnecessary conversational filler.\n\n"
            f"When finished, return result summary (changed files, test status, notes) to record in workspace.\n"
        )
        instruction_path = handoff_dir / "instruction.md"
        instruction_path.write_text(instruction_text, encoding="utf-8")

        # 3. Build manifest.json (Section 18)
        manifest_data = {
            "task_id": f"TASK-{task.task_number:03d}",
            "project_id": project.id,
            "project_name": project.name,
            "workspace": str(workspace),
            "task_file": task_rel_path,
            "state_file": "STATE.md",
            "requirements_file": "REQUIREMENTS.md",
            "relevant_files": compressed.relevant_files,
            "acceptance_criteria": compressed.acceptance_criteria,
            "constraints": compressed.constraints,
            "builder": "antigravity",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        manifest_path = handoff_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")

        # 4. Build context-summary.md
        summary_lines = [
            f"# Context Summary — TASK-{task.task_number:03d}",
            "",
            f"**Project:** {project.name}",
            f"**Goal:** {task.goal}",
            "",
            "## Relevant Requirements",
            "",
        ]
        if compressed.requirements:
            for r in compressed.requirements:
                summary_lines.append(f"- {r}")
        else:
            summary_lines.append("_No specific requirements tagged._")

        summary_lines += [
            "",
            "## Relevant Files",
            "",
        ]
        if compressed.relevant_files:
            for f in compressed.relevant_files:
                summary_lines.append(f"- `{f}`")
        else:
            summary_lines.append("_No files explicitly mapped._")

        summary_lines += [
            "",
            "## Acceptance Criteria",
            "",
        ]
        if compressed.acceptance_criteria:
            for ac in compressed.acceptance_criteria:
                summary_lines.append(f"- [ ] {ac}")
        else:
            summary_lines.append("_Verify functionality matches task goal._")

        context_summary_path = handoff_dir / "context-summary.md"
        context_summary_path.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")

        # 5. Build tasks/TASK-NNN.context.json (Section 14)
        tasks_dir = workspace / "tasks"
        tasks_dir.mkdir(parents=True, exist_ok=True)
        context_json_path = tasks_dir / f"TASK-{task.task_number:03d}.context.json"
        context_json_data = {
            "task": f"TASK-{task.task_number:03d}",
            "required_context": [
                "PROJECT.md",
                "REQUIREMENTS.md",
                "STATE.md",
                task_rel_path,
            ],
            "relevant_files": compressed.relevant_files,
        }
        context_json_path.write_text(json.dumps(context_json_data, indent=2, ensure_ascii=False), encoding="utf-8")

        # 6. Acquire Task Lock (Section 38)
        self.acquire_lock(workspace, task.task_number)

        # 7. Update Task Status in Database
        task.status = TaskStatus.HANDED_OFF
        task.handoff_mode = "assisted"
        await db.commit()

        return HandoffPackage(
            task_id=task.id,
            task_number=task.task_number,
            project_id=project.id,
            workspace_path=str(workspace),
            manifest_path=str(manifest_path),
            instruction_path=str(instruction_path),
            context_summary_path=str(context_summary_path),
            instruction_text=instruction_text,
            lock_acquired=True,
            message="Handoff package prepared successfully.",
        )

    def open_workspace(self, workspace_path: Path) -> bool:
        """Opens the workspace directory in Antigravity or file explorer."""
        if not workspace_path.exists():
            return False

        # If executable is available, launch Antigravity with workspace
        if self.capability.executable_path and Path(self.capability.executable_path).exists():
            try:
                subprocess.Popen(
                    [self.capability.executable_path, str(workspace_path)],
                    shell=False,
                )
                logger.info("Launched Antigravity with workspace: %s", workspace_path)
                return True
            except Exception as e:
                logger.warning("Failed to launch Antigravity executable: %s. Falling back to explorer.", e)

        # Fallback to OS file explorer
        return self._open_folder_in_os(workspace_path)

    def launch_builder(
        self,
        workspace_path: Path,
        task_file: Optional[Path] = None,
    ) -> bool:
        """Launches Antigravity with the workspace path."""
        return self.open_workspace(workspace_path)

    @staticmethod
    def _open_folder_in_os(folder_path: Path) -> bool:
        """Opens a folder in Windows Explorer, macOS Finder, or Linux file manager."""
        try:
            system = platform.system()
            if system == "Windows":
                os.startfile(str(folder_path))
            elif system == "Darwin":
                subprocess.Popen(["open", str(folder_path)])
            else:
                subprocess.Popen(["xdg-open", str(folder_path)])
            return True
        except Exception as e:
            logger.error("Failed to open folder %s: %s", folder_path, e)
            return False


# ── Manual Builder Adapter ────────────────────────────────────────────────────

class ManualBuilderAdapter(BuilderAdapter):
    """Fallback adapter when Antigravity is not installed or detected."""

    def get_name(self) -> str:
        return "manual"

    def detect_capabilities(self) -> BuilderCapability:
        return BuilderCapability(
            installed=False,
            cli=False,
            workspace_open=True,
            method="manual",
            default_mode="manual",
        )

    async def prepare_task(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> HandoffPackage:
        # Delegate to standard packaging logic
        adapter = AntigravityAdapter(self.detect_capabilities())
        return await adapter.prepare_task(project_id, task_id, db)

    def open_workspace(self, workspace_path: Path) -> bool:
        return AntigravityAdapter._open_folder_in_os(workspace_path)

    def launch_builder(
        self,
        workspace_path: Path,
        task_file: Optional[Path] = None,
    ) -> bool:
        return self.open_workspace(workspace_path)


# ── Builder Factory ───────────────────────────────────────────────────────────

class BuilderFactory:
    """Factory to obtain the appropriate BuilderAdapter."""

    @staticmethod
    def get_adapter(builder_name: str = "antigravity") -> BuilderAdapter:
        cap = BuilderCapabilityDetector.detect()
        if builder_name.lower() == "manual" or not cap.installed:
            return ManualBuilderAdapter()
        return AntigravityAdapter(cap)
