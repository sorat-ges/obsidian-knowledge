# 

## 1. Objective

ป้องกันไม่ให้ผู้ใช้งานส่งคำสั่งแบบ **Limit** สำหรับเหรียญที่ไม่รองรับ (ปัจจุบันคือ **SIRIHUB2**) โดยระบบจะต้องแสดงคำเตือนและปิดการใช้งานฟอร์มในโหมด Limit เพื่อป้องกันความผิดพลาดของผู้ใช้งาน

  

---

  

## Phase 1: Immediate Hotfix (Implemented)

เป็นการแก้ไขปัญหาเฉพาะหน้า (Hardcoded Fix) เพื่อให้ระบบทำงานได้ทันทีตามเงื่อนไขทางธุรกิจปัจจุบัน

  

### 1.1 UI Changes (`swap-limit-form.tsx`)

- เพิ่มการตรวจสอบชื่อเหรียญ `SIRIHUB2` ในหน้า Swap Limit

- แสดง Inline Warning: `"สินทรัพย์นี้ไม่รองรับการส่งคำสั่งแบบ Limit"`

- Disable ฟิลด์ราคา (Limit Price) และจำนวนเงิน (Amount) ทั้งหมด

  

### 1.2 Logic Changes (`use-swap.ts`)

- ปรับเงื่อนไข `canSwap` ให้ตรวจสอบชื่อเหรียญ หากเป็น `SIRIHUB2` ในโหมด Limit ปุ่มยืนยัน Swap ด้านล่างจะถูก Disable ทันที

  

### 1.3 Localization

- เพิ่ม Key `trade.swap.limit.notSupported` ใน `en/trade.json` และ `th/trade.json`

  

---

  

## Phase 2: Long-term Solution (Proposed)

เปลี่ยนมาใช้ระบบ **Backend-Driven Configuration** เพื่อความยืดหยุ่นในอนาคต (เช่น เมื่อมีเหรียญประเภท Digital Token ใหม่ๆ เพิ่มเข้ามา)

  

### 2.1 Backend Changes (Requirements)

- **API:** `/api/v1/trading/products/swap`

- **New Field:** เพิ่มฟิลด์ `is_limit_order_allowed` (boolean) หรือ `allowed_order_types` (string array) ในข้อมูลรายละเอียดของแต่ละ Product

- **Value:**

- สำหรับ SIRIHUB2: `is_limit_order_allowed: false`

- สำหรับเหรียญทั่วไป (BTC, ETH): `is_limit_order_allowed: true`

  

### 2.2 Frontend Changes (Standardization)

1. **Update Types:** แก้ไข `ProductSwapData` ใน `src/features/trade/types/trade-route-transform.ts` ให้รองรับฟิลด์ใหม่จาก API

2. **Refactor Logic:**

- เปลี่ยนจากการเช็ค `symbol === 'SIRIHUB2'` มาเป็นการเช็ค `selectedAsset.isLimitOrderAllowed` แทน

- ทำให้โค้ดส่วน UI และ Hook ไม่จำเป็นต้องรู้จักชื่อเหรียญใดเหรียญหนึ่งโดยเฉพาะ (Agnostic)

  

---

  

## 3. Verification & Testing

- [x] (Hotfix) เลือก SIRIHUB2 ในโหมด Limit ต้องเห็นคำเตือนและฟอร์มถูก Disable

- [x] (Hotfix) เลือก SIRIHUB2 ในโหมด Market ต้องทำงานได้ปกติ

- [ ] (Future) เมื่อ Backend เพิ่มฟิลด์ใหม่ ให้เปลี่ยนมาใช้การเช็คผ่านฟิลด์นั้นแทนการ Hardcode ชื่อเหรียญ