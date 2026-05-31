---
title: White Glove Internal Transfer: Use Input Cost
tags: [implementation, active]
status: active
last-updated: 2026-05-31
---

# White Glove Internal Transfer: Use Input Cost

## Goal

Update `POST /api/v1/white-glove/transfer/internal` so the order transfer average cost always comes from request input instead of portfolio average cost.

Rename the request field from `price` to `cost`.

## API Contract

### Current request field

```json
{
  "price": "50000"
}
```

### New request field

```json
{
  "cost": "50000"
}
```

`cost` is required.

Validation rules:

- `cost` must not be null.
- `cost` must not be an empty string.
- `cost` must be numeric.
- `cost` must be greater than zero.

Invalid examples:

```json
{ "cost": null }
{ "cost": "" }
{ "cost": "abc" }
{ "cost": "0" }
{ "cost": "-1" }
```

## Implementation Plan

### 1. Rename handler DTO field

File:

- `handler/white_glove_dto.go`

Change:

```go
Price *string `json:"price"`
```

To:

```go
Cost *string `json:"cost" binding:"required"`
```

Because `cost` must not be null, keep it as a pointer and validate that it is present and non-empty in service logic.

### 2. Rename service input field

File:

- `pkg/order_transfer/service_input.go`

Change:

```go
Price *string
```

To:

```go
Cost *string
```

### 3. Update handler mapping

File:

- `handler/white_glove_dealer_transfer_handler.go`

Change service input mapping from:

```go
Price: body.Price,
```

To:

```go
Cost: body.Cost,
```

### 4. Require input cost for every internal transfer

File:

- `pkg/order_transfer/service.go`

Current behavior:

- `price` is required only when source account is in `SkipBalanceValidateCustomerAccountIDs`.
- Non-skipped accounts use `sourcePortfolio.AverageCost`.

New behavior:

- `cost` is required for all internal transfers.
- Parse `cost` as decimal.
- Reject null, empty, non-numeric, zero, and negative values.
- Store parsed cost in `wf.overrideAverageCost`.

Suggested rename:

```go
applyPriceOverride(...)
```

To:

```go
applyInputCost(...)
```

Expected validation behavior:

```go
if wf.input.Cost == nil || *wf.input.Cost == "" {
    return errors.Wrap(ErrInvalidRequest, "cost is required")
}

cost, err := decimal.NewFromString(*wf.input.Cost)
if err != nil {
    return errors.Wrap(ErrInvalidRequest, "invalid cost format")
}

if !cost.GreaterThan(decimal.Zero) {
    return errors.Wrap(ErrInvalidRequest, "cost must be greater than 0")
}

wf.overrideAverageCost = &cost
```

### 5. Keep portfolio validation, but stop using portfolio average cost

File:

- `pkg/order_transfer/service.go`

Keep portfolio lookup for non-skipped source accounts so available balance is still validated.

For skipped source accounts, keep the existing behavior that skips portfolio lookup and balance validation.

Do not use `sourcePortfolio.AverageCost` for `average_cost` anymore.

### 6. Remove portfolio average cost fallback

File:

- `pkg/order_transfer/service.go`

Current row builder behavior:

```go
if p.OverrideAverageCost != nil {
    avg = p.OverrideAverageCost
} else if p.Portfolio != nil && p.Portfolio.ID != uuid.Nil && p.Portfolio.AverageCost != nil {
    ac := decimal.NewFromFloat(*p.Portfolio.AverageCost)
    avg = &ac
}
```

New behavior:

```go
if p.OverrideAverageCost != nil {
    avg = p.OverrideAverageCost
}
```

This ensures `average_cost` is sourced only from request `cost`.

### 7. Update tests

Files:

- `pkg/order_transfer/service_internal_transfer_test.go`
- `handler/white_glove_dealer_transfer_handler_test.go`
- Any handler tests referencing `Price` or `json:"price"`

Test cases to add or update:

- Missing `cost` returns `ErrInvalidRequest`.
- Null `cost` returns `ErrInvalidRequest`.
- Empty `cost` returns `ErrInvalidRequest`.
- Non-numeric `cost` returns `ErrInvalidRequest`.
- Zero `cost` returns `ErrInvalidRequest`.
- Negative `cost` returns `ErrInvalidRequest`.
- Valid `cost` is saved as order transfer `average_cost`.
- Portfolio `AverageCost` is ignored when request `cost` is provided.
- Non-skipped accounts still validate portfolio balance.
- Skipped accounts still skip portfolio balance validation.

### 8. Update Swagger

File:

- `docs/swagger.json`

Update `handler.CreateInternalCustomerTransferRequest`:

- Remove `price`.
- Add `cost`.
- Add `cost` to the required list.

Prefer regenerating Swagger if this repository has a standard generation command.

### 9. Add route permission

Files:

- `routes/route.go`
- `internal/constants/auth.go`
- Back-office permission seed/config source, depending on the deployment flow

Current route:

```go
groupEmployee.POST("/transfer/internal", whiteGloveHandler.CreateInternalCustomerTransfer)
```

New route:

```go
groupEmployee.POST(
    "/transfer/internal",
    whiteGloveHandler.CreateInternalCustomerTransfer,
    authMiddleware.VerifyAuthorizeByKey(constants.<NEXT_PERMISSION_KEY>),
)
```

Before adding the constant, find the latest existing permission key:

```bash
rg -n "P[0-9]{4}" internal/constants/auth.go routes/route.go
```

Use the next available permission key after the latest key that already exists in `internal/constants/auth.go`.

Add the new permission constant with that next key:

```go
<NEXT_PERMISSION_KEY> = AuthorizePrefixDomainOrder + AuthorizePrefixServiceOrder + "<NEXT_PERMISSION_NUMBER>"
```

Reasoning:

- `P0291` is used by `GET /transfer/accounts`.
- `P0292` is used by `GET /transfer/asset-balance`.
- `P0293` is used by `POST /dealer/transfer`.
- `P0294` is used by `GET /dealer/transfer/:order_id`.
- `P0295` is used by `GET /:identification_id/order-transfer-history`.
- `POST /transfer/internal` currently has no route-level permission check.
- Do not reuse an existing permission key. Always check the latest key first and allocate the next available one.

Permission setup also needs the external/back-office authorization configuration updated so users can receive this permission key.

Suggested permission meaning:

```text
White Glove Transfer Internal Create
```

Suggested API route mapping:

```text
POST /api/v1/white-glove/transfer/internal
```

Testing expectations:

- User without the new permission key gets forbidden/unauthorized from route middleware.
- User with the new permission key can reach `CreateInternalCustomerTransfer`.
- Existing permissions for dealer transfer and transfer history remain unchanged.

## Verification

Run focused tests:

```bash
go test ./pkg/order_transfer ./handler
```

If handler tests are too broad or slow, run focused test names first:

```bash
go test ./pkg/order_transfer -run InternalCustomerTransfer
go test ./handler -run CreateInternalCustomerTransfer
```
