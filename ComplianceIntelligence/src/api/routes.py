from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from typing import List
import os
import shutil
from src.core.pipeline import CompliancePipeline
from src.db.session import SessionLocal
from src.db.models import Document, ComplianceInsight

router = APIRouter()
pipeline = CompliancePipeline()

@router.post("/ingest")
async def ingest_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Save file temporarily
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        doc_id = pipeline.run(temp_path)
        return {"document_id": doc_id, "status": "processed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.get("/documents", response_model=List[dict])
async def list_documents():
    db = SessionLocal()
    docs = db.query(Document).all()
    result = [{"id": d.id, "filename": d.filename, "created_at": d.created_at} for d in docs]
    db.close()
    return result

@router.get("/analysis/{document_id}")
async def get_analysis(document_id: str):
    db = SessionLocal()
    insight = db.query(ComplianceInsight).filter(ComplianceInsight.document_id == document_id).first()
    db.close()
    if not insight:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {
        "document_id": insight.document_id,
        "type": insight.insight_type,
        "summary": insight.summary,
        "confidence": insight.confidence,
        "source_refs": insight.source_refs,
        "status": insight.status
    }

@router.post("/analysis/{document_id}/publish")
async def publish_analysis(document_id: str):
    db = SessionLocal()
    insight = db.query(ComplianceInsight).filter(ComplianceInsight.document_id == document_id).first()
    if not insight:
        db.close()
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    insight.status = 'PUBLISHED'
    db.commit()
    db.close()
    return {"message": "Insight published", "document_id": document_id}
