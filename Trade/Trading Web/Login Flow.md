# Login Flow — Trading Web

## Overview

ระบบ login ใช้ **QR Code Login** เป็น method หลัก โดย user สแกน QR ผ่านมือถือ ตัว web ทำหน้าที่เป็น BFF (Backend for Frontend) รับ request จาก client แล้วส่งต่อไปยัง Onboarding Service

---

## Architecture Layers

```
Browser (Client)
    ↓
Next.js API Routes (BFF)
    ↓
Onboarding Service (Backend)
```

**Token Storage:** httpOnly cookies (ไม่ใช้ localStorage)
**State Management:** Zustand
**Data Fetching:** React Query

---

## 1. QR Login Flow (Main Flow)

### Step-by-step

```
1. User คลิก "Login" ใน Navbar
        ↓
2. useOpenQrLoginModal()
   → เรียก requestQrLogin()
   → POST /api/auth/generate-qr
   → Backend: POST /api/v1/customer/login/qr/generate
   → ได้: { refCode, qrValue, txId, countdown }
        ↓
3. เปิด QR Login Modal
   - แสดง QR image + refCode + countdown timer
        ↓
4. useQrPoll() — polling ทุก 3000ms
   → GET /api/auth/qr-poll?txID={txId}
   → Backend: GET /api/v1/customer/login/qr/poll?txID={txId}
        ↓
5. User สแกน QR ด้วยมือถือ
   → Status: PENDING → SCANNED → CONFIRMED
        ↓
6. เมื่อ status = CONFIRMED (มี oneTimeCode)
   → POST /api/auth/qr-token
   → Backend: POST /api/v1/customer/login/qr/token
   → ได้: { accessToken, refreshToken, expiredIn }
        ↓
7. saveUserTokens() — บันทึก token ลง httpOnly cookies
   - access_token (httpOnly, secure, sameSite=lax)
   - refresh_token (httpOnly, secure, sameSite=lax)
   - tr (session ID จาก id_token, ไม่ httpOnly)
        ↓
8. authStore.setAuthed(true)
   localStorage.setItem('after_login', ...)
        ↓
9. ส่ง Login Notification (fire-and-forget)
   → POST /api/auth/login-notification
        ↓
10. ปิด Modal + reload page
```

### QR Status Values

| Status | ความหมาย |
|--------|----------|
| `PENDING` | รอ user สแกน |
| `SCANNED` | สแกนแล้ว รอยืนยัน |
| `CONFIRMED` | ยืนยันแล้ว → exchange token |
| `EXPIRED` | QR หมดอายุ |
| `CANCELLED` | ยกเลิก |

---

## 2. Silent Refresh Flow

เกิดขึ้นเมื่อ `access_token` หมดอายุ (ทำงานใน `checkAuth()` ที่ run ตอน page load)

```
1. checkAuth() → isAuthenticated() = false
        ↓
2. requestRefreshToken()
   → POST /api/auth/refresh-token
   → อ่าน refresh_token จาก cookie
   → Backend: POST /api/v1/customer/refresh-token-client
        ↓
3. ได้ tokens ใหม่ → saveUserTokens()
   → User ยังคง authenticated อยู่
        ↓
[หาก refresh token หมดอายุด้วย]
4. clearUserTokens() + isAuthed = false
   → User ต้อง login ใหม่
```

---

## 3. Logout Flow

```
1. User คลิก Logout
        ↓
2. POST /api/auth/logout
   → ส่ง access_token ไปด้วย
   → Backend: POST /api/v1/customer/logout-client
        ↓
3. clearUserTokens() — ลบ cookies ทั้งหมด
        ↓
4. authStore.reset()
        ↓
5. Dispatch custom event: 'user:logout'
   → Navbar อัปเดตแสดงปุ่ม Login
```

---

## 4. Auth State (Zustand Store)

**File:** `src/context/auth.ts`

| State | Type | ความหมาย |
|-------|------|----------|
| `isAuthed` | boolean | ผู้ใช้ login แล้วหรือไม่ |
| `isLoadingAuth` | boolean | กำลังตรวจสอบ auth |
| `fullName` | string | ชื่อ user จาก JWT |

---

## 5. Modal UI States

**File:** `src/features/auth/components/qr-login-modal.tsx`

| State | แสดงผล |
|-------|--------|
| Normal | QR + refCode + countdown |
| Processing | QR จาง + spinner (หลังสแกน) |
| Expired | Overlay "หมดอายุ" + ปุ่ม refresh |
| Error | Overlay "Login Failed" + ปุ่ม retry |

---

## 6. BFF API Routes (Next.js)

| Method | Path | Backend Endpoint |
|--------|------|-----------------|
| POST | `/api/auth/generate-qr` | `/api/v1/customer/login/qr/generate` |
| GET | `/api/auth/qr-poll` | `/api/v1/customer/login/qr/poll` |
| POST | `/api/auth/qr-token` | `/api/v1/customer/login/qr/token` |
| POST | `/api/auth/refresh-token` | `/api/v1/customer/refresh-token-client` |
| POST | `/api/auth/logout` | `/api/v1/customer/logout-client` |
| POST | `/api/auth/login-notification` | `/api/v1/customer/login/qr/notification` |

---

## 7. Key Files Reference

| ไฟล์ | หน้าที่ |
|-----|--------|
| `src/context/auth.ts` | Auth Zustand store + checkAuth logic |
| `src/features/auth/services/server.ts` | saveUserTokens / clearUserTokens |
| `src/features/auth/services/client.ts` | JWT decode, isAuthenticated |
| `src/features/auth/services/qr-login.ts` | QR API calls + mappers |
| `src/features/auth/hooks/use-qr-poll.ts` | Polling hook (3s interval) |
| `src/features/auth/components/qr-login-modal.tsx` | QR Modal UI + state machine |
| `src/app/[locale]/(main)/layout.tsx` | เรียก checkAuth() ตอน mount |
| `src/components/layouts/navbar.tsx` | Login button + auth state display |
