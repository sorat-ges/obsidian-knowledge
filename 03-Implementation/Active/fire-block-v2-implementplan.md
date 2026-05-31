---
title: Fireblocks Webhooks V2 Migration Implementation Plan
tags: [implementation, active]
status: active
last-updated: 2026-05-31
---

# Fireblocks Webhooks V2 Migration Implementation Plan

## Context

Fireblocks Webhooks V1 will be sunset on June 15, 2026. The current endpoint:

`POST /api/v1/order-crypto/fireblocks/webhook`

is implemented for Webhooks V1 payloads and currently depends on V1 envelope fields:

- `type`
- `tenantId`
- `timestamp`
- `data`

Webhooks V2 keeps the transaction `data` payload mostly unchanged, but changes the notification envelope:

| V1 field | V2 field |
| --- | --- |
| `type` | `eventType` |
| `tenantId` | `workspaceId` |
| `timestamp` | `createdAt` |
| `data` | `data` |

Transaction event names also change:

| V1 event | V2 event |
| --- | --- |
| `TRANSACTION_CREATED` | `transaction.created` |
| `TRANSACTION_STATUS_UPDATED` | `transaction.status.updated` |
| `TRANSACTIONS_APPROVAL_STATUS_UPDATED` | `transaction.approval_status.updated` |

## Current Code Impact

The business logic can likely remain mostly unchanged because the transaction `data` object is still the same resource payload.

The integration layer must change because current code assumes V1 envelope fields.

Main impacted files:

- `handler/order_crypto.go`
- `handler/order_crypto_request.go`
- `pkg/crypto/service_input.go`
- `pkg/crypto/service.go`
- `pkg/crypto/processor.go`
- `internal/entities/crypto_fireblocks.go`
- `pkg/crypto/processor_test.go`
- `handler/order_crypto_test.go` if webhook handler tests exist or are added
- `docs/docs.go`, `docs/swagger.json`, `docs/swagger.yaml` if Swagger docs are regenerated

Important current behavior:

- `handler/order_crypto.go` reads `fireblocks-webhook-signature`.
- `handler/order_crypto.go` only sends messages to the processor when `Type` starts with `TRANSACTION`.
- `pkg/crypto/service_input.go` defines V1-only webhook DTOs.
- `pkg/crypto/service.go` logs `Type`, `TenantId`, and `Timestamp` from V1 fields.
- `pkg/crypto/processor.go` unmarshals into V1 input before calling deposit or withdraw handlers.

With a raw V2 payload, the webhook can be saved with empty V1 fields, but it will not be processed because `Type` is empty.

## Target Behavior

The endpoint should support both V1 and V2 during migration.

Expected behavior:

- Accept V1 payloads without changing existing behavior.
- Accept V2 payloads and normalize them into the existing internal V1-shaped processing model.
- Process V2 transaction events:
  - `transaction.created`
  - `transaction.status.updated`
  - optionally `transaction.approval_status.updated` if current business logic needs it
- Continue ignoring non-transaction events unless explicitly needed.
- Save webhook logs with meaningful event type, workspace or tenant ID, timestamp, and raw payload.
- Verify webhook signatures correctly for the configured Fireblocks webhook version.

## Implementation Approach

Use a small normalization layer at the boundary.

Do not push V2 naming into deposit and withdraw business logic unless necessary. Normalize V2 into the existing internal DTO before enqueueing to the processor.

### 1. Add Version-Tolerant Raw DTO

Update `handler/order_crypto_request.go` or move to shared crypto input if preferred:

```go
type RawOrderCryptoFireblocksWebhook struct {
    Type        string         `json:"type"`
    EventType   string         `json:"eventType"`
    TenantId    string         `json:"tenantId"`
    WorkspaceId string         `json:"workspaceId"`
    Timestamp   int64          `json:"timestamp"`
    CreatedAt   int64          `json:"createdAt"`
    ResourceId  string         `json:"resourceId"`
    Data        map[string]any `json:"data"`
}
```

Use `int64` for timestamps to avoid overflow risk and to match millisecond epoch values.

### 2. Add Normalization Function

Create a helper near the handler or in `pkg/crypto/service_input.go`.

Suggested behavior:

```go
func NormalizeFireblocksWebhook(raw RawOrderCryptoFireblocksWebhook) crypto.RawFireblocksWebhookInput {
    eventType := raw.Type
    if eventType == "" {
        eventType = raw.EventType
    }

    tenantID := raw.TenantId
    if tenantID == "" {
        tenantID = raw.WorkspaceId
    }

    timestamp := raw.Timestamp
    if timestamp == 0 {
        timestamp = raw.CreatedAt
    }

    return crypto.RawFireblocksWebhookInput{
        Type:      eventType,
        TenantId:  tenantID,
        Timestamp: timestamp,
        Data:      raw.Data,
    }
}
```

Also update `crypto.RawFireblocksWebhookInput.Timestamp` from `int` to `int64`.

### 3. Update Transaction Event Detection

Replace:

```go
strings.HasPrefix(saveLogInput.Type, "TRANSACTION")
```

with a version-aware function:

```go
func isFireblocksTransactionEvent(eventType string) bool {
    switch eventType {
    case "TRANSACTION_CREATED",
        "TRANSACTION_STATUS_UPDATED",
        "TRANSACTIONS_APPROVAL_STATUS_UPDATED",
        "transaction.created",
        "transaction.status.updated",
        "transaction.approval_status.updated":
        return true
    default:
        return false
    }
}
```

This avoids accidentally processing unrelated V2 event names.

### 4. Update Processor Input DTOs

Update `pkg/crypto/service_input.go`:

```go
type RawFireblocksWebhookInput struct {
    Type      string         `json:"type"`
    TenantId  string         `json:"tenantId"`
    Timestamp int64          `json:"timestamp"`
    Data      map[string]any `json:"data"`
}

type OrderCryptoFireblocksWebhookInput struct {
    Type      string                                `json:"type"`
    TenantId  string                                `json:"tenantId"`
    Timestamp int64                                 `json:"timestamp"`
    Data      OrderCryptoFireblocksTransactionInput `json:"data"`
}
```

Update `internal/entities/crypto_fireblocks.go` similarly if it stores the same timestamp type.

### 5. Update Webhook Log Save

Update `pkg/crypto/service.go`:

```go
Timestamp: time.UnixMilli(rawData.Timestamp),
```

Keep `Data` as the normalized payload unless the team needs exact raw payload preservation. If exact raw payload is required, add a separate field or pass raw bytes into the log function.

### 6. Signature Verification

Current code verifies `fireblocks-webhook-signature` using existing `VerifyFireblocksSignature`.

Fireblocks V2 supports JWKS detached JWS signature verification using `Fireblocks-Webhook-Signature`. During migration, both legacy and new headers may be present.

Recommended phased approach:

Phase 1:

- Keep existing verification to avoid blocking migration.
- Accept the current legacy signature header.
- Confirm in sandbox whether Fireblocks sends the legacy header for the V2 webhook registration.

Phase 2:

- Add JWKS verification for `Fireblocks-Webhook-Signature`.
- Configure JWKS URL by environment:
  - Sandbox: `https://sandbox-keys.fireblocks.io/.well-known/jwks.json`
  - US Production: `https://keys.fireblocks.io/.well-known/jwks.json`
  - EU: `https://eu-keys.fireblocks.io/.well-known/jwks.json`
  - EU2: `https://eu2-keys.fireblocks.io/.well-known/jwks.json`
- Cache JWKS keys.
- Prefer JWKS verification when the V2 header exists.
- Fall back to legacy verification only during migration if accepted by security policy.

Go libraries to evaluate:

- `github.com/lestrrat-go/jwx/v2/jwk`
- `github.com/lestrrat-go/jwx/v2/jws`

JWKS support may require dependency updates and network access in runtime.

### 7. Tests

Add or update tests for:

- V1 `TRANSACTION_CREATED` still processes.
- V1 `TRANSACTION_STATUS_UPDATED` still processes.
- V2 `transaction.created` processes.
- V2 `transaction.status.updated` processes.
- V2 `workspaceId` is saved as internal `TenantId`.
- V2 `createdAt` is saved as internal timestamp.
- Non-transaction V2 event does not enqueue processor message.
- Missing signature still returns unauthorized.
- Invalid JSON still returns bad request.

Processor tests should include at least one V2-normalized input path.

Handler tests should verify `fireblocksProcessor.SendMessage` is called for V2 transaction events.

### 8. Rollout Plan

1. Deploy code that supports both V1 and V2.
2. Register a new Fireblocks Webhooks V2 listener pointing to the same endpoint, or a temporary parallel endpoint if safer.
3. Subscribe only to needed transaction events:
   - `transaction.created`
   - `transaction.status.updated`
4. Run V1 and V2 in parallel.
5. Compare logs and order state transitions for the same transaction lifecycle.
6. Confirm duplicate event handling and idempotency are safe.
7. Switch production monitoring to V2.
8. Remove V1 dependency after confidence period and before June 15, 2026.

## Risks And Open Questions

- Signature verification may need JWKS implementation before production rollout.
- V2 delivery removes the V1 10-second delay, so ordering and race behavior should be checked.
- Fireblocks does not guarantee event delivery order; current processing must remain idempotent.
- Running V1 and V2 in parallel may duplicate events. Confirm existing deposit and withdraw handlers are idempotent by transaction ID and status.
- Webhook V2 IP allowlist differs from V1. Infrastructure allowlists may need updates.
- If exact raw payload audit is required, logging normalized payload may be insufficient.

## Estimated Effort

Without JWKS signature verification:

- Implementation: 0.5 day
- Tests and sandbox verification: 0.5 day

With JWKS signature verification:

- Implementation: 1 day
- Tests, config, sandbox verification: 0.5-1 day

Total expected effort: 1-2 days depending on signature requirements and sandbox availability.
