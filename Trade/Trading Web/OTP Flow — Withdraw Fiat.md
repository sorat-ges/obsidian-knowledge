# OTP Flow — Withdraw Fiat (order-service)

## Overview

Withdraw Fiat ต้องผ่านการยืนยัน OTP ทาง **Email** ก่อนสร้าง order ทุกครั้ง
ใช้ **Redis** สำหรับ rate limiting (countdown) และ **Database** สำหรับเก็บ token + track attempts

---

## Complete Flow

```
[1] POST /api/v1/withdraw/otp/request
        ↓
[2] POST /api/v1/withdraw/otp/verify
        ↓
[3] POST /api/v1/order-fiat/withdraw  (พร้อม token ที่ verified แล้ว)
```

---

## 1. OTP Request

**Route:** `POST /api/v1/withdraw/otp/request`
**File:** `handler/withdraw_verification.go:53`

### Flow

```
1. ตรวจสอบ Maintenance window (withdraw-fiat / THB)
        ↓
2. ดึง customer identification จาก UUID (claims)
        ↓
3. [Redis] ตรวจสอบ countdown key
   - ถ้ายังมีอยู่ → return cached OTP (ไม่ส่ง email ใหม่)
   - ถ้าไม่มี → ไปขั้นตอนต่อไป
        ↓
4. ตรวจสอบ OTP ที่ status = "waiting" ใน DB
   - [Redis] ถ้า token ไม่มีใน Redis → expire token นั้นทิ้ง
        ↓
5. เรียก Third-party OTP Service ส่ง Email OTP
   → POST {NotificationUrl}/api/otp/email/request
        ↓
6. บันทึก ContactVerification ใน DB
   - expired_at = now + 5 นาที
   - status = "waiting"
        ↓
7. [Redis] บันทึก countdown key (TTL = 60 วินาที)
        ↓
8. Return: { token, refNo, allowResendAt }
```

### Redis Countdown Key

```
Key:   otp:countdown:{sequence}:{customer_account_id}:{product_id}
TTL:   60 วินาที
DB:    Redis Index 9 (IndexOTP)

ตัวอย่าง:
  otp:countdown:withdraw-fiat:account-uuid:product-uuid
```

### Redis Value Structure

```go
type otpCountdownRedisValue struct {
    Token         string  // OTP token
    RefNo         string  // Reference number
    CreatedAt     string  // ISO8601 (UTC)
    AllowResendAt string  // เวลาที่อนุญาตให้ resend ได้
}
```

---

## 2. OTP Verify

**Route:** `POST /api/v1/withdraw/otp/verify`
**File:** `handler/withdraw_verification.go:183`

### Request Body

```json
{
  "token": "xxx",
  "otp": "123456",
  "Sequence": "withdraw-fiat",
  "product_id": "uuid"
}
```

### Flow

```
1. ดึง token จาก DB
        ↓
2. ตรวจสอบหมดอายุหรือไม่ (5 นาที)
        ↓
3. เรียก Third-party verify
   → POST {NotificationUrl}/api/otp/email/verify
        ↓
[กรณี OTP ผิด]
4. เพิ่ม verify_count_number + 1
   - ถ้า verify_count_number == 3:
     → expire token ใน DB
     → [Redis] ลบ countdown key
        ↓
[กรณี OTP ถูก]
5. อัปเดต status = "verified" ใน DB
   → [Redis] ลบ countdown key
        ↓
6. Return: { status, message }
```

### OTP Limits

| Parameter | ค่า | หมายเหตุ |
|-----------|-----|---------|
| Token expiry | **5 นาที** | นับจากเวลาขอ OTP |
| Max failed attempts | **3 ครั้ง** | ครั้งที่ 3 → token expire ทันที |
| Resend cooldown | **60 วินาที** | Redis countdown TTL |

---

## 3. สร้าง Withdraw Order (OTP Token Verify)

**Route:** `POST /api/v1/order-fiat/withdraw`
**File:** `handler/order_fiat.go:1817`

ก่อนสร้าง order ต้อง verify token ที่ได้จากขั้นตอน OTP Verify:

```go
// handler/order_fiat.go:1908
isValid, err := handler.verificationSvc.OtpTokenVerify(otpTokenVerify)
if !isValid {
    return 403 Forbidden
}
```

### OtpTokenVerify Logic (`pkg/verification/service.go:584`)

```
1. ดึง token จาก DB
2. ตรวจสอบ status == "verified"
3. ตรวจสอบ otp_use_count == 0 (ยังไม่เคยใช้)
4. เพิ่ม otp_use_count + 1  ← ป้องกัน token reuse
```

> **หมาย:** Token ใช้ได้ **ครั้งเดียว** เท่านั้น

---

## Redis Rate Limiting Summary

```
[Request OTP] ──────────────────────────────────────────────
    ↓ ตรวจสอบ Redis countdown
    │
    ├── [Key มีอยู่] → Return cached OTP, ไม่ส่ง email ใหม่
    │
    └── [Key ไม่มี] → ส่ง email → บันทึก Redis (TTL 60s)

[Verify OTP ผิด 3 ครั้ง] ──────────────────────────────────
    → expire token ใน DB
    → ลบ Redis countdown key
    → user ต้อง request OTP ใหม่

[Verify OTP ถูก] ──────────────────────────────────────────
    → status = "verified"
    → ลบ Redis countdown key

[สร้าง Order] ─────────────────────────────────────────────
    → check otp_use_count == 0
    → เพิ่ม otp_use_count → token ใช้ซ้ำไม่ได้
```

---

## Redis Configuration

**File:** `internal/constants/redis.go`

```go
const (
    RedisIndexPermission = 8  // Permission cache
    RedisIndexOTP        = 9  // OTP countdown ← ใช้ที่นี่
)
```

**Feature Flag:** `FeatureOtpCountdownCompatible`

| ค่า | พฤติกรรม |
|-----|---------|
| `true` | Redis countdown เปิด — rate limit ทำงาน |
| `false` | Redis countdown ปิด — user resend ได้เรื่อยๆ |

---

## Response Codes

| Code | ความหมาย |
|------|----------|
| `SUCCESS` | OTP ถูกต้อง |
| `TOKEN_EXPIRE` | Token หมดอายุ (เกิน 5 นาที) |
| `OTP_USED` | Token ถูกใช้แล้ว |
| `INVALID` | OTP ผิด |

**HTTP:**
- `200` — สำเร็จ
- `400` — Request ไม่ถูกต้อง / อยู่ใน Maintenance
- `403` — OTP ไม่ผ่าน / Token ไม่ valid
- `500` — Internal error

---

## Third-party OTP Service

**File:** `third_party/otp/otp.go`

| Action | Endpoint |
|--------|----------|
| Request OTP | `{NotificationUrl}/api/otp/email/request` |
| Verify OTP | `{NotificationUrl}/api/otp/email/verify` |

---

## Key Files

| ไฟล์ | หน้าที่ |
|-----|--------|
| `handler/withdraw_verification.go:53` | OTP Request handler |
| `handler/withdraw_verification.go:183` | OTP Verify handler |
| `pkg/verification/service.go` | OTP business logic ทั้งหมด |
| `pkg/verification/otp_countdown_store.go` | Redis countdown get/set/delete |
| `handler/order_fiat.go:1908` | OTP token verify ก่อนสร้าง order |
| `third_party/otp/otp.go` | Third-party OTP API client |
| `internal/constants/redis.go` | Redis DB index constants |
| `internal/config/config.go:147` | Email OTP + Feature flag config |
