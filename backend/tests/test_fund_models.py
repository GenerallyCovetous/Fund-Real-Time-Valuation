import pytest
from pydantic import ValidationError

from app.models.fund import FundValuation, FundValuationRequest


def test_fund_valuation_request_rejects_invalid_codes():
    with pytest.raises(ValidationError):
        FundValuationRequest(codes=["16172"])


def test_fund_valuation_rejects_invalid_code():
    with pytest.raises(ValidationError):
        FundValuation(
            code="ABC725",
            name="Fund",
            estimatedNetValue=1.0,
            estimatedChangePercent=0.1,
            status="ok",
        )


def test_fund_valuation_accepts_six_digit_code_with_aliases():
    valuation = FundValuation(
        code="161725",
        name="Fund",
        estimatedNetValue=1.0,
        estimatedChangePercent=0.1,
        status="ok",
    )
    request = FundValuationRequest(codes=["161725"])

    assert valuation.code == "161725"
    assert request.codes == ["161725"]
