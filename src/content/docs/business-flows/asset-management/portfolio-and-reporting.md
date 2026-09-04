---
title: Portfolio and Reporting
description: Flow อ่านยอดสินทรัพย์ คำนวณมูลค่าพอร์ต และสร้างรายงานตามสถานะบัญชี
capability: Asset Management
services: [customer-service, asset-service, asset-consumer]
integrations: [Asset Monthly]
aliases: [portfolio, asset balance, monthly statement, report, customer list by RM, customer status monthly statement, account freeze portfolio, account status portfolio, closed account portfolio, พอร์ต, รายงานสินทรัพย์, รายชื่อลูกค้า RM, สถานะลูกค้ารายงานรายเดือน, พอร์ตบัญชีถูกระงับ, พอร์ตบัญชี freeze, พอร์ตบัญชีปิด]
status: active
lastUpdated: 2026-08-29
documentType: flow
---

## Purpose and scope

อธิบาย read flow ของ asset portfolio และ monthly reporting ตั้งแต่ตรวจสถานะบัญชี รวมยอด ประเมินมูลค่าเป็น THB จนคืน portfolio overview หรือสร้าง statement โดยไม่ใช้เป็นหลักฐานแทน operation-level trading/withdrawal rule ของ `order-service` สถานะ `closed` ถูกตัดออกจาก account/portfolio query ที่เปลี่ยนในรอบนี้ ส่วน status อื่นที่ไม่ใช่ `closed` ยังอยู่ใน read path เหล่านั้นได้

สำหรับ monthly statement ที่ให้ RM เลือกลูกค้า `asset-service` มี endpoint `GET /api/v1/customer/rm-owner` ที่คืน `customer_status` และตัดเฉพาะ `rejected` กับ `onboarding` ออกจากรายการเลือก นี่เป็นกฎของ customer-selection endpoint ไม่ใช่หลักฐานว่าทุก portfolio หรือ report-generation query ตัดสถานะเดียวกัน

## Trigger and preconditions

- Account lifecycle trigger: สถานะบัญชีลูกค้าเปลี่ยน โดย `customer-service` เป็น owner
- Portfolio trigger: client ขอ portfolio overview โดย `asset-service` เป็น owner
- Reporting trigger: client/ระบบส่งคำขอ monthly statement โดย `asset-service` เป็น owner
- RM selection trigger: `web-portal` ขอรายชื่อลูกค้าของ RM จาก `asset-service` ก่อนสร้าง monthly statement
- ต้องมี customer/account mapping, product definition และราคา NAV/MTM ที่เกี่ยวข้อง
- การปิดบัญชีต้องมียอดสินทรัพย์เป็น 0
- สำหรับ portfolio overview และ account lookup ที่ใช้ query ใหม่ บัญชีต้องมี status ไม่ใช่ `closed`; `freeze`, `suspended` และ status อื่นที่ไม่ใช่ `closed` ไม่ถูกตัดออกด้วย predicate นี้

## Participating services

| Service / domain | Responsibility |
| :--- | :--- |
| `asset-service` | Portfolio balance reads, asset categorization, valuation และ aggregation |
| `asset-consumer` | รับ master-data sync และ materialize downstream portfolio state ตาม event ที่เกี่ยวข้อง |
| `customer-service` | เป็น owner ของ account lifecycle/status ที่กำหนดสิทธิ์ของบัญชี |
| `Asset Monthly` | External report generator ที่ `asset-service` เรียกสำหรับ monthly statement |
| `web-portal` | Supporting client/BFF สำหรับเลือก customer ตาม RM และแสดง `customer_status` |

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

### 4. Return portfolio overview

**Owner service: `asset-service`**

คืนยอดรวมและรายละเอียดสินทรัพย์จากทุก Asset Group ของลูกค้า

### 5. Select customers for monthly statement

**Owner service: `asset-service`**

**Executing service: `asset-service`**

`GET /api/v1/customer/rm-owner` query ลูกค้าที่เป็นเจ้าของโดย RM พร้อมค้นหาและ pagination โดย repository ปัจจุบันใช้ `status NOT IN ('rejected', 'onboarding')` และ response map `customer_status` ให้ client ทราบสถานะของแต่ละรายการ

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
- กฎ selection ข้างต้นไม่ควรถูกขยายเป็นกฎของทุก portfolio read หรือ monthly statement data query โดยไม่มี source ยืนยัน

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

## Error and recovery behavior

- **Account status:** บัญชี `suspended` และ `freeze` ยังถูกเลือกใน portfolio read paths ที่ตัดเฉพาะ `closed`; ข้อจำกัดการเทรด/ถอนเป็น operation-specific และยืนยันที่ [Order State Machine](/shared-rules/order-state-machine/)
- **Read-path boundary:** direct account-ID portfolio reads และ monthly statement ใช้ repository methods ที่ไม่มี not-closed predicate ใน diff นี้ จึงต้องไม่ขยายกฎ `closed` exclusion ไปยังทุก endpoint
- **`asset-service`:** source ไม่ระบุ fallback เมื่อ NAV/MTM หาย ต้องตรวจ code, master/price data และ runtime path ก่อนกำหนด behavior
- **`asset-service` / `Asset Monthly`:** source ไม่ระบุ automatic recovery เมื่อ external report generation ล้มเหลว ต้องตรวจ service response และ runtime integration configuration ก่อนกำหนด behavior

## Final outcomes

- `asset-service`: Portfolio overview รวม asset group ของ account ที่ status ไม่ใช่ `closed` และ valuation เป็น THB
- `asset-service`: Monthly-report API รับ customer/date range และเรียก `Asset Monthly` ด้วยยอดและ NAV ณ สิ้นเดือน
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
- `pkg/customer/service.go`
- `handler/customer_handler.go`: RM customer-list endpoint และ response status
- `storages/postgres/customerrepository/customer_identification_repository.go`: `GetCustomerListByRelationshipManager` status filter
- `handler/report_handler.go`: monthly-report API ใน `asset-service`
- `pkg/report/monthly_service.go`: monthly report request และ call ไป `Asset Monthly`
- `storages/postgres/customerrepository/customer_account_repository.go`: not-closed account selection
- `storages/postgres/assetrepository/asset_portfolio_repository.go`: account-status predicate ใน portfolio reads
- `web-portal/src/app/api/report/customer-by-rm/route.ts`: RM customer-list BFF
- `web-portal/src/app/api/report/customer-monthly-report/route.ts`: monthly-report BFF และ `WEB` channel
- Tables: `xpg_asset.asset_portfolio`, `xpg_asset.report_monthly_statement_file`
