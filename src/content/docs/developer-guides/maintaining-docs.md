---
title: Maintaining Documentation
description: โครงสร้างและกติกาสำหรับเพิ่มหรือแก้เอกสารใน Gus Knowledge
status: active
lastUpdated: 2026-10-03
documentType: developer-guide
---

Markdown ใต้ `src/content/docs/` คือ published source ของเว็บไซต์ เริ่มเขียนจาก Business Flow ที่นักพัฒนาต้องตามตั้งแต่ต้นจนจบ ไม่เริ่มจากการแยกเอกสารตาม Service

## วางเอกสารไว้ที่ใด

| เนื้อหา | ตำแหน่ง |
| :--- | :--- |
| Flow ธุรกิจแบบ end-to-end | `src/content/docs/business-flows/<capability>/` |
| กฎที่หลาย Flow ใช้ร่วมกัน | `src/content/docs/shared-rules/` |
| ภาพรวม Service, Integration และ Infrastructure | `src/content/docs/system-context/` |
| วิธีทำงานสำหรับนักพัฒนาและผู้ดูแลเอกสาร | `src/content/docs/developer-guides/` |

Implementation plan และเอกสารสำหรับ AI ต้องอยู่นอก `src/content/docs/` เสมอ เพราะไม่ใช่เนื้อหาที่เผยแพร่ในเว็บไซต์

## Frontmatter ที่ต้องมี

ทุกหน้าต้องมี `title`, `description`, `status`, `lastUpdated` และ `documentType` โดย `status` ใช้ได้เฉพาะ `draft`, `active` หรือ `deprecated` และ `lastUpdated` ใช้รูปแบบ `YYYY-MM-DD`

## วันที่อัปเดตและป้าย NEW

- ตั้ง `lastUpdated` เป็นวันที่ตามเวลา `Asia/Bangkok` ที่แก้เนื้อหาหน้านั้นจริง โดยใช้ `YYYY-MM-DD`
- อัปเดตวันที่เมื่อแก้หรือยืนยันข้อมูลที่หน้าเผยแพร่ เช่น Business Rule, ลำดับ Flow, State, Error, Service ownership, Alias หรือลิงก์ที่เกี่ยวข้อง
- ไม่เปลี่ยน `lastUpdated` เมื่อ source code เปลี่ยนแต่เอกสารไม่เปลี่ยน หรือเมื่อแก้เฉพาะรูปแบบที่ไม่กระทบเนื้อหา
- แสดงวันที่ `lastUpdated` ใต้ชื่อหน้าเพื่อให้ผู้อ่านเห็นว่าเนื้อหาอัปเดตเมื่อใด
- เมนูแสดงป้าย `NEW` เมื่อวันที่ `lastUpdated` อยู่ระหว่างวันนี้ย้อนหลังไม่เกิน 14 วันปฏิทิน (นับรวมวันที่ 14); วันที่ในอนาคตไม่แสดงป้าย
- ระบบคำนวณอายุป้ายตามวันที่ `Asia/Bangkok` และซ่อนป้ายเมื่อพ้นช่วง 14 วัน
- ครอบข้อความเฉพาะ feature หรือ business behavior ที่เปลี่ยนด้วย `<mark class="changed-feature" data-updated-on="YYYY-MM-DD">...</mark>` โดยใส่วันที่ที่เปลี่ยนจริงเป็นวันที่ `Asia/Bangkok`; สี highlight จะแสดงในช่วง 14 วันเดียวกับป้าย `NEW` และจะไม่แสดงอีกหลังหมดช่วง แม้ markup จะยังอยู่ในเอกสาร
- ใช้ highlight กับข้อความที่เปลี่ยนจริงเท่านั้น ไม่ครอบทั้งหน้า และใส่วันที่ใหม่เฉพาะข้อความที่เปลี่ยนในรอบนั้น เพื่อไม่ให้ข้อความเก่ากลับมา highlight เมื่อมีการแก้หน้าในอนาคต
- อัปเดต `lastUpdated` เฉพาะหน้าที่แก้จริง ไม่เลื่อนวันที่ของหน้าอื่นเพื่อให้ได้ป้าย `NEW`

หน้า Business Flow ต้องมีเพิ่ม:

```yaml
capability: Trading
services: [order-service, asset-consumer]
integrations: [remarketer]
aliases: [swap limit, คำสั่งลิมิต]
documentType: flow
```

`integrations` ใส่เมื่อ Flow เชื่อมต่อระบบภายนอก ส่วน index ของ capability ก็เป็นหน้า Flow และต้องมี metadata ชุดเดียวกัน

## โครงสร้างหน้า Flow

Flow ต้องครอบคลุมหัวข้อต่อไปนี้เท่าที่แหล่งข้อมูลยืนยัน:

1. Purpose and scope
2. Trigger and preconditions
3. Participating services
4. End-to-end sequence
5. Business rules
6. State transitions
7. Error and recovery behavior
8. Final outcomes
9. Related shared rules

ทุกช่วงใน sequence ต้องระบุ `Owner service` หาก service ที่ลงมือทำต่างจากเจ้าของกฎธุรกิจ ให้ระบุ `Executing service` แยกต่างหาก ห้ามใช้ชื่อ Service เป็นโครงสร้างนำทางหลัก

## Alias และลิงก์

- ใส่ alias ภาษาไทยและอังกฤษที่นักพัฒนาจะใช้ค้นจริง เช่น `ถอนเงิน` และ `withdrawal`
- ใช้ชื่อ Integration, Error Code หรือคำศัพท์เดิมเป็น alias เมื่อช่วยให้ค้น Flow เจอ
- ลิงก์ไปหน้าเผยแพร่ด้วย canonical extensionless route เช่น `/shared-rules/error-codes/`
- อ้าง code path เป็น inline code เช่น `pkg/order/service.go` ไม่ใช้ absolute file URL จากเครื่องผู้เขียน

## คำสั่งที่ใช้

| คำสั่ง | ใช้เมื่อ |
| :--- | :--- |
| `npm run docs:dev` | แก้เอกสารและดูผลแบบ live reload |
| `npm run docs:check` | ตรวจ metadata, link และกฎของ published content |
| `npm run docs:build` | ตรวจและสร้าง static HTML ลง `dist/` |
| `npm run docs:local` | build แล้วเปิด local preview server |

ก่อนส่งการเปลี่ยนแปลงให้รัน `npm test` และ `npm run docs:build` เพิ่มเติมเพื่อยืนยันทั้ง behavior tests และเว็บไซต์
