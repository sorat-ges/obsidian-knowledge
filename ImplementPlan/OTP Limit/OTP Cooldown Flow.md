
## Request OTP (with cooldown check)

```
POST /api/v1/withdraw/otp/request
  │
  ▼
Handler: WithdrawHandler.EmailOtpRequest()
  │  - parse claims, bind request body
  │  - validate maintenance
  │
  ▼
VerificationService.EmailOtpRequest()
  │
  ├─ [1] E2E bypass check → ถ้า E2E email → return mock OTP (skip ทุกอย่าง)
  │
  ├─ [2] otpCooldownSvc.CheckCooldown(ctx, identificationId, sequence)
  │       │
  │       ▼
  │     OtpCooldownService.CheckCooldown()
  │       │
  │       ▼
  │     OtpCooldownRepository.IsOTPInCooldown()  ── Redis GET otp:countdown:{id}:{seq}
  │       │
  │       ├── key exists → return ErrOTPInCooldown
  │       │                  → VerificationService return error
  │       │                  → Handler return 429 Too Many Requests
  │       │
  │       └── key not exists → continue
  │
  ├─ [3] GetContactVerificationById() ── PostgreSQL
  │
  ├─ [4] handleWaitingContactVerification()
  │       └── ถ้ามี OTP เก่า status="waiting" → set "expired" แล้ว recursive call EmailOtpRequest
  │
  ├─ [5] otpThirdParty.EmailOTPRequest() ── call Thai Bulk API
  │
  ├─ [6] CreateContactVerification() ── PostgreSQL (ExpiredAt = now+5min, Status="waiting")
  │
  ├─ [7] otpCooldownSvc.SetCooldown(ctx, identificationId, sequence)
  │       │
  │       ▼
  │     OtpCooldownService.SetCooldown()
  │       │
  │       ▼
  │     OtpCooldownRepository.SetOTPCooldown()  ── Redis SET otp:countdown:{id}:{seq} EX {ttl}
  │
  └─ [8] return OtpOutput { Token, Refno, Email }
         → Handler return 200 OK
```

## Verify OTP (ไม่เกี่ยวกับ cooldown — flow เดิม)

```
POST /api/v1/withdraw/otp/verify
  │
  ▼
Handler: WithdrawHandler.EmailOtpVerify()
  │
  ▼
VerificationService.EmailOtpVerify()
  │
  ├─ GetContactVerificationById() ── check ExpiredAt
  ├─ otpThirdParty.EmailOTPVerify() ── call Thai Bulk API
  ├─ ถ้า invalid → VerifyCountNumber++ (auto-expire ที่ 3 ครั้ง)
  └─ ถ้า success → update Status="verified"
```

## Confirm Withdrawal (ใช้ OTP token — flow เดิม)

```
POST /api/v1/order-crypto/withdraw/confirmation   (Crypto)
POST /api/v1/order-fiat/withdraw/confirmation      (Fiat)
  │
  ▼
VerificationService.OtpTokenVerify(token)
  │
  ├─ GetContactVerificationByOtpToken()
  ├─ check Status == "verified"
  ├─ check OtpUseCount == 0
  └─ increaseOtpUseCount() → ป้องกันใช้ซ้ำ
```

## Layer Architecture

```
Handler (handler/)
  │
  ▼
VerificationService (pkg/verification/)
  │
  ▼
OtpCooldownService (pkg/otpcooldown/)        ← NEW
  │
  ▼
OtpCooldownRepository (storages/redis/otprepo/)  ← NEW
  │
  ▼
Redis
```
