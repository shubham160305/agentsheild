"""
Test suite for the consent guard agent.
Covers: category block, limit block, anomaly nudge, clean pass, Model C enforcement.
"""

import pytest
from app.models.schemas import (
    CheckoutRequest, SKUItem, Category, Decision,
    MerchantFloor, UserOverride
)
from app.services import guard_agent, consent_store


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def seed_zepto():
    """Reset and seed Zepto merchant floor before each test."""
    consent_store._merchant_store["zepto"] = MerchantFloor(
        merchant_id="zepto",
        allowed_categories=[
            Category.groceries, Category.household,
            Category.snacks, Category.beverages,
        ],
        weekly_limit_inr=3000,
        anomaly_threshold_pct=40,
        nudge_message="This order is larger than your usual Zepto run.",
    )
    consent_store._user_store.clear()
    consent_store._transaction_history[("user_priya", "zepto")] = [
        620, 580, 710, 650, 590, 680, 640
    ]
    yield


def make_request(basket_items, intent="order my usual groceries", user="user_priya"):
    return CheckoutRequest(
        user_id=user,
        merchant_id="zepto",
        intent_string=intent,
        basket=basket_items,
    )


# ── Test 1: Clean grocery order → PASS ────────────────────────────────────────

def test_clean_grocery_order_passes():
    request = make_request([
        SKUItem(sku_id="z001", name="Amul Milk 1L", category=Category.groceries, price_inr=68),
        SKUItem(sku_id="z002", name="Aashirvaad Atta 5kg", category=Category.groceries, price_inr=290),
        SKUItem(sku_id="z003", name="Surf Excel 1kg", category=Category.household, price_inr=210),
    ])
    decision = guard_agent.run(request)
    assert decision.decision == Decision.pass_
    assert decision.basket_total_inr == 568


# ── Test 2: Electronics in grocery order → BLOCK (prompt injection) ───────────

def test_electronics_blocked():
    request = make_request([
        SKUItem(sku_id="z001", name="Amul Milk 1L", category=Category.groceries, price_inr=68),
        SKUItem(sku_id="e001", name="boAt Airdopes 141", category=Category.electronics, price_inr=999),
    ], intent="order my usual groceries")
    decision = guard_agent.run(request)
    assert decision.decision == Decision.block
    assert decision.reason == "category_not_permitted"
    assert "boAt Airdopes 141" in decision.blocked_skus
    assert Category.electronics in decision.flagged_categories


# ── Test 3: Gifting in grocery order → BLOCK ──────────────────────────────────

def test_gifting_blocked():
    request = make_request([
        SKUItem(sku_id="g001", name="Ferrero Rocher Box", category=Category.gifting, price_inr=650),
        SKUItem(sku_id="z001", name="Amul Milk 1L", category=Category.groceries, price_inr=68),
    ])
    decision = guard_agent.run(request)
    assert decision.decision == Decision.block
    assert Category.gifting in decision.flagged_categories


# ── Test 4: Over weekly limit → BLOCK ─────────────────────────────────────────

def test_over_limit_blocked():
    request = make_request([
        SKUItem(sku_id="z001", name="Rice 25kg", category=Category.groceries, price_inr=3200),
    ])
    decision = guard_agent.run(request)
    assert decision.decision == Decision.block
    assert "3200" in decision.reason
    assert "3000" in decision.reason


# ── Test 5: Unusually large basket → NUDGE ────────────────────────────────────

def test_large_basket_triggers_nudge():
    # Priya's baseline ~638 INR. ₹1,930 is ~202% above — well over 40% threshold
    request = make_request([
        SKUItem(sku_id="z001", name="Lay's Party Pack", category=Category.snacks, price_inr=480, quantity=3),
        SKUItem(sku_id="z002", name="Tropicana 1L", category=Category.beverages, price_inr=130, quantity=4),
        SKUItem(sku_id="z003", name="Paper Plates", category=Category.household, price_inr=280),
    ], intent="get me snacks for the party")
    decision = guard_agent.run(request)
    assert decision.decision == Decision.nudge
    assert decision.nudge_message is not None
    assert decision.basket_total_inr == 2240  # 480*3 + 130*4 + 280


# ── Test 6: Model C enforcement — user cannot unlock merchant-locked category ─

def test_user_cannot_unlock_electronics():
    with pytest.raises(Exception) as exc_info:
        consent_store.set_user_override(UserOverride(
            user_id="user_priya",
            merchant_id="zepto",
            allowed_categories=[Category.groceries, Category.electronics],
        ))
    assert "electronics" in str(exc_info.value).lower()


# ── Test 7: User restricts categories — agent respects tighter restriction ────

def test_user_restriction_respected():
    # Priya removes Snacks from her consent
    consent_store.set_user_override(UserOverride(
        user_id="user_priya",
        merchant_id="zepto",
        allowed_categories=[Category.groceries, Category.household],
    ))
    request = make_request([
        SKUItem(sku_id="s001", name="Kurkure", category=Category.snacks, price_inr=40),
        SKUItem(sku_id="z001", name="Amul Milk 1L", category=Category.groceries, price_inr=68),
    ])
    decision = guard_agent.run(request)
    assert decision.decision == Decision.block
    assert "Kurkure" in decision.blocked_skus


# ── Test 8: User lowers limit — agent respects lower limit ────────────────────

def test_user_lower_limit_respected():
    consent_store.set_user_override(UserOverride(
        user_id="user_priya",
        merchant_id="zepto",
        weekly_limit_inr=500,
    ))
    request = make_request([
        SKUItem(sku_id="z001", name="Aashirvaad Atta 5kg", category=Category.groceries, price_inr=600),
    ])
    decision = guard_agent.run(request)
    assert decision.decision == Decision.block
    assert "500" in decision.reason


# ── Test 9: Unknown merchant → BLOCK ─────────────────────────────────────────

def test_unknown_merchant_blocked():
    request = CheckoutRequest(
        user_id="user_priya",
        merchant_id="unknown_merchant",
        intent_string="order something",
        basket=[SKUItem(sku_id="x001", name="Item", category=Category.groceries, price_inr=100)],
    )
    decision = guard_agent.run(request)
    assert decision.decision == Decision.block
    assert "consent profile" in decision.reason.lower()


# ── Test 10: New user with no history → PASS (no anomaly baseline) ────────────

def test_new_user_no_baseline_passes():
    request = CheckoutRequest(
        user_id="user_new",
        merchant_id="zepto",
        intent_string="first order",
        basket=[
            SKUItem(sku_id="z001", name="Amul Milk 1L", category=Category.groceries, price_inr=68),
        ],
    )
    decision = guard_agent.run(request)
    assert decision.decision == Decision.pass_
