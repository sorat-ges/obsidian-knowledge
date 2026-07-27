---
title: Maintaining Documentation
description: โครงสร้างและกติกาสำหรับเพิ่มหรือแก้เอกสารใน Gus Knowledge
status: active
lastUpdated: 2026-07-27
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
