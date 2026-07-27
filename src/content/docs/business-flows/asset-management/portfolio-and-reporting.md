---
title: Portfolio and Reporting
description: Flow อ่านยอดสินทรัพย์ คำนวณมูลค่าพอร์ต และสร้างรายงานตามสถานะบัญชี
capability: Asset Management
services: [customer-service, asset-service, report-service]
aliases: [portfolio, asset balance, monthly statement, report, พอร์ต, รายงานสินทรัพย์]
status: active
lastUpdated: 2026-07-27
documentType: flow
---

## Purpose and scope

อธิบาย read flow ของ asset portfolio และ monthly reporting ตั้งแต่ตรวจสถานะบัญชี รวมยอด ประเมินมูลค่าเป็น THB จนคืน portfolio overview หรือสร้าง statement

## Trigger and preconditions

- Account lifecycle trigger: สถานะบัญชีลูกค้าเปลี่ยน โดย `customer-service` เป็น owner
- Portfolio trigger: client ขอ portfolio overview โดย `asset-service` เป็น owner
- Reporting trigger: ถึงสิ้นเดือนเวลา 23:59:59 โดย `report-service` เป็น owner
- ต้องมี customer/account mapping, product definition และราคา NAV/MTM ที่เกี่ยวข้อง
- การปิดบัญชีต้องมียอดสินทรัพย์เป็น 0

## Participating services

| Service / domain | Responsibility |
| :--- | :--- |
| `asset-service` | Portfolio balance reads, asset categorization, valuation และ aggregation |
| `customer-service` | เป็น owner ของ account lifecycle/status ที่กำหนดสิทธิ์ของบัญชี |
| `report-service` | สร้าง monthly statement จากยอดและราคาวันสิ้นเดือน |

## End-to-end sequence

### 1. Maintain account lifecycle

**Owner service: `customer-service`**

รักษาสถานะ `active`, `suspended`, `inactive` และ `closed`; การปิดบัญชีต้องตรวจว่าสินทรัพย์เป็น 0

### 2. Read, categorize and aggregate portfolio

**Owner service: `asset-service`**

อ่าน portfolio ที่ materialize แล้วและจัดกลุ่มตาม source:

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

### 5. Create monthly statement

**Owner service: `report-service`**

ตัดยอดสิ้นเดือนเวลา 23:59:59 และใช้ NAV วันสิ้นเดือน

## Business rules

| Account status | Behavior | Owner |
| :--- | :--- | :--- |
| `active` | เทรด ฝาก และถอนได้ตามปกติ | `customer-service` |
| `suspended` | ดูยอดได้ แต่ถอนหรือเทรดไม่ได้ | `customer-service` |
| `inactive` | อาจระงับการคำนวณ NAV รายวัน | `customer-service` |
| `closed` | ต้องมียอดสินทรัพย์เป็น 0 ก่อนปิด | `customer-service` |

`asset-service` เป็น owner ของ portfolio aggregation/valuation ส่วน `report-service` เป็น owner ของ monthly statement

## State transitions

**Owner service: `customer-service`**

เอกสารต้นทางกำหนดความหมายของ `active`, `suspended`, `inactive`, `closed` แต่ไม่ได้กำหนด transition graph ระหว่างสถานะ ห้ามเพิ่ม transition หรือ automatic recovery โดยไม่มี source เพิ่มเติม

## Error and recovery behavior

- **`customer-service`:** บัญชี `suspended` ยังดูยอดได้แต่เทรด/ถอนไม่ได้ และบัญชีที่ยังมีสินทรัพย์ห้ามปิด
- **`asset-service`:** source ไม่ระบุ fallback เมื่อ NAV/MTM หาย ต้องตรวจ code, master/price data และ runtime path ก่อนกำหนด behavior
- **`report-service`:** source ไม่ระบุ recovery เมื่อ report generation ล้มเหลว ต้องตรวจ code และ runtime job configuration ก่อนกำหนด behavior

## Final outcomes

- `asset-service`: Portfolio overview รวมทุก asset group และ valuation เป็น THB
- `report-service`: Monthly statement ใช้ยอดและ NAV ณ สิ้นเดือน
- `customer-service`: Suspended account ยังดูยอดได้แต่ทำรายการไม่ได้; Closed account ต้องยืนยันยอดเป็นศูนย์

## Related shared rules and flows

- [Ledger Event Processing](/business-flows/asset-management/ledger-processing/)
- [Customer and Product Master-Data Sync](/business-flows/asset-management/master-data-sync/)
- [XD Balance and Cost Sync](/business-flows/asset-management/xd-sync/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)

## Code references

- `internal/domain/asset_portfolio.go`
- `pkg/asset/service.go`
- `pkg/customer/service.go`
- `pkg/report/monthly_service.go`
- Tables: `xpg_asset.asset_portfolio`, `xpg_asset.report_monthly_statement_file`
