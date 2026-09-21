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
    tasks/
      TASK-001.md     — individual task brief
      TASK-002.md     ...

⚠️  API keys are NEVER written into any markdown file.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config import settings
from backend.models.project import (
    Decision,
    Project,
    Requirement,
    Task,
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

        Args:
            project_id:         Project UUID.
            db:                 Database session.
            architecture_notes: Optional notes from the planner's plan.

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
        }

    async def generate_task_file(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> str:
        """
        Generate markdown content for a single task.

        Args:
            project_id: Project UUID.
            task_id:    Task UUID.
            db:         Database session.

        Returns:
            Markdown string for TASK-NNN.md.
        """
        project = await db.get(Project, project_id)
        task = await db.get(Task, task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")

        return self._render_task(project, task)

    async def save_all_files(
        self,
        project_id: str,
        db: AsyncSession,
        architecture_notes: str = "",
    ) -> None:
        """
        Generate and write all project files to workspace/{project_id}/.

        Also generates individual TASK-NNN.md files.
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

        for task in tasks:
            content = self._render_task(project, task)
            filename = f"TASK-{task.task_number:03d}.md"
            path = tasks_dir / filename
            path.write_text(content, encoding="utf-8")

            # Update task with md_path
            task.md_path = str(path)
            logger.info("Wrote %s", path)

        await db.commit()

    async def get_workspace_path(self, project_id: str) -> Path:
        """
        Return (and create) the workspace directory for a project.

        Returns:
            Absolute Path to workspace/{project_id}/
        """
        workspace = settings.get_workspace_path() / project_id
        workspace.mkdir(parents=True, exist_ok=True)
        return workspace

    # ── Render helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _render_project(project: Project) -> str:
        created = project.created_at.strftime("%Y-%m-%d %H:%M UTC")
        updated = project.updated_at.strftime("%Y-%m-%d %H:%M UTC") if project.updated_at else created
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

        # Group by category
        grouped: dict[str, list[Requirement]] = {}
        for req in requirements:
            grouped.setdefault(req.category, []).append(req)

        lines = ["# Requirements\n"]
        for category, reqs in sorted(grouped.items()):
            lines.append(f"## {category.title()}\n")
            for req in reqs:
                status_badge = f"`{req.status.value}`"
                priority_badge = f"`{req.priority.value}`"
                lines.append(
                    f"- {status_badge} {priority_badge} {req.content}"
                )
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
        done = sum(1 for t in tasks if t.status.value == "DONE")
        total = len(tasks)
        progress = f"{done}/{total}" if total else "0/0"

        lines = [
            f"# State — {project.name}",
            "",
            f"**Status:** `{project.status.value}`",
            f"**Task Progress:** {progress}",
            "",
            "## Task Status",
            "",
        ]

        for task in tasks:
            icon = {
                "DONE": "✅",
                "IN_PROGRESS": "🔄",
                "FAILED": "❌",
                "PENDING": "⬜",
            }.get(task.status.value, "⬜")
            lines.append(f"- {icon} TASK-{task.task_number:03d}: {task.title}")

        return "\n".join(lines) + "\n"

    @staticmethod
    def _render_tasks_index(tasks: list[Task]) -> str:
        if not tasks:
            return "# Tasks\n\n_No tasks generated yet._\n"

        lines = ["# Tasks\n", "| # | Title | Status |", "|---|-------|--------|"]
        for task in tasks:
            lines.append(
                f"| TASK-{task.task_number:03d} | {task.title} | `{task.status.value}` |"
            )

        return "\n".join(lines) + "\n"

    @staticmethod
    def _render_task(project: Optional[Project], task: Task) -> str:
        project_name = project.name if project else "Unknown Project"
        return f"""\
# TASK-{task.task_number:03d}: {task.title}

**Project:** {project_name}
**Status:** `{task.status.value}`

## Goal

{task.goal or "_No goal specified._"}

## Implementation Notes

_To be filled by AI Builder (Antigravity)._

## Acceptance Criteria

_To be defined during planning._

## Files Changed

_Updated by AI Builder upon completion._
"""
