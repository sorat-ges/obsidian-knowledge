---
title: Campaign Module
tags: [trading, api, fees]
status: active
created: 2026-02-01
last-updated: 2026-02-12
---

# Campaign Module Documentation

**Navigation**: [[Home]] | Trade

## Overview

Campaign เป็นระบบจัดการแคมเปญค่าธรรมเนียมการทำธุรกรรม (Transaction Fee) ภายใต้ Sale Service โดยเก็บข้อมูลในตาราง `xpg_sale.transaction_fee` โดยจะแยก Campaign ออกจาก Transaction Fee ทั่วไปด้วย field `is_campaign = true`

---

## Architecture

```
Handler (sale_handler.go)
  └─ DTO (sale_dto.go)         → Request/Response transformation
      └─ Service (service.go)  → Business logic
          ├─ Repository (transaction_fee_repository.go) → Database operations
          └─ ProduceService (produce/service.go)        → Kafka message producing
```

### Layer Details

| Layer | Package | File |
|-------|---------|------|
| Handler | `handler` | `sale_handler.go`, `sale_dto.go` |
| Service | `pkg/sale` | `service.go`, `input.go`, `output.go` |
| Repository | `storages/postgres/salerepository` | `transaction_fee_repository.go` |
| Domain | `internal/domain` | `transaction_fee.go` |
| Produce | `pkg/produce` | `service.go` |
| Enums | `internal/constants/enum` | `transaction_fee_enum.go`, `common_enum.go` |

---

## API Endpoints

Base path: `/api/v1/sale`

ทุก endpoint ต้องมี **Employee Authentication** (`AuthRequiredMiddlewareEmployee`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/campaign` | `GetPaginatedCampaign` | ดึงรายการ Campaign แบบ pagination |
| `GET` | `/campaign/:campaign_id` | `GetCampaignDetail` | ดึงรายละเอียด Campaign ตาม ID |
| `POST` | `/campaign` | `CreateCampaign` | สร้าง Campaign ใหม่ |
| `PATCH` | `/campaign/status/:campaign_id` | `UpdateCampaignStatus` | อัปเดตสถานะ Campaign |
| `DELETE` | `/campaign/:campaign_id` | `DeleteCampaign` | ลบ Campaign (Soft Delete) |

---

## API Details

### 1. GET /campaign — ดึงรายการ Campaign

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | No | - | ค้นหาชื่อ Campaign |
| `page` | int | No | 1 | หน้าที่ต้องการ |
| `limit` | int | No | 10 | จำนวนรายการต่อหน้า |

**Response (200):**

```json
{
  "code": "200",
  "message": "success",
  "data": {
    "data": [
      {
        "campaign_id": "uuid",
        "campaign_name": "string",
        "status": "active | inactive | expired",
        "start_date": "2025-01-01T00:00:00Z",
        "end_date": "2025-12-31T00:00:00Z",
        "fee_rate": "1.5",
        "is_include_additional_fee": true,
        "fee_duration": "30"
      }
    ],
    "total_items": 100,
    "current_page": 1,
    "items_per_page": 10,
    "links": {
      "next": "/api/v1/sale/campaign?page=2&limit=10",
      "previous": null,
      "first": "/api/v1/sale/campaign?page=1&limit=10",
      "last": "/api/v1/sale/campaign?page=10&limit=10"
    }
  }
}
```

**Sorting:** เรียงลำดับตามสถานะ → `active(1)` > `inactive(2)` > `expired(3)` แล้วเรียงตาม `created_at DESC`

---

### 2. GET /campaign/:campaign_id — ดึงรายละเอียด Campaign

**Path Parameters:**

| Parameter     | Type | Required | Description     |
| ------------- | ---- | -------- | --------------- |
| `campaign_id` | UUID | Yes      | ID ของ Campaign |

**Response (200):**

```json
{
  "code": "200",
  "message": "success",
  "data": {
    "name": "Campaign Name",
    "fee_rate": "1.5",
    "condition": "KYC Approval Status is Completed",
    "start_date": "2025-01-01T00:00:00Z",
    "created_date": "2025-01-01T00:00:00Z",
    "status": "active",
    "include_additional_fee": true,
    "fee_duration_days": "30",
    "end_date": "2025-12-31T00:00:00Z",
    "created_by_name": "Admin User",
    "updated_by_name": "Admin User",
    "updated_date": "2025-01-01T00:00:00Z"
  }
}
```

---

### 3. POST /campaign — สร้าง Campaign ใหม่

**Request Body:**

```json
{
  "campaign_name": "string (required, max 250 chars)",
  "start_date": "2025-01-01T00:00:00Z (required)",
  "end_date": "2025-12-31T00:00:00Z (optional)",
  "fee_rate": "1.5 (required)",
  "is_include_additional_fee": false,
  "condition": [
    {
      "param_name": "onboarding_day (required)",
      "operator": "less_than (required)",
      "value": 30
    }
  ]
}
```

**Response (201):**

```json
{
  "code": "201",
  "message": "campaign created successfully"
}
```

**Business Rules:**
- `company_code` จะถูกตั้งเป็น `"XD"` เสมอ
- `transaction_type` จะถูกตั้งเป็น `"swap"` เสมอ
- `fee_type` จะถูกตั้งเป็น `"fee"` เสมอ
- `fee_unit` จะถูกตั้งเป็น `"percent"` เสมอ
- `priority` จะถูกตั้งเป็น `1` (Campaign priority)
- `is_campaign` จะถูกตั้งเป็น `true` เสมอ
- `status` จะถูกตั้งเป็น `"active"` เมื่อสร้างใหม่
- `created_by` / `updated_by` ดึงจาก JWT Claims ของ employee
- หลังบันทึกสำเร็จจะส่ง Kafka message (produce) ทันที

---

### 4. PATCH /campaign/status/:campaign_id — อัปเดตสถานะ Campaign

**Path Parameters:**

| Parameter     | Type | Required | Description     |
| ------------- | ---- | -------- | --------------- |
| `campaign_id` | UUID | Yes      | ID ของ Campaign |

**Request Body:**

```json
{
  "status": "active | inactive"
}
```

**Response (200):**

```json
{
  "code": "200",
  "message": "success"
}
```

**Business Rules:**
- รองรับเฉพาะสถานะ `active` และ `inactive` เท่านั้น
- หลังอัปเดตสำเร็จจะส่ง Kafka message ทันที

---

### 5. DELETE /campaign/:campaign_id — ลบ Campaign

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `campaign_id` | UUID | Yes | ID ของ Campaign |

**Response (200):**

```json
{
  "code": "200",
  "message": "success"
}
```

**Business Rules:**
- ลบได้เฉพาะ Campaign ที่มีสถานะ `inactive` เท่านั้น
- เป็น Soft Delete (ตั้ง `is_deleted = true`) ไม่ได้ลบข้อมูลจริง
- หลังลบสำเร็จจะส่ง Kafka message ทันที

---

## Data Model

### Database Table: `xpg_sale.transaction_fee`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key (auto-generated) |
| `company_code` | string | รหัสบริษัท (ค่าคงที่: `"XD"`) |
| `transaction_type` | string | ประเภทธุรกรรม (ค่าคงที่: `"swap"`) |
| `fee_type` | string | ประเภทค่าธรรมเนียม (ค่าคงที่: `"fee"`) |
| `priority` | int | ลำดับความสำคัญ (Campaign = `1`) |
| `condition` | jsonb | เงื่อนไขของ Campaign (JSON array) |
| `fee_value` | decimal | อัตราค่าธรรมเนียม |
| `fee_unit` | string | หน่วยค่าธรรมเนียม (ค่าคงที่: `"percent"`) |
| `start_date` | timestamp | วันที่เริ่มต้น |
| `end_date` | timestamp (nullable) | วันที่สิ้นสุด |
| `created_at` | timestamp | วันที่สร้าง |
| `created_by` | string | ผู้สร้าง (subject จาก JWT) |
| `created_by_name` | string | ชื่อผู้สร้าง |
| `updated_at` | timestamp | วันที่อัปเดตล่าสุด |
| `updated_by` | string | ผู้อัปเดตล่าสุด |
| `updated_by_name` | string | ชื่อผู้อัปเดตล่าสุด |
| `is_include_additional_fee` | bool | รวมค่าธรรมเนียมเพิ่มเติมหรือไม่ |
| `name` | string | ชื่อ Campaign |
| `is_campaign` | bool | เป็น Campaign หรือไม่ (`true` สำหรับ Campaign) |
| `is_deleted` | bool | ถูกลบแล้วหรือไม่ (Soft Delete) |
| `status` | string | สถานะ: `active`, `inactive`, `expired` |

---

## Condition System

Campaign รองรับ condition แบบ JSON array เก็บในคอลัมน์ `condition`:

```json
[
  {
    "param_name": "onboarding_day",
    "operator": "less_than",
    "value": 30
  },
  {
    "param_name": "onboarding_date",
    "operator": "greater_than",
    "value": "2025-01-01"
  }
]
```

### Condition Display Logic (`parseConditionText`)

| Condition | Display Text |
|-----------|--------------|
| มี `onboarding_day` หรือ `onboarding_date` | `"KYC Approval Status is Completed"` |
| ว่าง / `"[]"` / parse error | `"None"` |
| ไม่มี param ที่ตรง | `"None"` |

### Fee Duration

`FeeDuration` ถูกดึงจาก condition โดยหา value ของ `param_name = "onboarding_day"` เช่น ถ้า condition มี `{"param_name": "onboarding_day", "value": 30}` จะได้ FeeDuration = `"30"`

---

## Status Enum

| Status | Value | Description |
|--------|-------|-------------|
| `active` | `"active"` | Campaign กำลังใช้งาน |
| `inactive` | `"inactive"` | Campaign ถูกปิดใช้งาน |
| `expired` | `"expired"` | Campaign หมดอายุ |

---

## Kafka Integration

ทุกการเปลี่ยนแปลงข้อมูล Campaign (Create / Update Status / Delete) จะส่ง Kafka message ไปยัง topic `TopicSaleTransactionFee`

### Message Format

```json
{
  "message_key": "campaign-uuid",
  "message_version": "V1.0.0",
  "message_event": "sale_transaction_fee_sync",
  "updated_time": "2025-01-01T00:00:00Z",
  "data": {
    "id": "uuid",
    "company_code": "XD",
    "transaction_type": "swap",
    "fee_type": "fee",
    "priority": 1,
    "condition": "[{...}]",
    "fee_value": 1.5,
    "fee_unit": "percent",
    "start_date": "2025-01-01T00:00:00Z",
    "end_date": "2025-12-31T00:00:00Z",
    "created_at": "...",
    "created_by": "...",
    "created_by_name": "...",
    "updated_at": "...",
    "updated_by": "...",
    "updated_by_name": "...",
    "is_include_additional_fee": true,
    "name": "Campaign Name",
    "is_campaign": true,
    "is_deleted": false,
    "status": "active"
  }
}
```

### Produce Flow

การส่ง Kafka message ทำภายใน DB Transaction เดียวกัน:

1. ดำเนินการ DB operation (Create/Update/Delete)
2. ดึงข้อมูล Campaign ล่าสุดจาก DB (`GetCampaignDetailForProduce`)
3. แปลงเป็น `TransactionFeeMessage`
4. Produce ไปยัง Kafka topic

> **หมายเหตุ:** `GetCampaignDetailForProduce` ไม่ filter `is_campaign` และ `is_deleted` เพื่อให้ส่งข้อมูลที่ถูก soft delete ได้

---

## Transaction Safety

ทุก write operation (Create, Update, Delete) ถูก wrap ด้วย `dbTransaction.Transaction()` เพื่อให้:
- DB operation และ Kafka produce อยู่ใน transaction เดียวกัน
- ถ้า produce ล้มเหลว จะ rollback การเปลี่ยนแปลง DB ทั้งหมด

---

## Dependencies

```
pkg/sale/service.go
├── db.IDBPostgres               → Database transaction management
├── ITransactionFeeRepository    → CRUD operations on transaction_fee table
└── produce.IProduceService      → Kafka message producing
```

---

## Service Interface

```go
type ISaleService interface {
    GetPaginatedCampaign(query CampaignInput) (CampaignOutput, error)
    GetCampaignDetail(campaignID uuid.UUID) (*CampaignDetailOutput, error)
    DeleteCampaign(ctx context.Context, input DeleteCampaignInput) error
    UpdateCampaignStatus(ctx context.Context, input UpdateCampaignStatusInput) error
    CreateCampaign(ctx context.Context, input CreateCampaignInput) error
}
```

---

## File Reference

| File | Description |
|------|-------------|
| `handler/sale_handler.go` | HTTP handler สำหรับ Campaign API |
| `handler/sale_dto.go` | Request/Response DTO และ transformation functions |
| `pkg/sale/service.go` | Business logic ของ Campaign |
| `pkg/sale/input.go` | Input structs สำหรับ service layer |
| `pkg/sale/output.go` | Output structs สำหรับ service layer |
| `pkg/sale/repository.go` | Repository interface definition |
| `pkg/sale/service_test.go` | Unit tests สำหรับ Campaign service |
| `internal/domain/transaction_fee.go` | Domain model และ DB struct |
| `internal/constants/enum/transaction_fee_enum.go` | Enum constants (CompanyCode, Status, etc.) |
| `storages/postgres/salerepository/transaction_fee_repository.go` | Repository implementation (PostgreSQL) |
| `pkg/produce/service.go` | Kafka produce service |
| `routes/route.go` | Route registration |
