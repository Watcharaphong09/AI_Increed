"""
SQLAlchemy ORM models for AI_Increed.

Tables:
  - projects       — top-level project record
  - requirements   — structured requirements per project
  - decisions      — architectural / design decisions
  - messages       — planner conversation history
  - tasks          — work items generated from the plan
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class ProjectStatus(str, enum.Enum):
    PLANNING = "PLANNING"
    BUILDING = "BUILDING"
    DONE = "DONE"


class PlanningMode(str, enum.Enum):
    QUICK = "QUICK"
    STANDARD = "STANDARD"
    DETAILED = "DETAILED"
    DEEP = "DEEP"
    ARCHITECT = "ARCHITECT"
    AUTO = "AUTO"


class RequirementStatus(str, enum.Enum):
    UNKNOWN = "UNKNOWN"
    PROPOSED = "PROPOSED"
    CONFIRMED = "CONFIRMED"
    DEFAULTED = "DEFAULTED"
    REJECTED = "REJECTED"
    BLOCKED = "BLOCKED"


class RequirementPriority(str, enum.Enum):
    BLOCKING = "BLOCKING"
    IMPORTANT = "IMPORTANT"
    OPTIONAL = "OPTIONAL"


class TaskStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    READY = "READY"
    APPROVED = "APPROVED"
    HANDOFF_PENDING = "HANDOFF_PENDING"
    HANDED_OFF = "HANDED_OFF"
    BUILDING = "BUILDING"
    TESTING = "TESTING"
    REVIEW = "REVIEW"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    NEEDS_ATTENTION = "NEEDS_ATTENTION"
    CHANGES_REQUIRED = "CHANGES_REQUIRED"
    # Legacy / alias states
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"


class MessageRole(str, enum.Enum):
    USER = "user"
    PLANNER = "planner"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _new_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Models ────────────────────────────────────────────────────────────────────

class Project(Base):
    """Top-level project record."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus), default=ProjectStatus.PLANNING
    )
    planning_mode: Mapped[PlanningMode] = mapped_column(
        Enum(PlanningMode), default=PlanningMode.AUTO
    )
    complexity_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Relationships
    requirements: Mapped[list["Requirement"]] = relationship(
        "Requirement", back_populates="project", cascade="all, delete-orphan"
    )
    decisions: Mapped[list["Decision"]] = relationship(
        "Decision", back_populates="project", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="project", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="project", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id!r} name={self.name!r} status={self.status}>"


class Requirement(Base):
    """A single structured requirement belonging to a project."""

    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(100), default="general")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[RequirementStatus] = mapped_column(
        Enum(RequirementStatus), default=RequirementStatus.PROPOSED
    )
    priority: Mapped[RequirementPriority] = mapped_column(
        Enum(RequirementPriority), default=RequirementPriority.IMPORTANT
    )
    notes: Mapped[str] = mapped_column(Text, default="")

    project: Mapped["Project"] = relationship("Project", back_populates="requirements")

    def __repr__(self) -> str:
        return (
            f"<Requirement id={self.id!r} category={self.category!r} "
            f"status={self.status} priority={self.priority}>"
        )


class Decision(Base):
    """An architectural or design decision for a project."""

    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, default="")
    alternatives: Mapped[str] = mapped_column(Text, default="")  # JSON array as text
    impact: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    project: Mapped["Project"] = relationship("Project", back_populates="decisions")

    def __repr__(self) -> str:
        return f"<Decision id={self.id!r} topic={self.topic!r}>"


class Message(Base):
    """A conversation message between user and planner AI."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    project: Mapped["Project"] = relationship("Project", back_populates="messages")

    def __repr__(self) -> str:
        return f"<Message id={self.id!r} role={self.role} project={self.project_id!r}>"


class Task(Base):
    """A discrete work task generated from the project plan."""

    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    task_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    goal: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus), default=TaskStatus.READY
    )
    priority: Mapped[str] = mapped_column(String(50), default="HIGH")
    builder: Mapped[str] = mapped_column(String(50), default="antigravity")
    handoff_mode: Mapped[str] = mapped_column(String(50), default="assisted")
    md_path: Mapped[str] = mapped_column(String(512), default="")
    result_summary: Mapped[str] = mapped_column(Text, default="")

    project: Mapped["Project"] = relationship("Project", back_populates="tasks")

    def __repr__(self) -> str:
        return (
            f"<Task id={self.id!r} number={self.task_number} "
            f"title={self.title!r} status={self.status}>"
        )
