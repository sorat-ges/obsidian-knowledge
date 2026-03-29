# WhiteGloveHandler — ระบบ Permission (AuthorizationMiddleware)

## ภาพรวม
  

Sprint นี้นำ **`AuthorizationMiddleware`** มาเป็นระบบกลางจัดการ Permission แทนการเรียก Auth-ACL API ตรงๆ ภายใน Handler

แนวคิดหลักคือ **เรียก Auth-ACL API ครั้งเดียวต่อ Request** → **เก็บ Permissions ไว้ใน Context** → **ทุก Middleware/Handler ดึงใช้จาก Context ได้เลย**

  

---

  

## 1. AuthorizationMiddleware — โครงสร้างหลัก

  

**ไฟล์:** `utils/authorization/authorization.go`

  

```go

type AuthorizationMiddleware struct {

authService authacl.IAuthAclService // เรียก Auth-ACL API

permissionService IPermissionService // ดึง required permissions จาก Redis/DB

}

```

  

### Context Keys ที่ใช้เก็บข้อมูล

  

| Key | ชนิดข้อมูล | ข้อมูลที่เก็บ |

|---|---|---|

| `user_permissions` | `[]string` | รายการ Permission ของ User |

| `user_id` | `string` | User ID จาก JWT Claims |

| `user_roles` | `[]string` | รายการ Role ของ User |

  

---

  

## 2. Middleware Functions — การทำงานของแต่ละตัว

  

### 2.1 `LoadPermissions()` — โหลด Permission เข้า Context

  

> ✅ **ใช้ก่อนเสมอ** ก่อนจะเรียก Middleware ตัวอื่น

  

```

1. ดึง JWT Claims จาก context (ต้องผ่าน AuthRequiredMiddlewareEmployee มาก่อน)

2. เรียก Auth-ACL API: GET /api/v2/access-controls/permissions

3. เก็บ permissions, user_id, roles ลง Request Context

4. เรียก c.Next() → Handler หรือ Middleware ถัดไปทำงานได้เลย

```

  

ถ้าเรียก Auth-ACL API ไม่ได้ → ส่งกลับ **403 Forbidden** และ Abort ทันที

  

---

  

### 2.2 `RequireAnyPermissionsByID(idRunning int)` — ตรวจสอบ Permission จาก DB (OR Logic)

  

> ใช้กับ Route ที่ผ่าน `LoadPermissions()` แล้ว

  

```

1. ดึง user permissions จาก context (วางโดย LoadPermissions)

2. ดึง required permissions จาก Redis/DB ด้วย idRunning

3. HasAnyPermission → ถ้าผู้ใช้มี "อย่างน้อย 1" permission ที่กำหนด → ผ่าน

4. ถ้าไม่ผ่าน → 403 Forbidden + Abort

```

  

**ตัวอย่างการใช้งานใน Route:**

```go

groupEmployee.POST("/order-crypto/withdraw/create",

whiteGloveHandler.WhiteGloveCreateWithdrawalCrypto,

authMiddleware.RequireAnyPermissionsByID(constants.WhiteGloveCreateWithdrawalCrypto),

)

```

  

---

  

### 2.3 `RequirePermissionsByID(idRunning int)` — ตรวจสอบ Permission จาก DB (AND Logic)

  

> เหมือน 2.2 แต่ต้องมี **ครบทุก** Permission ที่กำหนด

  

```

HasAllPermissions → ถ้าไม่ครบ → 403 Forbidden + Abort

```

  

---

  

### 2.4 `RequirePermissions(...string)` — ตรวจสอบ Permission จาก String โดยตรง (OR Logic)

  

> ใช้เมื่อต้องการระบุ Permission เป็น string ตรงๆ โดยไม่ผ่าน DB/Redis

  

```go

authMiddleware.RequirePermissions("white_glove:list:dealer_view", "white_glove:list:rm_view")

```

  

---

  

### 2.5 `RequireAllPermissions(...string)` — ตรวจสอบ Permission จาก String โดยตรง (AND Logic)

  

> เหมือน 2.4 แต่ต้องมีครบทุกตัว

  

---

  

## 3. Permission ID Constants (White Glove)

  

**ไฟล์:** `internal/constants/auth.go`

  

Base ID เริ่มที่ `1000` แล้ว `iota` ต่อกันไปเรื่อยๆ:

  

| Constant | ID | Route ที่ใช้ |

|---|---|---|

| `WhiteGloveCreateWithdrawalCrypto` | 1001 | `POST /order-crypto/withdraw/create` |

| `CreateCryptoWalletAddress` | 1002 | `POST /order-crypto/wallet` |

| `CreateWithdrawFiatOrder` | 1003 | `POST /order-fiat/withdraw` |

| `SubmitWhiteGloveDepositOrder` | 1004 | `POST /order-fiat/:id/deposit/:id/submit` |

| `CreateWhiteGloveFiatDepositOrder` | 1005 | `POST /order-fiat/:id/deposit` |

| `CreateWhiteGloveOrderSwap` | 1006 | `POST /:id/order-trade/swap` |

  

> **หมายเหตุ:** ID เหล่านี้ต้องตรงกับ Permission ที่ถูก seed ไว้ใน Redis/DB — ต้องประสานกับทีม Infra

  

---

  

## 4. Auth-ACL Permission Constants (White Glove Role)

  

**ไฟล์:** `third_party/auth-acl/enum.go`

  

| Constant | ค่า | ใช้ตรวจสอบใน |

|---|---|---|

| `WHITE_GLOVE_LIST_DEALER_VIEW` | `white_glove:list:dealer_view` | `GetWhiteGloveCustomers` — กรองลูกค้าเฉพาะ Dealer |

| `WHITE_GLOVE_LIST_RM_VIEW` | `white_glove:list:rm_view` | `GetWhiteGloveCustomers` — ดูลูกค้าทั้งหมด |

| `WHITE_GLOVE_TRADING_DEALER_EXECUTE` | `white_glove:trading:dealer_execute` | `GetWhiteGloveSwapRoutes` (flag), `CreateWhiteGloveOrderSwap` (block) |

| `WHITE_GLOVE_TRADING_RM_EXECUTE` | `white_glove:trading:rm_execute` | `CreateWhiteGloveOrderSwap` (block) |

  

---

  

## 5. Flow การทำงานของ Permission ในแต่ละ Request

  

```

HTTP Request

│

▼

CombinedAuthMiddleware (AuthRequiredMiddlewareEmployee)

→ ตรวจสอบ JWT, ตั้งค่า PortalClaims

│

▼

authMiddleware.LoadPermissions()

→ เรียก Auth-ACL API ครั้งเดียว

→ เก็บ [permissions, user_id, roles] ใน Request Context

│

▼

authMiddleware.RequireAnyPermissionsByID(id)

→ ดึง required permissions จาก Redis/DB

→ เช็คว่า user มี permission ที่ต้องการ (OR logic)

→ 403 ถ้าไม่ผ่าน

│

▼

Handler Function

→ (บางตัว) ดึง permissions จาก Context มาเช็คเพิ่มเติม

เช่น GetWhiteGloveCustomers เช็ค DEALER_VIEW vs RM_VIEW

เพื่อตัดสิน scope ของข้อมูลที่แสดง

```

  

---

  

## 6. สรุปการเปลี่ยนแปลงใน Sprint นี้

  

| ส่วน | สิ่งที่เพิ่ม/เปลี่ยน |

|---|---|

| `utils/authorization/authorization.go` | `AuthorizationMiddleware` ใหม่ พร้อม `LoadPermissions`, `RequireAnyPermissionsByID`, `RequirePermissionsByID`, `RequirePermissions`, `RequireAllPermissions` |

| `internal/constants/auth.go` | Permission ID constants สำหรับ White Glove (1001–1006) |

| `third_party/auth-acl/enum.go` | Permission string constants แยกตาม Role (Dealer/RM) |

| `routes/route.go` | Route White Glove ใช้ `LoadPermissions()` + `RequireAnyPermissionsByID()` |

| Handler `GetWhiteGloveCustomers` | เช็ค DEALER_VIEW/RM_VIEW เพื่อ scope ข้อมูล |

| Handler `GetWhiteGloveSwapRoutes` | เช็ค DEALER_EXECUTE เพื่อส่ง `IsDealerTrading` flag |

| Handler `CreateWhiteGloveOrderSwap` | Block ถ้าไม่มี RM_EXECUTE หรือ DEALER_EXECUTE |

| CORS | ไม่มีการเปลี่ยนแปลง — จัดการที่ Infrastructure Layer |