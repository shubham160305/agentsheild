from fastapi import APIRouter, HTTPException
from app.models.schemas import MerchantFloor, UserOverride, EffectiveConsent
from app.services import consent_store

router = APIRouter()


@router.post("/merchant", summary="Set merchant floor (Agent Studio)")
def set_merchant_floor(floor: MerchantFloor):
    """
    Called by Agent Studio when merchant configures consent rules.
    Sets the ceiling — users cannot exceed what is defined here.
    """
    saved = consent_store.set_merchant_floor(floor)
    return {"saved": True, "merchant_id": saved.merchant_id}


@router.get("/merchant/{merchant_id}", summary="Get merchant floor")
def get_merchant_floor(merchant_id: str):
    floor = consent_store.get_merchant_floor(merchant_id)
    if not floor:
        raise HTTPException(status_code=404, detail=f"No floor configured for merchant '{merchant_id}'")
    return floor


@router.post("/user", summary="Set user override (Claude chat)")
def set_user_override(override: UserOverride):
    """
    Called by Claude when user sets preferences in chat.
    Validated server-side — user cannot unlock what merchant has locked.
    """
    try:
        result = consent_store.set_user_override(override)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/effective/{merchant_id}/{user_id}", summary="Get effective consent (merged)")
def get_effective(merchant_id: str, user_id: str):
    """
    Returns the merged consent — stricter of merchant floor and user override.
    This is what the guard agent reads at checkout time.
    """
    consent = consent_store.get_effective_consent(user_id, merchant_id)
    if not consent:
        raise HTTPException(status_code=404, detail="No consent profile found.")
    return consent


@router.delete("/user/{merchant_id}/{user_id}", summary="Revoke user consent")
def revoke_user_consent(merchant_id: str, user_id: str):
    """Revoke user's override — reverts to merchant floor defaults."""
    key = (user_id, merchant_id)
    if key in consent_store._user_store:
        del consent_store._user_store[key]
        return {"revoked": True, "user_id": user_id, "merchant_id": merchant_id}
    raise HTTPException(status_code=404, detail="No user override found to revoke.")
