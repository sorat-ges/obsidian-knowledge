---
title: Asset & Portfolio Business Rules
tags: [logic, asset, portfolio, xam, xd, balance]
status: active
last-updated: 2026-04-19
---

# ⚙️ Business Logic: Asset & Portfolio

## 🎯 วัตถุประสงค์
จัดการข้อมูลสินทรัพย์ (Assets) ยอดคงเหลือ (Balance) และการคำนวณมูลค่าพอร์ตการลงทุน (Portfolio Valuation) สำหรับลูกค้ากลุ่ม XSpring

## 📜 กฎธุรกิจ (Business Rules)

### 1. การจัดกลุ่มสินทรัพย์ (Asset Categorization)
| Asset Group Code | Product Type Code | คำอธิบาย |
| :--- | :--- | :--- |
| `DigitalAsset` | `Fiat` | เงินบาท (THB) |
| `DigitalAsset` | `Crypto` | คริปโตเคอร์เรนซี (BTC, ETH, etc.) |
| `DigitalAsset` | `DigitalToken` | โทเคนดิจิทัล (SIRIHUB, etc.) |
| `MutualFund` | `UT` | หน่วยลงทุนในกองทุนรวม |

### 2. การจัดการยอดคงเหลือ (Balance Calculation)
- **`UnitBalance`**: จำนวนหน่วยทั้งหมดที่ลูกค้าถือครอง
- **`AvailableUnitBalance`**: จำนวนที่ว่างสำหรับเทรดหรือถอน (`UnitBalance - PendingOut - PledgeUnit`)
- **`PendingOutUnitBalance`**: จำนวนที่ถูก Hold ไว้จากการตั้งคำสั่งที่ยังไม่สำเร็จ
- **`PledgeUnit`**: จำนวนที่ถูกล็อกไว้ทางกฎหมายหรือการจำนำ

### 3. การวัดผลประกอบการ (Performance)
- **Market Value**: แสดงผลเป็นสกุลเงิน **THB** เสมอสำหรับ Digital Asset
- **Unrealized P/L**: `(NAV - AverageCost) * UnitBalance`

## 🛠️ Technical Reference
- **Domain Model**: `internal/domain/asset_portfolio.go`
- **Constants**: `constants.AssetGroupCodeDigitalAsset`, `constants.ProductTypeCodeFiat`
- **Database Table**: `xpg_asset.asset_portfolio`

## 🤖 How to Verify
1. ตรวจสอบ Helper functions ใน Domain: `grep -n "func (a AssetPortfolio) Is" internal/domain/asset_portfolio.go`
2. ยืนยันสูตรคำนวณ Available Balance ในโค้ด: `grep -n "AvailableUnitBalance =" pkg/asset/service.go`
3. ตรวจสอบการแปลงค่าเป็น THB ใน Portfolio Valuation Logic
