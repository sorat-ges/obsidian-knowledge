---
title: KYC Review Retake and DOPA Reverification
description: Flow ที่เจ้าหน้าที่ส่ง KYC กลับให้ลูกค้าถ่ายบัตรและยืนยัน DOPA ใหม่ ก่อนเทียบ profile/address และส่ง application กลับเข้า review
capability: Customer
services: [onboarding-service, web-portal, xspring-mobile-app]
aliases: [KYC retake, request retake, KYC customer list, KYC customer status, retake-re-kyc, force re-KYC, force re-KYC sell, force re-KYC withdrawal, force re-KYC swap, auto-cancel re-KYC, cancelled-by-system, customer capture, default investment bank account, investment bank account, DOPA reverification, retake ID card, clear retake sensitive data, customer image verification, laser code, watchlist report, KYC watchlist, forgery verification, manual verify forgery, KYC forgery, รายการลูกค้า KYC, สถานะลูกค้า KYC, ตรวจสอบ forgery, ถ่ายบัตรใหม่, ยืนยัน DOPA ใหม่, ส่ง KYC กลับแก้ไข, ล้างข้อมูลบัตร retake, ล้าง laser code, รายงาน watchlist KYC, ยกเลิก re-KYC อัตโนมัติ, บัญชีธนาคารลงทุน, บังคับทบทวน KYC, ขายเมื่อบังคับทบทวน KYC, ถอนเมื่อบังคับทบทวน KYC, สลับเมื่อบังคับทบทวน KYC]
integrations: [DOPA, AppMan, AdvanceAI, Keycloak]
errorCodes: ["1000", "200", "2009", "400", "401", "4001", "500", "6600"]
status: active
lastUpdated: 2026-08-29
documentType: flow
---

## Purpose and scope

อธิบาย production path ที่เจ้าหน้าที่ KYC ขอให้ลูกค้า retake การยืนยันตัวตน ตั้งแต่ Backend ตัดสินใจแสดง action, เปลี่ยน application เป็น `to-retake`, เตรียม registration history, รับผล DOPA หลังลูกค้าถ่ายบัตรใหม่ และเลือกว่าจะกลับเข้า review ทันทีหรือให้ลูกค้าตรวจข้อมูลที่เปลี่ยน รวมถึง read model ที่ KYC approval ใช้ดู capture, suitability, default investment bank account และ forgery verification

`web-portal` เป็น supporting client/BFF: route request-retake v2 ส่ง `current_status` ต่อไปยัง `onboarding-service`, route bank-account proxy ส่ง GET ต่อไปยัง investment-bank-account endpoint และ KYC approval ใช้ client trigger/status mapping สำหรับ forgery โดยไม่มี business-rule override ใน client ใช้ Backend เป็น source of truth สำหรับ state, validation และผลลัพธ์

`xspring-mobile-app` มี supporting re-KYC gate ก่อนเข้า operation บางประเภท: client ใช้ force-state และ operation type เพื่อเลือกว่าจะเปิด action หรือแสดง re-KYC/contact modal แต่ไม่ได้เปลี่ยน backend state หรือ backend validation

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
| `web-portal` | Supporting trigger/BFF; ส่ง `current_status` ใน request-retake และ proxy read request ไปยัง Backend โดยไม่เป็น owner ของ state หรือ validation |
| `xspring-mobile-app` | Supporting client gate; ส่ง operation type ให้ re-KYC block logic และแสดง modal ก่อนเข้า order flow โดยไม่เป็น owner ของ re-KYC state |
| DOPA | ยืนยันข้อมูลบัตรประชาชน; `onboarding-service` ตีความผลและตัดสิน state ถัดไป |
| AppMan | แหล่งผล front-card สำหรับช่องทาง `APPMAN` |
| AdvanceAI | แหล่ง OCR/liveness และภาพสำหรับช่องทาง `ADVANCE_AI` |
| Keycloak | รับชื่อภาษาอังกฤษใหม่เมื่อ profile ถูกอัปเดต |

ไม่มี consumer service แยกต่างหากใน Flow ที่ source ยืนยัน

## End-to-end sequence

### 1. Load the KYC customer review list

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`GET /web/api/v2/customer/list` รับ filter ของ employee เช่น `q`, `status`, `sort`, `order`, `page` และ `limit` แล้ว query เฉพาะ individual identification ที่ `is_deleted = false` โดย base status predicate ปัจจุบันตัด `rejected` และ `onboarding` ออก แทนการจำกัดไว้เฉพาะ `active` และ `suspended` เท่านั้น ดังนั้น `active`, `suspended`, `closed`, `inactive` และ `freeze` ยังอาจอยู่ในรายการได้ หากไม่ถูกตัดด้วย request filter เพิ่มเติม

ขั้นนี้เป็น entry read path ของ KYC approval; การเปิด detail และตัดสินใจ retake ใช้ state/permission rule ในขั้นถัดไป

### 2. Decide whether retake is available

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Backend คืน `is_show_button_retake` เป็น nullable boolean: `nil` คือซ่อน, `false` คือแสดงแต่ disabled และ `true` คือเปิดให้กด สำหรับ application ใหม่ยังอิง feature flag, channel, `to-review` และ DOPA result; re-KYC ใช้ `re_kyc_type` override ตาม preconditions ข้างต้น

### Supporting client gate during forced re-KYC

**Owner service: `onboarding-service` สำหรับ re-KYC state**

**Executing service: `xspring-mobile-app` สำหรับ client pre-gate**

เมื่อ mobile อ่าน force re-KYC state (`force-not-started`, `force-in-progress`, `force-review` หรือ `force-retake`) แล้วเรียก `blockIfReKycForced`:

- `OrderType.sell` และ `OrderTabType.sell` ของ Mutual Fund ผ่าน client gate ได้
- `DigitalPortalOrderType.withdraw` และ `DigitalPortalOrderType.swap` ผ่าน client gate ได้
- buy, deposit และ switch ยังถูก block และแสดง re-KYC modal ตาม state
- branch `rejected`, `invalidStatus` หรือ `nameChanged` ยังคง block ทุก operation

นี่เป็น client-side navigation/action gate เท่านั้น; `onboarding-service` และ operation backend ยังคงเป็นผู้ยืนยัน state, permission และ validation สุดท้าย

### 3. Employee requests retake

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Handler ตรวจ claim, bind `current_status` และยืนยันว่า application ปัจจุบันยังตรงกับค่าที่ client เห็น จากนั้น transaction:

1. ลบ `customer_laser_code` และแถว `customer_image_verification` ของ identification เดียวกัน
2. ปิด action-flow ช่วง review ด้วย action `retake`
3. เปลี่ยน application จาก `to-review` เป็น `to-retake`
4. ตั้ง registration ที่ `identity-verification/front-card-scan`
5. ใช้ flow `retake-re-kyc` เมื่อ application type เป็น `re-kyc`; application type อื่นใช้ `retake`
6. soft-delete history เดิมของ application/flow เดียวกัน
7. สร้าง history ที่ถือว่าผ่านแล้วสำหรับ personal, address, work, background, suitability และ bank-account เพื่อให้ retake กลับไปทำ identity step
8. หลัง transaction สำเร็จ ส่ง email ตาม face-recognition channel และ account-opening intent

การลบ sensitive data และการเปลี่ยน application/registration/history อยู่ใน database transaction เดียวกัน; การลบใช้ `identification_id` เป็นเงื่อนไข และไม่ใช่การเปลี่ยน state ที่ `web-portal` ทำเอง

`web-portal` v2 ใช้ `POST /api/kyc-approval/{applicationId}/request-retake` แล้วส่ง body `{ current_status }` ไปยัง `/web/api/v2/kyc/{applicationId}/request-retake`; Backend ยังเป็นผู้ตรวจ state และตัดสินผลลัพธ์

### 4. Customer repeats identity verification

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

หลัง DOPA response ผ่านเงื่อนไข `IsAllowUpdateProfile()` และ request ใช้ `flow_type = retake`, handler เรียก retake completion แทนการจบที่การบันทึก DOPA response อย่างเดียว

ถ้า DOPA เป็น error/บัตรหมดอายุตามเงื่อนไข service จะคืน code `6600` และ message `ID Card Expired` โดยไม่เดิน profile-comparison path

### 5. Compare current data with newly verified data

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

สำหรับ `ADVANCE_AI` เกณฑ์ profile match ปัจจุบันเทียบ:

- identification card number
- ชื่อไทย
- นามสกุลไทย

ชื่ออังกฤษ, วันเกิด และวันหมดอายุบัตรไม่ใช่ field ตัดสิน `isMatchProfile` ใน path นี้แล้ว แต่ service ยังนำค่าที่ verify ใหม่ไปสร้างข้อมูล update

Address match ต้องตรงทั้ง province, district, sub-district, address number, building, floor, moo, road, room, soi และ postal code ไม่ใช่เพียง 4 field หลัก

ช่องทาง `APPMAN` ใช้ comparison/result builder ของ AppMan แต่เข้าสู่ state decision ชุดเดียวกัน

### 6. Apply matched or changed result

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

- Profile และ address ตรงทั้งหมด: registration ถูกตั้งเป็น `completed-draft/application-completed-draft`, DOPA คืน `200`, application ถูกส่งจาก `to-retake` กลับ `to-review` และบันทึก action/audit
- มีข้อมูลไม่ตรง: registration ไป `personal-information/personal`, DOPA คืน `2009` พร้อม message `data not match the original information`; service อัปเดต profile/address จากข้อมูลที่ verify ใหม่เพื่อให้ลูกค้าตรวจต่อ
- เมื่อ profile เปลี่ยน service อัปเดตชื่อใน Keycloak และบันทึก `name_change` ใน application change-request log สำหรับ AdvanceAI
- Face-recognition image/reference และ ratio ถูก refresh จากผล retake

### 7. Read stored watchlist information for KYC review

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อ KYC approval อ่านข้อมูลจาก stored customer capture, `onboarding-service` เลือก capture ตามสถานะของ application: ใช้ `NewCaptureId` เป็นค่าเริ่มต้น, ใช้ `SubmitCaptureId` เมื่อ application เป็น `rejected`, ใช้ `OldCaptureId` เมื่อเป็น `cancelled-by-system` และ fallback เป็น `OldCaptureId` หากไม่มี capture id อื่น จาก capture ระบบจะสร้าง `watchlist_report` ได้เมื่อมี stored report อย่างน้อยหนึ่งกลุ่มจาก personal, background หรือ vulnerable-investor หากบางกลุ่มไม่มี row ระบบคืนกลุ่มนั้นเป็น object ว่างและ map เฉพาะกลุ่มที่มีข้อมูล จึงไม่ทำให้การอ่าน capture ล้มเหลวเพราะ report ไม่ครบทุกกลุ่ม ขั้นตอนนี้เป็น read/display path และไม่เปลี่ยน application หรือ registration state

### 8. Read suitability and default investment bank account

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

KYC approval อ่าน suitability ตาม account-opening intent โดยใช้ v2 Traditional/Digital ก่อน และ fallback ไป V1 เมื่อข้อมูล v2 ของบริษัทนั้นไม่พบ; answer path อ่าน legacy answer ก่อน แล้วใช้ question/answer จาก v2 เมื่อ legacy payload ไม่มีหรือว่าง รายละเอียด selection และ fallback อยู่ใน [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/)

สำหรับ `GET /web/api/v2/customer/{identification_id}/investment-bank-account`:

- อ่าน investment-bank-account details และ customer accounts เพื่อผูก account กับ company
- คืนเฉพาะรายการที่ `Default = true` และมี customer account ที่ map ได้
- จัด XAM เป็น `Fund` และ XD เป็น `Digital`; รวม RED/SUB ต่อ customer account และคืน account code จาก XPG/investment account code
- ถ้า Fund ไม่มี SUB ระบบเติม object ว่างให้ ส่วนรายการที่ไม่ใช่ default หรือ map company ไม่ได้จะไม่ถูกส่งออก

`web-portal` route `/api/customer/{userId}/bank-account` เป็น proxy ของ endpoint นี้และไม่เปลี่ยน payload/ผลลัพธ์

CDD date ที่ส่งใน current/previous KYC information ถูก truncate เป็นวันที่เวลา 00:00 ใน business timezone ก่อน map เป็น `cdd_date`; read model จึงสื่อเฉพาะวัน ไม่ใช่เวลาที่คำนวณ

### 9. Verify forgery and expose KYC decision

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service` สำหรับ automatic verification และ persistence; `web-portal` สำหรับ manual-review trigger และการแสดงผล**

เมื่อ DOPA completion สำเร็จ handler จะเปิด asynchronous forgery path เมื่อ `TriggerFeatureForgeryVerification()` เป็นจริง โดย `onboarding-service` ใช้ system actor เรียก AdvanceAI `POST /api/v1/ocr/forgery` แล้วบันทึก `forgery_flag` เป็น `pass`, `reject` หรือ `error`, พร้อม reason เมื่อ provider ส่ง detail และ audit log ของ request/result ผลลัพธ์นี้ไม่เปลี่ยน DOPA response ที่ส่งกลับไปแล้ว

ถ้า KYC approval เห็น `forgery_flag = reject` และผู้ใช้มี permission `KYC_DETAIL_REVIEW`, `web-portal` เปิด manual verify action และส่ง `PATCH /web/api/v1/kyc/forgery/manual` ผ่าน BFF โดย backend บังคับ `customer_identification_id` และ `memo`, บันทึกผลเป็น `pass` พร้อม reviewer, เวลา และ memo และไม่ update `forgery_reason` จากค่า nil ของ manual request การ refresh verification ใช้ `POST /web/api/v1/kyc/forgery/{identification_id}/refresh` และทำงานด้วย system actor

ใน customer detail และ KYC approval forgery component, `web-portal` แสดง `reason` ต่อจาก memo เป็นบรรทัด `Remark: {reason}` เมื่อมีค่า; การแสดงผลนี้ไม่เปลี่ยน backend result หรือ validation

KYC approval map reason code ที่รู้จักเป็นคำอธิบาย และ join เป็นรูปแบบ `code - description`; reason code ที่ไม่มี mapping จะถูกส่งต่อเป็น code เดิม

`web-portal` แสดง forgery result/reason/date/by/memo ใน KYC detail, แสดง warning เมื่อ result เป็น `reject`, และ disable submit/enhance/reject/approve เมื่อ result เป็น `error`; client mapping เหล่านี้เป็น user-visible behavior เท่านั้น ไม่ใช่ backend authorization หรือ state owner

## Business rules

- KYC approval customer list base query ตัดเฉพาะ individual identification ที่ `is_deleted = false` และ status `rejected`/`onboarding`; ไม่ควรสรุปว่า list ตัด `closed`, `inactive` หรือ `freeze` หากไม่มี request status filter เพิ่มเติม
- CDD date ใน KYC approval เป็น date-only ที่ normalize ตาม business timezone
- Automatic forgery verification ทำงานหลัง DOPA completion แบบ asynchronous เมื่อ feature flag เปิด และเก็บผล `pass`/`reject`/`error` ใน background KYC
- Manual forgery verification เป็น backend write path ของ `onboarding-service`; manual `pass` เก็บ memo และ reviewer แต่ไม่เขียน `forgery_reason`
- Retake เริ่มได้จาก application `to-review` เท่านั้น และ request ต้องไม่อาศัย state เก่าจาก client
- re-KYC reason เป็นตัวกำหนดว่า action เปิด, disabled หรือถูกซ่อน
- Initial retake transaction ลบ `customer_laser_code` และ `customer_image_verification` ก่อนเก็บ completed history ของ step ที่ไม่ต้องทำซ้ำ แล้วพาลูกค้ากลับไปเริ่มที่ front-card scan
- Profile-match rule ของ AdvanceAI เน้นเลขบัตรและชื่อไทย ขณะที่ address-match rule ตรวจรายละเอียดที่อยู่ครบมากขึ้น
- การมี profile/address change ไม่ใช่ DOPA failure; เป็นผล `2009` ที่พา Flow ไปให้ลูกค้าตรวจข้อมูล
- `onboarding-service` เป็นทั้ง owner และ executor; DOPA/AppMan/AdvanceAI เป็น integration ไม่ใช่ Business owner
- ค่า re-KYC expiry ที่คำนวณจาก card, CDD หรือ suitability ถูก normalize เป็น UTC midnight ของวันถัดจาก expiry ตาม business timezone
- Stored watchlist report ใน KYC approval ไม่จำเป็นต้องมีครบทั้ง personal, background และ vulnerable-investor; missing group ถูกแสดงเป็น object ว่าง
- Application ที่เป็น `cancelled-by-system` ใช้ `OldCaptureId` เป็น source ของ customer detail เมื่อ KYC approval อ่าน completed-flow data
- Investment bank account read model แสดงเฉพาะ default account และแบ่งผลตาม XAM/XD company; business owner และ executor ยังคงเป็น `onboarding-service`

## State transitions

| Trigger | Application | Registration |
| :--- | :--- | :--- |
| DOPA completion และ forgery feature เปิด | ไม่เปลี่ยน DOPA/application state | background KYC → `forgery_flag` `pass`/`reject`/`error` แบบ asynchronous |
| KYC reviewer manual verifies rejected forgery | ไม่เปลี่ยน application | background KYC `reject` → `pass` พร้อม reviewer/memo |
| Employee requests retake | `to-review` → `to-retake` | → `identity-verification/front-card-scan` |
| DOPA success; profile/address match | `to-retake` → `to-review` | → `completed-draft/application-completed-draft` |
| DOPA success; data changed | คงอยู่ใน retake path จนลูกค้าตรวจข้อมูลต่อ | → `personal-information/personal` |
| DOPA error/expired condition | ไม่มี completion transition ใน path นี้ | ไม่เดิน profile-comparison transition |
| KYC approval reads customer list | ไม่เปลี่ยน application | คืน customer ที่ไม่ใช่ `rejected`/`onboarding` ตาม base query และ request filter |
| KYC approval reads stored capture | ไม่เปลี่ยน application | คืน `watchlist_report` เท่าที่มี stored report |
| KYC approval reads suitability/bank account | ไม่เปลี่ยน application | คืน v2/V1 suitability และ default investment bank account ที่ map ได้ |

ขั้น request ของ re-KYC เขียน flow type `retake-re-kyc` แต่ DOPA completion ปัจจุบันสร้าง status/history ด้วย `retake` และ success helper ตั้ง flow เป็น `onboarding`; ต้องยืนยัน intended state chain กับเจ้าของ `onboarding-service` ก่อนอธิบายผลของ re-KYC retake หลัง DOPA เป็นข้อเท็จจริงเพิ่มเติม

## Error and recovery behavior

- Automatic forgery เป็น asynchronous side path; error ถูก log และไม่เปลี่ยน DOPA response ที่สำเร็จแล้ว ส่วน client จะแสดง `error` และปิด main KYC actions เมื่อ read model ได้ผลดังกล่าว
- Manual forgery request ที่ claim ไม่ถูกต้องคืน HTTP 401, body ไม่ผ่าน validation คืน HTTP 400 และ service failure คืน HTTP 500
- `web-portal` แสดง memo เป็น optional และส่ง `null` เมื่อช่องว่าง แต่ backend DTO ติด `validate:required`; การทำงานจริงของ empty memo ต้องยืนยันกับเจ้าของ contract และไม่ถือว่า client behavior override backend validation
- KYC customer-list query ใช้ base status exclusion ที่กว้างกว่าเดิม; หาก UI ต้องการซ่อน `closed`, `inactive` หรือ `freeze` ต้องส่ง/ยืนยัน request status filter เพิ่มเติม ไม่ควรอนุมานจาก base query
- Claim ไม่ถูกชนิด: HTTP 401
- Request body ไม่ถูกต้อง: HTTP 400, code `4001` (`INVALID_REQUEST`)
- `current_status` ไม่ตรงกับ application ปัจจุบัน: HTTP 200, code `1000` (`INVALID_APPLICATION_STATUS`); client ต้อง refresh state ก่อน retry
- DOPA data changed: code `2009` เป็น business outcome สำหรับ review ข้อมูล ไม่ใช่ transport failure
- DOPA error/expired branch: code `6600`; source ไม่ยืนยัน automated retry ใน path นี้
- ถ้าการลบ `customer_laser_code`, การลบ `customer_image_verification` หรือ database update ใน retake transaction ล้มเหลว transaction จะคืน error และไม่ส่ง retake email; source ไม่ได้ยืนยัน error code แยกสำหรับ delete failure
- Repository, profile, address, Keycloak หรือ state update ล้มเหลว: request ล้มด้วย service error; transaction ครอบเฉพาะบางช่วง จึงห้ามสรุปว่า external/profile updates rollback พร้อมกันทั้งหมด
- การเขียน registration status/history หลัง DOPA completion log error แล้ว Flow ยังคืนผลได้ในบาง path; ต้องตรวจ log เมื่อ response สำเร็จแต่ progress ไม่เปลี่ยน
- Investment bank details service error คืน HTTP 500; แต่ถ้า customer-account lookup error ใน current implementation service คืน output ว่างพร้อม `nil` error ทำให้ handler ตอบ HTTP 200 ได้
- ถ้า suitability dependency ของ KYC approval อ่านไม่ได้ service คืน risk status แบบ `incomplete`; ไม่ควรตีความเป็นการเปลี่ยน application state

## Final outcomes

- KYC approval แสดง forgery outcome และ manual reviewer data; `reject` ต้องผ่าน manual verification ก่อน client จะแสดงผลสำเร็จ และ `error` ปิด main approval actions ใน `web-portal`
- เจ้าหน้าที่ส่ง application กลับให้ลูกค้าทำ identity verification ใหม่ได้โดยไม่บังคับทำ personal/suitability/bank step ที่ seed เป็น completed
- ข้อมูลตรงทั้งหมดจะกลับเข้า KYC review
- ข้อมูลเปลี่ยนจะถูก persist จากผล verify และพาลูกค้าไปตรวจ personal information
- Backend แยก `DOPA_SUCCESS` (`200`) ออกจาก `DOPA_DATA_CHANGE` (`2009`)
- KYC approval response แสดง stored watchlist report แบบ partial ได้โดยไม่ต้องมีครบทุกกลุ่ม
- KYC approval รองรับการอ่าน detail จาก `OldCaptureId` ของ `cancelled-by-system` และแสดงเฉพาะ default investment bank account ที่ผูก company ได้
- KYC approval customer list แสดง individual customer ที่ไม่ใช่ `rejected`/`onboarding` ตาม base predicate และอาจรวม status อื่นที่ไม่ถูก filter เพิ่มเติม

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
- `handler/webportal/kyc-customer-handler.go`: KYC customer list endpoint และ employee permission scope
- `pkg/kyc/helper.go`: `ValidateIsShowButtonRetake`
- `pkg/kyc/kyc-service.go`: request transaction, flow type และ registration history
- `pkg/ekyc/laserrepo/laser-repository.go`: ลบ `customer_laser_code` ตาม identification
- `internal/storages/postgres/customerimageverificationrepo/repository.go`: ลบ `customer_image_verification` ตาม identification
- `internal/domain/application.go`: `RetakeFlowType`
- `handler/ekyc-handler.go`: dispatch DOPA success สำหรับ `retake`
- `pkg/ekyc/dopasvc/dopa-service.go`: comparison, profile/address update และ state outcome
- `pkg/ekyc/ekyc-verification/service.go`: AdvanceAI profile/address comparison
- `pkg/customer/kyc_approver/helper.go`: re-KYC expiry timestamp normalization
- `pkg/customer/kyc_approver/helper.go`: stored capture mapping และ partial watchlist report
- `handler/webportal/kyc-approve-dto.go`: map watchlist report ไปยัง approval response
- `onboarding-service/pkg/customer/kyc_approver/customer-service.go`: KYC customer list scope, capture selection และ default investment-bank account output
- `pkg/customer/customer-repo/customer-repository.go`: KYC customer-list status/deleted predicate
- `onboarding-service/pkg/customer/kyc_approver/service.go`: suitability V1 fallback และ risk/answer mapping
- `onboarding-service/handler/webportal/kyc-customer-handler.go`: investment-bank-account endpoint
- `web-portal/src/app/features/kyc-approval/services/kyc-approval-detail.ts`: request-retake payload
- `web-portal/src/app/api/customer/[userId]/bank-account/route.ts`: bank-account proxy
- `pkg/customer/kyc_approver/helper.go`: CDD date truncation และ forgery result/reason mapping
- `handler/webportal/kyc-handler.go`: manual forgery verify และ forgery refresh handlers
- `handler/ekyc-handler.go`: asynchronous forgery trigger หลัง DOPA completion
- `pkg/ekyc/ekyc-verification/service.go`: AdvanceAI forgery call, audit และ background-KYC persistence

`web-portal`:

- `src/app/api/kyc-approval/forgery/route.ts`: manual forgery BFF
- `src/app/features/kyc-approval/services/forgery-verification.ts`: manual forgery client request
- `src/app/features/customer-new/components/forgery-verification/index.tsx`: customer detail forgery reason display
- `src/app/features/kyc-approval/components/personal-information-section/forgery-verification/index.tsx`: permission, memo และ user-visible forgery state
