---
title: KYC Expiry and Account Suspension
description: Background Flow คำนวณ KYC expiry จาก ID card, CDD และ suitability แล้วจัดการสถานะลูกค้า บัญชี และ re-KYC รวมถึง Freeze จาก auto-rejected KYC และการยกเลิกคำสั่ง downstream
capability: Customer
services: [onboarding-service, order-consumer, order-service, asset-consumer, web-portal]
aliases: [KYC expiry, re-KYC, auto-cancel re-KYC, cancelled-by-system, restore customer capture, suspended by system, Suspended by System, Freeze, freeze status, customer account freeze, account status freeze, cancel orders on suspension, cancel orders on freeze, closed account, CDD expiry, suitability expiry, KYC หมดอายุ, ระงับบัญชี, ระงับชั่วคราว, Freeze ลูกค้า, Freeze บัญชี, ยกเลิกคำสั่งเมื่อระงับบัญชี, บัญชีปิด, ทบทวน KYC, คืนข้อมูล capture]
integrations: [FundConnext, Kafka]
errorCodes: [SUP-001, SUP-004, SUP-005, SUP-006, SUP-007, "60002"]
status: active
lastUpdated: 2026-08-27
documentType: flow
---

## Purpose and scope

อธิบาย background Flow ที่ `onboarding-service` ใช้กำหนด `kyc_expiry_date` และ `re_kyc_type` สำหรับลูกค้าที่เข้าเงื่อนไข แล้วเปลี่ยน identification และ account ที่ยัง active เป็น `suspended` พร้อม reason code สร้าง `suspended-by-system` application และยกเลิก application บางประเภทที่ยังทำไม่เสร็จ รวมถึงผลของ KYC rejection ต่อ existing/migrated customer, การ auto-cancel re-KYC, การ sync `CustomerSync` และการยกเลิก order downstream

สำหรับ current develop, `Freeze` เป็น customer/account status ที่ source ยืนยันแล้วเฉพาะ KYC rejection ของ existing/migrated customer หรือ `re-kyc` ที่เข้า auto-reject case; KYC expiry background path ยังคงใช้ `suspended` ไม่ใช่ `freeze`

## Trigger and preconditions

**Owner service: `onboarding-service`**

- Background job ต้องได้ distributed lock ก่อนเริ่มรอบ
- Phase คำนวณอ่านลูกค้าที่ identification status เป็น active หรือ suspended
- Initial calculation ต้องมี customer profile และ account บริษัท XAM หรือ XD
- CDD candidate ใช้ latest CDD date/risk level
- Suitability candidate ใช้ evaluation date ของ Traditional สำหรับ XAM และ Digital สำหรับ XD
- Phase suspension ใช้ `ReKYCPeriod`, current expiry, application eligibility และ master reason description
- KYC approval rejection ของ existing/migrated customer หรือ `re-kyc` ต้องมี `RejectCase` เพื่อแยก auto-reject กับ manual reject; new onboarding ใช้ rejection path ของลูกค้าใหม่

## Participating services

| Service | Role |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor ของ expiry calculation, state update, KYC rejection status, application creation, suspension และ audit/batch result; publish `CustomerSync` จาก rejection path |
| `order-consumer` | Executing service ของ `CustomerSync` persistence และ trigger เรียก system cancellation เมื่อ account status ไม่ใช่ `active` |
| `order-service` | Business owner/executor ของ order status gate และ executor ของ cancellation ที่ `order-consumer` trigger |
| `asset-consumer` | Executing service ของ downstream customer/account sync และ ledger/portfolio processing ที่เกี่ยวข้อง; status sync จาก `CustomerSync` เป็น raw status storage |
| `web-portal` | Supporting client ที่ map identification status `freeze` เป็น label `Freeze`; ไม่ override backend status policy |

`order-consumer`, `order-service`, `asset-consumer` และ `web-portal` เป็น downstream/supporting participants; owner ของ customer status transition ยังคงเป็น `onboarding-service`

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
2. update customer accounts ที่มี status `active` เป็น `suspended` พร้อม reason code/description และเขียน `status_date` ของ account ในการ update เดียวกัน
3. update customer identification เป็น `suspended`
4. เปลี่ยน application เป็น `to-review`
5. auto-cancel unfinished application บางประเภทตาม target list

Reason mapping:

| `re_kyc_type` | Account reason |
| :--- | :--- |
| `force-expired` | `SUP-001` (`KYC_EXPIRED`) |
| `id-card-expired` | `SUP-004` (`ID_EXPIRED`) |
| `cdd-expired` | `SUP-005` (`CDD_EXPIRED`) |
| `suitability-expired` | `SUP-006` (`SUIT_TEST_EXPIRED`) |

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

### 8. Resolve a KYC rejection outcome

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

การ reject จาก KYC approval ใช้ application status `rejected` ก่อน แล้วแยกผลตามว่าเป็น customer ใหม่หรือมี customer เดิมอยู่แล้ว สำหรับ existing/migrated customer หรือ `re-kyc` ระบบใช้ `RejectCase` แยก auto-reject กับ manual reject:

| Flow | Application หลัง reject | Identification หลัง reject | Account หลัง reject | ผลข้างเคียงที่ source ยืนยัน |
| :--- | :--- | :--- | :--- | :--- |
| New onboarding ที่ไม่ใช่ migrated | `rejected` | `rejected` | ไม่สร้าง account จาก rejection path | upload capture และโดยทั่วไป publish `CustomerSync`; under-min-age เป็น early-return ที่ไม่ publish ข้อมูลลูกค้า |
| Migrated customer หรือ `re-kyc` ที่เป็น manual/non-auto reject | `rejected` | `active` | `customer_account` rows ของ identification ถูกเปลี่ยนเป็น `suspended` และกำหนด `SUP-007` (`KYC_REJECTED`) | ถ้ามี XAM account เรียก FundConnext ด้วย type `re-kyc-rejected`; จากนั้น publish `CustomerSync` |
| Migrated customer หรือ `re-kyc` ที่ `RejectCase` อยู่ใน auto-reject set | `rejected` | `freeze` | `customer_account` rows ของ identification ถูกเปลี่ยนเป็น `freeze` และกำหนด `SUP-007` (`KYC_REJECTED`) | ถ้ามี XAM account เรียก FundConnext ด้วย type `re-kyc-rejected`; จากนั้น publish `CustomerSync` |

Auto-reject set ที่ source ระบุรวม `AutoRejectByAMLO`, `AutoRejectByLED`, `AutoRejectByAMLOAndLED`, `AutoRejectByDisability`, `AutoRejectByMuleAccount`, `XDCustomerAccountReason`, `XAMCustomerMigratedHasSuspendedAccount` และ `IdentityVerificationAppmanUnderMinAge`; however under-min-age มี early return ใน post-rejection path จึงไม่ควรสรุปว่าจะ publish `CustomerSync` จาก path นี้

### 9. Propagate status to downstream services

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service` สำหรับการ publish; `order-consumer` และ `asset-consumer` เป็น event executors เมื่อได้รับ `CustomerSync`

`ProduceCustomerData` ของ rejection path publish `CustomerSync` แยกไปยัง order, asset, product และ sale ตาม implementation ของ `onboarding-service` แต่ `applySuspendedKycByIdentification` สำหรับ KYC expiry ไม่ได้เรียก `ProduceCustomerData` ใน source path ที่ตรวจพบ การเปลี่ยน status ใน onboarding database จึงยังไม่ใช่หลักฐานว่า read model ของ downstream ถูก sync แล้ว

เมื่อ `order-consumer` ได้รับ `CustomerSync` ที่มี account status ใด ๆ ที่ lower-case แล้วไม่ใช่ `active` จะ:

1. upsert identification, customer account และ investment account ใน transaction
2. เรียก `account-unitholder-sync` ของ `order-service`
3. เรียก `/api/v1/customer/suspend/cancel-orders` เมื่อพบ account ใดเป็น `suspended`, `closed`, `freeze` หรือค่าอื่นที่ไม่ใช่ `active`

`order-service` จะอ่านสถานะปัจจุบันของ MF และ Digital Asset account แล้วเลือก cancellation set ตาม operation: `suspended` ยกเลิก MF buy/switch, ICO, pending fiat deposit และ swap-limit BUY; `closed`/`freeze` เพิ่ม MF sell, fiat/crypto withdrawal และ swap-limit SELL การ cancel เป็นราย order ตาม predicate ไม่ใช่การเปลี่ยนสถานะทุก order แบบ blanket

`asset-consumer` รับและเก็บ status จาก `CustomerSync` ใน customer/account read model แต่ไม่พบ operation-level gate หรือ Freeze-specific cancellation ใน source ของ consumer นี้; backend order policy ยังอยู่ที่ `order-service`

### 10. Current status boundary: Suspended versus Freeze

ตารางนี้เป็น current source behavior ไม่ใช่ target implementation:

| Layer | Status ที่ source ยืนยัน | สิ่งที่ยังไม่ยืนยัน/ไม่พบ |
| :--- | :--- | :--- |
| Customer identification ใน `onboarding-service` | `onboarding`, `active`, `suspended`, `closed`, `inactive`, `freeze` | KYC expiry path ที่ตรวจยืนยันยังเปลี่ยนเป็น `suspended`; `freeze` มาจาก existing/migrated หรือ `re-kyc` auto-reject |
| Customer account | `active`, `suspended`, `closed`, `inactive`, `freeze` | ไม่พบหลักฐานว่า KYC expiry background path เปลี่ยน account เป็น `freeze` |
| Application | `rejected`, `suspended-by-system`, `to-review`, `completed` และ status อื่นตาม application flow | ไม่มี application status ชื่อ `Freeze` |
| AMLO result | `FREEZE-04`, `FREEZE-05`, `FREEZE-15` เป็น watchlist/risk code ที่ทำให้ผล AMLO ไม่ผ่าน | ชื่อ `FREEZE-*` ไม่ใช่ customer/account status |

สำหรับ order intake, `order-service` ยืนยันว่า suspended ยังอนุญาต MF sell และ digital-asset withdrawal/swap sell แต่ปฏิเสธ inbound operation และ closed/freeze; รายละเอียดรวมอยู่ที่ [Order State Machine](/shared-rules/order-state-machine/) ส่วน portfolio display, payment execution และผู้รับอีเมลภายในเฉพาะ Freeze ยังต้องยืนยันจาก source ที่อยู่นอก scope

### 11. Current cross-service and client impact

จุดที่ต้องใช้เป็น current cross-service boundary:

| Surface | Current behavior ที่ตรวจพบ | Owner/executor ที่เกี่ยวข้อง |
| :--- | :--- | :--- |
| `order-service` | อ่าน `suspended`, `closed`, `freeze` และใช้ operation-level gate; inbound MF buy/switch และ digital deposit/ICO/swap-buy ถูก block เมื่อ non-active ส่วน outbound exception ขึ้นกับ operation | `order-service` เป็น executor ของ order validation/cancellation |
| `order-consumer` | lower-case account status ที่ไม่ใช่ `active` trigger `/api/v1/customer/suspend/cancel-orders` หลัง `CustomerSync` และ log แล้วกลืน error จาก cancellation endpoint | `order-consumer` เป็น event/cancellation trigger executor |
| `asset-consumer` | upsert status จาก `CustomerSync` เป็น raw value; ไม่พบ business gate เพิ่มเติม | `asset-consumer` เป็น sync executor; asset portfolio effect ต้อง trace จาก ledger event แยก |
| `web-portal` | `EnumIdentificationStatus.FREEZE` map เป็น label `Freeze` และสี info; `InvestmentAccountStatus` ยังมีเพียง active/suspended/closed | `web-portal` เป็น supporting client/BFF; backend ยังเป็น owner |
| `trading-web` | current status enum/UI ที่ตรวจใน repository ยังเน้น active/suspended; ไม่พบการเปลี่ยน Freeze UI ใน commit range นี้ | `trading-web` เป็น supporting client และอาจล้าหลัง backend contract |
| `FundConnext` | existing-customer rejection ที่มี XAM account มี type `re-kyc-rejected`; KYC expiry `Suspended by System` path ที่ตรวจไม่พบการส่ง Freeze/Suspended callback | `onboarding-service` เรียก integration; downstream FCN behavior ต้องยืนยันกับเจ้าของ integration |
| Email/notification | rejection/re-KYC path ที่ตรวจพบส่ง customer notification/email และบาง onboarding rejection ส่ง AML email; ไม่พบ Freeze-specific recipients/template สำหรับ AML+CU และ RM/WS/ACM | `onboarding-service` เป็น executor ของ current email path |

### Unresolved implementation boundaries

- `order-consumer` จะ trigger cancellation สำหรับค่า status ใด ๆ ที่ไม่ใช่ `active` แต่ enum constants ที่ประกาศมีเพียง `active`, `suspended`, `closed`, `freeze`; behavior ของ unknown status ยังต้องยืนยันกับเจ้าของระบบ
- `order-service` customer lookup ใช้ `LIMIT 1` โดยไม่กำหนด precedence เมื่อมีหลาย account ของ product เดียวกันคนละ status
- `IsMutualFundNotAllowOrder` ทิ้ง lookup error สำหรับ order type ที่ไม่ใช่ `sell` และ status ว่างถูกประเมินเป็น not allowed สำหรับ buy/switch; เอกสารนี้จึงแยก intended status matrix ออกจาก defect/inconsistency นี้
- `ProcessFreezeCustomerStatus` มี implementation ใน `onboarding-service` แต่ไม่พบ production caller ใน tree ที่ตรวจ; freeze ที่ยืนยันในรอบนี้มาจาก rejection calculation path

## Business rules

- เมื่อ account ที่ยัง active ถูก suspend จาก re-KYC expiry path ระบบบันทึก `status_date` ของ account พร้อมการเปลี่ยน status เป็น `suspended`; path นี้ไม่ใช่ Freeze transition
- KYC expiry ใช้ candidate ที่เร็วที่สุด ไม่ใช่เลือกตามลำดับ ID/CDD/suitability
- CDD risk level 3 หมดอายุใน 1 ปี; risk level อื่นใน 2 ปี
- Suitability Traditional/Digital หมดอายุ 2 ปีหลัง evaluation date
- ลูกค้ามีทั้ง XAM และ XD ต้องมี evaluation date ของทั้งสองฝั่ง; ฝั่งใดหายทำให้ suitability candidate เป็นเมื่อวาน
- Missing CDD date/risk level ทำให้ CDD candidate เป็นเมื่อวาน
- Expiry record เดิมถูก guard ไม่ให้คำนวณวันใหม่ทั่วไป
- Reason description อ่านจาก master reason; code มาจาก re-KYC type mapping: `SUP-001` force-expired, `SUP-004` ID, `SUP-005` CDD และ `SUP-006` suitability
- KYC rejection ของ existing/migrated customer หรือ `re-kyc` ใช้ `SUP-007` (`KYC_REJECTED`); manual/non-auto reject ทำให้ identification เป็น `active` และ accounts เป็น `suspended`, ส่วน auto-reject case ทำให้ทั้งคู่เป็น `freeze`
- `order-service` ใช้ account status แยกตาม operation: MF sell และ digital-asset withdrawal/swap sell ยังผ่านเมื่อ `suspended`; MF buy/switch และ digital-asset deposit/ICO/swap buy ไม่ผ่าน และ `closed`/`freeze` ไม่ผ่านทุก operation ที่ helper นี้ตรวจ
- `order-consumer` เรียก system cancellation เมื่อ `CustomerSync` มี account status ที่ไม่ใช่ `active`; order-service cancel เฉพาะ pending order ที่เข้า predicate และเลือก side ตาม status
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
| Customer account | `active` → `suspended` พร้อม `SUP-001`/`004`/`005`/`006` และ `status_date` ของการเปลี่ยนสถานะ |
| Existing/migrated or re-KYC rejection | `rejected` application → identification `active` + account `suspended` เมื่อ manual/non-auto หรือ identification `freeze` + account `freeze` เมื่อ auto-reject; ใช้ `SUP-007` |
| Customer identification | current status → `suspended` ใน expiry path |
| Suspended application | created → `to-review` |
| Eligible unfinished application | current status → cancellation path ตาม application type |
| Existing re-KYC application | current status → `cancelled-by-system` เมื่อ auto-cancel condition เป็นจริง |
| Restored customer data | customer tables → snapshot จาก capture หลัง cancellation transaction commit |
| Downstream pending orders | `CustomerSync` non-active account → order-consumer trigger → selected order cancellation in `order-service` |

## Error and recovery behavior

- โหลด profile/background KYC ไม่ได้: phase calculation ล้มและบันทึก batch failure
- preload CDD/account/suitability ล้ม: customer ที่ต้อง initial-calculate ถูกข้ามพร้อม error detail
- upsert ราย customer ล้ม: record อื่นยังประมวลผลต่อและ error ถูกบันทึก/แจ้งเตือน
- phase suspension ประมวลผลแบบ worker pool และ recover panic ราย customer เพื่อไม่ให้ทั้ง batch หยุด
- database suspension transaction ล้ม: ไม่ commit state บางส่วน
- application handling หลัง transaction ล้ม: รายงาน error แต่ source ไม่มี compensating rollback/retry ที่ยืนยัน
- KYC expiry path ไม่พบการ publish `CustomerSync` หลัง update status; downstream cancellation ที่อาศัย event จึงเป็น unresolved propagation gap ไม่ควรสรุปว่า order ถูกยกเลิกแล้วจาก database update เพียงอย่างเดียว
- Rejection path ที่ publish `CustomerSync` ถ้า `order-consumer` เรียก cancellation endpoint แล้วได้ network/HTTP error จะ log error และไม่คืน error จาก `EventCustomerSync`; ต้องตรวจ order state แยก
- System cancellation เก็บ failure ต่อรายการและส่ง internal notification แบบ asynchronous; source ไม่ยืนยัน rollback ของรายการที่ cancel สำเร็จก่อนหน้า
- auto-cancel re-KYC ล้ม: ไม่เดินต่อไปสร้าง suspended-by-system application ให้ customer รายเดียวกันใน invocation นั้น และ source ไม่ยืนยัน retry อัตโนมัติของ auto-cancel
- job เขียน audit, batch log และ failure email; source ไม่ยืนยัน manual replay command

## Final outcomes

- ลูกค้ามี `kyc_expiry_date` และ `re_kyc_type` ที่อิง earliest verified expiry source
- ลูกค้าที่ถึง expiry suspension rule มี identification เป็น `suspended` และ account ที่เดิม `active` เป็น `suspended` พร้อม reason ที่ตรงกับ expiry type
- ระบบสร้าง suspended-by-system application ใน `to-review`
- unfinished applications ที่เข้า target ถูกยกเลิกตาม helper ของแต่ละ type
- re-KYC ที่ถูก auto-cancel จะคืนข้อมูลจาก capture, ปิด capture flow และคำนวณ expiry ใหม่หลัง restore
- Batch result ระบุจำนวน fetched, skipped, success และ error เพื่อใช้ติดตาม recovery
- ถ้าเป็น existing/migrated หรือ re-KYC rejection ที่เป็น manual/non-auto: identification เป็น `active`, accounts เป็น `suspended` และใช้ `SUP-007`
- ถ้าเป็น existing/migrated หรือ re-KYC rejection ที่เป็น auto-reject case: identification และ accounts เป็น `freeze`, ใช้ `SUP-007`, แล้ว rejection path publish `CustomerSync` เมื่อไม่เข้า early return
- ถ้า downstream ได้รับ `CustomerSync` ครบและ cancellation predicate ผ่าน ระบบยกเลิกเฉพาะ pending order ตาม status/side matrix; event propagation ไม่เกิดใน KYC expiry path ที่ตรวจพบ

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
- `pkg/customer/application/reject_application.go`: rejection branching, existing-customer suspension, `SUP-007`, notification และ `CustomerSync`
- `internal/constants/enum/xpg-customer-status.go`: customer identification status enum
- `internal/constants/enum/customer_account.go`: customer account status enum
- `pkg/customer/customer-process/process-delete.go`: scoped registration-history deletion และ restore entry point
- `pkg/customer/customer-process/customer-process-service.go`: capture restore mapping รวม account, suitability และ watchlist report
- `pkg/customer/application/service.go`: `OldCaptureId` ที่ผูกกับ application ใหม่
- `pkg/customer/re-kyc/helper.go`: suspension/cancellation eligibility
- `internal/constants/enum/rekyc_type.go`
- `internal/constants/enum/xd-customer-account-reason.go`
- `pkg/customer/customer-account/customer-account-repo/customer-account-repository.go`: account status/reason update และ `status_date`

Supporting current-contract references:

- `order-consumer/pkg/customer-account/service.go`: `CustomerSync` persistence และ conditional cancel-orders เมื่อพบ status ที่ไม่ใช่ `active`
- `order-service/pkg/order/service.go`: MF operation-level account-status validation และ order-placement pre-check
- `order-service/pkg/customer/suspend_service.go`: status-specific cancellation orchestration
- `order-service/handler/digital_asset_suspension.go`: Digital Asset operation-level status validation และ `60002`
- `order-service/internal/constants/enum/customer_enum.go`: MF account status and inbound/outbound allowance
- `order-service/internal/constants/enum/order_trade_enum.go`: Digital Asset operation types
- `asset-service/internal/constants/enum/customer_account_enum.go`: current asset account status enum
- `web-portal/src/types/enums.ts`: current customer/investment-account status mapping
- `web-portal/src/utils/convert-status.ts`: identification `freeze` → `Freeze`
- `web-portal/src/utils/get-customer-status.ts`: identification `freeze` display colors
- `web-portal/src/app/(order-flow)/order-placement/[fcnAccountId]/container.tsx`: current suspended order-placement gate
- `web-portal/src/app/features/white-glove/hooks/useOverviewInfo.ts`: current White Glove trading-action gate
- `trading-web/src/types/enums/status.ts`: current trading account status enum
- `trading-web/src/app/[locale]/(main)/trade/container.tsx`: current suspended trading access state
