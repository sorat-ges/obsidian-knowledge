---
title: Asset & Portfolio Business Rules
tags: [logic, asset, portfolio, xam, xd, balance]
status: active
last-updated: 2026-04-06
---

# ⚙️ Business Logic: Asset & Portfolio (Deep Dive)

## 🎯 วัตถุประสงค์
จัดการข้อมูลสินทรัพย์ (Assets) ยอดคงเหลือ (Balance) และการคำนวณมูลค่าพอร์ตการลงทุน (Portfolio Valuation) สำหรับลูกค้ากลุ่ม XSpring

## 📜 การจัดกลุ่มสินทรัพย์ (Asset Categorization)

| Asset Group Code | Product Type Code | คำอธิบาย |
| :--- | :--- | :--- |
| `DigitalAsset` | `Fiat` | เงินบาท (THB) |
| `DigitalAsset` | `Crypto` | คริปโตเคอร์เรนซี (BTC, ETH, etc.) |
| `DigitalAsset` | `DigitalToken` | โทเคนดิจิทัล (SIRIHUB, etc.) |
| `MutualFund` | `UT` | หน่วยลงทุนในกองทุนรวม |

## ➗ กฎการจัดการยอดคงเหลือ (Balance Calculation Rules)

| ประเภทกยอด (Field) | นิยามทางธุรกิจ (Business Definition) |
| :--- | :--- |
| **`UnitBalance`** | จำนวนหน่วยทั้งหมดที่ลูกค้าถือครองอยู่ตามทะเบียน |
| **`AvailableUnitBalance`** | จำนวนหน่วยที่ **ว่าง** สำหรับการเทรดหรือถอน (หัก Pending Out) |
| **`PendingOutUnitBalance`** | จำนวนหน่วยที่ถูก **Hold** ไว้จากการตั้งคำสั่งขายหรือถอนที่ยังไม่สำเร็จ |
| **`PledgeUnit`** | จำนวนหน่วยที่ถูก **ล็อก (Lock)** ไว้เนื่องจากการจำนำหรือสิทธิ์ทางกฎหมาย |

### สูตรคำนวณเบื้องต้น:
- `Available = UnitBalance - PendingOutUnitBalance - PledgeUnit`

## 📈 การวัดผลประกอบการ (Performance Rules)
- **Market Value (Display)**: หากเป็น `DigitalAsset` ระบบจะแสดงผลเป็นสกุลเงิน **THB** เสมอ
- **Unrealized P/L**: คำนวณจาก `(NAV - AverageCost) * UnitBalance`
- **NAV Date**: วันที่ของราคาสินทรัพย์ล่าสุดที่ใช้ในการคำนวณมูลค่าพอร์ต

## 🛠️ Technical Reference (Internal)
- **Domain Model**: `internal/domain/asset_portfolio.go`
- **Constants**: `constants.AssetGroupCodeDigitalAsset`, `constants.ProductTypeCodeFiat`
- **Database**: Table `xpg_asset.asset_portfolio`

## 🤖 How to Verify (For AI Agent)
ตรวจสอบความสอดคล้องของประเภทสินทรัพย์ได้ที่:
`grep -n "func (a AssetPortfolio) Is" internal/domain/asset_portfolio.go`
เพื่อดู Helper functions เช่น `IsFiat()`, `IsCrypto()`, `IsDigitalToken()`
