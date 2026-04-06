---
title: BigLot Trading Business Rules
tags: [logic, biglot, trading, white-glove]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: BigLot Trading (Bulk Order)

## 🎯 วัตถุประสงค์
BigLot คือระบบซื้อขายสินทรัพย์ดิจิทัลขนาดใหญ่ (Bulk) ผ่านช่องทาง White Glove โดยมี RM (Relationship Manager) หรือ Dealer เป็นผู้ดำเนินการแทนลูกค้า เพื่อลดผลกระทบต่อราคาตลาด (Market Impact)

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Channel** | ทุก BigLot Order | ต้องระบุเป็น `WEARE_WEB_BIG_LOT` |
| **Volume Size** | ทุก BigLot Order | ต้องระบุเป็น `bulk` (ใช้แยก Logic จาก Order ปกติ) |
| **Route** | ทุก BigLot Order | บังคับใช้ Route = `dealer` เท่านั้น |
| **Minimum Amount** | BigLot Order | **ข้ามการตรวจสอบ** (ไม่ต้องเช็คขั้นต่ำเหมือนการเทรดปกติ) |
| **Maintenance Check** | BigLot Order | **ข้ามการตรวจสอบ** (ทำรายการได้แม้ระบบปกติปิดปรับปรุง) |
| **Order Quantity** | BigLot Order | **ห้ามปัดเศษ** (ใช้ค่าทศนิยมตรงตามที่ระบุมา) |
| **Validation** | Route Validation | **ข้ามการตรวจสอบ** (ถือว่าเลือกมาจาก Order Book ที่ระบุแล้ว) |

## 👥 ผู้เกี่ยวข้องและสิทธิ์ (Roles & Permissions)
- **RM / Dealer**: เป็นผู้สร้างคำสั่งซื้อขายแทนลูกค้า
- **Permission ที่ต้องมี**: `WHITE_GLOVE_TRADING_RM_EXECUTE` หรือ `WHITE_GLOVE_TRADING_DEALER_EXECUTE`

## ➗ สูตรการคำนวณ Fee (BigLot)
การคำนวณจะอ้างอิงราคาจาก Order Book ที่ Dealer เลือกไว้

1. **Matched Amount:** `Amount * Price`
2. **Fee Amount:** `MatchedAmount * (FeeRate / 100)` (ปัดลง 2 ตำแหน่ง)
3. **Total Fiat Amount:**
   - **BUY:** `MatchedAmount + FeeAmount` (ลูกค้าจ่ายยอดเต็มรวมค่าธรรมเนียม)
   - **SELL:** `MatchedAmount - FeeAmount` (หักค่าธรรมเนียมออกจากเงินที่จะได้รับ)

## 🔄 ขั้นตอนการทำงาน (BigLot Flow)
1. **Inquiry**: RM ดึงรายการราคาเสนอซื้อ/ขายจาก BigLot Order Book (`GET /orderbook/biglot`)
2. **Calculate**: ระบบคำนวณยอดเงินและค่าธรรมเนียมตามราคาที่เลือก (`POST /swap/calculate`)
3. **Create Order**: สร้าง Order ด้วย `volume_size: bulk` และ `channel: WEARE_WEB_BIG_LOT`
4. **Execution**: ระบบส่งคำสั่งไปยัง Remarketer Service (Counterparty) ทันทีโดยไม่ผ่านระบบ Matching ปกติ
5. **Settlement**: เมื่อ Remarketer ยืนยันผล ระบบจะทำการปรับสมดุล (Balance) และสถานะออเดอร์

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `handler/white_glove_handler.go`, `pkg/order_trade/service.go`
- **Error Codes**:
  - `80005`: BigLot Amount Too Low
  - `80002`: BigLot Insufficient Asset

## 🤖 How to Verify (For AI Agent)
ตรวจสอบว่ามีการ Skip ขั้นตอนปกติสำหรับ BigLot โดยใช้คำสั่ง:
`grep -nE "WEARE_WEB_BIG_LOT|bulk" pkg/order_trade/service.go`
และดูในส่วน `CanSwap()` ว่ามีการเช็ค `input.VolumeSize == "bulk"` เพื่อ Bypass หรือไม่
