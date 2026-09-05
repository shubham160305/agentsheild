"""
Guard Agent — pre-authorization engine.
Runs three checks in parallel logic before UPI Reserve Pay fires:
  1. Category lock   — blocks wrong-category purchases
  2. Limit check     — blocks over-limit baskets
  3. Anomaly nudge   — flags unusual baskets for user confirmation
Returns a GuardDecision: PASS / NUDGE / BLOCK with full reason.
"""

from app.models.schemas import (
    CheckoutRequest, GuardDecision, Decision, Category, EffectiveConsent
)
from app.services.consent_store import get_effective_consent, get_user_baseline


def run(request: CheckoutRequest) -> GuardDecision:
    basket_total = sum(item.price_inr * item.quantity for item in request.basket)

    # ── Load effective consent ─────────────────────────────────────────────────
    consent = get_effective_consent(request.user_id, request.merchant_id)

    if not consent:
        return GuardDecision(
            decision=Decision.block,
            reason=f"No consent profile found for merchant '{request.merchant_id}'. User must set up consent before agentic purchases.",
            basket_total_inr=basket_total,
        )

    # ── Check 1: Category lock ─────────────────────────────────────────────────
    blocked_skus = []
    flagged_categories = set()

    for item in request.basket:
        if item.category not in consent.allowed_categories:
            blocked_skus.append(item.name)
            flagged_categories.add(item.category)

    if blocked_skus:
        return GuardDecision(
            decision=Decision.block,
            reason="category_not_permitted",
            flagged_categories=list(flagged_categories),
            basket_total_inr=basket_total,
            blocked_skus=blocked_skus,
        )

    # ── Check 2: Spending limit ────────────────────────────────────────────────
    if basket_total > consent.weekly_limit_inr:
        return GuardDecision(
            decision=Decision.block,
            reason=f"Basket total ₹{basket_total} exceeds your weekly limit of ₹{consent.weekly_limit_inr}.",
            basket_total_inr=basket_total,
        )

    # ── Check 3: Anomaly nudge ─────────────────────────────────────────────────
    baseline = get_user_baseline(request.user_id, request.merchant_id)

    if baseline and baseline > 0:
        deviation_pct = ((basket_total - baseline) / baseline) * 100
        if deviation_pct > consent.anomaly_threshold_pct:
            return GuardDecision(
                decision=Decision.nudge,
                reason=f"Basket ₹{basket_total} is {deviation_pct:.0f}% above your usual ₹{baseline:.0f} on this merchant.",
                basket_total_inr=basket_total,
                nudge_message=consent.nudge_message,
            )

    # ── All checks passed ──────────────────────────────────────────────────────
    return GuardDecision(
        decision=Decision.pass_,
        basket_total_inr=basket_total,
    )
