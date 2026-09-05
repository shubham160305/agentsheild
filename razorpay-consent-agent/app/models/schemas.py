from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Category(str, Enum):
    groceries = "groceries"
    household = "household"
    snacks = "snacks"
    electronics = "electronics"
    gifting = "gifting"
    food = "food"
    beverages = "beverages"


# ── Merchant floor (set via Agent Studio) ─────────────────────────────────────

class MerchantFloor(BaseModel):
    merchant_id: str
    allowed_categories: list[Category] = Field(
        description="Categories merchant permits their agent to purchase"
    )
    weekly_limit_inr: int = Field(
        gt=0, description="Hard ceiling on weekly spend — user cannot exceed this"
    )
    anomaly_threshold_pct: int = Field(
        default=40, ge=10, le=80,
        description="% deviation from user baseline that triggers a nudge"
    )
    nudge_message: str = Field(
        default="This order is larger than your usual run. Confirm to proceed or cancel to review.",
        description="Message shown to user when anomaly threshold crossed"
    )


# ── User override (set via Claude chat) ───────────────────────────────────────

class UserOverride(BaseModel):
    user_id: str
    merchant_id: str
    allowed_categories: Optional[list[Category]] = Field(
        default=None,
        description="User's category restrictions — must be subset of merchant floor"
    )
    weekly_limit_inr: Optional[int] = Field(
        default=None, gt=0,
        description="User's limit — must be <= merchant ceiling"
    )


# ── Effective consent (merged at checkout time) ───────────────────────────────

class EffectiveConsent(BaseModel):
    merchant_id: str
    user_id: str
    allowed_categories: list[Category]
    weekly_limit_inr: int
    anomaly_threshold_pct: int
    nudge_message: str


# ── Checkout request (what Claude sends before UPI fires) ─────────────────────

class SKUItem(BaseModel):
    sku_id: str
    name: str
    category: Category
    price_inr: int
    quantity: int = 1


class CheckoutRequest(BaseModel):
    user_id: str
    merchant_id: str
    intent_string: str = Field(
        description="Raw user intent — e.g. 'order my usual groceries'"
    )
    basket: list[SKUItem]
    agent_platform: str = Field(
        default="claude", description="Which AI platform is initiating"
    )


# ── Guard agent decision ───────────────────────────────────────────────────────

class Decision(str, Enum):
    pass_ = "PASS"
    nudge = "NUDGE"
    block = "BLOCK"


class GuardDecision(BaseModel):
    decision: Decision
    reason: Optional[str] = None
    flagged_categories: Optional[list[Category]] = None
    basket_total_inr: int
    nudge_message: Optional[str] = None
    blocked_skus: Optional[list[str]] = None
