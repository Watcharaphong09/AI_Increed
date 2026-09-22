"""
Context Service — Builds optimised, compressed context for AI Builder tasks.

Rules enforced:
  - Conversation history is NEVER included in task context.
  - Only requirements relevant to the specific task are included.
  - Completed old-task details are omitted; only acceptance criteria remain.
  - Constraints and relevant file paths are always preserved.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config import settings
from backend.models.project import Project, Requirement, Task, TaskStatus

logger = logging.getLogger(__name__)


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class CompressedContext:
    project_name: str
    project_description: str
    task_title: str
    task_goal: str
    requirements: list[str] = field(default_factory=list)
    relevant_files: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    completed_tasks_summary: list[str] = field(default_factory=list)
    acceptance_criteria: list[str] = field(default_factory=list)


@dataclass
class ContextPreview:
    """Context summary prior to handing off to builder (Section 44)."""
    task_id: str
    task_number: int
    task_title: str
    estimated_tokens: int
    file_count: int
    included_files: list[str] = field(default_factory=list)
    excluded_files: list[str] = field(default_factory=list)
    builder_instructions: str = ""
    is_budget_exceeded: bool = False
    budget_limit: int = 3500


# ── Service ───────────────────────────────────────────────────────────────────

class ContextService:
    """Builds minimal, focused context for each task sent to the AI Builder."""

    async def compress_context(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> CompressedContext:
        """
        Build a compressed context object for a specific task.

        Args:
            project_id: Project UUID.
            task_id:    Task UUID.
            db:         Database session.

        Returns:
            CompressedContext ready to be serialised into markdown.
        """
        # Load project
        project = await db.get(Project, project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Load target task
        task = await db.get(Task, task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")

        # Load relevant requirements
        relevant_reqs = await self.get_relevant_requirements(project_id, task_id, db)

        # Load relevant files
        relevant_files = await self.get_relevant_files(project_id, task_id, db)

        # Load completed tasks for summary
        result = await db.execute(
            select(Task).where(
                Task.project_id == project_id,
                Task.status.in_([TaskStatus.COMPLETED, TaskStatus.DONE]),
                Task.task_number < task.task_number,
            )
        )
        completed = result.scalars().all()

        completed_summaries = [
            f"TASK-{t.task_number:03d}: {t.title} ✓" for t in completed
        ]

        # Separate constraints from normal requirements
        constraints = [
            r.content
            for r in relevant_reqs
            if r.priority == "BLOCKING" and "constraint" in r.category.lower()
        ]

        req_texts = [
            f"[{r.priority}] {r.category}: {r.content}"
            for r in relevant_reqs
        ]

        return CompressedContext(
            project_name=project.name,
            project_description=project.description,
            task_title=task.title,
            task_goal=task.goal,
            requirements=req_texts,
            relevant_files=relevant_files,
            constraints=constraints,
            completed_tasks_summary=completed_summaries,
            acceptance_criteria=[],  # populated from task detail if stored
        )

    async def get_relevant_requirements(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> list[Requirement]:
        """
        Return requirements relevant to the given task.

        Current strategy: return all CONFIRMED and DEFAULTED requirements.
        Future: use embeddings for semantic filtering.
        """
        from backend.models.project import RequirementStatus

        result = await db.execute(
            select(Requirement).where(
                Requirement.project_id == project_id,
                Requirement.status.in_([
                    RequirementStatus.CONFIRMED,
                    RequirementStatus.DEFAULTED,
                    RequirementStatus.PROPOSED,
                ]),
            )
        )
        return result.scalars().all()

    async def get_relevant_files(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> list[str]:
        """
        Return file paths relevant to the task (from workspace directory).

        Returns relative paths as strings.
        """
        from backend.services.markdown_service import MarkdownService
        markdown_svc = MarkdownService()
        workspace = await markdown_svc.get_workspace_path(project_id, db)
        if not workspace.exists():
            return []

        relevant: list[str] = []
        # Always include top-level .md files
        for md_file in workspace.glob("*.md"):
            relevant.append(str(md_file.relative_to(workspace)))

        # Include task file if it exists
        task = await db.get(Task, task_id)
        if task and task.md_path:
            task_path = Path(task.md_path)
            if task_path.exists():
                try:
                    relevant.append(str(task_path.relative_to(workspace)))
                except ValueError:
                    relevant.append(task.md_path)

        return sorted(set(relevant))

    async def build_task_context(
        self,
        project_id: str,
        task_number: int,
        db: AsyncSession,
    ) -> str:
        """
        Build a complete markdown context string for the given task number.

        Args:
            project_id:  Project UUID.
            task_number: 1-based task number.
            db:          Database session.

        Returns:
            Markdown-formatted string for the AI Builder.
        """
        # Resolve task by number
        result = await db.execute(
            select(Task).where(
                Task.project_id == project_id,
                Task.task_number == task_number,
            )
        )
        task = result.scalar_one_or_none()
        if not task:
            raise ValueError(
                f"Task number {task_number} not found in project {project_id}"
            )

        ctx = await self.compress_context(project_id, task.id, db)
        return self._render_markdown(ctx)

    async def get_context_preview(
        self,
        project_id: str,
        task_id: str,
        db: AsyncSession,
    ) -> ContextPreview:
        """
        Builds a preview of the context package that will be sent to the builder (Section 44).
        Includes estimated token count, included files, and excluded items.
        """
        task = await db.get(Task, task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")

        ctx = await self.compress_context(project_id, task_id, db)
        rendered_md = self._render_markdown(ctx)
        est_tokens = self.estimate_tokens(rendered_md)

        # Standard included files
        included = [
            f"tasks/TASK-{task.task_number:03d}.md",
            "STATE.md",
            "REQUIREMENTS.md",
            "PROJECT.md",
        ]
        if ctx.relevant_files:
            for f in ctx.relevant_files:
                if f not in included:
                    included.append(f)

        # Excluded items
        excluded = [
            "Old user-planner conversations (chat history)",
            "Completed task full logs / history",
            "Unrelated source files and architecture notes",
            "Secrets and environment variables (.env)",
        ]

        instruction_text = (
            f"Implement TASK-{task.task_number:03d}: {task.title}\n"
            f"Read: tasks/TASK-{task.task_number:03d}.md and .handoff/TASK-{task.task_number:03d}/manifest.json\n"
            f"Do not modify unrelated features."
        )

        budget_limit = 3500
        return ContextPreview(
            task_id=task.id,
            task_number=task.task_number,
            task_title=task.title,
            estimated_tokens=est_tokens,
            file_count=len(included),
            included_files=included,
            excluded_files=excluded,
            builder_instructions=instruction_text,
            is_budget_exceeded=est_tokens > budget_limit,
            budget_limit=budget_limit,
        )

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Heuristic token estimation: ~3.5 chars per token for mixed Thai/English/Code."""
        if not text:
            return 0
        return max(1, int(len(text) / 3.5))

    # ── Private ───────────────────────────────────────────────────────────────

    @staticmethod
    def _render_markdown(ctx: CompressedContext) -> str:
        """Convert a CompressedContext into a markdown string."""
        lines: list[str] = [
            f"# Task Context: {ctx.task_title}",
            "",
            f"**Project:** {ctx.project_name}",
            f"**Description:** {ctx.project_description}",
            "",
            f"## Goal",
            ctx.task_goal,
            "",
        ]

        if ctx.acceptance_criteria:
            lines += ["## Acceptance Criteria", ""]
            for ac in ctx.acceptance_criteria:
                lines.append(f"- {ac}")
            lines.append("")

        if ctx.requirements:
            lines += ["## Relevant Requirements", ""]
            for req in ctx.requirements:
                lines.append(f"- {req}")
            lines.append("")

        if ctx.constraints:
            lines += ["## Constraints", ""]
            for c in ctx.constraints:
                lines.append(f"- ⚠️ {c}")
            lines.append("")

        if ctx.completed_tasks_summary:
            lines += ["## Completed Tasks (Reference)", ""]
            for t in ctx.completed_tasks_summary:
                lines.append(f"- {t}")
            lines.append("")

        if ctx.relevant_files:
            lines += ["## Relevant Files", ""]
            for f in ctx.relevant_files:
                lines.append(f"- `{f}`")
            lines.append("")

        lines += [
            "---",
            "> ⚠️ Do NOT include conversation history in your response.",
            "> Focus solely on implementing the goal above.",
        ]

        return "\n".join(lines)
