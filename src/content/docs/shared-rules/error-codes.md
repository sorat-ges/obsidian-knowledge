---
title: Error Code Registry (Diagnostic Guide)
description: Registry รหัสข้อผิดพลาดของ Trading, KYC retake และ Yield Payment Setup พร้อมสาเหตุและแนวทางวินิจฉัย
tags: [logic, error, debug, troubleshooting]
status: active
lastUpdated: 2026-07-28
documentType: shared-rule
---

เอกสารนี้ใช้เป็นแนวทางสำหรับนักพัฒนาในการวินิจฉัยปัญหาเมื่อ Business Flow คืน error code ที่ source ยืนยัน

## 📂 หมวดหมู่ 8xxxx: White Glove Errors (RM/Dealer)
ใช้สำหรับข้อผิดพลาดที่เกิดขึ้นในการเทรดแบบล็อตใหญ่ (BigLot/Bulk)

| Error Code | Constant Name | สาเหตุ (Root Cause) | การวินิจฉัย & วิธีแก้ไข (Resolution) |
| :--- | :--- | :--- | :--- |
| **80001** | `CodeWhiteGloveServiceMaintenance` | ระบบปิดปรับปรุงชั่วคราว | ตรวจสอบ `maintenance` table ว่าปิดคู่เหรียญนี้หรือไม่ |
| **80002** | `CodeWhiteGloveSwapInsufficientAsset` | สินทรัพย์ใน Wallet ไม่เพียงพอ | ตรวจสอบยอด `available` ของลูกค้าเทียบกับยอดที่สั่ง |
| **80003** | `CodeWhiteGloveSwapInsufficientOrderBook` | ราคาใน Order Book ไม่พอ | ตรวจสอบการเชื่อมต่อกับ Remarketer หรือปริมาณที่มีใน Book |
| **80004** | `CodeWhiteGloveSwapInsufficientLiquidity` | เกินขีดจำกัดสภาพคล่อง | ตรวจสอบ `DigitalAssetLiquidityMaxConfig` ของบริษัท |
| **80005** | `CodeWhiteGloveSwapAmountTooLow` | ยอดสั่งซื้อต่ำกว่าขั้นต่ำ | ตรวจสอบ Config ขั้นต่ำ (มักจะเป็น 50 THB หรือเทียบเท่า) |
| **80006** | `CodeWhiteGloveSwapInvalidInvestorClass` | ไม่พบ investor class ที่ใช้ filter product eligibility | ตรวจ customer identification และ investor-class sync |

สำหรับ [Big Lot](/business-flows/trading/big-lot/) ที่ส่ง `volume_size = bulk`, production path ข้าม minimum และ route/orderbook/liquidity pre-validation ดังนั้น `80003`, `80004` และ `80005` ไม่ใช่ expected error ของ valid bulk request แม้ handler จะมี mapping code ร่วมกับ White Glove swap

## 📂 หมวดหมู่ 9xxxx: Trading Errors (Customer Portal)
ใช้สำหรับข้อผิดพลาดที่เกิดขึ้นในการเทรดปกติผ่านหน้าเว็บหรือแอป

| Error Code | Constant Name | สาเหตุ (Root Cause) | การวินิจฉัย & วิธีแก้ไข (Resolution) |
| :--- | :--- | :--- | :--- |
| **90001** | `CodeTradingSwapInsufficientAsset` | เงินหรือเหรียญไม่พอเทรด | ตรวจสอบยอดเงินในบัญชีที่สามารถใช้ได้ (Available) |
| **90002** | `CodeTradingSwapInsufficientOrderBook` | ระบบหาคู่แมตช์ราคาไม่ได้ | อาจเกิดจากตลาดมีความผันผวนสูงหรือไม่มีคนตั้งราคา |
| **90004** | `CodeTradingSwapAmountTooLow` | ยอดเทรดต่ำกว่าขั้นต่ำ | เพิ่มจำนวนเงินบาทหรือเหรียญที่ต้องการเทรด |
| **90006** | `CodeTradingNoAvailableRoute` | ระบบหาเส้นทางเทรดไม่ได้ | ตรวจสอบว่ามี Route ใดบ้างที่เปิดอยู่ หรือ Remarketer ขัดข้องหรือไม่ |

## หมวดหมู่ Yield Payment Setup

Error ต่อไปนี้มาจาก `product-service`:

| Error Code | Constant Name | สาเหตุ | การวินิจฉัย |
| :--- | :--- | :--- | :--- |
| **400001** | `YieldPaymentSetupInvalidFileTemplateCode` | Header/type-hint ของ XLSX ไม่ตรง template | ดาวน์โหลด template ปัจจุบันและตรวจ header/date columns |
| **400004** | `YieldPaymentSetupFileRequiredCode` | Create ไม่มีไฟล์ หรือ edit อ้าง source ที่ไม่มี file record | ตรวจ `uploaded_file`, source setup ID และ file record |
| **400005** | `YieldPaymentSetupInvalidFileFormatCode` | MIME type ไม่ใช่ XLSX | ส่ง `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| **400006** | `YieldPaymentSetupInvalidDataFormatCode` | input, row, date, day-per-year หรือ rounding rule ไม่ผ่าน | ตรวจ required fields, row data และ rounding method/decimal places |
| **500001** | `yieldPaymentSetupFetchErrorCode` | ดึงรายการ setup ไม่สำเร็จ | ตรวจ query/repository ของ active setup list |
| **500002** | `projectOfferingOptionsFetchErrorCode` | ดึง project offering options ไม่สำเร็จ | ตรวจ project และ active-setup query |
| **500003** | `yieldPaymentSetupTemplateErrorCode` | ดึง template URL ไม่สำเร็จ | ตรวจ configuration ของ template URL |

รายละเอียด calculation และ recovery ดู [Yield Payment Setup](/business-flows/offering/yield-payment-setup/)

## หมวดหมู่ KYC Review Retake

Code ต่อไปนี้มาจาก `onboarding-service`:

| Error Code | Constant Name | ความหมายใน Flow | Recovery |
| :--- | :--- | :--- | :--- |
| **1000** | `INVALID_APPLICATION_STATUS` | `current_status` จาก client ไม่ตรงกับ application ปัจจุบัน | Refresh application แล้วประเมิน action ใหม่ก่อน retry |
| **4001** | `INVALID_REQUEST` | Request body ของ request-retake bind ไม่ผ่าน | แก้ payload โดยเฉพาะ `current_status` |
| **200** | `DOPA_SUCCESS` | DOPA ผ่านและข้อมูลที่ใช้ตัดสิน match ตรง | Application กลับเข้า KYC review |
| **2009** | `DOPA_DATA_CHANGE` | DOPA ผ่านแต่ profile หรือ address ไม่ตรงข้อมูลเดิม | ให้ลูกค้าตรวจ personal information ที่อัปเดตจากผล verify |
| **6600** | `ERROR_RE_APP_MAN` | DOPA error/expired branch ถูก map เป็น `ID Card Expired` | ตรวจ DOPA response และเริ่ม verification ใหม่ตาม UI ที่รองรับ |

รายละเอียด state และ comparison rule ดู [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/)

## 🛠️ วิธีการวินิจฉัยสำหรับนักพัฒนา
หากได้รับ Error Code ให้ดำเนินการตามลำดับดังนี้:
1. **Search Log:** ค้นหา Error Code นี้ในไฟล์ Log เพื่อดู Error Message แบบละเอียด (Detailed Error)
2. **Trace Logic:** ใช้ `Technical Reference` ในไฟล์กฎธุรกิจที่เกี่ยวข้องเพื่อดูจุดเกิดเหตุ
3. **Check Config:** ตรวจสอบค่าในฐานข้อมูลหรือ runtime configuration ที่ Flow นั้นอ้างอิง

## วิธีตรวจสอบ
- Trading: ตรวจ `order-service/internal/constants/error.go`
- KYC retake: ตรวจ `onboarding-service/internal/constants/enum/enum_code.go`, `handler/webportal/kyc-handler.go` และ `pkg/ekyc/dopasvc/dopa-service.go`
- Yield Payment Setup: ตรวจ `product-service/internal/constants/yield_payment_setup.go` และ `product-service/handler/yield_payment_setup_handler.go`
