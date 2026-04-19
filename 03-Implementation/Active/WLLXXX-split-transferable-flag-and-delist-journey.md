# WLLXXX - การแยก Flag: Transferable สำหรับการฝาก/ถอน และรองรับกระบวนการ Delist (Delist Journey)

## วัตถุประสงค์ (Objective)
เพื่อแยก Flag `Transferable` ที่มีอยู่ออกเป็น `Depositable` (ฝากได้) และ `Withdrawable` (ถอนได้) และเพื่อเตรียมระบบรองรับกระบวนการเพิกถอนสินทรัพย์ (Delisting) เพื่อให้มั่นใจว่าเหรียญที่ถูก Delist จะไม่กระทบต่อยอดคงเหลือของลูกค้า และออเดอร์ Limit ที่ค้างอยู่จะถูกยกเลิกโดยอัตโนมัติ

## เกณฑ์การยอมรับ (Acceptance Criteria - AC)
1.  **ช่องทาง (Channels)**: รองรับ MOB / Web Trade / Weare
2.  **การแยก Flag**: แยก `Transferable` เป็น `Depositable` และ `Withdrawable` พร้อมอัปเดต Logic ที่เกี่ยวข้องให้ใช้ Flag ที่ถูกต้องตามประเภทธุรกรรม (ฝาก หรือ ถอน)
3.  **ข้อมูลการ Delist**: ตรวจสอบว่าข้อมูลเหรียญยังแสดงผลได้ถูกต้องหลังจาก Delist
4.  **การป้องกันยอดคงเหลือ (Balance Protection)**: เมื่อ `Depositable = FALSE` (Delisted) ระบบจะต้องไม่ประมวลผล Webhook/Hook ที่เข้ามา เพื่อป้องกันการอัปเดตยอดเงินลูกค้าผิดพลาด
5.  **ยกเลิก Limit Orders**: ยกเลิกออเดอร์ Limit ที่เปิดค้างไว้ทั้งหมดสำหรับสินทรัพย์ที่ถูก Delist โดยอัตโนมัติ และตรวจสอบว่ามีการบันทึกการเคลื่อนไหวของ Ledger (Ledger Movements) อย่างถูกต้อง
6.  **ข้อมูลตลาด (Market Data)**: หยุดดึงราคา (Price Fetching) และลบข้อมูลราคาที่มีอยู่ในตาราง `product_digital_asset_mark_to_market`

---

## 1. การเปลี่ยนแปลง Database & Schema

### 1.1 ตาราง `product_digital_asset_extension`
- เพิ่มคอลัมน์ `depositable` (boolean, default true)
- เพิ่มคอลัมน์ `withdrawable` (boolean, default true)
- (ทางเลือก) เก็บ `transferable` ไว้เพื่อรองรับ Backward Compatibility หรือทำการ Migrate ค่าไปยังคอลัมน์ใหม่

### 1.2 ตาราง `product_digital_asset_mark_to_market`
- เตรียม Mechanism สำหรับการลบข้อมูลตาม `product_id`

---

## 2. การเปลี่ยนแปลง Domain & Entity Layer

### 2.1 อัปเดต `internal/domain/product_digital_asset_extension.go`
- แก้ไข `ProductDAExtensionDB` ให้รวมฟิลด์ `Depositable` และ `Withdrawable` พร้อมระบุ GORM tags ที่ถูกต้อง

### 2.2 อัปเดต `internal/domain/product_on_shelf.go`
- แก้ไข `ProductOnShelfOption` โดยเปลี่ยน `IsTransferable` เป็น `IsDepositable` และ `IsWithdrawable`

---

## 3. การเปลี่ยนแปลง Repository Layer

### 3.1 อัปเดต `storages/postgres/productrespository/product_repository.go`
- แก้ไข `GetProductOnShelf` ให้ใช้ Flag ที่ถูกต้อง:
    - หากกรองสำหรับการ **ฝาก (Deposit)**: ใช้ `pdae.depositable = ?`
    - หากกรองสำหรับการ **ถอน (Withdrawal)**: ใช้ `pdae.withdrawable = ?`

### 3.2 อัปเดต `storages/postgres/productrespository/product_digital_asset_mark_to_market_repository.go`
- พัฒนา Method `DeleteByProductID(productID uuid.UUID) error` เพื่อล้างข้อมูลราคาสำหรับสินทรัพย์ที่ถูก Delist

### 3.3 อัปเดต `pkg/order_trade/repository.go`
- พัฒนา Method สำหรับหาออเดอร์ Limit ทั้งหมดที่เปิดค้างไว้ตาม Asset (ไม่ว่า Asset นั้นจะเป็น Base หรือ Quote)

---

## 4. การดำเนินการใน Service Layer

### 4.1 อัปเดต Crypto Product Service (`pkg/crypto_product/service.go`)
- ใน `GetProductCrypto` ให้หน่วยค่า `ProductOnShelfOption` โดยตั้งค่า `IsDepositable` หรือ `IsWithdrawable` ตามประเภทการทำงานที่ร้องขอ

### 4.2 อัปเดต Crypto Order Service (`pkg/crypto/service.go`)
- **การตรวจสอบ Webhook**: ใน `HandleDepositCryptoWebhook` ให้ตรวจสอบ Flag `Depositable` จาก Product Extension หาก `Depositable == FALSE` ให้ Log เหตุการณ์และ Return ทันที (ข้ามการประมวลผลยอดเงิน)

### 4.3 อัปเดต Order Trade Service (`pkg/order_trade/service.go`)
- พัฒนา Method ภายในใหม่ `CancelAllOrdersForAsset(assetID uuid.UUID)` ซึ่งมีขั้นตอนดังนี้:
    1. ดึงออเดอร์ที่เปิดค้างอยู่ทั้งหมดสำหรับ Asset นั้น
    2. วนลูปเรียกใช้ Logic `CancelSwapOrder` ที่มีอยู่สำหรับแต่ละออเดอร์
    3. ตรวจสอบว่ามีการบันทึก Ledger Movements อย่างถูกต้องสำหรับการยกเลิก

---

## 5. แผนการดำเนินงานกระบวนการ Delist (Trigger Mechanism)

กระบวนการ Delist ควรดำเนินการตามขั้นตอนดังนี้:
1.  **อัปเดต Database Flags**: ตั้งค่า `depositable = FALSE` และ `withdrawable = FALSE` สำหรับ Asset ที่ต้องการ
2.  **ยกเลิกออเดอร์ที่ค้างอยู่**: รัน Logic การยกเลิกแบบ Batch ที่พัฒนาในข้อ 4.3
3.  **ล้างข้อมูลราคา (Market Data)**: รันการลบข้อมูล Mark-to-Market ที่พัฒนาในข้อ 3.2
4.  **หยุดการดึงราคา**: ปิดการใช้งาน Asset นั้นในชุดคำสั่ง Price Fetcher (ถ้ามี)

---

## 6. กลยุทธ์การตรวจสอบและการทดสอบ

### 6.1 Unit Tests
- ทดสอบ `GetProductOnShelf` ร่วมกับ Flag ใหม่
- ทดสอบ `HandleDepositCryptoWebhook` เพื่อให้มั่นใจว่าข้ามการประมวลผลเมื่อ `Depositable = FALSE`
- ทดสอบ `CancelAllOrdersForAsset` โดยใช้ข้อมูล Mocked Repository

### 6.2 Integration Tests
- ตรวจสอบว่า Deposit Hook สำหรับสินทรัพย์ที่ Delist แล้ว จะไม่เพิ่มยอดเงินในบัญชีลูกค้า
- ตรวจสอบว่าออเดอร์ Limit ที่เปิดค้างอยู่ถูกยกเลิก และเงินที่ถูกล็อกไว้ถูกปลดล็อก (ถ้ามี) หลังจาก Delist
- ตรวจสอบว่าตาราง `mark-to-market` ถูกล้างข้อมูลสำหรับสินทรัพย์ที่ Delist แล้ว

---

## 7. ข้อกำหนดทาง UI/UX และ Platform (UI/UX & Platform Requirements)

### 7.1 พฤติกรรมของเหรียญที่ถูก Delist (Delisted Coin Behavior)
- **สถานะ Flag**: สำหรับเหรียญ Delist ให้ตั้งค่า `Transferable = FALSE`, `Depositable = FALSE` แต่ให้คง `Withdrawable = TRUE` เพื่อให้ลูกค้ายังสามารถถอนสินทรัพย์ที่เหลืออยู่ออกไปได้
- **ขอบเขต (Scope)**: การแยก Flag `Depositable` และ `Withdrawable` นี้จะใช้กับ **Digital Assets (Crypto) เท่านั้น** และจะไม่รวมถึงระบบ Fiat (เงินบาท)
- **Sale Channel**: เหรียญที่ Delist แล้วจะยังคงอยู่ใน Sale Channel เดิมเพื่อการแสดงผลประวัติและยอดคงเหลือ

### 7.2 การแสดงผลบน Mobile และ Web Trade
- **หน้าฝาก (Deposit)**: ห้ามแสดงเหรียญหรือต้องทำการ Disable ปุ่มฝากสำหรับเหรียญที่มีสถานะ `Depositable = FALSE`
- **หน้าถอน (Withdraw)**: ยังคงต้องแสดงเหรียญและอนุญาตให้ลูกค้าทำรายการถอนได้หาก `Withdrawable = TRUE`
- **หน้า Wallet/Portfolio**: แสดง Label หรือสัญลักษณ์ที่ชัดเจนสำหรับเหรียญที่ถูก Delist เพื่อแจ้งเตือนลูกค้า

### 7.3 ระบบหลังบ้าน (Back-Office - BOF)
- **หน้าจอจัดการสินค้า (Product Management)**: เพิ่มตัวเลือกให้ Admin สามารถปรับค่า `Depositable` และ `Withdrawable` แยกกันได้อิสระ
- **การตรวจสอบ**: ระบบต้องมีการบันทึก Audit Log ทุกครั้งที่มีการปรับเปลี่ยน Flag เหล่านี้

---

## 8. การบูรณาการร่วมกับ Dealer และ Remarketer (RM Integration)

- **บัญชี Dealer**: บัญชีประเภท Dealer (`customer_main`) จะมีพฤติกรรมการใช้งานในส่วนของ Swap, Deposit และ Withdraw **เหมือนกับลูกค้าทั่วไป (Customer)** โดยต้องผ่านการตรวจสอบ Flag เดียวกันทั้งหมด
- **การเชื่อมต่อ Remarketer (RM)**: เมื่อเหรียญถูกตั้งค่าเป็น Delist (Depositable/Withdrawable = FALSE) ระบบจะต้องระงับการส่งคำสั่ง Swap หรือการดึงราคาไปยัง RM ที่เกี่ยวข้องทันที
