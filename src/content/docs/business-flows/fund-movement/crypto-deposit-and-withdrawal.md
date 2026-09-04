---
title: Crypto Deposit and Withdrawal
description: End-to-end flow ของการฝากและถอนคริปโต รวม sender review, White Glove email confirmation, Fireblocks callback, ledger, retry และ refund
capability: Fund Movement
services: [order-service, order-consumer, asset-consumer, asset-service]
integrations: [Fireblocks, blockchain, Kafka, SendGrid, CoinMarketCap, Microsoft Teams]
aliases: [crypto deposit, crypto withdrawal, Fireblocks webhook, deposit sender information, deposit to-review, waiting-confirm, White Glove deposit disabled, digital knowledge deposit block, withdrawal email confirmation, withdrawal refund, withdrawal unlock, digital asset account freeze, digital asset suspended withdrawal, cancel crypto withdrawal on freeze, ฝากคริปโต, ยืนยันข้อมูลผู้ฝาก, รอตรวจสอบผู้ฝาก, ถอนคริปโต, ยืนยันถอนทางอีเมล, คืนยอดถอนคริปโต, ปลดล็อกยอดถอน, บัญชีคริปโตถูกระงับ, ถอนคริปโตเมื่อบัญชีถูก freeze]
errorCodes: [PENDING_ORDER_EXISTS, INVALID_ADDRESS, "60002"]
status: active
lastUpdated: 2026-09-04
documentType: flow
---

## Purpose and scope

เอกสารนี้ครอบคลุม flow ฝากและถอน digital asset ตั้งแต่ client หรือ Fireblocks trigger จน order, logical/physical ledger และ portfolio ถูกอัปเดต โดยแยก branch ที่มี business behavior ต่างกันชัดเจน:

- Deposit แบบ auto-complete กับแบบบังคับให้ยืนยัน sender information ผ่าน `FEATURE_TOGGLE_DEPOSIT_CRYPTO_SENDER_REVIEW`
- Withdrawal จาก XSpring App/Trading Web ที่ส่งต่อไป Fireblocks หลังสร้าง order กับ White Glove ที่ hold ยอดและรอ customer ยืนยันทางอีเมลก่อน

สำหรับ White Glove deposit, `web-portal` ใช้ `disableTradingAction.deposit` จาก trading customer-account context เพื่อ disable ปุ่ม Accept เมื่อ customer ถูกระงับ, ต้องทำ Digital Knowledge Test หรืออยู่ใน freeze; นี่เป็น client gate ที่สะท้อน Backend state ไม่ใช่การยืนยันว่า web เป็นผู้ตรวจ sender information หรือเปลี่ยน order/ledger state

## Trigger and preconditions

### Deposit

- `order-service` รับ Fireblocks webhook ที่ผ่าน signature verification และมี supported asset กับ customer wallet ที่ resolve จาก vault, destination address, asset และ tag/memo ได้
- `Confirming` จะสร้าง order เฉพาะ event `TRANSACTION_CREATED`; event แบบอื่นถูก skip เพื่อไม่สร้างซ้ำ
- Deposit ที่ต่ำกว่า minimum, `Depositable = false` หรือเป็น internal-wallet transaction จะไม่เข้า customer deposit flow ตาม guard ของ backend
- Minimum ใช้ config ระดับ product + network ก่อน แล้ว fallback เป็น product-only; ค่าที่ใช้ validate และแสดงผลถูก round down ตาม `decimal_digit` ของ product

### Withdrawal

- Client ต้องส่ง product, network, destination address/memo, gross amount และ sender/recipient classification เมื่อ feature ที่เกี่ยวข้องเปิดใช้งาน
- `order-service` ตรวจ Digital Asset account status ตาม operation ก่อนสร้างหรือยืนยัน order: `active` ทำได้ทุก operation, `suspended` ทำได้เฉพาะ withdrawal/`swap_sell`, ส่วน `closed` และ `freeze` ถูก block ใน operation ที่ใช้ validator นี้ด้วย `60002` (`ErrorCustomerSuspend`)
- White Glove ไม่อนุญาตให้สร้าง order ซ้อนของ product/customer เดียวกัน และตรวจว่า destination อยู่ใน address book; ใช้ `PENDING_ORDER_EXISTS` หรือ `INVALID_ADDRESS` เมื่อ validation เหล่านี้ไม่ผ่าน
- White Glove deposit confirmation UI เปิด/ปิด Accept ตาม `disableTradingAction.deposit`; backend `order-service` ยังเป็นผู้ตรวจ order status และ sender-information payload เมื่อรับ confirmation
- Config/read path สำหรับลูกค้า KYC level 1 หรือต่ำกว่าอาจแสดง withdrawal hold 24 ชั่วโมงนับจาก fiat deposit แรก แต่ business validation ตอน execute ยังคงอยู่ที่ backend/consumer

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| Fireblocks / blockchain | รับคำสั่ง transfer และส่งสถานะ on-chain ผ่าน webhook |
| `order-service` | Business owner ของ crypto order, synchronous validation, state/callback, sender or email confirmation, retry, settlement และ refund |
| `order-consumer` | Executor ของ asynchronous withdrawal: revalidate, hold/unlock, email-request orchestration และเรียก Fireblocks |
| `asset-consumer` | Executor ของ logical-ledger event และ apply การเปลี่ยนแปลงเข้า portfolio |
| `asset-service` | Owner ของ balance/portfolio read model หลัง ledger ถูก apply |
| XSpring App | Direct withdrawal trigger และ deposit sender-confirmation UI/API client |
| Web Portal / White Glove | RM withdrawal + email-confirmation UI และ deposit sender-confirmation UI/API client |
| Trading Web | Direct withdrawal trigger; backend มี deposit-confirmation contract สำหรับ channel นี้ |
| SendGrid | ส่ง White Glove withdrawal confirmation email และ completion email |
| CoinMarketCap | Best-effort price fallback เมื่อถอนสินทรัพย์ delisted และไม่มี mark-to-market |
| Microsoft Teams | Operational adaptive card สำหรับ withdrawal ที่ต้อง retry หรือถูก reject |

## End-to-end sequence

### Deposit: Fireblocks `CONFIRMING`

Business owner และ callback executor คือ `order-service`.

1. รับ webhook, resolve supported asset/customer wallet และผ่าน internal-wallet, delist และ minimum-deposit guards
2. สำหรับ `CONFIRMING` + `TRANSACTION_CREATED` สร้าง `order_deposit_crypto` และ action flow `created → confirming`
3. ใน confirming ledger batch ลด external `AVAILABLE` และเพิ่ม customer `PENDING_DEPOSIT` ด้วย `TransactionId` เดียวกัน
4. Publish logical-ledger event ให้ `asset-consumer`; ณ จุดนี้ยอดยังไม่ spendable

### Deposit: Fireblocks `COMPLETED`

1. ถ้า `FEATURE_TOGGLE_DEPOSIT_CRYPTO_SENDER_REVIEW` ปิด: `order-service` เดิน `confirming → sync-ledger → completed`, ลด `PENDING_DEPOSIT`, เพิ่ม `AVAILABLE`, สร้าง physical ledger แล้ว publish logical-ledger event
2. ถ้า feature toggle เปิด: backend เดินเพียง `confirming → to-review`, บันทึก `fireblocks_completed` audit และส่ง notification; ยังไม่ย้ายยอดจาก `PENDING_DEPOSIT` ไป `AVAILABLE`
3. `to-review` ถูก map เป็น customer status `waiting-confirm`; endpoint `GET /api/v1/order-crypto/deposit/pending` ตรวจว่าลูกค้ามี order ในสถานะนี้หรือไม่ และ XSpring App ใช้ผลนี้แสดง pending banner
4. XSpring App, Trading endpoint หรือ White Glove ส่ง `country_code` และ `customer_type_code` ผ่าน confirmation endpoint ของ channel:
   - `POST /api/v1/order-crypto/deposit/{order_id}/confirmation`
   - `POST /api/v1/trading/order-crypto/deposit/{order_request_id}/confirmation`
   - `POST /api/v1/white-glove/order-crypto/deposit/{order_deposit_id}/confirmation`
5. `order-service` normalize/validate code กับ SEC country/customer-type master, lock order row, ตรวจ ownership สำหรับ customer-facing endpoints และยอมรับเฉพาะสถานะ `to-review`
6. ใน database transaction เดียวกัน backend บันทึก `sender_info`, เดิน `to-review → sync-ledger → completed`, ลด `PENDING_DEPOSIT`, เพิ่ม `AVAILABLE`, สร้าง physical ledger และ audit `submit_sender_information`/allotment
7. หลัง commit จึง publish logical-ledger event, ส่ง completion email และ notification; `asset-consumer` เป็น executor ที่ apply portfolio
8. `COMPLETED` webhook ซ้ำหลัง order จบถูก skip; confirmation ซ้ำหรือ order ที่ไม่ใช่ `to-review` ตอบ `409`

### Withdrawal: create order และแยกตาม channel

Business owner คือ `order-service`; asynchronous executor คือ `order-consumer`.

1. XSpring App/Trading Web เรียก `POST /api/v1/order-crypto/withdraw/confirmation`; handler ตรวจ claims, request, maintenance, withdrawable/delist/shelf และ OTP ก่อนเรียก service
2. White Glove เรียก `POST /api/v1/white-glove/order-crypto/withdraw/create`; backend ตรวจ pending order, address book, maintenance และ product eligibility
3. `order-service` validate balance/daily limit/fee, resolve recipient information, คำนวณ `net_quantity = quantity - fee`, สร้าง order `created → order-request` แล้ว publish event ตาม sale channel

#### XSpring App / Trading Web

1. Event `create_withdraw_crypto` ทำให้ `order-consumer` revalidate balance, daily limit และข้อมูลอ้างอิง
2. ถ้า validation ล้มเหลวก่อน hold ให้เปลี่ยน `order-request → rejected` โดยไม่สร้าง unlock ledger
3. ถ้าผ่าน ให้สร้าง hold: customer `AVAILABLE / DECREASE` + `PENDING_WITHDRAWAL / INCREASE`, publish logical-ledger event แล้วเดิน `order-request → order-confirm → order-processing`
4. `order-consumer` เรียก Fireblocks จาก XD vault ไป one-time destination address ด้วย `net_quantity` และใช้ order request ID เป็น `externalTxId`

#### White Glove / RM

1. Event `create_withdraw_crypto_by_rm` ทำให้ `order-consumer` revalidate แล้ว hold `AVAILABLE → PENDING_WITHDRAWAL` ขณะที่ order ยังเป็น `order-request`
2. Consumer เรียก `order-service` ให้สร้าง confirmation token อายุถึง 24 ชั่วโมงหลัง order date และส่งอีเมลผ่าน SendGrid
3. ลูกค้ากดยืนยันจากอีเมล; `order-service` revalidate maintenance, delist, pending-out balance, product shelf/withdrawable และสถานะ `order-request` ก่อน publish `approve_withdraw_crypto_by_customer`
4. `order-consumer` revalidate maintenance, `order-request`, pending-out balance และ daily limit อีกครั้ง แล้วเดิน `order-confirm → order-processing` และเรียก Fireblocks
5. ถ้า validation หลัง hold ล้มเหลว ให้เปลี่ยนเป็น `rejected` และสร้าง refund/unlock ledger
6. RM หรือ system ยกเลิกได้เฉพาะ `order-request`; `AutoCancelExpiredWithdrawCryptoOrders` ยกเลิกรายการเกิน 24 ชั่วโมง จากนั้น cancel consumer ตรวจ `cancelled`/pending balance และคืน `PENDING_WITHDRAWAL → AVAILABLE`

### Withdrawal: account status change

**Owner service: `order-service` สำหรับ status policy และ withdrawal cancellation**

**Executing service: `order-consumer` เป็น `CustomerSync` trigger; `order-service` ทำ cancellation และ refund/unlock ของ withdrawal**

เมื่อ `order-consumer` ได้รับ `CustomerSync` ที่มี Digital Asset account status ไม่ใช่ `active` จะเรียก `POST /api/v1/customer/suspend/cancel-orders`:

- `suspended`: ระบบไม่เลือก pending crypto withdrawal เพื่อ system cancellation; withdrawal ที่ผ่าน operation gate ยังทำได้
- `closed` หรือ `freeze`: `order-service` โหลด pending crypto withdrawal และเรียก system cancellation; order ที่ถูก hold ต้องคืน `PENDING_WITHDRAWAL → AVAILABLE` ตาม cancellation path
- ความล้มเหลวของการเลือกหรือยกเลิกแต่ละรายการถูกรวบรวมเพื่อ internal notification และไม่ยืนยันว่า operation อื่นที่ยกเลิกสำเร็จแล้วจะ rollback

### Withdrawal: Fireblocks callback, retry และ settlement

1. `order-service` normalize `externalTxId`; retry transaction รูปแบบ `<order-request-id>.<timestamp>` ถูก map กลับไปยัง order เดิม
2. `COMPLETED` เดิน `order-processing → sync-ledger → completed` โดยไม่ผ่าน `order-verifying`
3. Settlement ลด customer `PENDING_WITHDRAWAL` ตาม gross quantity, เพิ่ม external `AVAILABLE` ตาม net quantity, บันทึก XD withdrawal fee และ network-fee logical/physical ledger แล้ว publish ให้ `asset-consumer`
4. สำหรับ delisted asset ที่ไม่มี mark-to-market จะลอง CoinMarketCap USD price + USD/THB FX แบบ best effort; ถ้ายังหา THB amount ไม่ได้ order ยัง completed แต่ skip XD producer
5. Callback `REJECTED`/`FAILED`/`BLOCKED`/`CANCELLED` ที่มี substatus `INSUFFICIENT_FUNDS`, `INSUFFICIENT_FUNDS_FOR_FEE` หรือ `TIMEOUT` เดิน `order-processing → order-verifying` และคงยอดไว้ใน `PENDING_WITHDRAWAL`
6. Operator retry ทำได้เฉพาะ `order-verifying`; backend เดินกลับ `order-processing`, ใช้ external ID ใหม่ที่ต่อ timestamp แล้วเรียก Fireblocks อีกครั้ง
7. Fireblocks creation error code `SOURCE_BALANCE_ERROR` ใช้ retry branch เดียวกัน; creation error อื่นหรือ callback failure ที่ไม่ retryable เปลี่ยนเป็น `rejected` และ refund `PENDING_WITHDRAWAL / DECREASE` + `AVAILABLE / INCREASE`

## Business rules

- Backend/consumer เป็น source of truth สำหรับ state, validation และ ledger; frontend ใช้ยืนยัน trigger, payload และ user-visible status เท่านั้น
- Fireblocks `COMPLETED` ไม่ได้แปลว่า deposit spendable เสมอ: เมื่อ sender-review toggle เปิด ต้องได้รับ sender confirmation ก่อน
- Deposit sender confirmation รับเฉพาะ master code จริง; blank, country `99`, customer type `00` หรือ code ที่ไม่พบถูก reject
- Customer/Trading confirmation ตรวจว่า order เป็นของ authenticated customer; White Glove ใช้ employee/service authorization และ service call ไม่บังคับ customer ownership parameter
- White Glove deposit Accept button เป็น client-side gate จาก `disableTradingAction.deposit`; การ disable เมื่อ suspended, Digital Knowledge required หรือ freeze ไม่แทน backend confirmation validation
- Direct withdrawal hold เกิดก่อนเรียก Fireblocks; White Glove hold เกิดก่อนส่ง confirmation email
- Digital Asset status gate เป็น operation-specific: `suspended` ยังอนุญาต withdrawal แต่ `closed`/`freeze` ไม่อนุญาต operation ที่ validator ตรวจ
- Pending crypto withdrawal ถูก system-cancel เมื่อ status เป็น `closed` หรือ `freeze`; status `suspended` ไม่เข้า branch นี้
- `order-verifying` เป็น exception/retry state ไม่ใช่ขั้นตอนปกติของ withdrawal success path
- Retryable Fireblocks failure ไม่ refund ทันที; final failure เท่านั้นที่ปลด `PENDING_WITHDRAWAL`
- Database transaction กับ Kafka publish ไม่ใช่ distributed transaction เดียวกัน จึงต้อง monitor/retry เมื่อ order/ledger rows commit แล้วแต่ event publish ล้มเหลว

## State transitions

**Owner service: `order-service`**

**Executing service for async withdrawal: `order-consumer`**

```text
Deposit — sender review disabled:
created → confirming → sync-ledger → completed

Deposit — sender review enabled:
created → confirming → to-review → sync-ledger → completed
confirming/to-review → rejected                 (Fireblocks final failure)

Withdrawal — normal success:
created → order-request → order-confirm → order-processing → sync-ledger → completed

Withdrawal — exception paths:
order-request → rejected                        (validation before hold)
order-request → cancelled                       (White Glove/customer/system cancel or >24h expiry)
order-request → cancelled                       (closed/freeze status change; refund/unlock if held)
order-processing → order-verifying              (retryable Fireblocks failure)
order-verifying → order-processing              (explicit retry)
order-processing → rejected                     (non-retryable failure + refund)
```

## Error and recovery behavior

- Invalid webhook signature, missing order mapping หรือ malformed `externalTxId` หยุด callback และต้องไม่สร้าง ledger จากข้อมูลที่ resolve ไม่ได้
- Deposit ต่ำกว่า minimum, internal-wallet หรือ delisted/deposit-disabled path ถูก skip; external wallet ที่ resolve ไม่ได้อาจสร้าง rejected deposit ตาม backend path
- Deposit confirmation ใช้ `400` สำหรับ payload/master code ไม่ถูกต้อง, `403` สำหรับ customer ownership mismatch, `404` เมื่อไม่พบ order และ `409` สำหรับ duplicate/stale status
- Digital Asset status ที่ไม่อนุญาตใช้ HTTP `400`, code `60002` (`ErrorCustomerSuspend`); handler ฝั่ง Digital Asset ใช้ข้อความ `customer is <status>.`
- XSpring App refresh detail หลัง sender confirmation; เมื่อได้ `409` จะแสดง duplicate-request recovery แล้ว refresh สถานะ
- White Glove withdrawal ที่ยัง `order-request` สามารถ resend confirmation email ภายใต้ cooldown, cancel หรือถูก auto-cancel เมื่อหมดอายุ
- Withdrawal validation หลัง White Glove hold, cancellation และ final Fireblocks failure ต้องมี unlock ledger; portfolio จะเปลี่ยนเมื่อ `asset-consumer` consume event สำเร็จ
- เมื่อบัญชีเป็น `closed`/`freeze`, pending crypto withdrawal ที่ถูกเลือกโดย status-cancellation ต้องจบด้วย cancellation และ unlock/refund path; หาก selection หรือ cancellation ล้มเหลว order อาจค้างและต้องติดตามจาก internal notification
- หาก completion ledger ถูกสร้างแล้วแต่ Kafka publish ล้มเหลว ห้ามสรุปว่า portfolio สำเร็จจาก order status เพียงอย่างเดียว

## Final outcomes

- Deposit `to-review`: chain สำเร็จแล้ว แต่ยอดยังอยู่ `PENDING_DEPOSIT` และ UI แสดง `waiting-confirm`
- Deposit completed: sender review ไม่ถูกบังคับหรือยืนยัน sender แล้ว; `PENDING_DEPOSIT` ถูกย้ายเป็น `AVAILABLE`
- Withdrawal `email pending`: White Glove hold ยอดแล้วและกำลังรอลูกค้ายืนยันอีเมล
- Withdrawal completed: on-chain transfer สำเร็จ, settlement/fee ledger ถูกสร้าง และ order เป็น `completed`
- Withdrawal rejected/cancelled หลัง hold: order เป็น terminal state และมี unlock `PENDING_WITHDRAWAL → AVAILABLE`
- Withdrawal retryable: order เป็น `order-verifying` และยอดยังถูก hold จนกว่า retry หรือ final failure
- `closed`/`freeze` crypto withdrawal: pending order ถูก system-cancel และคืนยอดที่ hold ตามผลการ cancellation

## Related shared rules and flows

- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Security Rules](/shared-rules/security/)

## Code references

- `order-service/pkg/crypto/service.go` — deposit webhook/toggle, withdrawal callback, settlement, retry/refund และ cancellation
- `order-service/pkg/customer/suspend_service.go` — status-specific cancellation ของ pending crypto withdrawal เมื่อ `closed` หรือ `freeze`
- `order-service/pkg/crypto/service_confirm_deposit.go` — sender validation และ `to-review → sync-ledger → completed`
- `order-service/handler/order_crypto.go` — customer deposit confirmation, pending check และ direct withdrawal endpoint
- `order-service/handler/white_glove_withdraw_crypto_handler.go` — White Glove create/email/cancel flow
- `order-service/internal/constants/enum/order_crypto_enum.go` — internal/customer statuses และ Fireblocks retry substatuses
- `order-consumer/pkg/digital-asset-order-request/service.go` — event routing แยก direct กับ RM/customer approval
- `order-consumer/pkg/digital-asset-order-request/withdraw.go` — hold, revalidation, Fireblocks execution, cancel และ refund
- `order-consumer/pkg/customer-account/service.go` — รับ `CustomerSync` และ trigger `/api/v1/customer/suspend/cancel-orders` เมื่อ account status ไม่ใช่ `active`
- `asset-consumer/pkg/customer-logical-entry/service.go` — apply logical-ledger event เข้า portfolio
- `xspring-mobile-app/lib/domains/digital_portal/order_history/order_detail/controller.dart` — mobile sender confirmation และ `409` recovery
- `web-portal/src/app/features/white-glove/components/deposit/crypto/order-detail/index.tsx` — White Glove sender-confirmation UI
- `web-portal/src/app/features/white-glove/hooks/useOrderCustomerAccount.ts` — deposit/withdraw/swap action-disable mapping จาก trading customer-account context
- `web-portal/src/app/features/white-glove/services/withdraw-crypto.ts` — White Glove withdrawal create/email/cancel client
- Tables: `order_deposit_crypto`, `order_withdraw_crypto`, `order_action_flow`, `ledger_transactions`, `product_digital_asset_extension`
