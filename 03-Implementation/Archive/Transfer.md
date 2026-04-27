# Implementation Plan: Internal Customer Transfer (White Glove) - FINAL

  

## 1. Overview

สร้าง API สำหรับเจ้าหน้าที่ RM/Dealer เพื่อทำการโอนสินทรัพย์ระหว่างบัญชีลูกค้าโดยตรง (**Customer-to-Customer**) ภายใต้ Identification เดียวกัน แบบรายการเดียวต่อคำขอ และรองรับการข้ามการตรวจสอบยอดคงเหลือ (**Skip Balance Validation**) สำหรับบัญชีต้นทางที่กำหนดไว้ใน Config

  

---

  

## 2. API Specifications

  

### Endpoint

- **Method:** `POST`

- **Path:** `/api/v1/white-glove/transfer/internal`

- **Auth:** ใช้ Authentication/Authorization ผ่าน `PortalClaims` และตรวจสอบสิทธิ์ผ่าน Permission Key `constants.P0293` (ระดับเดียวกับ Dealer Transfer)

  

### Request Body (JSON)

```json

{

"identification_id": "UUID",

"source_customer_account_id": "UUID",

"destination_customer_account_id": "UUID",

"product_id": "UUID",

"quantity": "string (decimal)"

}

```

  

### Request Validation

- `identification_id` ต้องตรงกับทั้ง Source และ Destination Account (ตรวจสอบผ่าน `resolveCustomerAccount` ใน Service)

- ใช้ `OrderDealerTransferTypeTransferOut` (ค่าคงที่ที่มีค่าเป็น `"transfer_out"`) เป็นประเภทรายการ

  

### Response (JSON)

- **Success (200 OK):** รายการถูกประมวลผลสำเร็จ

- **Failure (400/500):** หากเกิดข้อผิดพลาดระบบจะ Rollback และคืน identifiers เท่าที่มี (`order_id`, `order_transfer_id`) แบบ best-effort

  

---

  

## 3. Configuration

- **Key:** `SKIP_BALANCE_VALIDATE_CUSTOMER_ACCOUNT_IDS`

- **Format:** Comma-separated string (e.g., `UUID1,UUID2`)

- **Logic:** ใน Service จะใช้ `strings.EqualFold` และ `strings.TrimSpace` ในการเปรียบเทียบเพื่อความ robust

  

---

  

## 4. Technical Logic (Service Layer)

  

### 4.1 Ledger Settlement Flow (Optimized Batch)

แยกฟังก์ชันจัดการ Ledger ออกมาใหม่เฉพาะสำหรับ Internal Transfer ใน `service_internal_ledger.go`:

  

1. **Hold Source:** (`internalTransferLogicalBatchHold`)

- กักยอดบัญชีต้นทาง: ลด Available และเพิ่ม Hold

2. **Combined Settle:** (`internalTransferLogicalBatchSettle`)

- ประมวลผลใน **1 Transaction (Batch)**:

- เพิ่มยอด Available ให้บัญชีปลายทาง

- ลดยอด Hold ของบัญชีต้นทาง (Release)

- **Kafka Produce Logic:**

- ส่ง `averageCost` เฉพาะใน Message ของฝั่ง **Destination (Increase Available)**

- ฝั่ง Source (Decrease Hold) ไม่ส่ง `averageCost` (`nil`)

3. **Rollback:** (`internalTransferLogicalBatchRevert`)

- หากขั้นตอน Settle ล้มเหลว: ลด Hold และเพิ่ม Available กลับคืนให้บัญชีต้นทาง

  

### 4.2 Observability & Audit

- **Repository:** เพิ่มเมธอด `UpdateStatus` ที่รับ `updated_by` และ `updated_by_name` เพื่อบันทึกประวัติผู้ปฏิบัติงานลงใน Database Row

- **Logging:** ใช้โครงสร้าง `logs.ErrorWithContext` แทน `fmt.Printf` สำหรับการแจ้งเตือนปัญหาในระดับ Terminal Status Update

- **Audit Log:** บันทึกผ่าน `auditLogWithdrawCryptoSvc.SaveAuditLog` ในระดับ Handler ทุกครั้ง

  

---

  

## 5. Affected Files & Structures

  

### Data Models

- **Service Layer:** `CreateInternalCustomerTransferInput/Output` ใน `pkg/order_transfer/service_input.go`

- **Handler Layer:** `CreateInternalCustomerTransferRequest/Response` ใน `handler/white_glove_dto.go`

  

### Core Service

- `pkg/order_transfer/service.go`: เมธอดหลัก `InternalCustomerTransfer` และ helper `isSourceAccountSkipped`

- `pkg/order_transfer/service_internal_ledger.go`: Logic การทำ Batch Settlement และ Helper `buildLedgerRequest` (ใช้ Parameter Struct เพื่อลดจำนวน Arguments)

  

### Repository

- `pkg/order_transfer/repository.go`: เพิ่มเมธอด `UpdateStatus` ใน Interface

- `storages/postgres/ordercryptorepository/order_transfer_repository.go`: Implementation ของ `UpdateStatus`

  

---

  

## 6. Security & Integrity ⚠️

1. **Financial Integrity:** ระบบใช้ Batch Transaction ในระดับ Ledger เพื่อป้องกันยอดเงินค้างอยู่ในสถานะ Hold

2. **Audit Trail:** ทุกการ Update Status จะบันทึกชื่อ Employee ที่ทำรายการเสมอ

3. **Strict Identification:** บังคับให้ Source และ Destination ต้องอยู่ภายใต้เจ้าของเดียวกัน (Identificationเดียวกัน) เท่านั้น