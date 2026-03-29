

## Overview

  

New endpoint: `PUT /api/v1/order-offering/placement/web/:order_request_id`

  

- Employee-only, TLM role (new permission constant)

- Bank transfer payment only

- `action=draft` → update documents only, audit log: `save_draft`

- `action=submit` → update documents + set status to `order-confirm`, audit log: `submit_request`

  

---

  

## Steps

  

### Step 1 — Add permission constant

  

**File**: `internal/constants/auth.go`

  

Add a new iota constant after `ApproveICOOrderWithoutDocs`:

  

```go

ApproveICOOrderWithoutDocs

EditICOOrderPlacement // NEW — TLM role

```

  

> The actual DB record for TLM role mapping must be inserted separately (ops/DB migration).

  

---

  

### Step 2 — Add request DTO

  

**File**: `handler/order_offering_request.go`

  

```go

type EditICOOrderPlacementRequest struct {

Action enum.PlacementAction `json:"action"`

PaymentSlips []IcoOrderPlacementPaymentSlipRequest `json:"payment_slips"`

SubscriptionFormObjectKey StoreObjectKey `json:"subscription_form_object_key"`

SumAmount float64 `json:"sum_amount"`

SumUnit float64 `json:"sum_unit"`

Currency string `json:"currency"`

PaymentDateTime time.Time `json:"payment_date_time"`

}

```

  

> `OrderRequestID` comes from the URL path param. Reuses existing sub-types.

  

---

  

### Step 3 — Add service IO types

  

**File**: `pkg/orderofferingplacement/service_io.go`

  

```go

type EditICOOrderPlacementInput struct {

OrderRequestID uuid.UUID

Action enum.PlacementAction

SubscriptionFormObjectKey DocumentObjectKeyInput

PaymentSlips []IcoOrderPlacementPaymentSlipRequest

SumAmount float64

SumUnit float64

Currency string

PaymentDateTime time.Time

UpdatedAt time.Time

UpdatedBy string

UpdatedByName string

}

```

  

> Reuse existing `ErrOrderStatusNotOrderRequest` for submit validation.

  

---

  

### Step 4 — Extend service interface

  

**File**: `pkg/orderofferingplacement/service.go`

  

Add to `OrderOfferingPlacementService` interface:

  

```go

EditOrderPlacement(ctx context.Context, input EditICOOrderPlacementInput) error

```

  

---

  

### Step 5 — Implement service method

  

**File**: `pkg/orderofferingplacement/new_service.go` (or new file `edit_service.go`)

  

```go

func (s orderOfferingPlacementService) EditOrderPlacement(ctx context.Context, input EditICOOrderPlacementInput) error {

return s.dbTransaction.Transaction(func(tx *gorm.DB) error {

return s.executeEditOrderPlacementTransaction(tx, ctx, input)

})

}

  

func (s orderOfferingPlacementService) executeEditOrderPlacementTransaction(tx *gorm.DB, ctx context.Context, input EditICOOrderPlacementInput) error {

// 1. Fetch existing order request by OrderRequestID — validate it exists

// 2. Validate payment method is BankTransfer (guard at service level too)

// 3. Update documents: subscription form + payment slips (replace existing)

// 4. Update payment amount / sum fields

// 5. If action == submit:

// - Validate current status is order-request (reuse ErrOrderStatusNotOrderRequest)

// - Set status to order-confirm

// - Create action flow entry (same as ApproveWithoutDocs pattern)

// 6. Set updated_at / updated_by fields

// 7. Move files to storage (reuse moveFilesToStorage)

return nil

}

```

  

---

  

### Step 6 — Add handler method

  

**File**: `handler/order_offering_placement.go`

  

```go

// @Tags Order Offering Placement

// @Security bearerAuth

// @Summary EditICOOrderPlacement

// @Description Edit ICO order placement (draft or submit). Bank transfer only. TLM role required.

// @ID EditICOOrderPlacement

// @Produce json

// @Param order_request_id path string true "Order Request ID (UUID)"

// @Param EditICOOrderPlacementRequest body EditICOOrderPlacementRequest true "EditICOOrderPlacementRequest"

// @Success 200 {object} httpserv.Response

// @Failure 400 {object} httpserv.Response

// @Failure 401 {object} httpserv.Response

// @Failure 500 {object} httpserv.Response

// @Router /api/v1/order-offering/placement/web/{order_request_id} [put]

func (h OrderOfferingPlacementHandler) EditICOOrderPlacement(req *httpserv.Request) (*httpserv.Response, error) {

// 1. Setup ctx, logFunction, defer recover/error log

// 2. Bind request body → EditICOOrderPlacementRequest

// 3. Validate PortalClaims (unauthorized if not ok)

// 4. Parse order_request_id from path param → uuid

// 5. Validate:

// - action is draft or submit

// - payment method must be BankTransfer (return 400 if not)

// - file validation (reuse validateICOOrderFiles)

// 6. Build EditICOOrderPlacementInput

// 7. If action == draft → defer audit log save_draft

// 8. Call h.orderOfferingPlacementService.EditOrderPlacement(ctx, input)

// 9. If action == submit → save audit log submit_request

// 10. Return 200 success

}

```

  

> Audit log pattern mirrors `PlaceICOOrderWeb` exactly — reuse `savePlacementAuditLog`.

  

---

  

### Step 7 — Register route

  

**File**: `routes/route.go`, inside `RegisterRouteOrderOfferingPlacement`

  

```go

groupEmployee.PUT(

constants.SubPathPlacement+constants.PathWeb+"/:order_request_id",

handler.EditICOOrderPlacement,

authMiddleware.RequireAnyPermissionsByID(constants.EditICOOrderPlacement),

)

```

  

---

  

### Step 8 — DB permission record (ops task)

  

Insert a row into the `api_permissions` table mapping the new `EditICOOrderPlacement` permission ID to the TLM role.

  

---

  

## Summary of files to change

  

| File | Change |

|---|---|

| `internal/constants/auth.go` | Add `EditICOOrderPlacement` constant |

| `handler/order_offering_request.go` | Add `EditICOOrderPlacementRequest` |

| `pkg/orderofferingplacement/service_io.go` | Add `EditICOOrderPlacementInput` |

| `pkg/orderofferingplacement/service.go` | Add method to interface |

| `pkg/orderofferingplacement/new_service.go` | Implement `EditOrderPlacement` |

| `handler/order_offering_placement.go` | Add `EditICOOrderPlacement` handler |

| `routes/route.go` | Register PUT route |

  

---

  

## Open questions

  

1. **What fields are editable?** Currently planned: subscription form, payment slips, sum amount/unit, currency, payment datetime. Confirm if token details can also change.

2. **Submit status validation** — should it only allow transition from `order-request`, or also from `order-draft`?

3. **TLM permission ID** — confirm the new constant gets the correct DB record for TLM role mapping.

4. **File handling on edit** — should old payment slip files be deleted from DMS before replacing, or just appended?