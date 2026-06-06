from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ClassName = Literal["benign", "malignant"]
TriageTier = Literal["confident_benign", "uncertain_review", "confident_malignant"]


class ClassificationResult(BaseModel):
    # populate_by_name lets us construct with predicted_class=... while JSON serializes "class".
    model_config = ConfigDict(populate_by_name=True)

    predicted_class: ClassName = Field(alias="class")
    confidence: float
    probability_malignant: float
    tier: TriageTier
    prediction_id: str


class GradcamRequest(BaseModel):
    image_base64: str
    overlay_opacity: float = 0.5


class HeatmapResult(BaseModel):
    heatmap_base64: str
    attention_summary: str
    prediction_id: str


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: list[ChatTurn] = []
    # The slide currently in view; the backend injects this into tool calls (the LLM never sees it).
    image_base64: str | None = None
