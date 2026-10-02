---
title: Customer Bank Account Change and FundConnext Sync
description: Flow เปลี่ยนบัญชีธนาคาร SUB/RED ตั้งแต่รับคำขอ บันทึกค่าใน onboarding-service ส่งข้อมูลไป FundConnext และ sync read model ไป order-consumer
capability: Customer
services: [onboarding-service, order-consumer, xspring-mobile-app]
integrations: [FundConnext, Kafka]
aliases: [bank account change, bank account setting, bank-account-setting, default bank account, SUB bank account, RED bank account, investment bank account, customer account unitholder, SEG unitholder, UpdateUnitholderBankAccounts, SyncUnitholderBankAccount, UpdateInvestmentBankAccount, single-form-sync, manual FundConnext retry, เปลี่ยนบัญชีธนาคาร, ตั้งบัญชีธนาคาร, เปลี่ยนบัญชี subscription, เปลี่ยนบัญชี redemption, บัญชีธนาคารลงทุน, บัญชีผู้ถือหน่วย, sync บัญชี FundConnext, retry FundConnext]
errorCodes: ["400", "401", "500", "APPLICATION_NOT_ALLOWED"]
status: active
lastUpdated: 2026-10-02
documentType: flow
---

## Purpose and scope

อธิบายการเปลี่ยนบัญชีธนาคาร subscription (`SUB`) และ redemption (`RED`) ผ่าน `onboarding-service`, การ sync account/unitholder ไป `FundConnext` และการส่ง `UpdateInvestmentBankAccount` ให้ `order-consumer` อัปเดต read model

คำตอบ `200` จากการรับ bank-account-setting ยืนยันว่าระบบสร้างคำขอและเริ่ม asynchronous processing แล้ว; ยังไม่ยืนยันผลจาก `FundConnext` หรือ downstream event

## Trigger and preconditions

**Owner service: `onboarding-service`**

**Executing service: `xspring-mobile-app` สำหรับการส่งคำขอ; `onboarding-service` สำหรับ validation และ state**

- `xspring-mobile-app` เรียก `POST /api/v1/customer/bank-account-setting` พร้อม `BankChangeSettingRequest`; `onboarding-service` ตรวจ Portal claim และ `ValidateApplicationRequestAllowed` สำหรับ application type `bank-account-setting`
- เมื่อรับคำขอได้ Backend สร้าง application status `request`, action-flow และ `CustomerChangeRequestLog` ใน transaction แล้วเริ่ม `processBankChangeSettingAsync`; handler ตอบ `200` ก่อน asynchronous work จบ
- Service-to-service endpoint `POST /api/v1/customer/unitholders/bank-account` รับ `account_unitholder_list` และ optional `flow_type` (`onboarding` หรือ `update-bank-account`) สำหรับ sync unitholder โดยตรง

## Participating services

| Service/Integration | Role |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor; รับคำขอ, เปลี่ยนค่า default ในฐานข้อมูล, ส่ง account/unitholder ไป `FundConnext`, บันทึกผล, ทำ manual retry และ publish read-model event |
| `xspring-mobile-app` | Supporting trigger; ส่ง bank-account-setting request ไป Backend |
| `order-consumer` | Executor ของ `UpdateInvestmentBankAccount`; upsert investment-bank-account read model ใน transaction |
| `FundConnext` | External integration ที่รับ account update, amendment form และ unitholder bank accounts |
| `Kafka` | ส่ง `UpdateInvestmentBankAccount` จาก `onboarding-service` ไป `order-consumer` เมื่อมีข้อมูล read model เปลี่ยน |

## End-to-end sequence

### 1. Submit bank-account setting

**Owner service: `onboarding-service`**

**Executing service: `xspring-mobile-app` ส่ง request; `onboarding-service` ตรวจสิทธิ์และสร้างคำขอ**

Mobile เรียก `POST /api/v1/customer/bank-account-setting` ด้วย JSON body ที่ตรงกับ bank change request model. Backend ตรวจ application eligibility แล้วบันทึก application type `bank-account-setting` ในสถานะ `request`, action-flow และ before/after bank-account lists ใน `CustomerChangeRequestLog`. Handler เริ่ม goroutine สำหรับ processing และตอบ `200` ทันที

### 2. Persist local defaults before external calls

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`RequestBankChangeSetting` อ่าน before/after lists จาก change-request log แล้วบันทึก investment-bank-account links และ default bank-account values ใน database transaction ก่อนส่ง account update ไป `FundConnext`. จากนั้นตั้ง application เป็น `single-form-sync` พร้อม action `proceed`

### 3. Update FundConnext accounts and amendment form

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service` เรียก `FundConnext`**

สำหรับ account ที่อยู่ใน scope ระบบส่ง account/profile update ไป `FundConnext`; product ที่ `filterNotSendToFundConnextAccounts` ตัดออกจะไม่ถูกส่งในขั้นนี้. เมื่อ `Redemption.IsNewInvestmentBankAccount` เป็นจริง ระบบส่ง amendment form เพิ่มเติม

ผลของ account update และ amendment form ถูกเก็บแยกใน `CustomerChangeRequestLog.RequestTo` ผ่าน `is_upload_account`, `is_upload_amendment_form` และ error fields ที่ตรงกัน

### 4. Sync active SEG unitholders

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service` เรียก `FundConnext`**

เมื่อ account-update flags ของทุกรายการไม่ค้าง ระบบหา `customer_account_unitholder` ที่เกี่ยวข้องกับ customer accounts แล้วเลือกเฉพาะ active SEG records ที่ไม่อยู่ใน excluded unitholder list. สำหรับแต่ละ record ระบบอ่าน active customer account, investment bank accounts และ active customer bank accounts แล้วสร้าง request ที่มีข้อมูล SUB/RED, default flags, account code, AMC code และ `approved = true`

`onboarding-service` ส่ง `PUT /api/customer/unitholders` ไป `FundConnext`, บันทึก request/response log และ audit result ต่อ unitholder; failure เก็บ `is_upload_unitholder` และ `error_upload_unitholder`

### 5. Complete bank change and publish account data

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อ account-update gate ผ่านและ unitholder sync ไม่คืน error ระบบเปลี่ยน application เป็น `completed` ด้วย action `synced-fcn`, ส่ง customer capture เป็น `EndFlow` แล้วเปรียบเทียบข้อมูล investment bank account ปัจจุบันกับข้อมูลก่อนหน้า หากมีข้อมูลเปลี่ยนจะ publish Kafka event `UpdateInvestmentBankAccount` ไป `TopicCustomerToOrder`

### 6. Materialize the order-consumer read model

**Owner service: `onboarding-service` สำหรับ business flow และข้อมูล bank account**

**Executing service: `order-consumer`**

`order-consumer` dispatch `UpdateInvestmentBankAccount`, อ่าน customer accounts จาก message แล้ว upsert investment-bank-account rows ภายใน database transaction. ขั้นนี้อัปเดต read model ของ order domain; source นี้ไม่แสดง ledger หรือ balance movement

### 7. Retry failed FundConnext work

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เจ้าหน้าที่เรียก `PATCH /api/v1/customer/retry/fundconnext/application/{application_id}` เพื่อ manual retry. `ManualRetryFundConnextWithApplication` รองรับทั้ง `BankAccountChangeDefault` และ `SyncUnitholderBankAccount`; ถ้า account update หรือ amendment form ถูก mark pending ระบบส่ง account/amendment steps อีกครั้ง มิฉะนั้นจะส่ง unitholder update เมื่อมี `is_upload_unitholder` pending

Service endpoint `POST /api/v1/customer/unitholders/bank-account` เป็นอีกทางสำหรับ sync unitholder IDs ที่ส่งมาโดยตรง; `flow_type = update-bank-account` ใช้ retry logging path

## Business rules

- Local bank-account defaults และ investment-bank-account links ถูก persist ก่อน external FundConnext calls
- Account updates และ amendment forms ถูกบันทึกเป็นคนละ pending flag; amendment form ถูกส่งเมื่อเป็น new redemption investment-bank account
- Unitholder payload รวม active SUB/RED investment bank accounts ที่เชื่อมกับ active customer bank accounts และตั้ง `approved = true`
- Direct unitholder-sync endpoint เลือกเฉพาะ active SEG records ที่ผ่าน excluded-unitholder filter; ถ้าไม่พบ active records service คืน success โดยไม่มี sync request
- `UpdateInvestmentBankAccount` ใช้เมื่อ `CompareDataInvestmentBankAccount` พบข้อมูลเปลี่ยน; `order-consumer` เป็น executor ของ read-model upsert ไม่ใช่ business owner ของ bank-account change
- Bank-account setting ไม่มี ledger หรือ balance effect ที่ source นี้ยืนยัน

## State transitions

| Trigger | Application status | Action |
| :--- | :--- | :--- |
| รับ bank-account-setting request | `request` | customer `submitted` |
| asynchronous processing เริ่ม | `single-form-sync` | system `proceed` |
| account-update gate ผ่านและ unitholder sync สำเร็จ | `completed` | system `synced-fcn` |
| account update หรือ unitholder sync ยัง pending | คง `single-form-sync` | pending flags/error ถูกเก็บใน change-request log |

## Error and recovery behavior

- Eligibility ไม่อนุญาต: `BankAccountSetting` ตอบ HTTP 400 พร้อม `APPLICATION_NOT_ALLOWED`; claim ไม่ถูกชนิดตอบ HTTP 401 และ body ผิดรูปแบบตอบ HTTP 400
- `BankAccountSetting` ตอบ HTTP 200 ก่อน FundConnext work; asynchronous failure จึงไม่ถูกส่งกลับเป็น response ของ request แรก
- FundConnext account, amendment หรือ unitholder failure ถูกเก็บใน change-request log flags และ error fields; manual retry ใช้ endpoint ตาม application ID
- Direct `POST /api/v1/customer/unitholders/bank-account` ตอบ HTTP 500 เมื่อ service พบ unitholder failures; ไม่มี active SEG record ที่ตรงกับ request เป็น no-op success
- Kafka publish failure ใน `produceInvestmentBankAccount` ถูก log แต่ไม่คืน error จาก post-completion handler; source ไม่ยืนยัน automatic replay policy และ order-consumer read model อาจยังไม่รับ update
- **ต้องยืนยันกับเจ้าของระบบ:** `shouldSendAccountUpdateAndAmendmentForm` ถือ `is_upload_amendment_form` เป็น pending แต่ `isEveryAccountUpdatedAtFundConnext` ตรวจเฉพาะ `is_upload_account`. เมื่อ account update สำเร็จแต่ amendment form ค้าง ระบบยังอาจเดินต่อไป unitholder sync และ mark application completed

## Final outcomes

- Success path: local SUB/RED defaults ถูกบันทึก, `FundConnext` รับ account/unitholder data, application จบ `completed`, capture ถูกปิดด้วย `EndFlow` และเมื่อมีการเปลี่ยน read-model data จะมี `UpdateInvestmentBankAccount` ไป `order-consumer`
- `order-consumer` อัปเดต local investment-bank-account read model เมื่อ consume event สำเร็จ; event publish/consume failure ไม่ได้ยืนยันสถานะ read model จากคำตอบของ bank-account-setting API

## Related shared rules

- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/) — registration step ที่เกี่ยวกับ bank-account requirement
- [KYC Review Retake and DOPA Reverification](/business-flows/customer/kyc-review-retake/) — bank-account step ที่ต่อจาก name-change/re-KYC path

## Code references

`onboarding-service`:

- `handler/customer-handler.go`: `BankAccountSetting`, async processor, direct unitholder sync และ manual retry handlers
- `routes/routes.go`: bank-account-setting และ service-account unitholder-sync routes
- `pkg/customer/customer-bank-account/service.go`: application creation, local defaults, FundConnext calls, pending flags, completion และ Kafka event
- `internal/models/bank-account-model.go`: request types และ `is_upload_*` response state
- `internal/storages/postgres/customeraccountunitholderrepository/customer_account_unitholder_repository.go`: active SEG selection และ account-to-unitholder lookup
- `pkg/fundconnextsvc/account_service.go`: FundConnext unitholder bank-account request
- `pkg/fundconnextprocess/retry/retry-service.go`: manual retry dispatch และ request reconstruction
- `third_party/fundconnext/api/unitholder/types.go`: FundConnext request schema

`order-consumer`:

- `internal/constants/event-message-kafka.go`: `UpdateInvestmentBankAccount` event name
- `pkg/customer-account/service.go`: event dispatch, transactional investment-bank-account upsert

`xspring-mobile-app`:

- `lib/domains/profile/investment_account/service.dart`: `POST /api/v1/customer/bank-account-setting` client request
