# แนวทางจัดการ Race ระหว่าง Swap Cancel และ Remarketer Webhook

## บริบท

การ cancel swap ตอนนี้เกี่ยวข้องกับ 2 service:

- `order-service` รับคำขอ cancel จากลูกค้า, validate swap order, stamp `is_cancelling = true`, และ produce Kafka event `cancel_swap`
- `order-consumer` consume `cancel_swap`, call cancel ไปที่ remarketer, และปัจจุบันยัง finalize order เอง โดย mark เป็น `cancelled` สำหรับ open order หรือ mark เป็น `filled` พร้อม cancel reason สำหรับ partial fill
- `order-service` รับ webhook จาก remarketer ด้วย ถ้า webhook เป็น `filled` และ `remaining_quantity = 0` ระบบจะ complete order เป็น `filled`

จุดนี้ทำให้เกิด race condition ได้ เพราะลูกค้าอาจกด cancel ในเวลาใกล้เคียงกับที่ remarketer match order พอดี ทำให้ cancel consumer และ webhook processor อาจพยายาม update final status และทำ ledger/refund ซ้ำหรือชนกัน

## เป้าหมาย

ให้ `cancel` เป็นแค่ intent flag จนกว่าจะรู้ผล execution จริงจาก remarketer ส่วน final order state ต้องอิงจากผล execution ของ remarketer และต้องเก็บ cancel intent ไว้เป็น audit เมื่อ customer request cancel ระหว่างที่ order กำลังถูก execute

## Ownership ที่แนะนำ

`order-service` ควรเป็นเจ้าของ:

- Customer cancel API
- Order status และ action flow
- Remarketer webhook processing
- การตีความ matched quantity
- Ledger settlement และ refund

`order-consumer` ควรเป็นเจ้าของ:

- Consume `cancel_swap`
- Call cancel ไปที่ remarketer
- บันทึก cancel API request/response log

Webhook จาก remarketer ควรเป็น source of truth สำหรับ matched quantity และ final execution state

## Target Cancel Flow

1. Customer request cancel swap
2. `order-service` validate ว่า order นี้ cancel ได้
3. `order-service` update เฉพาะ cancel intent field โดยหลักคือ `is_cancelling = true`
4. `order-service` produce `cancel_swap`
5. `order-consumer` consume `cancel_swap`
6. `order-consumer` call cancel ไปที่ remarketer
7. `order-consumer` ไม่ finalize order status และไม่สร้าง refund ledger movement ทันที

## Target Webhook Flow

เมื่อ `order-service` ได้รับ webhook จาก remarketer:

- `filled` พร้อม `remaining_quantity > 0`: process เป็น partial fill และให้ order ยังอยู่ใน non-terminal state เช่น open/filling ยกเว้นมี cancel-result webhook ภายหลังมา resolve order
- `filled` พร้อม `remaining_quantity = 0`: settle execution และ finalize เป็น `filled`
- `filled` พร้อม `remaining_quantity = 0` ตอนที่ `is_cancelling = true`: finalize เป็น `filled` เหมือนเดิม แต่ stamp cancel audit/reason เช่น `Cancelled by Customer` หรือ `cancel requested before full match`
- `cancelled` หรือ `rejected` โดยไม่มี matched quantity: finalize เป็น `cancelled` และ refund held amount
- partial matched แล้วตามด้วย `cancelled` หรือ `rejected`: settle ส่วนที่ match แล้ว, refund ส่วนที่เหลือ, และ finalize เป็น `filled` พร้อม cancel reason เพราะมี trade execute ไปแล้วบางส่วน

## Race Protection

ทุก terminal-state transition ควร reload latest order state ภายใน transaction ก่อน write:

- ถ้า order เป็น terminal ไปแล้ว (`filled`, `cancelled`, หรือ `rejected`) ให้ skip duplicate finalization
- Ledger settlement และ refund creation ต้องมี guard ป้องกันการสร้างซ้ำ
- การ clear `is_cancelling` ควรเกิดหลังจาก order เข้าสู่ resolved terminal state แล้ว หรือหลังจากรู้ชัดว่า cancel attempt เป็นไปไม่ได้และต้องเข้า manual/error handling

## Behavioral Decisions

- ถ้า full match เกิดขึ้นแล้ว ให้ full match ชนะ cancel request และ final status เป็น `filled`
- เก็บ cancel intent เป็น reason/audit metadata เมื่อลูกค้า request cancel ก่อน full match complete
- ระบบไม่ควร mark fully matched order เป็น `cancelled`
- `order-consumer` ไม่ควรตัดสิน final customer outcome เองหลังจาก call cancel ไปที่ remarketer

## Implementation Notes

Service-level changes ที่คาดว่าจะต้องทำ:

- ใน `order-service`, เพิ่ม cancel-aware handling ตอน remarketer webhook finalization
- ใน `order-service`, เพิ่ม idempotency/terminal-state guard รอบ webhook finalization และ ledger/refund movement
- ใน `order-consumer`, ลด cancel handling ให้เหลือ call remarketer cancel และ logging เมื่อใช้ webhook-based resolution แล้ว ให้ remove หรือ bypass path ที่ finalize status/refund ทันที
- คง compatibility กับ message shape เดิมของ `cancel_swap` เว้นแต่ implementation plan ภายหลังพบว่าจำเป็นต้องเพิ่ม field

## Tests

ควรเพิ่มหรือแก้ test สำหรับ:

- Cancel API stamp `is_cancelling = true` และ produce `cancel_swap`
- `order-consumer` call remarketer cancel แต่ไม่ finalize order status หรือ refund ทันที
- Webhook full fill ระหว่าง cancelling finalize เป็น `filled` และบันทึก cancel reason/audit metadata
- Webhook cancel/reject ระหว่าง cancelling โดยไม่มี matched quantity finalize เป็น `cancelled` และ refund hold
- Webhook partial matched แล้วตามด้วย cancel/reject ต้อง settle matched quantity, refund remaining quantity, และ finalize เป็น `filled` พร้อม cancel reason
- Duplicate webhook หรือ repeated cancel event ต้องไม่สร้าง ledger/refund movement ซ้ำ
