from __future__ import annotations

import json
import os
import uuid

import redis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AnalysisJob, AnalysisResult

router = APIRouter(prefix="/v1/analysis", tags=["analysis"])

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
QUEUE_NAME = "analysis_jobs"


def get_redis() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SubmitJobRequest(BaseModel):
    pgn: str


class SubmitJobResponse(BaseModel):
    jobId: str


class JobStatusResponse(BaseModel):
    jobId: str
    status: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/jobs", response_model=SubmitJobResponse, status_code=status.HTTP_201_CREATED)
def submit_job(
    req: SubmitJobRequest,
    db: Session = Depends(get_db),
) -> SubmitJobResponse:
    if not req.pgn.strip():
        raise HTTPException(status_code=400, detail="pgn must not be empty")

    job_id = str(uuid.uuid4())
    job = AnalysisJob(id=job_id, pgn=req.pgn, status="pending")
    db.add(job)
    db.commit()

    r = get_redis()
    r.lpush(QUEUE_NAME, json.dumps({"jobId": job_id, "pgn": req.pgn}))

    return SubmitJobResponse(jobId=job_id)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
) -> JobStatusResponse:
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(jobId=job.id, status=job.status)


@router.get("/jobs/{job_id}/result")
def get_job_result(
    job_id: str,
    db: Session = Depends(get_db),
) -> dict:
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "done":
        raise HTTPException(
            status_code=409,
            detail=f"Job is not done yet (status: {job.status})",
        )

    result = db.query(AnalysisResult).filter(AnalysisResult.job_id == job_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    return json.loads(result.payload_json)
