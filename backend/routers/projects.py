"""
Projects router — CRUD for Project entities.

Endpoints:
  GET    /api/projects              — list all projects
  POST   /api/projects              — create project
  GET    /api/projects/{id}         — get project (with requirements, decisions, tasks)
  PUT    /api/projects/{id}         — update project fields
  DELETE /api/projects/{id}         — delete project
  POST   /api/projects/{id}/approve — approve plan → generate .md files
  GET    /api/projects/{id}/workspace — list generated workspace files
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models.project import (
    Decision,
    Message,
    PlanningMode,
    Project,
    ProjectStatus,
    Requirement,
    Task,
    TaskStatus,
)
from backend.services.markdown_service import MarkdownService
from backend.services.planner_service import PlannerService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])

markdown_service = MarkdownService()
planner_service = PlannerService()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")
    planning_mode: PlanningMode = PlanningMode.AUTO


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    planning_mode: Optional[PlanningMode] = None
    complexity_score: Optional[float] = Field(None, ge=0, le=100)


class RequirementOut(BaseModel):
    id: str
    project_id: str
    category: str
    content: str
    status: str
    priority: str
    notes: str

    model_config = {"from_attributes": True}


class DecisionOut(BaseModel):
    id: str
    project_id: str
    topic: str
    decision: str
    reason: str
    alternatives: str
    impact: str
    created_at: datetime

    model_config = {"from_attributes": True}


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
    md_path: str = ""
    result_summary: str = ""

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    created_at: datetime
    updated_at: Optional[datetime]
    status: str
    planning_mode: str
    complexity_score: float

    model_config = {"from_attributes": True}


class ProjectDetail(ProjectOut):
    requirements: list[RequirementOut] = []
    decisions: list[DecisionOut] = []
    tasks: list[TaskOut] = []


class WorkspaceFile(BaseModel):
    name: str
    path: str
    size_bytes: int
    is_directory: bool


# ── Helper ────────────────────────────────────────────────────────────────────

def _not_found(project_id: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Project {project_id!r} not found",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)):
    """List all projects ordered by creation date (newest first)."""
    result = await db.execute(
        select(Project).order_by(Project.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new project."""
    project = Project(
        name=payload.name,
        description=payload.description,
        planning_mode=payload.planning_mode,
        status=ProjectStatus.PLANNING,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    logger.info("Created project %s (%r)", project.id, project.name)
    return project


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single project with all its requirements, decisions, and tasks."""
    project = await db.get(Project, project_id)
    if not project:
        raise _not_found(project_id)

    # Eagerly load relationships via explicit queries
    reqs = (await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )).scalars().all()

    decs = (await db.execute(
        select(Decision).where(Decision.project_id == project_id)
    )).scalars().all()

    tasks = (await db.execute(
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.task_number)
    )).scalars().all()

    return ProjectDetail(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        status=project.status.value,
        planning_mode=project.planning_mode.value,
        complexity_score=project.complexity_score,
        requirements=[RequirementOut.model_validate(r) for r in reqs],
        decisions=[DecisionOut.model_validate(d) for d in decs],
        tasks=[TaskOut.model_validate(t) for t in tasks],
    )


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update project fields (partial update)."""
    project = await db.get(Project, project_id)
    if not project:
        raise _not_found(project_id)

    update_data = payload.model_dump(exclude_none=True)
    for field_name, value in update_data.items():
        setattr(project, field_name, value)

    project.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a project and all related data."""
    project = await db.get(Project, project_id)
    if not project:
        raise _not_found(project_id)
    await db.delete(project)
    logger.info("Deleted project %s", project_id)


@router.post("/{project_id}/approve", response_model=dict)
async def approve_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve the current plan and trigger workspace .md file generation.

    Sets project status to BUILDING and writes all markdown files.
    """
    project = await db.get(Project, project_id)
    if not project:
        raise _not_found(project_id)

    project.status = ProjectStatus.BUILDING
    project.updated_at = datetime.now(timezone.utc)

    # Check if tasks already exist
    tasks_res = await db.execute(
        select(Task).where(Task.project_id == project_id)
    )
    existing_tasks = tasks_res.scalars().all()

    if not existing_tasks:
        logger.info("No tasks found for project %s. Auto-generating plan and tasks upon approval...", project_id)
        try:
            plan = await planner_service.generate_project_plan(project_id, db)
            for task_data in plan.tasks:
                task = Task(
                    project_id=project_id,
                    task_number=task_data["task_number"],
                    title=task_data["title"],
                    goal=task_data["goal"],
                    status=TaskStatus.READY,
                )
                db.add(task)

            import json as _json
            for dec_data in plan.decisions:
                dec = Decision(
                    project_id=project_id,
                    topic=dec_data.get("topic", ""),
                    decision=dec_data.get("decision", ""),
                    reason=dec_data.get("reason", ""),
                    alternatives=_json.dumps(dec_data.get("alternatives", []), ensure_ascii=False),
                    impact=dec_data.get("impact", ""),
                )
                db.add(dec)

            await db.flush()
            logger.info("Auto-generated %d task(s) for project %s", len(plan.tasks), project_id)
        except Exception as exc:
            logger.warning("Auto plan generation encountered error: %s. Creating fallback core task.", exc)
            fallback_task = Task(
                project_id=project_id,
                task_number=1,
                title="Implement Core Requirements",
                goal=project.description or f"Implement core functionality for {project.name}",
                status=TaskStatus.READY,
            )
            db.add(fallback_task)
            await db.flush()
    else:
        # Set existing draft/pending tasks to READY for handoff
        for t in existing_tasks:
            if t.status in (TaskStatus.DRAFT, TaskStatus.PENDING):
                t.status = TaskStatus.READY
        await db.flush()

    try:
        await markdown_service.save_all_files(project_id, db)
        workspace = await markdown_service.get_workspace_path(project_id)
        logger.info("Approved project %s, workspace at %s", project_id, workspace)
        return {
            "message": "Project approved and workspace files generated.",
            "workspace_path": str(workspace),
            "project_id": project_id,
            "status": project.status.value,
        }
    except Exception as exc:
        logger.error("Failed to generate workspace files for %s: %s", project_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File generation failed: {exc}",
        )


@router.get("/{project_id}/workspace", response_model=list[WorkspaceFile])
async def list_workspace_files(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all files in the project workspace directory."""
    project = await db.get(Project, project_id)
    if not project:
        raise _not_found(project_id)

    workspace = await markdown_service.get_workspace_path(project_id)
    files: list[WorkspaceFile] = []

    if workspace.exists():
        for item in sorted(workspace.rglob("*")):
            rel = item.relative_to(workspace)
            files.append(
                WorkspaceFile(
                    name=item.name,
                    path=str(rel).replace("\\", "/"),
                    size_bytes=item.stat().st_size if item.is_file() else 0,
                    is_directory=item.is_dir(),
                )
            )

    return files


@router.post("/{project_id}/open-folder")
async def open_project_folder(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Open project workspace directory in OS Explorer."""
    project = await db.get(Project, project_id)
    if not project:
        raise _not_found(project_id)

    workspace = await markdown_service.get_workspace_path(project_id)
    from backend.services.builder_adapter import BuilderFactory
    opened = BuilderFactory.get_adapter()._open_folder_in_os(workspace)
    return {"success": opened, "workspace": str(workspace)}
