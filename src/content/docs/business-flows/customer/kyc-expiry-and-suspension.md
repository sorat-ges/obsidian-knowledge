---
title: KYC Expiry and Account Suspension
description: Background Flow คำนวณ KYC expiry จาก ID card, CDD และ suitability ก่อน suspend ลูกค้าและบัญชีพร้อม reason code
capability: Customer
services: [onboarding-service]
aliases: [KYC expiry, re-KYC, auto-cancel re-KYC, cancelled-by-system, restore customer capture, suspended by system, CDD expiry, suitability expiry, KYC หมดอายุ, ระงับบัญชี, ทบทวน KYC, คืนข้อมูล capture]
errorCodes: [SUP-004, SUP-005, SUP-006, SUP-007]
status: active
lastUpdated: 2026-08-22
documentType: flow
---

## Purpose and scope

อธิบาย background Flow ที่ `onboarding-service` ใช้กำหนด `kyc_expiry_date` และ `re_kyc_type` สำหรับลูกค้า active/suspended แล้วระงับ identification และทุก account เมื่อครบเงื่อนไข พร้อมสร้าง suspended-by-system application และยกเลิก application บางประเภทที่ยังทำไม่เสร็จ รวมถึงการ auto-cancel re-KYC และ restore ข้อมูลจาก customer capture

## Trigger and preconditions

**Owner service: `onboarding-service`**

- Background job ต้องได้ distributed lock ก่อนเริ่มรอบ
- Phase คำนวณอ่านลูกค้าที่ identification status เป็น active หรือ suspended
- Initial calculation ต้องมี customer profile และ account บริษัท XAM หรือ XD
- CDD candidate ใช้ latest CDD date/risk level
- Suitability candidate ใช้ evaluation date ของ Traditional สำหรับ XAM และ Digital สำหรับ XD
- Phase suspension ใช้ `ReKYCPeriod`, current expiry, application eligibility และ master reason description

## Participating services

| Service | Role |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor ของ expiry calculation, state update, application creation, suspension และ audit/batch result |

Source ไม่ยืนยัน consumer หรือ external service owner เพิ่มเติมใน Flow นี้

## End-to-end sequence

### 1. Start the background job

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Job `CalculateKycExpiryBackgroundJob` ป้องกันงานซ้อนด้วย distributed lock แล้วรันสอง phase: คำนวณ/บันทึก expiry ก่อน จากนั้นประเมิน suspension แม้ phase แรกมี error job ยังพยายาม phase suspension และคืน phase-one error หลัง phase สองจบ

### 2. Load expiry inputs

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

ระบบ preload profile, background KYC, latest CDD, account companies และ suitability Traditional/Digital เป็น chunk สำหรับลูกค้าที่ยังไม่มี `kyc_expiry_date`

ถ้า customer มี expiry เดิม ระบบไม่คำนวณวันใหม่ทั่วไป แต่ยังเปลี่ยน `re_kyc_type` เป็น `id-card-expired` เมื่อบัตรหมดอายุ หรือจาก `suitability-expired` เป็น `cdd-expired` เมื่อ CDD หมดอายุก่อน

### 3. Calculate initial KYC expiry

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

ระบบสร้าง candidate แล้วเลือกวันที่เร็วที่สุด:

- ID card: `card_expiry_date` → `id-card-expired`
- CDD: `cdd_date + 1 ปี` เมื่อ risk level = 3; risk อื่น `+2 ปี` → `cdd-expired`
- Suitability: `evaluation_date + 2 ปี` ของ XAM/Traditional และ/หรือ XD/Digital → `suitability-expired`

ถ้าข้อมูล CDD หรือ suitability ที่จำเป็นหาย candidate นั้นใช้ “เมื่อวาน” ทำให้ถูกมองว่าหมดอายุแล้ว หากลูกค้าไม่มี account XAM/XD จะข้าม record แทนการเดา company rule

### 4. Persist evaluation results

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Upsert `kyc_expiry_date`, `re_kyc_type` และ audit fields ด้วย actor `system`, บันทึก system audit ต่อ customer และเขียน batch-job result แยก success/error หากมี item error จะส่ง failure alert email

### 5. Select customers for suspension

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Phase suspension อ่าน customer KYC candidates, ตรวจ expiry เทียบ `ReKYCPeriod`, ตรวจการเปลี่ยน re-KYC type และเรียก `ValidateApplicationRequestAllowed` สำหรับ application type `suspended-by-system`; record ที่ไม่ถึงเงื่อนไขหรือไม่ allowed ถูก skip

### 6. Apply suspension transaction

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

ใน database transaction เดียว ระบบ:

1. สร้าง `suspended-by-system` application/action flow
2. update customer accounts เป็น suspended พร้อม reason code/description และเขียน `status_date` ของ account ในการ update เดียวกัน
3. update customer identification เป็น `suspended`
4. เปลี่ยน application เป็น `to-review`
5. auto-cancel unfinished application บางประเภทตาม target list

Reason mapping:

| `re_kyc_type` | Account reason |
| :--- | :--- |
| `force-expired` | `SUP-004` |
| `id-card-expired` | `SUP-005` |
| `cdd-expired` | `SUP-006` |
| `suitability-expired` | `SUP-007` |

### 7. Continue application handling

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

หลัง transaction ระบบส่ง suspended application เข้า application handling path ด้วย status `to-review` และ system identity หาก call นี้ล้มเหลว record ถูกนับเป็น error แต่ suspension transaction ที่ commit แล้วไม่ได้ rollback จาก source path นี้

ถ้ามี in-progress re-KYC application ที่ควรถูกยกเลิก ระบบเปลี่ยนเป็น `cancelled-by-system` และ restore captured customer data ใน transaction แยก:

1. เปลี่ยน application/action-flow เป็น `cancelled-by-system`/`cancel`
2. ลบข้อมูล customer ปัจจุบันที่อยู่ในขอบเขตการ restore แล้ว soft-delete registration history เฉพาะ `application_id` ของ re-KYC
3. insert snapshot จาก capture กลับเข้า identification, profile, background KYC/CDD/suitability, customer account/bank/investment-bank และ watchlist report พร้อม history ที่ capture มี
4. ถ้า application เดิมเป็น `to-review`, ลบ enhance documents และ DMS objects ของ application แล้วส่ง customer capture V2 ด้วย status `EndFlow`
5. หลัง transaction commit แล้วเรียก `CalculateKycExpiryDate` ใหม่ เพื่อคำนวณ expiry จากข้อมูลที่ restore แล้ว

ถ้า auto-cancel transaction ล้มเหลว ระบบ log error และหยุดการประมวลผล suspended-KYC ต่อสำหรับ customer รายนี้; batch worker ยังทำงานกับ customer รายอื่นตามรอบเดิม

## Business rules

- เมื่อ account ถูก suspend จาก re-KYC expiry path ระบบบันทึก `status_date` ของ account พร้อมการเปลี่ยน status เป็น `suspended`; ค่าเวลาขึ้นกับ update timestamp ของ path ที่เรียกใช้
- KYC expiry ใช้ candidate ที่เร็วที่สุด ไม่ใช่เลือกตามลำดับ ID/CDD/suitability
- CDD risk level 3 หมดอายุใน 1 ปี; risk level อื่นใน 2 ปี
- Suitability Traditional/Digital หมดอายุ 2 ปีหลัง evaluation date
- ลูกค้ามีทั้ง XAM และ XD ต้องมี evaluation date ของทั้งสองฝั่ง; ฝั่งใดหายทำให้ suitability candidate เป็นเมื่อวาน
- Missing CDD date/risk level ทำให้ CDD candidate เป็นเมื่อวาน
- Expiry record เดิมถูก guard ไม่ให้คำนวณวันใหม่ทั่วไป
- Reason description อ่านจาก master reason; code มาจาก re-KYC type mapping
- `bank-account-setting` และ `new-bank-account-request` ถูกข้ามใน cancel helper; cancellation แบบเฉพาะทางรองรับ upgrade investor class และ withdrawal-level upgrade
- Auto-cancel re-KYC ลบ/restore ข้อมูลใน transaction เดียวกับการยกเลิก application แต่คำนวณ KYC expiry ใหม่หลัง transaction เพื่อให้ query เห็นข้อมูลที่ restore แล้ว
- การ soft-delete registration history ของ re-KYC ระบุ `application_id`; ไม่ลบ history ของ flow อื่นของ customer ใน path นี้
- Customer capture ที่ restore ได้รวม watchlist personal/background/vulnerable-investor reports และ histories รวมถึง suitability Traditional/Digital และ histories เมื่อ field เหล่านั้นมีใน capture

## State transitions

**Owner service: `onboarding-service`**

| Entity | Transition |
| :--- | :--- |
| Customer background KYC | no expiry → earliest calculated expiry + re-KYC type |
| Existing KYC type | `suitability-expired` → `cdd-expired` เมื่อ CDD หมดอายุ; any non-force/non-ID type → `id-card-expired` เมื่อบัตรหมด |
| Customer account | current status → `suspended` พร้อม `SUP-004`/`005`/`006`/`007` และ `status_date` ของการเปลี่ยนสถานะ |
| Customer identification | current status → `suspended` |
| Suspended application | created → `to-review` |
| Eligible unfinished application | current status → cancellation path ตาม application type |
| Existing re-KYC application | current status → `cancelled-by-system` เมื่อ auto-cancel condition เป็นจริง |
| Restored customer data | customer tables → snapshot จาก capture หลัง cancellation transaction commit |

## Error and recovery behavior

- โหลด profile/background KYC ไม่ได้: phase calculation ล้มและบันทึก batch failure
- preload CDD/account/suitability ล้ม: customer ที่ต้อง initial-calculate ถูกข้ามพร้อม error detail
- upsert ราย customer ล้ม: record อื่นยังประมวลผลต่อและ error ถูกบันทึก/แจ้งเตือน
- phase suspension ประมวลผลแบบ worker pool และ recover panic ราย customer เพื่อไม่ให้ทั้ง batch หยุด
- database suspension transaction ล้ม: ไม่ commit state บางส่วน
- application handling หลัง transaction ล้ม: รายงาน error แต่ source ไม่มี compensating rollback/retry ที่ยืนยัน
- auto-cancel re-KYC ล้ม: ไม่เดินต่อไปสร้าง suspended-by-system application ให้ customer รายเดียวกันใน invocation นั้น และ source ไม่ยืนยัน retry อัตโนมัติของ auto-cancel
- job เขียน audit, batch log และ failure email; source ไม่ยืนยัน manual replay command

## Final outcomes

- ลูกค้ามี `kyc_expiry_date` และ `re_kyc_type` ที่อิง earliest verified expiry source
- ลูกค้าที่ถึง suspension rule มี identification และ account เป็น suspended พร้อม reason
- ระบบสร้าง suspended-by-system application ใน `to-review`
- unfinished applications ที่เข้า target ถูกยกเลิกตาม helper ของแต่ละ type
- re-KYC ที่ถูก auto-cancel จะคืนข้อมูลจาก capture, ปิด capture flow และคำนวณ expiry ใหม่หลัง restore
- Batch result ระบุจำนวน fetched, skipped, success และ error เพื่อใช้ติดตาม recovery

## Related shared rules

- [Customer Onboarding and KYC](/business-flows/customer/)
- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/)
- [Error Code Registry](/shared-rules/error-codes/)
- [Service Map](/system-context/service-map/)

## Code references

`onboarding-service`:

- `handler/customer-re-kyc-handler.go`: background-job trigger
- `pkg/customer/re-kyc/service.go`: job orchestration และ expiry calculation
- `pkg/customer/kyc-expiry/service.go`: CDD/suitability expiry periods
- `pkg/customer/re-kyc/kyc_suspend_service.go`: suspension, application และ cancellation processing
- `onboarding-service/pkg/customer/customer-process/process-delete.go`: scoped registration-history deletion และ restore entry point
- `onboarding-service/pkg/customer/customer-process/customer-process-service.go`: capture restore mapping รวม account, suitability และ watchlist report
- `onboarding-service/pkg/customer/application/service.go`: `OldCaptureId` ที่ผูกกับ application ใหม่
- `pkg/customer/re-kyc/helper.go`: suspension/cancellation eligibility
- `internal/constants/enum/rekyc_type.go`
- `internal/constants/enum/xd-customer-account-reason.go`
- `pkg/customer/customer-account/customer-account-repo/customer-account-repository.go`: account status/reason update และ `status_date`
