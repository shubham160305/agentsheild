from fastapi import APIRouter
from app.models.schemas import CheckoutRequest, GuardDecision
from app.services import guard_agent

router = APIRouter()


@router.post("/guard", response_model=GuardDecision, summary="Pre-authorization guard check")
def guard_checkout(request: CheckoutRequest):
    """
    The core intercept endpoint.
    Claude calls this BEFORE triggering UPI Reserve Pay.

    Returns:
      PASS  → proceed to UPI debit
      NUDGE → surface confirmation to user, wait for response
      BLOCK → reject, return reason to Claude, notify user
    """
    return guard_agent.run(request)
