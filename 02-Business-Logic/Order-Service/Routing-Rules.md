---
title: Routing Logic & Best Route Selection
tags: [logic, routing, swap, best-route]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: Routing & Best Route Selection

## 🎯 วัตถุประสงค์
จัดการการค้นหาและคัดเลือกเส้นทางการแลกเปลี่ยน (Swap Routes) ที่ดีที่สุดสำหรับลูกค้า โดยคำนวณจากราคา, ค่าธรรมเนียม, สภาพคล่อง และประเภทของผู้ใช้งาน

## 📜 กฎการคัดเลือก (Selection Rules)

### 1. การจัดลำดับ (Sorting Strategy)
1. **Sort by NetAmount (DESC):** ระบบจะคำนวณจำนวนสุทธิที่ลูกค้าจะได้รับ (Net Amount) ของทุก Route แล้วเรียงจากมากไปน้อยก่อนเสมอ
2. **Prioritize Full Match:** ให้ความสำคัญกับ Route ที่สามารถจับคู่คำสั่งได้เต็มจำนวน (`MatchResult = full`) และมีสินค้าพร้อม (`HasOrder = true`)

### 2. กฎการเลือก Best Route (finalizeSwapRoutes)
| เงื่อนไข | การดำเนินการ (Action) |
| :--- | :--- |
| **มี Mixed Route** | ย้าย `mixed` route ไปไว้อันดับ 1 (หน้าสุด) เสมอ |
| **ไม่มี Mixed Route** | ค้นหา Route แรกที่ `HasOrder=true` และ `FullMatched` แล้วย้ายขึ้นมาเป็นอันดับ 1 พร้อม Mark เป็น `IsBestRoute` |
| **Dealer Trading** | ถ้ามี `mixed` ระบบจะ Mark `IsBestRoute` ให้กับ Route อื่นที่ไม่ใช่ mixed เพื่อให้ Dealer มีตัวเลือกสำรอง |

### 3. การแสดงผล (Visibility Control)
- **Customer:** จะเห็นเพียง **1 Route** เท่านั้น (คืออันดับ 1 ที่ระบบเลือกให้)
- **Dealer:** จะเห็น **ทุก Route** ที่เป็นไปได้ เพื่อใช้ในการตัดสินใจแทนลูกค้า

## ➗ สูตรคำนวณที่เกี่ยวข้อง
- **Net Amount (BUY):** `(Amount - OrderFee) / Rate`
- **Net Amount (SELL):** `MatchedAmount - OrderFee`

## 🔄 ขั้นตอนการทำงาน (Routing Flow)
1. **Inquiry:** เรียก Remarketer Service เพื่อดึง Route ทั้งหมดที่เป็นไปได้
2. **Calculation:** คำนวณ Fee และ Net Amount ของทุก Route ตามกฎใน `Swap-Rules.md`
3. **Finalize:** 
   - จัดลำดับตาม Net Amount
   - จัดการ Mixed Route และ Best Route (ตามกฎด้านบน)
   - Trim รายการออกตามสิทธิ์ของผู้ใช้งาน (Dealer/Customer)
4. **Response:** ส่งรายการ Route กลับไปยัง UI

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `pkg/order_trade/service.go`
- **Primary Function**: `finalizeSwapRoutes`
- **Error Codes**:
  - `90006`: No Available Route (ไม่มีเส้นทางที่ใช้งานได้)

## 🤖 How to Verify (For AI Agent)
หากต้องการตรวจสอบความถูกต้องของการเลือก Best Route ให้รัน:
`grep -n "func finalizeSwapRoutes" pkg/order_trade/service.go`
และตรวจสอบเงื่อนไข `if mixedIndex >= 0` และ `if bestIndex >= 0` ว่ามีการสลับ Mixed/Best Route มาหน้าสุดจริงหรือไม่
