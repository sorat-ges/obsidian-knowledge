---
title: KYC Review Retake and DOPA Reverification
description: Flow ที่เจ้าหน้าที่ส่ง KYC กลับให้ลูกค้าถ่ายบัตรและยืนยัน DOPA ใหม่ ก่อนเทียบ profile/address และส่ง application กลับเข้า review
capability: Customer
services: [onboarding-service]
aliases: [KYC retake, request retake, retake-re-kyc, DOPA reverification, retake ID card, watchlist report, KYC watchlist, ถ่ายบัตรใหม่, ยืนยัน DOPA ใหม่, ส่ง KYC กลับแก้ไข, รายงาน watchlist KYC]
integrations: [DOPA, AppMan, AdvanceAI, Keycloak]
errorCodes: ["1000", "200", "2009", "4001", "6600"]
status: active
lastUpdated: 2026-08-04
documentType: flow
---

## Purpose and scope

อธิบาย production path ที่เจ้าหน้าที่ KYC ขอให้ลูกค้า retake การยืนยันตัวตน ตั้งแต่ Backend ตัดสินใจแสดง action, เปลี่ยน application เป็น `to-retake`, เตรียม registration history, รับผล DOPA หลังลูกค้าถ่ายบัตรใหม่ และเลือกว่าจะกลับเข้า review ทันทีหรือให้ลูกค้าตรวจข้อมูลที่เปลี่ยน

Frontend `web-portal` ถูกข้ามการ pull เพราะมี uncommitted changes ในรอบนี้ จึงใช้ Backend เป็น source of truth และไม่ยืนยันข้อความ UI หรือ client behavior เวอร์ชันล่าสุด

## Trigger and preconditions

**Owner service: `onboarding-service`**

- เจ้าหน้าที่ต้องผ่าน employee authentication และ API-key permission ของ KYC endpoint
- Application ต้องมี status `to-review`; request ส่ง `current_status` เพื่อป้องกันการทำงานบน state เก่า
- v1 ใช้ `POST /web/api/v1/kyc/:identification_id/request-retake`
- v2 ใช้ `POST /web/api/v2/kyc/:application_id/request-retake`
- Backend ไม่เปิด action เมื่อ application อยู่ `to-retake` แล้ว
- สำหรับ re-KYC ที่อยู่ `to-review`: `force-expired` และ `id-card-expired` เปิด retake; `cdd-expired` และ `suitability-expired` คืนค่า action แบบ disabled; type อื่นซ่อน action

## Participating services

| Service/Integration | Role |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor; validate state, เปลี่ยน application/registration, เทียบและอัปเดต KYC data |
| DOPA | ยืนยันข้อมูลบัตรประชาชน; `onboarding-service` ตีความผลและตัดสิน state ถัดไป |
| AppMan | แหล่งผล front-card สำหรับช่องทาง `APPMAN` |
| AdvanceAI | แหล่ง OCR/liveness และภาพสำหรับช่องทาง `ADVANCE_AI` |
| Keycloak | รับชื่อภาษาอังกฤษใหม่เมื่อ profile ถูกอัปเดต |

ไม่มี consumer service แยกต่างหากใน Flow ที่ source ยืนยัน

## End-to-end sequence

### 1. Decide whether retake is available

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Backend คืน `is_show_button_retake` เป็น nullable boolean: `nil` คือซ่อน, `false` คือแสดงแต่ disabled และ `true` คือเปิดให้กด สำหรับ application ใหม่ยังอิง feature flag, channel, `to-review` และ DOPA result; re-KYC ใช้ `re_kyc_type` override ตาม preconditions ข้างต้น

### 2. Employee requests retake

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Handler ตรวจ claim, bind `current_status` และยืนยันว่า application ปัจจุบันยังตรงกับค่าที่ client เห็น จากนั้น transaction:

1. ปิด action-flow ช่วง review ด้วย action `retake`
2. เปลี่ยน application จาก `to-review` เป็น `to-retake`
3. ตั้ง registration ที่ `identity-verification/front-card-scan`
4. ใช้ flow `retake-re-kyc` เมื่อ application type เป็น `re-kyc`; application type อื่นใช้ `retake`
5. soft-delete history เดิมของ application/flow เดียวกัน
6. สร้าง history ที่ถือว่าผ่านแล้วสำหรับ personal, address, work, background, suitability และ bank-account เพื่อให้ retake กลับไปทำ identity step
7. ส่ง email ตาม face-recognition channel และ account-opening intent

### 3. Customer repeats identity verification

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

หลัง DOPA response ผ่านเงื่อนไข `IsAllowUpdateProfile()` และ request ใช้ `flow_type = retake`, handler เรียก retake completion แทนการจบที่การบันทึก DOPA response อย่างเดียว

ถ้า DOPA เป็น error/บัตรหมดอายุตามเงื่อนไข service จะคืน code `6600` และ message `ID Card Expired` โดยไม่เดิน profile-comparison path

### 4. Compare current data with newly verified data

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

สำหรับ `ADVANCE_AI` เกณฑ์ profile match ปัจจุบันเทียบ:

- identification card number
- ชื่อไทย
- นามสกุลไทย

ชื่ออังกฤษ, วันเกิด และวันหมดอายุบัตรไม่ใช่ field ตัดสิน `isMatchProfile` ใน path นี้แล้ว แต่ service ยังนำค่าที่ verify ใหม่ไปสร้างข้อมูล update

Address match ต้องตรงทั้ง province, district, sub-district, address number, building, floor, moo, road, room, soi และ postal code ไม่ใช่เพียง 4 field หลัก

ช่องทาง `APPMAN` ใช้ comparison/result builder ของ AppMan แต่เข้าสู่ state decision ชุดเดียวกัน

### 5. Apply matched or changed result

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

- Profile และ address ตรงทั้งหมด: registration ถูกตั้งเป็น `completed-draft/application-completed-draft`, DOPA คืน `200`, application ถูกส่งจาก `to-retake` กลับ `to-review` และบันทึก action/audit
- มีข้อมูลไม่ตรง: registration ไป `personal-information/personal`, DOPA คืน `2009` พร้อม message `data not match the original information`; service อัปเดต profile/address จากข้อมูลที่ verify ใหม่เพื่อให้ลูกค้าตรวจต่อ
- เมื่อ profile เปลี่ยน service อัปเดตชื่อใน Keycloak และบันทึก `name_change` ใน application change-request log สำหรับ AdvanceAI
- Face-recognition image/reference และ ratio ถูก refresh จากผล retake

### 6. Read stored watchlist information for KYC review

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อ KYC approval อ่านข้อมูลจาก stored customer capture, `onboarding-service` จะสร้าง `watchlist_report` ได้เมื่อมี stored report อย่างน้อยหนึ่งกลุ่มจาก personal, background หรือ vulnerable-investor หากบางกลุ่มไม่มี row ระบบคืนกลุ่มนั้นเป็น object ว่างและ map เฉพาะกลุ่มที่มีข้อมูล จึงไม่ทำให้การอ่าน capture ล้มเหลวเพราะ report ไม่ครบทุกกลุ่ม ขั้นตอนนี้เป็น read/display path และไม่เปลี่ยน application หรือ registration state

## Business rules

- Retake เริ่มได้จาก application `to-review` เท่านั้น และ request ต้องไม่อาศัย state เก่าจาก client
- re-KYC reason เป็นตัวกำหนดว่า action เปิด, disabled หรือถูกซ่อน
- Initial retake transaction เก็บ completed history ของ step ที่ไม่ต้องทำซ้ำ แล้วพาลูกค้ากลับไปเริ่มที่ front-card scan
- Profile-match rule ของ AdvanceAI เน้นเลขบัตรและชื่อไทย ขณะที่ address-match rule ตรวจรายละเอียดที่อยู่ครบมากขึ้น
- การมี profile/address change ไม่ใช่ DOPA failure; เป็นผล `2009` ที่พา Flow ไปให้ลูกค้าตรวจข้อมูล
- `onboarding-service` เป็นทั้ง owner และ executor; DOPA/AppMan/AdvanceAI เป็น integration ไม่ใช่ Business owner
- ค่า re-KYC expiry ที่คำนวณจาก card, CDD หรือ suitability ถูก normalize เป็น UTC midnight ของวันถัดจาก expiry ตาม business timezone
- Stored watchlist report ใน KYC approval ไม่จำเป็นต้องมีครบทั้ง personal, background และ vulnerable-investor; missing group ถูกแสดงเป็น object ว่าง

## State transitions

| Trigger | Application | Registration |
| :--- | :--- | :--- |
| Employee requests retake | `to-review` → `to-retake` | → `identity-verification/front-card-scan` |
| DOPA success; profile/address match | `to-retake` → `to-review` | → `completed-draft/application-completed-draft` |
| DOPA success; data changed | คงอยู่ใน retake path จนลูกค้าตรวจข้อมูลต่อ | → `personal-information/personal` |
| DOPA error/expired condition | ไม่มี completion transition ใน path นี้ | ไม่เดิน profile-comparison transition |
| KYC approval reads stored capture | ไม่เปลี่ยน application | คืน `watchlist_report` เท่าที่มี stored report |

ขั้น request ของ re-KYC เขียน flow type `retake-re-kyc` แต่ DOPA completion ปัจจุบันสร้าง status/history ด้วย `retake` และ success helper ตั้ง flow เป็น `onboarding`; ต้องยืนยัน intended state chain กับเจ้าของ `onboarding-service` ก่อนอธิบายผลของ re-KYC retake หลัง DOPA เป็นข้อเท็จจริงเพิ่มเติม

## Error and recovery behavior

- Claim ไม่ถูกชนิด: HTTP 401
- Request body ไม่ถูกต้อง: HTTP 400, code `4001` (`INVALID_REQUEST`)
- `current_status` ไม่ตรงกับ application ปัจจุบัน: HTTP 200, code `1000` (`INVALID_APPLICATION_STATUS`); client ต้อง refresh state ก่อน retry
- DOPA data changed: code `2009` เป็น business outcome สำหรับ review ข้อมูล ไม่ใช่ transport failure
- DOPA error/expired branch: code `6600`; source ไม่ยืนยัน automated retry ใน path นี้
- Repository, profile, address, Keycloak หรือ state update ล้มเหลว: request ล้มด้วย service error; transaction ครอบเฉพาะบางช่วง จึงห้ามสรุปว่า external/profile updates rollback พร้อมกันทั้งหมด
- การเขียน registration status/history หลัง DOPA completion log error แล้ว Flow ยังคืนผลได้ในบาง path; ต้องตรวจ log เมื่อ response สำเร็จแต่ progress ไม่เปลี่ยน

## Final outcomes

- เจ้าหน้าที่ส่ง application กลับให้ลูกค้าทำ identity verification ใหม่ได้โดยไม่บังคับทำ personal/suitability/bank step ที่ seed เป็น completed
- ข้อมูลตรงทั้งหมดจะกลับเข้า KYC review
- ข้อมูลเปลี่ยนจะถูก persist จากผล verify และพาลูกค้าไปตรวจ personal information
- Backend แยก `DOPA_SUCCESS` (`200`) ออกจาก `DOPA_DATA_CHANGE` (`2009`)
- KYC approval response แสดง stored watchlist report แบบ partial ได้โดยไม่ต้องมีครบทุกกลุ่ม

## Related shared rules

- [Customer Onboarding and KYC](/business-flows/customer/)
- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/)
- [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/)
- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`onboarding-service`:

- `routes/routes.go`: web-portal KYC retake routes และ permissions
- `handler/webportal/kyc-handler.go`: v1 request-retake validation/error mapping
- `handler/webportal/kyc-approver-handler.go`: v2 application-based request-retake
- `pkg/kyc/helper.go`: `ValidateIsShowButtonRetake`
- `pkg/kyc/kyc-service.go`: request transaction, flow type และ registration history
- `internal/domain/application.go`: `RetakeFlowType`
- `handler/ekyc-handler.go`: dispatch DOPA success สำหรับ `retake`
- `pkg/ekyc/dopasvc/dopa-service.go`: comparison, profile/address update และ state outcome
- `pkg/ekyc/ekyc-verification/service.go`: AdvanceAI profile/address comparison
- `pkg/customer/kyc_approver/helper.go`: re-KYC expiry timestamp normalization
- `pkg/customer/kyc_approver/helper.go`: stored capture mapping และ partial watchlist report
- `handler/webportal/kyc-approve-dto.go`: map watchlist report ไปยัง approval response
