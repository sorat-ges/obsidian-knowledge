---
title: Portfolio and Reporting
description: Flow อ่านยอดสินทรัพย์ คำนวณมูลค่าพอร์ต และสร้างรายงานตามสถานะบัญชี
capability: Asset Management
services: [customer-service, asset-service, asset-consumer, web-portal]
integrations: [Asset Monthly, Product FX Mark-to-Market]
aliases: [portfolio, asset balance, fiat wallet overview, trading wallet overview, white glove portfolio, monthly statement, report, customer list by RM, customer status monthly statement, fiat allocation, aggregated fiat allocation, multi-currency fiat, USD portfolio, xpg customer code, xpg account code, investment account code, account freeze portfolio, account status portfolio, closed account portfolio, พอร์ต, ยอดกระเป๋าเงิน fiat, กระเป๋าเงินหลายสกุล, สัดส่วน fiat, สัดส่วน fiat รวม, พอร์ต USD, กระเป๋าเงิน trading, พอร์ต white glove, รายงานสินทรัพย์, รายชื่อลูกค้า RM, ค้นหาด้วยรหัสลูกค้า XPG, ค้นหาด้วยรหัสบัญชี XPG, ค้นหาด้วยรหัสบัญชีลงทุน, สถานะลูกค้ารายงานรายเดือน, พอร์ตบัญชีถูกระงับ, พอร์ตบัญชี freeze, พอร์ตบัญชีปิด]
status: active
lastUpdated: 2026-09-27
documentType: flow
---

## Purpose and scope

อธิบาย read flow ของ asset portfolio, fiat wallet overview และ monthly reporting ตั้งแต่ตรวจสถานะบัญชี รวมยอด ประเมินมูลค่าเป็น THB จนคืน portfolio overview หรือสร้าง statement โดยครอบคลุม fiat หลายสกุลและการค้นหาลูกค้าโดยรหัส customer/account ด้วย ไม่ใช้เป็นหลักฐานแทน operation-level trading/withdrawal rule ของ `order-service` สถานะ `closed` ถูกตัดออกจาก account/portfolio query ที่เปลี่ยนในรอบนี้ ส่วน status อื่นที่ไม่ใช่ `closed` ยังอยู่ใน read path เหล่านั้นได้

สำหรับ monthly statement ที่ให้ RM เลือกลูกค้า `asset-service` มี endpoint `GET /api/v1/customer/rm-owner` ที่คืน `customer_status` และตัดเฉพาะ `rejected` กับ `onboarding` ออกจากรายการเลือก นี่เป็นกฎของ customer-selection endpoint ไม่ใช่หลักฐานว่าทุก portfolio หรือ report-generation query ตัดสถานะเดียวกัน

## Trigger and preconditions

- Account lifecycle trigger: สถานะบัญชีลูกค้าเปลี่ยน โดย `customer-service` เป็น owner
- Portfolio trigger: client ขอ portfolio overview โดย `asset-service` เป็น owner
- Reporting trigger: client/ระบบส่งคำขอ monthly statement โดย `asset-service` เป็น owner
- RM selection trigger: `web-portal` ขอรายชื่อลูกค้าของ RM จาก `asset-service` ก่อนสร้าง monthly statement
- ต้องมี customer/account mapping, product definition และราคา NAV/MTM ที่เกี่ยวข้อง; fiat ที่ไม่ใช่ THB ต้องมี FX mark-to-market record ที่มี `NavPU` เมื่อจะคำนวณมูลค่าเป็น THB
- การปิดบัญชีต้องมียอดสินทรัพย์เป็น 0
- สำหรับ portfolio overview และ account lookup ที่ใช้ query ใหม่ บัญชีต้องมี status ไม่ใช่ `closed`; `freeze`, `suspended` และ status อื่นที่ไม่ใช่ `closed` ไม่ถูกตัดออกด้วย predicate นี้

## Participating services

| Service / domain | Responsibility |
| :--- | :--- |
| `asset-service` | Portfolio balance reads, asset categorization, valuation และ aggregation |
| `asset-consumer` | รับ master-data sync และ materialize downstream portfolio state ตาม event ที่เกี่ยวข้อง |
| `customer-service` | เป็น owner ของ account lifecycle/status ที่กำหนดสิทธิ์ของบัญชี |
| `Asset Monthly` | External report generator ที่ `asset-service` เรียกสำหรับ monthly statement |
| `web-portal` | Supporting client/BFF สำหรับเลือก customer ตาม RM, เรียก White Glove wallet overview และแสดง fiat/crypto portfolio |

## End-to-end sequence

### 1. Maintain account lifecycle

**Owner service: `customer-service`**

รักษาสถานะ `active`, `suspended`, `inactive`, `freeze` และ `closed`; การปิดบัญชีต้องตรวจว่าสินทรัพย์เป็น 0

### 2. Read, categorize and aggregate portfolio

**Owner service: `asset-service`**

อ่าน account และ portfolio ที่ materialize แล้ว โดย query ที่ใช้กับ overview จะ join `customer_account` แล้วกรอง `ca.status NOT IN ('closed')` ก่อนจัดกลุ่มตาม source:

- `GetAllPortfolio`, `GetPortfolioOverview` และ `GetTradingPortfolioOverview` ใช้ `GetNotClosedCustomerAccounts`
- portfolio reads แบบ identification/asset group/account set ใช้ not-closed predicate เดียวกัน
- wallet/account-list paths ที่ resolve account ผ่าน `GetCustomerAccountsByProduct` จึงไม่เลือก `closed` account ก่อนอ่าน portfolio

| Asset group | Product type | Meaning |
| :--- | :--- | :--- |
| `DigitalAsset` | `Fiat` | THB |
| `DigitalAsset` | `Crypto` | BTC, ETH และคริปโต |
| `DigitalAsset` | `DigitalToken` | Digital token เช่น SIRIHUB |
| `MutualFund` | `UT` | หน่วยลงทุน |

Portfolio overview รวมยอดทุก Asset Group ของลูกค้าคนเดียวกัน

### 3. Calculate balances and valuation

**Owner service: `asset-service`**

- `AvailableUnitBalance = UnitBalance - PendingOutUnitBalance - PledgeUnit`
- Digital Asset market value แสดงเป็น THB
- `Unrealized P/L = (NAV - AverageCost) * UnitBalance`
- Mark-to-Market แปลงสินทรัพย์ทุกประเภทเป็น THB เพื่อหา Total Equity
- `GetFiatBalanceByAccountID` รวม fiat portfolio ตาม product/currency, ใช้ rate `1` สำหรับ THB และใช้ `NavPU` จาก `dw_product.product_fx_mark_to_market` สำหรับ currency อื่น แล้วปัด `AmountTHB` ลงสองตำแหน่ง
- Portfolio mapper ที่รับ asset list ใช้ `NavPU` ของ USD/THB โดยตรงสำหรับ asset code `USD` และ override digital-asset mark-to-market ของ USD; ถ้าไม่มี FX rate จะไม่มี market price ของ USD และรายการนั้นจะไม่ถูกตีมูลค่า
- Fiat `in_order` ใน portfolio ใช้ `in_order × market price` แล้วปัดลงสองตำแหน่ง ไม่ใช้จำนวนหน่วยดิบของ USD แทนมูลค่า THB
- ถ้า FX record ของ currency ใดไม่มี `NavPU`, `asset-service` log และข้ามเฉพาะ balance รายการนั้น; error จากการอ่าน portfolio/product/FX repository ทำให้ wallet request ล้มเหลว
- Trading wallet overview คืนเฉพาะรายการ THB; White Glove wallet overview คืน fiat balance ทุก currency พร้อม native amount, THB equivalent และ `in_order`
- Current trading/White Glove portfolio valuation ใช้ `NavPU`; `OriginalNavPU` ที่ `asset-consumer` persist ไม่ได้ถูกเลือกใน mapper ของ asset-service path นี้
- Portfolio list path เก็บแถว fiat ที่มี `UnitBalance = 0` ไว้ได้ เพื่อให้ product/currency fiat ยังปรากฏในผลลัพธ์ ขณะที่ zero-balance asset ประเภทอื่นถูกกรองตาม path ที่ใช้ `WithoutZeroUnitBalance`

### 4. Return portfolio overview

**Owner service: `asset-service`**

คืนยอดรวมและรายละเอียดสินทรัพย์จากทุก Asset Group ของลูกค้า

สำหรับ `GET /api/v2/trading/asset/customer/wallet/overview` และ `GET /api/v2/white-glove/asset/customer/wallet/overview/{identification_id}`, `asset-service` คืน fiat balance ตาม contract ของแต่ละ endpoint; `web-portal` ใช้ White Glove response แยกตาราง fiat ออกจาก crypto/digital-token portfolio และเปิด deposit/withdraw action เฉพาะแถว THB ใน client

สำหรับ White Glove portfolio allocation overview, `GetTradingPortfolioOverview` อ่าน digital-asset portfolio แล้วเลือกเฉพาะ asset value ที่มี `ProductType = FIAT` และ allocation ไม่เป็นศูนย์ จากนั้นรวมสัดส่วน fiat ทุก currency เป็นแถวเดียวที่ `AssetGroupCode = FIAT` และ `AssetGroup = FIAT`; ไม่คืนแถวแยกตาม product code เช่น `THB` หรือ `USD` ใน overview นี้ สัดส่วน `Crypto` ถูกคำนวณเป็น `100 - total fiat - digital token` เมื่อมี crypto portfolio row ให้ปรับ และการอ่าน digital account/portfolio ที่เป็น optional ล้มเหลวจะ log แล้วคืน overview เดิมโดยไม่เติม fiat row แทนการใช้ THB fallback

### 5. Select customers for monthly statement

**Owner service: `asset-service`**

**Executing service: `asset-service`**

`GET /api/v1/customer/rm-owner` query ลูกค้าที่เป็นเจ้าของโดย RM พร้อมค้นหาและ pagination โดย repository ปัจจุบันใช้ `status NOT IN ('rejected', 'onboarding')` และ response map `customer_status` ให้ client ทราบสถานะของแต่ละรายการ การค้นหาใช้ชื่อ/อีเมล/มือถือ, `xspring_customer_code` และ account code ใน `customer_account.xpg_account_code` หรือ `investment_account_code`

**Executing client: `web-portal`**

`web-portal` BFF เรียก `ASSET_API_URL/api/v1/customer/rm-owner` แล้วแสดงสถานะใน customer-selection modal ก่อนส่ง customer ที่เลือกไปยัง monthly-report request

### 6. Create monthly statement

**Owner service: `asset-service`**

**Executing service: `asset-service`**

`asset-service` รับ monthly-report request, ตัดยอดสิ้นเดือนเวลา 23:59:59 และใช้ NAV วันสิ้นเดือน จากนั้นเรียก integration `Asset Monthly` เพื่อสร้าง statement

## Business rules

| Account status | Behavior | Owner |
| :--- | :--- | :--- |
| `active` | อยู่ใน portfolio/account read paths ที่ใช้ not-closed predicate; operation อื่นให้ยึด backend ของ operation นั้น | `customer-service` สำหรับ status; `asset-service` สำหรับ read |
| `suspended` | อยู่ใน portfolio/account read paths ที่ใช้ not-closed predicate; การสร้างหรือยกเลิกคำสั่งต้องใช้ operation-level rule ของ `order-service` | `customer-service` สำหรับ account status; `asset-service` สำหรับ read; `order-service` สำหรับ order operation |
| `inactive` | อยู่ใน query ที่ตัดเฉพาะ `closed`; source รอบนี้ไม่ได้ยืนยันกฎคำนวณ NAV ของ status นี้ | `customer-service` สำหรับ status; `asset-service` สำหรับ read |
| `freeze` | อ่าน portfolio/account ได้ใน query ที่ตัดเฉพาะ `closed`; การแสดงผลไม่ปลดล็อก order operation ที่ backend block ไว้ | `customer-service` สำหรับ status; `asset-service` สำหรับ read; `order-service` สำหรับ order operation |
| `closed` | ไม่ถูกเลือกใน account/portfolio query ที่ใช้ not-closed predicate; การปิดบัญชีต้องมียอดสินทรัพย์เป็น 0 | `customer-service` สำหรับ lifecycle; `asset-service` สำหรับ read filter |

- RM customer-selection query ของ `asset-service` ตัด `rejected` และ `onboarding` แต่ยังคืน status อื่นที่ไม่ถูก exclude และส่ง `customer_status` กลับให้ client แสดงผล
- RM customer-selection query ค้นหาได้ด้วย `xspring_customer_code`, `xpg_account_code` และ `investment_account_code` ผ่าน account existence check; การค้นหา account code ไม่ได้เปลี่ยน owner ของ customer status
- กฎ selection ข้างต้นไม่ควรถูกขยายเป็นกฎของทุก portfolio read หรือ monthly statement data query โดยไม่มี source ยืนยัน
- Wallet fiat valuation ใช้ `NavPU` ปัจจุบันของ FX mark-to-market; source รอบนี้ไม่ยืนยันการใช้ `OriginalNavPU` เป็น valuation สำหรับ trading หรือ White Glove wallet/portfolio
- White Glove `GetTradingPortfolioOverview` รวม fiat allocation ที่ไม่เป็นศูนย์ทุก currency เป็นแถว `FIAT` เดียว และคำนวณ crypto residual ใหม่; ถ้าไม่มี fiat allocation ที่ไม่เป็นศูนย์ หรือไม่มี crypto row ให้ปรับ จะคง overview เดิม
- Fiat allocation overview ใช้ `ProductType = FIAT` เป็นตัวคัดกรอง ไม่ถือว่า symbol เช่น `THB` เป็น fiat โดยอัตโนมัติ และไม่มี THB fallback เมื่อ optional account/portfolio lookup ใช้งานไม่ได้

`asset-service` เป็น owner และ executor ของ portfolio aggregation/valuation, RM customer selection และ monthly-report API; `Asset Monthly` เป็น external report generator ที่ถูกเรียกจาก service

## State transitions

**Owner service: `customer-service`**

เอกสารต้นทางกำหนดความหมายของ `active`, `suspended`, `inactive`, `freeze`, `closed` แต่ไม่ได้กำหนด transition graph ระหว่างสถานะ ห้ามเพิ่ม transition หรือ automatic recovery โดยไม่มี source เพิ่มเติม

การเปลี่ยนในรอบนี้เป็น read-selection policy ไม่ใช่ state transition:

| Read query | Selection behavior |
| :--- | :--- |
| Portfolio/account queries ที่ใช้ `status NOT IN ('closed')` | status ที่ไม่ใช่ `closed` ถูกนำไปอ่านและ aggregate; `closed` ถูกตัดออก |
| Monthly statement query `GetAssetPortfolioAllByIdentificationForMonthlyStatement` | source ปัจจุบันยังไม่มี predicate ใหม่ จึงไม่สรุปว่า monthly statement ตัด `closed` ออก |

| RM customer-selection query `GetCustomerListByRelationshipManager` | ตัด `rejected` และ `onboarding`; คืน `customer_status`; เป็น selection policy ไม่ใช่ state transition |
| White Glove trading portfolio allocation overview | อ่าน fiat asset values จาก digital-asset account แล้วรวมเป็นแถว `FIAT` เดียว พร้อมปรับ crypto residual; ไม่ใช่การเปลี่ยน portfolio state |

## Error and recovery behavior

- **Account status:** บัญชี `suspended` และ `freeze` ยังถูกเลือกใน portfolio read paths ที่ตัดเฉพาะ `closed`; ข้อจำกัดการเทรด/ถอนเป็น operation-specific และยืนยันที่ [Order State Machine](/shared-rules/order-state-machine/)
- **Read-path boundary:** direct account-ID portfolio reads และ monthly statement ใช้ repository methods ที่ไม่มี not-closed predicate ใน diff นี้ จึงต้องไม่ขยายกฎ `closed` exclusion ไปยังทุก endpoint
- **`asset-service`:** source ไม่ระบุ fallback เมื่อ NAV/MTM หาย ต้องตรวจ code, master/price data และ runtime path ก่อนกำหนด behavior
- **White Glove portfolio allocation:** ถ้าอ่าน digital account หรือ portfolio เพื่อหา fiat allocation ไม่สำเร็จ ระบบ log แล้วคืน base overview โดยไม่เติม fiat allocation; ไม่ได้สร้าง THB fallback ใน path ปัจจุบัน
- **Fiat FX:** ถ้าไม่มี `NavPU` สำหรับ currency ที่ไม่ใช่ THB รายการนั้นถูกข้ามและรายการอื่นยัง map ต่อ; ไม่มี fallback rate ที่ source ยืนยัน
- **USD portfolio:** ถ้าไม่มี USD FX rate, USD market price จะหายจาก mapper ที่ใช้ direct FX path จึงไม่ควรคำนวณมูลค่า THB จากชื่อ symbol หรือ rate ที่ client ส่งมา
- **RM search:** repository error ทำให้ customer-selection request ล้ม; source ไม่ยืนยัน fallback search จาก frontend เมื่อ account-code lookup ใช้งานไม่ได้
- **`asset-service` / `Asset Monthly`:** source ไม่ระบุ automatic recovery เมื่อ external report generation ล้มเหลว ต้องตรวจ service response และ runtime integration configuration ก่อนกำหนด behavior

## Final outcomes

- `asset-service`: Portfolio overview รวม asset group ของ account ที่ status ไม่ใช่ `closed` และ valuation เป็น THB
- `asset-service`: Monthly-report API รับ customer/date range และเรียก `Asset Monthly` ด้วยยอดและ NAV ณ สิ้นเดือน
- `asset-service`: Trading wallet overview คืน THB fiat balance และ White Glove wallet overview คืน fiat balances ที่ map FX ได้ พร้อมยอด native/THB และ pending order amount
- `asset-service`: White Glove trading portfolio allocation overview คืน fiat allocation รวมเป็นแถว `FIAT` เดียวและปรับ crypto residual ตาม allocation ที่อ่านได้; ถ้าอ่าน optional digital account/portfolio ไม่ได้คืน overview เดิมโดยไม่เติม fiat row
- `customer-service`: Suspended และ freeze account ยังมีข้อมูลใน read paths ที่ใช้ not-closed predicate; Closed account ถูกตัดจาก query กลุ่มนั้นและต้องยืนยันยอดเป็นศูนย์; order operation ให้ยึด backend rule ของแต่ละ operation

## Related shared rules and flows

- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Customer and Product Master-Data Sync](/business-flows/asset-management/master-data-sync/)
- [XD Balance and Cost Sync](/business-flows/asset-management/xd-sync/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Order State Machine](/shared-rules/order-state-machine/)

## Code references

- `internal/domain/asset_portfolio.go`
- `pkg/asset/service.go`
- `pkg/trading/service.go`: `GetTradingWalletAssetBalanceOverview`, `GetWhiteGloveFiatBalance` และ fiat/portfolio mappers
- `pkg/trading/service.go`: `getFiatAllocations`, `fiatAllocationsFromAssetValues`, `applyFiatAllocationsToOverview`
- `internal/domain/digital_market_price.go`: USD direct FX mapping ใน `MarketPriceTHBMappingForAssets`
- `internal/domain/asset_portfolio_list.go`: เก็บ zero-unit fiat ใน `WithoutZeroUnitBalance`
- `handler/trading_handler.go`: trading wallet overview endpoint
- `handler/white_glove_handler.go`: White Glove wallet/portfolio endpoints
- `pkg/customer/service.go`
- `handler/customer_handler.go`: RM customer-list endpoint และ response status
- `storages/postgres/customerrepository/customer_identification_repository.go`: `GetCustomerListByRelationshipManager` status filter
- `storages/postgres/customerrepository/customer_identification_repository.go`: RM search ด้วย `xspring_customer_code`, `xpg_account_code` และ `investment_account_code`
- `handler/report_handler.go`: monthly-report API ใน `asset-service`
- `pkg/report/monthly_service.go`: monthly report request และ call ไป `Asset Monthly`
- `storages/postgres/customerrepository/customer_account_repository.go`: not-closed account selection
- `storages/postgres/assetrepository/asset_portfolio_repository.go`: account-status predicate ใน portfolio reads
- `storages/postgres/productrepository/product_fx_mark_to_market.go`: FX `NavPU` lookup by currency
- `web-portal/src/app/api/report/customer-by-rm/route.ts`: RM customer-list BFF
- `web-portal/src/app/api/report/customer-monthly-report/route.ts`: monthly-report BFF และ `WEB` channel
- `web-portal/src/app/api/white-glove/[identificationId]/asset-portfolio/overview/route.ts`: White Glove wallet overview BFF
- `web-portal/src/app/features/white-glove/components/common/portfolio/portfolio-fiat-table/index.tsx`: fiat rows and THB-only actions
- Tables: `xpg_asset.asset_portfolio`, `xpg_asset.report_monthly_statement_file`
