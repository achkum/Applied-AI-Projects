from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import yaml
from pathlib import Path
from src.core.pipeline import MainPipeline
from src.utils.logger import logger

app = FastAPI(title="Email Workflow Automation API")

class TriggerResponse(BaseModel):
    email_id: Optional[str]
    subject: str
    analysis: Dict[str, Any]

def get_config():
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Email Workflow API is running"}

@app.post("/trigger-workflow", response_model=List[TriggerResponse])
def trigger_workflow():
    try:
        config = get_config()
        api_key = config.get("gemini_api_key")
        
        if not api_key:
            raise HTTPException(status_code=500, detail="Gemini API Key missing")

        pipeline = MainPipeline(api_key=api_key)
        return pipeline.run("gmail_token.json")
    except Exception as e:
        logger.error(f"API Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
