---
title: Onboarding Status and Suitability
description: Flow อ่านความคืบหน้า onboarding, คำนวณ suitability แยก Traditional/Digital, รวมข้อมูล vulnerable-investor detail และยืนยันผลเพื่อเดิน registration ต่อ
capability: Customer
services: [onboarding-service, web-portal, xspring-mobile-app]
aliases: [onboarding status, suitability v2, suitability answers, V1 suitability, legacy suitability, V1 suitability version, suitability version ID, KYC suitability result, traditional suitability, digital suitability, vulnerable investor, vulnerable detail, NoInvestmentKnowledge, VulnerableFlag, watchlist refresh, complete draft, completed-draft, registration confirm, retake watchlist completion, background watchlist refresh, suitability confirm watchlist boundary, customer background risk, DOPA watchlist, onboarding change request log, offline account-opening review, application status date, application status_date, review-information, name_changed, has_default_bank_account, has_submitted_bank_account, submitted bank account, active bank accounts, ordered bank accounts, has default bank account, bank name change, bank grace period, accept bank grace period, bank account step, preserve background data, personal information payload, onboarding back navigation, source income selection, current work, work information, occupation, business type, business_type, occupation code, CDD product risk, product service risk, ProductServiceRiskData, เริ่ม onboarding, ยืนยันการลงทะเบียน, complete draft onboarding, change-request log, review ข้อมูลลูกค้า, สถานะเปิดบัญชี, แบบประเมินความเสี่ยง, ความเสี่ยง Traditional/Digital, ความเสี่ยง product service, ผู้ลงทุนเปราะบาง, ไม่มีความรู้การลงทุน, suitability test, รีเฟรช watchlist, complete draft หลังแก้ข้อมูล, รีเฟรช watchlist หลังแก้ background, confirm suitability ไม่ refresh watchlist, บันทึกเริ่มเปิดบัญชี, เปลี่ยนชื่อบัญชีธนาคาร, ยอมรับระยะผ่อนผันบัญชีธนาคาร, บัญชีธนาคารที่ใช้งานอยู่, บัญชีธนาคารที่ส่งแล้ว, เรียงบัญชีธนาคาร, ไม่ล้างข้อมูล background, ย้อนกลับขั้นตอน onboarding, เลือกรายได้จากแหล่งรายได้, ข้อมูลการทำงาน, อาชีพ, ประเภทธุรกิจ]
errorCodes: ["400", "401", "404", "500"]
status: active
lastUpdated: 2026-09-27
documentType: flow
---

## Purpose and scope

อธิบาย behavior ที่ `onboarding-service` ใช้รายงานความคืบหน้า onboarding และ API v2 สำหรับรับคำตอบ suitability, คำนวณคะแนน Traditional/Digital, บันทึกผลตามบริษัทที่กำลังเปิดบัญชี, refresh watchlist และยืนยันผลเพื่อขยับ registration status รวมถึงการคงข้อมูลระหว่าง personal-information sub-step, การประกอบ payload ของ mobile สำหรับ personal/address/work/background, bank-account requirement เมื่อไม่มี default account หรือชื่อบัญชีธนาคารเปลี่ยน และ read path ของ KYC approval ที่รองรับข้อมูล suitability รุ่นเก่าและรุ่นใหม่ พร้อม flags ของ bank-account context ใน `review-information` response

Source รอบนี้ยืนยัน behavior จาก Backend เป็นหลัก; `web-portal` และ `xspring-mobile-app` เป็น supporting client สำหรับ bank-account read, grace-period acceptance และ user-visible warning โดยไม่ override state หรือ validation ของ Backend; suitability confirm ไม่ควรถูกตีความว่าเป็น trigger ของ watchlist refresh หากไม่ได้เรียก refresh endpoint แยก

## Trigger and preconditions

**Owner service: `onboarding-service`**

- ผู้เรียกต้องผ่าน authenticated portal claim และ API-key authorization ของ endpoint
- `GET /api/v1/customer/onboarding/status` ใช้ `identification_id` จาก `PortalClaims.UserUUID`
- `POST /api/v2/suitability` ต้องส่ง suitability version และคำตอบที่ผ่าน `ValidateSuitability`
- ถ้า request ไม่ส่ง `flow_type`, submit endpoint ใช้ `onboarding`
- Submit ต้องพบ latest KYC-approval application และ change-request log เพื่อรู้ว่าจะเปิด XAM หรือ XD
- `PATCH /api/v2/suitability/confirm` ต้องส่ง `customer_background_suitability_id` และ `flow_type`
- การเริ่ม onboarding ของลูกค้าใหม่สร้าง `customer_change_request_log` ใน transaction เดียวกับ identification/application/registration history และกำหนด `HasDefaultBankAccount = false`

## Participating services

| Service | Role |
| :--- | :--- |
| `onboarding-service` | Business owner; authenticate request, derive onboarding progress, calculate/persist suitability, refresh dependent KYC data และเดิน registration |
| `xspring-mobile-app` | Supporting client; ประกอบและส่ง personal-information payload ตาม step/flow, อ่าน bank-account requirement, แสดงบัญชีที่ mask แล้ว และส่งคำขอรับทราบ bank grace period |
| `web-portal` | Supporting BFF/client; proxy investment-bank-account read และแสดง bank expiry warning ตามข้อมูลจาก Backend |

ไม่มี consumer หรือ asynchronous executor service อื่นที่ source ยืนยันสำหรับ Flow นี้; mobile/web ไม่ได้เป็น owner ของ registration state

## End-to-end sequence

### 1. Read onboarding progress

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`GET /api/v1/customer/onboarding/status` โหลด latest registration status, application change-request log และ history ของ `flow_type` ปัจจุบัน แล้วสร้างรายการ step เริ่มต้น:

1. `identity-verification`
2. `personal-information`
3. `suitability-test`
4. `bank-account`

ถ้า change-request log ระบุว่าลูกค้ามี default bank account และไม่มี `name_changed` ระบบตัด `bank-account` ออกจากผลลัพธ์; ถ้ามี default bank account แต่ชื่อบัญชีเปลี่ยน ระบบยังถือว่า `bank-account` เป็น required step

สำหรับ customer signup ใหม่ `createIdentificationTx` สร้าง change-request log หลัง registration history ภายใน transaction เดียวกัน โดยบันทึก `has_default_bank_account = false`; record นี้จึงพร้อมให้ status และ suitability read path ใช้เป็น account-opening context ตั้งแต่เริ่ม flow

การเขียน registration status ใน migrated, offline และ open-initial-account paths ใช้ `UpsertTx` ภายใน transaction: ถ้ามี record ของ `identification_id` อยู่แล้วจะ update status, sub-status, flow type, application และ soft-delete flag; ถ้าไม่พบจึง insert record ใหม่

ใน offline account-opening review confirm, `onboarding-service` เปลี่ยน application เป็น `to-review` พร้อมเขียน `application.status_date` จาก `userUpdate.UpdatedAt`; submitted action-flow ใช้ `application.StatusDate()` เป็น `StartDate` และการเขียน application, action-flow, change-request log, registration status, suitability และ FATCA/CRS อยู่ใน transaction เดียวกัน

### Bank-account requirement and bank-name-change grace period

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service` สำหรับ state และ transaction; `xspring-mobile-app` สำหรับ client flow**

Onboarding/re-KYC status ใช้กฎ bank step เดียวกัน: `bank-account` ต้องทำเมื่อไม่มี default bank account หรือเมื่อมี default bank account แต่ `name_changed = true`; เมื่อมี default account และชื่อไม่เปลี่ยนจึงข้าม step ได้

เมื่อเข้า bank step mobile เรียก `GET /api/v1/customer/bank-accounts` เพื่ออ่าน active bank accounts ที่ mask แล้ว และสำหรับกรณีชื่อบัญชีเปลี่ยนจะเปิดหน้ารับทราบ grace period แล้วเรียก `POST /api/v1/customer/accept-bank-grace-period` พร้อม `{ "flow_type": ... }` หลังผู้ใช้กดยืนยัน

Bank-account read path กรองเฉพาะรายการที่ `status = active` และ `is_deleted = false` จากนั้นเรียง `default_red` มาก่อน, `created_at` ใหม่กว่ามาก่อน, แล้ว `bank_code` และ `bank_account_no` จากน้อยไปมาก การเรียงนี้ใช้ทั้งรายการ masked สำหรับลูกค้าและรายการ back-office `/api/v1/customer/{identification_id}/bank-account-list`; เป็นลำดับของ read response ไม่ใช่การคำนวณ default account ใหม่

`onboarding-service` โหลด application/change-request log ของ flow นั้น, บันทึก `bank_account_grace_period_accepted = true`, เรียก `UpdateNextStatusAndCreateHistory` สำหรับ `bank-account` และถ้า registration อยู่ใน `completed-draft` path จึงเรียก completion logic ต่อ การกดยอมรับจาก mobile ไม่ได้เปลี่ยน account status โดยตรง

`web-portal` ใช้ investment-bank-account read path เพื่อแสดง `bank_expiry_date` เมื่อ Backend คืนค่า การที่ UI แสดงข้อความเกี่ยวกับวันหมดอายุเป็น supporting behavior; source ที่ตรวจยังไม่ยืนยันว่าเป็นกฎลบบัญชีอัตโนมัติหรือกำหนด 90 วันจากวันที่ใด

### 2. Derive completion by flow type

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

แต่ละ step เป็น `completed` ต่อเมื่อ history มี sub-status ที่จำเป็นครบทุกตัวของ flow นั้น:

- `onboarding`: identity รวม nationality, FATCA, card/liveness และ NDID chain; personal information รวม personal/address/work/background
- `retake`: identity ใช้ card/liveness/NDID; personal information ใช้ personal/address/work/background
- `re-kyc`: identity ใช้ card/liveness/NDID; personal information เพิ่ม FATCA
- `retake-re-kyc`: เหมือน retake สำหรับ step ที่ source ระบุ
- suitability และ bank account ใช้ sub-status ชื่อเดียวกับ step

สำหรับ application type `new` ใน flow `onboarding`, response เพิ่ม `expiry_date = application.created_at + 7 วัน` รูปแบบ `DD/MM/YYYY`; flow/type อื่นไม่คืนค่านี้

### Supporting mobile personal-information payload

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

**Supporting client: `xspring-mobile-app`**

Mobile เก็บข้อมูล personal information ไว้ใน local model แล้วส่ง `PUT /api/v1/customer` พร้อม `step` และ `flow_type` เมื่อผู้ใช้กด Next ของแต่ละ sub-step; Backend เป็นผู้ validate request, เขียน customer profile/background/address และเดิน registration history ต่อ

พฤติกรรม client ที่เปลี่ยนในรอบนี้และมีผลต่อ request/validation ที่ผู้ใช้เห็น:

- ใน address step, mobile clone address cards ก่อน `prepareRequest()` จะล้าง fields ของ address ที่อ้างอิง address อื่น เพื่อไม่ให้การปรับ outgoing payload ล้างค่าที่อยู่ใน memory ของ form เดิม
- ใน work-information step, การเลือก occupation จะ persist `current_work.occupation` ทันที ก่อนรอ `GET /api/v1/business-type?OccupationCode={code}`; การเลือกอาชีพใหม่จะล้าง `business_type`, `business_type_other`, `job_title` และ `company_name` ที่ผูกกับอาชีพเดิม
- `PersonalController` และ `AddressController` ถูกสร้างเป็น screen-local controller ด้วย `Get.put` ใน flow ปัจจุบัน ไม่พึ่ง permanent/shared instance จากหน้าเดิม; เมื่อเข้า work-information, client reload personal-information local model ก่อนโหลด choices เพื่อไม่ใช้ state เก่าจาก screen instance เดิม
- ค่า source of income ที่ user เลือกถูก map กับรายการที่ sort แล้วตาม display value ไม่ใช่ลำดับ raw ที่ API ส่งมา; การเปลี่ยนนี้แก้ client selection behavior เท่านั้นและไม่เปลี่ยน backend payload contract หรือ validation ownership
- ถ้า business-type response ว่าง mobile ถือว่า business type เป็น optional ใน client validation; ถ้ามี `Other` เพียงรายการเดียวจะเลือก code `180` ให้อัตโนมัติ และถ้า occupation code `25` (Buddhist Monk / Priest) มี business type code `60` จะเลือก code `60` ให้อัตโนมัติ
- client validation ของ mobile normalize `null` เป็นค่าว่างก่อนตรวจ: `occupation_other` ต้องไม่ว่างเมื่อ occupation code เป็น `Other` และต้องว่างเมื่อเป็น occupation ปกติ; `business_type_other` ใช้กฎเดียวกันกับ business type code `180` (`Other`) ส่วน business type code อื่นห้ามมีข้อความค้าง
- mobile แสดง/ส่งชื่อจาก master-data ที่ Backend คืนมา และส่ง `occupation`, `business_type`, `occupation_other` หรือ `business_type_other` ตามค่าที่ผู้ใช้เลือก/กรอก; `onboarding-service` ยังคงตรวจ master-data combination และเป็นผู้ persist ค่าใน `customer_background`

ข้อกำหนด client เหล่านี้เป็น supporting behavior เท่านั้น ไม่ได้ override `CurrentWorkData` validation หรือการ normalize ชื่อ/combination ที่ `onboarding-service` ทำก่อนบันทึก

### 3. Update personal information and complete a draft

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อ `UpdateCustomerWithPersonalInformation` บันทึก personal-information step สำเร็จ handler จะตอบ `200` (`success update data personal`) และอัปเดต registration history ของ step นั้น การบันทึก `background` ไม่ได้เปิด asynchronous watchlist refresh อีกต่อไป:

1. `onboarding-service` persist profile/background และข้อมูลของ sub-step ที่ request ส่งมา
2. `onboarding-service` เรียก `UpdateNextStatusAndCreateHistory` ตาม `step` และ `flow_type`
3. การคำนวณ watchlist จะเกิดเมื่อเข้า completion path ที่ระบุด้านล่าง ไม่ใช่จากการบันทึก `background` เพียงอย่างเดียว

เส้นทาง personal-information นี้ไม่เรียกทั้ง `UpsertWatchlistReport` หรือ `CheckAndSaveCustomerWatchlist` จาก handler เดียวกันอีกต่อไป; KYC approval refresh และ completion service เป็นคนละ trigger ที่มีการคำนวณ/side effect ของตนเอง

การบันทึก `work-information` และ `background` จะอ่าน `customer_background` เดิมก่อน แล้ว overlay field ที่ step ปัจจุบันเป็นเจ้าของลงบน row เดิม จึงไม่ rebuild เป็น row ว่างที่ล้างข้อมูลของอีก personal-information sub-step; ทั้งสอง step ยังอัปเดต `UpdatedAt`/`UpdatedBy` ตาม request ปัจจุบัน

สำหรับ `background` ระบบจะอ่าน `customer_background.vulnerable_detail` เดิมก่อน แล้ว merge กับข้อมูลจาก request: `YearsOld60` คำนวณใหม่จากวันเกิดเมื่อมีค่า, `Disability` ใช้ `IsInvestmentDecision` ของ request และ `NoInvestmentKnowledge` ที่มีอยู่เดิมจะไม่ถูกล้างเพียงเพราะบันทึก background ซ้ำ จากนั้นระบบ marshal detail ที่รวมแล้วและคำนวณ `VulnerableFlag` จาก detail ชุดเดียวกัน

ถ้า flow เป็น retake หลังบันทึก `background`, service จะอ่าน registration status, application และ change-request log อีกครั้ง ถ้า `name_changed = true` หรือสถานะล่าสุดยังไม่ใช่ `completed-draft` จะจบเฉพาะการบันทึก step และปล่อยให้ flow เดินผ่าน `bank-account`/ขั้นถัดไปตาม rule เดิม ถ้าเป็น `completed-draft` และไม่มี name change จึงเรียก `CompleteDraftRetake` ซึ่งเป็น completion path ของ retake

`CompleteDraftRetake` คำนวณ watchlist ด้วย `RetakeWatchlistTypes`, persist report ของ personal/background-risk/vulnerable-investor และอัปเดต bank-account expiry; เมื่อผล watchlist ครบจะพยายามคำนวณ CDD และ ensure enhanced documents โดย failure ของ side effect นี้ถูก log และไม่หยุด completion ถ้าผ่าน auto-reject decision ระบบส่ง customer capture เป็น `Submit`, เปลี่ยน application เป็น `rejected` และ patch change-request log ด้วย actor ของ AML; ถ้าไม่ auto-reject ระบบเปลี่ยน application เป็น `to-review`, บันทึก submitted action-flow/metadata, resolve vulnerable ticket เมื่อจำเป็น และส่ง customer capture เป็น `Submit`

#### Final completion via registration-confirm

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`POST /api/v1/customer/registration-confirm` อ่าน registration status ปัจจุบัน, เดิน next status/history แล้วเรียก `RegistrationCompleteService.CompleteDraft` สำหรับ flow ที่ส่งมา โดย completion path นี้:

1. คำนวณ watchlist ด้วย `AllWatchlistTypes` และ persist report ทั้งสามกลุ่ม
2. เมื่อผลคำนวณครบ พยายามคำนวณ CDD และ ensure enhanced documents โดย side effect นี้ log failure แล้วเดินต่อ
3. อัปเดต bank-account expiry, `application_date` และ submitted-date ของ application/customer background ที่เกี่ยวข้อง
4. ถ้าไม่ auto-reject จะบันทึก submitted action-flow, เปลี่ยน application เป็น `to-review`, patch change-request log, resolve vulnerable ticket และส่ง customer capture เป็น `Submit`
5. ถ้า auto-reject จะส่ง customer capture เป็น `Submit`, เปลี่ยน application เป็น `rejected` และ patch change-request log ด้วย reviewer/AML metadata

การ patch `change-request-log` แยก account-opening intent: initial-account-only จะเติม submitted metadata เมื่อยังว่าง, additional-account path จะ stamp submitted metadata ใน completion และ auto-reject จะ stamp reviewer fields พร้อม approved actor ของ AML ตามค่าที่ Backend กำหนด

สำหรับ flow `onboarding` หลัง completion สำเร็จ service ส่ง welcome email และ onboarding notification; flow `re-kyc` ใช้ re-KYC waiting-approval notification ตาม flow type

### 4. Submit suitability answers

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`POST /api/v2/suitability`:

1. โหลดชุดคำถามจาก suitability version
2. รวม score ของคำตอบที่ `is_calculate_score`; multiple-answer ใช้ตัวเลือกคะแนนสูงสุดแบบ unique ตาม helper
3. คำนวณ Traditional score จาก base score
4. คำนวณ Digital score จาก base score และปรับ digital-experience rule เมื่อคำตอบระบุว่ามีประสบการณ์ digital asset
5. map score แต่ละชุดเป็น risk level
6. อ่าน account-opening intent จาก change-request log

ถ้า `IsXAMOpen` เป็นจริงจะบันทึก `customer_suitability_traditional`; ถ้าไม่ใช่และ `IsXDOpen` เป็นจริงจึงบันทึก `customer_suitability_digital` หากไม่พบทั้งสองแบบ request ล้มเหลว

#### CDD product-service risk calculation

ใน `CalculateCDDScore` ระบบคำนวณ product-service risk จาก account-opening intent ล่าสุดของ application/change-request log แยกจาก suitability score แล้ว persist ลง CDD risk/detail:

- เปิด XAM อย่างเดียว: ใช้ config `ProductXAMRiskScore`, `risk_choice = 4.2`, detail `MF, PF` และ `product_service_risk_data` เป็น `{ dealer: false, da_broker: false, ico_portal: false, mf: true, pf: true }`
- เปิด XD อย่างเดียว: ใช้ config `ProductXDRiskScore`, `risk_choice = 4.3`, detail `DA Broker/Dealer/ICO Portal และ MF, PF` และ flags เป็น `{ dealer: true, da_broker: true, ico_portal: true, mf: false, pf: false }`
- เปิดทั้ง XAM และ XD: ใช้ `ProductXDRiskScore`, case `4.3`, detail เดียวกับ XD และตั้ง flags ทุกตัวเป็น `true`

ระบบ upsert `product_service_risk_score`, `product_service_risk_case` และ `product_service_risk_data` ใน customer CDD risk/detail; ถ้าอ่าน latest application หรือ change-request account-opening intent ไม่ได้ การคำนวณ CDD จะคืน error แทนการเดา product mix

### 5. Return calculated result

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Response คืน ID ของ suitability record, description จาก risk-level mapping และ score ของ Traditional/Digital โดย score ที่ไม่เกี่ยวกับบัญชีที่เปิดยังคงคำนวณได้ แต่ persistence เลือกตาม account-opening rule ในขั้นก่อนหน้า

### 6. Confirm suitability

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`PATCH /api/v2/suitability/confirm` เลือก application type `new` สำหรับ flow ทั่วไป หรือ `re-kyc` เมื่อ `flow_type = re-kyc`, โหลด account-opening intent และ current CDD score จากนั้น:

1. อ่าน suitability answer ของบัญชีที่เปิด
2. คำนวณและบันทึก `NoInvestmentKnowledge` จากคำตอบ suitability แล้วคง field vulnerable detail อื่นที่อ่านได้จาก customer background
3. คำนวณ `VulnerableFlag` ใหม่จาก `YearsOld60`, `NoInvestmentKnowledge` และ `Disability`
4. ขยับ registration จาก `suitability-test` ไป step ถัดไปและสร้าง history
5. ถ้าเป็น retake ที่ suitability เป็น step สุดท้ายก่อน completed draft ให้เดิน application completion logic ต่อ

Current `ConfirmSuitabilityTraditionalAndDigital` ไม่เรียก `RefreshWatchlistReportWithApplicationID` หรือ `UpsertWatchlistReport`; การคำนวณ watchlist ใน Flow นี้ต้องมาจาก completion path (`registration-confirm` หรือ retake/bank completion) หรือ endpoint refresh ที่ระบุไว้ใน [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/) ไม่ใช่จากการ confirm suitability หรือบันทึก background เพียงอย่างเดียว

### 7. Read suitability for KYC approval

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อ KYC approval ต้องแสดง suitability ระบบเลือกข้อมูลตาม account-opening intent จาก change-request log:

- มีข้อมูล v2 ของบริษัทที่ต้องแสดง: ใช้ `customer_suitability_traditional` สำหรับ XAM และ `customer_suitability_digital` สำหรับ XD
- ไม่พบข้อมูล v2 หรือได้ `gorm.ErrRecordNotFound`: ใช้ suitability V1 ได้ต่อเมื่อ V1 มี `SuitabilityVersionID` ที่ไม่เป็น nil แล้วสร้าง output ของบริษัทนั้นพร้อม channel เป็น `XSPRING_APP`
- ถ้า V1 row มีอยู่แต่ `SuitabilityVersionID` เป็น nil ระบบคืน error `V1 suitability not found ...` และไม่สร้าง suitability read model จากข้อมูลนั้น
- หากมีทั้ง Traditional และ Digital ในการอ่าน suitability รวม ระบบเลือก record ที่มี `evaluation_date` ล่าสุด; หากไม่มีทั้งสองฝั่งจึง fallback ไป V1
- หาก aggregate risk ที่อ่านได้ยังไม่มี risk level ของฝั่งใด แต่มี record ของฝั่งนั้น ระบบเติม risk level และ description จาก record กับ master risk mapping ก่อนส่ง response

การอ่านคำตอบก็มี compatibility path: KYC service อ่าน answer จาก legacy table ก่อน และเมื่อไม่พบหรือ payload ว่างจึงใช้คำถาม/คำตอบจากตาราง v2; ถ้าคำตอบ v2 ทั้ง Traditional และ Digital เป็น `nil`, suitability service ใช้ answer จาก V1 เป็นทั้งสองชุดเพื่อ map กับ master question การอ่านทั้งหมดเป็น read path และไม่เปลี่ยน registration state

`GET /api/v1/customer/review-information` ส่ง `name_changed`, `has_default_bank_account` และ `has_submitted_bank_account` เพิ่มจาก `has_accepted_bank_account_grace_period` โดยค่าถูกส่งต่อจาก change-request log ของ application ที่ service เลือกอ่าน การเพิ่ม fields นี้เป็น read-only context และไม่เปลี่ยน registration state; mobile parse fields เหล่านี้ใน review model แล้ว additional-account review ใช้ `has_submitted_bank_account` เพื่อเลือก normal bank-account display ส่วน re-KYC review ใช้ `has_default_bank_account`, grace-period และ `name_changed` เพื่อเลือก name-change warning

## Business rules

- Backend claim เป็นแหล่ง `identification_id`; request ไม่เลือก customer เอง
- Step completion ต้องมี required sub-status ครบ ไม่ใช่ดูเฉพาะ current status
- เมื่อเจ้าหน้าที่ request retake ระบบสร้าง completed history สำหรับ personal/address/work/background/suitability/bank ของ flow ที่เลือก แล้วตั้ง current step กลับไป `identity-verification/front-card-scan`
- Application type `re-kyc` ใช้ `retake-re-kyc` ตอนเริ่ม retake; application type อื่นใช้ `retake`
- Default bank account ที่ไม่มีชื่อเปลี่ยนทำให้ status response ไม่แสดง bank-account step; ถ้าชื่อบัญชีเปลี่ยน (`name_changed`) bank-account step ยัง required แม้มี default account
- Bank grace-period acceptance เป็น transaction ของ `onboarding-service` ที่บันทึก acceptance และสร้าง bank-account history ก่อนเดิน registration ต่อ; mobile เป็นเพียง client trigger
- `GET /api/v1/customer/bank-accounts` คืนเฉพาะ bank account ที่ `active` และไม่ถูก soft-delete (`is_deleted = false`) ในลำดับ default ก่อน, ใหม่ก่อน, bank code/account number ตามลำดับ; response ของลูกค้าถูก mask และ `POST /api/v1/customer/accept-bank-grace-period` รับ `flow_type` เพื่อยืนยันการรับทราบ
- `GET /api/v1/customer/review-information` คืน `name_changed`, `has_default_bank_account`, `has_submitted_bank_account` และ grace-period flag เป็น nullable values จาก change-request log; fields นี้เป็น read context ไม่ใช่ state transition และ `has_submitted_bank_account` สะท้อนว่าการสร้าง bank account เคยตั้ง flag สำเร็จ
- `VulnerableDetail` เป็น composite ของ `YearsOld60`, `NoInvestmentKnowledge` และ `Disability`; `VulnerableFlag` เป็น `true` เมื่อ field ที่มีค่าใด ๆ เป็น `true`, เป็น `false` เมื่อ field ที่มีค่าเป็น `false` ทั้งหมด และเป็น `nil` เฉพาะเมื่อทั้งสาม field ไม่มีค่า
- Background update merge `VulnerableDetail` เดิมก่อนเขียน โดย refresh เฉพาะ age/disability จาก request และคง `NoInvestmentKnowledge` ที่มีอยู่เดิมไว้
- Suitability confirm เขียน `NoInvestmentKnowledge` แล้วใช้ composite detail เดิมคำนวณ `VulnerableFlag` ใหม่; partial JSON ที่ขาดบาง field ไม่ทำให้การคำนวณ dereference nil
- `bank_expiry_date` ที่ web แสดงเป็น read-model/warning contract; source รอบนี้ยังไม่ยืนยัน 90-day calculation หรือ bank-removal executor
- Customer signup ใหม่ต้องสร้าง change-request log พร้อม `has_default_bank_account = false` ก่อน transaction สร้าง customer จะ commit
- Multiple-answer suitability ใช้ helper เลือกคะแนนสูงสุดแบบ unique ก่อนรวมคะแนน
- Digital score อาจต่างจาก Traditional score เพราะ digital-experience adjustment
- Persistence เลือก Traditional ก่อนเมื่อ `IsXAMOpen`; Digital ใช้เมื่อ XAM ไม่เปิดและ `IsXDOpen` เป็นจริง
- v2 confirm ใช้ current CDD score และไม่เรียก CDD score recalculation ใน production path นี้
- `ConfirmSuitabilityTraditionalAndDigital` อัปเดต evaluation date, `NoInvestmentKnowledge`, `VulnerableFlag` และ registration history แต่ไม่รับประกันว่า watchlist report ถูกคำนวณใหม่ เพราะ current production path ไม่เรียก watchlist refresh
- หลังบันทึก personal-information step `background`, current customer path ไม่เรียก watchlist calculation จาก handler นี้; retake ที่อยู่ `completed-draft` และไม่มี name change จะส่งต่อไป `CompleteDraftRetake` ซึ่งคำนวณด้วย `RetakeWatchlistTypes`
- Work/background personal-information updates อ่าน row `customer_background` เดิมแล้ว overlay ข้อมูลของ step ปัจจุบัน เพื่อไม่ล้าง field ที่อีก sub-step บันทึกไว้
- Mobile work-information จะล้าง business type, other text, job title และ company name เมื่อเปลี่ยน occupation ใน local payload; การ auto-select business type เป็น client convenience และ backend ยังตรวจ master-data combination ก่อน persist
- Mobile address request ใช้ cloned cards สำหรับการล้าง fields ของ address ที่อ้างอิง address อื่น จึงไม่ควรตีความการล้าง outgoing payload เป็นการลบ address ที่เก็บใน backend
- ใน legacy `CheckAndSaveCustomerWatchlist` path ระบบ pre-create `customer_background_risk` ของ `customer` และ `spouse` ก่อน parallel checks และใช้ `personalType` ที่ร้องขอเมื่อสร้าง PEP/AMLO record เพื่อป้องกัน duplicate record จาก concurrent insert
- ใน non-retake watchlist refresh, stored DOPA report ที่มีสถานะ `Passed` เท่านั้นที่ทำให้ DOPA check ถูกข้าม; report ที่ `Error`, ไม่มี flag หรือไม่ใช่ `Passed` จะไม่ถูกใช้เป็น filter และจะคำนวณตาม allowed watchlist types ของ registration status
- Registration status ใน migrated/offline/open-initial-account paths update record เดิมเมื่อพบ `identification_id` ภายใน transaction แทนการเพิ่มแถวซ้ำ
- Offline account-opening review confirm กำหนด `application.status_date` จากเวลาที่ reviewer update และสร้าง submitted action-flow โดยอ้างอิง `application.StatusDate()` เป็น start date; timestamp alignment นี้ไม่เปลี่ยน required-step rule
- KYC approval ใช้ v2 suitability ก่อน และ fallback ไป V1 เฉพาะเมื่อข้อมูล v2 ของฝั่งที่ต้องแสดงไม่มีอยู่/เป็น record-not-found และ V1 มี `SuitabilityVersionID` ที่ใช้ได้
- ในการ map answer จาก v2 หากมี Traditional answers จะเลือกชุดนั้นก่อน Digital answers; หากทั้งสองชุดว่างจะคืน answer ว่างโดยไม่แต่งข้อมูลเพิ่ม
- Product-service risk เป็น component ของ CDD calculation ไม่ใช่ suitability score; product mix XAM/XD เป็นตัวเลือก score/case/data ที่ถูก persist ใน CDD risk/detail

## State transitions

**Owner service: `onboarding-service`**

| Trigger | State effect |
| :--- | :--- |
| Submit suitability | create/update Traditional หรือ Digital suitability record; ยังไม่ขยับ registration |
| Calculate CDD score | upsert aggregate CDD risk พร้อม product-service risk score/case/data; ไม่ขยับ registration |
| Confirm suitability | `suitability-test` → next registration sub-status พร้อม history |
| Update personal work/background | persist step และเดิน registration history; preserve field ของ `customer_background` ที่อยู่นอก step ปัจจุบัน แต่ไม่เริ่ม watchlist refresh จาก background update เพียงอย่างเดียว |
| Mobile ส่ง personal-information step | `onboarding-service` validate และ persist profile/address/background ตาม `step`; client local-state cleanup/auto-selection ไม่สร้าง state transition เอง |
| Retake และ suitability เป็น final draft step | เพิ่ม `completed-draft`; เมื่อ final step ทำให้ status เป็น `completed-draft` และไม่มี name-change bank path จึงเข้า `CompleteDraftRetake` |
| Read onboarding status | ไม่แก้ state; derive `draft`/`completed` จาก history |
| Bank step required เพราะไม่มี default account หรือชื่อบัญชีเปลี่ยน | status คง/เดินไป `bank-account` ตาม required-step rule |
| Accept bank grace period | บันทึก acceptance → `bank-account` history/next status; ถ้าเป็น retake และ status หลัง update เป็น `completed-draft` จะเรียก `CompleteDraftRetake` |
| Registration confirm | เดิน next registration status/history แล้ว `CompleteDraft` คำนวณ watchlist; application ไป `to-review` หรือ `rejected` ตาม auto-reject decision |
| Start new onboarding | สร้าง `customer_change_request_log` พร้อม `has_default_bank_account = false` ภายใน customer-creation transaction |
| KYC approval reads suitability/answers | ไม่แก้ state; ใช้ v2 หรือ fallback V1 เพื่อสร้าง read model |
| Create customer bank account | ไม่เปลี่ยน application โดยตรง; พยายามตั้ง `has_submitted_bank_account = true` ใน change-request log หลังสร้าง bank row |
| Read `review-information` | ไม่แก้ state; คืน `name_changed`, `has_default_bank_account`, `has_submitted_bank_account` และ grace-period context จาก change-request log |

## Error and recovery behavior

- ใน `GET /web/api/v2/kyc/{application_id}/current` และ route ที่ระบุ step, error จาก KYC approval service ถูก handler map เป็น HTTP 404; กรณี V1 ไม่มี `SuitabilityVersionID` จึงไม่ถูกส่งเป็น partial suitability output
- Claim ไม่ถูกชนิด: HTTP 401
- `identification_id` ใน claim parse ไม่ได้: onboarding-status คืน HTTP 400
- Binding/validation ของ suitability ไม่ผ่าน: HTTP 400 และไม่ persist ผล
- ไม่พบ application/change-request/account-opening intent: submit/confirm ล้มเหลวก่อนเดิน state
- confirm service error ถูก map เป็น HTTP 404 ใน handler ปัจจุบัน
- onboarding-status อ่าน dependency ไม่สำเร็จ: HTTP 500
- Bank account list, application lookup หรือ grace-period acceptance ล้มเหลว: ไม่ควรถือว่า bank step ผ่าน; source ไม่ยืนยัน retry หรือ rollback ของ external client state
- Backend expiry read คืนค่าได้ แต่ source ที่ตรวจยังไม่พบ executor ลบบัญชีตาม expiry และไม่ยืนยันว่าข้อความ 90 วันของ client เป็น calculation rule
- Background personal-information update ตอบสำเร็จหลัง primary write และ history update; source รอบนี้ไม่ยืนยันว่า watchlist ถูกคำนวณจาก trigger นี้
- `handleWorkStep` และ `handleBackgroundStep` ไม่ propagate error จากการอ่าน existing background; `handleBackgroundStep` ยังไม่ propagate error จากการ unmarshal `VulnerableDetail` ถ้าอ่าน/parse เดิมล้มเหลว source ปัจจุบันยังเดินต่อด้วยข้อมูลที่มีและพยายาม upsert จึงไม่ควรสรุปว่า field เดิมจะถูก preserve ในกรณี dependency/JSON error
- การตั้ง `has_submitted_bank_account` เกิดหลัง bank row ถูกสร้าง; ถ้า change-request log update ล้มเหลว service log error และยังดำเนิน bank-account flow ต่อ โดย `review-information` อาจยังคืนค่าเป็น nil
- `CompleteDraft`/`CompleteDraftRetake` หาก `CalculateWatchlist` ล้มเหลวจะคืน service error ก่อน final application transition; CDD/enhanced-document side effect ที่ถูกเรียกหลังผล watchlist ครบเป็น best effort และ log error แล้วเดินต่อ
- Completion ที่เปลี่ยน application หรือ customer capture สำเร็จบางส่วนแล้ว ถ้า patch change-request log, vulnerable ticket หรือ capture submit ล้มเหลว อาจเหลือ state บางส่วนที่ต้องตรวจจาก application/action-flow/capture log; source ไม่ยืนยัน rollback ครอบคลุมทุก external side effect
- KYC approval suitability dependency error ถูกแปลงเป็นผล `incomplete` ใน `getSuitability`; error ตอนอ่าน answer ทำให้ response ไม่มี answer ที่ map ได้ ส่วน legacy risk-result path จะคืน error เมื่อทั้ง legacy และ fallback v2 อ่านไม่ได้

## Final outcomes

- Caller เห็น `flow_type`, optional onboarding expiry และสถานะของ step ที่คำนวณจาก history
- Suitability score/risk level ถูกบันทึกในตาราง Traditional หรือ Digital ตาม account-opening intent
- หลัง confirm, customer background vulnerability ถูกอัปเดตและ registration เดินพ้น suitability step
- หลัง update background ระบบ persist ข้อมูล step และ history แต่ไม่คำนวณ `watchlist_report` จาก trigger นี้; watchlist report จะถูกคำนวณใน completion path หรือ explicit KYC refresh ตาม endpoint ที่เรียก
- หลัง update background หรือ confirm suitability, `customer_background.VulnerableFlag` สะท้อน composite vulnerable detail ที่ current backend คำนวณได้
- Flow อาจจบที่ completed draft/completion สำหรับ retake ที่ suitability เป็น step สุดท้าย
- ลูกค้าที่มี default bank account แต่ชื่อบัญชีเปลี่ยนต้องผ่าน bank-account/grace-period step ก่อน registration จะเดินต่อ; ลูกค้าที่ไม่มี name change ยังข้าม step ได้เมื่อมี default account และ retake background path จะเรียก completion ตาม `name_changed` decision
- Bank-account read response ไม่คืนรายการ inactive หรือ soft-deleted และมี deterministic ordering ที่ default/created time/bank identifiers
- KYC/customer review read response มี `name_changed`, `has_default_bank_account`, `has_submitted_bank_account` และ `has_accepted_bank_account_grace_period` เพื่อให้ client เห็น context ของ bank step โดยไม่ย้าย ownership ของ state ไปที่ client
- KYC approval แสดง risk, evaluation date, channel และคำตอบจาก v2 ได้ และยังอ่าน customer รุ่นเก่าผ่าน V1 fallback ที่มี version id ได้

## Related shared rules

- [Customer Onboarding and KYC](/business-flows/customer/)
- [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/)
- [KYC Expiry and Account Suspension](/business-flows/customer/kyc-expiry-and-suspension/)
- [Permissions and Access Control](/shared-rules/permissions/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`onboarding-service`:

- `routes/routes.go`: `registerRouteSuitability`, `registerRouteCustomer`
- `handler/customer-handler.go`: `GetCustomerOnboardingStatus`, `UpdateCustomerWithPersonalInformation` และ `RegistrationCustomerConfirm`
- `pkg/customer/customer-resigtration-status/customer-resigtration-status-svc/customer-resigtration-status-service.go`: `GetCustomerOnboardingStatusStep`
- `internal/constants/enum/xpg-customer-registartion-status.go`: required sub-status mapping
- `handler/suitability-handler.go`: v2 submit/confirm handlers
- `pkg/suitability/suitability-service.go`: score, persistence และ confirmation behavior
- `pkg/kyc/watchlist.go`: stored DOPA flag filtering และ watchlist refresh orchestration
- `pkg/kyc/helper.go`: `filterPassedWatchlistTypes`
- `pkg/kyc/kyc-service.go`: legacy watchlist save และ pre-create ของ customer/spouse background risk
- `internal/models/customer-background-db-model.go`: unmarshal และ composite calculation ของ `VulnerableDetail`
- `utils/age.go`: การคำนวณ `YearsOld60` จากอายุปัจจุบัน
- `pkg/customer/customer-process/customer-process-service.go`: preserve existing customer background fields ระหว่าง work/background update และ retake completion decision
- `pkg/customer/registrationcomplete/service.go`: `CompleteDraft`, `CompleteDraftRetake`, watchlist calculation, auto-reject, application/action-flow/capture completion และ change-request log patch
- `pkg/customer/customer-bank-account/service.go`: retake completion trigger หลัง create bank account หรือ accept grace period เมื่อ registration เป็น `completed-draft`
- `handler/customer-handler.go`: `PUT /api/v1/customer` personal-information handler, step/flow validation และ `POST /api/v1/customer/registration-confirm` trigger
- `internal/models/personal-information-model.go`: `Personal`/`CurrentWorkData` payload fields และ required validation tags
- `pkg/customer/customer-process/customer-process-service.go`: work-step persistence, occupation/business-type normalization และ master-data validation
- `handler/master-data-handler.go`: `GET /api/v1/business-type?OccupationCode=...`
- `xspring-mobile-app/lib/domains/ekyc/onboarding/personal/personal_screen.dart`: shared personal controller usage
- `xspring-mobile-app/lib/domains/ekyc/onboarding/address/address_screen.dart`: shared personal controller across back navigation
- `xspring-mobile-app/lib/domains/ekyc/onboarding/work_information/work_information_controller.dart`: reload personal data and sorted source-income mapping
- `pkg/suitability/suitability-service.go`: update `NoInvestmentKnowledge` และ `VulnerableFlag` ตอน confirm suitability
- `internal/domain/customer_suitability.go`: Traditional/Digital persistence models
- `pkg/cdd-score/cdd-score-service.go`: `CalculateCDDScore`, product-service risk calculation และ persistence
- `internal/config/config.go`: `ProductXAMRiskScore` และ `ProductXDRiskScore`
- `internal/models/customer-cdd-risk-db.go`: CDD risk/detail fields สำหรับ product-service risk
- `onboarding-service/pkg/customer/customer-suitability/service.go`: v1 fallback, latest evaluation selection และ question/answer mapping
- `onboarding-service/pkg/customer/kyc_approver/service.go`: company-specific suitability read model และ risk fallback
- `onboarding-service/pkg/kyc/kyc-service.go`: legacy answer/risk-result fallback ไปยัง v2 suitability
- `onboarding-service/pkg/customer/customer-process/customer-process-service.go`: registration status write path ที่เรียก `UpsertTx`
- `onboarding-service/pkg/customer/customer-process/customer-process-service.go`: `createIdentificationTx` และ `createCustomerChangeRequestLog` สำหรับ initial onboarding context
- `onboarding-service/pkg/offlineonboarding/service.go`: offline review confirm, application `StatusDate` และ submitted action-flow `StartDate`
- `onboarding-service/pkg/customer/customer-bank-account/service.go`: bank-account list, `has_submitted_bank_account` flag, `AcepptGracePeriod` และ investment-bank-account read
- `onboarding-service/pkg/customer/customer-bank-account/customer-bank-account-repo/repository.go`: active/non-deleted bank-account filter และ response ordering
- `onboarding-service/pkg/kyc/kyc-service.go`: review-information bank-account context flags
- `onboarding-service/handler/customer-dto.go`: `review-information` response mapping ของ `name_changed`, `has_default_bank_account` และ `has_submitted_bank_account`
- `onboarding-service/pkg/customer/registrationcomplete/service.go`: `UpdateBankAccountsExpiry` เมื่อ registration completion พบ name change
- `web-portal/src/app/api/customer/[userId]/bank-account/route.ts`: investment-bank-account BFF
- `xspring-mobile-app/lib/models/onboard/review_customer_information.dart`: review-information response model
- `xspring-mobile-app/lib/domains/app_main_page/customer_status/controller.dart`: pending-application flags ที่ใช้เลือก bank step
- `xspring-mobile-app/lib/domains/ekyc/onboarding/personal_information_data_controller/personal_information_data_controller.dart`: local model, cloned request และ step/flow submit
- `xspring-mobile-app/lib/domains/ekyc/onboarding/work_information/work_information_controller.dart`: occupation/business-type payload reset และ local persistence
- `xspring-mobile-app/lib/widgets/occupation_business_type/occupation_business_type.dart`: dependent business-type lookup และ client auto-selection
- `xspring-mobile-app/lib/repository/onboard/business_type_service.dart`: business-type request ตาม occupation code
- `xspring-mobile-app/lib/domains/ekyc/bank_account/accept_back_account_name_change/`: bank name-change acceptance flow
- `xspring-mobile-app/lib/domains/ekyc/open_account/additional_account/review/widget/review_your_information_widget.dart`: normal bank display vs name-change warning
- `xspring-mobile-app/lib/domains/re_kyc/review_re_kyc/screen.dart`: re-KYC name-change warning condition
- `xspring-mobile-app/lib/widgets/bank_account/bank_account_name_change_warning_section.dart`: shared warning presentation
