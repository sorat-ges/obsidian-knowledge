---
title: {{title}}
tags: [logic, domain]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: [ชื่อเรื่อง]

## 🎯 วัตถุประสงค์
*อธิบายสั้นๆ ว่า Logic นี้ทำเพื่ออะไร (ใครทำ? ทำที่ไหน?)*

## 📜 กฎธุรกิจ (Business Rules)
*สรุปเป็นตารางหรือ Bullets เพื่อให้ AI อ่านง่าย*

| เงื่อนไข (Condition) | กฎ (Rule) | ผลลัพธ์ (Result) |
| :--- | :--- | :--- |
| ตัวอย่าง: สินค้า SIRIHUB2 | ห้ามทำ Limit Order | ให้ Error 422 |

- ✅ [กฎข้อที่ 1]
- ✅ [กฎข้อที่ 2]
- ❌ [สิ่งที่ห้ามทำ]

## 🔄 ขั้นตอนการทำงาน (Logic Flow)
1. Step 1: ตรวจสอบ...
2. Step 2: คำนวณ...
3. Step 3: บันทึก...

## 🚦 สถานะและการเปลี่ยนผ่าน (Status Transitions)
*ถ้ามีการเปลี่ยนสถานะ เช่น Order Status*
- `OLD_STATUS` -> `NEW_STATUS` (เงื่อนไข: ...)

## 🛠️ อ้างอิงระบบ (Technical Context)
- **Domain/Service**: [e.g. Order Service]
- **Relevant Code Path**: [e.g. pkg/order/service.go]
- **Constants**: [e.g. internal/constants/order.go]

## ⚠️ ข้อควรระวัง (Edge Cases)
- [กรณีผิดพลาด 1]
- [กรณีผิดพลาด 2]
