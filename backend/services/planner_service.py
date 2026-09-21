"""
Planner Service — Core intelligence for AI_Increed.

Orchestrates all planning-related AI interactions:
  - Conversational requirement gathering (Thai-first responses)
  - Complexity estimation
  - Question generation with budget enforcement
  - Conflict detection
  - Missing requirement suggestions
  - Full project plan generation

System prompts are written so the AI responds in Thai for user-facing text
while returning structured JSON for internal parsing.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.project import (
    Message,
    MessageRole,
    PlanningMode,
    Requirement,
    RequirementPriority,
    RequirementStatus,
)
from backend.services.ai_provider import ProviderFactory

logger = logging.getLogger(__name__)

# ── Question budget per planning mode ────────────────────────────────────────
QUESTION_BUDGET: dict[str, int | str] = {
    PlanningMode.QUICK: 3,
    PlanningMode.STANDARD: 5,
    PlanningMode.DETAILED: 7,
    PlanningMode.DEEP: 15,          # phase-based; treated as large budget
    PlanningMode.ARCHITECT: 999,    # unlimited until critical requirements met
    PlanningMode.AUTO: 5,           # default until complexity known
}

# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class Question:
    text: str
    priority: str = "IMPORTANT"   # BLOCKING | IMPORTANT | OPTIONAL
    category: str = "general"


@dataclass
class Suggestion:
    content: str
    category: str = "general"
    reason: str = ""


@dataclass
class Conflict:
    requirement_a: str
    requirement_b: str
    description: str
    suggestion: str = ""


@dataclass
class RequirementUpdate:
    category: str
    content: str
    status: str = "PROPOSED"
    priority: str = "IMPORTANT"
    notes: str = ""


@dataclass
class PlannerResponse:
    message: str                                  # Thai text shown to user
    questions: list[Question] = field(default_factory=list)
    suggestions: list[Suggestion] = field(default_factory=list)
    conflicts: list[Conflict] = field(default_factory=list)
    requirements_update: list[RequirementUpdate] = field(default_factory=list)
    is_ready_to_build: bool = False


@dataclass
class ComplexityResult:
    score: float          # 0–100
    recommended_mode: str
    reasoning: str = ""


@dataclass
class ProjectPlan:
    summary: str
    tasks: list[dict] = field(default_factory=list)
    architecture_notes: str = ""
    decisions: list[dict] = field(default_factory=list)


# ── System prompts ────────────────────────────────────────────────────────────

_PLANNER_SYSTEM = """\
คุณคือ AI Planner ผู้เชี่ยวชาญด้านการวิเคราะห์ความต้องการซอฟต์แวร์

หน้าที่ของคุณ:
1. วิเคราะห์สิ่งที่ผู้ใช้ต้องการจากโปรเจกต์
2. ตรวจจับ requirement ที่ขาดหายหรือไม่ชัดเจน
3. ถามคำถามที่จำเป็นเท่านั้น (ไม่เกิน {budget} ข้อ)
4. ตรวจจับความขัดแย้งระหว่าง requirements
5. แนะนำ requirement ที่ผู้ใช้มักลืม

กฎสำคัญ:
- ตอบเป็นภาษาไทยในส่วน "message" เสมอ (เป็นกันเอง ชัดเจน ไม่เป็นทางการเกินไป)
- ถามคำถามที่ BLOCKING ก่อนเสมอ
- อย่าถามในสิ่งที่ผู้ใช้บอกมาแล้ว
- อย่าถามเกิน {budget} คำถามต่อรอบ
- ส่งคืนเฉพาะ JSON ที่ถูกต้องตาม schema ด้านล่าง

JSON Schema ที่ต้องส่งคืน:
{{
  "message": "string (Thai) — ข้อความตอบกลับผู้ใช้",
  "questions": [
    {{
      "text": "string — คำถาม",
      "priority": "BLOCKING|IMPORTANT|OPTIONAL",
      "category": "string"
    }}
  ],
  "suggestions": [
    {{
      "content": "string — requirement ที่แนะนำ",
      "category": "string",
      "reason": "string"
    }}
  ],
  "conflicts": [
    {{
      "requirement_a": "string",
      "requirement_b": "string",
      "description": "string",
      "suggestion": "string"
    }}
  ],
  "requirements_update": [
    {{
      "category": "string",
      "content": "string",
      "status": "PROPOSED|CONFIRMED|DEFAULTED",
      "priority": "BLOCKING|IMPORTANT|OPTIONAL",
      "notes": "string"
    }}
  ],
  "is_ready_to_build": false
}}
"""

_COMPLEXITY_SYSTEM = """\
คุณเป็นผู้เชี่ยวชาญประเมินความซับซ้อนของโปรเจกต์ซอฟต์แวร์

ประเมิน complexity score 0–100 และ recommended planning mode จาก:
- 0–20: QUICK (โปรเจกต์เล็กมาก, script, prototype)
- 21–40: STANDARD (เว็บแอปพื้นฐาน, CRUD)
- 41–60: DETAILED (multi-module, integration)
- 61–80: DEEP (enterprise, distributed)
- 81–100: ARCHITECT (mission-critical, complex architecture)

ส่งคืนเฉพาะ JSON:
{
  "score": <number 0-100>,
  "recommended_mode": "<QUICK|STANDARD|DETAILED|DEEP|ARCHITECT>",
  "reasoning": "<string — เหตุผลสั้น ๆ>"
}
"""

_PLAN_SYSTEM = """\
คุณเป็น Technical Architect ที่สร้าง project plan จาก requirements ที่รวบรวมได้

สร้าง plan ที่:
- แบ่ง tasks ที่ชัดเจน, เป็นลำดับ, แต่ละ task ทำได้ด้วย AI Builder หนึ่งครั้ง
- ระบุ goal และ acceptance criteria ของแต่ละ task
- บันทึก architectural decisions พร้อมเหตุผล

ส่งคืนเฉพาะ JSON:
{
  "summary": "string — สรุปโปรเจกต์",
  "architecture_notes": "string — หมายเหตุด้าน architecture",
  "tasks": [
    {
      "task_number": <int>,
      "title": "string",
      "goal": "string",
      "acceptance_criteria": ["string"],
      "relevant_requirements": ["string"]
    }
  ],
  "decisions": [
    {
      "topic": "string",
      "decision": "string",
      "reason": "string",
      "alternatives": ["string"],
      "impact": "string"
    }
  ]
}
"""


# ── Service ───────────────────────────────────────────────────────────────────

class PlannerService:
    """Core intelligence service handling all planning workflows."""

    # ── Conversation ──────────────────────────────────────────────────────────

    async def analyze_requirement(
        self,
        project_id: str,
        user_message: str,
        conversation_history: list[dict],
        planning_mode: str = "AUTO",
        db: AsyncSession | None = None,
    ) -> PlannerResponse:
        """
        Process a user message, update requirements, and return structured response.

        Args:
            project_id:           Project UUID.
            user_message:         Latest message from the user.
            conversation_history: Previous messages [{"role": ..., "content": ...}].
            planning_mode:        Current planning mode (affects question budget).
            db:                   Optional DB session to load existing requirements.

        Returns:
            PlannerResponse with Thai message, questions, suggestions, etc.
        """
        budget = QUESTION_BUDGET.get(planning_mode, 5)
        system = _PLANNER_SYSTEM.format(budget=budget)

        # Append the new user message
        messages = list(conversation_history) + [
            {"role": "user", "content": user_message}
        ]

        provider = ProviderFactory.get_planner()
        raw = await provider.chat(messages, system_prompt=system)

        return self._parse_planner_response(raw)

    # ── Streaming variant ─────────────────────────────────────────────────────

    async def analyze_requirement_stream(
        self,
        user_message: str,
        conversation_history: list[dict],
        planning_mode: str = "AUTO",
    ):
        """
        Streaming version of analyze_requirement.
        Yields raw text chunks; caller should buffer and parse at end.
        """
        budget = QUESTION_BUDGET.get(planning_mode, 5)
        system = _PLANNER_SYSTEM.format(budget=budget)

        messages = list(conversation_history) + [
            {"role": "user", "content": user_message}
        ]

        provider = ProviderFactory.get_planner()
        async for chunk in provider.chat_stream(messages, system_prompt=system):
            yield chunk

    # ── Complexity estimation ─────────────────────────────────────────────────

    async def estimate_complexity(
        self,
        requirement_text: str,
    ) -> ComplexityResult:
        """
        Estimate project complexity and recommend a planning mode.

        Args:
            requirement_text: Raw requirement / description text.

        Returns:
            ComplexityResult with score 0–100 and recommended_mode.
        """
        provider = ProviderFactory.get_planner()
        messages = [{"role": "user", "content": requirement_text}]
        raw = await provider.chat(messages, system_prompt=_COMPLEXITY_SYSTEM)

        try:
            data = self._extract_json(raw)
            return ComplexityResult(
                score=float(data.get("score", 0)),
                recommended_mode=data.get("recommended_mode", "STANDARD"),
                reasoning=data.get("reasoning", ""),
            )
        except Exception:
            logger.warning("Failed to parse complexity response, using defaults.")
            return ComplexityResult(score=30.0, recommended_mode="STANDARD")

    # ── Question generation ───────────────────────────────────────────────────

    async def generate_questions(
        self,
        requirements: list[str],
        mode: str,
        question_budget: int | None = None,
    ) -> list[Question]:
        """
        Generate clarifying questions based on current requirements.

        Args:
            requirements:    Current requirement texts.
            mode:            Planning mode string.
            question_budget: Override default budget for the mode.

        Returns:
            List of Question objects sorted by priority.
        """
        budget = question_budget or QUESTION_BUDGET.get(mode, 5)
        system = _PLANNER_SYSTEM.format(budget=budget)

        req_text = "\n".join(f"- {r}" for r in requirements)
        prompt = (
            f"Requirements ปัจจุบัน:\n{req_text}\n\n"
            f"สร้างคำถามที่จำเป็นสูงสุด {budget} ข้อ เพื่อทำให้ requirements ชัดเจนขึ้น"
        )

        provider = ProviderFactory.get_planner()
        raw = await provider.chat(
            [{"role": "user", "content": prompt}],
            system_prompt=system,
        )
        response = self._parse_planner_response(raw)
        return response.questions

    # ── Conflict detection ────────────────────────────────────────────────────

    async def detect_conflicts(
        self,
        requirements: list[str],
    ) -> list[Conflict]:
        """
        Detect conflicts between the given requirements.

        Args:
            requirements: List of requirement content strings.

        Returns:
            List of Conflict objects.
        """
        if len(requirements) < 2:
            return []

        req_text = "\n".join(f"{i + 1}. {r}" for i, r in enumerate(requirements))
        prompt = (
            f"ตรวจสอบ requirements เหล่านี้และหาความขัดแย้ง:\n{req_text}\n\n"
            "ส่งคืน JSON ตาม schema ที่กำหนด"
        )

        provider = ProviderFactory.get_planner()
        raw = await provider.chat(
            [{"role": "user", "content": prompt}],
            system_prompt=_PLANNER_SYSTEM.format(budget=999),
        )
        response = self._parse_planner_response(raw)
        return response.conflicts

    # ── Missing requirement suggestions ───────────────────────────────────────

    async def suggest_missing(
        self,
        requirements: list[str],
        project_type: str = "web application",
    ) -> list[Suggestion]:
        """
        Suggest requirements commonly forgotten for this type of project.

        Args:
            requirements: Existing requirement texts.
            project_type: High-level project category.

        Returns:
            List of Suggestion objects.
        """
        req_text = "\n".join(f"- {r}" for r in requirements)
        prompt = (
            f"โปรเจกต์ประเภท: {project_type}\n\n"
            f"Requirements ที่มีอยู่:\n{req_text}\n\n"
            "แนะนำ requirements ที่มักถูกลืมสำหรับโปรเจกต์ประเภทนี้"
        )

        provider = ProviderFactory.get_planner()
        raw = await provider.chat(
            [{"role": "user", "content": prompt}],
            system_prompt=_PLANNER_SYSTEM.format(budget=999),
        )
        response = self._parse_planner_response(raw)
        return response.suggestions

    # ── Plan generation ───────────────────────────────────────────────────────

    async def generate_project_plan(
        self,
        project_id: str,
        db: AsyncSession,
    ) -> ProjectPlan:
        """
        Generate a full project plan from confirmed requirements.

        Args:
            project_id: Project UUID.
            db:         Database session to load requirements.

        Returns:
            ProjectPlan with tasks and decisions.
        """
        # Load requirements from DB
        result = await db.execute(
            select(Requirement).where(Requirement.project_id == project_id)
        )
        requirements = result.scalars().all()

        req_lines = []
        for req in requirements:
            req_lines.append(
                f"[{req.priority}][{req.status}] {req.category}: {req.content}"
            )

        req_text = "\n".join(req_lines) if req_lines else "ยังไม่มี requirements"
        prompt = (
            f"สร้าง project plan จาก requirements ต่อไปนี้:\n\n{req_text}"
        )

        provider = ProviderFactory.get_planner()
        raw = await provider.chat(
            [{"role": "user", "content": prompt}],
            system_prompt=_PLAN_SYSTEM,
        )

        try:
            data = self._extract_json(raw)
            tasks = []
            for t in data.get("tasks", []):
                tasks.append({
                    "task_number": t.get("task_number", 0),
                    "title": t.get("title", ""),
                    "goal": t.get("goal", ""),
                    "acceptance_criteria": t.get("acceptance_criteria", []),
                    "relevant_requirements": t.get("relevant_requirements", []),
                })
            return ProjectPlan(
                summary=data.get("summary", ""),
                tasks=tasks,
                architecture_notes=data.get("architecture_notes", ""),
                decisions=data.get("decisions", []),
            )
        except Exception:
            logger.warning("Failed to parse project plan response.")
            return ProjectPlan(summary=raw)

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        """
        Extract JSON object from raw text that may include prose or code fences.

        Tries three strategies:
        1. Strip markdown code fences and parse
        2. Find first {...} block via regex
        3. Raise ValueError
        """
        # Strip ```json ... ``` fences
        clean = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`").strip()
        try:
            return json.loads(clean)
        except json.JSONDecodeError:
            pass

        # Attempt to find a JSON object anywhere in the text
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass

        raise ValueError(f"No valid JSON found in AI response: {text[:200]}")

    def _parse_planner_response(self, raw: str) -> PlannerResponse:
        """Parse raw AI text into a PlannerResponse dataclass."""
        try:
            data = self._extract_json(raw)
        except ValueError:
            logger.warning("Could not parse planner JSON; returning raw message.")
            return PlannerResponse(message=raw)

        questions = [
            Question(
                text=q.get("text", ""),
                priority=q.get("priority", "IMPORTANT"),
                category=q.get("category", "general"),
            )
            for q in data.get("questions", [])
        ]

        suggestions = [
            Suggestion(
                content=s.get("content", ""),
                category=s.get("category", "general"),
                reason=s.get("reason", ""),
            )
            for s in data.get("suggestions", [])
        ]

        conflicts = [
            Conflict(
                requirement_a=c.get("requirement_a", ""),
                requirement_b=c.get("requirement_b", ""),
                description=c.get("description", ""),
                suggestion=c.get("suggestion", ""),
            )
            for c in data.get("conflicts", [])
        ]

        req_updates = [
            RequirementUpdate(
                category=r.get("category", "general"),
                content=r.get("content", ""),
                status=r.get("status", "PROPOSED"),
                priority=r.get("priority", "IMPORTANT"),
                notes=r.get("notes", ""),
            )
            for r in data.get("requirements_update", [])
        ]

        return PlannerResponse(
            message=data.get("message", ""),
            questions=questions,
            suggestions=suggestions,
            conflicts=conflicts,
            requirements_update=req_updates,
            is_ready_to_build=bool(data.get("is_ready_to_build", False)),
        )
