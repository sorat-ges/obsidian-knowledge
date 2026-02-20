# Plan: QR Transaction Action API

## Context

เพิ่ม API endpoint สำหรับ scanner ยืนยัน/ยกเลิก QR Transaction โดย:
1. ดึง transaction data จาก Redis ด้วย `tx_id`
2. ตรวจสอบ expiration และความเป็นเจ้าของ
3. Validate state transition (state machine)
4. อัพเดต status และ timestamp ใน Redis

**Endpoint**: `PATCH /api/v1/order-crypto/qr/{tx_id}/action`

---

## Implementation Status: ✅ Completed

---

## What Was Implemented

### 1. Repository Interface — `pkg/qrwithdrawtransaction/repository.go`

เพิ่ม `UpdateQRTransaction` ใน `IQRTransactionRepository`:

```go
type IQRTransactionRepository interface {
    SetQRTransaction(ctx context.Context, key string, data domain.QRTransactionData, expiration time.Duration) error
    GetQRTransaction(ctx context.Context, key string) (domain.QRTransactionData, error)
    UpdateQRTransaction(ctx context.Context, key string, data domain.QRTransactionData) error  // ✅ Added
}
```

### 2. Redis Update Method — `storages/redis/redis_repository.go`

```go
func (r *redisRepository) UpdateQRTransaction(ctx context.Context, key string, data domain.QRTransactionData) error {
    // คำนวณ remaining TTL จาก qr_expire_at
    qrExpireAt, err := time.Parse(time.RFC3339, data.QRExpireAt)
    if err != nil {
        return err
    }
    ttl := time.Until(qrExpireAt)
    if ttl <= 0 {
        return errors.New("QR transaction has expired")
    }
    jsonData, err := json.Marshal(data)
    if err != nil {
        return err
    }
    return r.redisCli.Set(ctx, key, jsonData, ttl).Err()
}
```

### 3. Action Constants — `internal/constants/qr.go`

ใช้ action type แยกจาก status:

```go
type QRTransactionAction string

const (
    QRActionScan    QRTransactionAction = "scan"
    QRActionConfirm QRTransactionAction = "confirm"
    QRActionCancel  QRTransactionAction = "cancel"
)
```

### 4. Service Interface & Implementation — `pkg/qrwithdrawtransaction/service.go`

```go
type IQRWithdrawTransactionService interface {
    CreateQRTransaction(ctx context.Context, req CreateQRTransactionRequest, identificationID, accountID, createdBy, createdByDevice string) (CreateQRTransactionResponse, error)
    GetQRTransactionStatus(ctx context.Context, txID uuid.UUID) (GetQRTransactionStatusResponse, error)
    GetQRTransaction(ctx context.Context, txID uuid.UUID) (GetQRTransactionResponse, error)
    UpdateQRTransaction(ctx context.Context, txID uuid.UUID, action constants.QRTransactionAction, accountID, deviceID string) error  // ✅ Added
}
```

**Implementation logic:**

```go
func (s *QRWithdrawTransactionService) UpdateQRTransaction(
    ctx context.Context,
    txID uuid.UUID,
    action constants.QRTransactionAction,
    accountID, deviceID string,
) error {
    redisKey := constants.QRTransactionKeyPrefix + txID.String()

    // 1. Get existing transaction
    qrData, err := s.qrTransactionRepo.GetQRTransaction(ctx, redisKey)
    // ...

    // 2. Validate not found
    if qrData.TxID == "" {
        return ErrQRTransactionNotFound
    }

    // 3. Validate expiration
    qrExpireAt, err := time.Parse(time.RFC3339, qrData.QRExpireAt)
    if err != nil {
        return fmt.Errorf("failed to parse QR expire time: %w", err)
    }
    if time.Now().UTC().After(qrExpireAt) {
        return ErrQRTransactionExpired
    }

    // 4. Validate ownership
    if qrData.AccountID != accountID {
        return ErrQRTransactionNotOwner
    }

    // 5. Map action → target status (invalid action returns error)
    actionToStatus := map[constants.QRTransactionAction]constants.QRTransactionStatus{
        constants.QRActionScan:    constants.QRTransactionStatusScanned,
        constants.QRActionConfirm: constants.QRTransactionStatusConfirmed,
        constants.QRActionCancel:  constants.QRTransactionStatusCancelled,
    }
    targetStatus, ok := actionToStatus[action]
    if !ok {
        return ErrQRInvalidAction
    }

    // 6. Validate state transition (state machine)
    // pending → scanned
    // scanned → confirmed | cancelled
    // confirmed/cancelled → (no transition allowed)
    validTransitions := map[constants.QRTransactionStatus][]constants.QRTransactionStatus{
        constants.QRTransactionStatusPending: {constants.QRTransactionStatusScanned},
        constants.QRTransactionStatusScanned: {constants.QRTransactionStatusConfirmed, constants.QRTransactionStatusCancelled},
    }
    // ...validate...
    // returns ErrQRInvalidStateTransition if not allowed

    // 7. Update fields
    now := time.Now().UTC()
    qrData.UpdatedAt = now.Format(time.RFC3339)
    qrData.UpdatedBy = accountID   // account ที่ทำ action

    switch action {
    case constants.QRActionScan:
        qrData.ScannedAt = now.Format(time.RFC3339)
        qrData.ScannedBy = deviceID   // device ของ scanner
    case constants.QRActionConfirm:
        qrData.ConfirmedAt = now.Format(time.RFC3339)
        qrData.ConfirmedBy = deviceID
    case constants.QRActionCancel:
        qrData.CancelledAt = now.Format(time.RFC3339)
        qrData.CancelledBy = deviceID
    }

    qrData.Status = string(targetStatus)

    return s.qrTransactionRepo.UpdateQRTransaction(ctx, redisKey, qrData)
}
```

> **หมายเหตุ**: `scanned_by/confirmed_by/cancelled_by` ใช้ `deviceID` (= `claims.UserName`)
> ส่วน `updated_by` ใช้ `accountID` (= `claims.UserUUID`) เพื่อ trace ownership

### 5. Sentinel Errors — `pkg/qrwithdrawtransaction/service.go`

```go
var (
    ErrQRTransactionNotFound    = errors.New("QR transaction not found")
    ErrQRTransactionExpired     = errors.New("QR transaction has expired")
    ErrQRTransactionNotOwner    = errors.New("not the owner of this transaction")
    ErrQRInvalidAction          = errors.New("invalid action")
    ErrQRInvalidStateTransition = errors.New("invalid state transition")
)
```

### 6. Handler — `handler/order_crypto.go`

**Function**: `(h *OrderCryptoHandler) UpdateQRTransaction`

**Endpoint**: `PATCH /api/v1/order-crypto/qr/{tx_id}/action`

```go
func (h *OrderCryptoHandler) UpdateQRTransaction(req *httpserv.Request) (*httpserv.Response, error) {
    ctx := req.Request.Context()
    ctx = context.WithValue(ctx, constants.ContextRequestKey, req)
    ctx = context.WithValue(ctx, constants.ContextLogFunction, "UpdateQRTransaction")
    logFunction := ctx.Value(constants.ContextLogFunction).(string)

    defer func() {
        utils.RecoverWithLogFields(ctx, logFunction)
    }()

    claims, ok := req.Claims.(middleware.PortalClaims)
    // ...

    txIDStr, ok := req.Params.Get("tx_id")
    // ...parse uuid...

    var request model.UpdateQRTransactionRequest
    // ...bind body { customer_account_id, action }...

    deviceID := claims.UserName  // ← device ของ scanner

    err = h.qrWithdrawTransactionService.UpdateQRTransaction(ctx, txID, action, request.CustomerAccountID, deviceID)
    if err != nil {
        switch {
        case errors.Is(err, ErrQRTransactionNotFound):   → 404
        case errors.Is(err, ErrQRTransactionExpired):    → 400
        case errors.Is(err, ErrQRTransactionNotOwner):   → 403
        case errors.Is(err, ErrQRInvalidAction):         → 400
        case errors.Is(err, ErrQRInvalidStateTransition):→ 400
        default:                                          → 500
        }
    }

    return &httpserv.Response{StatusCode: 200, Code: "200", Message: "success"}, nil
}
```

**Key differences from original plan:**
- ใช้ `PATCH` method แทน `POST`
- `tx_id` อยู่ใน path parameter แทนใน request body
- Service return `error` เท่านั้น (ไม่ return response struct)
- Error handling ใช้ `errors.Is()` กับ sentinel errors แทน `switch errMsg := err.Error()`
- `deviceID = claims.UserName` (ไม่ใช่ `claims.UserUUID`)
- Handler ใช้ `nil, &Response` สำหรับ error (framework convention)
- เพิ่ม `defer utils.RecoverWithLogFields` สำหรับ panic recovery

### 7. Route Registration — `routes/route.go`

```go
orderCryptoAuth.PATCH("/qr/:tx_id/action", orderCryptoHandler.UpdateQRTransaction)
```

### 8. Request Model — `handler/model/`

```go
type UpdateQRTransactionRequest struct {
    CustomerAccountID string `json:"customer_account_id" binding:"required"`
    Action            string `json:"action"              binding:"required,oneof=scan confirm cancel"`
}
```

---

## API Specification (Actual)

### Request
```
PATCH /api/v1/order-crypto/qr/{tx_id}/action
Authorization: Bearer <token>
Content-Type: application/json

{
  "customer_account_id": "account-uuid",
  "action": "scan"   // scan | confirm | cancel
}
```

### Response (200 OK)
```json
{
  "status_code": 200,
  "code": "200",
  "message": "success"
}
```

### Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Invalid `tx_id` format |
| 400 | Invalid request body |
| 400 | QR transaction has expired |
| 400 | Invalid action |
| 400 | Invalid state transition |
| 401 | Unauthorized (missing/invalid claims) |
| 403 | Not the owner of this transaction |
| 404 | QR transaction not found |
| 500 | Internal server error |

---

## State Machine

```
pending ──[scan]──→ scanned ──[confirm]──→ confirmed
                         └──[cancel]──→ cancelled
```

- `confirmed` และ `cancelled` เป็น terminal state (ไม่มี transition อีกต่อไป)
- พยายาม transition ที่ไม่ valid จะได้ `ErrQRInvalidStateTransition` (400)

---

## Field Mapping

| Field | ค่าที่ใช้ | Source |
|-------|---------|--------|
| `updated_by` | `accountID` | `claims.UserUUID` |
| `scanned_by` | `deviceID` | `claims.UserName` |
| `confirmed_by` | `deviceID` | `claims.UserName` |
| `cancelled_by` | `deviceID` | `claims.UserName` |

---

## Verification

```bash
# Test scan action
curl -X PATCH http://localhost:8080/api/v1/order-crypto/qr/<tx_id>/action \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"customer_account_id": "<account_uuid>", "action": "scan"}'

# Test confirm action
curl -X PATCH http://localhost:8080/api/v1/order-crypto/qr/<tx_id>/action \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"customer_account_id": "<account_uuid>", "action": "confirm"}'

# Verify Redis data
redis-cli GET "qr.transaction.<tx_id>"
```
