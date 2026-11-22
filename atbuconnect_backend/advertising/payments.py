"""Payment gateway boundary for CampusNetwork Advertising.

Payment collection is intentionally deferred ("Payment Coming Soon").
This module defines the clean service interface so Paystack (including dynamic
bank-transfer accounts, references, verification, reconciliation, refunds, and
webhooks) can be integrated later without rewriting the campaign system.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from django.conf import settings


@dataclass
class PaymentInitResult:
    enabled: bool
    status: str
    message: str
    reference: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    checkout_url: Optional[str] = None


class PaymentGatewayInterface(ABC):
    @abstractmethod
    def is_enabled(self) -> bool: ...

    @abstractmethod
    def initiate_bank_transfer(self, campaign, user) -> PaymentInitResult: ...

    @abstractmethod
    def verify_payment(self, reference: str) -> dict: ...

    @abstractmethod
    def handle_webhook(self, payload: bytes, signature: str) -> dict: ...

    @abstractmethod
    def refund_payment(self, reference: str, amount=None) -> dict: ...


class DeferredPaystackGateway(PaymentGatewayInterface):
    """Disabled placeholder gateway until Paystack credentials & webhooks are configured."""

    def is_enabled(self) -> bool:
        return bool(getattr(settings, "AD_PAYMENTS_ENABLED", False) and getattr(settings, "PAYSTACK_SECRET_KEY", ""))

    def initiate_bank_transfer(self, campaign, user) -> PaymentInitResult:
        return PaymentInitResult(
            enabled=False,
            status="coming_soon",
            message="Payment gateway (Paystack & Bank Transfer) is coming soon. Your campaign has been saved for administrative review.",
        )

    def verify_payment(self, reference: str) -> dict:
        return {"enabled": False, "verified": False, "status": "coming_soon"}

    def handle_webhook(self, payload: bytes, signature: str) -> dict:
        return {"enabled": False, "handled": False, "status": "coming_soon"}

    def refund_payment(self, reference: str, amount=None) -> dict:
        return {"enabled": False, "refunded": False, "status": "coming_soon"}


def get_payment_gateway() -> PaymentGatewayInterface:
    return DeferredPaystackGateway()
