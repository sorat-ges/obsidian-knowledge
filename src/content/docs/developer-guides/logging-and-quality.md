---
title: Logging and Code Quality
description: มาตรฐาน application log, trace propagation และ quality checks สำหรับ order-service
status: active
lastUpdated: 2026-07-27
documentType: developer-guide
---

คู่มือนี้เก็บเฉพาะพฤติกรรมที่นักพัฒนาต้องใช้กับโค้ดปัจจุบัน ไม่รวม milestone การ refactor เดิมหรือ rollout plan ที่ยังไม่ได้ implement

## Application Log

### ใช้ข้อความที่บอกเหตุการณ์

ข้อความหลักต้องบอกว่าเกิดอะไรขึ้นอย่างกระชับ ห้ามใช้คำกว้างอย่าง `"Log"`, `"Error"` หรือใช้เฉพาะชื่อฟังก์ชัน

```go
// ไม่ควรทำ
logs.ErrorWithContext(ctx, "ConfirmWithdrawOrder", ...)

// ควรทำ
logs.ErrorWithContext(ctx, "Failed to verify confirmation token", ...)
```

### รักษา schema ให้คงที่

- ส่ง `logs.ErrorLog` เป็น string เสมอ เช่น `err.Error()`
- แยกข้อมูลบริบทเป็น top-level fields อย่าใส่ nested object ใน `ErrorLog` หรือ `DataLog`
- อย่าแปลง struct ทั้งก้อนด้วย `fmt.Sprintf` หรือ `AnyToString`
- ใช้ชื่อ field และชนิดข้อมูลเดิมทุกจุด เพื่อป้องกัน Elasticsearch mapping conflict และ dropped logs

```go
logs.InfoWithContext(ctx, "GetHistoryOrderList request received", map[string]any{
    "user_id":    id.String(),
    "page":       page,
    "order_type": orderType,
})
```

ชื่อฟังก์ชันหรือไฟล์เป็น metadata ไม่ใช่ข้อความหลัก:

```go
logs.ErrorWithContext(ctx, "Failed to verify confirmation token", map[string]any{
    "function":  "WhiteGloveHandler.ConfirmWithdrawOrder",
    "error_log": err.Error(),
})
```

ตัวอย่าง code path ที่เกี่ยวข้องให้อ้างแบบ repository-relative เช่น `utils/log.go`, `handler/confirmation_handler.go` และ `cmd/main.go`

### เลือก Log Level

| Level | ใช้เมื่อ |
| :--- | :--- |
| `DEBUG` | ข้อมูลชั่วคราวสำหรับไล่โค้ด; ไม่เปิดบน production |
| `INFO` | เหตุการณ์ธุรกิจสำคัญหรือการทำงานปกติ |
| `WARN` | เกิดความผิดปกติแต่ระบบ recover หรือ retry ต่อได้ |
| `ERROR` | งานนั้นล้มเหลวและต้องตรวจสอบ |

HTTP access log ถูกบันทึกโดย middleware ที่ตั้งจาก `httpserv.New()` ใน `cmd/main.go` จึงไม่ต้องเขียน INFO ซ้ำใน Handler ยกเว้น business milestone หรือ execution boundary ที่ middleware ไม่ครอบ เช่น Worker, Cron หรือ Kafka Consumer

### Log once และ wrap error

Repository และ Service ต้องห่อ error พร้อมบริบทแล้ว return ขึ้นไป:

```go
order, err := s.db.FindOrder(orderID)
if err != nil {
    return nil, fmt.Errorf("failed to retrieve order data (ID: %s): %w", orderID, err)
}
```

Handler, Controller, Consumer หรือ Worker ซึ่งเป็น execution boundary บันทึก ERROR เพียงครั้งเดียว พร้อม error chain และ identifier ที่ใช้สืบค้น:

```go
logs.ErrorWithContext(ctx, "Failed to retrieve order transaction detail", map[string]any{
    "error_log": err.Error(),
    "order_id":  orderID,
})
```

ชั้นด้านในบันทึก ERROR ได้เฉพาะเมื่อ recover หรือกลืน error เพื่อใช้ fallback และ caller จะไม่ได้รับ error เดิมไปบันทึกซ้ำ

## Trace ID และ Context

ใช้ `logs.ErrorWithContext` หรือ `logs.InfoWithContext` จาก `git.xspringas.com/xas/library/logger/logs` ตัว library อ่านค่า `X-Correlation-ID` ผ่าน key `logs.CorrelationId`

- ทุก DB, Redis, Kafka และ outgoing HTTP call ต้องรับ `ctx context.Context` เป็นพารามิเตอร์แรกและส่งต่อ
- ห้ามแทน request context ด้วย `context.Background()` หรือ `context.TODO()` ใน Service/Repository
- Goroutine ที่ต้องทำงานต่อหลัง request จบให้สร้าง context ใหม่และคัดลอก trace ID อย่างตั้งใจ
- Kafka producer ต้องส่ง trace ID ใน payload หรือ header; consumer ต้องนำ trace ID เดิมมาสร้าง context ก่อนเรียก Business Logic ห้ามสุ่มค่าใหม่
- Background Job, Cron หรือ Worker ที่ไม่มี upstream context ต้องสร้าง root trace ID หนึ่งครั้งเมื่อเริ่มงาน แล้วใช้ค่าเดิมตลอดงาน

```go
func GetTraceID(ctx context.Context) string {
    if traceID, ok := ctx.Value(logs.CorrelationId).(string); ok {
        return traceID
    }
    return ""
}
```

## Sonar และ Code Quality

กำหนด source และ exclusion ใน `sonar-project.properties` ให้ตรงกับโครงสร้าง repository เพื่อไม่ให้ generated code, mock หรือ artifact ปนในผลวิเคราะห์ ตัวอย่าง:

```properties
sonar.sources=pkg,utils,cmd,handler
sonar.exclusions=**/mocks/**,**/docs/**,**/vendor/**,**/*_test.go
sonar.tests=.
sonar.test.inclusions=**/*_test.go
```

ก่อนส่งการเปลี่ยนแปลงให้รัน:

```bash
golangci-lint run ./...
go test ./...
```

จากนั้นตรวจผล Sonar/Quality Gate ที่ pipeline ของ repository รันจริง อย่าอนุมานว่า PR gate, pre-commit hook หรือ integration test เปิดอยู่โดยไม่ได้ตรวจ configuration ปัจจุบัน เช่น `.golangci.yml`, `sonar-project.properties` และ `Jenkinsfile`
