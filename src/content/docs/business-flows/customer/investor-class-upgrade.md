---
title: Investor Class Upgrade Approval
description: Flow ขอและอนุมัติการเปลี่ยน investor class ตั้งแต่ customer application, employee approval, FundConnext profile sync จนถึง downstream customer sync
capability: Customer
services: [onboarding-service, web-portal, order-consumer, asset-consumer]
integrations: [FundConnext, Kafka]
aliases: [investor class upgrade, upgrade investor class, investor classification upgrade, approve investor class, customer investor class, upgrade-investor-class, investor class approval, เปลี่ยนประเภทผู้ลงทุน, อัปเกรด investor class, อนุมัติ investor class]
errorCodes: ["400", "401", "404", "500"]
status: active
lastUpdated: 2026-09-18
documentType: flow
---

## Purpose and scope

อธิบายการขอและอนุมัติการเปลี่ยน `investor_class` ตั้งแต่ customer สร้าง/submit application, เจ้าหน้าที่ตรวจและ approve/reject, `onboarding-service` sync profile กับ `FundConnext`, เปลี่ยน application/customer profile เป็นผลสำเร็จ และ publish downstream events

การอัปเดตในรอบนี้ยืนยัน recovery boundary สำคัญ: หลัง transaction ที่อนุมัติและเปลี่ยน customer profile commit แล้ว การ upload customer capture ด้วยสถานะ `EndFlow` เป็น best-effort; upload failure ถูก log และไม่ทำให้ approval response ล้มเหลว

## Trigger and preconditions

**Owner service: `onboarding-service`**

- Customer ต้อง authenticate ด้วย `PortalClaims` และส่ง investor-class code ที่ต้องการผ่าน `POST /api/v1/customer/application/investor-class`
- Customer ใช้ `POST /api/v1/customer/application/investor-class/{application_id}/submit` เพื่อ submit application ของตนเอง
- Employee ใช้ `POST /api/v1/customer/application/upgrade-investor-class/{application_id}/{action_type}` โดย `action_type` เป็น `approve` หรือ `reject`
- ก่อน action, Backend ตรวจ `current_status` ที่ client ส่งให้ตรงกับ application status ปัจจุบัน; ถ้าไม่ตรง response เป็น HTTP `200` พร้อม business code `INVALID_APPLICATION_STATUS` และไม่เดิน action ต่อ
- `web-portal` ส่ง investor-class code/name เมื่อเป็น approve และส่ง reason เป็น approval memo; handler/service path ที่ตรวจรอบนี้ใช้ค่าดังกล่าวใน approval update แต่ไม่พบ client-side rule ที่ override Backend validation

`web-portal` เป็น supporting client: หน้า Investor Class Upgrade อ่าน detail/action-flow และส่ง action ผ่าน BFF `/api/application/{applicationId}/approve`; Backend ยังคงเป็นผู้ยืนยัน status, profile update และ downstream behavior

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `onboarding-service` | Business owner; รับ application action, เปลี่ยน application/profile, เรียก FundConnext, upload capture, publish Kafka และส่ง notification |
| `web-portal` | Supporting client; แสดง application/action-flow, validate current status ผ่าน API และ trigger approve/reject |
| `FundConnext` | รับ profile update เมื่อ customer มี XAM mutual-fund account ตาม production path |
| `Kafka` | รับ investor-class event ไปยัง customer-data consumers และ registration notification |
| `order-consumer` | Executor ที่ source ยืนยันสำหรับ event `UpgradeInvestorClass`; update customer identification investor class |
| `asset-consumer` | Executor ที่ source ยืนยันสำหรับ event `UpgradeInvestorClass`; update asset-side customer identification investor class |

`sale-service` และ `product-service` อยู่ในรายการ topic ปลายทางที่ `onboarding-service` publish แต่ current source ที่ตรวจรอบนี้ยังไม่ยืนยัน consumer/execution path ของสอง topic จึงไม่สรุปผล downstream ของสอง service เป็นข้อเท็จจริง

## End-to-end sequence

### 1. Create and submit the application

**Owner and executing service: `onboarding-service`**

Customer สร้างหรือแก้ application ประเภท `upgrade-investor-class`; service ตรวจว่า request ได้รับอนุญาตและบันทึก `customer_change_request_log` จาก investor class เดิมไปยังค่าที่ขอ หลัง submit ระบบตรวจว่า application เป็นของ customer และยัง submit ได้ ก่อนเปลี่ยนไปตาม application workflow ที่ source กำหนด

รายละเอียด UI ของเอกสารเพิ่มเติมและสถานะรายการอ่านจาก `web-portal` เป็น supporting behavior; ไม่ override application validation ของ Backend

### 2. Validate employee action

**Owner service: `onboarding-service`**

**Executing client: `web-portal` สำหรับ action trigger**

Employee เลือก approve หรือ reject และส่ง `current_status`, investor class ที่อนุมัติ และ reason ผ่าน BFF ไปยัง `onboarding-service` ก่อน service เรียก `ValidateApplicationStatusByApplicationId` ถ้า status เปลี่ยนระหว่างเปิดหน้ากับกด action ระบบคืน `INVALID_APPLICATION_STATUS` เพื่อให้ client reload detail/action-flow

### 3. Approve and sync the profile

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

สำหรับ approve ระบบ:

1. บันทึก change request ใหม่เมื่อ investor-class code ที่ employee อนุมัติแตกต่างจากค่าที่มีใน application
2. บันทึก action `approved` และเปลี่ยน application จาก `to-approve` ผ่าน `single-form-sync`
3. ใน transaction ถัดไปเรียก `FundConnextUpdateProfile` เมื่อพบ XAM mutual-fund account, บันทึก action flow ที่ sync สำเร็จ, เปลี่ยน application เป็น `completed` และ update `customer_profile.investor_class_code`
4. ถ้า investor class เป็น HNW หรือ UHNW ให้ตั้ง `customer_profile.kyc_level = 3` ใน transaction เดียวกัน

ถ้า build หรือ update profile กับ FundConnext ล้มเหลว transaction ชุดนี้คืน error และ approval flow ยังไม่เดินต่อไปยัง Kafka/capture/email ตามลำดับใน `ApproveUpgradeInvestorClass`

### 4. Close customer capture after approval

**Owner service: `onboarding-service`**

**Executing integration: customer capture service ผ่าน `UploadCustomerCaptureV2`**

หลัง transaction ที่เปลี่ยน application เป็น `completed` commit แล้ว service ส่ง capture ของ application/identification เดิมด้วย status `EndFlow` ถ้า upload ล้มเหลว current behavior จะเขียน error log แล้วเดินต่อ โดยไม่ rollback application status หรือ customer profile และไม่คืน error จากขั้น capture นี้

### 5. Publish customer events and finish notification

**Owner service: `onboarding-service`**

**Executing services: `onboarding-service` เป็น Kafka producer; `order-consumer` และ `asset-consumer` เป็น event executors ที่ยืนยันได้**

ระบบสร้าง event `UpgradeInvestorClass` ที่มี `identification_id` และ `investor_class_code` แล้ว publish ไปยัง topic ของ customer-to-sale, customer-to-order, customer-to-product และ customer-to-asset; source producer log error ของสี่ topic แรกและเดินต่อ

`order-consumer` และ `asset-consumer` consume event เดียวกันและ update customer identification investor class ใน transaction ของแต่ละ service หาก customer ได้ KYC level 3 ระบบยัง publish `UpgradeKycLevel` ไป customer-to-order และส่ง KYC level ไป XD; สุดท้าย onboarding ส่ง email แจ้งอนุมัติ investor class หาก notification topic หรือ KYC/XD step ที่เป็น required path ล้มเหลว `ApproveUpgradeInvestorClass` คืน error ตาม implementation

### 6. Reject path

**Owner and executing service: `onboarding-service`**

เมื่อ action เป็น `reject`, handler เรียก `RejectUpgradeInvestorClass` และจบด้วย HTTP success เมื่อ service ทำงานสำเร็จ; source ที่ตรวจรอบนี้ไม่แสดงการเรียก `FundConnextUpdateProfile` หรือการ update investor class profile ใน reject path

## Business rules

- `onboarding-service` เป็น owner ของ application state และ customer profile; `web-portal` เป็นเพียง trigger/status guard
- `to-approve` ผ่าน `single-form-sync` ก่อน `completed`; approval phase ที่ sync FundConnext/profile แยก transaction จาก transition แรก
- HNW และ UHNW ทำให้ `kyc_level` เป็น `3`; investor class อื่นไม่ถูกสรุปให้เปลี่ยน KYC level จาก path นี้
- Customer capture `EndFlow` เป็น post-commit side effect; failure ถูก log แบบ non-fatal หลังการเปลี่ยน application/profile สำเร็จ
- Error จาก producer topic customer-to-sale/order/product/asset ถูก log ใน current producer path; source ยังไม่ยืนยัน retry หรือ delivery guarantee ของ topic เหล่านี้
- `order-consumer` และ `asset-consumer` update investor class จาก event ใน transaction ของตนเอง; downstream failure ไม่ได้ย้อน transaction ของ `onboarding-service`

## State transitions

**Owner service: `onboarding-service`**

| Current status | Action / condition | Next status |
| :--- | :--- | :--- |
| customer application in progress | customer submit ผ่าน ownership/status validation | application status ตาม submit path |
| `to-approve` | employee approve; save action flow | `single-form-sync` |
| `single-form-sync` | FundConnext/profile sync และ completion transaction สำเร็จ | `completed` |
| `to-approve` | employee reject | reject outcome ของ application ตาม `RejectUpgradeInvestorClass` |

การ upload capture ล้มเหลวหลัง `completed` ไม่สร้าง state transition ใหม่และไม่เปลี่ยน `completed` กลับเป็น error state

## Error and recovery behavior

**Owner service: `onboarding-service`**

- HTTP `401`: ไม่มีหรือใช้ไม่ได้ `PortalClaims`
- HTTP `400`: request body, application ID, ownership/status หรือ application action validation ไม่ผ่าน
- HTTP `200` + `INVALID_APPLICATION_STATUS`: `current_status` ที่ client ส่งไม่ตรงกับ database; client ควร reload ก่อน action ใหม่
- HTTP `500`: FundConnext/profile/database หรือ required Kafka/notification/XD path ล้มเหลวตาม handler/service mapping
- Customer capture upload failure หลัง completion: log เท่านั้น ไม่ rollback และไม่ทำให้ approval response failure
- Event executor ของ `order-consumer` หรือ `asset-consumer` ล้มเหลว: ต้องตรวจ consumer retry/operational state แยก; source ไม่ยืนยันให้ onboarding rollback profile/application

## Final outcomes

- Approve success: application เป็น `completed`, customer profile มี investor class ใหม่, downstream event ถูก publish ตาม producer path และส่ง approval email
- Approve with capture upload failure: application/profile ยังสำเร็จ แต่ customer capture EndFlow อาจไม่ถูกเก็บ; error อยู่ใน log
- Reject success: application ผ่าน reject path และไม่เปลี่ยน investor class profile จาก code path ที่ตรวจ
- Pre-commit validation/sync failure: approval ไม่ถือว่าสำเร็จและ downstream sequence หลังจุดล้มเหลวไม่ถูกเรียก

## Related shared rules

- [Customer Onboarding and KYC](/business-flows/customer/)
- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/)
- [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/)
- [Service Map](/system-context/service-map/)

## Code references

`onboarding-service`:

- `handler/customer-application-handler.go`: create/submit/approve/reject investor-class application endpoints
- `pkg/customer/application/service.go`: application create/submit and validation entry points
- `pkg/customer/application/customer-application-upgrade-service.go`: `ApproveUpgradeInvestorClass`, profile sync, completion, capture upload and event publication
- `routes/routes.go`: investor-class application routes

`web-portal`:

- `src/app/features/investor-class-upgrade/hooks/useInvestorClassUpgradeDetail.ts`: detail/action-flow read and approve request
- `src/app/features/investor-class-upgrade/hooks/useInvestorClassUpgradeAction.ts`: current-status guard and approve/reject payload
- `src/app/api/application/[applicationId]/approve/route.ts`: BFF action proxy

`order-consumer`:

- `pkg/customer-account/service.go`: `EventUpgradeInvestorClass`

`asset-consumer`:

- `pkg/customer-account/service.go`: `EventUpgradeInvestorClass`
