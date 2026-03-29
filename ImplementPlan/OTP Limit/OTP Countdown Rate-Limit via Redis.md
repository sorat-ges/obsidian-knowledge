## AC

- OTP ที่ยังอยู่ในระหว่าง countdown จะต้องไม่สามารถ request OTP ใหม่ผ่านการ call API ตรงได้ (ใช้ Redis ในการ control)

- Scope: **Withdraw Fiat**, **Withdraw Crypto**

  
---


## Current OTP Flow



### Endpoint ที่เกี่ยวข้อง

| Endpoint | Handler | Description |

|---|---|---|

| `POST /api/v1/withdraw/otp/request` | `WithdrawHandler.EmailOtpRequest` | Request OTP |

| `POST /api/v1/withdraw/otp/verify` | `WithdrawHandler.EmailOtpVerify` | Verify OTP |

| `POST /api/v1/order-crypto/withdraw/confirmation` | `ConfirmWithDrawalCrypto` | ใช้ OTP token ยืนยัน withdraw crypto |

| `POST /api/v1/order-fiat/withdraw/confirmation` | `ConfirmWithdrawalFiat` | ใช้ OTP token ยืนยัน withdraw fiat |

  

### Request OTP Flow (ปัจจุบัน)

```

handler/withdraw_verification.go:EmailOtpRequest()

→ pkg/verification/service.go:EmailOtpRequest()

→ GetContactVerificationById() — ดึง latest OTP record จาก PostgreSQL

→ handleWaitingContactVerification()

ถ้ามี OTP เก่าที่ status="waiting" → set เป็น "expired" แล้ว request ใหม่ทันที

→ otpThirdParty.EmailOTPRequest() — call Thai Bulk API

→ CreateContactVerification() — บันทึกลง PostgreSQL

ExpiredAt = now + 5 นาที, Status = "waiting"

```

  

### ปัญหาปัจจุบัน

- `handleWaitingContactVerification()` (service.go:143) จะ expire OTP เก่าแล้วส่งใหม่ทันที — **ไม่มี cooldown**

- ถ้า user call API ตรง (bypass frontend countdown) จะได้ OTP ใหม่ทุกครั้ง

- ไม่มี Redis หรือ rate-limit ใดๆ ป้องกัน

  

---

  

## Key Files

  

| File | Purpose |

|---|---|

| `handler/withdraw_verification.go` | Handler สำหรับ OTP request/verify endpoints |

| `pkg/verification/service.go` | Core logic: `EmailOtpRequest`, `EmailOtpVerify`, `OtpTokenVerify` |

| `pkg/verification/repository.go` | Repository interface สำหรับ contact_verification |

| `storages/postgres/verificationrepository/contact_verification_repository.go` | PostgreSQL implementation |

| `internal/entities/otp_verification.go` | Entity: `ContactVerification`, `ContactVerificationDB` |

| `third_party/otp/otp.go` | Third-party call ไป Thai Bulk notification service |

| `storages/redis/init_redis.go` | Redis client initialization (ใช้ `rediscli.RedisClientImpl`) |

| `storages/redis/redis_repository.go` | Redis repository ที่มีอยู่ (ใช้สำหรับ QR transaction) |

| `internal/constants/redis.go` | Redis constants (ปัจจุบันมีแค่ `RedisIndexPermission = 8`) |

  

---

  

## OTP Data Model

  

```go

// internal/entities/otp_verification.go

type ContactVerificationDB struct {

IdentificationId *uuid.UUID

Email string

Token string // OTP token จาก Thai Bulk

RefNo string // Reference number

ExpiredAt time.Time // now + 5 min

Status string // "waiting" → "verified" / "expired"

VerifyCountNumber int // นับ invalid attempts (auto-expire ที่ 3 ครั้ง)

OtpUseCount int // ป้องกันใช้ซ้ำ (>0 = ใช้แล้ว)

}

```

  

---

  

## Implementation Plan

  

### Redis Key Design

```

Key: otp:countdown:{identificationId}:{sequence}

Value: "1" (หรือ timestamp ที่ request)

TTL: เท่ากับ countdown time ที่ frontend แสดง (เช่น 60 วินาที หรือ 120 วินาที — ต้อง confirm กับ frontend)

```

  

ตัวอย่าง:

- `otp:countdown:550e8400-e29b-41d4-a716-446655440000:withdraw-crypto` TTL 60s

- `otp:countdown:550e8400-e29b-41d4-a716-446655440000:withdraw-fiat` TTL 60s

  

### Changes ที่ต้องทำ

  

#### 1. เพิ่ม Redis constant

**File:** `internal/constants/redis.go`

```go

const (

RedisIndexPermission = 8

OTPCountdownKeyPrefix = "otp:countdown"

OTPCountdownTTLSeconds = 60 // ต้อง confirm กับ frontend

)

```

  

#### 2. เพิ่ม OTP cooldown repository (Redis layer)

**File:** สร้างใหม่ `storages/redis/otprepo/otp_cooldown_repository.go`

  

```go

type IOtpCooldownRepository interface {

SetOTPCooldown(ctx context.Context, identificationId string, sequence string, ttl time.Duration) error

IsOTPInCooldown(ctx context.Context, identificationId string, sequence string) (bool, error)

}

```

  

Logic:

- `SetOTPCooldown`: `SET otp:countdown:{id}:{seq} "1" EX {ttl}` — ใช้ Redis SET with TTL

- `IsOTPInCooldown`: `GET otp:countdown:{id}:{seq}` — ถ้า key exists = ยังอยู่ใน cooldown

  

#### 3. เพิ่ม OTP cooldown service (business logic layer)

**File:** สร้างใหม่ `pkg/otpcooldown/service.go`

  

```go

type IOtpCooldownService interface {

CheckAndSetCooldown(ctx context.Context, identificationId string, sequence string) error

}

  

type OtpCooldownService struct {

otpCooldownRepo otprepo.IOtpCooldownRepository

cooldownTTL time.Duration

}

```

  

Logic:

- `CheckAndSetCooldown` ไม่ได้ set cooldown เอง — แค่ check อย่างเดียว

- การ set cooldown จะเกิดหลัง OTP request สำเร็จ ใน `VerificationService`

- แยก method: `CheckCooldown()` สำหรับ check, `SetCooldown()` สำหรับ set

  

```go

type IOtpCooldownService interface {

CheckCooldown(ctx context.Context, identificationId string, sequence string) error // return error ถ้ายังอยู่ใน cooldown

SetCooldown(ctx context.Context, identificationId string, sequence string) error // set cooldown หลัง OTP request สำเร็จ

}

```

  

- `CheckCooldown`: call repo → ถ้า inCooldown return custom error (เช่น `ErrOTPInCooldown`)

- `SetCooldown`: call repo SET with configured TTL

- Redis failure policy อยู่ใน service layer นี้ (fallthrough หรือ block)

  

#### 4. แก้ไข VerificationService — inject cooldown service

**File:** `pkg/verification/service.go`

  

```go

type VerificationService struct {

otpThirdParty otp.IOtpThirdParty

customerIdentificationRepo customer.ICustomerIdentificationRepository

contactVerificationRepo IVerificationRepository

config config.EmailVerification

auditLogOrderCryptoSvc auditlog.IAuditLogService

fakeRequestSvc fakerequest.IFakeRequestService

otpCooldownSvc otpcooldown.IOtpCooldownService // [NEW]

}

```

  

ใน `EmailOtpRequest()`:

```go

// ก่อน handleWaitingContactVerification()

if err := s.otpCooldownSvc.CheckCooldown(ctx, identificationId.String(), sequence.String()); err != nil {

return OtpOutput{}, err // ErrOTPInCooldown

}

  

// ... existing logic ...

  

// หลัง CreateContactVerification() สำเร็จ

_ = s.otpCooldownSvc.SetCooldown(ctx, identificationId.String(), sequence.String())

```

  

**สำคัญ:** VerificationService call **service** ไม่ใช่ repo — ให้ cooldown service จัดการ business logic เอง

  

#### 5. แก้ไข Handler response

**File:** `handler/withdraw_verification.go`

  

เพิ่ม error handling สำหรับ cooldown case — return HTTP 429 (Too Many Requests):

```go

if errors.Is(err, otpcooldown.ErrOTPInCooldown) {

return nil, &httpserv.Response{

StatusCode: http.StatusTooManyRequests,

Code: "429",

Message: "OTP is still in cooldown period",

}

}

```

  

#### 6. Wire up ใน route/DI

**File:** `cmd/main.go` + `routes/route.go`

  

- สร้าง `OtpCooldownRepository` จาก Redis client ที่มีอยู่แล้ว

- สร้าง `OtpCooldownService` inject repo เข้าไป

- Inject `OtpCooldownService` เข้า `NewVerificationService()`

  

---

  

## Layer Architecture

  

```

Handler (withdraw_verification.go)

│ - HTTP request/response, error → status code mapping

│

▼

VerificationService (pkg/verification/service.go)

│ - call otpCooldownSvc.CheckCooldown() / SetCooldown()

│ - orchestrate OTP request flow

│

▼

OtpCooldownService (pkg/otpcooldown/service.go) ← [NEW]

│ - business logic: cooldown check, TTL config, Redis failure policy

│

▼

OtpCooldownRepository (storages/redis/otprepo/) ← [NEW]

- Redis GET/SET operations

```

  

---

  

## Flow หลังแก้

  

```

POST /api/v1/withdraw/otp/request

→ Handler: EmailOtpRequest

→ VerificationService.EmailOtpRequest()

→ [NEW] otpCooldownSvc.CheckCooldown(id, seq)

│ → otpCooldownRepo.IsOTPInCooldown() — Redis GET

├── in cooldown → return ErrOTPInCooldown → Handler return 429

└── not in cooldown → continue

→ handleWaitingContactVerification() (expire OTP เก่า)

→ otpThirdParty.EmailOTPRequest() (call Thai Bulk)

→ CreateContactVerification() (save to PostgreSQL)

→ [NEW] otpCooldownSvc.SetCooldown(id, seq) — Redis SET with TTL

→ return OTP token + refno

```

  

---

  

## สิ่งที่ต้อง Confirm

  

1. **Countdown duration** — frontend ใช้กี่วินาที? (60s? 120s?) → ใช้เป็น Redis TTL

2. **Error response format** — ต้อง return remaining seconds ให้ frontend ด้วยหรือไม่? ถ้าต้อง ใช้ `Redis TTL` command ดึง remaining time

3. **Redis failure policy** — ถ้า Redis ล่ม ให้ fallthrough (ยอมให้ request ผ่าน) หรือ block? แนะนำ fallthrough เพื่อไม่ให้ Redis เป็น single point of failure`
4. Flow Mobile เปลี่ยนไหม เช่น กด back ไปหน้าจอ withdraw fiat แล้วกด confirm กลับเข้ามา otp ยัง cooldown  ( นับต่อจาก otp เดิม)