---
title: Customer Identity Update Request
description: Flow เปิดคำขออัปเดตบัตรประชาชนจาก Mobile และสร้าง draft application กับ registration state ใน onboarding-service
capability: Customer
services: [onboarding-service, xspring-mobile-app]
aliases: [customer identity update, ID update, id-update, identity update request, update ID card, expired ID card update, อัปเดตบัตรประชาชน, อัปเดตข้อมูลบัตร, ต่ออายุบัตรประชาชน, บัตรประชาชนหมดอายุ, ID_CARD_EXPIRED]
errorCodes: ["APPLICATION_NOT_ALLOWED", "ID_CARD_EXPIRED", "400", "401", "500"]
status: active
lastUpdated: 2026-10-08
documentType: flow
---

## Purpose and scope

อธิบายการเริ่มคำขอ `id-update` ตั้งแต่ Mobile เปิดหน้าอัปเดตบัตรจน `onboarding-service` ตรวจสิทธิ์และสร้าง application สถานะ `draft` พร้อม registration state สำหรับเริ่มยืนยันตัวตนด้วยบัตรใหม่ หน้านี้ยังไม่ยืนยันการส่ง application กลับเข้า KYC review หรือ final outcome เพราะไม่พบ production caller ของ completion method ใน source ปัจจุบัน

## Trigger and preconditions

**Owner service: `onboarding-service`**

- Mobile มีหน้า `UpdateIdScreen`, ขอ current identity-update status ด้วย `GET /api/v1/customer/id-update` เมื่ออ่านหน้า และเรียก `POST /api/v1/customer/id-update` เมื่อเริ่มคำขอ; Backend ปัจจุบันรองรับเฉพาะ POST
- `onboarding-service` ต้องรับ authenticated `PortalClaims` และแปลง `UserUUID` เป็น identification UUID ได้
- `ValidateApplicationRequestAllowed` ต้องอนุญาต application type `id-update`; ถ้าถูก block จะคืน `APPLICATION_NOT_ALLOWED` พร้อมชนิด application ที่ block
- Route ใช้ `APIKeyCustomerIDUpdateRequest`

## Participating services

| Service | Responsibility |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor ของ eligibility check, draft application, change-request snapshot และ registration state/history |
| `xspring-mobile-app` | Supporting client ที่เปิดหน้าคำขอและส่ง POST trigger; client ไม่เป็น owner ของ eligibility หรือ state transition |

## End-to-end sequence

### 1. Open the identity update screen

**Owner service: `onboarding-service`**

**Executing service: `xspring-mobile-app`**

Mobile มี `UpdateIdScreen` และพยายามอ่าน status ด้วย GET ก่อนส่ง POST เพื่อเริ่มคำขอ อย่างไรก็ตาม route `EntryPointScreen` ที่เชื่อมไปหน้านี้ถูกลงทะเบียนเฉพาะ non-production flavor จึงยังยืนยัน production entry point จาก repository ที่ตรวจไม่ได้; GET นี้ไม่มี route ใน `onboarding-service` ปัจจุบัน

### 2. Authenticate and check application eligibility

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Handler ตรวจ `PortalClaims`, parse `UserUUID` และเรียก `ValidateApplicationRequestAllowed` ด้วย type `id-update` ก่อนเรียก service สร้างคำขอ Handler บันทึก audit ด้วย sequence `id_update`, action `create-request` และผล success/fail

### 3. Create the draft application and initial actionflow

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

ภายใน database transaction ระบบอ่าน latest customer capture แล้วสร้าง application ที่ `status=draft`, `application_type=id-update`, `application_channel=XSPRING_APP` และเชื่อม `OldCaptureId` ไปยัง capture เดิม จากนั้นบันทึก actionflow `created` โดยมี `StartApplicationStatus=request`

### 4. Save the customer snapshot and prepare registration steps

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

ระบบบันทึก snapshot ว่ามี account XAM/XD ที่เปิดอยู่หรือไม่ พร้อม default-bank flag ใน `CustomerChangeRequestLog`; ล้าง watchlist report เฉพาะ `AgeCondition`, `DOPA`, `IDIsNotExpired` และ `MaximumAge`; และเคลียร์ re-KYC flag ใน background KYC

Registration state เริ่มที่ `identity-verification/front-card-scan` ภายใต้ `FlowIDUpdate` และสร้าง history สำหรับ identity verification, personal information, suitability และ bank-account steps ตามลำดับที่กำหนดโดย status builder

## Business rules

- Request eligibility เป็นกฎของ `onboarding-service`; client ไม่มีสิทธิ์ override เมื่อ application อื่น block คำขอ
- การสร้าง application, actionflow, change-request log และ registration state/history อยู่ใน transaction ของ ID Update service
- เริ่มด้วย `draft` เท่านั้น; การสร้าง request ไม่ได้ยืนยันว่า identity verification, suitability, bank update หรือ KYC approval เสร็จแล้ว
- `GET /api/v1/customer/status` ส่ง expiry status แยกต่างหาก; expiry warning/expired ไม่ได้ยืนยันว่า ID Update request ถูกสร้างหรือ submitted
- KYC approver read path รู้จัก application type `id-update`; การรองรับใน review/read model ไม่ยืนยันว่า request completion หรือ submission path ถูกเชื่อมใช้งานแล้ว

## State transitions

| Trigger | Application | Registration |
| :--- | :--- | :--- |
| Mobile POST ผ่าน eligibility check | ไม่มีคำขอที่ block → `draft` (`id-update`) | → `identity-verification/front-card-scan` ใน `FlowIDUpdate`; สร้าง history สำหรับ steps ถัดไป |

## Error and recovery behavior

- Claims ไม่ใช่ `PortalClaims`: HTTP `401` และไม่สร้าง application
- `UserUUID` parse ไม่ได้: HTTP `400` และไม่สร้าง application
- Application type อื่น block คำขอ: HTTP `400`, message เริ่มด้วย `APPLICATION_NOT_ALLOWED`; client ต้องจัดการ application ที่ block ตาม flow ของมันก่อน retry
- Eligibility lookup หรือการสร้าง request ล้มเหลว: HTTP `500`; service transaction คืน error และ handler บันทึก audit result เป็น fail
- Audit-log write failure ถูก log แยก และไม่เปลี่ยน response ของ request

## Final outcomes

- Success: `onboarding-service` สร้าง draft `id-update` application, เก็บ capture/account snapshot และเริ่ม `FlowIDUpdate` ที่ front-card scan
- Failure: request คืน HTTP error ตาม validation/service path; ตรวจ registration/application state ปัจจุบันก่อน retry
- Completion, review submission และการตัดสิน KYC ปลายทางยังต้องยืนยันกับเจ้าของระบบ

## Related shared rules

- [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/)
- [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/)
- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`onboarding-service`:

- `routes/routes.go`: registers `POST /api/v1/customer/id-update` only
- `handler/customer-id-update-handler.go`: authentication, eligibility check and audit result
- `pkg/customer/id-update/service.go`: transaction creating application, snapshot and registration history
- `internal/constants/enum/xpg-customer-registartion-status.go`: ID Update and Retake ID Update step mapping
- `pkg/customer/registrationcomplete/service.go`: `CompleteDraftIDUpdate` exists, but no production caller was found

`xspring-mobile-app`:

- `lib/app.dart`: registers the EntryPoint screen only for non-production flavors
- `lib/services/id_update/id_update_service.dart`: GET and POST calls to `/api/v1/customer/id-update`
- `lib/domains/id_update/screen.dart`: ID Update screen
- `lib/res/components/bottom_sheet/id_card_update_bottom_sheet.dart`: order-error ID update bottom sheet and current Update button behavior

## Unresolved implementation boundaries

- Mobile also calls `GET /api/v1/customer/id-update` and expects `expiry_date`, `steps`, `is_force` and `flow_type`; current `onboarding-service` registers POST only. Backend and frontend contracts do not match.
- The app only exposes the current EntryPoint route for non-production flavors; a production user journey to `UpdateIdScreen` is not confirmed.
- `ID_CARD_EXPIRED` maps to an ID-card bottom sheet whose Update button currently closes the sheet; its description uses the fixed date `12/09/2025` and does not navigate to `UpdateIdScreen`.
- `CompleteDraftIDUpdate` has no production caller in the current onboarding-service tree, so this page does not claim a final submit, review, approval or rejection transition.
