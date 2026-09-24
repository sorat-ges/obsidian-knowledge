---
title: Customer and Product Master-Data Sync
description: Flow ซิงค์ข้อมูลลูกค้า บัญชี ผู้ถือหน่วย Product ราคา และ Dealer mapping สำหรับงาน Asset
capability: Asset Management
services: [asset-consumer, asset-service]
integrations: [Kafka]
aliases: [master data sync, customer sync, product sync, dealer mapping, product FX mark-to-market, FX NavPU, account status sync, freeze account sync, ซิงค์ข้อมูลลูกค้า, ซิงค์สินค้า, ซิงค์ราคา FX, ซิงค์สถานะบัญชี]
status: active
lastUpdated: 2026-09-24
documentType: flow
---

## Purpose and scope

อธิบายการซิงค์ข้อมูลอ้างอิงที่ asset flows ต้องใช้ ได้แก่ customer identification, account, unitholder, product/price, FX mark-to-market และ dealer mapping เพื่อให้ ledger materialization และ portfolio valuation ระบุเจ้าของ สินค้า และ rate ที่ใช้คำนวณได้ถูกต้อง

## Trigger and preconditions

**Owner service: `asset-consumer`**

Trigger คือ event อัปเดต customer/account, unitholder, product/price, FX mark-to-market หรือ dealer mapping ข้อมูลต้องมี identifier ที่ใช้ map ไปยัง record ปลายทาง

## Participating services

| Service / integration | Responsibility |
| :--- | :--- |
| Upstream customer/product sources | ส่งข้อมูล master และสถานะล่าสุด |
| Kafka | ส่ง event เช่น `customer-sync` |
| `asset-consumer` | Map และ persist master data สำหรับ asset processing |
| `asset-service` | ใช้ master data เพื่ออ่าน จัดกลุ่ม และประเมินมูลค่า portfolio |
| `dw_product.product_fx_mark_to_market` | เก็บ FX mark-to-market ต่อ currency สำหรับการแปลงมูลค่าเป็น THB |

## End-to-end sequence

### 1. Receive master-data event

**Owner service: `asset-consumer`**

แยก event ตาม customer/account, product/price หรือ dealer mapping

### 2. Materialize customer and account data

**Owner service: `asset-consumer`**

- บันทึก identification ใน `dw_customer.customer_identification`
- บันทึก account mapping ใน `dw_customer.customer_account`
- ซิงค์ Unitholder ID ใน `dw_order.customer_account_unitholder`
- อัปเดต account status ตามค่าที่ได้รับจาก event เช่น `active`, `suspended`, `freeze` หรือ `closed`; consumer เก็บ raw status และไม่ได้เพิ่ม operation-level gate ในขั้น sync

### 3. Materialize product and price data

**Owner service: `asset-consumer`**

บันทึก Symbol, Asset Group และ Currency ใน `dw_product.product` และรับ NAV/Price ล่าสุดเพื่อ Mark-to-Market หรือใช้เป็น cost context เมื่อ ledger ไม่มีต้นทุน

สำหรับ product FX mark-to-market, `asset-consumer` รับ message version `V1.0.1` และ upsert ตาม `currency` ลง `dw_product.product_fx_mark_to_market`; payload รองรับ `OriginalNavBuy`, `OriginalNavSell` และ `OriginalNavPU` เป็น optional columns เพื่อเก็บข้อมูลต้นฉบับเพิ่มเติม

### 4. Materialize dealer mapping

**Owner service: `asset-consumer`**

เชื่อม `DealerID` ภายนอกกับ `CustomerAccountID` ของ XSpring

### 5. Use synchronized context

**Balance/report owner: `asset-service`**

ใช้ account/product/price ที่ sync แล้วใน [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/) ขณะที่ `asset-consumer` ใช้ข้อมูลเดียวกันระบุ portfolio ตอน apply ledger

## Business rules

- Account status ต้องอัปเดตทันทีเมื่อได้รับ event
- `asset-consumer` เป็น executor ของการเก็บ raw account status; การที่ status ถูก materialize ไม่ได้แปลว่า operation ทุกชนิดได้รับอนุญาต
- Product master ต้องเก็บ Symbol, Asset Group และ Currency
- NAV/Price ล่าสุดใช้กับ Mark-to-Market และเป็น context เมื่อ ledger ไม่มี cost
- FX mark-to-market ใช้ `currency` เป็น conflict key และ update ค่า price/rate ล่าสุดเมื่อ upsert สำเร็จ; `asset-service` ใช้ `NavPU` ปัจจุบันของ record ใน fiat wallet/portfolio valuation
- `OriginalNavBuy`, `OriginalNavSell` และ `OriginalNavPU` เป็นข้อมูลที่ persist ได้ แต่ source ของ `asset-service` รอบนี้ยืนยันการคำนวณด้วย `NavPU` ไม่ใช่ original-nav fields
- Dealer mapping ต้องเชื่อม external `DealerID` กับ XSpring `CustomerAccountID`

## State transitions

**Owner service: `asset-consumer`**

ไม่มี order state machine; event แต่ละชนิดเปลี่ยน current master record ไปเป็นค่าล่าสุดที่ได้รับ เอกสารต้นทางไม่ได้กำหนด version conflict หรือ out-of-order transition

## Error and recovery behavior

**Owner service: `asset-consumer`**

- identifier หรือ mapping ไม่ครบทำให้ downstream ระบุ portfolio/product ไม่ได้
- source ไม่ระบุ retry, deduplication หรือ conflict resolution จึงต้องตรวจ topic/runtime implementation ก่อนกำหนด recovery
- Product FX message ที่ไม่ใช่ version `V1.0.1` ถูก reject ก่อน sync ด้วย error `Invalid message version: <version>`
- Service สร้าง transaction wrapper รอบการ sync แต่ repository upsert จะ fallback ไปใช้ base DB เมื่อได้รับ transaction เป็น `nil`; จาก source ปัจจุบันจึงยังยืนยัน atomic transaction scope ของหลาย-row FX sync ไม่ได้ และต้องยืนยันกับเจ้าของระบบ
- วินิจฉัย customer sync จาก topic `customer-sync` และตรวจ record ปลายทางตามชนิด event

## Final outcomes

- customer/account/unitholder data พร้อมสำหรับระบุเจ้าของ portfolio
- product และ price พร้อมสำหรับ categorization/valuation
- FX mark-to-market พร้อมสำหรับแปลง fiat balance เป็น THB; original-nav fields ถูกเก็บเป็นข้อมูลประกอบเมื่อ payload ส่งมา
- DealerID map ไปยัง CustomerAccountID
- ledger processing และ reporting ใช้ master data ชุดล่าสุด

## Related shared rules and flows

- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [XD Balance and Cost Sync](/business-flows/asset-management/xd-sync/)
- [Service Map](/system-context/service-map/)

## Code references

- `pkg/customer-account/service.go`
- `pkg/product-mf/service.go`
- `dw_customer.customer_identification`
- `dw_customer.customer_account`
- `dw_order.customer_account_unitholder`
- `dw_product.product`
- `pkg/product-fx-mark-to-market/service.go`: message version validation และ FX upsert orchestration
- `internal/infrastructure/postgres/repository/product_fx_mark_to_market_repository.go`: upsert ตาม currency และ transaction fallback behavior
- `internal/entities/data-access/product_fx_mark_to_market_db.go`: `OriginalNavBuy`, `OriginalNavSell`, `OriginalNavPU`
- `internal/constants/event-message-kafka.go`: `ProductFxMarkToMarketVersion = V1.0.1`
- `dw_product.product_fx_mark_to_market`
