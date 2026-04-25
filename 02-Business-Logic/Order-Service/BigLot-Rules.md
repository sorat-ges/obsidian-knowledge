---
title: BigLot Trading Business Rules
tags: [logic, biglot, trading, white-glove]
status: active
last-updated: 2026-04-19
---

# ⚙️ Business Logic: BigLot Trading (Bulk Order)

## 🎯 วัตถุประสงค์
จัดการระบบซื้อขายสินทรัพย์ดิจิทัลขนาดใหญ่ (Bulk) ผ่านช่องทาง White Glove เพื่อลดผลกระทบต่อราคาตลาด (Market Impact) โดยมี Dealer เป็นผู้ดำเนินการแทนลูกค้า

## 📜 กฎธุรกิจ (Business Rules)

| หัวข้อ | เงื่อนไข (Condition) | กฎ (Rule) / ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| **Channel** | BigLot Order | ต้องเป็น `WEARE_WEB_BIG_LOT` เท่านั้น |
| **Volume Size** | BigLot Order | ต้องระบุเป็น `bulk` |
| **Route Selection** | BigLot Order | บังคับใช้ Route `dealer` เท่านั้น |
| **Constraints** | BigLot Order | **ข้ามการตรวจสอบ** (Amount ขั้นต่ำ และ Maintenance Check) |
| **Precision** | BigLot Order | **ห้ามปัดเศษ** ปริมาณออเดอร์ (Quantity) |

## ➗ การคำนวณค่าธรรมเนียม (Fee)
1. **Matched Amount**: `Amount * Price`
2. **Fee Amount**: `MatchedAmount * (FeeRate / 100)` (ปัดลง 2 ตำแหน่ง)
3. **Total Amount**:
   - **BUY**: `MatchedAmount + FeeAmount`
   - **SELL**: `MatchedAmount - FeeAmount`

## 🛠️ Technical Reference
- **Handler**: `handler/white_glove_handler.go`
- **Service Logic**: `pkg/order_trade/service.go`
- **Volume Size Flag**: `bulk`
- **Error Codes**: `80005` (Amount Too Low), `80002` (Insufficient Asset)

## 🤖 How to Verify
1. ตรวจสอบการ Bypass ขั้นตอนปกติ: `grep -nE "WEARE_WEB_BIG_LOT|bulk" pkg/order_trade/service.go`
2. ทดสอบเรียก API BigLot ในช่วง Maintenance Mode เพื่อยืนยันว่าทำงานได้
3. ยืนยันการคำนวณค่าธรรมเนียมในหน่วยสตางค์ (2 decimal places)
