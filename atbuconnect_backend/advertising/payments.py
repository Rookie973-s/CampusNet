"""Real Paystack payment gateway for CampusNetwork (Cenet).

Supports:
- Dynamic Ad Campaign pricing (server-computed, strictly capped at NGN 4,000)
- Student Verification fee (NGN 1,500; Django Admin can always verify users free)
- Paystack Dedicated Virtual Accounts (DVA) for automatic Bank Transfers
- Paystack Standard Checkout fallback (card / bank transfer)
- HMAC-SHA512 signed Paystack Webhook verification & atomic reconciliation
"""

from dataclasses import dataclass
from decimal import Decimal
import hashlib
import hmac
import json
import logging
import secrets
from typing import Optional
import urllib.error
import urllib.request

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

VERIFICATION_FEE_NGN = Decimal("1500.00")
MAX_AD_PRICE_NGN = Decimal("5000.00")
MAX_AD_PRICE_KOBO = 500000
MIN_AD_PRICE_NGN = Decimal("500.00")


def calculate_ad_price(start_date, end_date, targeting=None, placements=None) -> dict:
    """Server-authoritative ad pricing calculator. Strictly capped at NGN 5,000 (500,000 kobo)."""
    targeting = targeting or {}
    placements = placements or ["feed"]
    days = max(1, (end_date - start_date).days + 1) if (start_date and end_date) else 1

    base = Decimal("500.00")
    duration_cost = Decimal(days) * Decimal("250.00")
    audience = targeting.get("audience", "all") if isinstance(targeting, dict) else "all"
    audience_cost = Decimal("800.00") if audience == "all" else Decimal("350.00")
    extra_placements = max(0, len(placements) - 1)
    placement_cost = Decimal(extra_placements) * Decimal("250.00")

    raw_total = base + duration_cost + audience_cost + placement_cost
    capped_total = min(MAX_AD_PRICE_NGN, max(MIN_AD_PRICE_NGN, raw_total))
    return {
        "amount_ngn": str(capped_total.quantize(Decimal("0.01"))),
        "amount_num": float(capped_total),
        "max_ngn": float(MAX_AD_PRICE_NGN),
        "days": days,
        "capped": raw_total > MAX_AD_PRICE_NGN,
        "breakdown": {
            "base": float(base),
            "duration": float(duration_cost),
            "audience": float(audience_cost),
            "placements": float(placement_cost),
        },
    }


@dataclass
class PaymentInitResult:
    enabled: bool
    status: str
    message: str
    amount_ngn: str = "0.00"
    reference: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    checkout_url: Optional[str] = None


class PaystackGateway:
    BASE_URL = "https://api.paystack.co"

    @property
    def secret_key(self) -> str:
        return (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()

    @property
    def preferred_bank(self) -> str:
        return (getattr(settings, "PAYSTACK_PREFERRED_BANK", "") or "wema-bank").strip()

    def is_enabled(self) -> bool:
        return bool(self.secret_key)

    def _request(self, method: str, path: str, payload: Optional[dict] = None) -> dict:
        url = f"{self.BASE_URL}{path}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self.secret_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "CampusNetwork-Cenet/1.0",
            },
            method=method.upper(),
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            logger.warning("Paystack HTTP %s on %s: %s", exc.code, path, body[:300])
            try:
                return json.loads(body)
            except Exception:
                return {"status": False, "message": f"Paystack error ({exc.code})"}
        except Exception as exc:
            logger.warning("Paystack request failed on %s: %s", path, exc)
            return {"status": False, "message": "Could not reach Paystack gateway."}

    def ensure_dedicated_account(self, user) -> dict:
        """Create or fetch a Paystack Customer and Dedicated Virtual Account (Bank Transfer)."""
        cust_res = self._request("POST", "/customer", {
            "email": user.email,
            "first_name": user.first_name or user.username,
            "last_name": user.last_name or "Student",
            "phone": user.phone_number or user.phone or "",
        })
        cust_code = (cust_res.get("data") or {}).get("customer_code")
        if not cust_code:
            return {"customer_code": "", "bank_name": "", "account_number": "", "account_name": ""}

        dva_res = self._request("POST", "/dedicated_account", {
            "customer": cust_code,
            "preferred_bank": self.preferred_bank,
        })
        dva = dva_res.get("data") or {}
        bank = dva.get("bank") or {}
        return {
            "customer_code": cust_code,
            "bank_name": bank.get("name", ""),
            "account_number": dva.get("account_number", ""),
            "account_name": dva.get("account_name", ""),
        }

    def initiate_payment(self, *, user, amount_ngn: Decimal, purpose: str, campaign=None) -> PaymentInitResult:
        from .models import PaymentTransaction

        amount_ngn = Decimal(amount_ngn).quantize(Decimal("0.01"))
        if not self.is_enabled():
            return PaymentInitResult(
                enabled=False,
                status="not_configured",
                amount_ngn=str(amount_ngn),
                message="Paystack secret key is not configured yet on the server. Set PAYSTACK_SECRET_KEY in Render Environment Variables.",
            )

        ref = f"CN-{purpose[:3].upper()}-{secrets.token_hex(6).upper()}"
        dva = self.ensure_dedicated_account(user)

        init_res = self._request("POST", "/transaction/initialize", {
            "email": user.email,
            "amount": int(amount_ngn * 100),  # kobo
            "currency": "NGN",
            "reference": ref,
            "channels": ["bank_transfer", "card", "bank"],
            "metadata": {
                "purpose": purpose,
                "user_id": user.pk,
                "campaign_id": campaign.pk if campaign else None,
            },
        })
        checkout_url = (init_res.get("data") or {}).get("authorization_url", "")

        tx = PaymentTransaction.objects.create(
            user=user,
            purpose=purpose,
            campaign=campaign,
            amount_ngn=amount_ngn,
            reference=ref,
            status=PaymentTransaction.Status.PENDING,
            paystack_customer_code=dva.get("customer_code", ""),
            virtual_account_bank=dva.get("bank_name", ""),
            virtual_account_number=dva.get("account_number", ""),
            virtual_account_name=dva.get("account_name", ""),
            checkout_url=checkout_url,
        )
        if campaign:
            campaign.payment_reference = ref
            campaign.payment_status = campaign.PaymentStatus.PENDING
            campaign.save(update_fields=["payment_reference", "payment_status", "updated_at"])

        return PaymentInitResult(
            enabled=True,
            status="pending",
            amount_ngn=str(amount_ngn),
            reference=tx.reference,
            bank_name=tx.virtual_account_bank or None,
            account_number=tx.virtual_account_number or None,
            account_name=tx.virtual_account_name or None,
            checkout_url=tx.checkout_url or None,
            message=(
                f"Transfer ₦{amount_ngn:,.0f} to your dedicated account below or complete payment via Paystack."
                if tx.virtual_account_number
                else f"Complete your ₦{amount_ngn:,.0f} payment securely via Paystack Bank Transfer / Card."
            ),
        )

    def verify_signature(self, raw_body: bytes, signature: str) -> bool:
        if not self.secret_key or not signature:
            return False
        expected = hmac.new(self.secret_key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, signature.strip())

    def verify_reference(self, reference: str) -> dict:
        if not self.is_enabled():
            return {"verified": False, "detail": "Paystack not configured."}
        res = self._request("GET", f"/transaction/verify/{reference}")
        data = res.get("data") or {}
        if res.get("status") and data.get("status") == "success":
            amount_ngn = Decimal(data.get("amount", 0)) / Decimal("100")
            tx = self._fulfill_payment(reference=reference, email=(data.get("customer") or {}).get("email", ""), amount_ngn=amount_ngn, raw=res)
            return {"verified": bool(tx), "status": "paid" if tx else "unmatched", "reference": reference}
        return {"verified": False, "status": data.get("status", "pending"), "detail": res.get("message", "Payment not yet confirmed.")}

    def handle_webhook(self, raw_body: bytes, signature: str) -> dict:
        if not self.verify_signature(raw_body, signature):
            return {"ok": False, "status_code": 401, "detail": "Invalid Paystack signature."}
        try:
            event = json.loads(raw_body.decode("utf-8"))
        except Exception:
            return {"ok": False, "status_code": 400, "detail": "Invalid JSON payload."}

        event_type = event.get("event", "")
        data = event.get("data") or {}
        if event_type == "charge.success":
            ref = data.get("reference", "")
            email = (data.get("customer") or {}).get("email", "")
            amount_ngn = Decimal(data.get("amount", 0)) / Decimal("100")
            tx = self._fulfill_payment(reference=ref, email=email, amount_ngn=amount_ngn, raw=event)
            return {"ok": True, "status_code": 200, "matched": bool(tx)}

        return {"ok": True, "status_code": 200, "ignored": event_type}

    def _fulfill_payment(self, *, reference: str, email: str, amount_ngn: Decimal, raw: dict):
        from .models import Campaign, PaymentTransaction
        from notifications.models import Notification
        from notifications.services import notify

        with transaction.atomic():
            tx = None
            if reference:
                tx = PaymentTransaction.objects.select_for_update().filter(reference=reference).first()
            if tx is None and email:
                # Incoming DVA bank transfer: match latest pending transaction for this user where amount covers fee
                tx = (
                    PaymentTransaction.objects.select_for_update()
                    .filter(
                        user__email__iexact=email,
                        status=PaymentTransaction.Status.PENDING,
                        amount_ngn__lte=amount_ngn,
                    )
                    .order_by("-created_at")
                    .first()
                )
            if not tx:
                return None
            if tx.status == PaymentTransaction.Status.PAID:
                return tx  # Idempotent against duplicate webhooks

            tx.status = PaymentTransaction.Status.PAID
            tx.paid_at = timezone.now()
            tx.raw_webhook = raw
            tx.save(update_fields=["status", "paid_at", "raw_webhook", "updated_at"])

            if tx.purpose == PaymentTransaction.Purpose.AD_CAMPAIGN and tx.campaign_id:
                camp = Campaign.objects.select_for_update().filter(pk=tx.campaign_id).first()
                if camp:
                    camp.payment_status = Campaign.PaymentStatus.PAID
                    camp.payment_reference = reference or tx.reference
                    camp.save(update_fields=["payment_status", "payment_reference", "updated_at"])
                    notify(
                        recipient=tx.user,
                        notif_type=Notification.Type.SYSTEM,
                        text=f"Payment of ₦{amount_ngn:,.0f} confirmed for ad campaign “{camp.name}”.",
                        link="/ads",
                    )
            elif tx.purpose == PaymentTransaction.Purpose.STUDENT_VERIFICATION:
                notify(
                    recipient=tx.user,
                    notif_type=Notification.Type.SYSTEM,
                    text=f"Your ₦{amount_ngn:,.0f} student verification payment is confirmed! Your badge application is prioritized for admin review.",
                    link="/profile?tab=verification",
                )
            return tx


def get_payment_gateway() -> PaystackGateway:
    return PaystackGateway()
