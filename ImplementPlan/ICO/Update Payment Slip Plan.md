# Goal Description

วิเคราะห์และเสนอแนะ Field ที่ต้องเพิ่มใน Response ของ API `GetOrderOfferingStatusOrGenerateQR` เพื่อให้ Frontend สามารถแสดงผลหน้าจอ "การชำระเงิน" (ภาพที่ 2) ได้อย่างสมบูรณ์

  

ตาม Design ในภาพที่ 2 มีส่วนที่เพิ่มเข้ามาจากภาพที่ 1 ในส่วนของหน้าจอ คือ:

1. **ยอดคงเหลือที่ต้องชำระ (Remaining Amount):** ยอดเงิน 1,000,000.00 บาท ที่หักลบจากยอดทั้งหมดเมื่อมีการชำระบางส่วนแล้ว

2. **รายการหลักฐานการชำระเงิน (Uploaded Payment Slips):** List ของสลิปที่อัปโหลดไปแล้ว ซึ่งแสดงรูปย่อ, ชื่อไฟล์, และจำนวนเงิน และมีปุ่มลบ (Delete)

  

## Implemented Changes ✅

  

> ดำเนินการเสร็จสมบูรณ์แล้ว — Implement ครบทั้ง 3 ไฟล์

  

### 1. ไฟล์ `handler/order_offering_response.go`

  

เพิ่ม **`RemainingAmount`** ใน `GetOrderOfferingStatusOrGenerateQROrderResponse`:

  

```go

type GetOrderOfferingStatusOrGenerateQROrderResponse struct {

Status enum.SubscriptionOrderStatus `json:"status"`

OrderID string `json:"order_id"`

IsCancelableOrder bool `json:"is_cancelable_order"`

IsCutoffTime bool `json:"is_cutoff_time"`

TotalAmount float64 `json:"total_amount"`

RemainingAmount *float64 `json:"remaining_amount,omitempty"`

}

```

  

เพิ่ม **`PaymentSlips`** ใน `GetOrderOfferingStatusOrGenerateQRPaymentResponse`:

  

```go

type GetOrderOfferingStatusOrGenerateQRPaymentResponse struct {

PaymentChannel string `json:"payment_channel"`

PaymentDate *time.Time `json:"payment_date"`

BankCode string `json:"bank_code"`

BankShortCode string `json:"bank_short_code"`

BankName string `json:"bank_name"`

BankAccountNumber string `json:"bank_account_number"`

BankAccountName string `json:"bank_account_name"`

Status enum.PaymentStatus `json:"status"`

BankFullName string `json:"bank_full_name"`

BankColorHeader string `json:"bank_color_header"`

BankColorAccount string `json:"bank_color_account"`

Branch string `json:"branch"`

ProjectPaymentInformation PaymentInformation `json:"project_payment_information"`

PaymentSlips []PaymentSlipResponse `json:"payment_slips"`

}

```

  

`PaymentSlipResponse` ที่ใช้:

  

```go

type PaymentSlipResponse struct {

Index int `json:"index"`

Amount *float64 `json:"amount"`

PaymentDate *time.Time `json:"payment_date"`

SlipImage SlipImageResponse `json:"slip_image"`

}

```

  

### 2. ไฟล์ `pkg/order_offering/service_io.go`

  

`GetOrderOfferingStatusOrGenerateQROrderOutput` (เพิ่ม `RemainingAmount`):

  

```go

type GetOrderOfferingStatusOrGenerateQROrderOutput struct {

Status enum.SubscriptionOrderStatus

OrderID string

IsCancelableOrder bool

IsCutoffTime bool

TotalAmount float64

RemainingAmount *float64

}

```

  

`GetOrderOfferingStatusOrGenerateQRPaymentOutput` (เพิ่ม `PaymentSlips`):

  

```go

type GetOrderOfferingStatusOrGenerateQRPaymentOutput struct {

PaymentChannel string

PaymentDate *time.Time

BankCode string

BankShortCode string

BankName string

BankAccountNumber string

BankAccountName string

Status enum.PaymentStatus

CustomerAccountFullNameTH string

CustomerAccountFullNameEn string

BankColorHeader string

BankColorAccount string

Branch string

ProjectPaymentInformation PaymentInformation

PaymentSlips []PaymentSlipOutput

}

```

  

`PaymentSlipOutput` ที่ใช้:

  

```go

type PaymentSlipOutput struct {

Index int

Amount *float64

PaymentDate *time.Time

SlipImage SlipImageOutput

}

```

  

### 3. ไฟล์ `pkg/order_offering/service.go`

  

ฟังก์ชัน `getOrderOfferingWithPaymentInfo` คำนวณ `RemainingAmount` และดึง `PaymentSlips` แบบ On-the-fly:

  

- ใช้ Library `git.xspringas.com/xas/library/decimal/decimal` ป้องกัน Floating Point Precision Error

- แยก case การชำระเงินด้วย `switch`:

- **Transfer / Bill Payment:** `paidAmount = decimal.NewFromFloat(payment.TotalAmountBankOrBillPayment())`

- **Cheque:** `paidAmount = decimal.NewFromFloat(payment.TotalAmountChequePayment())`

- **QR Payment:** `paidAmount = orderAmount` เมื่อ `payment.IsSuccess()` เท่านั้น (ชำระครบ), กรณีอื่น `paidAmount = 0`

- Clamp: หาก `remainingAmount < 0` จะถูก override เป็น `decimal.Zero`

- ดึง `PaymentSlips` ผ่าน `buildPaymentSlips` เฉพาะกรณี Bank Transfer หรือ Bill Payment เท่านั้น

  

```go

orderAmount := decimal.NewFromFloat(order.OrderAmount())

paidAmount := decimal.NewFromFloat(0)

  

switch {

case payment.IsBankTransfer() || payment.IsBillPayment():

paidAmount = decimal.NewFromFloat(payment.TotalAmountBankOrBillPayment())

case payment.IsCheque():

paidAmount = decimal.NewFromFloat(payment.TotalAmountChequePayment())

case payment.IsQRPayment():

if payment.IsSuccess() {

paidAmount = orderAmount

}

}

  

remainingAmountDec := orderAmount.Sub(paidAmount)

if remainingAmountDec.LessThan(decimal.Zero) {

remainingAmountDec = decimal.Zero

}

remainingAmountF, _ := remainingAmountDec.Float64()

remainingAmount := utils.ToPointer(remainingAmountF)

  

paymentSlipsOutput := make([]PaymentSlipOutput, 0)

if payment.IsBankTransfer() || payment.IsBillPayment() {

paymentSlips, err := service.buildPaymentSlips(ctx, payment, input.OrderRequestId)

if err != nil {

// log error, skip slips

} else {

paymentSlipsOutput = paymentSlips

}

}

```

  

## Verification Plan

1. **Bank Transfer — ยังไม่อัปโหลดสลิป:** `remaining_amount == total_amount`, `payment_slips == []`

2. **Bank Transfer — อัปโหลดสลิปบางส่วน:** `remaining_amount` ลดลงตามยอดสลิปที่แนบ, `payment_slips` มีข้อมูล `url`, `name`, `amount` ครบ

3. **QR Payment — ชำระครบแล้ว (`IsSuccess()`):** `remaining_amount == 0`

4. **QR Payment — ยังไม่ชำระ:** `remaining_amount == total_amount`, `payment_slips == []`