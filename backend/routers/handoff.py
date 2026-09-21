"""
Handoff router — Antigravity & AI Builder delegation endpoints.

Endpoints:
  GET  /api/handoff/capabilities                        — detect local Antigravity
  GET  /api/handoff/{project_id}/{task_id}/preview       — context preview & token estimation
  POST /api/handoff/{project_id}/{task_id}/prepare       — generate .handoff package & manifest
  POST /api/handoff/{project_id}/{task_id}/send          — execute handoff (Assisted/Manual)
  POST /api/handoff/{project_id}/{task_id}/open-workspace— open in Antigravity / Explorer
  POST /api/handoff/{project_id}/{task_id}/open-folder   — open folder in OS Explorer
  POST /api/handoff/{project_id}/{task_id}/result        — ingest builder execution result
  POST /api/handoff/{project_id}/{task_id}/unlock        — release task lock
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models.project import Project, Task, TaskStatus
from backend.services.builder_adapter import (
    BuilderCapability,
    BuilderCapabilityDetector,
    BuilderFactory,
)
from backend.services.context_service import ContextService
from backend.services.markdown_service import MarkdownService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/handoff", tags=["handoff"])

context_service = ContextService()
markdown_service = MarkdownService()


# ── Pydantic Request / Response Schemas ───────────────────────────────────────

class CapabilityOut(BaseModel):
    installed: bool
    cli: bool
    workspace_open: bool
    deep_link: bool
    automation: bool
    executable_path: Optional[str] = None
    method: str
    default_mode: str
    details: dict[str, Any] = Field(default_factory=dict)


class ContextPreviewOut(BaseModel):
    task_id: str
    task_number: int
    task_title: str
    estimated_tokens: int
    file_count: int
    included_files: list[str]
    excluded_files: list[str]
    builder_instructions: str
    is_budget_exceeded: bool
    budget_limit: int


class SendHandoffRequest(BaseModel):
    mode: Optional[str] = "assisted"  # 'assisted' | 'manual'


class SendHandoffResponse(BaseModel):
    task_id: str
    task_number: int
    status: str
    workspace_path: str
    manifest_path: str
    instruction_path: str
    instruction_text: str
    workspace_opened: bool
    mode_used: str
    message: str


class BuildResultSubmission(BaseModel):
    status: str = "COMPLETED"  # 'COMPLETED' | 'FAILED' | 'CHANGES_REQUIRED' | 'NEEDS_ATTENTION'
    changed_files: list[str] = Field(default_factory=list)
    tests_status: str = "PASS"
    notes: str = ""
    raw_markdown: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_task_and_project(
    project_id: str, task_id: str, db: AsyncSession
) -> tuple[Project, Task]:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id!r} not found",
        )

    task = await db.get(Task, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id!r} not found in project {project_id!r}",
        )
    return project, task


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/capabilities", response_model=CapabilityOut)
async def get_capabilities() -> CapabilityOut:
    """Detect Antigravity installation and available builder capabilities."""
    cap = BuilderCapabilityDetector.detect()
    return CapabilityOut(**cap.to_dict())


@router.get("/{project_id}/{task_id}/preview", response_model=ContextPreviewOut)
async def get_context_preview(
    project_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
) -> ContextPreviewOut:
    """
    Returns context size preview, token estimate, and included vs excluded files
    before handing off to Antigravity (Section 44).
    """
    await _get_task_and_project(project_id, task_id, db)
    preview = await context_service.get_context_preview(project_id, task_id, db)
    return ContextPreviewOut(
        task_id=preview.task_id,
        task_number=preview.task_number,
        task_title=preview.task_title,
        estimated_tokens=preview.estimated_tokens,
        file_count=preview.file_count,
        included_files=preview.included_files,
        excluded_files=preview.excluded_files,
        builder_instructions=preview.builder_instructions,
        is_budget_exceeded=preview.is_budget_exceeded,
        budget_limit=preview.budget_limit,
    )


@router.post("/{project_id}/{task_id}/send", response_model=SendHandoffResponse)
async def send_to_builder(
    project_id: str,
    task_id: str,
    body: SendHandoffRequest = SendHandoffRequest(),
    db: AsyncSession = Depends(get_db),
) -> SendHandoffResponse:
    """
    Hands off task to Antigravity (or Manual builder):
      1. Generates .handoff/TASK-NNN/ package & lock file.
      2. If mode == 'assisted', launches Antigravity or opens workspace folder.
      3. Sets Task status to BUILDING.
      4. Returns instructions to be copied to clipboard.
    """
    project, task = await _get_task_and_project(project_id, task_id, db)
    workspace = await markdown_service.get_workspace_path(project_id)

    # 1. Check duplicate handoff / lock (Section 22 & 38)
    adapter = BuilderFactory.get_adapter(task.builder or "antigravity")
    current_lock = adapter.get_lock(workspace, task.task_number)

    if task.status == TaskStatus.BUILDING and current_lock:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"TASK-{task.task_number:03d} is already BUILDING. "
                "Duplicate handoff prevented. Use view or unlock."
            ),
        )

    # 2. Prepare Handoff Package
    pkg = await adapter.prepare_task(project_id, task_id, db)

    # 3. Handle Mode Execution
    workspace_opened = False
    mode = body.mode or "assisted"

    if mode == "assisted":
        workspace_opened = adapter.launch_builder(workspace)
        task.status = TaskStatus.BUILDING
        task.handoff_mode = "assisted"
    else:
        # Manual mode
        task.status = TaskStatus.HANDED_OFF
        task.handoff_mode = "manual"

    # Update project status to BUILDING if it was PLANNING
    if project.status.value == "PLANNING":
        project.status = "BUILDING"

    await db.commit()

    return SendHandoffResponse(
        task_id=task.id,
        task_number=task.task_number,
        status=task.status.value,
        workspace_path=pkg.workspace_path,
        manifest_path=pkg.manifest_path,
        instruction_path=pkg.instruction_path,
        instruction_text=pkg.instruction_text,
        workspace_opened=workspace_opened,
        mode_used=mode,
        message=(
            "Task handed off to Antigravity. Workspace opened."
            if workspace_opened
            else "Task handoff package prepared. Copy instruction to Builder."
        ),
    )


@router.post("/{project_id}/{task_id}/open-workspace")
async def open_workspace(
    project_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Opens workspace in Antigravity (or Explorer)."""
    project, task = await _get_task_and_project(project_id, task_id, db)
    workspace = await markdown_service.get_workspace_path(project_id)

    adapter = BuilderFactory.get_adapter(task.builder or "antigravity")
    opened = adapter.open_workspace(workspace)
    return {"success": opened, "workspace": str(workspace)}


@router.post("/{project_id}/{task_id}/open-folder")
async def open_folder(
    project_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Opens project folder in OS file explorer."""
    await _get_task_and_project(project_id, task_id, db)
    workspace = await markdown_service.get_workspace_path(project_id)

    opened = BuilderFactory.get_adapter()._open_folder_in_os(workspace)
    return {"success": opened, "workspace": str(workspace)}


@router.post("/{project_id}/{task_id}/result")
async def ingest_build_result(
    project_id: str,
    task_id: str,
    result: BuildResultSubmission,
    db: AsyncSession = Depends(get_db),
):
    """
    Ingests build result reported back from Builder/Antigravity.
    Updates STATE.md, CHANGELOG.md, TASKS.md, releases lock, and sets status.
    """
    await _get_task_and_project(project_id, task_id, db)

    task = await markdown_service.record_build_result(
        project_id=project_id,
        task_id=task_id,
        result_status=result.status,
        changed_files=result.changed_files,
        tests_status=result.tests_status,
        notes=result.notes,
        raw_markdown=result.raw_markdown,
        db=db,
    )

    return {
        "success": True,
        "task_id": task.id,
        "task_number": task.task_number,
        "status": task.status.value,
        "result_summary": task.result_summary,
    }


@router.post("/{project_id}/{task_id}/unlock")
async def unlock_task(
    project_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Releases task lock and resets status to READY."""
    project, task = await _get_task_and_project(project_id, task_id, db)
    workspace = await markdown_service.get_workspace_path(project_id)

    adapter = BuilderFactory.get_adapter(task.builder or "antigravity")
    unlocked = adapter.release_lock(workspace, task.task_number)

    task.status = TaskStatus.READY
    await db.commit()

    return {"success": unlocked, "task_id": task.id, "status": task.status.value}
