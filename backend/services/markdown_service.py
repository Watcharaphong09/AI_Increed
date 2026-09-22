"""
Markdown Service — Generates and persists workspace .md files for AI_Increed.

Generated files per project:
  workspace/{project_id}/
    PROJECT.md        — overview, status, description
    REQUIREMENTS.md   — all requirements grouped by category
    ARCHITECTURE.md   — architecture notes from the plan
    DECISIONS.md      — all architectural decisions
    STATE.md          — current project state snapshot
    TASKS.md          — task index
    CHANGELOG.md      — build changelog entries
    tasks/
      TASK-001.md     — task spec with YAML Frontmatter
      TASK-001.context.json — builder context manifest
    tasks/results/
      TASK-001.result.md — builder execution results

⚠️  API keys are NEVER written into any markdown file.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config import settings
from backend.models.project import (
    Decision,
    Project,
    Requirement,
    Task,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class MarkdownService:
    """Generates and writes markdown workspace files for a project."""

    # ── Public API ────────────────────────────────────────────────────────────

    async def generate_project_files(
        self,
        project_id: str,
        db: AsyncSession,
        architecture_notes: str = "",
    ) -> dict[str, str]:
        """
        Generate all project-level markdown files.

        Returns:
            Dict mapping filename → content strings.
        """
        project = await db.get(Project, project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Load related data
        reqs_result = await db.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        )
        requirements = reqs_result.scalars().all()

        dec_result = await db.execute(
            select(Decision).where(Decision.project_id == project_id)
        )
        decisions = dec_result.scalars().all()

        tasks_result = await db.execute(
            select(Task)
            .where(Task.project_id == project_id)
            .order_by(Task.task_number)
        )
        tasks = tasks_result.scalars().all()

        return {
            "PROJECT.md": self._render_project(project),
            "REQUIREMENTS.md": self._render_requirements(requirements),
            "ARCHITECTURE.md": self._render_architecture(project, architecture_notes),
            "DECISIONS.md": self._render_decisions(decisions),
            "STATE.md": self._render_state(project, tasks),
            "TASKS.md": self._render_tasks_index(tasks),
            "CHANGELOG.md": self._render_changelog(project, tasks),
        }

    async def generate_task_file(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> str:
        """Generate markdown content for a single task with YAML Frontmatter."""
        project = await db.get(Project, project_id)
        task = await db.get(Task, task_id)
        if not project or not task:
            raise ValueError(f"Project {project_id} or task {task_id} not found")

        # Load relevant context
        from backend.services.context_service import ContextService
        context_svc = ContextService()
        compressed = await context_svc.compress_context(project_id, task_id, db)

        return self._render_task(project, task, compressed)

    async def save_all_files(
        self,
        project_id: str,
        db: AsyncSession,
        architecture_notes: str = "",
    ) -> None:
        """
        Generate and write all project files to workspace/{project_id}/.
        Generates individual TASK-NNN.md and TASK-NNN.context.json files.
        """
        workspace = await self.get_workspace_path(project_id)

        # Write project-level files
        files = await self.generate_project_files(project_id, db, architecture_notes)
        for filename, content in files.items():
            path = workspace / filename
            path.write_text(content, encoding="utf-8")
            logger.info("Wrote %s", path)

        # Write individual task files
        tasks_dir = workspace / "tasks"
        tasks_dir.mkdir(parents=True, exist_ok=True)

        tasks_result = await db.execute(
            select(Task)
            .where(Task.project_id == project_id)
            .order_by(Task.task_number)
        )
        tasks = tasks_result.scalars().all()
        project = await db.get(Project, project_id)

        from backend.services.context_service import ContextService
        context_svc = ContextService()

        for task in tasks:
            compressed = await context_svc.compress_context(project_id, task.id, db)
            content = self._render_task(project, task, compressed)
            filename = f"TASK-{task.task_number:03d}.md"
            path = tasks_dir / filename
            path.write_text(content, encoding="utf-8")

            # Write tasks/TASK-NNN.context.json (Section 14)
            context_json_path = tasks_dir / f"TASK-{task.task_number:03d}.context.json"
            context_manifest = {
                "task": f"TASK-{task.task_number:03d}",
                "required_context": [
                    "PROJECT.md",
                    "REQUIREMENTS.md",
                    "STATE.md",
                    f"tasks/{filename}",
                ],
                "relevant_files": compressed.relevant_files,
                "acceptance_criteria": compressed.acceptance_criteria,
            }
            context_json_path.write_text(
                json.dumps(context_manifest, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

            # Update task with md_path
            task.md_path = str(path)
            logger.info("Wrote %s", path)

        await db.commit()

    async def record_build_result(
        self,
        project_id: str,
        task_id: str,
        result_status: str,
        changed_files: list[str],
        tests_status: str,
        notes: str,
        raw_markdown: str,
        db: AsyncSession,
    ) -> Task:
        """
        Ingests the result reported back from Antigravity/Builder:
          1. Saves tasks/results/TASK-NNN.result.md
          2. Updates Task status in SQLite
          3. Releases lock file
          4. Updates STATE.md, CHANGELOG.md, and TASKS.md
        """
        project = await db.get(Project, project_id)
        task = await db.get(Task, task_id)
        if not project or not task:
            raise ValueError(f"Project {project_id} or Task {task_id} not found")

        workspace = await self.get_workspace_path(project_id)

        # 1. Write tasks/results/TASK-NNN.result.md
        results_dir = workspace / "tasks" / "results"
        results_dir.mkdir(parents=True, exist_ok=True)
        result_file = results_dir / f"TASK-{task.task_number:03d}.result.md"

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        if not raw_markdown.strip():
            changed_list = "\n".join(f"- {f}" for f in changed_files) if changed_files else "- None reported"
            raw_markdown = f"""# Build Result

Task: TASK-{task.task_number:03d}
Status: {result_status.upper()}
Timestamp: {now_str}

## Changed Files

{changed_list}

## Tests

{tests_status or "Not specified"}

## Notes

{notes or "Implementation completed."}
"""

        result_file.write_text(raw_markdown, encoding="utf-8")
        logger.info("Wrote build result: %s", result_file)

        # 2. Update Task model
        status_map = {
            "COMPLETED": TaskStatus.COMPLETED,
            "DONE": TaskStatus.COMPLETED,
            "FAILED": TaskStatus.FAILED,
            "CHANGES_REQUIRED": TaskStatus.CHANGES_REQUIRED,
            "NEEDS_ATTENTION": TaskStatus.NEEDS_ATTENTION,
        }
        task.status = status_map.get(result_status.upper(), TaskStatus.COMPLETED)
        task.result_summary = notes or f"Result: {result_status}"

        # 3. Release Lock file
        from backend.services.builder_adapter import BuilderFactory
        adapter = BuilderFactory.get_adapter()
        adapter.release_lock(workspace, task.task_number)

        # 4. Refresh project state & changelog
        tasks_result = await db.execute(
            select(Task).where(Task.project_id == project_id).order_by(Task.task_number)
        )
        all_tasks = tasks_result.scalars().all()

        # Update STATE.md
        state_content = self._render_state(project, all_tasks)
        (workspace / "STATE.md").write_text(state_content, encoding="utf-8")

        # Update CHANGELOG.md
        changelog_content = self._render_changelog(project, all_tasks)
        (workspace / "CHANGELOG.md").write_text(changelog_content, encoding="utf-8")

        # Update TASKS.md
        tasks_content = self._render_tasks_index(all_tasks)
        (workspace / "TASKS.md").write_text(tasks_content, encoding="utf-8")

        await db.commit()
        return task

    async def get_workspace_path(self, project_id: str, db: Optional[AsyncSession] = None) -> Path:
        """Return (and create) the workspace directory for a project under WORKSPACE_DIR."""
        import re
        base_dir = settings.get_workspace_path()
        base_dir.mkdir(parents=True, exist_ok=True)

        folder_name = project_id

        # Try to resolve friendly project name for clean directory naming
        project = None
        if db:
            project = await db.get(Project, project_id)
        else:
            try:
                from backend.database import AsyncSessionLocal
                async with AsyncSessionLocal() as session:
                    project = await session.get(Project, project_id)
            except Exception:
                pass

        if project and project.name:
            # Clean name for filesystem safety
            safe_name = re.sub(r'[\\/*?:"<>|]+', '_', project.name).strip()
            if safe_name:
                folder_name = safe_name

        workspace = base_dir / folder_name

        # Safeguard: never use the orchestrator repository itself as project workspace
        try:
            increed_root = Path(__file__).resolve().parents[2]
            if workspace.resolve() == increed_root.resolve():
                workspace = base_dir / f"{folder_name}_workspace"
        except Exception:
            pass

        workspace.mkdir(parents=True, exist_ok=True)
        return workspace

    # ── Render helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _render_project(project: Project) -> str:
        created = project.created_at.strftime("%Y-%m-%d %H:%M UTC")
        updated = (
            project.updated_at.strftime("%Y-%m-%d %H:%M UTC")
            if project.updated_at
            else created
        )
        return f"""\
# {project.name}

## Overview

| Field | Value |
|-------|-------|
| Status | `{project.status.value}` |
| Planning Mode | `{project.planning_mode.value}` |
| Complexity Score | `{project.complexity_score:.0f} / 100` |
| Created | {created} |
| Updated | {updated} |

## Description

{project.description or "_No description provided._"}
"""

    @staticmethod
    def _render_requirements(requirements: list[Requirement]) -> str:
        if not requirements:
            return "# Requirements\n\n_No requirements yet._\n"

        grouped: dict[str, list[Requirement]] = {}
        for req in requirements:
            grouped.setdefault(req.category, []).append(req)

        lines = ["# Requirements\n"]
        for category, reqs in sorted(grouped.items()):
            lines.append(f"## {category.title()}\n")
            for req in reqs:
                status_badge = f"`{req.status.value}`"
                priority_badge = f"`{req.priority.value}`"
                lines.append(f"- {status_badge} {priority_badge} {req.content}")
                if req.notes:
                    lines.append(f"  > {req.notes}")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def _render_architecture(project: Project, notes: str) -> str:
        return f"""\
# Architecture — {project.name}

## Notes

{notes or "_Architecture notes will be populated after planning is complete._"}
"""

    @staticmethod
    def _render_decisions(decisions: list[Decision]) -> str:
        if not decisions:
            return "# Decisions\n\n_No decisions recorded yet._\n"

        lines = ["# Architectural Decisions\n"]
        for i, dec in enumerate(decisions, 1):
            lines += [
                f"## {i}. {dec.topic}",
                "",
                f"**Decision:** {dec.decision}",
                "",
                f"**Reason:** {dec.reason}",
                "",
            ]
            if dec.alternatives:
                lines += [f"**Alternatives considered:** {dec.alternatives}", ""]
            if dec.impact:
                lines += [f"**Impact:** {dec.impact}", ""]
            lines.append("---\n")

        return "\n".join(lines)

    @staticmethod
    def _render_state(project: Project, tasks: list[Task]) -> str:
        """Renders STATE.md matching Section 23 & 25 of specification."""
        completed_tasks = [t for t in tasks if t.status in (TaskStatus.COMPLETED, TaskStatus.DONE)]
        building_tasks = [
            t for t in tasks
            if t.status in (TaskStatus.BUILDING, TaskStatus.HANDED_OFF, TaskStatus.HANDOFF_PENDING, TaskStatus.IN_PROGRESS)
        ]
        pending_tasks = [
            t for t in tasks
            if t.status in (TaskStatus.READY, TaskStatus.APPROVED, TaskStatus.DRAFT, TaskStatus.PENDING)
        ]

        current_task_str = f"TASK-{building_tasks[0].task_number:03d} ({building_tasks[0].title})" if building_tasks else "None"
        last_completed_str = f"TASK-{completed_tasks[-1].task_number:03d} ({completed_tasks[-1].title})" if completed_tasks else "None"

        lines = [
            f"# State — {project.name}",
            "",
            f"**Project Status:** `{project.status.value}`",
            f"**Current Task:** {current_task_str}",
            f"**Last Completed:** {last_completed_str}",
            f"**Progress:** {len(completed_tasks)}/{len(tasks)} tasks completed",
            "",
            "## Completed",
            "",
        ]

        if completed_tasks:
            for t in completed_tasks:
                lines.append(f"- [x] TASK-{t.task_number:03d}: {t.title}")
        else:
            lines.append("_No tasks completed yet._")

        lines += [
            "",
            "## In Progress",
            "",
        ]

        if building_tasks:
            for t in building_tasks:
                lines.append(f"- [ ] 🔄 TASK-{t.task_number:03d}: {t.title} (`{t.status.value}`)")
        else:
            lines.append("_No tasks currently in progress._")

        lines += [
            "",
            "## Pending",
            "",
        ]

        if pending_tasks:
            for t in pending_tasks:
                lines.append(f"- [ ] TASK-{t.task_number:03d}: {t.title} (`{t.status.value}`)")
        else:
            lines.append("_No pending tasks._")

        return "\n".join(lines) + "\n"

    @staticmethod
    def _render_tasks_index(tasks: list[Task]) -> str:
        if not tasks:
            return "# Tasks\n\n_No tasks generated yet._\n"

        lines = ["# Tasks\n", "| # | Title | Priority | Status |", "|---|-------|----------|--------|"]
        for task in tasks:
            lines.append(
                f"| TASK-{task.task_number:03d} | {task.title} | `{task.priority}` | `{task.status.value}` |"
            )

        return "\n".join(lines) + "\n"

    @staticmethod
    def _render_changelog(project: Project, tasks: list[Task]) -> str:
        """Renders CHANGELOG.md matching Section 25."""
        completed = [t for t in tasks if t.status in (TaskStatus.COMPLETED, TaskStatus.DONE)]
        lines = [
            f"# Changelog — {project.name}",
            "",
            f"> Automatically updated when Builder completes tasks.",
            "",
        ]
        if not completed:
            lines.append("_No changelog entries yet._\n")
            return "\n".join(lines)

        for t in reversed(completed):
            summary = t.result_summary or t.goal or t.title
            lines += [
                f"## TASK-{t.task_number:03d}: {t.title}",
                "",
                f"{summary}",
                "",
                f"- **Status:** Completed",
                f"- **Builder:** {t.builder}",
                "",
                "---",
                "",
            ]
        return "\n".join(lines)

    @staticmethod
    def _render_task(
        project: Optional[Project],
        task: Task,
        compressed: Any = None,
    ) -> str:
        """
        Renders TASK-NNN.md with YAML Frontmatter and structured sections
        matching Sections 12 & 13 of the specification.
        """
        project_name = project.name if project else "Unknown Project"
        project_id = project.id if project else ""
        planning_mode = project.planning_mode.value if project else "DETAILED"
        created_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # YAML Frontmatter (Section 12)
        frontmatter = f"""---
task_id: TASK-{task.task_number:03d}
project_id: {project_id}
status: {task.status.value}
priority: {task.priority}
planning_mode: {planning_mode}
created_at: {created_date}
approved: true
builder: {task.builder}
---"""

        req_lines = []
        if compressed and compressed.requirements:
            for r in compressed.requirements:
                req_lines.append(f"- {r}")
        else:
            req_lines.append(f"- {task.goal or task.title}")

        files_lines = []
        if compressed and compressed.relevant_files:
            for f in compressed.relevant_files:
                files_lines.append(f"- `{f}`")
        else:
            files_lines.append("- _Relevant files determined during implementation._")

        ac_lines = []
        if compressed and compressed.acceptance_criteria:
            for ac in compressed.acceptance_criteria:
                ac_lines.append(f"- [ ] {ac}")
        else:
            ac_lines.append(f"- [ ] Functionality operates as specified in goal.")
            ac_lines.append(f"- [ ] No unrelated features are broken.")

        constraints_lines = []
        if compressed and compressed.constraints:
            for c in compressed.constraints:
                constraints_lines.append(f"- {c}")
        else:
            constraints_lines.append("- Preserve existing architecture and conventions.")
            constraints_lines.append("- Do not modify unrelated components.")

        # Formal Hoare Contract (GODKILLER-ZERO §3.2)
        target_files_str = ", ".join(compressed.relevant_files) if compressed and compressed.relevant_files else "Discovered during task implementation"
        pre_cond = f"Project in {planning_mode} mode. Feature '{task.title}' pending implementation."
        post_cond = "; ".join(compressed.acceptance_criteria) if compressed and compressed.acceptance_criteria else f"Functionality '{task.title}' operational and verified."

        hoare_contract = f"""```tla
!AI_INCREED:HOARE_CONTRACT
TARGET_COORDINATES       :: [{target_files_str}]
PRE_CONDITION {{P}}        :: {pre_cond}
COMMAND C                :: Implement TASK-{task.task_number:03d}: {task.goal or task.title}
POST_CONDITION {{Q}}       :: {post_cond}
INVARIANT_ASSERTIONS [I] :: [
  /\\ Scope Boundary: Strictly FORBIDDEN from refactoring unrelated modules or ghost files.
  /\\ Quality Bound: Maximum function span: 70 lines. Cyclomatic complexity <= 10.
  /\\ Zero Speculation: Follow requirements explicitly, do not fabricate APIs.
  /\\ Token & Screenshot Policy: Prioritize terminal build and test logs. Strictly FORBIDDEN from spamming repeated screenshots in a loop (burns tokens). Laptop display scaling (80%-100%) is acceptable; DO NOT loop over micro-adjustments.
  /\\ Exit Criteria: DONE IS NOT EVIDENCE. Verify files on disk and ensure build/tests pass.
]
```"""

        body = f"""
# TASK-{task.task_number:03d}: {task.title}

## Status

`{task.status.value}`

## Goal

{task.goal or task.title}

## Context

- **Project:** {project_name}
- **Planning Mode:** {planning_mode}
- **Priority:** {task.priority}

## Formal Contract (Hoare Logic)

{hoare_contract}

## Requirements

{chr(10).join(req_lines)}

## Relevant Files

{chr(10).join(files_lines)}

## Acceptance Criteria

{chr(10).join(ac_lines)}

## Constraints

{chr(10).join(constraints_lines)}

## Builder Instructions

1. Implement only this task according to the formal contract and acceptance criteria.
2. Read the relevant project files and `.handoff/TASK-{task.task_number:03d}/manifest.json` before modifying code.
3. Work inside the assigned project workspace boundary.
4. Run appropriate tests/build checks after implementation.
5. Report changed files, test results, and final status when done.
"""
        return frontmatter + "\n" + body
