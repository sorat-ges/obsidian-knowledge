---
title: State Machine & Lifecycle Business Rules
tags: [logic, state, lifecycle, transition, status]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: State Machine & Lifecycle

## 🎯 วัตถุประสงค์
เพื่อควบคุมการเปลี่ยนสถานะ (State Transitions) ของออเดอร์ประเภทต่างๆ ภายในระบบ `order-service` ให้เป็นไปตามลำดับที่ถูกต้อง ป้องกันข้อผิดพลาดจากการข้ามขั้นตอน (Invalid Transitions)

## 📜 กฎการเปลี่ยนสถานะ (State Transition Rules)

### 1. 💱 Swap Order Lifecycle
ออเดอร์แลกเปลี่ยนสินทรัพย์ (Crypto <-> Fiat)

**Valid Statuses:**
`draft` ➔ `open` ➔ `processing` ➔ `filling` ➔ `sync-ledger` ➔ `filled`

**End States (Terminal):**
`filled` (สำเร็จ), `cancelled` (ลูกค้ายกเลิก), `rejected` (ระบบปฏิเสธ)

| Status | คำอธิบาย (Description) |
| :--- | :--- |
| `draft` | ออเดอร์ถูกสร้างขึ้นในระบบ แต่ยังไม่ถูกส่งไปจับคู่ |
| `open` | ออเดอร์กำลังรอจับคู่ใน Order Book |
| `processing` | ระบบกำลังดำเนินการ (เริ่มจับคู่) |
| `filling` | กำลังทยอย Match กับคู่เทรด |
| `sync-ledger` | จับคู่เสร็จแล้ว กำลังปรับปรุงยอดบัญชีแยกประเภท |
| `filled` | **(Terminal)** การแลกเปลี่ยนเสร็จสมบูรณ์ 100% |

---

### 2. 💸 Withdrawal Lifecycle (ถอนเงิน / คริปโต)
กระบวนการถอนสินทรัพย์ออกจากระบบ

**Valid Statuses:**
`created` ➔ `order-request` ➔ `order-confirm` ➔ `order-processing` ➔ `order-verifying` ➔ `sync-ledger` ➔ `completed`

**End States (Terminal):**
`completed` (สำเร็จ), `cancelled` (ยกเลิก), `rejected` (ปฏิเสธ)

| Status | คำอธิบาย (Description) | Customer View (UI) |
| :--- | :--- | :--- |
| `order-request` | สร้างคำขอถอนเงินและรอการยืนยัน (เช่น OTP/Email) | `email pending` |
| `order-confirm` | ยืนยันตัวตนสำเร็จ กำลังรอดำเนินการ | `processing` |
| `order-processing` | ส่งข้อมูลให้ Bank / Fireblocks ดำเนินการ | `processing` |
| `completed` | **(Terminal)** เงินโอนเข้าบัญชีปลายทางสำเร็จ | `completed` |

---

### 3. 💰 Fund Order Lifecycle (กองทุน / ICO)
กระบวนการซื้อขายกองทุนหรือเสนอขายโทเคนดิจิทัล

**Valid Statuses (Success Flow):**
`created` ➔ `order-request` ➔ `order-confirm` ➔ `order-processing` ➔ `waiting-allot` ➔ `completed`

| การเปลี่ยนสถานะ (Transition) | เงื่อนไข / Action ที่กระตุ้น |
| :--- | :--- |
| `created` ➔ `order-request` | User กด Submit Order |
| `order-request` ➔ `order-confirm` | ยืนยันการชำระเงิน (Confirmed) |
| `order-confirm` ➔ `order-processing` | AM/SA อนุมัติ (Approved) |
| `order-processing` ➔ `waiting-allot` | ตรวจสอบการชำระเงินเรียบร้อย |
| `waiting-allot` ➔ `completed` | ระบบจัดสรรสินทรัพย์สำเร็จ (Allotted) |

## ⚠️ กฎเหล็กของ State Machine (Constraints)
1. **No Backward Transition:** ออเดอร์ไม่สามารถถอยหลังกลับไปสถานะก่อนหน้าได้ (เช่น จาก `completed` กลับไป `processing` **ไม่ได้**)
2. **Terminal State is Final:** เมื่อออเดอร์เข้าสู่สถานะ `completed`, `cancelled`, หรือ `rejected` จะไม่สามารถเปลี่ยนสถานะได้อีก
3. **Ledger Sync Dependency:** สถานะ `completed` หรือ `filled` จะเกิดขึ้นได้ **ก็ต่อเมื่อ** กระบวนการ `sync-ledger` (การลงบัญชี) สำเร็จแล้วเท่านั้น หาก Ledger ล้มเหลว ออเดอร์ต้องถูกค้างไว้หรือเข้าสู่โหมด Retry

## 🛠️ Technical Reference (Internal)
- **Primary Enum Files**:
  - `internal/constants/enum/order_crypto_enum.go` (Swap, Withdraw Crypto)
  - `internal/constants/enum/order_enum.go` (Fund Order)
- **State Map Variables**: `mappingNextStatusFlowATSSuccess`, `mappingNextActionFlowATSSuccess`

## 🤖 How to Verify (For AI Agent)
หากต้องการตรวจสอบ State Flow ปัจจุบัน หรือมีการเพิ่ม State ใหม่ ให้รันคำสั่ง:
`grep -A 20 "type SwapOrderStatus string" internal/constants/enum/order_crypto_enum.go`
หรือตรวจสอบการ Mapping จาก `order_enum.go` เพื่อดูตารางการเปลี่ยนสถานะ (Transition Matrix)
