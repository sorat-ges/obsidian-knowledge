---
title: WLL130 Withdraw Fiat Daily Limit Removal Implementation Plan
tags: [implementation, active, withdraw-fiat]
status: active
last-updated: 2026-08-04
---

# WLL130 Withdraw Fiat Daily Limit Removal

## Goal

ปรับ Policy การถอนเงินบาทตาม WLL130 ให้ลูกค้าถอนได้ถึงขีดจำกัดของจำนวนตัวเลขที่ช่องกรอกและ validation อื่นที่ยังมีผล โดยไม่คำนวณหรือ reject จาก `Daily Limit` สำหรับ Fiat Withdrawal

พร้อมซ่อน UI ที่แสดง Daily Limit ในทุก channel ตาม Miro:

- XSpring Mobile
- White Glove ใน `web-portal`
- Trading Web

การเปลี่ยนแปลงนี้ใช้กับ `withdraw_fiat` เท่านั้น Daily Limit ของ Crypto Withdrawal ต้องคง behavior เดิม

## Current confirmed behavior

จาก `order-consumer` ปัจจุบัน Fiat Withdrawal ตรวจ Daily Limit ในอย่างน้อยสองจุด:

1. Direct create path: `processCreateWithdrawFiatOrder` เรียก `validateFiatWithdrawPreConditions`
2. Customer approval path: `processApproveWithdrawFiatOrderByCustomer` เรียก `validateApproveWithdrawFiatPreConditions`

ทั้งสอง path เรียก `IsExceedDailyLimitValidation` ซึ่งรวมยอดจาก:

- Completed Fiat Withdrawal ของวันนั้น
- Pending order ภายในช่วงเวลาที่ repository กำหนด
- XD withdrawal ที่อยู่ในสถานะ waiting
- XD withdrawal ที่อยู่ในสถานะ processing/confirm
- `KycLevelPaymentLimit.Amount` ของ transaction type `WithdrawFiat`

จุดอ้างอิง:

- `order-consumer/pkg/digital-asset-order-request/withdraw.go`
- `order-consumer/pkg/digital-asset-order-request/withdraw_test.go`

## Target behavior

### Backend

- Fiat create validation ไม่เรียก `IsExceedDailyLimitValidation`
- Fiat customer approval validation ไม่เรียก `IsExceedDailyLimitValidation`
- ไม่อ่าน `KycLevelPaymentLimit` เพื่อ reject Fiat Withdrawal จาก Daily Limit
- ไม่ aggregate ยอด withdrawal เดิมเพื่อคำนวณ remaining Daily Limit ใน Fiat path
- คง validation อื่นที่ไม่เกี่ยวกับ Daily Limit เช่น:
  - available balance / pending-out balance
  - bank account และ ownership
  - minimum amount หากยังเป็น policy ที่ใช้งานอยู่
  - fee และ bank transfer calculation
  - identity, permission, OTP/2FA และสถานะ order
- ไม่เปลี่ยน Daily Limit validation ของ Crypto Withdrawal
- ต้องตรวจ `order-service` เพิ่มว่ามี synchronous Daily Limit validation ก่อนสร้าง order หรือใน customer confirmation path หรือไม่ และนำออกให้ครบทุก Fiat path

### Frontend

ซ่อนองค์ประกอบที่เกี่ยวข้องกับ Daily Limit ในทั้งสาม channel:

- `Remaining Daily Limit`
- Daily Limit tooltip / modal / explanatory text
- THB limit ที่แสดงใน Withdrawal Level หรือ withdrawal summary
- ข้อความที่สื่อว่าลูกค้าถอนได้ไม่เกิน Daily Limit

ยังคงแสดงและตรวจสิ่งที่จำเป็นต่อการถอน:

- จำนวนเงินที่กรอกและ maximum digit ของช่อง input
- available balance
- fee และ net receive
- bank account, OTP/2FA และเงื่อนไขเวลา/maintenance ที่ยังเป็น policy

คำว่า “ซ่อน UI Withdraw FIAT” ใน Miro ต้องยืนยันกับ Product อีกครั้งว่า หมายถึงซ่อนเฉพาะ Daily Limit section ภายใน Fiat Withdrawal หรือซ่อน entry/form ของ Fiat Withdrawal ทั้งหมด หากเป็นอย่างหลังจะขัดกับ AC ที่ระบุว่าลูกค้ายังถอนเงินบาทได้ถึง maximum digit

## Implementation plan

### 1. Remove Fiat Daily Limit validation in `order-consumer`

File:

- `pkg/digital-asset-order-request/withdraw.go`

Update:

- `validateFiatWithdrawPreConditions`
  - ลบการเรียก `IsExceedDailyLimitValidation`
  - ลบ branch ที่ reject ด้วย `REASON_REJECTED_BY_EXCEED_DAILY_LIMIT`
  - ให้ flow ไปตรวจ THB product และ available balance ต่อ
- `validateApproveWithdrawFiatPreConditions`
  - ลบการเรียก `IsExceedDailyLimitValidation`
  - ลบ branch ที่ reject ผ่าน Payment Gateway path ด้วย Daily Limit
  - คงการตรวจ product และ pending-out balance

ห้ามลบ `IsExceedDailyLimitValidation`, reason constant หรือ shared output โดยอัตโนมัติจนกว่าจะยืนยันว่าไม่มี Crypto path หรือ compatibility path ใช้งานอยู่

### 2. Remove remaining Fiat checks in `order-service`

Repository:

- `order-service`

ค้นหาและตรวจทุก path ที่เกี่ยวกับ:

- `withdraw_fiat`
- `Daily Limit`
- `GetByKycLevel`
- `KycLevelPaymentLimit`
- `REASON_REJECTED_BY_EXCEED_DAILY_LIMIT`

นำออกเฉพาะ validation ที่ทำให้ Fiat Withdrawal reject จาก Daily Limit โดยคง validation ของ Crypto Withdrawal และ business rules อื่นไว้

ต้องตรวจอย่างน้อย:

- direct/customer create request
- White Glove Fiat Withdrawal
- customer confirmation / approval
- employee approval ถ้ามีการ validate Daily Limit ซ้ำ

### 3. Update Mobile UI

Repository:

- `xspring-mobile-app`

ค้นหา component, selector, translation และ API mapping ของ:

- `Remaining Daily Limit`
- `Daily Limit`
- `Withdrawal Level` ที่แสดง THB limit
- Fiat Withdrawal summary ที่แสดง limit

ซ่อนเฉพาะ UI ที่อยู่ใน scope WLL130 และคง maximum digit, balance, fee, bank account และ confirmation flow

### 4. Update White Glove UI

Repository:

- `web-portal`

ตรวจ White Glove Fiat Withdrawal ทั้ง form, preview, summary, tooltip และ Withdrawal Level modal ให้ไม่แสดง Daily Limit

ตรวจด้วยว่า frontend ไม่ได้ใช้ Daily Limit เป็นเงื่อนไข disable ปุ่มหรือจำกัดจำนวนเงินแทน backend validation

### 5. Update Trading Web UI

Repository:

- `trading-web`

ซ่อน Daily Limit ที่อยู่ใน Fiat Withdrawal form, summary, tooltip หรือ limit modal ตาม Miro และคง validation ที่เกี่ยวกับ input digit, balance, fee และ bank transfer

### 6. Generate and read HTML สำหรับตรวจ Web UI

ใช้ HTML/DOM artifact ที่ generate จากหน้าจอ Fiat Withdrawal ของ Web channel เพื่อให้ตรวจได้ว่า UI ที่แก้แล้วไม่ render Daily Limit จริง โดยครอบคลุมอย่างน้อย:

- White Glove ใน `web-portal`
- Trading Web ใน `trading-web`
- สถานะก่อนกรอกจำนวนเงิน, หลังกรอกจำนวนเงิน และหน้า preview/summary หากมีการ render แยกกัน

Verification ต้องอ่าน generated HTML/DOM แล้วตรวจว่าไม่มี:

- `Remaining Daily Limit`
- `Daily Limit` tooltip, modal หรือ explanatory text
- THB limit ใน Withdrawal Level หรือ withdrawal summary ที่อยู่ใน scope WLL130

และตรวจว่ายังมีองค์ประกอบที่จำเป็น เช่น input จำนวนเงิน, maximum digit constraint, balance, fee, net receive, bank account และ confirmation action ตาม flow จริง

ข้อจำกัดของวิธีนี้:

- HTML/DOM เป็นหลักฐานสำหรับ user-visible Web UI เท่านั้น ไม่ใช้ยืนยัน backend validation, state machine หรือ ledger behavior
- Mobile ไม่ใช่ HTML channel จึงต้องตรวจด้วย native UI test/snapshot หรือ source-level test ของ `xspring-mobile-app`
- Generated HTML, `dist/`, screenshot และ debug artifact ต้องเก็บใน temporary/test output ที่ไม่เข้า published tree และไม่ stage เป็นเอกสาร

### 7. Database/config decision

ไม่ทำ Database patch เพื่อเพิ่ม `kyc_payment_limit.amount` เป็นวิธีแก้หลัก เพราะ Fiat Withdrawal จะไม่คำนวณหรือ validate Daily Limit แล้ว

ข้อมูล `kyc_payment_limit` เดิมอาจคงไว้เพื่อ:

- Crypto Withdrawal
- backward compatibility
- รายงานหรือหน้าจออื่นที่ยังต้องใช้จนกว่าจะมี cleanup decision

ห้ามลบข้อมูล limit โดยไม่ยืนยันผลกระทบต่อ Crypto และ KYC flow

### 8. Update Business Flow documentation after implementation

หลัง source implementation เสร็จและยืนยัน behavior แล้ว ค่อยอัปเดต:

- `src/content/docs/business-flows/fund-movement/fiat-withdrawal.md`

ต้องปรับให้ระบุว่า:

- Fiat Withdrawal ไม่ reject จาก Daily Limit แล้ว
- `order-consumer` เป็น executor ของ async validation/hold/payment flow ตาม code จริง
- Crypto Withdrawal ยังมี Daily Limit แยกต่างหาก
- UI Daily Limit ถูกซ่อนตาม channel ที่ implement จริง

Implementation Plan นี้ไม่ควรถูกนำเข้า `src/content/docs/` หรือ navigation ของ published site

## Tests and verification

### Backend tests

- Fiat create ผ่านได้แม้ยอดสะสมเดิมทำให้ Daily Limit เดิมเกิน
- Fiat customer approval ผ่านได้แม้ยอดสะสมเดิมทำให้ Daily Limit เดิมเกิน
- Fiat ที่ balance ไม่พอยัง reject ตามเดิม
- Fiat fee, bank account, OTP/2FA และ order state validation ยังทำงานตามเดิม
- ไม่มีการเรียก KYC payment limit repository ใน Fiat validation path
- Crypto Daily Limit tests ยังผ่านและ behavior ไม่เปลี่ยน
- Payment Gateway ยังถูกเรียกเมื่อผ่าน validation อื่นครบ

### Frontend tests

- ไม่ render `Remaining Daily Limit`
- ไม่ render Daily Limit tooltip/modal หรือ THB limit ที่อยู่ใน scope
- Fiat Withdrawal ยังรับจำนวนถึง maximum digit ที่กำหนด
- จำนวนเกิน maximum digit ยังถูกปฏิเสธด้วย input validation
- Balance, fee, bank account และ confirmation behavior ยังทำงาน
- ตรวจครบ Mobile, White Glove และ Trading Web

### Documentation verification

หลังอัปเดต Business Flow เท่านั้น ให้รันจาก Gus Knowledge:

1. `npm run docs:check`
2. `npm run docs:build`
3. `npm test`
4. `node tools/content-parity.mjs`
5. `git diff --check`

Implementation Plan นี้เป็น internal working document จึงไม่ควรเข้า generated site, search index หรือ published navigation

## Blockers and open decisions

- ต้องยืนยัน exact maximum digit/value ของ Fiat input จาก backend contract และ frontend validation
- ต้องยืนยันความหมายของ “ซ่อน UI Withdraw FIAT” ว่าซ่อน Daily Limit section หรือซ่อน Fiat Withdrawal entry ทั้งหมด
- ต้องตรวจ `order-service` เมื่อ worktree สะอาดเพื่อยืนยันจุด validation ให้ครบ
- `payment-gateway` backend ไม่อยู่ใน authoritative repository list; WLL130 ไม่ควรเปลี่ยน payment behavior โดยไม่มี source เพิ่มเติม
- ต้องยืนยันว่าจะคงข้อมูล `kyc_payment_limit` ไว้สำหรับ Crypto และ reporting หรือมี cleanup task แยก
