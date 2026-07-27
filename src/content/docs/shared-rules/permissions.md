---
title: Permissions & Access Control (ACL) Business Rules
description: กฎการโหลด ตรวจสอบ และใช้สิทธิ์เพื่อควบคุม API ข้อมูล และการทำรายการ
tags: [logic, permission, acl, auth, roles]
status: active
lastUpdated: 2026-04-06
documentType: shared-rule
---

## 🎯 วัตถุประสงค์
เพื่อควบคุมการเข้าถึงข้อมูลและฟังก์ชันต่างๆ ในระบบ (Authorization) โดยแบ่งตามบทบาทหน้าที่ (Roles) และสิทธิ์ (Permissions) ของผู้ใช้งาน เพื่อความปลอดภัยและความถูกต้องของข้อมูล

## 📜 กฎการควบคุมการเข้าถึง (Access Control Rules)

### 1. ระบบ Middleware (Permission Guard)
ระบบใช้ `AuthorizationMiddleware` ในการตรวจสอบสิทธิ์ก่อนเข้าถึง Handler ทุกครั้ง
- **Load Phase:** ระบบจะเรียก Auth-ACL API เพื่อโหลดรายการ Permission ของ User เก็บไว้ใน Request Context (เรียกเพียง 1 ครั้งต่อ Request)
- **Check Phase:**
  - `RequireAnyPermissions`: ผู้ใช้ต้องมี **"อย่างน้อย 1"** ในรายการสิทธิ์ที่กำหนด (OR Logic)
  - `RequireAllPermissions`: ผู้ใช้ต้องมี **"ครบทุกสิทธิ์"** ที่กำหนด (AND Logic)
- **Denial:** หากไม่มีสิทธิ์ ระบบจะตอบกลับด้วย `HTTP 403 Forbidden` ทันที

### 2. ประเภทของสิทธิ์ (Permission Types)
| ประเภท | การใช้งาน | ตัวอย่าง |
| :--- | :--- | :--- |
| **API Gate** | บล็อกการเข้าถึงที่ระดับ Route | `fund_order:list:view` |
| **Data Filter** | กรองข้อมูลที่มองเห็นได้ใน Handler | `white_glove:list:dealer_view` (เห็นเฉพาะลูกค้าตนเอง) |
| **Action Block** | บล็อกการทำรายการ (Execute) | `white_glove:trading:rm_execute` |

### 3. บทบาทและสิทธิ์หลัก (Key Roles & Permissions)

#### White Glove Trading
- **RM (Relationship Manager):**
  - สิทธิ์: `white_glove:list:rm_view`, `white_glove:trading:rm_execute`
  - ขอบเขต: ดูแลลูกค้าทั่วไปและสร้างคำสั่งซื้อขายได้
- **Dealer:**
  - สิทธิ์: `white_glove:list:dealer_view`, `white_glove:trading:dealer_execute`
  - ขอบเขต: เห็นข้อมูลในมุมมอง Dealer และมีสิทธิ์อนุมัติ/ดำเนินการเทรดแทนลูกค้า

## 🔄 ขั้นตอนการทำงาน (Logic Flow)
1. **Authentication:** ตรวจสอบ JWT Token และดึง Portal Claims (User ID, Roles)
2. **Permission Loading:** Middleware ดึงสิทธิ์ทั้งหมดของ User จาก Auth-ACL Service
3. **Authorization:**
   - เทียบสิทธิ์ใน Context กับสิทธิ์ที่ Route นั้นๆ ต้องการ
   - หากผ่าน: ดำเนินการต่อที่ Handler
   - หากไม่ผ่าน: Abort Request (403)
4. **Contextual Logic:** ภายใน Handler อาจมีการดึงสิทธิ์จาก Context มาเช็คอีกครั้งเพื่อ **กรองข้อมูล (Filter)** ให้เหมาะสมกับบทบาทนั้นๆ

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `utils/authorization/authorization.go`
- **Auth ACL API**: `/api/v2/access-controls/permissions`

## วิธีตรวจสอบ
รันคำสั่ง `grep -rn "RequireAnyPermissionsByID" utils/authorization/authorization.go`
และตรวจสอบ `LoadPermissions()` ว่ามีการเก็บสิทธิ์ไว้ใน Context จริงหรือไม่
