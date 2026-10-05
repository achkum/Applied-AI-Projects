"""POST /ml/v1/classify — subscription + category classification endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter

from app.classifiers.registry import get_category_clf, get_subscription_clf

router = APIRouter()


class ClassifyRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=512)
    amount_minor: int | None = Field(default=None, description="Transaction amount in minor units (negative = debit)")


class SubscriptionResult(BaseModel):
    is_subscription: bool
    confidence: float
    matched_alias: str | None = None


class CategoryResult(BaseModel):
    category: str
    confidence: float
    top3: list[tuple[str, float]]


class ClassifyResponse(BaseModel):
    subscription: SubscriptionResult
    category: CategoryResult | None


@router.post("/ml/v1/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    sub_pred = get_subscription_clf().predict(req.description, req.amount_minor)

    category: CategoryResult | None = None
    if sub_pred.is_subscription:
        cat_pred = get_category_clf().predict(req.description)
        category = CategoryResult(
            category=cat_pred.category,
            confidence=cat_pred.confidence,
            top3=cat_pred.top3,
        )

    return ClassifyResponse(
        subscription=SubscriptionResult(
            is_subscription=sub_pred.is_subscription,
            confidence=sub_pred.confidence,
            matched_alias=sub_pred.matched_alias,
        ),
        category=category,
    )
