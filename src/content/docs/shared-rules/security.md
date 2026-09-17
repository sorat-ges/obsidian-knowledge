---
title: Security & OTP Business Rules
description: กฎ OTP cooldown อายุรหัส การยืนยัน และการแยกประเภทธุรกรรม
tags: [logic, security, otp, rate-limit, redis]
status: active
lastUpdated: 2026-09-17
documentType: shared-rule
---

## 🎯 วัตถุประสงค์
เพื่อป้องกันการโจมตีระบบ (Brute Force / Spam) และควบคุมปริมาณการส่งข้อความ (OTP) ให้เป็นไปตามมาตรฐานความปลอดภัยและความคุ้มค่าทางธุรกิจ

## 📜 กฎการควบคุม OTP (OTP Rate Limit Rules)

### 1. OTP Cooldown (ระยะเวลารอคอย)
ระบบจะใช้ Redis ในการทำ Cooldown เพื่อป้องกันการขอ OTP ซ้ำในระยะเวลาที่สั้นเกินไป
- **ระยะเวลา Cooldown:** 60 วินาที
- **Redis Key Format:** `otp:countdown:{sequence}:{accountID}:{productID}` **(อัปเดตตาม Code)**
- **พฤติกรรม:**
  - หากมีการขอ OTP ซ้ำในขณะที่ Key ใน Redis ยังไม่หมดอายุ ระบบจะตอบกลับด้วย `HTTP 429 Too Many Requests`
  - ระบบจะแยก Cooldown ตามบัญชีลูกค้า (`accountID`) และสินค้า (`productID`)

### 2. OTP Expiry & Verification (การตรวจสอบความถูกต้อง)
- **อายุของรหัส OTP:** 5 นาที
- **จำนวนครั้งที่กรอกผิดได้:** สูงสุด 3 ครั้ง หากเกินรหัสจะถูก `Expired` ทันที
- **การใช้ซ้ำ (Re-use):** รหัส OTP 1 ชุด ใช้ยืนยันได้เพียง 1 ครั้งเท่านั้น

### 3. Sequence Separation (แยกประเภทธุรกรรม)
ระบบแยก Cooldown ตามประเภทธุรกรรม (`sequence`) ดังนี้:
- `withdraw-fiat`: สำหรับการถอนเงินบาท
- `withdraw-crypto`: สำหรับการถอนคริปโต

### 4. OTP Verification Audit Trail
สำหรับการยืนยัน OTP ทาง email ของ sequence ถอนเงิน `order-service` เตรียม audit action `VerifyOTP` เป็น `fail` ไว้ก่อนเรียก Thai Bulk และบันทึก audit แม้ provider ตอบ error หรือ OTP ไม่ผ่าน การบันทึกผล `success` จะเกิดหลัง update contact-verification status สำเร็จเท่านั้น หากการ update status ล้มเหลว audit จะไม่ถูกยกระดับเป็น success ส่วนความล้มเหลวของการบันทึก audit ถูก log แยกและไม่เปลี่ยนผลการยืนยันหรือ state ของ withdrawal order

## 🔄 ขั้นตอนการทำงาน (Logic Flow)

### การขอ OTP (Request OTP)
1. **Check Cooldown:** ตรวจสอบใน Redis ว่ามี Key `otp:countdown:...` อยู่หรือไม่
2. **Expire Old OTP:** หากมี OTP เก่าที่ค้างอยู่ ให้เปลี่ยนสถานะเป็น `expired` ใน Database
3. **Generate & Send:** สร้างรหัสใหม่และส่งผ่าน Third-party (Thai Bulk)
4. **Set Cooldown:** เมื่อส่งสำเร็จ ให้บันทึก Key ลง Redis พร้อมตั้งเวลา Expiry (TTL) 60 วินาที

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `pkg/verification/service.go`
- **Logic Functions**: `CheckCooldown`, `SetCooldown`, `generateCountdownKey`
- **Redis Key Template**: `otp:countdown:%s:%s:%s`

## วิธีตรวจสอบ
ตรวจสอบรูปแบบ Redis Key ด้วยคำสั่ง
`grep -n "func (s *VerificationService) generateCountdownKey" pkg/verification/service.go`
แล้วยืนยันว่ามีการรับค่า `sequenceKey`, `customerAccountID`, และ `productID` มาต่อกันเป็น Key
