---
title: Mutual Fund Switching
description: Flow สับเปลี่ยนกองทุนรวมตั้งแต่เลือกคู่กองทุน ตรวจ holiday และ cutoff จนถึงส่ง FundConnext และยกเลิกคำสั่ง
capability: Trading
services: [order-service, order-consumer, xspring-mobile-app]
aliases: [mutual fund switching, MF switching, switch order, switching order, Switch MF, holiday calendar, trade calendar refresh, customer account freeze switch, suspended mobile sell, mobile account freeze switch, cancel switch by system, สับเปลี่ยนกองทุน, สับเปลี่ยนกองทุนรวม, เปลี่ยนกองทุน, ปฏิทินวันหยุดกองทุน, ยกเลิกสับเปลี่ยนเมื่อระงับบัญชี]
integrations: [FundConnext]
errorCodes: ["500", "60002", "60005", "60007"]
status: active
lastUpdated: 2026-09-05
documentType: flow
---

## Purpose and scope

อธิบาย Mutual Fund Switching ของ `order-service` ตั้งแต่ค้นหาคู่กองทุน, ตรวจ account status และเงื่อนไขก่อนสร้างคำสั่ง, สร้าง `order-request`, ส่งคำสั่งไป `FundConnext`, การรอ allotment, การยกเลิกโดย customer และ system cancellation เมื่อ account ไม่ใช่ `active`

Backend เป็น source of truth ของ validation, state และการเรียก `FundConnext` ใน Flow นี้ ส่วน `xspring-mobile-app` เป็น supporting client ที่มี pre-action guard สำหรับ account status และแสดง contact-operation warning; guard นี้ไม่แทน backend validation

## Trigger and preconditions

**Owner service: `order-service`**

- ผู้ใช้ที่ authenticate แล้วเลือก source fund และ target fund ที่มี switching pair
- Request ต้องมี `from_product_id`, `to_product_id`, `account_code`, `effective_date`, `amount`, `currency`, `unit_type` และ `accept_acknowledge`
- `effective_date` ห้ามเป็นอดีต
- target fund ต้องผ่าน investor-class check ของ customer และ source/target ต้องผ่าน sale-channel verification
- customer account ต้องเป็น `active`; `suspended`, `closed` และ `freeze` ถูกปฏิเสธที่ handler ด้วย `ErrorCustomerSuspend` (`60002`) และข้อความ `customer account is suspended`
- source product ต้องไม่มี `TaxType`; target product ห้ามเป็น `LTF`
- amount/unit ต้องผ่าน source portfolio, target portfolio และ mark-to-market validation

### Mobile account-status guard

**Owner service: `order-service`**

**Executing client: `xspring-mobile-app` สำหรับ pre-action guard เท่านั้น**

Mobile ตรวจ account status ก่อนเปิด/เตรียม buy, switch และ sell form โดย `freeze` block ทั้งสาม action ส่วน `suspended` block buy และ switch แต่ปล่อย sell ผ่าน client gate แล้วแสดง `PleaseContactOperationWidget` เมื่อถูก block `FundPortalController` ใช้กฎเดียวกันก่อนนำทางจาก mutual-fund portal และแสดง contact bottom sheet ก่อนตรวจ maintenance การ guard นี้เป็น UX/read-state behavior; backend ยังคงบังคับ account status `active` สำหรับการสร้าง switch order

ใน order initialization ปัจจุบัน `OrderViewModel` ยัง refresh customer status แต่ไม่แสดง `accountUnavailable`/contact-RM modal เพียงเพราะ `sub_status` เป็น `under-min-age` หรือ `rejected`; การเปลี่ยนนี้เป็น client gate behavior และไม่ override account-status guard ของ portal/form หรือ validation ของ backend

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| `order-service` | รับ endpoint, ตรวจ pair/product/account-status/holiday/cutoff/amount, สร้าง order, บันทึก action flow, เรียก `FundConnext`, customer cancellation และ system cancellation |
| `order-consumer` | Executing service ของ `CustomerSync` trigger ที่เรียก `order-service` เมื่อ account status ไม่ใช่ `active`; ไม่ได้เป็น owner ของ switch policy |
| `FundConnext` | รับ switch request และ cancel request สำหรับ transaction ที่มี `ResponseTransactionID` |

`order-consumer` ไม่ได้ execute การ switch หรือ allotment แต่เป็น executor ของ status-event/cancellation trigger เท่านั้น

## End-to-end sequence

### 1. Load switching candidates and cutoff data

**Owner service: `order-service`**
**Executing service: `order-service`**

`GET /api/v1/products/{product_id}/switching-in-products` ให้รายการ target products ที่ค้นได้ตาม customer, pagination และ search โดย `order-service` คำนวณ switching cutoff ที่แสดงร่วมกับ product data

Backend มี `GET /api/v2/holidays/{order_type}/{fund_code}` ซึ่งคืน holiday list พร้อม `is_holiday`, `current_date` และ `effective_date`; current `xspring-mobile-app` ยืนยันการเรียก endpoint นี้ใน `OrderViewModel` สำหรับ buy/switch และใน `FundOrderSellController` สำหรับ sell โดยใช้ `switch-out` เป็น order type ตอนเตรียม switch

Mobile ไม่มี holiday cache key แล้ว: ทุกครั้งที่ `getHoliday` ถูกเรียก—including การกลับเข้า tab/order flow เดิม—จะขอข้อมูลจาก server ใหม่ แล้วแทนค่า holidays, `current_date`, `effective_date` และ `is_holiday` ใน memory ถ้าได้ `errorNoTradeDateConfig` จะแสดง trade-calendar warning; ถ้า `is_holiday = true` จะแสดง fund-holiday bottom sheet; ถ้า request ล้มเหลวจะล้าง holiday list/current date และตั้ง `is_holiday = false` การ refresh นี้เป็น supporting UX และไม่แทน validation ตอน create order ของ `order-service`

### 2. Run placement precheck

**Owner service: `order-service`**
**Executing service: `order-service`**

`POST /api/v1/order/switching/create` เรียก `VerifyPlaceOrderSwitching` ก่อนสร้าง order โดยตรวจ:

1. switching pair ต้องมีอยู่
2. source และ target sale channel ต้องอนุญาตตาม effective date
3. source switch-out holiday และ cutoff
4. ถ้า effective date เป็นวันนี้และ `SwitchSettlementDay == 0` ให้เลือก cutoff ที่เร็วกว่าใน source sell กับ target buy

ถ้า precheck ไม่ผ่าน handler คืน HTTP `403` พร้อมข้อความ `Error place order switching is not valid`; source ไม่ยืนยันว่า frontend แสดงข้อความนี้อย่างไร

### 3. Revalidate business rules before persistence

**Owner service: `order-service`**
**Executing service: `order-service`**

`OrderSwitch` เรียก `ValidateOrder` ซ้ำก่อนสร้างข้อมูล โดยลำดับที่ source ยืนยันคือ:

1. ตรวจ account suspension เมื่อมี `account_code`
2. ตรวจ target product และ target investor class
3. ตรวจ switching pair
4. ปฏิเสธ past effective date
5. ถ้า effective date เป็นวันนี้ ตรวจ source switch-out holiday และ cutoff; ถ้า settlement day เป็นศูนย์จะเปรียบเทียบ source sell cutoff กับ target buy cutoff
6. ตรวจ tax restriction ของ source/target
7. ตรวจจำนวนเงินหรือจำนวน unit กับ portfolio และ mark-to-market ของทั้งสองฝั่ง

ถ้า source fund เป็น holiday ในวันเดียวกัน ระบบคืน `ErrorValidateOrder` (`60005`) พร้อม `switch order cannot use holiday date`

### 4. Create the switching order request

**Owner service: `order-service`**
**Executing service: `order-service`**

ใน database transaction ระบบโหลด product/product extension, portfolio และ mark-to-market ของ source/target, แปลง amount ตาม `unit_type` (`Amount`, `Unit` หรือ `AllUnit`), หา unitholder และ running order ID แล้วสร้าง switching order เป็น `order-request` พร้อม action `submitted`

ระบบบันทึก accepted terms ใน audit log ด้วย application `XSPRING_APP` และ sequence `SwitchMFOrderSequence` ก่อนเรียก approval path

### 5. Submit to FundConnext and update state

**Owner service: `order-service`**
**Executing service: `order-service`**
**Integration executor: `FundConnext`**

`orderSwitchApprove` ทำงาน synchronous ดังนี้:

1. เปลี่ยน `order-request` เป็น `order-confirm` และ action `confirmed`
2. สร้าง `fundconnext.SwitchOrderRequest` จาก investment account, source/target fund code, effective date, unitholder, amount/unit, redemption type และ accepted risk overrides
3. เรียก `FundConnext.SwitchOrder`
4. ถ้า response ไม่มี `ErrorCode` ให้เปลี่ยน `order-confirm` เป็น `waiting-allot` และ action `approved`
5. ถ้า external response มี `ErrorCode` ให้เปลี่ยน `order-confirm` เป็น `failed` และ action `rejected`; response data ถูกเก็บใน order API request log

ระบบส่ง notification สำหรับ `waiting-allot` และ `failed` ตาม status ที่ได้จาก FundConnext

### 6. Read allotment and final state

**Owner service: `order-service`**
**Executing service: ยังยืนยันไม่ได้จาก repositories ที่อยู่ใน scope**

State mapping ของ switch อนุญาต `waiting-allot → completed` และ backend มี endpoint สำหรับอ่าน switch allotment transaction/detail ของ source และ target fund แต่ current repositories ที่ตรวจไม่ยืนยันว่า callback, worker หรือ ledger/portfolio update ใดเป็น executor ของการเปลี่ยนเป็น `completed`

### 7. Cancel a customer switching order

**Owner service: `order-service`**
**Executing service: `order-service` และ `FundConnext` เมื่อมี transaction ID**

`POST /api/v1/order/switching/cancel` อนุญาต customer cancellation เมื่อ:

- channel ไม่ใช่ `WEARE_WEB`
- ยังไม่พ้น product cutoff
- ยังไม่มี switch-out allotment
- status เป็น `waiting-allot` และมี `ResponseTransactionID`

เมื่อผ่าน predicate ระบบเรียก `FundConnext.CancelOrder` แล้วเปลี่ยน order เป็น `cancelled`, บันทึก action `cancelled`, ลบ fail-order request ถ้ามี และส่ง cancellation notification

### 8. Cancel a pending switch after account status change

**Owner service: `order-service` สำหรับ cancellation policy; `onboarding-service` เป็น owner ของ customer status event**

**Executing service: `order-consumer` เป็น `CustomerSync` trigger และ `order-service` เป็น cancellation executor**

เมื่อ `order-consumer` ได้รับ `CustomerSync` ที่มี MF account status `suspended`, `closed` หรือ `freeze` จะเรียก `/api/v1/customer/suspend/cancel-orders` หลังจาก sync account/unitholder แล้ว `order-service` ค้นหา pending switch orders และตรวจ switch-specific cancellation predicate รวมถึงว่ามี switch-out allotment แล้วหรือไม่

ถ้า cancel ได้ ระบบใช้ reason `CancelledBySystem`, เปลี่ยน order เป็น `cancelled`, บันทึก order-cancellation/audit และส่ง notification; `suspended`, `closed` และ `freeze` ใช้กฎเดียวกันสำหรับ switch และ source ไม่ยืนยัน rollback ของรายการอื่นเมื่อบางรายการล้มเหลว

## Business rules

- Final create validation ตรวจ source switch-out holiday แต่ code path นี้ไม่ได้ตรวจ target switch-in holiday ก่อนเลือก target buy cutoff
- เมื่อ `SwitchSettlementDay == 0` ระบบใช้ cutoff ที่เร็วกว่า source sell และ target buy; เมื่อ settlement day ไม่ใช่ศูนย์ใช้ source switch-out cutoff
- Effective date ในอนาคตไม่เข้า `ValidateSwitchCutOffTime` ของ final `ValidateSwitchOrder`; precheck sale-channel path ยังรับ effective date ไปตรวจตาม implementation ของ sale channel/holiday service
- Source ที่มี tax type สลับออกไม่ได้ และ target `LTF` สลับเข้าไม่ได้
- `AllUnit` ใช้จำนวน unit ที่เหลือของ source portfolio และตั้ง `SellAllUnitFlag` เป็น `true` ใน request ไป `FundConnext`
- Customer cancellation ไม่ได้ใช้ generic buy/sell cancellation predicate; switch มี predicate ของตัวเองที่ต้องเป็น `waiting-allot`, มี transaction และยังไม่พ้น cutoff
- MF switch เป็น inbound operation: account status `suspended`, `closed` และ `freeze` ไม่อนุญาตให้สร้างคำสั่ง
- Mobile guard ของ `xspring-mobile-app` สอดคล้องกับ operation direction: freeze block buy/switch/sell และ suspended block buy/switch แต่ไม่ block sell ที่ client; backend เป็นผู้ตัดสินสุดท้าย
- Mobile เรียก holiday API ใหม่ทุกครั้งที่ tab/order flow เรียก `getHoliday`; การย้ายออกจากหน้าคำสั่งซื้อจึงเป็นจุดที่ reset bank-account cache ส่วน holiday state ไม่ถูกใช้แทน backend validation
- Account status event ที่ downstream ได้รับทำให้ `order-service` พยายามยกเลิก pending switch order สำหรับทั้ง `suspended`, `closed` และ `freeze` ตาม predicate ของ switch

### Unresolved cutoff inconsistency

| Code path | Behavior ที่ source ยืนยัน | สถานะ |
| :--- | :--- | :--- |
| `VerifyPlaceOrderSwitching` และ `resolveSwitchCutOffSourceOrder` | ตรวจ target switch-in holiday; ถ้า target holiday ให้ใช้ source sell cutoff | ต้องยืนยัน intended behavior |
| `ValidateSwitchCutOffTime` ใน final `ValidateOrder` | ตรวจ source switch-out holiday; ถ้า settlement day เป็นศูนย์อาจเลือก target buy cutoff โดยไม่ตรวจ target holiday ใน function นี้ | ต้องยืนยัน intended behavior |

จนกว่าเจ้าของระบบจะยืนยัน ไม่ควรสรุปว่า target holiday จะ reject หรือ fallback แบบใดใน published integration contract

## State transitions

**Owner service: `order-service`**

| Current status | Action / condition | Next status |
| :--- | :--- | :--- |
| `created` | create switch request | `order-request` |
| `order-request` | approve path starts | `order-confirm` |
| `order-confirm` | FundConnext response ไม่มี `ErrorCode` | `waiting-allot` |
| `order-confirm` | FundConnext response มี `ErrorCode` | `failed` |
| `waiting-allot` | allotment transition ตาม enum mapping | `completed` |
| `waiting-allot` | customer cancellation ผ่าน predicate และ FundConnext cancel สำเร็จ | `cancelled` |
| `waiting-allot` | system cancellation หลัง `CustomerSync` non-active และ switch predicate ผ่าน | `cancelled` |

`order-consumer` หรือ executor ของ allotment transition ยังไม่ถูกยืนยัน จึงไม่ระบุ ledger effect หรือผู้รับผิดชอบการเปลี่ยน `waiting-allot → completed`

## Error and recovery behavior

**Owner service: `order-service`**

- `60002` (`ErrorCustomerSuspend`): customer/account ไม่ใช่ `active` (`suspended`, `closed` หรือ `freeze`); ไม่สร้าง switch order
- `60005` (`ErrorValidateOrder`): target/pair/date/holiday/tax หรือ validation อื่นไม่ผ่าน
- HTTP `403`: placement precheck ไม่ผ่าน โดย handler ใช้ข้อความ `Error place order switching is not valid`
- `60007` (`ErrorValidateCancelWaitAllot`): customer cancellation ไม่ผ่าน switch cancellation predicate
- `500` (`ErrorInternal`): product, holiday, portfolio, external integration หรือ transaction error ที่ source map เป็น internal error
- Mobile holiday request ที่ได้ `errorNoTradeDateConfig` จะแสดง `TradeCalendarBottomSheet`; network/parse error ล้าง client calendar state และไม่เปลี่ยน backend order state
- ถ้า FundConnext ตอบ error code ระบบเก็บ response และเปลี่ยน order เป็น `failed`; source ไม่ยืนยัน retry อัตโนมัติของ switch placement

## Final outcomes

- `waiting-allot`: FundConnext รับคำสั่งโดยไม่มี `ErrorCode`; ยังไม่ใช่ completed
- `completed`: เป็น terminal success state ที่ enum mapping อนุญาตหลัง allotment แต่ executor และ ledger/portfolio effect ยังไม่ยืนยัน
- `failed`: FundConnext ตอบ error code หรือ call ล้มเหลวใน approval path
- `cancelled`: customer ยกเลิกได้ตาม switch-specific predicate และระบบบันทึก cancellation

## Related shared rules

- [Trading](/business-flows/trading/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`order-service`:

- `routes/route.go`: switching product, create และ cancel endpoints
- `handler/product_handler.go`: `GetProductsSwitching`
- `handler/order_handler.go`: `CreateSwitchingOrder`, `CancelSwitchingOrder`
- `pkg/order/service.go`: `ValidateSwitchOrder`, `ValidateSwitchCutOffTime`, `VerifyPlaceOrderSwitching`, `OrderSwitch`, `CancelSwitchOrderByCustomer`
- `pkg/order/order_helpers.go`: switching request creation, FundConnext approval/cancel และ cutoff helpers
- `pkg/product/service.go`: switching product list และ displayed cutoff calculation
- `internal/constants/enum/order_enum.go`: switching success/cancel state mappings
- `order-service/pkg/customer/suspend_service.go`: system cancellation ของ pending switch หลัง non-active account status

`order-consumer`:

- `order-consumer/pkg/customer-account/service.go`: `CustomerSync` และการเรียก system cancellation trigger

`xspring-mobile-app` supporting reference:

- `lib/utils/data_source.dart`: `verifyCustomerAccountDisAllowOrder`
- `lib/domains/fund_portal/controller.dart`: selected-account guard ก่อนเปิด buy/sell/switch
- `lib/view/order/widgets/buy_form_widget.dart`, `lib/view/order/widgets/switch_form_widget.dart`, `lib/domains/fund_order/sell/sell_order_form.dart`: blocked-form rendering
- `lib/view/order/order_view_model.dart`: mobile holiday fetch, buy/switch tab preparation และ lifecycle cache reset
- `lib/domains/fund_order/sell/controller.dart`: sell holiday fetch และ bank-account cache reset
- `lib/view/order_history/list_page/order_history_list_view_model.dart`: order-history access no longer short-circuits solely on `under-min-age`/`rejected` sub-status; incomplete registration checks remain
- `lib/repository/order/order_repository.dart`: `GET /api/v2/holidays/{order_type}/{fund_code}` client contract
