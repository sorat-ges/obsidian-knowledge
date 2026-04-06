---
title: Fee & Campaign Business Rules
tags: [logic, fee, campaign, priority]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: Fee & Campaign System

## 🎯 วัตถุประสงค์
จัดการกฎการเลือกใช้ค่าธรรมเนียม (Fee Selection) และระบบแคมเปญ (Campaign) เพื่อให้มั่นใจว่าลูกค้าจะได้รับเรทที่ถูกต้องตามเงื่อนไขที่บริษัทกำหนด

## 📜 กฎการเลือกค่าธรรมเนียม (Fee Selection Rules)

ระบบใช้หลักการ **"Match First by Priority & Lowest Rate"** โดยมีลำดับดังนี้:

### 1. การกรองข้อมูลเบื้องต้น (Pre-filtering)
- **Status:** ต้องเป็น `active` เท่านั้น
- **Date:** อยู่ในช่วง `StartDate` และ `EndDate` (คำนวณแบบ Date-only ใน Timezone Bangkok)
- **Deleted:** `is_deleted = false`

### 2. ลำดับความสำคัญ (Priority Logic - ASC Sorting)
ระบบจะเรียงลำดับ Fee ทั้งหมดที่ผ่านการกรอง และเลือก **"ตัวแรกที่เงื่อนไขตรง"** ตามลำดับดังนี้:
1. **Priority (ASC):** เลขน้อยสำคัญกว่า (Campaign Priority = 1)
2. **FeeValue (ASC):** **(สำคัญ)** หาก Priority เท่ากัน ระบบจะเลือกตัวที่ค่าธรรมเนียม **ต่ำที่สุด** เสมอ
3. **SyncedAt (ASC):** หากเท่ากันทุกอย่าง จะเลือกตัวที่ถูกบันทึกเข้าระบบก่อน (Oldest first)

### 3. ตารางการตัดสินใจ (Decision Tree for AI)

| หากพบ Fee หลายรายการ | การตัดสินใจของระบบ (Decision) |
| :--- | :--- |
| Priority 1 vs Priority 100 | เลือก Priority 1 (แม้ค่าธรรมเนียมจะสูงกว่า) |
| Priority 1 (0.2%) vs Priority 1 (0.1%) | เลือก 0.1% (เนื่องจาก Sort แบบ ASC) |
| เงื่อนไขตรงหลายตัว | เลือกตัวแรกสุดหลังจาก Sort ตามกฎด้านบน |

## ➕ การทำงานร่วมกับ Additional Fee (Combined Logic)
ระบบจะทำการ **รวมยอด (Combine)** ค่าธรรมเนียมเข้าด้วยกันเป็นค่าเดียวก่อนส่งกลับ:

- หาก Main Fee มี `is_include_additional_fee = false`:
  - ระบบจะหา Additional Fee ที่ตรงเงื่อนไขที่สุด (ใช้กฎ Sorting เดียวกับ Main Fee)
  - **สูตร:** `FinalFee = MainFee + AdditionalFee`
- หาก Main Fee มี `is_include_additional_fee = true`:
  - **สูตร:** `FinalFee = MainFee` (ไม่บวกเพิ่ม)

## 🔄 ขั้นตอนการทำงาน (Logic Flow)
1. ดึงรายการ Main Fee ทั้งหมดที่ Valid ตามวันที่
2. จัดลำดับ (Sort) ตาม Priority -> FeeValue -> SyncedAt (ทั้งหมดเป็น ASC)
3. วนลูปหาตัวแรกที่เงื่อนไข (Condition) ตรงกับ User/Route/Symbol
4. หากพบ และต้องบวก Additional Fee ให้ทำขั้นตอนเดิมกับรายการ Additional Fee แล้วนำยอดมารวมกัน
5. ส่งผลลัพธ์กลับเป็นก้อนเดียว (`final_fee_value`)

## 🛠️ Technical Reference (Internal)
- **Primary Logic Path**: `pkg/order_trade/service_fee_rate.go`
- **Primary Function**: `getPossibleFeeRate`, `selectAdditionalFee`
- **Error Handling**: หากไม่พบ Fee ที่ตรงเงื่อนไขเลย ระบบจะส่ง Error `"no fee rate available"` (ไม่มี Error Code เฉพาะ)

## 🤖 How to Verify (For AI Agent)
ตรวจสอบกฎการ Sort ได้ที่:
`grep -A 15 "Sort ALL fees by Priority" pkg/order_trade/service_fee_rate.go`
ยืนยันว่าใช้ `LessThan(feeJ)` (ASC) และตรวจสอบการรวมยอดที่ `finalFeeValue = finalFeeValue.Add(additionalFeeValue)`
