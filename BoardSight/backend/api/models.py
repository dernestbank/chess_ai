from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.orm import DeclarativeBase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: str = Column(String, primary_key=True, default=new_id)
    pgn: str = Column(Text, nullable=False)
    status: str = Column(String, nullable=False, default="pending")
    created_at: datetime = Column(DateTime(timezone=True), default=utcnow)
    updated_at: datetime = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id: str = Column(String, primary_key=True, default=new_id)
    job_id: str = Column(String, nullable=False, index=True)
    payload_json: str = Column(Text, nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), default=utcnow)
