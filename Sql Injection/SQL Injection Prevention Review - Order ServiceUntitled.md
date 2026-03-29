
### Overview

ทั้ง 8 methods ใช้ GORM เป็น ORM layer ซึ่งมีกลไกป้องกัน SQL injection หลัก 3 แนวทาง:

---

### 1. Parameterized Query (`?` placeholder)

ทุก method ที่รับ user input แล้วใส่ใน WHERE clause ใช้ `?` placeholder ทั้งหมด ซึ่ง GORM จะส่งเป็น prepared statement parameter แยกจาก SQL string ทำให้ user input ไม่ถูก interpret เป็น SQL

**Search (LIKE)** - ใช้ใน GetTradeOrders, GetDepositOrders, GetPaginatedFiatWithdrawOrders, GetPaginatedFiatDepositOrders, GetPaginatedWithdrawCryptoOrders, SubscriptionOrderList, GetWhiteGloveCustomers, ICOCustomerList

```go
// ตัวอย่างจาก GetTradeOrders
search := "%" + strings.TrimSpace(strings.ToUpper(input.Search)) + "%"
query = query.Where("ot.order_id ILIKE ? OR CONCAT(...) ILIKE ?", search, search)
```

`%keyword%` ถูกส่งเป็น parameter ไม่ได้ concat เข้าไปใน SQL string โดยตรง ดังนั้นถ้า user ส่ง `'; DROP TABLE --` มันจะถูก treat เป็น literal string ใน LIKE เท่านั้น

**Filter (IN clause)** - ใช้ใน GetTradeOrders, GetDepositOrders, GetPaginatedFiatWithdrawOrders, GetPaginatedFiatDepositOrders, GetPaginatedWithdrawCryptoOrders, SubscriptionOrderList

```go
// ตัวอย่างจาก GetTradeOrders
query = query.Where("UPPER(ot.status) IN (?)", utils.ToUpperSlice(input.Statuses))
```

GORM จะ expand slice เป็น `IN ($1, $2, $3, ...)` แต่ละ value เป็น parameter แยก

**Date Range (BETWEEN / >= / <=)** - ใช้ทุก method ที่มี date filter

```go
query = query.Where("created_at BETWEEN ? AND ?", criteria.CreatedDateStart, criteria.CreatedDateEnd)
```

ค่า date เป็น `time.Time` type ส่งเป็น parameter

---

### 2. Whitelist Validation สำหรับ ORDER BY

ORDER BY เป็นจุดที่ parameterized query ใช้ไม่ได้ เพราะ column name และ direction ไม่ใช่ value แต่เป็น identifier ดังนั้นต้องใช้ whitelist validation แทน

**วิธีที่ใช้ใน codebase (6 methods):**

GetPaginatedFiatWithdrawOrders, GetPaginatedFiatDepositOrders, GetPaginatedWithdrawCryptoOrders, SubscriptionOrderList ใช้ pattern เดียวกัน:

```go
// 1. Validate column name ด้วย whitelist map
if !constants.WithdrawFiatSortColumns[col] {
    col = "created_at"  // fallback to safe default
}

// 2. Validate direction ด้วย whitelist map
if !constants.SortDirections[dir] {
    dir = "DESC"  // fallback to safe default
}

// 3. ใช้ GORM clause.OrderByColumn แทน string concat
query = query.Order(clause.OrderByColumn{
    Column: clause.Column{Name: col},
    Desc:   dir == "DESC",
})
```

ถ้า user ส่ง `sort=created_at; DROP TABLE orders--` มันจะไม่ match whitelist map → fallback เป็น `created_at` โดยอัตโนมัติ

**GetTradeOrders, GetDepositOrders** - column sort เป็น hardcode (`created_at`) ไม่รับจาก user, direction validate แล้วใช้ `clause.OrderByColumn`

**GetWhiteGloveCustomers** - column sort เป็น hardcode (CONCAT ของชื่อ), direction ผ่าน `IsDesc()` ที่ return ได้แค่ `true/false` จาก `strings.EqualFold` แล้วใช้ `clause.OrderByColumn`

**ICOCustomerList** - ไม่มี sort parameter จาก user เลย

---

### 3. Enum Type Casting สำหรับ Status Filter

บาง method เช่น GetPaginatedFiatWithdrawOrders, GetPaginatedWithdrawCryptoOrders แปลง user input เป็น enum type ก่อนส่งเข้า query:

```go
orderStatuses = append(orderStatuses, enum.WithdrawFiatOrderStatus(status))
```

แม้ Go enum (type alias ของ string) จะไม่ได้ validate value จริงๆ แต่เมื่อรวมกับการใช้ `?` placeholder ใน IN clause ก็ป้องกัน injection ได้

---

### สรุปเป็นตาราง

|Method|Search|Filter (IN)|Date Range|ORDER BY|
|---|---|---|---|---|
|GetTradeOrders|`?` param|`?` param|`?` param|hardcode col + `clause.OrderByColumn`|
|GetDepositOrders|`?` param|`?` param|`?` param|hardcode col + `clause.OrderByColumn`|
|GetPaginatedFiatWithdrawOrders|`?` param|`?` param|`?` param|whitelist + `clause.OrderByColumn`|
|GetPaginatedFiatDepositOrders|`?` param|`?` param|`?` param|whitelist + `clause.OrderByColumn`|
|GetPaginatedWithdrawCryptoOrders|`?` param|`?` param|`?` param|whitelist + `clause.OrderByColumn`|
|SubscriptionOrderList|`?` param|`?` param + whitelist field|-|whitelist + `clause.OrderByColumn`|
|GetWhiteGloveCustomers|`?` param|-|-|hardcode col + `clause.OrderByColumn`|
|ICOCustomerList|`?` param|-|-|ไม่มี sort|

ทุก method ป้องกัน SQL injection ครบทุกจุดที่รับ user input ผ่าน parameterized query สำหรับ value และ whitelist validation สำหรับ identifier (column name, sort direction)