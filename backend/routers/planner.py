"""
Planner router — Conversational planning and requirement management.

Endpoints:
  POST /api/planner/{project_id}/chat               — send message (SSE streaming)
  GET  /api/planner/{project_id}/messages           — conversation history
  POST /api/planner/{project_id}/estimate-complexity — auto-estimate complexity
  GET  /api/planner/{project_id}/requirements       — list requirements
  PUT  /api/planner/{project_id}/requirements/{req_id} — update requirement
  POST /api/planner/{project_id}/generate-plan      — generate full plan
  GET  /api/planner/{project_id}/plan               — get current plan state
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models.project import (
    Decision,
    Message,
    MessageRole,
    PlanningMode,
    Project,
    Requirement,
    RequirementPriority,
    RequirementStatus,
    Task,
    TaskStatus,
)
from backend.services.planner_service import (
    PlannerService,
    MODE_POLICIES,
    count_previous_question_rounds,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/planner", tags=["planner"])
projects_alias_router = APIRouter(prefix="/api/projects", tags=["projects-planner"])

planner_service = PlannerService()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    planning_mode: PlanningMode = PlanningMode.AUTO
    stream: bool = False


class EstimateRequest(BaseModel):
    text: Optional[str] = None


class RequirementUpdate(BaseModel):
    category: Optional[str] = None
    content: Optional[str] = None
    status: Optional[RequirementStatus] = None
    priority: Optional[RequirementPriority] = None
    notes: Optional[str] = None


class RequirementCreate(BaseModel):
    category: str = "Feature"
    content: str
    status: RequirementStatus = RequirementStatus.CONFIRMED
    priority: RequirementPriority = RequirementPriority.IMPORTANT
    notes: Optional[str] = ""


class RequirementOut(BaseModel):
    id: str
    project_id: str
    category: str
    content: str
    status: str
    priority: str
    notes: str

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: str
    project_id: str
    role: str
    content: str
    metadata_json: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ComplexityOut(BaseModel):
    score: float
    recommended_mode: str
    reasoning: str


class GeneratePlanRequest(BaseModel):
    save_to_db: bool = True



# ── Helper ────────────────────────────────────────────────────────────────────

async def _require_project(project_id: str, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id!r} not found",
        )
    return project


def _messages_to_history(messages: list[Message]) -> list[dict]:
    """Convert DB messages to the format expected by AI providers.
    
    Planner messages are stored as plain text (message field only).
    We pass them as 'assistant' role to the AI.
    """
    history = []
    for msg in messages:
        role = "user" if msg.role == MessageRole.USER else "assistant"
        # Content should already be plain text; include as-is
        content = msg.content or ""
        if content:
            history.append({"role": role, "content": content})
    return history


# GODKILLER-ZERO §2.1: Fast-Lane Bypass — short affirmations skip full AI call
_FAST_LANE_AFFIRMATIONS = frozenset([
    "yes", "ok", "okay", "proceed", "go", "done", "sure", "continue",
    "จัดไป", "ตกลง", "ทำต่อ", "ตามนั้น", "โอเค", "ได้", "ดี",
    "ครับ", "ค่ะ", "ใช่", "เอา", "ต่อ",
])

def _is_fast_lane(message: str) -> bool:
    """Return True if message is a short affirmation that needs no AI call."""
    stripped = message.strip().lower().rstrip("!?.  ")
    # Max 3 words or 15 characters
    if len(stripped) > 15 or len(stripped.split()) > 3:
        return False
    return stripped in _FAST_LANE_AFFIRMATIONS


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{project_id}/chat")
@projects_alias_router.post("/{project_id}/chat")
async def chat(
    project_id: str,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Send a message to the planner.

    If payload.stream is True: returns SSE stream.
    If payload.stream is False (default): returns JSON PlannerResponse object.
    On completion, messages and requirements are saved to DB.
    """
    project = await _require_project(project_id, db)

    # Load conversation history (all previous messages)
    result = await db.execute(
        select(Message)
        .where(Message.project_id == project_id)
        .order_by(Message.created_at.asc())
    )
    history_msgs = result.scalars().all()
    history = _messages_to_history(history_msgs)

    # Save user message
    user_msg = Message(
        project_id=project_id,
        role=MessageRole.USER,
        content=payload.message,
    )
    db.add(user_msg)
    await db.flush()

    # GODKILLER §2.1: Fast-Lane — respond locally, skip AI call
    if _is_fast_lane(payload.message) and not payload.stream:
        fast_reply = "รับทราบ! ดำเนินการต่อได้เลย — กรุณาบอก AI ว่าต้องการทำอะไรต่อไปครับ"
        fast_msg = Message(
            project_id=project_id,
            role=MessageRole.PLANNER,
            content=fast_reply,
        )
        db.add(fast_msg)
        await db.commit()
        return {
            "message": fast_reply,
            "questions": [],
            "suggestions": [],
            "conflicts": [],
            "is_ready_to_build": False,
            "requirements_count": 0,
        }


    # Resolve effective planning mode: prefer payload mode if specified, else project mode from DB
    effective_mode = payload.planning_mode
    if effective_mode == PlanningMode.AUTO:
        if project.planning_mode and project.planning_mode != PlanningMode.AUTO:
            effective_mode = project.planning_mode
        else:
            effective_mode = PlanningMode.STANDARD

    # Ensure complexity score is initialized if missing
    if project.complexity_score <= 0.0:
        initial_complexity_map = {
            PlanningMode.QUICK: 15.0,
            PlanningMode.STANDARD: 30.0,
            PlanningMode.DETAILED: 50.0,
            PlanningMode.DEEP: 70.0,
            PlanningMode.ARCHITECT: 90.0,
        }
        project.complexity_score = initial_complexity_map.get(effective_mode, 25.0)

    if not payload.stream:
        # Non-streaming JSON response for standard REST / frontend client
        try:
            parsed = await planner_service.analyze_requirement(
                project_id=project_id,
                user_message=payload.message,
                conversation_history=history,
                planning_mode=effective_mode.value,
                db=db,
            )

            questions_data = [
                {
                    "text": q.text,
                    "priority": q.priority,
                    "category": q.category,
                }
                for q in parsed.questions
            ]
            suggestions_data = [
                {
                    "content": s.content,
                    "category": s.category,
                    "reason": s.reason,
                }
                for s in parsed.suggestions
            ]
            conflicts_data = [
                {
                    "requirement_a": c.requirement_a,
                    "requirement_b": c.requirement_b,
                    "description": c.description,
                    "suggestion": c.suggestion,
                }
                for c in parsed.conflicts
            ]
            meta_json = json.dumps({
                "questions": questions_data,
                "suggestions": suggestions_data,
                "conflicts": conflicts_data,
            }, ensure_ascii=False)

            async with db.begin_nested():
                planner_msg = Message(
                    project_id=project_id,
                    role=MessageRole.PLANNER,
                    content=parsed.message,
                    metadata_json=meta_json,
                )
                db.add(planner_msg)

                for req_update in parsed.requirements_update:
                    new_req = Requirement(
                        project_id=project_id,
                        category=req_update.category,
                        content=req_update.content,
                        status=RequirementStatus(req_update.status)
                        if req_update.status in [e.value for e in RequirementStatus]
                        else RequirementStatus.PROPOSED,
                        priority=RequirementPriority(req_update.priority)
                        if req_update.priority in [e.value for e in RequirementPriority]
                        else RequirementPriority.IMPORTANT,
                        notes=req_update.notes,
                    )
                    db.add(new_req)

            await db.commit()
            await db.refresh(planner_msg)

            return {
                "id": planner_msg.id,
                "message": parsed.message,
                "questions": questions_data,
                "suggestions": suggestions_data,
                "conflicts": conflicts_data,
                "is_ready_to_build": parsed.is_ready_to_build,
                "requirements_count": len(parsed.requirements_update),
            }
        except Exception as exc:
            logger.error("Planner error for project %s: %s", project_id, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AI Provider error: {exc}",
            )

    # Streaming SSE response
    async def event_stream() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            async for chunk in planner_service.analyze_requirement_stream(
                user_message=payload.message,
                conversation_history=history,
                planning_mode=effective_mode.value,
            ):
                full_response += chunk
                data = json.dumps({"chunk": chunk}, ensure_ascii=False)
                yield f"event: chunk\ndata: {data}\n\n"

            # Parse the full response
            parsed = planner_service._parse_planner_response(full_response)

            # Apply Hard Stop Guard to stream response
            policy = MODE_POLICIES.get(effective_mode.value) or MODE_POLICIES["STANDARD"]
            prev_rounds = count_previous_question_rounds(history)
            if prev_rounds >= policy["max_rounds"] or len(parsed.questions) == 0:
                parsed.questions = []
                parsed.is_ready_to_build = True
            elif len(parsed.questions) > policy["budget"]:
                parsed.questions = parsed.questions[:policy["budget"]]

            questions_data = [
                {
                    "text": q.text,
                    "priority": q.priority,
                    "category": q.category,
                }
                for q in parsed.questions
            ]
            suggestions_data = [
                {
                    "content": s.content,
                    "category": s.category,
                    "reason": s.reason,
                }
                for s in parsed.suggestions
            ]
            conflicts_data = [
                {
                    "requirement_a": c.requirement_a,
                    "requirement_b": c.requirement_b,
                    "description": c.description,
                    "suggestion": c.suggestion,
                }
                for c in parsed.conflicts
            ]
            meta_json = json.dumps({
                "questions": questions_data,
                "suggestions": suggestions_data,
                "conflicts": conflicts_data,
            }, ensure_ascii=False)

            # Save planner response message
            async with db.begin_nested():
                planner_msg = Message(
                    project_id=project_id,
                    role=MessageRole.PLANNER,
                    content=parsed.message or full_response,
                    metadata_json=meta_json,
                )
                db.add(planner_msg)

                # Persist new requirements from requirements_update
                for req_update in parsed.requirements_update:
                    new_req = Requirement(
                        project_id=project_id,
                        category=req_update.category,
                        content=req_update.content,
                        status=RequirementStatus(req_update.status)
                        if req_update.status in [e.value for e in RequirementStatus]
                        else RequirementStatus.PROPOSED,
                        priority=RequirementPriority(req_update.priority)
                        if req_update.priority in [e.value for e in RequirementPriority]
                        else RequirementPriority.IMPORTANT,
                        notes=req_update.notes,
                    )
                    db.add(new_req)

            await db.commit()

            # Send final parsed data
            done_data = json.dumps(
                {
                    "id": planner_msg.id,
                    "message": parsed.message,
                    "questions": [
                        {
                            "text": q.text,
                            "priority": q.priority,
                            "category": q.category,
                        }
                        for q in parsed.questions
                    ],
                    "suggestions": [
                        {
                            "content": s.content,
                            "category": s.category,
                            "reason": s.reason,
                        }
                        for s in parsed.suggestions
                    ],
                    "conflicts": [
                        {
                            "requirement_a": c.requirement_a,
                            "requirement_b": c.requirement_b,
                            "description": c.description,
                            "suggestion": c.suggestion,
                        }
                        for c in parsed.conflicts
                    ],
                    "is_ready_to_build": parsed.is_ready_to_build,
                    "requirements_count": len(parsed.requirements_update),
                },
                ensure_ascii=False,
            )
            yield f"event: done\ndata: {done_data}\n\n"

        except Exception as exc:
            logger.error("Planner stream error for project %s: %s", project_id, exc)
            err_data = json.dumps({"error": str(exc)})
            yield f"event: error\ndata: {err_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{project_id}/messages", response_model=list[MessageOut])
@projects_alias_router.get("/{project_id}/messages", response_model=list[MessageOut])
async def get_messages(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return conversation history for a project."""
    await _require_project(project_id, db)

    result = await db.execute(
        select(Message)
        .where(Message.project_id == project_id)
        .order_by(Message.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{project_id}/estimate-complexity", response_model=ComplexityOut)
@projects_alias_router.post("/{project_id}/estimate-complexity", response_model=ComplexityOut)
async def estimate_complexity(
    project_id: str,
    payload: Optional[EstimateRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Estimate project complexity from a description text.

    Also updates the project's complexity_score and planning_mode if AUTO.
    """
    project = await _require_project(project_id, db)

    eval_text = (
        (payload.text if payload and payload.text else None)
        or project.description
        or project.name
        or "General software project"
    )

    result = await planner_service.estimate_complexity(eval_text)

    # Auto-update project if still in AUTO mode
    if project.planning_mode == PlanningMode.AUTO:
        project.planning_mode = PlanningMode(result.recommended_mode)
    project.complexity_score = result.score
    project.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return ComplexityOut(
        score=result.score,
        recommended_mode=result.recommended_mode,
        reasoning=result.reasoning,
    )


@router.get("/{project_id}/requirements", response_model=list[RequirementOut])
@projects_alias_router.get("/{project_id}/requirements", response_model=list[RequirementOut])
async def list_requirements(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all requirements for a project."""
    await _require_project(project_id, db)

    result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    return result.scalars().all()


@router.post(
    "/{project_id}/requirements",
    response_model=RequirementOut,
    status_code=status.HTTP_201_CREATED,
)
@projects_alias_router.post(
    "/{project_id}/requirements",
    response_model=RequirementOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_requirement(
    project_id: str,
    payload: RequirementCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a new requirement directly to the project."""
    await _require_project(project_id, db)
    req = Requirement(
        project_id=project_id,
        category=payload.category,
        content=payload.content,
        status=payload.status,
        priority=payload.priority,
        notes=payload.notes or "",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return req


@router.put(
    "/{project_id}/requirements/{req_id}",
    response_model=RequirementOut,
)
@router.patch(
    "/{project_id}/requirements/{req_id}",
    response_model=RequirementOut,
)
@projects_alias_router.put(
    "/{project_id}/requirements/{req_id}",
    response_model=RequirementOut,
)
@projects_alias_router.patch(
    "/{project_id}/requirements/{req_id}",
    response_model=RequirementOut,
)
async def update_requirement(
    project_id: str,
    req_id: str,
    payload: RequirementUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a specific requirement (partial update)."""
    await _require_project(project_id, db)

    req = await db.get(Requirement, req_id)
    if not req or req.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Requirement {req_id!r} not found in project {project_id!r}",
        )

    for field_name, value in payload.model_dump(exclude_none=True).items():
        setattr(req, field_name, value)

    await db.flush()
    await db.refresh(req)
    return req


@router.post("/{project_id}/generate-plan", response_model=dict)
@projects_alias_router.post("/{project_id}/generate-plan", response_model=dict)
async def generate_plan(
    project_id: str,
    payload: GeneratePlanRequest = GeneratePlanRequest(),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a full project plan (tasks + decisions) from confirmed requirements.

    Optionally saves tasks and decisions to the database.
    """
    project = await _require_project(project_id, db)

    plan = await planner_service.generate_project_plan(project_id, db)

    if payload.save_to_db:
        # Clear existing tasks and decisions before re-generating
        existing_tasks = (await db.execute(
            select(Task).where(Task.project_id == project_id)
        )).scalars().all()
        for t in existing_tasks:
            await db.delete(t)

        existing_decs = (await db.execute(
            select(Decision).where(Decision.project_id == project_id)
        )).scalars().all()
        for d in existing_decs:
            await db.delete(d)

        await db.flush()

        # Insert new tasks
        for task_data in plan.tasks:
            task = Task(
                project_id=project_id,
                task_number=task_data["task_number"],
                title=task_data["title"],
                goal=task_data["goal"],
                status=TaskStatus.PENDING,
            )
            db.add(task)

        # Insert new decisions
        for dec_data in plan.decisions:
            import json as _json
            alternatives = _json.dumps(
                dec_data.get("alternatives", []), ensure_ascii=False
            )
            dec = Decision(
                project_id=project_id,
                topic=dec_data.get("topic", ""),
                decision=dec_data.get("decision", ""),
                reason=dec_data.get("reason", ""),
                alternatives=alternatives,
                impact=dec_data.get("impact", ""),
            )
            db.add(dec)

        await db.flush()

    return {
        "summary": plan.summary,
        "task_count": len(plan.tasks),
        "decision_count": len(plan.decisions),
        "architecture_notes": plan.architecture_notes,
        "tasks": plan.tasks,
        "decisions": plan.decisions,
    }


@router.get("/{project_id}/plan", response_model=dict)
@projects_alias_router.get("/{project_id}/plan", response_model=dict)
async def get_plan(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the current plan state: tasks and decisions from DB."""
    await _require_project(project_id, db)

    tasks = (await db.execute(
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.task_number)
    )).scalars().all()

    decisions = (await db.execute(
        select(Decision).where(Decision.project_id == project_id)
    )).scalars().all()

    return {
        "tasks": [
            {
                "id": t.id,
                "task_number": t.task_number,
                "title": t.title,
                "goal": t.goal,
                "status": t.status.value,
                "md_path": t.md_path,
            }
            for t in tasks
        ],
        "decisions": [
            {
                "id": d.id,
                "topic": d.topic,
                "decision": d.decision,
                "reason": d.reason,
                "impact": d.impact,
            }
            for d in decisions
        ],
    }
