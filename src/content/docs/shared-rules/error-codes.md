---
title: Error Code Registry (Diagnostic Guide)
description: รหัสข้อผิดพลาดของการซื้อขาย พร้อมสาเหตุและแนวทางวินิจฉัย
tags: [logic, error, debug, troubleshooting]
status: active
lastUpdated: 2026-04-06
documentType: shared-rule
---

เอกสารนี้ใช้เป็นแนวทางสำหรับนักพัฒนาในการวินิจฉัยปัญหา (Diagnosis) เมื่อเกิดข้อผิดพลาดจากระบบ Order-Service

## 📂 หมวดหมู่ 8xxxx: White Glove Errors (RM/Dealer)
ใช้สำหรับข้อผิดพลาดที่เกิดขึ้นในการเทรดแบบล็อตใหญ่ (BigLot/Bulk)

| Error Code | Constant Name | สาเหตุ (Root Cause) | การวินิจฉัย & วิธีแก้ไข (Resolution) |
| :--- | :--- | :--- | :--- |
| **80001** | `CodeWhiteGloveServiceMaintenance` | ระบบปิดปรับปรุงชั่วคราว | ตรวจสอบ `maintenance` table ว่าปิดคู่เหรียญนี้หรือไม่ |
| **80002** | `CodeWhiteGloveSwapInsufficientAsset` | สินทรัพย์ใน Wallet ไม่เพียงพอ | ตรวจสอบยอด `available` ของลูกค้าเทียบกับยอดที่สั่ง |
| **80003** | `CodeWhiteGloveSwapInsufficientOrderBook` | ราคาใน Order Book ไม่พอ | ตรวจสอบการเชื่อมต่อกับ Remarketer หรือปริมาณที่มีใน Book |
| **80004** | `CodeWhiteGloveSwapInsufficientLiquidity` | เกินขีดจำกัดสภาพคล่อง | ตรวจสอบ `DigitalAssetLiquidityMaxConfig` ของบริษัท |
| **80005** | `CodeWhiteGloveSwapAmountTooLow` | ยอดสั่งซื้อต่ำกว่าขั้นต่ำ | ตรวจสอบ Config ขั้นต่ำ (มักจะเป็น 50 THB หรือเทียบเท่า) |

## 📂 หมวดหมู่ 9xxxx: Trading Errors (Customer Portal)
ใช้สำหรับข้อผิดพลาดที่เกิดขึ้นในการเทรดปกติผ่านหน้าเว็บหรือแอป

| Error Code | Constant Name | สาเหตุ (Root Cause) | การวินิจฉัย & วิธีแก้ไข (Resolution) |
| :--- | :--- | :--- | :--- |
| **90001** | `CodeTradingSwapInsufficientAsset` | เงินหรือเหรียญไม่พอเทรด | ตรวจสอบยอดเงินในบัญชีที่สามารถใช้ได้ (Available) |
| **90002** | `CodeTradingSwapInsufficientOrderBook` | ระบบหาคู่แมตช์ราคาไม่ได้ | อาจเกิดจากตลาดมีความผันผวนสูงหรือไม่มีคนตั้งราคา |
| **90004** | `CodeTradingSwapAmountTooLow` | ยอดเทรดต่ำกว่าขั้นต่ำ | เพิ่มจำนวนเงินบาทหรือเหรียญที่ต้องการเทรด |
| **90006** | `CodeTradingNoAvailableRoute` | ระบบหาเส้นทางเทรดไม่ได้ | ตรวจสอบว่ามี Route ใดบ้างที่เปิดอยู่ หรือ Remarketer ขัดข้องหรือไม่ |

## 🛠️ วิธีการวินิจฉัยสำหรับนักพัฒนา
หากได้รับ Error Code ให้ดำเนินการตามลำดับดังนี้:
1. **Search Log:** ค้นหา Error Code นี้ในไฟล์ Log เพื่อดู Error Message แบบละเอียด (Detailed Error)
2. **Trace Logic:** ใช้ `Technical Reference` ในไฟล์กฎธุรกิจที่เกี่ยวข้องเพื่อดูจุดเกิดเหตุ
3. **Check Config:** ตรวจสอบค่าในฐานข้อมูลที่เกี่ยวข้อง (เช่น `transaction_fee`, `maintenance`)

## วิธีตรวจสอบ
รันคำสั่ง `grep -rn "CodeTrading" internal/constants/error.go`
เพื่อดูรายการ Error Codes ล่าสุดที่ระบบรองรับ และตรวจสอบว่ามีการเพิ่มรหัสใหม่ (เช่น 10xxx) เข้ามาหรือไม่
