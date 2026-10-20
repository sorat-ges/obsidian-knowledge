---
title: Customer ID Card Update and Retake
description: Flow เริ่ม ID-card update หรือ retake ใน Mobile ไปจนถึง DOPA verification, การทำ steps ที่เปลี่ยน และการส่ง application เข้า KYC review
capability: Customer
services: [onboarding-service, order-service, xspring-mobile-app]
integrations: [DOPA, Keycloak, Zendesk]
aliases: [customer identity update, ID card update, id-card-update, id-update, retake-id-card-update, ID Update, expired ID card update, ID_CARD_EXPIRED, capture name changed, address changed ID update, CDD risk change ID update, visible_submit_button_for_id_update, default bank ID update step, อัปเดตบัตรประชาชน, ขออัปเดตบัตรประชาชน, บัตรประชาชนหมดอายุ, ถ่ายบัตรประชาชนใหม่, retake บัตรประชาชน, เปลี่ยนที่อยู่หลังตรวจบัตร, เปลี่ยนระดับความเสี่ยง CDD, เปลี่ยนชื่อจาก capture, CompleteRetakeVerification, CompleteDraftRetake, IDCardUpdateWaitingApprove, retake ID card update without expiry, personal-information/ndid, ถ่ายบัตรประชาชนใหม่โดยไม่มีวันหมดอายุ, id_card_update_enhance_document_xd, id_card_update_enhance_document_xam, id_card_update_enhance_document_xpg, Zendesk ID-card-update enhance document, ขอเอกสารเพิ่มบัตรประชาชน]
errorCodes: ["APPLICATION_NOT_ALLOWED", "ID_CARD_EXPIRED", "400", "401", "500"]
status: active
lastUpdated: 2026-10-20
documentType: flow
---

## Purpose and scope

อธิบายการเริ่ม `id-card-update` จาก Mobile, การอ่านสถานะ/วันเตือน, การสร้าง draft และผล DOPA โดยแยก `FlowIDCardUpdate` ออกจาก `FlowRetakeIDCardUpdate`. Retake ใช้ completion path ของ retake และส่ง application เข้า KYC review หลังทำ steps ที่ถูกเปิดใหม่ได้ ส่วน regular `FlowIDCardUpdate` ที่พบข้อมูลเปลี่ยนยังไม่มี production caller ที่ยืนยันการ submit หลังทำ steps แล้ว

## Trigger and preconditions

**Owner service: `onboarding-service`**

**Executing service: `xspring-mobile-app` สำหรับ entry point และ request; `order-service` สำหรับ order expiry validation**

- Mobile แสดง expiry banner จาก `GET /api/v1/customer/status`; เมื่อมีบัตร ID หมดอายุ/ใกล้หมดอายุ ผู้ใช้ไปยังหน้า ID Card Required ได้จาก Home หรือจาก expiry sheet ที่เปิดหลัง order validation
- `GET /api/v1/customer/id-card-update` อ่าน expiry metadata จาก `customer_background_kyc.kyc_expiry_data`; service เปิดเผย status หลัง `warning_date` ของบัตรผ่านแล้ว และคืน `expiry_date`, `steps` กับ `is_force`
- `is_force` เป็นจริงเมื่อ expiry date อยู่ก่อนวันที่ปัจจุบัน; วันหมดอายุของวันนี้ยังไม่ผ่านเงื่อนไข “past”
- `POST /api/v1/customer/id-card-update` ต้องมี authenticated `PortalClaims` และ `ValidateApplicationRequestAllowed` ต้องอนุญาต application type `id-card-update`
- `order-service` ตรวจ `ID_CARD_EXPIRED` ในบาง order-validation path เมื่อ feature ที่เกี่ยวข้องเปิดและเงื่อนไขบัตร/unitholder ไม่ผ่าน; รายละเอียดอยู่ใน [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/)

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor ของ status, application, registration state, DOPA verification completion, watchlist decision และ KYC submission |
| `xspring-mobile-app` | Supporting client ที่แสดง expiry/retake UI, อ่าน steps และส่ง create request; Backend เป็นผู้ตัดสิน eligibility และ state |
| `order-service` | ตรวจ expiry ใน order validation และคืน error ที่อาจนำผู้ใช้ไปยัง ID-card update entry point |
| DOPA | แหล่ง verification ผลบัตรที่ `onboarding-service` ประมวลผล; behavior ภายใน DOPA อยู่นอก source set นี้ |

## End-to-end sequence

### 1. แจ้งผู้ใช้เมื่อถึงช่วงอัปเดตหรือมี retake

**Owner service: `onboarding-service`**

**Executing service: `xspring-mobile-app`**

`onboarding-service` ส่ง ID-card expiry ใน `GET /api/v1/customer/status` จาก metadata ที่เก็บใน `customer_background_kyc.kyc_expiry_data`; Mobile แสดง Home banner และเปิด ID Card Required screen เมื่อผู้ใช้เลือกดำเนินการต่อ หาก `flowType` เป็น retake ของ ID-card update, Home ใช้ retake-specific banner/sheet; หน้า ID Card Required แสดง retake banner เมื่อ flow type อยู่ในกลุ่ม retake

เมื่อเป็น `retake-id-card-update`, Home แสดง retake sheet แม้มี pending application หรือไม่มี ID-card expiry; ถ้าไม่มี expiry จะใช้ข้อความแบบ force/expired ที่ไม่มีวันกำกับ การกด Continue เปิด ID Card Required. ถ้ามี pending ID-card-update application Mobile ใช้ status/sub-status เพื่อนำทางกลับไปยัง personal-information steps; เมื่อ status เป็น `complete-draft` จะไม่เปิด step เพิ่ม

ใน order journey, Mobile แสดง expiry sheet แล้วปุ่มหลักของ ID-card sheet นำไป `IdCardRequiredScreen` และข้าม suitability sheet ที่เหลือในรอบนั้น

### 2. อ่านสถานะ ID-card update

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`GET /api/v1/customer/id-card-update` ตรวจ latest registration status/application, อ่าน `IDCardExpiry` จาก background KYC metadata และสร้างรายการ steps จาก registration history กับ change-request log. Personal Information step ถูกเพิ่มเมื่อ change request มี name/address/CDD data change; Bank step ถูกเพิ่มเมื่อไม่มี default bank หรือเมื่อชื่อ capture เปลี่ยนและมี default bank. หากวันปัจจุบันยังไม่เลย `warning_date` ที่เก็บไว้ service คืน error; Handler map service error เป็น HTTP `500`. Response มี `expiry_date`, `steps` และ `is_force`

### 3. สร้าง draft application

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อผู้ใช้กดดำเนินการต่อ Mobile เรียก `POST /api/v1/customer/id-card-update`. Handler ตรวจ `PortalClaims`, parse `UserUUID` และเรียก `ValidateApplicationRequestAllowed` ด้วย application type `id-card-update`; ถ้าผ่าน service สร้าง application ใน database transaction:

1. สร้าง `draft` application ชนิด `id-card-update`, channel `XSPRING_APP` และผูก `OldCaptureId` กับ customer capture ล่าสุด
2. บันทึก actionflow `created` และ change-request snapshot ของ account XAM/XD กับ default-bank state
3. ล้าง watchlist report ชนิด `AgeCondition`, `DOPA`, `IDIsNotExpired` และ `MaximumAge` พร้อม clear re-KYC flag ใน background KYC
4. ตั้ง registration state ที่ `identity-verification/front-card-scan` และสร้าง history สำหรับ identity, personal-information, suitability และ bank-account steps

### 4. ตรวจบัตรด้วย DOPA และเทียบข้อมูลลูกค้า

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

หลัง DOPA verification, `EKycHandler` dispatch `FlowIDCardUpdate` ไป `CompleteIDCardUpdateVerification` และ dispatch `FlowRetakeIDCardUpdate` ไป `CompleteRetakeVerification`. ทั้งสอง path อัปเดตข้อมูลที่ยืนยันแล้วและชื่อใน Keycloak; retake path ยังตรวจ profile/address change และ CDD risk-level change แยกกัน

สำหรับ `FlowRetakeIDCardUpdate`:

- ถ้า profile/address และ CDD risk level ไม่เปลี่ยน ระบบตั้ง registration ไป `identity-verification/ndid` แล้วเรียก `CompleteDraftRetake` ทันที
- ถ้ามี name/address/CDD change ระบบบันทึก flags ใน change-request log, soft-delete personal-information history เพื่อให้ทำ steps เหล่านั้นใหม่ และ soft-delete bank-account history เมื่อชื่อจาก capture เดิมเปลี่ยน จากนั้นตั้ง registration ไป `identity-verification/ndid`
- DOPA completion ของ retake ID-card path ไม่คำนวณ watchlist ในจุดนี้; การส่งกลับเข้า completion หลังลูกค้าทำ steps จะใช้ `CompleteDraftRetake`

### 5. เลือกผลจากการเปลี่ยนข้อมูล

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

- **Regular `FlowIDCardUpdate` ไม่พบข้อมูลเปลี่ยน:** เรียก `CompleteDraftIDCardUpdate`, อ่าน watchlist, ประเมิน auto-reject และส่ง application เข้า submission path; เมื่อไม่ auto-reject ระบบส่ง application ไป `to-review` และส่ง `IDCardUpdateWaitingApprove` email/notification
- **`FlowRetakeIDCardUpdate` ไม่พบ profile/address หรือ CDD change:** `CompleteDraftRetake` ข้ามการคำนวณ watchlist ซ้ำ, อัปเดต bank-account expiry และประเมิน auto-reject; ผลไม่ reject ไป `to-review`, ส่วนผล auto-reject ไป `rejected`. Retake completion helper นี้ไม่ได้ส่ง `IDCardUpdateWaitingApprove` email/notification
- **`FlowRetakeIDCardUpdate` พบการเปลี่ยน:** หลังลูกค้าทำ personal-information และ bank-account step ที่ถูกเปิดใหม่แล้ว `CompleteDraftRetake` คำนวณ `RetakeWatchlistTypes`, อัปเดต bank-account expiry และประเมิน auto-reject ก่อนส่งไป `to-review` หรือ `rejected`
- **Regular `FlowIDCardUpdate` พบข้อมูลเปลี่ยน:** cleanup ทำงานเมื่อ address, CDD risk level หรือ capture name เปลี่ยน; ระบบ clear FATCA/CRS/nationality และ soft-delete personal-information history และเมื่อ capture name เปลี่ยนจะ soft-delete bank-account history ด้วย

สำหรับ retake ID-card flow, `CompleteDraftRetake` เป็น production completion path หลังทำ steps ที่ถูก reset. สำหรับ regular ID-card update ที่พบข้อมูลเปลี่ยน ยังไม่พบ production caller ของ `CompleteDraftIDCardUpdate` หลังผู้ใช้ทำ steps ที่ถูก reset

## Business rules

- `ApplicationFormTypeIDCardUpdate` และ `FlowIDCardUpdate` มีค่า `id-card-update`; retake ใช้ flow type `retake-id-card-update`
- Backend ตรวจ application eligibility ก่อนสร้าง draft; client ไม่สามารถ override application type ที่กำลัง block request
- ID-card status endpoint อ่าน expiry metadata จาก background KYC; การไม่มีหรือ parse metadata ไม่ได้ทำให้ status endpoint คำนวณวันจาก profile โดยตรง
- `AllowEditData` ปิดทุก field สำหรับ ID-card update ที่ไม่มี name/address/CDD data change ใน change-request log; เมื่อมี data change จะเปิด field flags ตาม implementation ปัจจุบัน
- Mobile ซ่อนส่วนผู้แนะนำและปิด city-of-birth selector ในทุก non-onboarding flow รวมถึง ID-card retake; Backend ยังคงเป็นผู้ตัดสินข้อมูลและ state ที่บันทึกได้
- `CompleteDraftRetake` ต้องอ่านและ parse change-request log ได้; หาก log หายหรือ `RequestTo` parse ไม่ได้ completion จะคืน error ก่อนจบ application
- Rejection ของ `id-card-update` ใช้ existing-customer rejection path: manual/non-auto rejection คง identification เป็น `active` และระงับ accounts; auto-reject case ทำให้ identification และ accounts เป็น `freeze` พร้อม reason `KYC_REJECTED`
- `CompleteDraftIDCardUpdate` บันทึก application date และ updater ลง application ก่อนตรวจ auto-reject; หาก update นี้ล้มเหลวจะคืน error ก่อน submission decision
- เมื่อมีการขอเอกสารเพิ่มสำหรับ `id-card-update`, `EnhanceDocumentService` เลือก Zendesk template ตาม company (`XD`, `XAM` หรือ `XPG`) จาก `id_card_update_enhance_document_*`
- Auto-reject/watchlist decision อยู่ใน `onboarding-service`; `onboarding-service` เป็น owner ของ application outcome ไม่ใช่ DOPA หรือ Mobile
- การ rejection และ status/email effects ใช้ rejection path กลางที่สรุปใน [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/)

## State transitions

| Trigger | Application | Registration |
| :--- | :--- | :--- |
| Mobile POST ผ่าน eligibility | ไม่มี application ที่ block → `draft` (`id-card-update`) | → `identity-verification/front-card-scan`; สร้าง history ของ steps ที่อาจต้องทำ |
| `FlowIDCardUpdate` ไม่พบข้อมูลเปลี่ยนและไม่ auto-reject | `draft` → `to-review` | `identity-verification` → `ndid`; ส่ง waiting-approve email/notification |
| `FlowRetakeIDCardUpdate` ไม่พบ profile/address หรือ CDD change และไม่ auto-reject | `to-retake` → `to-review` | `identity-verification` → `ndid`; `CompleteDraftRetake` ข้าม watchlist calculation |
| `FlowRetakeIDCardUpdate` พบข้อมูลเปลี่ยน | คง application ระหว่างทำ steps ที่ถูก reset; หลัง completion → `to-review` หรือ `rejected` | personal-information histories ถูก reset; bank-account history ถูก reset เมื่อ capture name เปลี่ยน; completion คำนวณ `RetakeWatchlistTypes` |
| Regular `FlowIDCardUpdate` พบข้อมูลเปลี่ยน | ยังไม่ยืนยันการ submit ปลายทาง | reset personal-information history; reset bank history เมื่อ capture name เปลี่ยน |
| Watchlist auto-reject | → `rejected` ตาม shared KYC rejection path | ผล downstream ใช้ rejection path กลาง |

## Error and recovery behavior

- Invalid/missing `PortalClaims`: HTTP `401`; application ไม่ถูกสร้าง
- `UserUUID` parse ไม่ได้: HTTP `400`; application ไม่ถูกสร้าง
- Application type อื่น block คำขอ: HTTP `400` พร้อม `APPLICATION_NOT_ALLOWED`; จัดการ application ที่ block ก่อน retry
- Eligibility lookup หรือ create transaction ล้มเหลว: HTTP `500`; ตรวจ application/registration state ก่อน retry
- เรียก `GET /api/v1/customer/id-card-update` ก่อน warning date: service คืน error และ Handler ตอบ HTTP `500`
- DOPA verification, customer-data update, watchlist calculation หรือ CDD comparison ล้มเหลว: verification completion คืน error; source ที่ตรวจไม่ยืนยัน automatic retry หรือ rollback ครอบคลุม external calls
- Retake completion อ่าน change-request log ไม่ได้หรือ `RequestTo` ไม่ถูกต้อง: `CompleteDraftRetake` คืน error และไม่ส่ง application เข้า final completion path
- Regular ID-card update บันทึก application date/updater ไม่สำเร็จ: `CompleteDraftIDCardUpdate` คืน error ก่อนประเมิน auto-reject หรือ submit
- RM/WS rejection-email failure ถูก log โดย rejection path; ไม่เปลี่ยน application rejection response ตาม path ที่ตรวจ

## Final outcomes

- Mobile แสดงวันหมดอายุ/steps และให้เริ่ม ID-card update เมื่อถึงช่วง warning
- ผ่าน create request: มี draft `id-card-update` พร้อม registration state สำหรับตรวจบัตรและ steps ต่อไป
- Regular `FlowIDCardUpdate` ที่ไม่พบการเปลี่ยนและไม่ auto-reject: application เข้า `to-review`
- `FlowRetakeIDCardUpdate` ที่ไม่พบการเปลี่ยนจะข้าม watchlist calculation ซ้ำและจบผ่าน `CompleteDraftRetake`; หากพบการเปลี่ยน ลูกค้าทำ steps ที่ถูก reset ก่อน completion คำนวณ watchlist และตัดสิน `to-review`/`rejected`
- Regular `FlowIDCardUpdate` ที่พบการเปลี่ยน: customer data ถูกบันทึกและ histories ถูก reset; final submit หลังทำ steps ต่อไปยังต้องยืนยัน
- Auto-reject หรือ KYC rejection: ยึด state และ communication behavior ใน [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/)

## Related shared rules

- [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/)
- [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/)
- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`onboarding-service`:

- `routes/routes.go`: registers `GET` and `POST /api/v1/customer/id-card-update`
- `handler/customer-id-card-update-handler.go`: auth, eligibility, create request and status response
- `pkg/customer/id-card-update/service.go`: warning-date check, status steps and transaction creating draft/snapshots/history
- `pkg/customer/id-card-update/service.go`: Personal Information/Bank step eligibility from change-request data and default-bank state
- `handler/ekyc-handler.go`: dispatch `FlowIDCardUpdate` และ `FlowRetakeIDCardUpdate` หลัง DOPA
- `pkg/ekyc/ekyc-verification/service.go`: `CompleteIDCardUpdateVerification`, `CompleteRetakeVerification`, change-request update และ reset history
- `pkg/customer/registrationcomplete/service.go`: `CompleteDraftIDCardUpdate` และ `CompleteDraftRetake` submission/watchlist paths
- `pkg/customer/application/reject_application.go`: existing-customer state updates เมื่อ ID-card-update application ถูก reject
- `pkg/enhancedocument/enhance-document-service.go`: Zendesk template selection for ID-card-update enhance-document requests
- `internal/constants/enum/ticket-email-template.go`: ID-card-update Zendesk template IDs
- `pkg/customer/customer-resigtration-status/customer-resigtration-status-svc/customer-resigtration-status-service.go`: expiry and registration status
- `pkg/kyc/helper.go`: `AllowEditData` behavior for ID-card update applications
- `internal/constants/enum/flow-type.go` and `internal/constants/enum/application_type_status.go`: flow/application type values

`xspring-mobile-app`:

- `lib/services/id_card_required/service.dart`: GET/POST calls to `/api/v1/customer/id-card-update`
- `lib/domains/Id_card_required/controller.dart` and `lib/domains/Id_card_required/screen.dart`: status steps, pending-application navigation and retake banner
- `lib/domains/app_main_page/home/controller.dart` and `lib/domains/app_main_page/home/screen.dart`: expiry and retake-ID-card banner/sheet trigger
- `lib/domains/ekyc/onboarding/personal/personal_controller.dart`: non-onboarding personal-screen field visibility
- `lib/utils/order_validation_utils.dart`: expiry sheet and navigation to ID Card Required screen
- `lib/utils/order_validation_utils.dart`: ID-card expiry timestamp is shifted by +7 hours before date-only display formatting

`order-service`:

- `pkg/customer/service.go`: feature-gated ID-card/suitability expiry validation
- `pkg/order/service.go`: order validation call site

## Unresolved implementation boundaries

- Regular `FlowIDCardUpdate` ที่พบข้อมูลเปลี่ยนยังไม่มี production caller ที่พา application กลับเข้า `CompleteDraftIDCardUpdate` หลังทำ steps ที่ reset; ต้องยืนยัน final submission path กับเจ้าของระบบ
- Mobile's order-expiry sheet defaults `isRetakeIdCard` to false; the retake-specific sheet is explicitly selected from the Home banner path. Retake behavior after an order error is not confirmed.
