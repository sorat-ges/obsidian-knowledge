---
title: Onboarding Status and Suitability
description: Flow อ่านความคืบหน้า onboarding, คำนวณ suitability แยก Traditional/Digital, รวมข้อมูล vulnerable-investor detail และยืนยันผลเพื่อเดิน registration ต่อ
capability: Customer
services: [onboarding-service, web-portal, xspring-mobile-app]
aliases: [onboarding status, suitability v2, suitability answers, V1 suitability, legacy suitability, V1 suitability version, suitability version ID, KYC suitability result, traditional suitability, digital suitability, vulnerable investor, vulnerable detail, NoInvestmentKnowledge, VulnerableFlag, watchlist refresh, background watchlist refresh, customer background risk, DOPA watchlist, onboarding change request log, has default bank account, bank name change, bank grace period, accept bank grace period, bank account step, เริ่ม onboarding, change-request log, สถานะเปิดบัญชี, แบบประเมินความเสี่ยง, ความเสี่ยง Traditional/Digital, ผู้ลงทุนเปราะบาง, ไม่มีความรู้การลงทุน, suitability test, รีเฟรช watchlist, รีเฟรช watchlist หลังแก้ background, บันทึกเริ่มเปิดบัญชี, เปลี่ยนชื่อบัญชีธนาคาร, ยอมรับระยะผ่อนผันบัญชีธนาคาร]
errorCodes: ["400", "401", "404", "500"]
status: active
lastUpdated: 2026-09-05
documentType: flow
---

## Purpose and scope

อธิบาย behavior ที่ `onboarding-service` ใช้รายงานความคืบหน้า onboarding และ API v2 สำหรับรับคำตอบ suitability, คำนวณคะแนน Traditional/Digital, บันทึกผลตามบริษัทที่กำลังเปิดบัญชี, refresh watchlist และยืนยันผลเพื่อขยับ registration status รวมถึง bank-account requirement เมื่อไม่มี default account หรือชื่อบัญชีธนาคารเปลี่ยน และ read path ของ KYC approval ที่รองรับข้อมูล suitability รุ่นเก่าและรุ่นใหม่

Source รอบนี้ยืนยัน behavior จาก Backend เป็นหลัก; `web-portal` และ `xspring-mobile-app` เป็น supporting client สำหรับ bank-account read, grace-period acceptance และ user-visible warning โดยไม่ override state หรือ validation ของ Backend

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
| `xspring-mobile-app` | Supporting client; อ่าน bank-account requirement, แสดงบัญชีที่ mask แล้ว และส่งคำขอรับทราบ bank grace period |
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

### Bank-account requirement and bank-name-change grace period

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service` สำหรับ state และ transaction; `xspring-mobile-app` สำหรับ client flow**

Onboarding/re-KYC status ใช้กฎ bank step เดียวกัน: `bank-account` ต้องทำเมื่อไม่มี default bank account หรือเมื่อมี default bank account แต่ `name_changed = true`; เมื่อมี default account และชื่อไม่เปลี่ยนจึงข้าม step ได้

เมื่อเข้า bank step mobile เรียก `GET /api/v1/customer/bank-accounts` เพื่ออ่าน active bank accounts ที่ mask แล้ว และสำหรับกรณีชื่อบัญชีเปลี่ยนจะเปิดหน้ารับทราบ grace period แล้วเรียก `POST /api/v1/customer/accept-bank-grace-period` พร้อม `{ "flow_type": ... }` หลังผู้ใช้กดยืนยัน

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

### 3. Update background information and refresh watchlist

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อ `UpdateCustomerWithPersonalInformation` บันทึก step `background` สำเร็จ handler จะตอบ `200` (`success update data personal`) แล้วเปิด asynchronous `processWatchlistCheck` ต่อ โดยไม่รอให้ watchlist คำนวณเสร็จ:

1. เลือก application type `new` หรือ `re-kyc` ตาม flow
2. เรียก `UpsertWatchlistReport` ด้วย `isSaveWatchList = true` และ selector ว่างเพื่อประมวลผลกลุ่มที่ allowed ตาม registration status/flags
3. คำนวณและ upsert personal, background-risk และ vulnerable-investor report ตาม registration status กับ stored watchlist flags

เส้นทาง background update นี้ไม่เรียก `CheckAndSaveCustomerWatchlist` ซ้ำอีกต่อไป จึงไม่ทำ legacy parallel save ควบคู่กับ `UpsertWatchlistReport`; endpoint `save-watchlist` ของ KYC และ offline onboarding ที่ยังเรียก legacy service เป็นคนละ trigger

การบันทึก `background` จะอ่าน `customer_background.vulnerable_detail` เดิมก่อน แล้ว merge กับข้อมูลจาก request: `YearsOld60` คำนวณใหม่จากวันเกิดเมื่อมีค่า, `Disability` ใช้ `IsInvestmentDecision` ของ request และ `NoInvestmentKnowledge` ที่มีอยู่เดิมจะไม่ถูกล้างเพียงเพราะบันทึก background ซ้ำ จากนั้นระบบ marshal detail ที่รวมแล้วและคำนวณ `VulnerableFlag` จาก detail ชุดเดียวกัน

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
4. refresh watchlist report; failure ถูก log แต่ไม่หยุด Flow
   - สำหรับ flow ที่ไม่ใช่ retake ระบบใช้ stored DOPA result เป็น filter เฉพาะเมื่อ `DopaFlag = "Passed"`; ค่า `Error`, `nil` หรือ status อื่นจะไม่ถูก filter และจะปล่อยให้ watchlist calculation ใช้ allowed types ของ registration status
   - เมื่อ `flowType.IsRetake()` เป็นจริง ระบบไม่ใช้ stored watchlist flags เป็น filter ใน path นี้
5. ขยับ registration จาก `suitability-test` ไป step ถัดไปและสร้าง history
6. ถ้าเป็น retake ที่ suitability เป็น step สุดท้ายก่อน completed draft ให้เดิน application completion logic ต่อ

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

## Business rules

- Backend claim เป็นแหล่ง `identification_id`; request ไม่เลือก customer เอง
- Step completion ต้องมี required sub-status ครบ ไม่ใช่ดูเฉพาะ current status
- เมื่อเจ้าหน้าที่ request retake ระบบสร้าง completed history สำหรับ personal/address/work/background/suitability/bank ของ flow ที่เลือก แล้วตั้ง current step กลับไป `identity-verification/front-card-scan`
- Application type `re-kyc` ใช้ `retake-re-kyc` ตอนเริ่ม retake; application type อื่นใช้ `retake`
- Default bank account ที่ไม่มีชื่อเปลี่ยนทำให้ status response ไม่แสดง bank-account step; ถ้าชื่อบัญชีเปลี่ยน (`name_changed`) bank-account step ยัง required แม้มี default account
- Bank grace-period acceptance เป็น transaction ของ `onboarding-service` ที่บันทึก acceptance และสร้าง bank-account history ก่อนเดิน registration ต่อ; mobile เป็นเพียง client trigger
- `GET /api/v1/customer/bank-accounts` คืน active masked bank accounts สำหรับ bank step; `POST /api/v1/customer/accept-bank-grace-period` รับ `flow_type` เพื่อยืนยันการรับทราบ
- `VulnerableDetail` เป็น composite ของ `YearsOld60`, `NoInvestmentKnowledge` และ `Disability`; `VulnerableFlag` เป็น `true` เมื่อ field ที่มีค่าใด ๆ เป็น `true`, เป็น `false` เมื่อ field ที่มีค่าเป็น `false` ทั้งหมด และเป็น `nil` เฉพาะเมื่อทั้งสาม field ไม่มีค่า
- Background update merge `VulnerableDetail` เดิมก่อนเขียน โดย refresh เฉพาะ age/disability จาก request และคง `NoInvestmentKnowledge` ที่มีอยู่เดิมไว้
- Suitability confirm เขียน `NoInvestmentKnowledge` แล้วใช้ composite detail เดิมคำนวณ `VulnerableFlag` ใหม่; partial JSON ที่ขาดบาง field ไม่ทำให้การคำนวณ dereference nil
- `bank_expiry_date` ที่ web แสดงเป็น read-model/warning contract; source รอบนี้ยังไม่ยืนยัน 90-day calculation หรือ bank-removal executor
- Customer signup ใหม่ต้องสร้าง change-request log พร้อม `has_default_bank_account = false` ก่อน transaction สร้าง customer จะ commit
- Multiple-answer suitability ใช้ helper เลือกคะแนนสูงสุดแบบ unique ก่อนรวมคะแนน
- Digital score อาจต่างจาก Traditional score เพราะ digital-experience adjustment
- Persistence เลือก Traditional ก่อนเมื่อ `IsXAMOpen`; Digital ใช้เมื่อ XAM ไม่เปิดและ `IsXDOpen` เป็นจริง
- v2 confirm ใช้ current CDD score และไม่เรียก CDD score recalculation ใน production path นี้
- Watchlist refresh เป็น best effort; registration ยังเดินต่อเมื่อ call นี้ล้มเหลว
- หลังบันทึก personal-information step `background`, current customer path ใช้ `UpsertWatchlistReport` เพียงครั้งเดียวใน asynchronous handler; ไม่เรียก legacy `CheckAndSaveCustomerWatchlist` ซ้ำใน trigger เดียวกัน
- ใน legacy `CheckAndSaveCustomerWatchlist` path ระบบ pre-create `customer_background_risk` ของ `customer` และ `spouse` ก่อน parallel checks และใช้ `personalType` ที่ร้องขอเมื่อสร้าง PEP/AMLO record เพื่อป้องกัน duplicate record จาก concurrent insert
- ใน non-retake watchlist refresh, stored DOPA report ที่มีสถานะ `Passed` เท่านั้นที่ทำให้ DOPA check ถูกข้าม; report ที่ `Error`, ไม่มี flag หรือไม่ใช่ `Passed` จะไม่ถูกใช้เป็น filter และจะคำนวณตาม allowed watchlist types ของ registration status
- Registration status ใน migrated/offline/open-initial-account paths update record เดิมเมื่อพบ `identification_id` ภายใน transaction แทนการเพิ่มแถวซ้ำ
- KYC approval ใช้ v2 suitability ก่อน และ fallback ไป V1 เฉพาะเมื่อข้อมูล v2 ของฝั่งที่ต้องแสดงไม่มีอยู่/เป็น record-not-found และ V1 มี `SuitabilityVersionID` ที่ใช้ได้
- ในการ map answer จาก v2 หากมี Traditional answers จะเลือกชุดนั้นก่อน Digital answers; หากทั้งสองชุดว่างจะคืน answer ว่างโดยไม่แต่งข้อมูลเพิ่ม

## State transitions

**Owner service: `onboarding-service`**

| Trigger | State effect |
| :--- | :--- |
| Submit suitability | create/update Traditional หรือ Digital suitability record; ยังไม่ขยับ registration |
| Confirm suitability | `suitability-test` → next registration sub-status พร้อม history |
| Update personal background | ไม่เปลี่ยน application/registration state จาก trigger นี้; เริ่ม asynchronous watchlist report refresh |
| Retake และ suitability เป็น final draft step | เพิ่ม `completed-draft` แล้วเข้า completion logic |
| Read onboarding status | ไม่แก้ state; derive `draft`/`completed` จาก history |
| Bank step required เพราะไม่มี default account หรือชื่อบัญชีเปลี่ยน | status คง/เดินไป `bank-account` ตาม required-step rule |
| Accept bank grace period | บันทึก acceptance → `bank-account` history/next status; `completed-draft` อาจเข้า completion logic |
| Start new onboarding | สร้าง `customer_change_request_log` พร้อม `has_default_bank_account = false` ภายใน customer-creation transaction |
| KYC approval reads suitability/answers | ไม่แก้ state; ใช้ v2 หรือ fallback V1 เพื่อสร้าง read model |

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
- Background personal-information update ตอบสำเร็จหลัง primary write; ถ้า asynchronous `UpsertWatchlistReport` ล้มเหลวระบบ log error ภายหลัง และ source ยังไม่ยืนยัน retry policy หรือการ rollback primary write
- `handleBackgroundStep` ไม่ propagate error จากการอ่าน existing background หรือการ unmarshal `VulnerableDetail`; ถ้าอ่าน/parse เดิมล้มเหลว source ปัจจุบันยังเดินต่อด้วย detail ที่อ่านได้และพยายาม upsert จึงไม่ควรสรุปว่า field เดิมจะถูก preserve ในกรณี dependency/JSON error
- watchlist refresh error ถูก log แล้วดำเนิน registration ต่อ; retry policy ไม่ได้ยืนยันใน source
- KYC approval suitability dependency error ถูกแปลงเป็นผล `incomplete` ใน `getSuitability`; error ตอนอ่าน answer ทำให้ response ไม่มี answer ที่ map ได้ ส่วน legacy risk-result path จะคืน error เมื่อทั้ง legacy และ fallback v2 อ่านไม่ได้

## Final outcomes

- Caller เห็น `flow_type`, optional onboarding expiry และสถานะของ step ที่คำนวณจาก history
- Suitability score/risk level ถูกบันทึกในตาราง Traditional หรือ Digital ตาม account-opening intent
- หลัง confirm, customer background vulnerability ถูกอัปเดตและ registration เดินพ้น suitability step
- หลัง update background, ระบบจะพยายาม persist `watchlist_report` ของ personal/background-risk/vulnerable-investor แบบ asynchronous; HTTP 200 ของ primary update ไม่ได้ยืนยันว่า report refresh เสร็จแล้ว
- หลัง update background หรือ confirm suitability, `customer_background.VulnerableFlag` สะท้อน composite vulnerable detail ที่ current backend คำนวณได้
- Flow อาจจบที่ completed draft/completion สำหรับ retake ที่ suitability เป็น step สุดท้าย
- ลูกค้าที่มี default bank account แต่ชื่อบัญชีเปลี่ยนต้องผ่าน bank-account/grace-period step ก่อน registration จะเดินต่อ; ลูกค้าที่ไม่มี name change ยังข้าม step ได้เมื่อมี default account
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
- `handler/customer-handler.go`: `GetCustomerOnboardingStatus`, `UpdateCustomerWithPersonalInformation` และ `processWatchlistCheck`
- `pkg/customer/customer-resigtration-status/customer-resigtration-status-svc/customer-resigtration-status-service.go`: `GetCustomerOnboardingStatusStep`
- `internal/constants/enum/xpg-customer-registartion-status.go`: required sub-status mapping
- `handler/suitability-handler.go`: v2 submit/confirm handlers
- `pkg/suitability/suitability-service.go`: score, persistence และ confirmation behavior
- `pkg/kyc/watchlist.go`: stored DOPA flag filtering และ watchlist refresh orchestration
- `pkg/kyc/helper.go`: `filterPassedWatchlistTypes`
- `pkg/kyc/kyc-service.go`: legacy watchlist save และ pre-create ของ customer/spouse background risk
- `internal/models/customer-background-db-model.go`: unmarshal และ composite calculation ของ `VulnerableDetail`
- `utils/age.go`: การคำนวณ `YearsOld60` จากอายุปัจจุบัน
- `pkg/customer/customer-process/customer-process-service.go`: merge vulnerable detail ระหว่าง background update
- `pkg/suitability/suitability-service.go`: update `NoInvestmentKnowledge` และ `VulnerableFlag` ตอน confirm suitability
- `internal/domain/customer_suitability.go`: Traditional/Digital persistence models
- `onboarding-service/pkg/customer/customer-suitability/service.go`: v1 fallback, latest evaluation selection และ question/answer mapping
- `onboarding-service/pkg/customer/kyc_approver/service.go`: company-specific suitability read model และ risk fallback
- `onboarding-service/pkg/kyc/kyc-service.go`: legacy answer/risk-result fallback ไปยัง v2 suitability
- `onboarding-service/pkg/customer/customer-process/customer-process-service.go`: registration status write path ที่เรียก `UpsertTx`
- `onboarding-service/pkg/customer/customer-process/customer-process-service.go`: `createIdentificationTx` และ `createCustomerChangeRequestLog` สำหรับ initial onboarding context
- `onboarding-service/pkg/customer/customer-bank-account/service.go`: bank-account list, `AcepptGracePeriod` และ investment-bank-account read
- `onboarding-service/pkg/customer/registrationcomplete/service.go`: `UpdateBankAccountsExpiry` เมื่อ registration completion พบ name change
- `web-portal/src/app/api/customer/[userId]/bank-account/route.ts`: investment-bank-account BFF
- `xspring-mobile-app/lib/domains/ekyc/bank_account/accept_back_account_name_change/`: bank name-change acceptance flow
