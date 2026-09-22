"""
Tasks router — Task management and context generation.

Endpoints:
  GET  /api/tasks/{project_id}                      — list tasks
  POST /api/tasks/{project_id}/generate             — generate task .md files
  GET  /api/tasks/{project_id}/{task_id}            — get task detail
  GET  /api/tasks/{project_id}/{task_id}/context    — get compressed context
  PUT  /api/tasks/{project_id}/{task_id}/status     — update task status
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models.project import Project, Task, TaskStatus
from backend.services.context_service import ContextService
from backend.services.markdown_service import MarkdownService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tasks", tags=["tasks"])

context_service = ContextService()
markdown_service = MarkdownService()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class TaskOut(BaseModel):
    id: str
    project_id: str
    task_number: int
    title: str
    goal: str
    status: str
    priority: str = "HIGH"
    builder: str = "antigravity"
    handoff_mode: str = "assisted"
    md_path: Optional[str] = ""
    result_summary: Optional[str] = ""

    model_config = {"from_attributes": True}


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskContextOut(BaseModel):
    project_id: str
    task_id: str
    task_number: int
    context_markdown: str


# ── Helper ────────────────────────────────────────────────────────────────────

async def _require_project(project_id: str, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id!r} not found",
        )
    return project


async def _require_task(
    project_id: str, task_id: str, db: AsyncSession
) -> Task:
    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id!r} not found in project {project_id!r}",
        )
    return task


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{project_id}", response_model=list[TaskOut])
async def list_tasks(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all tasks for a project, ordered by task_number."""
    await _require_project(project_id, db)

    result = await db.execute(
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.task_number)
    )
    return result.scalars().all()


@router.post("/{project_id}/generate", response_model=dict)
async def generate_task_files(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate TASK-NNN.md files for all tasks in the project workspace.

    Also regenerates top-level PROJECT.md, TASKS.md, and STATE.md.
    """
    await _require_project(project_id, db)

    try:
        await markdown_service.save_all_files(project_id, db)
        workspace = await markdown_service.get_workspace_path(project_id)

        tasks_result = await db.execute(
            select(Task)
            .where(Task.project_id == project_id)
            .order_by(Task.task_number)
        )
        tasks = tasks_result.scalars().all()

        return {
            "message": f"Generated {len(tasks)} task file(s).",
            "workspace_path": str(workspace),
            "task_count": len(tasks),
        }
    except Exception as exc:
        logger.error("Task file generation failed for %s: %s", project_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Task file generation failed: {exc}",
        )


@router.get("/{project_id}/{task_id}", response_model=TaskOut)
async def get_task(
    project_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get detail for a single task."""
    await _require_project(project_id, db)
    return await _require_task(project_id, task_id, db)


@router.get("/{project_id}/{task_id}/context", response_model=TaskContextOut)
async def get_task_context(
    project_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get compressed context for a task.

    Returns a markdown string suitable for passing to the AI Builder.
    Conversation history is NEVER included.
    """
    await _require_project(project_id, db)
    task = await _require_task(project_id, task_id, db)

    try:
        context_md = await context_service.build_task_context(
            project_id=project_id,
            task_number=task.task_number,
            db=db,
        )
    except Exception as exc:
        logger.error("Context build failed for task %s: %s", task_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Context generation failed: {exc}",
        )

    return TaskContextOut(
        project_id=project_id,
        task_id=task_id,
        task_number=task.task_number,
        context_markdown=context_md,
    )


@router.put("/{project_id}/{task_id}/status", response_model=TaskOut)
async def update_task_status(
    project_id: str,
    task_id: str,
    payload: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update the status of a task (PENDING → IN_PROGRESS → DONE / FAILED)."""
    await _require_project(project_id, db)
    task = await _require_task(project_id, task_id, db)

    task.status = payload.status
    await db.flush()
    await db.refresh(task)

    # Regenerate STATE.md to reflect updated progress
    try:
        workspace = await markdown_service.get_workspace_path(project_id)
        state_file = workspace / "STATE.md"
        if state_file.exists():
            tasks_result = await db.execute(
                select(Task)
                .where(Task.project_id == project_id)
                .order_by(Task.task_number)
            )
            all_tasks = tasks_result.scalars().all()
            project = await db.get(Project, project_id)
            state_content = markdown_service._render_state(project, all_tasks)
            state_file.write_text(state_content, encoding="utf-8")
    except Exception as exc:
        logger.warning("Could not update STATE.md after task status change: %s", exc)

    return task
