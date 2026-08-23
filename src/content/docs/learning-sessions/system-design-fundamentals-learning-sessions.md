---
title: System Design Fundamentals — Full Team Learning Session
description: เนื้อหาฉบับเต็มพร้อมแบบฝึกหัดเรื่อง Concurrency, Idempotency, Transactions, Kafka และ Payment Workflow
status: active
lastUpdated: 2026-08-23
documentType: developer-guide
aliases:
  - system design fundamentals
  - full system design learning
  - concurrency idempotency transactions
  - payment workflow learning
  - เรียนรู้ concurrency
  - แบบฝึกหัด system design
---

หน้านี้เก็บเนื้อหาฉบับเต็มจากบทความต้นฉบับไว้ในหน้าเดียว และเพิ่มแบบฝึกหัดท้ายเนื้อหาเพื่อใช้เรียนเป็นกลุ่มหรือทบทวนด้วยตัวเอง แบบฝึกหัดควรทำก่อนอ่าน Cheat Sheet เพื่อให้เกิดการดึงความรู้จากความจำ ไม่ใช่เพียงอ่านผ่าน

---

บทความนี้สรุปสิ่งที่เรียนรู้เกี่ยวกับการออกแบบระบบที่เกี่ยวข้องกับ **Order, Deposit, Withdrawal, Payment, Ledger และ Kafka** โดยโฟกัสที่ปัญหาที่มักเกิดใน Production เช่น Race Condition, Duplicate Request, Double Credit, Overspending, Database + Kafka Dual Write และการ Recover เมื่อระบบล้มกลางทาง

เป้าหมายไม่ใช่จำว่า Pattern ไหนคือ Best Practice แต่คือสามารถตอบได้ว่า:

> Business Invariant คืออะไร, Failure เกิดตรงไหนได้, และเราจะใช้กลไกอะไรเพื่อรักษา Correctness โดยไม่เพิ่ม Complexity เกินความจำเป็น

---

# 1. จุดเริ่มต้นของ System Design: Business Invariant

ก่อนเลือกว่าจะใช้ Kafka, Lock, Transaction หรือ Outbox ต้องตอบก่อนว่า:

> สิ่งใดที่ระบบ “ห้ามผิดเด็ดขาด”

สิ่งนี้เรียกว่า **Business Invariant**

ตัวอย่างในระบบการเงิน:

```text
Bank Transaction หนึ่งรายการ
ต้อง Credit เงินให้ลูกค้าได้ไม่เกินหนึ่งครั้ง
```

```text
Withdrawal หนึ่งรายการ
ต้อง Reserve เงินได้ไม่เกินหนึ่งครั้ง
```

```text
Available Balance

ต้องไม่ติดลบ
```

```text
Order ที่ COMPLETED แล้ว
ต้องไม่ย้อนกลับเป็น PENDING หรือ CANCELLED ตรง ๆ
```

การออกแบบ Concurrency หรือ Transaction ทั้งหมดมีหน้าที่รักษา Invariant เหล่านี้

---

# 2. Deposit Order และ Bank Webhook

Flow ปกติของ Deposit:

```text
Customer
   |
   | POST /deposit-orders
   v
Deposit Service
   |
   | Create Order
   v
Database
   |
   | Return payment reference / QR
   v
Customer
   |
   | Pay
   v
Bank
   |
   | Webhook
   v
Deposit Service
```

ข้อมูลสำคัญควรมีหน้าที่แยกกันชัดเจน

```text
order_id
= Identity ของ Order ภายในระบบ

payment_reference
= ใช้ Match Bank Webhook กับ Order

bank_transaction_id
= Identity ของ Transaction ฝั่งธนาคาร
  และใช้ป้องกัน Transaction เดิมถูก Process ซ้ำ
```

ตัวอย่าง:

```text
order_id            = DEP-10001
payment_reference   = PAY-X8K29P
bank_transaction_id = KTB-987654321
```

ไม่ควรใช้ Amount + Time หรือชื่อผู้โอนเป็นตัว Match หลัก เพราะอาจมีหลาย Transaction ที่ข้อมูลเหมือนกันได้

---

# 3. Webhook สามารถมาก่อน Order ได้หรือไม่

ใน Business Flow ปกติ **ไม่ควรเกิด**

เพราะต้อง:

```text
Create Order
→ Commit Order
→ คืนข้อมูล Payment
→ Customer จ่าย
→ Bank ส่ง Webhook
```

ดังนั้น Webhook ที่ถูกต้องควรเกิดหลังจาก Order ถูกสร้างแล้ว

แต่ใน Distributed System อาจเกิดสถานการณ์ที่:

> Webhook Handler หา Order ไม่เจอ

แม้จริง ๆ Order จะถูกสร้างไปแล้ว

ตัวอย่างสาเหตุ:

* Order ยัง Commit ไม่เสร็จ
* Webhook อ่านจาก Read Replica ที่ Replication ยังไม่ทัน
* Order และ Webhook อยู่คนละ Service
* Event ที่ใช้ Sync Order ยังมาไม่ถึง
* Bank Payment ถูกสร้างสำเร็จ แต่ระบบเราบันทึก Order ล้มเหลว
* Webhook เป็นรายการเก่า
* Reference จาก Bank ผิด

ดังนั้นระบบ Production ไม่ควรเขียน:

```text
Order not found
→ ทิ้ง Webhook
```

ควรมีแนวทางเช่น:

```text
UNMATCHED
PENDING_RECONCILIATION
MANUAL_REVIEW
```

แล้วมี Retry หรือ Reconciliation ตาม Business Requirement

---

# 4. Shared Mutable State

จุดที่มีโอกาสเกิด Concurrency มักเกี่ยวกับข้อมูลที่เรียกว่า:

**Shared Mutable State**

คือข้อมูลที่:

1. หลาย Request / Worker / Pod เข้าถึงได้
2. ข้อมูลเปลี่ยนแปลงได้

ตัวอย่าง:

```text
order.status
account.available_balance
account.reserved_balance
daily_limit_used
inventory.available_quantity
bank_transaction_id
job.status
```

ก่อนเขียน Code ให้ถามว่า:

> ถ้า Code นี้ถูก Execute พร้อมกันสองครั้ง ผลลัพธ์ยังถูกต้องหรือไม่?

ถ้าคำตอบคือ "อาจไม่ถูก" ต้องออกแบบ Concurrency Control

---

# 5. จะรู้ได้อย่างไรว่าจุดไหนต้องคิดเรื่อง Concurrency

ใช้คำถาม 6 ข้อนี้:

1. Request เดิมถูกส่งซ้ำได้หรือไม่
2. มีหลาย Pod หรือ Worker ทำ Operation เดียวกันได้หรือไม่
3. มีหลาย Flow แก้ Entity เดียวกันหรือไม่
4. มีการอ่านค่าปัจจุบันแล้วคำนวณค่าใหม่หรือไม่
5. Operation นี้ต้องเกิดได้เพียงครั้งเดียวหรือไม่
6. ลำดับของ Event มีผลกับ Correctness หรือไม่

ตัวอย่าง Actor ที่อาจแก้ Order เดียวกัน:

```text
Bank Webhook
Customer Request
Backoffice
Expiry Job
Reconciliation Worker
Kafka Consumer
Scheduled Job
```

ถึง Code แต่ละส่วนจะอยู่คนละ Service แต่สามารถเกิด Race Condition บนข้อมูลเดียวกันได้

---

# 6. Check-Then-Act Race Condition

รูปแบบทั่วไป:

```text
Check
→ ถ้าเงื่อนไขผ่าน
→ Act
```

ตัวอย่าง:

```go
order, err := repo.GetOrder(ctx, orderID)
if err != nil {
    return err
}

if order.Status == StatusPending {
    return repo.UpdateStatus(
        ctx,
        orderID,
        StatusProcessing,
    )
}
```

ดูเหมือนถูก แต่มี Race Condition

สมมติมีสอง Pod:

```text
Pod A: SELECT → PENDING
Pod B: SELECT → PENDING

Pod A: UPDATE → PROCESSING
Pod B: UPDATE → PROCESSING
```

ทั้งสอง Request ผ่าน Check จากข้อมูลเดิม

ปัญหานี้เรียกว่า:

**Check-Then-Act Race Condition**

หรือบางบริบทเรียกว่า:

**TOCTOU — Time Of Check To Time Of Use**

---

# 7. Check-Then-Act ไม่ได้ผิดเสมอไป

สิ่งสำคัญคือข้อมูลที่ Check เป็นข้อมูลประเภทไหน

## Local Request Validation

เช่น:

```go
if input.Amount <= 0 {
    return ErrInvalidAmount
}
```

ไม่มีปัญหา Concurrency เพราะ Request อื่นเปลี่ยน `input.Amount` ของ Request นี้ไม่ได้

---

## Reference / Master Data

เช่น:

```text
Currency Code มีหรือไม่
Bank Code ถูกต้องหรือไม่
Product รองรับ Currency หรือไม่
```

โดยทั่วไปไม่จำเป็นต้อง Lock หากข้อมูล:

* เปลี่ยนไม่บ่อย
* และ Business ยอมรับ Request ที่เริ่มก่อน Master เปลี่ยนได้

ตัวอย่าง:

```go
currency := getCurrency(input.Currency)

if !currency.Enabled {
    return ErrCurrencyDisabled
}
```

---

## Shared Mutable State

เช่น:

```text
Order ยัง PENDING หรือไม่
Balance เพียงพอหรือไม่
Stock ยังเหลือหรือไม่
Customer ยัง ACTIVE หรือไม่
Daily Limit ยังเหลือหรือไม่
```

ตรงนี้ต้องคิดเรื่อง Concurrency เพราะค่าที่เราอ่านสามารถเปลี่ยนก่อนที่เราจะ Act

---

# 8. Atomic Conditional Update

หาก Logic เป็น State Transition ง่าย ๆ วิธีที่เหมาะมากคือ:

**รวม Check และ Act เป็น SQL Statement เดียว**

จากเดิม:

```text
SELECT status
→ if PENDING
→ UPDATE
```

เปลี่ยนเป็น:

```sql
UPDATE deposit_orders
SET status = 'PROCESSING',
    bank_transaction_id = :transaction_id,
    updated_at = NOW()
WHERE id = :order_id
  AND status = 'PENDING';
```

แล้วตรวจ:

```text
RowsAffected = 1
→ Request นี้ชนะ

RowsAffected = 0
→ ไม่ผ่านเงื่อนไข
```

สิ่งนี้เป็น Atomic Operation ในระดับ Database Statement

---

# 9. ทำไม Atomic Update ป้องกัน Race ได้

สมมติ Order เริ่มต้น:

```text
status = PENDING
```

มีสอง Pod เรียกพร้อมกัน

```text
Pod A                          Pod B

UPDATE ...                    UPDATE ...
WHERE status=PENDING          WHERE status=PENDING

ได้ Row Lock                  รอ

status → PROCESSING
RowsAffected = 1

COMMIT
                               Database ตรวจ
                               WHERE ใหม่

                               status != PENDING

                               RowsAffected = 0
```

สุดท้ายมีเพียง Request เดียวได้สิทธิ์ Process ต่อ

นี่คือแนวคิด:

**Compare-and-Set**

```text
เปลี่ยนเป็น X
เฉพาะเมื่อค่าปัจจุบันยังเป็น Y
```

---

# 10. Atomic Update สามารถ Check หลายค่าได้

ไม่จำเป็นต้องใช้ `SELECT FOR UPDATE` เพียงเพราะมีหลาย Validation

ตัวอย่าง:

```sql
UPDATE deposit_orders
SET status = 'PROCESSING',
    bank_transaction_id = :transaction_id,
    updated_at = NOW()
WHERE payment_reference = :payment_reference
  AND status = 'PENDING'
  AND expected_amount = :amount
  AND currency = :currency
  AND expires_at > NOW()
  AND bank_transaction_id IS NULL;
```

เราสามารถ Check:

```text
Status
Amount
Currency
Expiry
Transaction
Version
Flag
```

ได้ใน Atomic Operation เดียว

PostgreSQL ยังใช้ `RETURNING` ได้:

```sql
UPDATE deposit_orders
SET status = 'PROCESSING'
WHERE payment_reference = :payment_reference
  AND status = 'PENDING'
RETURNING
    id,
    customer_id,
    expected_amount,
    currency;
```

ทำให้ไม่จำเป็นต้อง SELECT ก่อนเพื่อเอาข้อมูลบางส่วน

---

# 11. ข้อจำกัดของ RowsAffected

`RowsAffected = 0` บอกเพียงว่า:

> ไม่มี Row ที่ Match ทุกเงื่อนไข

แต่มันไม่บอกว่าเพราะอะไร

อาจเป็น:

```text
Order ไม่พบ
Order COMPLETED แล้ว
Order CANCELLED แล้ว
Order หมดอายุ
Amount ไม่ตรง
Currency ไม่ตรง
Transaction ถูกใช้แล้ว
Concurrent Request ชนะไปแล้ว
```

Pattern ที่ดีคือ:

```text
Atomic UPDATE
     |
RowsAffected = 0
     |
SELECT current state
     |
Classify result
```

หลักการ:

> UPDATE ใช้รักษา Correctness
> SELECT หลังจากนั้นใช้เพื่ออธิบาย Error

---

# 12. SELECT FOR UPDATE

อีกวิธีคือ Pessimistic Lock

```sql
BEGIN;

SELECT *
FROM deposit_orders
WHERE id = :order_id
FOR UPDATE;

-- Validate
-- Calculate
-- Update

COMMIT;
```

เมื่อ Transaction A ได้ Lock แล้ว:

```text
Transaction A
SELECT FOR UPDATE
→ ได้ Lock
```

Transaction B ที่พยายาม Lock หรือ Update Row เดียวกัน:

```text
Transaction B
→ รอ
```

Lock จะถูกปล่อยเมื่อ:

```text
COMMIT
หรือ
ROLLBACK
```

---

# 13. SELECT FOR UPDATE ใช้เมื่อไหร่

เหมาะเมื่อ Logic ต้องทำ **Read-Modify-Write** ที่ซับซ้อน เช่น:

```text
อ่านยอดปัจจุบัน
อ่าน Limit
อ่าน Reservation
คำนวณ
Validate หลาย Rule
Update หลาย Row
```

ตัวอย่าง:

```text
paid_amount ปัจจุบัน
+
payment_amount ใหม่
<=
expected_amount
```

หรือ:

```text
Check Balance
Check Daily Limit
Check Account Status
Create Reservation
Update Ledger
```

ถ้า Logic ทั้งหมดเขียนเป็น `UPDATE ... WHERE ...` ได้ง่าย Atomic Update มักเหมาะกว่า

---

# 14. Atomic Update vs SELECT FOR UPDATE

| Situation                   | Recommended              |
| --------------------------- | ------------------------ |
| State Transition ง่าย       | Atomic Update            |
| Worker หลายตัว Claim งาน    | Atomic Update            |
| Check Amount/Status แบบง่าย | Atomic Update            |
| Read-Modify-Write ซับซ้อน   | SELECT FOR UPDATE        |
| ต้องคำนวณหลายค่า            | SELECT FOR UPDATE        |
| ต้อง Lock หลาย Row          | SELECT FOR UPDATE        |
| Conflict น้อย               | Optimistic Lock อาจเหมาะ |

หลักจำง่าย:

```text
Condition เขียนใน WHERE ได้
→ Atomic UPDATE

ต้องอ่านแล้วคำนวณก่อน
→ SELECT FOR UPDATE
```

---

# 15. Optimistic Locking

อีกวิธีคือใช้ Version

Database:

```text
status  = PENDING
version = 5
```

Update:

```sql
UPDATE orders
SET status = 'COMPLETED',
    version = version + 1
WHERE id = :order_id
  AND version = 5;
```

ถ้า Request A ชนะ:

```text
version = 6
```

Request B ที่ยังใช้:

```text
WHERE version = 5
```

จะ:

```text
RowsAffected = 0
```

Optimistic Lock เหมาะเมื่อ:

* Conflict ไม่เกิดบ่อย
* ไม่อยากให้ Request รอกัน
* สามารถ Retry ได้

---

# 16. Database Transaction

Atomic Status Update ป้องกันการ Claim งานพร้อมกัน แต่ไม่ได้ทำให้ Workflow ทั้งหมด Atomic

ตัวอย่างที่ผิด:

```text
1. PENDING → PROCESSING
2. COMMIT
3. Insert Ledger
4. Service Crash
```

ผล:

```text
Order = PROCESSING
Ledger = ไม่มี
```

ถ้า Order และ Ledger อยู่ Database เดียวกัน ควรทำใน Transaction:

```sql
BEGIN;

UPDATE orders
SET status = 'PROCESSING'
WHERE id = :order_id
  AND status = 'PENDING';

INSERT INTO ledger_entries (...);

UPDATE orders
SET status = 'COMPLETED'
WHERE id = :order_id
  AND status = 'PROCESSING';

COMMIT;
```

ถ้า Ledger Insert ล้มเหลว:

```text
ROLLBACK
```

Order จะไม่ค้างกลางทาง

---

# 17. ไม่จำเป็นต้องมี PROCESSING เสมอไป

หากทุกอย่างทำได้ใน Transaction สั้น ๆ:

```text
PENDING
→ COMPLETED
```

ตรงได้เลย

```sql
BEGIN;

UPDATE orders
SET status = 'COMPLETED'
WHERE id = :id
  AND status = 'PENDING';

INSERT INTO ledger_entries (...);

COMMIT;
```

`PROCESSING` เหมาะเมื่อ:

* Workflow ยาว
* มี External Service
* Async Processing
* ต้องให้ระบบอื่นเห็นว่ากำลังทำงาน
* ต้องมี Retry / Recovery

ถ้ามี `PROCESSING` ต้องคิดต่อเสมอว่า:

> ถ้า Process Crash แล้ว Status ค้าง PROCESSING ใคร Recover?

อาจต้องมี:

```text
processing_started_at
retry_count
last_error
reconciliation worker
```

---

# 18. Unique Constraint

Application Check อย่างเดียวไม่เพียงพอในระบบ Concurrent

ตัวอย่างที่ไม่พอ:

```text
SELECT transaction
→ ไม่พบ
→ INSERT
```

สอง Request อาจ SELECT ไม่พบพร้อมกัน

ดังนั้น Database ต้องช่วย Enforce Invariant

ตัวอย่าง Bank Transaction:

```sql
CREATE UNIQUE INDEX uq_bank_transaction
ON deposit_orders(
    bank_code,
    bank_transaction_id
)
WHERE bank_transaction_id IS NOT NULL;
```

Ledger:

```sql
CREATE UNIQUE INDEX uq_deposit_credit
ON ledger_entries(
    reference_type,
    reference_id,
    entry_type
);
```

หลักสำคัญ:

```text
Atomic Update
= ป้องกัน Concurrent Processing

Unique Constraint
= ป้องกัน Duplicate Business Effect

Transaction
= ทำให้หลาย Operation สำเร็จพร้อมกัน
```

---

# 19. Idempotency

Idempotency ไม่ได้แปลว่าไม่มี Duplicate Request

แต่หมายถึง:

> Request จะเข้ามาซ้ำกี่ครั้ง ผลทางธุรกิจต้องเหมือน Process สำเร็จครั้งเดียว

Webhook:

```text
ครั้งที่ 1 → Credit 10,000
ครั้งที่ 2 → ไม่ Credit ซ้ำ
ครั้งที่ 3 → ไม่ Credit ซ้ำ
```

ผลสุดท้าย:

```text
Balance เพิ่ม 10,000
```

ไม่ใช่:

```text
30,000
```

---

# 20. Duplicate Webhook ทำไมควรตอบ 200

เกิดเหตุการณ์นี้ได้:

```text
Webhook
→ ระบบ Process สำเร็จ
→ DB COMMIT
→ ส่ง HTTP 200
→ Network ขาด
```

Bank ไม่ได้รับ 200 จึง Retry

ระบบรับ Request ใหม่พบว่า Transaction เดิม Process แล้ว

ควรตอบ:

```http
200 OK
```

เพราะผลทางธุรกิจสำเร็จไปแล้ว

ไม่ควรตอบ 500 เพียงเพราะพบ Duplicate เพราะ Bank อาจ Retry ต่อไปเรื่อย ๆ

---

# 21. Order State Machine

ไม่ควรให้ทุก Status เปลี่ยนไปหา Status ใดก็ได้

ตัวอย่าง:

```text
CREATED
   ↓
PENDING
   ↓
PROCESSING
   ↓
COMPLETED
```

และ:

```text
PENDING → CANCELLED
PENDING → EXPIRED
```

แต่ไม่ควร:

```text
COMPLETED → PENDING
COMPLETED → CANCELLED
```

หากต้องย้อนธุรกรรม ใช้ Flow ใหม่:

```text
REVERSAL
REFUND
COMPENSATION
```

ไม่ใช่แก้ History ย้อนกลับตรง ๆ

Atomic State Transition:

```sql
UPDATE orders
SET status = 'CANCELLED'
WHERE id = :id
  AND status IN ('CREATED', 'PENDING');
```

---

# 22. Withdrawal และ Balance Race Condition

สมมติ:

```text
Available Balance = 10,000
```

ลูกค้าถอนพร้อมกัน:

```text
Withdrawal A = 8,000
Withdrawal B = 8,000
```

ถ้า Code เป็น:

```text
A อ่าน Balance → 10,000
B อ่าน Balance → 10,000

A: 10,000 >= 8,000 → ผ่าน
B: 10,000 >= 8,000 → ผ่าน
```

ลูกค้าอาจถอนรวม:

```text
16,000
```

ทั้งที่มี 10,000

นี่คือ Concurrency Bug ที่รุนแรง

---

# 23. วิธีใช้ SELECT FOR UPDATE กับ Balance

```sql
BEGIN;

SELECT available_balance
FROM account_balances
WHERE account_id = :account_id
  AND currency = :currency
FOR UPDATE;
```

จากนั้น:

```text
ตรวจ Balance
Reserve เงิน
Update Balance
Insert Withdrawal
COMMIT
```

Timeline:

```text
Withdrawal A
→ Lock Balance
→ อ่าน 10,000
→ Reserve 8,000
→ COMMIT

Withdrawal B
→ รอ Lock
→ อ่าน Balance ใหม่ 2,000
→ Reject
```

ปลอดภัยจาก Double Spending

---

# 24. Atomic Balance Update

ถ้า Logic ง่าย อาจไม่ต้อง `SELECT FOR UPDATE`

```sql
UPDATE account_balances
SET available_balance = available_balance - :amount,
    reserved_balance = reserved_balance + :amount
WHERE account_id = :account_id
  AND currency = :currency
  AND available_balance >= :amount;
```

ตรวจ:

```text
RowsAffected = 1
→ Reserve สำเร็จ

RowsAffected = 0
→ Balance ไม่พอ หรือ Account ไม่พบ
```

นี่เป็น Atomic Balance Reservation

เหมาะเมื่อ Rule ค่อนข้างตรงไปตรงมา

---

# 25. Fund Reservation

ระบบ Withdrawal ที่ดีไม่ควรถือ Database Lock ระหว่างเรียก Bank API

สมมติ:

```text
Available = 10,000
Reserved  = 0
```

ลูกค้าถอน:

```text
8,000
```

หลัง Reserve:

```text
Available = 2,000
Reserved  = 8,000
```

จากนั้น Commit Transaction และปล่อย Lock

ค่อยเรียก Bank ภายหลัง

หาก Payout สำเร็จ:

```text
Reserved ลดลง
Withdrawal → COMPLETED
```

หากล้มเหลวถาวร:

```text
Reserved ลดลง
Available เพิ่มกลับ
Withdrawal → FAILED
```

ข้อดีคือไม่ต้องถือ Lock 5–10 วินาทีเพื่อรอ External Service

---

# 26. ไม่ควรถือ Database Lock ระหว่างเรียก External API

Anti-Pattern:

```text
BEGIN
SELECT FOR UPDATE

Call Bank API
รอ 10 วินาที

UPDATE
COMMIT
```

ตลอด 10 วินาที Row ยังถูก Lock

ผลกระทบ:

* Request อื่นรอ
* Throughput ลด
* Connection Pool เต็ม
* Lock Timeout
* Deadlock Risk สูงขึ้น

Transaction ควรสั้น:

```text
BEGIN
Lock
Validate
Insert / Update
COMMIT
```

แล้วค่อยทำ External Work

---

# 27. Kafka ไม่ได้ป้องกัน Balance Race Condition

เดิม Withdrawal อาจเป็น:

```text
Order Service
     |
     v
   Kafka
     |
     v
Withdrawal Consumer
     |
     v
Check Balance
```

Kafka ช่วยให้ Request ถูก Process แบบ Async แต่ Kafka ไม่ได้ทำให้:

```text
Check Balance
+
Reserve Balance
```

ปลอดภัยเอง

Correctness ยังต้องมาจาก:

```text
Atomic Update
Row Lock
Transaction
Unique Constraint
Idempotency
```

Kafka มีหน้าที่คนละเรื่อง

---

# 28. Kafka เหมาะกับอะไร

Kafka เหมาะเมื่อ:

* Downstream ไม่ต้องเสร็จก่อนตอบ Client
* ต้อง Fan-out Event ไปหลาย Consumer
* ต้อง Buffer Traffic Spike
* ต้องการ Durable Retry
* ต้องการ Decouple Producer และ Consumer
* Workflow ทำงานแบบ Async
* หลายระบบสนใจ Domain Event เดียวกัน

ตัวอย่าง:

```text
Withdrawal RESERVED
        |
        v
      Kafka
      /   \
 Payout   Notification
```

---

# 29. Kafka ไม่ควรใช้เพียงเพราะเป็น Microservice

ถ้า Flow ต้องการ Response ทันที:

```text
Order Service
→ Customer Service
→ ตรวจ Eligibility
```

REST/gRPC อาจตรงกว่า

การทำ:

```text
Order
→ Kafka
→ Customer Consumer
→ Kafka
→ Order
```

อาจเพิ่ม:

* Eventual Consistency
* Duplicate
* Retry
* Ordering
* Observability Complexity

โดยไม่ได้ประโยชน์จริง

หลักสำคัญ:

> อย่าใช้ Kafka เพราะ “บริษัทมี Kafka”
> ให้ถามก่อนว่า “ทำไม Operation นี้ต้อง Async?”

---

# 30. Kafka กับ Database Transaction เป็นคนละหน้าที่

จำง่าย ๆ:

```text
Database Transaction
= รักษา Business Correctness

Kafka
= ขนส่งและจัด Workflow แบบ Async
```

ตัวอย่าง Withdrawal:

```text
POST /withdrawals
       |
       v
Withdrawal Service
       |
       | DB Transaction
       | - Check/Reserve Balance
       | - Create Withdrawal
       v
    RESERVED
       |
       v
     Kafka
       |
       v
Payout Processor
       |
       v
Bank API
```

Database ดูแลเงิน

Kafka ดูแล Workflow

---

# 31. Dual Write Problem

ปัญหาเกิดเมื่อ Operation เดียวต้อง:

```text
1. Update Database
2. Produce Kafka
```

สองอย่างนี้ไม่ได้อยู่ใน Transaction เดียวกัน

กรณี:

```text
DB Commit ✅
Service Crash
Kafka Produce ❌
```

จะเกิด:

```text
Database มี State ใหม่
แต่ Downstream ไม่รู้
```

สลับลำดับก็มีปัญหา:

```text
Kafka Produce ✅
DB Update ❌
```

Consumer อาจ Process Event ที่ไม่มี State จริงใน Database

นี่คือ:

**Dual Write Problem**

---

# 32. Transactional Outbox

Outbox แก้ Dual Write ด้วยการไม่ Produce Kafka ใน Request โดยตรง

ภายใน DB Transaction:

```sql
BEGIN;

UPDATE withdrawals
SET status = 'RESERVED'
WHERE id = :withdrawal_id;

INSERT INTO outbox_events (
    event_type,
    aggregate_id,
    payload
)
VALUES (
    'WithdrawalReserved',
    :withdrawal_id,
    :payload
);

COMMIT;
```

ตอนนี้:

```text
Business State
+
Intent to Publish Event
```

ถูก Commit พร้อมกัน

จากนั้น:

```text
Outbox Worker
หรือ
CDC / Debezium
```

อ่าน Event แล้ว Produce Kafka ภายหลัง

---

# 33. Outbox ไม่ได้หมายความว่า Exactly Once

เกิดเหตุการณ์นี้ได้:

```text
Outbox Worker
→ Produce Kafka สำเร็จ
→ Crash ก่อน Mark SENT
```

เมื่อ Restart:

```text
Publish Event เดิมอีกครั้ง
```

ดังนั้น Outbox มักเป็น:

**At-Least-Once Delivery**

Consumer ยังต้อง Idempotent

เช่น:

```sql
UNIQUE (
    consumer_name,
    event_id
)
```

หรือ Business Constraint เช่น:

```sql
UNIQUE (
    withdrawal_id,
    entry_type
)
```

---

# 34. บริษัทไม่ได้ใช้ Outbox ถือว่าผิดไหม

ไม่ผิดทันที

ระบบอาจใช้:

```text
DB Commit
→ Produce Kafka
```

แต่มี Recovery Strategy เช่น:

* Retry
* Reconciliation Job
* Manual Replay
* Admin Retry Endpoint
* Scheduled Recovery Worker
* Kafka-first architecture

สิ่งสำคัญคือ:

> ถ้า DB Commit สำเร็จ แต่ Kafka Event หาย ระบบ Recover อย่างไร?

ถ้ามีคำตอบที่รับ Business Requirement ได้ Architecture ก็อาจเพียงพอ

---

# 35. Manual Recovery / Case-by-Case

หลายระบบ Production ใช้วิธี:

```text
Transaction ค้าง
→ Alert / User Report
→ Developer ตรวจ
→ Reproduce
→ Replay
```

เช่น:

```text
Withdrawal = RESERVED
แต่ไม่มี Event ไป Payout
```

อาจมี:

```text
/internal/withdrawals/{id}/retry
```

หรือ SQL หา Transaction ค้าง

```sql
SELECT *
FROM withdrawals
WHERE status = 'RESERVED'
  AND updated_at < NOW() - INTERVAL '10 minutes';
```

นี่คือ Recovery Strategy เช่นกัน

เพียงแต่แลก:

```text
Architecture Complexity ต่ำ
```

กับ:

```text
Operational Complexity สูง
```

---

# 36. เมื่อไหร่ควรพิจารณา Outbox มากขึ้น

สัญญาณ เช่น:

* Transaction ค้างบ่อย
* ต้อง Replay ด้วยมือบ่อย
* Event หายแล้วไม่มีใครรู้
* Volume สูงจน Manual Recovery ไม่ไหว
* Incident เกี่ยวข้องกับเงินจริง
* Developer ต้องเข้าไปแก้ DB บ่อย
* ต้อง Guarantee ว่า State Change จะมี Event ตามไปเสมอ

ตอนนั้น Automatic Recovery เช่น Outbox หรือ Reconciliation Worker จะมี Value สูงขึ้น

---

# 37. Outbox ไม่ได้ต้องใช้ทุก Event

สำหรับ Event เช่น:

```text
Analytics
Clickstream
Telemetry
Non-critical notification
```

บางระบบอาจยอมรับ Event Loss เล็กน้อยได้

Direct Produce อาจง่ายกว่า

แต่ Event เช่น:

```text
WithdrawalReserved
DepositCompleted
LedgerPosted
PaymentConfirmed
```

มีผลต่อ Business Correctness สูง จึงควรคิดเรื่อง Durable Delivery จริงจังมากกว่า

---

# 38. Decision Guide

| Problem                                      | Preferred Tool                    |
| -------------------------------------------- | --------------------------------- |
| Local Request Validation                     | Normal validation                 |
| Reference Data Validation                    | SELECT / Cache                    |
| Simple State Transition                      | Atomic UPDATE                     |
| Multiple Workers Claim Same Job              | Conditional Update + RowsAffected |
| Complex Read-Modify-Write                    | SELECT FOR UPDATE                 |
| Rare Conflict                                | Optimistic Lock                   |
| Multiple DB Operations Must Succeed Together | Transaction                       |
| Duplicate Business Effect Forbidden          | Unique Constraint                 |
| Request/Event Can Retry                      | Idempotency                       |
| Long External Workflow                       | Durable State + Retry             |
| Payment Waiting External Service             | Fund Reservation                  |
| DB + Kafka Must Stay Consistent              | Outbox / CDC / Reconciliation     |
| Async Fan-out                                | Kafka                             |
| Immediate Request-Response                   | REST / gRPC                       |

---

# 39. Anti-Patterns ที่ควรระวัง

## SELECT แล้ว UPDATE แยกกันโดยไม่มี Concurrency Control

```text
SELECT status
if PENDING
UPDATE
```

เสี่ยง Check-Then-Act Race

---

## SELECT Duplicate แล้ว INSERT โดยไม่มี Unique Constraint

```text
SELECT transaction
ไม่พบ
INSERT
```

สอง Request อาจไม่พบพร้อมกัน

---

## ถือ Lock แล้ว Call External API

ทำให้ Transaction และ Lock ยาวเกินไป

---

## คิดว่า Kafka Serialization ป้องกัน Balance ได้ทั้งหมด

Correctness ของเงินควรถูก Enforce ที่ Database / Ledger

---

## Ack Kafka ก่อน DB Commit

ถ้า DB Fail หลัง Ack Message อาจหายจาก Processing Flow

---

## มี PROCESSING แต่ไม่มี Recovery

Pod Crash แล้ว Transaction อาจค้างตลอดไป

---

## Direct DB + Kafka Dual Write แต่ไม่มี Recovery

Event อาจหายโดยไม่มีระบบตรวจพบ

---

## Application Mutex สำหรับหลาย Pod

```go
sync.Mutex
```

ป้องกันได้แค่ Process เดียว

ไม่สามารถป้องกัน Pod อื่นได้

---

# 40. Mental Model สำหรับ Code Review

เวลาตรวจ Code ให้ถาม:

## Concurrency

```text
ถ้า Method นี้ถูกเรียกพร้อมกัน 2 ครั้ง จะเกิดอะไรขึ้น?
```

## Idempotency

```text
ถ้า Request/Event เดิมถูก Retry จะเกิด Business Effect ซ้ำไหม?
```

## Transaction

```text
ถ้าล้มหลัง Statement ที่ 2 แต่ก่อน Statement ที่ 3 ข้อมูลจะอยู่สภาพไหน?
```

## Lock

```text
ต้อง Read-Modify-Write หรือเปล่า?
ถ้าใช้ Lock ถือไว้นานแค่ไหน?
```

## State Machine

```text
Transition นี้อนุญาตจาก Status ไหน?
```

## Kafka

```text
ทำไม Operation นี้ต้อง Async?
```

## Dual Write

```text
DB Commit แล้ว Event ไม่ถูก Publish จะ Recover อย่างไร?
```

## Recovery

```text
ถ้า Process Crash ตอนนี้ ใครจะเอางานกลับมาทำต่อ?
```

---

# 41. มุมมองระดับ Staff Engineer

Senior Engineer อาจถามว่า:

> ใช้ Outbox ดีไหม?

Staff Engineer ควรถามก่อนว่า:

> Failure ที่เราพยายามแก้คืออะไร?

จากนั้นวิเคราะห์:

```text
Business Invariant
       ↓
Concurrent Actors
       ↓
Failure Scenarios
       ↓
Business Impact
       ↓
Current Recovery
       ↓
Options
 ┌─────┼─────────┐
Atomic Lock     Outbox
Update          Kafka
       ↓
Trade-offs
       ↓
Decision
```

อย่าเริ่มจาก Pattern

เริ่มจาก Problem

---

# 42. สิ่งที่ควรถามทุกครั้งก่อนจบ System Design

1. Source of Truth อยู่ที่ไหน
2. Business Invariant คืออะไร
3. Shared Mutable State อยู่ตรงไหน
4. Actor ใดเข้าถึงข้อมูลเดียวกันได้
5. Request หรือ Event ไหน Retry ได้
6. Operation ใดต้อง Idempotent
7. State Transition ไหนอนุญาต
8. ส่วนใดต้อง Strong Consistency
9. Failure เกิดตรงไหนได้
10. ถ้า Service Crash จะ Recover อย่างไร
11. Database Enforce Invariant ด้วยอะไร
12. มี Reconciliation หรือไม่
13. Event สามารถ Duplicate หรือ Out-of-order ได้ไหม
14. Observability จะตรวจ Transaction ค้างอย่างไร
15. Complexity ที่เพิ่มขึ้นคุ้มกับ Risk หรือไม่

---

# Learning Exercises

แบบฝึกหัดชุดนี้แบ่งตามลำดับความคิดของบทความ แต่ยังอยู่ในหน้าเดียวกันทั้งหมด ให้เขียนคำตอบลงในกระดาษหรือเอกสาร Review ก่อนกลับไปตรวจหัวข้อด้านบน

## Exercise 1 — Invariant และ Failure Matrix

เลือกหนึ่ง Flow: Deposit Webhook, Withdrawal หรือ Payment Callback แล้วเติมตารางนี้:

| คำถาม | คำตอบของฉัน/ทีม |
| :--- | :--- |
| Business Invariant ที่ห้ามผิด |  |
| Source of Truth |  |
| Authoritative Writer |  |
| Actor ที่เขียนข้อมูลได้ |  |
| Shared Mutable State |  |
| Request/Event ที่อาจซ้ำ |  |
| Failure ที่เกิดก่อน Commit |  |
| Failure ที่เกิดหลัง Commit |  |
| วิธีตรวจพบและกู้คืน |  |

### ผ่านเมื่อ

- เขียน Invariant เป็นประโยคที่ตรวจสอบได้ ไม่ใช่คำกว้างอย่าง “ระบบต้องปลอดภัย”
- ระบุ Actor ได้อย่างน้อย 4 ประเภท เช่น Request, Webhook, Worker และ Reconciliation
- แยกได้ว่าอะไรคือ State ที่ต้อง Strong Consistency และอะไรคือข้อมูลสำหรับ Report/Reference

## Exercise 2 — แข่งกันสอง Pod

ให้สมมติว่า Order เดียวมี `status = PENDING` และมี Pod A กับ Pod B ทำงานพร้อมกัน:

```text
Pod A: SELECT ได้ PENDING
Pod B: SELECT ได้ PENDING
Pod A: UPDATE เป็น PROCESSING
Pod B: UPDATE เป็น PROCESSING
```

ตอบคำถาม:

1. จุดใดคือ Check-Then-Act Race?
2. ถ้า `UPDATE` ใช้ `WHERE id = ? AND status = 'PENDING'` ผลลัพธ์จะต่างอย่างไร?
3. ถ้า `RowsAffected = 0` มีสาเหตุที่เป็นไปได้อะไรบ้าง?
4. ต้องทำอย่างไรต่อเพื่อไม่ให้ทั้งสอง Pod สร้าง Ledger หรือเรียก External API ซ้ำ?

### ผ่านเมื่อ

อธิบายได้ว่า Atomic Status Update ช่วย Claim ได้ แต่ไม่ใช่คำตอบครบวงจรสำหรับ Ledger Idempotency หรือ Recovery

## Exercise 3 — เลือกกลไก Concurrency

จับคู่แต่ละโจทย์กับกลไกที่เหมาะสมที่สุด พร้อมเหตุผลและ Trade-off:

| โจทย์ | กลไก | เหตุผล / Trade-off |
| :--- | :--- | :--- |
| `amount > 0` จาก Request |  |  |
| Claim งานที่ต้องเป็น `PENDING` |  |  |
| อ่าน Balance แล้วคำนวณหลายค่า |  |  |
| Writer ชนกันน้อยและ Retry ได้ |  |  |
| ผลธุรกิจห้ามเกิดซ้ำ |  |  |
| หลาย Statement ต้องสำเร็จพร้อมกัน |  |  |

ตัวเลือกที่ควรพิจารณา: Local Validation, Atomic Conditional Update, `SELECT FOR UPDATE`, Optimistic Locking, Unique Constraint และ Database Transaction

### คำถามต่อยอด

ถ้า Design เลือก `SELECT FOR UPDATE` ให้ระบุด้วยว่า Lock เริ่มและจบตรงไหน และเหตุใดจึงไม่ควรถือ Lock ระหว่างเรียก Bank หรือ Provider

## Exercise 4 — ออกแบบ Idempotency Contract

สมมติ Webhook นี้:

```text
payment_reference = PAY-X8K29P
bank_transaction_id = KTB-987654321
amount = 1000.00
```

ออกแบบคำตอบของระบบสำหรับกรณีต่อไปนี้:

| กรณี | Response / State / Effect ที่ควรเกิด |
| :--- | :--- |
| Webhook ครั้งแรก |  |
| Webhook เดิมซ้ำหลัง Credit สำเร็จ |  |
| Transaction ID เดิมแต่ Amount ใหม่ |  |
| Payment Reference หา Order ไม่พบ |  |
| Webhook มาถึงระหว่าง Order ยัง Commit ไม่เสร็จ |  |
| Provider Retry หลังระบบตอบ Timeout |  |

ต้องระบุให้ชัดว่า Identifier ใดใช้ Match Order, Identifier ใดใช้กัน Bank Transaction ซ้ำ และ Business Effect Key คืออะไร

### ผ่านเมื่อ

- แยก Duplicate ที่รู้จักแล้วออกจาก Conflict/Anomaly ได้
- ไม่ใช้ Amount + Time หรือชื่อผู้โอนเป็น Identity หลัก
- อธิบายได้ว่าทำไม Duplicate Webhook อาจตอบสำเร็จตาม Provider Contract แต่ต้องไม่ Credit ซ้ำ

## Exercise 5 — วาด State Machine

เลือก Deposit หรือ Withdrawal แล้วสร้างตาราง Transition:

| Current State | Event/Actor | Next State | Allowed หรือไม่ | Business Effect |
| :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

ระบุเพิ่ม:

- Initial State
- Terminal State
- Transition ที่ห้ามย้อนกลับตรง ๆ
- Reversal, Refund หรือ Compensation ที่ใช้แทนการย้อน State
- Event ที่อาจมาผิดลำดับ

### คำถามทบทวน

ทำไม `COMPLETED → PENDING` จึงอาจทำให้ Ledger และ Event เดิมกำกวม? ถ้าต้องแก้ผลลัพธ์ทางธุรกิจ ควรใช้ Workflow ใดแทน?

## Exercise 6 — Withdrawal, Reserve และ Unknown Result

ออกแบบ Flow สองช่วง:

```text
ช่วงที่ 1: ตรวจและ Reserve เงินใน Database
ช่วงที่ 2: เรียก Payout Provider และ Finalize ผลลัพธ์
```

เติมตาราง:

| เหตุการณ์ | Durable State | Retry ได้ไหม | ต้อง Inquiry ไหม | Recovery Owner |
| :--- | :--- | :--- | :--- | :--- |
| Reserve สำเร็จ |  |  |  |  |
| Provider ตอบสำเร็จ |  |  |  |  |
| Provider ตอบ Business Failure |  |  |  |  |
| Network Timeout |  |  |  |  |
| Crash หลัง Provider สำเร็จแต่ก่อนบันทึกผล |  |  |  |  |

### ผ่านเมื่อ

- แยก `FAILED` ที่รู้ผลออกจาก `UNKNOWN` ที่ต้องตรวจสอบเพิ่ม
- ไม่ Retry Payout ซ้ำจาก Timeout โดยอาศัยการเดา
- ระบุได้ว่าจะ Release/Finalize Reservation เมื่อใด

## Exercise 7 — Dual Write และ Outbox

พิจารณา Flow นี้:

```text
UPDATE orders SET status = 'COMPLETED'
PUBLISH OrderCompleted ไป Kafka
```

แจกแจงผลลัพธ์ของ Failure สองแบบ:

1. Database Commit สำเร็จ แต่ Kafka Publish ล้มเหลว
2. Kafka Publish สำเร็จ แต่ Process Crash ก่อน Database Commit

จากนั้นเขียน Flow ใหม่ด้วย Transactional Outbox:

```text
DB Transaction:
  Update Aggregate
  Insert Outbox Event
Commit

Outbox Worker:
  Claim Event
  Publish Kafka
  Mark SENT หรือ Retry
```

ตอบเพิ่ม:

- ถ้า Worker Publish สำเร็จแล้ว Crash ก่อน Mark `SENT` จะเกิดอะไร?
- Consumer ใช้ Business Key ใดป้องกัน Effect ซ้ำ?
- Outbox Event ที่ค้าง `PROCESSING` จะมี Lease/Timeout/Recovery อย่างไร?
- กรณีใดไม่จำเป็นต้องใช้ Outbox และใช้ Reconciliation แทนได้?

### ผ่านเมื่อ

อธิบายได้ว่า Outbox แก้ Database/Kafka Dual Write แต่ไม่ได้ทำให้ Consumer หรือ External Bank Effect เป็น Exactly Once โดยอัตโนมัติ

## Exercise 8 — Staff-Level Design Review

เลือก Flow จริงหนึ่งเรื่อง แล้วเขียน Design Review ให้จบในหนึ่งหน้า:

| หัวข้อ | คำตอบของฉัน/ทีม |
| :--- | :--- |
| Business Invariant |  |
| Source of Truth |  |
| Authoritative Writer |  |
| Concurrent Actors |  |
| Allowed State Transition |  |
| Atomic Boundary |  |
| Unique Business Key |  |
| Idempotency Strategy |  |
| External Call Boundary |  |
| Retryable / Permanent / Unknown Error |  |
| Recovery และ Reconciliation |  |
| Observability และ Alert |  |
| Complexity ที่ยอมรับได้ |  |

ใช้คำถาม Code Review เหล่านี้:

```text
ถ้า Method นี้ถูกเรียกพร้อมกัน 2 ครั้ง จะเกิดอะไรขึ้น?
ถ้า Request/Event เดิมถูก Retry จะเกิด Business Effect ซ้ำไหม?
ถ้าล้มหลัง Statement ที่ 2 แต่ก่อน Statement ที่ 3 ข้อมูลจะอยู่สภาพไหน?
Transition นี้อนุญาตจาก Status ไหน?
ทำไม Operation นี้ต้อง Async?
ถ้า Process Crash ตอนนี้ ใครจะเอางานกลับมาทำต่อ?
```

### เกณฑ์จบหลักสูตร

- [ ] อธิบาย Invariant และ Failure Matrix ของ Flow จริงได้
- [ ] เลือก Concurrency Control โดยอธิบาย Trade-off ได้
- [ ] ออกแบบ Idempotency Key และ Unique Business Key ได้
- [ ] วาด State Machine ที่มี Terminal State และ Recovery ได้
- [ ] ออกแบบ Reserve/Inquiry สำหรับ Unknown Provider Result ได้
- [ ] อธิบาย Dual Write, Outbox และ Duplicate Consumer ได้
- [ ] ทำ One-page Design Review โดยเริ่มจาก Risk ไม่ใช่ Technology ได้

---

# Cheat Sheet

จำเป็นประโยคสั้น ๆ:

```text
Validation บน Local Data
→ if ตามปกติ
```

```text
Shared Mutable State + Condition ง่าย
→ Atomic UPDATE
```

```text
Shared Mutable State + Calculation ซับซ้อน
→ SELECT FOR UPDATE
```

```text
หลาย DB Operation ต้องไปด้วยกัน
→ Transaction
```

```text
Business Effect ห้ามซ้ำ
→ Unique Constraint
```

```text
Request/Event ถูก Retry ได้
→ Idempotency
```

```text
External Service ใช้เวลานาน
→ อย่าถือ DB Lock
```

```text
Withdrawal
→ Reserve ก่อน แล้วค่อย Payout
```

```text
Kafka
→ Async Workflow / Decoupling
```

```text
Kafka
≠ Business Correctness
```

```text
DB + Kafka Dual Write
→ ต้องคิด Recovery
```

```text
Event ห้ามหาย
→ Outbox / CDC / Durable Reconciliation
```

และประโยคที่สำคัญที่สุด:

> **อย่าถามก่อนว่าจะใช้ Pattern อะไร ให้ถามก่อนว่า Business Invariant คืออะไร และระบบจะผิดได้ตรงไหน**

นี่คือ Mental Model สำคัญในการขยับจากการคิดระดับ Implementation ไปสู่การคิดระดับ System Design และ Staff Engineer

## Primary Sources สำหรับอ่านต่อ

- [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL: `SELECT` and Locking Clauses](https://www.postgresql.org/docs/current/sql-select.html)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Stripe: Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)
- [AWS: Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
