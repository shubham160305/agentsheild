# Connect to the Consent Guard Agent

One endpoint. One payload. Three decisions.

## Base URL

```
https://your-deployed-url/checkout/guard
```

Replace with your Railway / Render / internal URL after deployment.

---

## The only endpoint you need

```
POST /checkout/guard
```

Call this from Claude (or any AI agent) BEFORE triggering UPI Reserve Pay.

---

## Request payload

```json
{
  "user_id": "user_priya",
  "merchant_id": "zepto",
  "intent_string": "order my usual groceries",
  "agent_platform": "claude",
  "basket": [
    {
      "sku_id": "z001",
      "name": "Amul Milk 1L",
      "category": "groceries",
      "price_inr": 68,
      "quantity": 1
    },
    {
      "sku_id": "z002",
      "name": "Aashirvaad Atta 5kg",
      "category": "groceries",
      "price_inr": 290,
      "quantity": 1
    }
  ]
}
```

### Field reference

| Field | Required | Description |
|---|---|---|
| user_id | Yes | Unique user identifier |
| merchant_id | Yes | Must match a configured merchant: `zepto` or `swiggy` |
| intent_string | Yes | Raw user intent — what the user actually said |
| agent_platform | No | Which AI platform is calling (default: "claude") |
| basket | Yes | List of SKU items the agent built |
| basket[].category | Yes | Must be one of: `groceries`, `household`, `snacks`, `beverages`, `electronics`, `gifting`, `food` |

---

## Response — three possible decisions

### PASS — proceed to UPI

```json
{
  "decision": "PASS",
  "basket_total_inr": 358,
  "reason": null,
  "flagged_categories": null,
  "nudge_message": null,
  "blocked_skus": null
}
```
→ Fire UPI Reserve Pay normally.

---

### NUDGE — ask user to confirm

```json
{
  "decision": "NUDGE",
  "basket_total_inr": 2240,
  "reason": "Basket ₹2240 is 251% above your usual ₹639 on this merchant.",
  "nudge_message": "This order is larger than your usual Zepto run. Confirm to proceed or cancel to review.",
  "flagged_categories": null,
  "blocked_skus": null
}
```
→ Show `nudge_message` to user in chat.
→ If user confirms → fire UPI.
→ If user cancels or no response in 2 min → abort.

---

### BLOCK — reject entirely

```json
{
  "decision": "BLOCK",
  "basket_total_inr": 1067,
  "reason": "category_not_permitted",
  "flagged_categories": ["electronics"],
  "blocked_skus": ["boAt Airdopes 141"],
  "nudge_message": null
}
```
→ Do NOT fire UPI.
→ Tell user: "I couldn't complete this order — [reason]."

---

## Pre-configured test merchants

| merchant_id | Allowed categories | Weekly limit | Nudge threshold |
|---|---|---|---|
| zepto | groceries, household, snacks, beverages | ₹3,000 | 40% |
| swiggy | food, beverages, snacks | ₹2,000 | 35% |

## Pre-configured test users

| user_id | merchant_id | Baseline basket |
|---|---|---|
| user_priya | zepto | ~₹639 |
| user_rahul | swiggy | ~₹370 |

---

## Other endpoints (optional)

| Method | Endpoint | Use |
|---|---|---|
| POST | /consent/merchant | Set merchant floor (Agent Studio) |
| POST | /consent/user | Set user preferences (Claude chat) |
| GET | /consent/effective/{merchant_id}/{user_id} | See merged consent |
| DELETE | /consent/user/{merchant_id}/{user_id} | Revoke user consent |
| GET | /health | Check agent is running |

Full docs at: `https://your-url/docs`
