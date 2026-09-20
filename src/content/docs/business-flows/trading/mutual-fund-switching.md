---
title: Mutual Fund Switching
description: Flow สับเปลี่ยนกองทุนรวมตั้งแต่เลือกคู่กองทุน ตรวจวันมีผลและ cutoff จนถึงส่ง FundConnext และยกเลิกคำสั่ง
capability: Trading
services: [order-service, order-consumer, xspring-mobile-app]
aliases: [mutual fund switching, MF switching, switch order, switching order, Switch MF, switching-in-products-v2, product switching v2, holiday calendar, trade calendar refresh, available-trade-date, available trade date response, trade availability, cut-off-time, switch cutoff, switch-in availability, switch-in holiday modal, over cut off time, "91000", trade calendar not configured, no trade date config, customer account freeze switch, suspended mobile sell, mobile account freeze switch, cancel switch by system, สับเปลี่ยนกองทุน, สับเปลี่ยนกองทุนรวม, เปลี่ยนกองทุน, ปฏิทินวันหยุดกองทุน, ไม่มีปฏิทินวันซื้อขาย, วันที่มีผลคำสั่ง, เวลาตัดรอบคำสั่ง, วันหยุดกองทุนเป้าหมาย, ยกเลิกสับเปลี่ยนเมื่อระงับบัญชี]
integrations: [FundConnext]
errorCodes: ["400", "401", "500", "60001", "60002", "60005", "60007", "91000"]
status: active
lastUpdated: 2026-09-20
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

`GET /api/v2/products/{product_id}/switching-in-products` เป็น contract ปัจจุบันที่ `xspring-mobile-app` ใช้โหลด target products แบบค้นหา/pagination หลังเลือก source fund; response มี `switch_in_product_id`, `product_symbol`, `owner`, `risk_rating`, `fund_code` และ `switch_settlement_day` แต่ไม่มี cutoff time เพราะ mobile จะอ่าน cutoff จาก availability API หลังผู้ใช้เลือก target แล้ว `order-service` ยังมี v1 endpoint อยู่ แต่ v2 เป็น mobile contract ที่ source รอบนี้ยืนยัน

`order-service` ใช้ customer จาก `PortalClaims`, ตรวจ `investor_class`, sale channel `XSPRING_APP`, `disabled = false` และ `switch_out_product_id`; query รองรับ search แบบ trim/uppercase และ pagination ผลิตภัณฑ์ที่มี `switch_in_trade_flag = O` จะถูกคืนเฉพาะเมื่อมีวันข้างหน้าใน trade calendar ประเภท `SWI` (วันที่เทียบตาม `Asia/Bangkok`) มิฉะนั้นจะไม่อยู่ใน candidate list

Mobile เรียก `GET /api/v1/holidays/{order_type}/{fund_code}` เพื่อโหลด date list สำหรับปฏิทิน โดยใช้ `switch-out` เป็น order type ตอนเตรียม switch; response ที่ mobile parse เป็นรายการวันหยุดเท่านั้น หาก `order-service` พบ `ErrTradeCalendarNotConfigOpenFlag`, holiday handler คืน HTTP `200` พร้อม code `91000` (`trade calendar not configured`) และไม่มีรายการวันหยุดให้ใช้ต่อ

ปัจจุบัน `xspring-mobile-app` เก็บ `code` ไว้ใน `HolidayResponseModel` แต่ `getHoliday` ใช้เฉพาะ `data.holidays` แล้วแทนค่า calendar state; เนื่องจาก HTTP status เป็น `200` จึงไม่เกิด `HTTPRequestException` และ code `91000` ไม่ได้ถูก map เป็น `TradeCalendarBottomSheet` จาก holiday call นี้โดยตรง

Mobile ไม่มี holiday cache key แล้ว: ทุกครั้งที่ `getHoliday` ถูกเรียก—including การกลับเข้า tab/order flow เดิม—จะขอ date list จาก server ใหม่แล้วแทนค่า `holidays` ใน memory การ refresh นี้เป็น supporting calendar UX และไม่แทน validation ตอน create order ของ `order-service`

### Trade availability contract for order date and cutoff

**Owner service: `order-service`**

**Executing service: `order-service`**

**Supporting client: `xspring-mobile-app`**

`GET /api/v1/order/available-trade-date` เป็น read-only contract สำหรับตรวจวันมีผลและเวลาตัดรอบ โดยรับ `order_type=buy|sell|switch`, `product_id` และ `target_product_id` ที่เป็น optional สำหรับ switch; ต้องใช้ `PortalClaims` และไม่สร้างหรือเปลี่ยน order state ผลสำเร็จคืน `show_modal`, `current_date`, `effective_date` และ `cut_off_time` โดยวันที่เป็น `YYYY-MM-DD` และ `cut_off_time` เป็นเวลา Thailand/Asia-Bangkok แบบไม่มี timezone offset

ลำดับการตัดสินใจของ Backend คือ:

- Buy/sell และ switch ที่ยังไม่มี `target_product_id` เมื่อไม่มี trade calendar ที่เปิดใช้งาน: `show_modal = trade-calendar` และไม่มี `effective_date`
- Buy/sell และ switch ที่ยังไม่มี `target_product_id` เมื่อวันปัจจุบันเป็น weekend หรือ holiday: `show_modal = holiday` และ `effective_date` เป็น working day ถัดไป
- เป็น working day แต่เลย cutoff: `show_modal = cut-off-time` และ `effective_date` เริ่มค้นจากวันถัดไป
- ก่อน cutoff ใน working day: ไม่แสดง modal และ `effective_date` เป็นวันปัจจุบัน

สำหรับ switch ที่มี `target_product_id`, source code แยกผลของ source switch-out calendar ออกจาก modal ที่ client ใช้แสดง: ถ้า source calendar ไม่ได้ตั้งค่า response คืน `current_date` อย่างเดียว (`show_modal`, `effective_date` และ `cut_off_time` เป็น `nil`); ถ้าวันปัจจุบันเป็น holiday ระบบยังคำนวณ working day ถัดไปและ pair cutoff แต่ล้าง `show_modal` ไม่คืน holiday modal. นี่เป็น behavior ของ availability response เท่านั้น ไม่ได้เปลี่ยน final create validation ของ switch

Holiday มี priority เหนือ cutoff สำหรับวันเดียวกัน สำหรับ switch ที่ไม่มี `target_product_id` ระบบยังไม่คืน cutoff; เมื่อมี target แล้ว `order-service` ใช้ pair rule เดียวกับ precheck: settlement day ที่ไม่ใช่ศูนย์ใช้ source switch-out sell cutoff ส่วน settlement day เป็นศูนย์ใช้ cutoff ที่เร็วกว่า source sell และ target buy ในวันที่ target เปิดทำการ และ fallback เป็น source sell เมื่อ target ไม่มี calendar/เป็น holiday

ปัจจุบัน mobile เรียก contract นี้ใน buy, sell และ switch และเรียกซ้ำเมื่อเลือก target fund เพื่อเก็บ cutoff ที่แสดง (`cutOffTimeBuy`/sell/switch), `current_date`, `effective_date` และสถานะ modal จาก response หาก `show_modal` เป็น `cut-off-time` หรือ `holiday` controller จะแสดง `OrderNoticeBottomSheet` ที่ตรงกับกรณี; หลังยืนยัน mobile ใช้ effective date ที่ response ให้มา โดย buy อาจบังคับ ATS เมื่อเลือกวันข้างหน้า ส่วน switch จะส่ง `target_product_id` เมื่อมี target แล้ว ดังนั้น availability API เป็นตัวขับ modal/effective-date UX ของ mobile ใน source ที่ตรวจรอบนี้แล้ว

`GET /api/v1/holidays/{order_type}/{fund_code}` จึงเหลือบทบาทเป็น date list สำหรับ calendar และส่งสัญญาณ `91000` เมื่อไม่มี trade-calendar config ไม่ได้เป็นแหล่ง `current_date`, `effective_date` หรือ holiday modal ของ mobile อีกต่อไป ส่วน trade-calendar notice ของ mobile ที่ source ยืนยันได้มาจาก `show_modal = trade-calendar` ใน `available-trade-date`; mapping ระหว่าง `91000` ของ holiday endpoint กับ UI notice ยังไม่สอดคล้องกันและต้องยืนยัน contract กับเจ้าของระบบ

### 2. Run placement precheck

**Owner service: `order-service`**
**Executing service: `order-service`**

`POST /api/v1/order/switching/create` เรียก `VerifyPlaceOrderSwitching` ก่อนสร้าง order โดยตรวจ:

1. switching pair ต้องมีอยู่
2. source และ target sale channel ต้องอนุญาตตาม effective date
3. source switch-out holiday และ cutoff
4. ถ้า effective date เป็นวันนี้และ `SwitchSettlementDay == 0` ให้เลือก cutoff ที่เร็วกว่าใน source sell กับ target buy โดยพิจารณา target switch-in holiday ตาม helper

ถ้า precheck ไม่ผ่านเพราะ cutoff handler คืน HTTP `200` พร้อม business code `60001` และ message `Over cut off time`; กรณี validation อื่นยังคืน HTTP `403` พร้อมข้อความ `Error place order switching is not valid`

ใน current `xspring-mobile-app` หน้าสับเปลี่ยนใหม่ให้ผู้ใช้เลือก target, amount/unit และ effective date แล้ว review, ยืนยัน acknowledgement ใน confirmation bottom sheet และยืนยัน PIN ก่อนเรียก create switch order เมื่อ review หรือ precheck ได้ `60001` mobile จะแสดง over-cutoff warning และล้าง effective date เพื่อให้เลือกวันถัดไป พฤติกรรมนี้เป็น supporting client journey; `order-service` ยังเป็น owner ของ cutoff และ create validation

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
- `GET /api/v1/order/available-trade-date` เป็น read-only availability contract; holiday, cutoff และ target-pair rule ถูกคำนวณโดย `order-service` และไม่เปลี่ยน order state
- สำหรับ switch ที่มี `target_product_id`, source switch-out holiday/trade-calendar result ไม่ได้แสดง `holiday` หรือ `trade-calendar` modal ใน response; กรณีไม่มี calendar คืน `current_date` อย่างเดียว และกรณี holiday คืน effective date/pair cutoff โดย `show_modal` เป็น `nil`
- `60001` เป็น business response code ที่อยู่ใน HTTP `200` เมื่อ placement precheck พบว่าเลย cutoff; validation อื่นของ switching ยังใช้ HTTP `403` หรือ error mapping ของ handler
- Mobile รุ่นปัจจุบันอ่าน `show_modal`, `current_date`, `effective_date` และ cutoff จาก availability response; holiday endpoint v1 ใช้เป็น date list สำหรับ calendar เท่านั้น
- Candidate list ที่ mobile ใช้คือ `GET /api/v2/products/{product_id}/switching-in-products`; cutoff ไม่ได้อยู่ใน response และต้องเรียก availability ซ้ำหลังเลือก target fund

### Unresolved contract and cutoff inconsistencies

| Code path | Behavior ที่ source ยืนยัน | สถานะ |
| :--- | :--- | :--- |
| `VerifyPlaceOrderSwitching` และ `resolveSwitchCutOffSourceOrder` | ตรวจ target switch-in holiday; ถ้า target holiday ให้ใช้ source sell cutoff | ต้องยืนยัน intended behavior |
| `ValidateSwitchCutOffTime` ใน final `ValidateOrder` | ตรวจ source switch-out holiday; ถ้า settlement day เป็นศูนย์อาจเลือก target buy cutoff โดยไม่ตรวจ target holiday ใน function นี้ | ต้องยืนยัน intended behavior |
| `available-trade-date` swagger กับ handler | swagger ระบุ product/pair not found เป็น `404` แต่ current handler map sentinel error เป็น HTTP `500` | ต้องยืนยัน public error contract |
| `available-trade-date` response กับ mobile controller | source ปัจจุบัน map `show_modal`, `current_date`, `effective_date` และ cutoff ไปยัง controller แล้ว; holiday v1 เหลือ date list แต่ยังต้องยืนยัน runtime deployment/configuration | source สอดคล้อง; runtime ยังไม่ยืนยัน |
| holiday v1 no-calendar response กับ mobile | `order-service` คืน HTTP `200`/`91000` แต่ mobile holiday controller ใช้เฉพาะ `data.holidays` และไม่เปิด notice จาก code นี้ | ต้องยืนยันว่าจะปรับ backend contract หรือ client mapping |

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
- `60001` (`ErrorCutOffTime`): placement/review พบว่าเลย cutoff; switching create handler คืน HTTP `200` พร้อม message `Over cut off time` และ mobile ให้ผู้ใช้เลือก effective date ใหม่
- HTTP `400`: `available-trade-date` ได้ order type หรือ UUID ของ product/target ไม่ถูกต้อง
- HTTP `401`: `available-trade-date` ไม่มี `PortalClaims`
- HTTP `403`: placement precheck ที่ไม่ใช่ cutoff ไม่ผ่าน โดย handler ใช้ข้อความ `Error place order switching is not valid`
- `60007` (`ErrorValidateCancelWaitAllot`): customer cancellation ไม่ผ่าน switch cancellation predicate
- `91000` (`CodeNoTradeDateConfig`): holiday handler พบว่าไม่มี trade calendar ที่เปิดใช้งาน; HTTP status ยังเป็น `200`, message คือ `trade calendar not configured` และ response ไม่มี holiday data
- `500` (`ErrorInternal`): product, holiday, portfolio, external integration หรือ transaction error ที่ source map เป็น internal error; product/pair not found จาก availability endpoint ก็ถูก map เป็น `500` ใน current handler แม้ swagger ระบุ `404`
- Mobile holiday request ที่ได้ HTTP `200`/`91000` จะถูก parse เป็น holiday list ว่างใน current `getHoliday` path; source ยังไม่ยืนยันว่าควรแสดง `TradeCalendarBottomSheet` จาก code นี้ ส่วน network/parse error ล้าง client calendar state และไม่เปลี่ยน backend order state
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
- `handler/holiday_handler.go`: `GET /api/v1/holidays/{order_type}/{fund_code}` และ HTTP `200`/`91000` เมื่อไม่มี trade calendar
- `handler/product_handler.go`: `GetProductsSwitching`, `GetProductsSwitchingV2`, `GetTradeAvailability`
- `handler/product_handler_response.go`: `TradeAvailabilityResponse`, `ProductSwitchingV2Response`
- `handler/order_handler.go`: `CreateSwitchingOrder`, `CancelSwitchingOrder`
- `pkg/order/service.go`: `ValidateSwitchOrder`, `ValidateSwitchCutOffTime`, `VerifyPlaceOrderSwitching`, `OrderSwitch`, `CancelSwitchOrderByCustomer`, cutoff response-code parity
- `pkg/order/order_helpers.go`: switching request creation, FundConnext approval/cancel และ cutoff helpers
- `pkg/product/service.go`: v1/v2 switching product list, `GetTradeAvailability`, `GetCutOffTimeByOrderType` และ displayed cutoff calculation
- `storages/postgres/productrespository/product_mf_switching_repository.go`: customer/sale-channel/investor-class filter และ `switch_in_trade_flag`/`SWI` trade-calendar predicate
- `pkg/holiday/helper.go`: holiday/workday และ switch-in/switch-out cutoff resolution
- `internal/constants/error.go`: `ErrTradeCalendarNotConfigOpenFlag`, `CodeNoTradeDateConfig`
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
- `lib/services/order/available_trade_date_service.dart`: `GET /api/v1/order/available-trade-date` client
- `lib/models/order/available_trade_date_response_model.dart`: availability response parsing and cutoff display
- `lib/domains/fund_order/controller.dart`: buy/switch availability calls, holiday list replacement and current code handling
- `lib/domains/fund_order/sell/controller.dart`: sell availability, holiday list replacement and current code handling
- `lib/models/order/holiday_response_model.dart`: holiday response code/data parsing
- `lib/domains/fund_order/switch/screen.dart`: current switch review/confirmation/PIN journey
- `lib/view/order_history/list_page/order_history_list_view_model.dart`: order-history access no longer short-circuits solely on `under-min-age`/`rejected` sub-status; incomplete registration checks remain
- `lib/repository/order/order_repository.dart`: `GET /api/v1/holidays/{order_type}/{fund_code}` และ `GET /api/v2/products/{product_id}/switching-in-products` client contracts
