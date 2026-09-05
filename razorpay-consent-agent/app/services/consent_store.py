"""
Consent preference store.
Production: swap _merchant_store and _user_store for Postgres/Redis.
For internal Razorpay testing: in-memory store with realistic seed data.
"""

from app.models.schemas import (
    MerchantFloor, UserOverride, EffectiveConsent, Category
)

# ── Seed data — realistic merchant floors for internal testing ─────────────────

_merchant_store: dict[str, MerchantFloor] = {
    "zepto": MerchantFloor(
        merchant_id="zepto",
        allowed_categories=[
            Category.groceries,
            Category.household,
            Category.snacks,
            Category.beverages,
        ],
        weekly_limit_inr=3000,
        anomaly_threshold_pct=40,
        nudge_message="This order is larger than your usual Zepto run. Confirm to proceed or cancel to review.",
    ),
    "swiggy": MerchantFloor(
        merchant_id="swiggy",
        allowed_categories=[Category.food, Category.beverages, Category.snacks],
        weekly_limit_inr=2000,
        anomaly_threshold_pct=35,
        nudge_message="Your Swiggy order looks bigger than usual. Confirm or cancel.",
    ),
}

_user_store: dict[tuple[str, str], UserOverride] = {}

# ── Transaction history for anomaly baseline ──────────────────────────────────
# key: (user_id, merchant_id) → list of past basket totals (INR)
_transaction_history: dict[tuple[str, str], list[int]] = {
    ("user_priya", "zepto"): [620, 580, 710, 650, 590, 680, 640],
    ("user_rahul", "swiggy"): [320, 410, 380, 290, 450],
}


# ── Public API ─────────────────────────────────────────────────────────────────

def set_merchant_floor(floor: MerchantFloor) -> MerchantFloor:
    _merchant_store[floor.merchant_id] = floor
    return floor


def get_merchant_floor(merchant_id: str) -> MerchantFloor | None:
    return _merchant_store.get(merchant_id)


def set_user_override(override: UserOverride) -> dict:
    """
    Validate that user override does not exceed merchant floor.
    Returns saved override or raises ValueError with reason.
    """
    floor = get_merchant_floor(override.merchant_id)
    if not floor:
        raise ValueError(f"Merchant '{override.merchant_id}' not found or not configured.")

    # Category validation — user can only restrict, not expand
    if override.allowed_categories:
        disallowed = [
            c for c in override.allowed_categories
            if c not in floor.allowed_categories
        ]
        if disallowed:
            raise ValueError(
                f"User cannot unlock categories the merchant has not permitted: {[c.value for c in disallowed]}"
            )

    # Limit validation — user cannot exceed merchant ceiling
    if override.weekly_limit_inr and override.weekly_limit_inr > floor.weekly_limit_inr:
        raise ValueError(
            f"User limit ₹{override.weekly_limit_inr} exceeds merchant ceiling ₹{floor.weekly_limit_inr}."
        )

    _user_store[(override.user_id, override.merchant_id)] = override
    return {"saved": True, "override": override}


def get_effective_consent(user_id: str, merchant_id: str) -> EffectiveConsent | None:
    """
    Merge merchant floor + user override.
    Effective rule = stricter of the two on every dimension.
    """
    floor = get_merchant_floor(merchant_id)
    if not floor:
        return None

    user_override = _user_store.get((user_id, merchant_id))

    # Categories: intersect (most restrictive wins)
    if user_override and user_override.allowed_categories:
        effective_categories = [
            c for c in floor.allowed_categories
            if c in user_override.allowed_categories
        ]
    else:
        effective_categories = floor.allowed_categories

    # Limit: minimum of merchant ceiling and user preference
    if user_override and user_override.weekly_limit_inr:
        effective_limit = min(floor.weekly_limit_inr, user_override.weekly_limit_inr)
    else:
        effective_limit = floor.weekly_limit_inr

    return EffectiveConsent(
        merchant_id=merchant_id,
        user_id=user_id,
        allowed_categories=effective_categories,
        weekly_limit_inr=effective_limit,
        anomaly_threshold_pct=floor.anomaly_threshold_pct,
        nudge_message=floor.nudge_message,
    )


def get_user_baseline(user_id: str, merchant_id: str) -> float | None:
    """30-day rolling average basket size for anomaly detection."""
    history = _transaction_history.get((user_id, merchant_id))
    if not history:
        return None
    return sum(history) / len(history)


def record_transaction(user_id: str, merchant_id: str, amount: int):
    """Append completed transaction to history (keep last 30)."""
    key = (user_id, merchant_id)
    if key not in _transaction_history:
        _transaction_history[key] = []
    _transaction_history[key].append(amount)
    _transaction_history[key] = _transaction_history[key][-30:]
