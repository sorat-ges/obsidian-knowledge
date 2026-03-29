
## Background


ปัจจุบัน handler แต่ละตัวใช้ `validateStringField()` (regex check `'|"|;|--|/*|*/|\\|#`) และ `validateSortParams()` (whitelist check) เพื่อป้องกัน SQL injection ที่ handler layer

  

**แต่ที่ repository layer ทุก method ใช้ `clause.OrderByColumn` ของ GORM (safe parameterized query) อยู่แล้ว** และ search fields ทั้งหมดใช้ GORM parameterized queries (`Where("... ILIKE ?", value)`) ดังนั้น SQL injection ผ่าน user input จึง **ไม่สามารถเกิดขึ้นได้** ที่ DB layer

  

เราจึงสามารถเปลี่ยนจากการ validate แบบ manual ใน handler มาใช้ `validate` tags บน struct แทนได้ (แบบเดียวกับ `OrderListQuery` ใน `handler/model/order.go`)

  

## Reference Pattern: Standard Validation Block

  

ทุก handler ที่รับ Query Parameters ควรมีโครงสร้างการตรวจสอบดังนี้ เพื่อความปลอดภัยสูงสุด (Defense-in-depth) และความสม่ำเสมอ (Consistency):

  

```go

// 1. Syntax Check: ตรวจรูปแบบ URL encoding (ป้องกัน malformed query string)

if _, err := url.ParseQuery(req.Request.URL.RawQuery); err != nil {

logs.WarnWithContext(ctx, "Invalid query string encoding", map[string]interface{}{logs.ErrorLog: err})

return nil, &httpserv.Response{StatusCode: http.StatusBadRequest, Code: "400", Message: enum.InvalidRequest.String()}

}

  

// 2. Binding: แปลงข้อมูลลง Struct (Type Conversion)

if err := req.BindQuery(&query); err != nil {

return nil, &httpserv.Response{StatusCode: http.StatusBadRequest, Code: "400", Message: enum.InvalidRequest.String()}

}

  

// 3. Schema Check: ตรวจสอบเงื่อนไขข้อมูล (Whitelist/Min/Max)

if err := query.Validate(); err != nil {

// ใช้ Helper function แปลง error ให้ User อ่านรู้เรื่อง

return nil, &httpserv.Response{StatusCode: http.StatusBadRequest, Code: "400", Message: model.FormatValidationError(err)}

}

```

  

## Global Prerequisites

  

> ทำก่อนเริ่ม refactor handler ใดๆ

  

- [x] **P1**: ตรวจสอบว่า project มี `github.com/go-playground/validator/v10` (มีอยู่แล้ว)

- [x] **P2**: สร้าง **Global Validator Instance** ใน `handler/model/validator.go` พร้อม register custom validator `comma_oneof`:

```go

var CommonValidator = func() *validator.Validate {

v := validator.New()

v.RegisterValidation("comma_oneof", validateCommaOneOf)

return v

}()

```

- [x] **P3**: สร้าง **Helper Function** และ **Custom Validator** ใน `handler/model/validator.go`:

```go

func FormatValidationError(err error) string { ... }

// ผลลัพธ์: "field 'order' failed on 'oneof' validation (created_at)"

  

// Custom tag สำหรับ field ที่รับหลายค่าคั่นด้วย comma เช่น "QR,BANK_TRANSFER"

func validateCommaOneOf(fl validator.FieldLevel) bool { ... }

// Usage: `validate:"comma_oneof=val1 val2 val3"`

```

  

---

  

## Method 1: GetWhiteGloveCustomers

  

**File:** `handler/white_glove_handler.go` (line ~586)

**Struct file:** `handler/white_glove_dto.go`

  

### Current Struct

```go

type WhiteGloveCustomersRequest struct {

Page *int `form:"page" binding:"omitempty,min=1"`

Limit *int `form:"limit" binding:"omitempty,min=1,max=100"`

Search string `form:"search"`

Sort string `form:"sort"`

}

```

  

### New Struct

```go

type WhiteGloveCustomersRequest struct {

Page *int `form:"page" binding:"omitempty,min=1"`

Limit *int `form:"limit" binding:"omitempty,min=1,max=100"`

Search string `form:"search" validate:"omitempty,max=255"`

Sort string `form:"sort" validate:"omitempty,oneof=asc desc"`

}

```

  

### Checklist

- [ ] 1.1: แก้ struct `WhiteGloveCustomersRequest` ใน `handler/white_glove_dto.go` — เพิ่ม `validate` tags

- [ ] 1.2: เพิ่ม method `Validate()` ให้ struct โดยใช้ `model.CommonValidator`

- [ ] 1.3: ใน `handler/white_glove_handler.go` function `GetWhiteGloveCustomers`:

- ปรับใช้ **Standard Validation Block** (ParseQuery -> BindQuery -> Validate)

- ลบ call `validateStringField` และ `validateSortParams` เดิมออก

- [ ] 1.4: ทดสอบ — ส่ง request ปกติ, sort=asc, sort=desc, sort=invalid, search ยาวเกิน 255 ตัวอักษร

  

---

  

## Method 2: GetTradeOrders

  

**File:** `handler/order_trade_handler.go` (line ~482)

**Struct file:** `handler/order_trade_handler.go` (inline struct `OrderTradeListRequest`)

  

### New Struct

```go

type OrderTradeListRequest struct {

Search string `form:"search" validate:"omitempty,max=255"`

Page int `form:"page" validate:"omitempty,min=1"`

PerPage int `form:"per_page" validate:"omitempty,min=1,max=100"`

Status string `form:"status" validate:"omitempty,max=100"`

Statuses []enum.SwapOrderCustomerStatus

TradingPair string `form:"trading_pair" validate:"omitempty,max=100"`

TradingPairs []string `form:"trading_pair"`

CreatedDateStart string `form:"created_date_start" validate:"omitempty,max=50"`

CreatedDateEnd string `form:"created_date_end" validate:"omitempty,max=50"`

Side string `form:"side" validate:"omitempty,max=50"`

Sides []enum.OrderCryptoSwapSide

Symbols []string `json:"symbols"`

MatchedCurrencies []string `json:"matched_currencies"`

OrderTypes []string `form:"order_type" json:"order_type"`

Sort string `form:"sort" validate:"omitempty,oneof=created_at updated_at price"`

Order string `form:"order" validate:"omitempty,oneof=asc desc ASC DESC"`

}

```

  

### Checklist

- [ ] 2.1: แก้ struct `OrderTradeListRequest` — เพิ่ม `validate` tags

- [ ] 2.2: เพิ่ม method `Validate()` ให้ struct โดยใช้ `model.CommonValidator`

- [ ] 2.3: ใน function `GetTradeOrders`:

- ปรับใช้ **Standard Validation Block**

- ลบ loop `validateStringField` ทั้ง 7 fields และ `validateSortParams` ออก

- [ ] 2.4: ทดสอบ — sort=created_at, sort=invalid, order=asc, order=invalid

  

---

  

## Method 3: SubscriptionOrderList

  

**File:** `handler/order_offering.go` (line ~419)

**Struct file:** `handler/order_offering_request.go`

  

### New Struct

```go

type GetSubscriptionOrderListRequest struct {

PerPage int `form:"per_page" validate:"omitempty,min=1,max=100"`

Page int `form:"page" validate:"omitempty,min=1"`

Status string `form:"status" validate:"omitempty,max=100"`

Search string `form:"search" validate:"omitempty,max=255"`

FieldSort string `form:"field_sort" validate:"omitempty,oneof=created_at order_date"`

FieldSortType string `form:"field_sort_type" validate:"omitempty,oneof=asc desc ASC DESC none"`

Filters []FilterOfGetSubscriptionOrderListRequest `form:"filters"`

}

  

type FilterOfGetSubscriptionOrderListRequest struct {

FieldName string `form:"field_name" validate:"omitempty,oneof=order_type payment_method"`

ValueStart string `form:"value_start" validate:"omitempty,max=255"`

ValueEnd string `form:"value_end" validate:"omitempty,max=255"`

QueryOperation string `form:"query_operation" validate:"omitempty,oneof=equal between"`

}

```

  

### Checklist

- [ ] 3.1: แก้ struct `GetSubscriptionOrderListRequest` และ `FilterOfGetSubscriptionOrderListRequest` — เพิ่ม `validate` tags

- [ ] 3.2: เพิ่ม method `Validate()` โดยใช้ `model.CommonValidator` (รวมการ validate nested slice `Filters` โดยใช้ `dive` tag)

- [ ] 3.3: ใน function `SubscriptionOrderList`:

- ปรับใช้ **Standard Validation Block**

- ลบ calls: `validateStringField`, `validateSortParams`, `validateFilterFields`, `validateStringSlice` ออก

- [ ] 3.4: ทดสอบ — field_sort=created_at, field_sort=invalid, filters with valid/invalid field_name

  

---

  

## Method 4: ICOCustomerList

  

**File:** `handler/order_offering_placement.go` (line ~179)

**Struct file:** `handler/order_offering_request.go`

  

### Checklist

- [ ] 4.1: แก้ struct `IcoCustomerListRequest` — เพิ่ม `validate` tags (`max=255`, `min=1`, `max=100`)

- [ ] 4.2: ใน function `ICOCustomerList`: ปรับใช้ **Standard Validation Block** และลบการเช็ค manual ออก

- [ ] 4.3: ทดสอบ — search ปกติ, search ยาวเกิน 255

  

---

  

## Method 5: GetPaginatedFiatDepositOrders

  

**File:** `handler/order_fiat.go` (line ~604)

**Struct file:** `handler/model/fiat_deposit.go` (ใหม่)

  

### New Struct

```go

type FiatDepositSearchRequest struct {

Query string `form:"q" validate:"omitempty,max=255"`

Sort string `form:"sort" validate:"omitempty,oneof=asc desc ASC DESC"`

Order string `form:"order" validate:"omitempty,oneof=created_at"`

Page int `form:"page" validate:"omitempty,min=0"`

Limit int `form:"limit" validate:"omitempty,min=0,max=100"`

StartDate *time.Time `form:"start_date"`

EndDate *time.Time `form:"end_date"`

PaymentMethod string `form:"payment_method" validate:"omitempty,comma_oneof=QR BANK_TRANSFER"`

OrderStatus string `form:"order_status" validate:"omitempty,comma_oneof=order-request order-confirm sync-ledger completed prepare-reject cancelled rejected"`

PaymentStatus string `form:"payment_status" validate:"omitempty,comma_oneof=processing success to-be-refunded cancelled failed refunded"`

}

```

  

### Checklist

- [x] 5.1: สร้าง `FiatDepositSearchRequest` ใน `handler/model/fiat_deposit.go` พร้อม validate tags

- ใช้ `comma_oneof` สำหรับ `PaymentMethod`, `OrderStatus`, `PaymentStatus` เนื่องจาก field เหล่านี้รับหลายค่าคั่นด้วย comma

- [x] 5.2: ใน function `GetPaginatedFiatDepositOrders`: ปรับใช้ **Standard Validation Block** (BindQuery → Validate) และลบ `validateStringField` + `validateSortParams` ออก

- [x] 5.3: ทดสอบ — q=test, order=created_at, order=invalid, q ยาวเกิน 255 (ทุก test pass)

  

---

  

## Method 6: GetPaginatedFiatWithdrawOrders

  

**File:** `handler/order_fiat.go` (line ~2139)

**Struct file:** `internal/entities/order_withdraw_fiat.go`

  

### Checklist

- [ ] 6.1: แก้ struct `PaginatedFiatWithdrawRequestQuery` — เพิ่ม `validate` tags (`oneof=created_at`, `oneof=asc desc ASC DESC`)

- [ ] 6.2: ใน function `GetPaginatedFiatWithdrawOrders`: ปรับใช้ **Standard Validation Block**

- [ ] 6.3: ทดสอบ — order=created_at, order=invalid, sort=desc

  

---

  

## Method 7: GetPaginatedWithdrawCryptoOrders

  

**File:** `handler/order_crypto.go` (line ~2137)

**Struct file:** `internal/entities/order_withdraw_crypto.go`

  

### Checklist

- [ ] 7.1: แก้ struct `PaginatedOrderWithdrawCryptoRequestQuery` — เพิ่ม `validate` tags (Allowed: `created_at`, `updated_at`, `order_date`, `order_id`, `status`, `status_date`)

- [ ] 7.2: ใน function `GetPaginatedWithdrawCryptoOrders`: ปรับใช้ **Standard Validation Block**

- [ ] 7.3: ทดสอบ — sort=created_at, sort=invalid, order=asc

  

---

  

## Method 8: GetDepositOrders

  

**File:** `handler/order_crypto.go` (line ~1008)

**Struct file:** `handler/order_crypto_request.go`

  

### Checklist

- [ ] 8.1: แก้ struct `DepositOrderSearchParamsRequest` — เพิ่ม `validate` tags (`oneof=asc desc`)

- [ ] 8.2: ใน function `GetDepositOrders`: ปรับใช้ **Standard Validation Block**

- [ ] 8.3: ทดสอบ — sort=asc, sort=desc, sort=invalid

  

---

  

## Cleanup (หลังทำครบทุก method)

  

- [ ] C1: ตรวจสอบว่า `validateStringField`, `validateSortParams`, `validateStringSlice`, `validateFilterFields` ยังถูกใช้ที่ไหนอีกหรือไม่

- [ ] C2: ถ้าไม่มีคนใช้แล้ว → ลบออกจาก `handler/sort_validation.go` และลบ `sqlInjectionPattern` regex

- [ ] C3: Run `go build ./...` และ `go test ./...`

  

---

  

## Summary: ประโยชน์ของการ refactor ครั้งนี้

  

| ประโยชน์ | รายละเอียด |

|-------|-----------|

| **Security** | เปลี่ยนจาก Regex (Blacklist) มาเป็น Struct Tags (Whitelist) ที่แม่นยำกว่า |

| **Performance** | ใช้ Global Validator instance เดียวกันทั้งโปรเจกต์ ลดการใช้ Memory |

| **Maintainability** | กฎการ Validate อยู่ที่ Struct (Declarative) ทำให้อ่านง่ายและแก้ไขที่เดียว |

| **UX/DX** | Error message ชัดเจนขึ้น (เช่นบอกชัดว่า sort ต้องเป็น asc/desc เท่านั้น) |

| **Consistency** | ทุก handler มีรูปแบบการจัดการ Request แบบเดียวกัน (Standard Validation Block) |