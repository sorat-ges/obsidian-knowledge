---
title: Logging and SonarQube Refactoring Plan
tags: [implementation, active]
status: active
last-updated: 2026-06-08
---

# Logging and SonarQube Refactoring Plan

เอกสารฉบับนี้กำหนดแผนการปรับปรุงระบบ (Implementation Plan) สำหรับการยกระดับมาตรฐานคุณภาพโค้ดและการบันทึก Log ของ `order-service` เพื่อนำไปอภิปรายและมอบหมายงานให้กับทีม

---

## 🎯 Goal & Objectives

1. **Eliminate Data Loss**: ป้องกันปัญหา Elasticsearch Type mapping conflict (เนื่องจากมีการส่งชนิดข้อมูลขัดแย้งกันในคีย์เดียวกัน) ที่ทำให้ Log บางส่วนถูกละทิ้งโดยระบบรวบรวม Log (Kibana/Elasticsearch)
2. **Correlation ID Propagation**: ควบคุมสายสัมพันธ์การทำงานของ Log ไม่ให้ขาดตอน (Traceability) โดยบังคับส่งผ่าน Context และ Correlation ID ไปตลอดสาย (HTTP Request, Kafka, Background/Cron Job)
3. **Action-Oriented Logging**: เปลี่ยน Log Message จากแบบคงที่ (Static) หรือการเอาชื่อฟังก์ชันมาใส่ดื้อๆ ให้แสดงเหตุการณ์จริงของระบบ (Dynamic & Contextual)
4. **Early Quality Guardrails**: เพิ่มการตรวจจับข้อผิดพลาดและควบคุมคุณภาพของโค้ดโดยการรัน Linter (`golangci-lint`) และสแกน SonarQube ตั้งแต่ขั้นตอน Pull Request (PR)

---

## 🛠️ Proposed Changes

### Phase 1: Setup & Pipeline Configurations (Quick Wins)

1. **Sonar Qube Configuration**
   - แก้ไขไฟล์ [sonar-project.properties](file:///Users/soratgessakorn/Work/Projects/xas/order-service/sonar-project.properties) เพื่อระบุแหล่งสแกนที่ต้องการและยกเว้นไฟล์ที่ไม่เกี่ยวข้อง
   - *ตัวอย่างการปรับแก้:*

```properties
# กำหนดโฟลเดอร์หลักที่พัฒนาโค้ดเอง
sonar.sources=cmd,handler,pkg,utils,internal

# ละเว้น mock, test และ third_party
sonar.exclusions=internal/fake/**, **/*_test.go, **/z_mock*.go, docs/**, third_party/**
```

2. **Jenkinsfile (CI/CD Linter Integration)**
   - เพิ่มขั้นตอนรัน `golangci-lint` ใน [Jenkinsfile](file:///Users/soratgessakorn/Work/Projects/xas/order-service/Jenkinsfile) ก่อนกระบวนการรัน Test เพื่อปฏิเสธการ Build ทันทีเมื่อโค้ดไม่ได้มาตรฐานลินเตอร์
   - *ตัวอย่างการเพิ่ม Stage:*

```groovy
stage('Linting') {
    steps {
        script {
            sh 'golangci-lint run --timeout 5m'
        }
    }
}
```

3. **Pre-Commit Hook (Husky)**
   - ติดตั้งหรือเปิดใช้งาน Husky ใน `package.json` ของ `order-service` เพื่อทำการรัน linter ตรวจสอบโค้ดในเครื่องก่อนกดยืนยันการ Commit

---

### Phase 2: Logging Library Wrapper Clean Up & Deprecation

1. **Deprecate Legacy Log Helpers**
   - ประกาศยกเลิกการใช้ฟังก์ชันดั้งเดิมใน [utils/log.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/utils/log.go) ได้แก่ `utils.InfoLog` และ `utils.ErrorLog`
   - แนะนำทีมให้เข้าถึง Library กลาง `git.xspringas.com/xas/library/logger/logs` โดยตรง
2. **Schema Consistency Rule (⚠️ BREAKING RISK PREVENT)**
   - ปรับการจัดรูปแบบข้อมูลใน parameters:
     - คีย์ `logs.ErrorLog` **ต้องแปลงข้อมูลข้อผิดพลาดเป็น String เสมอ** (เช่นใช้ `err.Error()`) ห้ามส่ง Error Object ดิบ หรือ nested map/struct
     - หากต้องการส่งข้อมูลแวดล้อมเพิ่มเติม ให้ยกขึ้นมาเป็น Flat คีย์ระดับบนสุดแยกกิ่งออกมา (ห้ามทำ Nested Map ซ้อนใน ErrorLog)
   - *ตัวอย่างการแก้ไข:*

```go
// ❌ ห้ามทำ (Nested Map ซ้อนใน ErrorLog)
map[string]any{
    logs.ErrorLog: map[string]any{"err": err, "order_request_id": id},
}

// ✅ ควรทำ (Flat Fields)
map[string]any{
    logs.ErrorLog:      err.Error(),
    "order_request_id": id.String(),
}
```

---

### Phase 3: Correlation ID Context Propagation Rules

1. **Context Pass-through**
   - ทุกฟังก์ชันในชั้น Handler, Service, Repository ต้องรับ `ctx context.Context` เป็นพารามิเตอร์แรกเสมอ เพื่อไม่ให้ **Correlation ID** ขาดหาย
   - *ตัวอย่างการเขียน Get/Set Correlation ID จาก Context:*

```go
import (
    "context"
    "git.xspringas.com/xas/library/logger/logs"
)

// การดึง Correlation ID จาก Context (เพื่อนำไปใช้งานอื่น)
func GetCorrelationID(ctx context.Context) string {
    if cid, ok := ctx.Value(logs.CorrelationId).(string); ok {
        return cid
    }
    return ""
}

// การตั้งค่า Correlation ID ลงใน Context ใหม่
ctx := context.WithValue(context.Background(), logs.CorrelationId, correlationID)
```

2. **Kafka Message Integration**
   - **ฝั่ง Producer**: ดึง Correlation ID จาก context ปัจจุบันแล้วฝังลงใน JSON payload ของ Message หรือแนบทาง Kafka Headers

```go
// ดึง Correlation ID แปะลงใน Message Struct
message.TraceID = GetCorrelationID(ctx)

// หรือแปะลง Kafka Record Headers
producerMessage.Headers = append(producerMessage.Headers, sarama.RecordHeader{
    Key:   []byte(logs.CorrelationId),
    Value: []byte(GetCorrelationID(ctx)),
})
```

   - **ฝั่ง Consumer**: ดึง Correlation ID ออกจาก message ที่ได้รับมา แล้วนำมา bind เข้า context ก่อนประมวลผลต่อใน Business Logic

```go
// เมื่อดึง Message ได้ ดึง trace/correlation id มาครอบ ctx ใหม่
traceID := message.TraceID
ctx := context.WithValue(context.Background(), logs.CorrelationId, traceID)

// ส่งต่อ ctx เข้าประมวลผลใน service
err := s.orderService.ProcessOrder(ctx, message.Payload)
```

3. **Background Jobs / Cron Jobs / Workers**
   - ตัวประมวลผล Job ที่ไม่มี HTTP context ต้นทาง จะต้องสุ่มสร้าง UUID ขึ้นมาใหม่ตั้งแต่บรรทัดแรก แล้วทำการ bind สวมไว้ที่ Context ทันที

```go
func RunBatchJob() {
    // 1. สุ่มสร้าง Correlation ID
    jobCorrelationID := uuid.New().String()
    
    // 2. สวมลง context
    ctx := context.WithValue(context.Background(), logs.CorrelationId, jobCorrelationID)
    
    logs.InfoWithContext(ctx, "Batch Job started", nil)
    
    // 3. ส่งต่อ ctx ไปยังฟังก์ชันลูกทั้งหมด
    if err := processData(ctx); err != nil {
        logs.ErrorWithContext(ctx, "Failed to process batch data", map[string]any{
            logs.ErrorLog: err.Error(),
        })
    }
}
```

---

## 🚀 Rollout & Feature Task Roadmap

เพื่อให้การดำเนินงานเป็นระเบียบและลดความเสี่ยงจากการ Refactor ในจุดที่สำคัญ ควรทำการแตก Task มอบหมายงานเรียงตามลำดับต่อไปนี้:

| ลำดับ Task | ระดับความยาก | Target Files | คำอธิบายและเป้าหมายของงาน |
| :--- | :---: | :--- | :--- |
| **1. Pilot POC** | 🟢 ง่ายมาก | [health_check_handler.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/handler/health_check_handler.go)<br>[holiday_handler.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/handler/holiday_handler.go) | แก้ไข logging ให้เรียก logs.InfoWithContext และทดสอบผ่าน Pipeline CI linter ใหม่ |
| **2. First Real Business** | 🟡 ปานกลาง | [confirmation_handler.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/handler/confirmation_handler.go) | จุดทดลองตามใน Audit Report: แก้ไขฟังก์ชัน `ConfirmWithdrawOrder` ให้ส่ง Context และปรับปรุง static log message |
| **3. Intermediate Core** | 🟠 ปานกลาง-สูง | [order_placement.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/handler/order_placement.go)<br>[wallet_handler.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/handler/wallet_handler.go) | ขยายการส่ง Context และแกะ payload ที่เป็น nested mapping ออกจาก transaction order |
| **4. Major Legacy Refactor** | 🔴 สูงมาก | [trading_handler.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/handler/trading_handler.go)<br>[white_glove_handler.go](file:///Users/soratgessakorn/Work/Projects/xas/order-service/handler/white_glove_handler.go) | คลีนอัป logging flow ในแกนกลางระบบเทรดทั้งหมด (หลังจาก Standardize จนทีมคุ้นเคยดีแล้ว) |

---

## 🎯 Expected Results

1. **No Log Loss (Zero Mapping Conflicts)**: ฟิลด์ `logs.ErrorLog` มีข้อมูลชนิด String เสมอ ปราศจากปัญหา Elasticsearch Type Mapping Conflict ทำให้ระบบรวบรวม Log (Kibana/Elasticsearch) บันทึก Log ได้ครบถ้วน 100% โดยไม่มีการโยนข้อมูลทิ้ง
2. **Complete Request Traceability**: สามารถใช้ **Correlation ID** เพียงค่าเดียวสืบค้นแกะรอย Log ตั้งแต่การเริ่มเรียก API, การประมวลผลภายใน, การทำธุรกรรมทางฐานข้อมูล, ตลอดจนการส่งต่อผ่าน Kafka Consumer/Producer ได้ครอบคลุมตั้งแต่ต้นจนจบโดยสายสัมพันธ์ของ Log ไม่ขาดตอน
3. **Clean Code & Secure Main Branch**: โค้ดที่ไม่ได้มาตรฐาน ลืมลบตัวแปรทิ้ง หรือมีช่องโหว่ความปลอดภัย จะโดนบล็อกตั้งแต่ขั้นตอน Pull Request (PR) ผ่าน `golangci-lint` และ Sonar Quality Gate ช่วยให้โค้ดที่สาขา `develop` สะอาดอยู่เสมอ
4. **Enhanced Dashboard Queryability**: หน้า Dashboard หรือระบบแจ้งเตือน (Kibana/CloudWatch) แสดง Log Message หลักที่กระชับและบอกเหตุการณ์จริง (เช่น `"Failed to verify confirmation token"`) ทำให้อ่านเข้าใจได้ทันที และสามารถฟิลเตอร์หาข้อมูลได้จากระดับ Flat metadata (เช่น `order_request_id`) ได้ง่ายขึ้น

### ตัวอย่างรูปแบบ Log และ Response ที่คาดหวัง

#### A. โครงสร้าง Log ในคลังข้อมูล (Kibana/Elasticsearch Log Schema)

* **เมื่อเกิดข้อผิดพลาด (Error Log in Handler Layer):**
  * คีย์ `error_log` เป็น String ธรรมดา
  * ข้อมูลแวดล้อม เช่น `order_request_id` ถูกดันขึ้นเป็น Flat key
  * มีคีย์ `X-Correlation-ID` สแตมป์อยู่เสมอเพื่อแกะรอย

```json
{
  "level": "error",
  "time": "2026-06-08T20:50:00+07:00",
  "message": "Failed to verify confirmation token",
  "error_log": "invalid token signature or token expired",
  "function": "WhiteGloveHandler.ConfirmWithdrawOrder",
  "order_request_id": "c19b38de-824f-4d32-8419-f538bb8b191c",
  "X-Correlation-ID": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "service_name": "order-service"
}
```

* **Access Log จากระบบ HTTP Middleware (Access Log):**

```json
{
  "level": "info",
  "time": "2026-06-08T20:50:01+07:00",
  "message": "Access Log",
  "http_method": "POST",
  "http_path": "/api/v1/orders/withdraw/confirm",
  "http_status": 400,
  "latency_ms": 124,
  "X-Correlation-ID": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "service_name": "order-service"
}
```

#### B. โครงสร้าง Response ที่ส่งกลับหา Client (HTTP Response Payload)

เมื่อระบบเกิด Error หรือทำงานล้มเหลว จะต้องส่ง Response Body ที่สอดคล้องกับโครงสร้าง Response ของไลบรารีกลุ่มพัฒนา (`httpserv.Response`) ซึ่งมีโครงสร้าง JSON มาตรฐานโดยแสดง **X-Correlation-ID** แนบอยู่ภายใต้ฟิลด์ `data` และแสดง Error Code 5 หลัก (เช่นระบบเทรด `90001` หรืออื่นๆ) ในฟิลด์ `code`:

```json
{
  "code": "90001",
  "message": "Failed to verify confirmation token. Please check your token or try again.",
  "data": {
    "X-Correlation-ID": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
  }
}
```

---

#### C. ตัวอย่างการจัดการ Error ในแต่ละ Layer (Multi-layer Error Handling & Logging)

เรายึดตามหลักการ **"Log Once, Wrap with Context"** (บันทึก Log เพียงครั้งเดียวที่ขอบนอกสุด และส่งต่อ Error พร้อมข้อมูลบริบท) เพื่อหลีกเลี่ยงการพ่น Log ซ้ำซ้อนและสิ้นเปลืองทรัพยากรจัดเก็บ

* **กรณีศึกษา:** เกิดข้อผิดพลาด Database Connection Timeout ตอนสั่งบันทึกข้อมูล Order

##### 1. ชั้น Repository (Database Layer)
* **พฤติกรรม:** ทำหน้าที่ติดต่อฐานข้อมูล หากเกิด Error ให้ใช้วิธี **Wrap Error** ส่งขึ้นไปด้านบน **โดยห้ามสั่งบันทึก Log ระดับ ERROR เด็ดขาด**

```go
func (r *OrderRepository) Save(ctx context.Context, order *entities.Order) error {
    if err := r.db.WithContext(ctx).Create(order).Error; err != nil {
        // ห้ามเรียก logs.ErrorWithContext ที่นี่ แต่ให้ wrap และส่งขึ้นไปหา Service
        return fmt.Errorf("repository: failed to insert order row: %w", err)
    }
    return nil
}
```

##### 2. ชั้น Service (Business Logic Layer)
* **พฤติกรรม:** รับ Error จาก Repository แล้วทำการ **Wrap Error** เพิ่มข้อมูลบริบททางธุรกิจ (Business context เช่น ID, user) แล้วส่งขึ้นไปด้านบน **โดยห้ามสั่งบันทึก Log ระดับ ERROR เด็ดขาด**

```go
func (s *OrderService) PlaceOrder(ctx context.Context, req *entities.PlaceOrderReq) error {
    // ... ประมวลผล logic
    if err := s.orderRepo.Save(ctx, order); err != nil {
        // ห้ามเรียก logs.ErrorWithContext ที่นี่ แต่ให้ wrap context ทางธุรกิจเพิ่มแล้วส่งขึ้นไปหา Handler
        return fmt.Errorf("service: failed to place order (customer_id: %s): %w", req.CustomerID, err)
    }
    return nil
}
```

##### 3. ชั้น Handler (Outermost / Presentation Layer)
* **พฤติกรรม:** เป็นด่านนอกสุดที่รับ Request และจัดการ Response **เป็นจุดเดียวใน Lifecycle ของ Request นี้ที่รับผิดชอบพ่น Log ระดับ ERROR** โดยจะบันทึกพร้อมค่า Correlation ID และส่ง HTTP Response ที่แนบ `X-Correlation-ID` กลับไปหา Client

```go
func (h *OrderHandler) CreateOrder(req *httpserv.Request) (*httpserv.Response, error) {
    ctx := req.Request.Context()
    placeOrderReq := new(entities.PlaceOrderReq)
    
    if err := req.JSONBodyTo(placeOrderReq); err != nil {
        return &httpserv.Response{StatusCode: 400, Message: "Invalid Request Body"}, err
    }
    
    if err := h.orderService.PlaceOrder(ctx, placeOrderReq); err != nil {
        // พ่น Log ERROR เพียงจุดเดียวของ request นี้
        logs.ErrorWithContext(ctx, "Failed to create order transaction", map[string]any{
            "error_log":        err.Error(), // แสดงผลลัพธ์สาย Error ทั้งหมดที่ถูก Wrap ขึ้นมา
            "order_request_id": placeOrderReq.RequestID,
            "function":         "OrderHandler.CreateOrder",
        })
        
        return &httpserv.Response{
            StatusCode: 500,
            Code:       constants.CodeTradingServiceMaintenance, // ดึงรหัส Error Code 5 หลักจาก Constants ("90000")
            Message:    "Failed to create order transaction due to internal server issue.",
            Data:       map[string]any{"X-Correlation-ID": GetCorrelationID(ctx)},
        }, err
    }
    
    return &httpserv.Response{StatusCode: 200, Message: "Order created successfully"}, nil
}
```

##### 4. ผลลัพธ์สุดท้ายบนคลังข้อมูล (Kibana / Elasticsearch Output Log)
เมื่อเปิดดู Log ที่ถูกพ่นจาก Handler ด่านสุดท้ายใน Kibana จะได้หน้าตาข้อมูลที่รวบรวมสายความเสียหายจากทุก Layer ไว้อย่างเป็นระบบ โดยไม่มี Log อื่นพ่นซ้ำซ้อนให้รกคลังข้อมูล:

```json
{
  "level": "error",
  "time": "2026-06-08T20:53:00+07:00",
  "message": "Failed to create order transaction",
  "error_log": "service: failed to place order (customer_id: cus_9988): repository: failed to insert order row: database connection timeout",
  "function": "OrderHandler.CreateOrder",
  "order_request_id": "req_11223344",
  "X-Correlation-ID": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "service_name": "order-service"
}
```

---

## 🧪 Verification Plan

### Automated Verification
1. **Lint Verification**: รัน `make lint` หรือ `golangci-lint run` ต้องไม่มี warning และ error เกี่ยวกับการใช้งานตัวแปร หรือ context ที่ผิดรูป
2. **Unit Tests**: รันชุดสอบวิเคราะห์ใน handler และ service (`go test ./...`) ผลทดสอบต้องผ่านทั้งหมด 100%

### Manual Verification
1. **Elasticsearch/Kibana Logging Check**:
   - ลองกระตุ้น event ให้เกิดการเขียน Log ในฟังก์ชันที่ปรับปรุงใหม่
   - ตรวจดูใน Kibana ว่าคีย์ `error_log` มีสถานะเป็นชนิด String ล้วน และไม่มี Mapping Conflict เกิดขึ้น
   - ตรวจสอบฟิลด์ `X-Correlation-ID` (หรือ Correlation ID key) ใน Kibana เพื่อสืบค้น log ที่ไหลเชื่อมโยงกันตั้งแต่ HTTP Request ไปยัง Service และ Database ได้ครบถ้วน
