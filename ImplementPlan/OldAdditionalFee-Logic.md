# GetPossibleFeeRate - การทำงานของฟังก์ชันคำนวณอัตราค่าธรรมเนียม

## ภาพรวม (Overview)

ฟังก์ชัน `GetPossibleFeeRate` เป็น service method สำหรับค้นหาและคำนวณอัตราค่าธรรมเนียมที่เป็นไปได้สำหรับการทำธุรกรรม โดยพิจารณาจากปัจจัยหลายด้าน รวมถึงค่าธรรมเนียมเพิ่มเติม (Additional Fee)

---

## โฟลว์หลัก (Main Flow)

### 1. ดึงข้อมูลพื้นฐาน (Step 1: Get Base Data)

```
getProductAndCustomerAccAndTxnFee(request)
```

ดึงข้อมูล 3 ส่วน:
- **Product** - ข้อมูลสินทรัพย์/ผลิตภัณฑ์ จาก `productService.GetProductByID()`
- **CustomerAccount** - ข้อมูลบัญชีลูกค้า จาก `customerService.GetAccountByAccountId()`
- **TransactionFee** - รายการค่าธรรมเนียมประเภท FEE จาก `transactionFeeRepository.GetTransactionFeeTx()`

หากดึงข้อมูลไม่สำเร็จ จะ return error ทันที

---

### 2. ค้นหาค่าธรรมเนียมที่เป็นไปได้ (Step 2: Find Possible Fee Rates)

```
getPossibleFeeRate(transactionFee, customerAccount, request.RouteName)
```

กรองค่าธรรมเนียมที่ match กับเงื่อนไข:

| เงื่อนไข | วิธีการตรวจสอบ |
|-----------|-----------------|
| **เวลามีผล** | `nowTime > StartDate` |
| **Customer Tier** | `IsMatch()` กับ `customer_tier` |
| **Route/Exchange** | `IsMatch()` กับ `route` |
| **Onboarding Day** | จำนวนวันตั้งแต่เปิดบัญชี |
| **Onboarding Date** | วันที่เปิดบัญชีตรงกับช่วงระยะเวลา |

ถ้าไม่มีค่าธรรมเนียมที่ match เลย จะ return empty array

---

### 3. ดึงและตรวจสอบ Additional Fee (Step 3: Get & Validate Additional Fee)

```
transactionFeeRepository.GetTransactionFeeTx(FEE_TYPE_ADDITIONAL_FEE)
validateAdditionalFee(...)
```

ดึงรายการค่าธรรมเนียมเพิ่มเติม แล้วกรองหาที่ match กับ:
- Symbol ของสินทรัพย์
- Route ที่ระบุ
- เวลาที่มีผล (`StartDate`)

เลือก Additional Fee ตาม `FeeRateType`:
- **MIN_FEE_RATE** - เลือกค่าน้อยสุด
- **MAX_FEE_RATE** - เลือกค่ามากสุด

เมื่อค่าเท่ากัน จะเลือกตาม **Priority** (น้อยกว่า = ดีกว่า) และ **StartDate** (ใหม่กว่า = ดีกว่า)

---

### 4. เลือกค่าธรรมเนียมที่เหมาะสม (Step 4: Select Best Fee Rate)

```
validateSelectedFee(possibleFeeRate, ...)
```

วนลูปผ่านทุกค่าธรรมเนียมที่เป็นไปได้:

1. คำนวณ `calculatedFeeValue` = `FeeValue` + `AdditionalFeeValue` (ถ้าไม่รวม additional fee)
2. เลือกตาม `FeeRateType`:
   - **MIN_FEE_RATE** - เลือกค่ารวมน้อยสุด
   - **MAX_FEE_RATE** - เลือกค่ารวมมากสุด
3. เมื่อค่าเท่ากัน ใช้ Priority → StartDate เป็นตัวตัดสิน

---

### 5. สร้างผลลัพธ์ (Step 5: Build Result)

```
ResponseGetPossibleFeeRate
```

สร้าง response array ประกอบด้วย:
1. **Fee Rate หลัก** (ถ้ามีการเลือก)
2. **Additional Fee** (ถ้ามีและไม่รวมใน fee หลัก)

---

## Helper Functions สำคัญ

### การตรวจสอบ Onboarding

| Function | วัตถุประสงค์ |
|----------|--------------|
| `checkOnboardingDay()` | ตรวจสอบว่าอยู่ในจำนวนวันที่กำหนด |
| `checkOnboardingDate()` | ตรวจสอบวันที่เปิดบัญช์ตรงกับช่วง |
| `validateOnboardingCondition()` | ตรวจสอบเงื่อนไขพื้นฐานของ onboarding |
| `isOpenDateInRange()` | ตรวจสอบว่า openDate อยู่ใน range |
| `hasConditionParam()` | ตรวจสอบว่ามี condition parameter ที่ต้องการ |

### การเลือกค่าธรรมเนียมแบบ Min/Max

| Function | การทำงาน |
|----------|-----------|
| `setSelectedFeeForMinType()` | เลือก fee ที่น้อยกว่า ถ้าเท่าใช้ Priority/StartDate |
| `setSelectedFeeForMaxType()` | เลือก fee ที่มากกว่า ถ้าเท่าใช้ Priority/StartDate |
| `setAdditionalFeeForMinType()` | เลือก additional fee ที่น้อยกว่า |
| `setAdditionalFeeForMaxType()` | เลือก additional fee ที่มากกว่า |

---

## Logic การเปรียบเทียบเมื่อค่าเท่ากัน

```
เมื่อ calculatedFeeValue เท่ากับ selectedCalculatedFee:

1. Priority น้อยกว่า → ถือว่าดีกว่า (เลือกตัวใหม่)
2. Priority เท่ากัน → StartDate ใหม่กว่า (มากกว่า) → ถือว่าดีกว่า
```

---

## Response Structure

```go
type ResponseGetPossibleFeeRate struct {
    TransactionType        enum.OrderType   // ประเภทธุรกรรม
    FeeType                string           // ประเภทค่าธรรมเนียม
    Name                   string           // ชื่อค่าธรรมเนียม
    FeeValue               decimal.Decimal  // ค่าคำนวณ
    FeeUnit                string           // หน่วย (%, บาท, etc.)
    IsIncludeAdditionalFee bool             // รวม additional fee หรือไม่
}
```

---

## Flow Chart Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    GetPossibleFeeRate                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. getProductAndCustomerAccAndTxnFee                        │
│     - Product, CustomerAccount, TransactionFee (FEE type)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. getPossibleFeeRate                                       │
│     - กรองตาม Customer Tier, Route, Onboarding             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  มีผลลัพธ์?      │
                    └─────────────────┘
                      │           │
                     No          Yes
                      │           │
                      ▼           ▼
              return []    ┌─────────────────────────────────┐
                          │  3. Get Additional Fee List       │
                          │     - กรองตาม Symbol, Route      │
                          └─────────────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────────────┐
                          │  4. validateAdditionalFee        │
                          │     - เลือก Min/Max additional   │
                          └─────────────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────────────┐
                          │  5. validateSelectedFee          │
                          │     - เลือก Min/Max fee rate     │
                          └─────────────────────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────────────┐
                          │  6. Build Response               │
                          │     - Main Fee + Additional Fee   │
                          └─────────────────────────────────┘
                                      │
                                      ▼
                              return result
```
