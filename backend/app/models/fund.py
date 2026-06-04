from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

FundStatus = Literal["ok", "loading", "failed", "empty"]
FundCode = Annotated[str, Field(pattern=r"^\d{6}$")]


class FundBaseModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class FundSearchResult(FundBaseModel):
    code: FundCode
    name: str


class FundSearchResponse(FundBaseModel):
    query: str
    results: list[FundSearchResult]
    updated_at: datetime = Field(alias="updatedAt")


class FundValuation(FundBaseModel):
    code: FundCode
    name: str | None
    estimated_net_value: float | None = Field(alias="estimatedNetValue")
    estimated_change_percent: float | None = Field(alias="estimatedChangePercent")
    estimated_change_amount: float | None = Field(default=None, alias="estimatedChangeAmount")
    net_value_date: str | None = Field(default=None, alias="netValueDate")
    valuation_time: str | None = Field(default=None, alias="valuationTime")
    status: FundStatus
    error: str | None = None


class FundValuationRequest(FundBaseModel):
    codes: list[FundCode] = Field(min_length=1, max_length=50)
    force: bool = False


class FundValuationResponse(FundBaseModel):
    items: list[FundValuation]
    updated_at: datetime = Field(alias="updatedAt")
