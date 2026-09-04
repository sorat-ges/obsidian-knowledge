---
title: Digital Knowledge Test
description: Flow ค้น customer ตรวจ eligibility และบันทึกผล Digital Knowledge Test สำหรับ employee และ customer พร้อมส่งข้อมูลไปยัง downstream read models
capability: Customer
services: [onboarding-service, order-consumer, asset-consumer, web-portal]
integrations: [Kafka]
errorCodes: ["400", "401", "422", "500"]
aliases: [knowledge test, digital knowledge test, customer knowledge test, knowledge-test, customer knowledge test list, closed customer knowledge test, pending activity knowledge test, แบบทดสอบความรู้, แบบทดสอบความรู้ด้านสินทรัพย์ดิจิทัล, แบบทดสอบ knowledge test, แบบทดสอบความรู้ลูกค้าบัญชีปิด, แบบทดสอบความรู้รายการค้าง]
status: active
lastUpdated: 2026-08-29
documentType: flow
---

## Purpose and scope

อธิบาย Digital Knowledge Test ตั้งแต่ back-office ค้น customer และอ่านสถานะ ไปจนถึง employee หรือ customer submit ผล, บันทึก application/knowledge history และ publish event ไปยัง `order-consumer` กับ `asset-consumer` โดย `onboarding-service` เป็น owner ของ business transaction และ application eligibility

สำหรับ `web-portal` การ upload ใช้ `KNT` temporary document ก่อน submit และ client แสดงผลตาม `customer_status`, `request_allowed` และ response envelope; behavior เหล่านี้เป็น supporting user-visible behavior และไม่ override backend eligibility

ไม่สรุปว่า `product-service` consume event สำเร็จ เพราะ current tree ที่ตรวจไม่พบ consumer path ของ topic นี้

## Trigger and preconditions

**Owner service: `onboarding-service`**

- Employee ต้องผ่าน `PortalClaims` และ API-key authorization ของ back-office routes
- Customer submit ใช้ `identification_id` จาก `PortalClaims.UserUUID`; employee submit ใช้ path `identification_id`
- Detail/list ใช้ customer identification ที่ไม่ใช่ `onboarding` หรือ `rejected`; record ต้องไม่ถูก soft-delete
- Submit ต้องผ่าน `ValidateApplicationRequestAllowed` สำหรับ application type `knowledge-test`
- Employee submit ต้องมี `knowledge_test_date` และ attachment (`object_key`, `file_name`, `file_type`)
- Customer submit ต้องส่ง `digital_knowledge_test_id`; service ใช้เวลาปัจจุบันเป็น `knowledge_date`

## Participating services

| Service / integration | Role |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor ของ list/detail, eligibility, application, knowledge upsert, history และ event publish |
| `web-portal` | Supporting client/BFF สำหรับ employee list/detail/submit และ customer route ที่เรียก backend |
| `order-consumer` | Event executor ที่ upsert digital knowledge read model ของ order domain |
| `asset-consumer` | Event executor ที่ validate event/version และ upsert digital knowledge read model ของ asset domain |
| `Kafka` | ส่ง `customer-knowledge-test-digital` และ `CustomerSync` message ไปยัง downstream topics |

## End-to-end sequence

### 1. Search the back-office customer list

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`GET /api/v1/customer/knowledge-test` รับ `q`, `page` และ `limit` แล้ว query identification ที่:

- `status NOT IN ('onboarding', 'rejected')`
- `is_deleted = false`

Response คืน customer code, ชื่อ, mobile และ `status` เพื่อให้ `web-portal` แสดง Customer Status

### 2. Read customer detail and request eligibility

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

`GET /api/v1/customer/{identification_id}/knowledge-test` โหลด identification, profile, contact และ digital knowledge date แล้วคืน `customer_status` พร้อม `request_allowed` จาก application matrix ของ `knowledge-test`

Detail path ไม่รับ `onboarding` หรือ `rejected`; status อื่นที่ผ่าน identification read สามารถอ่านรายละเอียดได้ แต่ `request_allowed` ยังขึ้นกับ ongoing applications ที่ block ตาม matrix

`GET /api/v1/customer/{identification_id}/knowledge-test/digital` คืน knowledge date/expiry flag; เมื่อไม่พบ knowledge record service คืนค่า date และ expiry เป็น `nil`

`web-portal` BFF คง response envelope (`code`, `message`, `data`) จาก backend; hook map body `code = '400'` เป็น `CUSTOMER_NOT_FOUND` และใช้ `customer_status`/`request_allowed` จาก detail เพื่อเลือกข้อความและ modal ที่ผู้ใช้เห็น

### 3. Submit the test result

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Employee ใช้ `POST /api/v1/customer/{identification_id}/knowledge-test` พร้อมวันสอบและ attachment; customer ใช้ `POST /api/v1/customer/digital-knowledge-test/submit` พร้อม master test version ID

ใน customer upload path, `web-portal` เรียก `POST /api/document/upload-file` ด้วย `document_type = KNT`, `is_temp = true`, `group_name = DEFAULT` และส่งผล upload ไปยัง BFF ก่อน submit payload ของ knowledge test; `onboarding-service` ยังคงเป็นผู้ตรวจ eligibility และบันทึก transaction

หลังผ่าน eligibility service:

1. โหลด customer identification และ latest customer capture
2. ใช้ version ID ที่ customer ส่ง หรือเลือก master digital knowledge version ล่าสุดสำหรับ employee
3. เปิด application type `knowledge-test` และ action flow จาก `created` ไป `submitted`
4. ใน transaction เดียว upsert `customer_background_knowledge_digital` และสร้าง history
5. ถ้ามี attachment ย้าย temp file ไป document management path
6. publish `CustomerSync` knowledge payload ไปยัง order และ product topics และ publish `customer-knowledge-test-digital` ไปยัง asset topic
7. update application เป็น `completed` ด้วย system actor
8. หลัง transaction commit เรียก `PostCustomerCapture`

### 4. Materialize downstream knowledge state

**Owner service: `onboarding-service` สำหรับ event contract**

**Executing service: `order-consumer` และ `asset-consumer`**

- `order-consumer` อ่าน knowledge payload แล้ว upsert identification-level `customer_background_knowledge_digital` ใน transaction
- `asset-consumer` ตรวจ `message_event = customer-knowledge-test-digital` และ version `V1.0.0` แล้ว upsert knowledge record ใน transaction
- current `product-service` tree ที่ตรวจไม่พบ consumer ของ product topic จึงยังไม่ยืนยันการ materialize ฝั่ง product

### 5. Use the result for downstream eligibility

**Owner service: downstream operation owner**

**Executing service: downstream service ที่เรียก customer knowledge read model**

Current product/order code มี read path ที่ใช้ knowledge result ตรวจว่า customer ต้องทำ test หรือไม่ในบาง product/project; การบันทึก knowledge นี้ไม่เปลี่ยน customer identification status โดยตรง

## Business rules

- List ตัดเฉพาะ `onboarding`, `rejected` และ soft-deleted identification; จึงอาจคืน `active`, `suspended`, `closed`, `inactive`, `freeze` หรือ status อื่นที่ไม่อยู่ใน exclusion
- Detail ตัด `onboarding` และ `rejected`; `customer_status` เป็น backend response field และไม่ควรเดาจาก UI label
- Submit ถูก block เมื่อ application matrix พบ ongoing application ที่ขัดกัน
- Employee ต้องส่งวันที่สอบและข้อมูล attachment ครบ; customer ใช้ master version ID ที่ส่งมาและวันที่จาก system time
- การเขียน current knowledge, history และ application state อยู่ใน transaction เดียวก่อน post customer capture หลัง commit
- Event publish เป็นส่วนหนึ่งของ service transaction callback; หาก publish หรือ downstream consume ล้มเหลว source ไม่ยืนยัน automatic retry หรือ compensating action
- Downstream consumer เป็น executor ของ read-model upsert ไม่ใช่ owner ของ customer knowledge business rule
- `web-portal` แสดง warning และหยุด flow เมื่อ detail error, `customer_status = closed` หรือ `request_allowed = false`; เป็น client behavior ที่สะท้อน backend response ไม่ใช่การตัดสิน eligibility ใหม่

## State transitions

**Owner service: `onboarding-service`**

| Entity | Transition |
| :--- | :--- |
| Knowledge-test application | `created` → `submitted` → `completed` |
| Digital customer knowledge | current record upsert และสร้าง history; source ไม่กำหนด status machine ของ knowledge record |
| Order/asset read model | event received → transactional upsert; ไม่เปลี่ยน customer identification status |

## Error and recovery behavior

- Invalid/missing identification path parameter: HTTP `400` หรือ `422` ตาม handler route
- Invalid portal claim: HTTP `401`
- Customer status ที่ backend ส่ง body `code = '400'`: current `web-portal` hook map เป็น `CUSTOMER_NOT_FOUND` แม้ response envelope จะถูกส่งผ่าน BFF; ไม่ได้พึ่ง HTTP status เพียงอย่างเดียว
- `customer_status = closed`: web-portal แสดง warning ว่าบัญชีปิดแล้วและพากลับ customer list; `request_allowed = false` แสดง ongoing activity/status แล้วพากลับ list
- Detail/upload/submit error อื่นนอกจาก customer-not-found: web-portal แสดง warning จาก error message และให้ผู้ใช้ปิด modal เพื่อกลับหน้า knowledge-test
- Ongoing application block: submit คืน HTTP `400` พร้อม application-not-allowed error
- Profile/contact/capture/master version/database/DMS failure: submit ไม่สำเร็จ; transaction ที่ยังไม่ commit ไม่ควรถือว่า knowledge ถูกบันทึกแล้ว
- `order-consumer` และ `asset-consumer` ใช้ transaction ตอน upsert; source ที่ตรวจไม่ยืนยัน retry/dead-letter behavior
- `product-service` consumer ของ product topic ยังหาไม่พบ จึงต้องตรวจเจ้าของ product integration ก่อนสรุป final propagation

## Final outcomes

- Back-office ได้ customer list/detail พร้อม status และ request eligibility ตาม backend rule
- web-portal แสดง Customer Status ใน list; closed account และ ongoing activity ถูกแสดงเป็น warning ตาม response ก่อนเริ่ม submit
- Successful submit ได้ current digital knowledge record, history และ completed `knowledge-test` application
- `order-consumer` และ `asset-consumer` มี read model หลัง consume event สำเร็จ
- Downstream operation สามารถอ่าน knowledge result เพื่อตรวจ requirement ตาม flow ที่รองรับ; การผ่าน test ไม่ได้ override status/permission rule ของ operation อื่น

## Related shared rules

- [Customer Onboarding and KYC](/business-flows/customer/)
- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/)
- [Portfolio and Reporting](/business-flows/asset-management/portfolio-and-reporting/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`onboarding-service`:

- `routes/routes.go`: knowledge test customer/employee routes
- `handler/customer_knowledge_handler.go`: list, detail และ employee/customer submit handlers
- `handler/customer_knowledge_dto.go`: request/response contract รวม `customer_status`
- `pkg/customer/customer-repo/customer-repository.go`: list status/deleted filter
- `pkg/customer/customer-knowledge/service.go`: detail, eligibility, transactional submit และ Kafka publish
- `pkg/customer/customer-knowledge/output.go`: list/detail output fields

`order-consumer`:

- `pkg/customer-background-knowledge-digital/service.go`: event decode และ transactional upsert

`asset-consumer`:

- `pkg/customer_background_knowledge_digital/service.go`: event/version validation และ transactional upsert
- `cmd/knowledge_test_information/main.go`: consumer registration

`web-portal`:

- `src/app/(knowledge-test-flow)/knowledge-test/hooks/useCustomerKnowledgeTestList.ts`: list request/status mapping
- `src/app/(knowledge-test-flow)/knowledge-test/components/customer-knowledge-test-list-table.tsx`: Customer Status display
- `src/app/(knowledge-test-flow)/hooks/useDigitalKnowledgeTest.ts`: detail/submit client contract
- `src/app/(knowledge-test-flow)/components/digital-knowledge-test-upload.tsx`: upload, closed/pending warning และ success outcome
- `src/app/(knowledge-test-flow)/hooks/useDigitalKnowledgeTest.ts`: detail/submit client contract และ body-code mapping
- `src/app/api/customer/knowledge-test/route.ts`: list BFF
- `src/app/api/customer/[userId]/knowledge-test/route.ts`: detail/submit BFF
- `src/app/api/document/upload-file/route.ts`: temporary KNT upload route ที่ client เรียก
