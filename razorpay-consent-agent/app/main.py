from fastapi import FastAPI
from app.routers import consent, checkout

app = FastAPI(
    title="Razorpay Consent Guard Agent",
    description="Pre-authorization guard for agentic e-commerce. Enforces consent granularity before UPI Reserve Pay fires.",
    version="1.0.0"
)

app.include_router(consent.router, prefix="/consent", tags=["Consent"])
app.include_router(checkout.router, prefix="/checkout", tags=["Checkout"])

@app.get("/health")
def health():
    return {"status": "ok", "agent": "consent-guard", "version": "1.0.0"}
