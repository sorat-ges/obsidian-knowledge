---
title: Onboarding Reminder Email
description: Flow ส่งอีเมลเตือนลูกค้า onboarding ที่ยังเป็น draft และแจ้ง IT เมื่อการส่งอีเมลรายรายการล้มเหลว
capability: Customer
services: [onboarding-service]
aliases: [onboarding reminder, reminder email, BatchReminding, onboarding reminder email, อีเมลเตือนเปิดบัญชี, เตือนกรอกข้อมูลเปิดบัญชี, แจ้งเตือน onboarding]
integrations: [SendGrid]
errorCodes: ["500"]
status: active
lastUpdated: 2026-08-04
documentType: flow
---

## Purpose and scope

อธิบาย production path ของ `onboarding-service` สำหรับส่งอีเมลเตือนลูกค้าที่มี application onboarding เป็น `draft` ผ่าน `POST /api/v1/onboarding/reminding` ตั้งแต่ service-account trigger, การเลือก application และ template, การส่งผ่าน SendGrid ไปจนถึงการแจ้ง IT เมื่อส่งอีเมลรายรายการไม่สำเร็จ Flow นี้ไม่เปลี่ยนสถานะ application หรือ registration status

## Trigger and preconditions

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

- Endpoint คือ `POST /api/v1/onboarding/reminding`
- Route ต้องผ่าน service-account authentication และ API key `APIKeyCustomerBatchReminding`
- Handler เรียก reminder สองรอบ: `dateBefore = 1` และ `dateBefore = ExpirationDaysForClearDraftCustomer`
- แต่ละรอบเลือก application ที่ `application_type = onboarding`, `status = draft`, `application_channel = XSPRING_APP` และ `DATE(app.created_at)` ตรงกับวันที่ก่อนหน้าตามรอบนั้น
- Source ไม่ยืนยันว่า caller ภายนอกเป็น scheduler หรือ service ใด จึงระบุได้เฉพาะ service-account contract ของ endpoint

## Participating services

| Service/Integration | Role |
| :--- | :--- |
| `onboarding-service` | Business owner และ executor; query draft applications, เลือก template/sender, ส่ง reminder และสร้าง failure alert |
| SendGrid | ส่ง customer reminder และ common job-failure alert ตาม email configuration |

ไม่มี consumer, worker หรือ ledger executor แยกต่างหากที่ source ของ Flow นี้ยืนยัน

## End-to-end sequence

### 1. Trigger reminder batches

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Service account เรียก endpoint แล้ว handler ส่ง request context ต่อเข้า `ApplicationService.Reminding` รอบแรกสำหรับ reminder 1 วันก่อน และรอบที่สองสำหรับ final SLA reminder ตาม `EXPIRATION_DAYS_FOR_CLEAR_DRAFT_CUSTOMER`

### 2. Select incomplete onboarding applications

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

Repository อ่าน `identification_id`, email, onboarding channel, ชื่อลูกค้า, `created_at` และ `request_to` จาก application ที่ตรงเงื่อนไขวัน, type, status และ channel ข้างต้น `request_to` เป็นข้อมูลเสริมสำหรับเลือกบริษัทที่ลูกค้าตั้งใจเปิดบัญชี

### 3. Select template and sender

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

- ถ้า `request_to` ระบุทั้ง XAM และ XD ใช้ template/sender กลุ่ม `both`
- ถ้าเปิดเฉพาะ XAM ใช้ `EmailRemindingCustomerXAM` และ `EmailSenderAssetManagement`
- ถ้าเปิดเฉพาะ XD ใช้ `EmailRemindingCustomerXD` และ `EmailSenderDigital`
- ถ้า `request_to` เป็น `nil` ระบบไม่ error และใช้ template/sender กลุ่ม `both`
- รอบ `dateBefore = 1` ใช้ subject `Follow-up on XSpring Application Status`; รอบ final ใช้ `SLA Final Follow-up on XSpring Application Status`

### 4. Send customer reminders in chunks

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

ระบบแบ่งรายการเป็น chunk ละ 9 รายการ ส่งผ่าน SendGrid แล้วหน่วง 1 วินาทีระหว่าง chunk เพื่อควบคุมอัตราการส่งตามข้อจำกัดที่ source ระบุ หากเป็น `WEARE_WEB` และ email เป็น dummy existing-customer address ระบบส่งไป `EmailWealthSupport` แทนที่อยู่ dummy นั้น

### 5. Alert failed individual sends

**Owner service: `onboarding-service`**

**Executing service: `onboarding-service`**

เมื่อ SendGrid ส่ง customer reminder รายการใดล้มเหลว ระบบ log error แล้วเรียก common job-failure alert ไปยัง `EmailItAppSupportGroup` โดยส่ง `JobName = Onboarding Reminder Email`, `ErrorCategory = Onboarding Reminder Email Failed`, `ItemHeader = Identification ID`, `identification_id` ของรายการ และข้อความ error การแจ้ง alert เป็น best effort และไม่หยุดรายการถัดไป

## Business rules

- Reminder อ่านเฉพาะ `draft` onboarding application จาก channel `XSPRING_APP`; Flow นี้ไม่ได้ clear, complete หรือเปลี่ยน application state
- Handler เรียกสองรอบตามค่า 1 วันและค่า `EXPIRATION_DAYS_FOR_CLEAR_DRAFT_CUSTOMER`; source ไม่ยืนยันการ retry ของ caller ภายนอก
- `request_to` ที่ไม่มีข้อมูลใช้ default `both` เพื่อไม่ให้ reminder ของ application ที่ไม่มี change-request payload ล้มเหลว
- การส่งแบ่ง chunk ละ 9 รายการและหน่วง 1 วินาทีระหว่าง chunk
- Customer email failure ถูกบันทึกและแจ้ง IT แต่ `Reminding` ยังคืนสำเร็จเพื่อประมวลผลรายการอื่นต่อ

## State transitions

**Owner service: `onboarding-service`**

| Trigger | Application / Registration effect |
| :--- | :--- |
| Select reminder candidate | อ่าน `draft` application; ไม่เปลี่ยน state |
| Send customer email | ไม่เปลี่ยน application หรือ registration status |
| Send job-failure alert | ไม่เปลี่ยน business state; สร้างเฉพาะ operational notification |

## Error and recovery behavior

- Authentication หรือ API-key ไม่ผ่าน: request ถูกปฏิเสธที่ route middleware ก่อนเข้า business service
- Repository error, `created_at` parse ไม่ได้ หรือ reminder configuration ใช้ไม่ได้: `Reminding` คืน error และ handler คืน HTTP 500; รอบถัดไปจะไม่เริ่มหากรอบก่อนหน้าล้มเหลว
- Customer email ส่งไม่สำเร็จ: log error, ส่ง failure alert แล้วคืน success จาก item เพื่อให้รายการอื่นและ batch ดำเนินต่อ; endpoint อาจยังคืน HTTP 200
- Failure alert ไม่มี config/recipient หรือส่ง alert ไม่สำเร็จ: helper log และข้าม alert; source ไม่ยืนยัน retry อัตโนมัติ
- `request_to = nil`: ใช้ default `both` ไม่ใช่ error path

## Final outcomes

- รายการ draft ที่ตรงเงื่อนไขถูกพยายามส่ง reminder ตาม template และ sender ของ account-opening intent
- รายการที่ส่งไม่สำเร็จมี failure detail ระบุด้วย `identification_id` สำหรับ IT support เมื่อ alert configuration พร้อม
- Application และ registration status ยังคงเดิม; ผลลัพธ์ของ Flow คือการส่ง notification และ operational alert ไม่ใช่การปิด draft

## Related shared rules

- [Customer Onboarding and KYC](/business-flows/customer/)
- [Onboarding Status and Suitability](/business-flows/customer/onboarding-status-and-suitability/)
- [Third-Party Integrations Profile](/system-context/integrations/)
- [Service Map](/system-context/service-map/)
- [Error Code Registry](/shared-rules/error-codes/)

## Code references

`onboarding-service`:

- `routes/routes.go`: route, service-account middleware และ API-key authorization
- `handler/customer-handler.go`: `BatchReminding` และการเรียกสอง reminder รอบ
- `pkg/customer/application/customer-application-repo/customer-application-repository.go`: query draft onboarding candidates
- `pkg/customer/application/service.go`: chunking, template selection, nil `request_to` และ failure alert
- `pkg/customer/application-email/email-application-service.go`: SendGrid customer email และ alert adapter
- `third_party/email-sendgrid/job-failure-alert.go`: common job-failure alert behavior
- `internal/config/config.go`: expiration days, sender และ support-recipient configuration
