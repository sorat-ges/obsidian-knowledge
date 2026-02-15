---
title: Fee Logic Refactor Plan with Additional Fee (Combined)
tags: [trading, fees, implementation-plan]
status: active
created: 2026-02-13
last-updated: 2026-02-13
---

# Fee Logic Refactor Implementation Plan (with Additional Fee - Combined)

**Navigation**: [[Home]] | Implementation Plans

## Overview
Refactor `getPossibleFeeRate` ให้คืนค่า **FEE เดียว** ที่ **รวม Additional Fee เข้าไปแล้ว** (ถ้ามี)

**Key Changes**:
- ✅ **Keep Additional Fee** concept - ดึงจาก `FEE_TYPE_ADDITIONAL_FEE`
- ❌ **Remove MIN/MAX selection** - ใช้ Priority-based sorting แทน
- ✅ **Return single fee object** - FeeValue ที่คืนมาคือ "ค่ารวม"
- ✅ **Fix EndDate bug** - เช็คทั้ง StartDate และ EndDate
- ✅ **Combine logic** - Additional fee จะถูกบวกเข้า FeeValue หลักทันที

---

## Requirements

### Main Requirements
1. **Return single fee object**: `(ResponseGetPossibleFeeRate, error)`
2. **Ordering**: Priority ASC → FeeValue ASC → SyncedAt ASC
3. **Filter conditions**: CustomerTier, RouteName, OnboardingDay, OnboardingDate, VolumeSize, Symbol
4. **Match**: Return first matching fee (ALL conditions must match - AND logic)
5. **Flat rate**: Treated same as conditional fees

### Additional Fee Requirements
6. **Fetch Additional Fee** from `FEE_TYPE_ADDITIONAL_FEE`
7. **Filter Additional Fee** by: Symbol, Route, StartDate, EndDate
8. **Select Additional Fee** by: Priority ASC → FeeValue ASC → SyncedAt ASC
9. **IsIncludeAdditionalFee flag**:
   - `true` = FeeValue **รวม** additional fee แล้ว
   - `false` = FeeValue **ไม่รวม** → ต้องบวก additional fee เพิ่ม
10. **Final FeeValue** = Main Fee + Additional Fee (ถ้าไม่รวม)

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Fee Filter Condition                         │
│  CustomerTier | RouteName | OnboardingDay | OnboardingDate |    │
│  VolumeSize (bulk/normal) | Symbol (e.g., "BTC", "ETH")         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TransactionFees (from DB)                     │
│                    Fee Type: FEE (Main Fee)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │   Check StartDate & EndDate   │
              │   now >= StartDate            │
              │   (EndDate == nil OR          │
              │    now <= EndDate)            │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   Sort ALL valid fees by:     │
              │   1. Priority ASC             │
              │   2. FeeValue ASC             │
              │   3. SyncedAt ASC (oldest)    │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   Loop through sorted fees    │
              │   Check IsMatch(params)       │
              └───────────────┬───────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  First match?     │
                    └─────────┬─────────┘
                      │           │
                     Yes          No
                      │           │
                      ▼           ▼
          ┌───────────────────┐  return error
          │  Selected Main Fee│
          │  Check IsInclude  │
          │  AdditionalFee?   │
          └─────────┬─────────┘
                    │
          ┌─────────┴─────────┐
          │ IsIncludeAddFee?  │
          └─────────┬─────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
        true                  false
         │                     │
         ▼                     ▼
    Use FeeValue      ┌─────────────────────┐
    as-is            │ Get Additional Fee  │
                     │ from DB (ADDITIONAL)│
                     └─────────┬───────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Filter + Sort       │
                    │ Return first match  │
                    └─────────┬───────────┘
                               │
                               ▼
                    FeeValue + AdditionalFeeValue
                               │
                               ▼
                    Return Response (combined)
```

---

## Response Structure

```go
// Response with COMBINED fee value
type ResponseGetPossibleFeeRate struct {
    TransactionType enum.OrderType
    FeeType         string
    Name            string           // ชื่อ Main Fee
    FeeValue        decimal.Decimal  // ค่ารวม (Main + Additional ถ้ามี)
    FeeUnit         string
}
```

**ไม่มี field แยก Additional Fee** - เพราะค่าที่คืนมาคือ **ค่ารวมแล้ว**

---

## Calculation Logic

```go
// Pseudo code
mainFee := selectMainFee(...)

if mainFee.IsIncludeAdditionalFee {
    // Fee นี้รวม additional fee อยู่แล้ว
    finalFeeValue = mainFee.FeeValue
} else {
    // ต้องไปหา additional fee
    additionalFee := selectAdditionalFee(...)

    if additionalFee != nil {
        finalFeeValue = mainFee.FeeValue + additionalFee.FeeValue
    } else {
        finalFeeValue = mainFee.FeeValue
    }
}

return ResponseGetPossibleFeeRate{
    FeeValue: finalFeeValue,  // ← ค่ารวม
    // ...
}
```

---

## Example Scenarios

### Scenario 1: Main Fee รวม Additional Fee อยู่แล้ว

```
Input:
- Symbol: BTC
- Route: "bitcoin_thailand"

Database:
- Main Fee A:
  * FeeValue: 0.5%
  * IsIncludeAdditionalFee: true
  * Priority: 1

- Additional Fee X:
  * FeeValue: 0.1%
  * Condition: {symbol: BTC}

Calculation:
- Main Fee.IsIncludeAdditionalFee = true
- Final FeeValue = 0.5% (ใช้ค่าตรงนี้ เพราะรวมแล้ว)

Output:
{
    Name: "Fee A",
    FeeValue: 0.5,     ← รวมแล้ว
    FeeUnit: "percent"
}
```

### Scenario 2: Main Fee ไม่รวม + มี Additional Fee

```
Input:
- Symbol: BTC
- Route: "bitcoin_thailand"

Database:
- Main Fee A:
  * FeeValue: 0.3%
  * IsIncludeAdditionalFee: false
  * Priority: 1

- Additional Fee X:
  * FeeValue: 0.1%
  * Priority: 1
  * Condition: {symbol: BTC}

Calculation:
- Main Fee.IsIncludeAdditionalFee = false
- Get Additional Fee = 0.1%
- Final FeeValue = 0.3% + 0.1% = 0.4%

Output:
{
    Name: "Fee A",
    FeeValue: 0.4,     ← รวมเข้าด้วยกันแล้ว
    FeeUnit: "percent"
}
```

### Scenario 3: Main Fee ไม่รวม + ไม่มี Additional Fee

```
Input:
- Symbol: ETH
- Route: "ether_thailand"

Database:
- Main Fee B:
  * FeeValue: 0.3%
  * IsIncludeAdditionalFee: false
  * Priority: 1

- Additional Fee: ไม่มี match

Calculation:
- Main Fee.IsIncludeAdditionalFee = false
- Additional Fee = null
- Final FeeValue = 0.3% (เท่าเดิม)

Output:
{
    Name: "Fee B",
    FeeValue: 0.3,
    FeeUnit: "percent"
}
```

---

## Code Changes

### Files to Modify

| File | Change Type | Lines | Notes |
|------|-------------|-------|-------|
| `pkg/order_trade/service_fee_rate.go` | ADD function | ~50 lines | Add `selectAdditionalFee()` |
| `pkg/order_trade/service_fee_rate.go` | MODIFY function | ~30 lines | Update `GetPossibleFeeRate()` |

---

### 1. Add selectAdditionalFee Function

**File**: `pkg/order_trade/service_fee_rate.go`

```go
// selectAdditionalFee returns a single additional fee based on filter conditions.
// Additional fees are filtered by Symbol and Route, sorted by Priority.
func selectAdditionalFee(
    additionalFeeList []domain.TransactionFee,
    symbol string,
    routeName *string,
) *domain.TransactionFee {

    now := utils.GetTimeNow()
    validFees := []domain.TransactionFee{}

    // Filter by date range
    for _, af := range additionalFeeList {
        if !isValidFee(af, now) {
            continue
        }

        // Check if matches symbol and route
        params := map[string]any{}
        if symbol != "" {
            params["symbol"] = symbol
        }
        if routeName != nil {
            params["route"] = *routeName
        }

        // If has conditions, check match. If no conditions, matches all.
        matched := af.IsMatch(params)
        if matched || len(af.Data.Condition) == 0 {
            validFees = append(validFees, af)
        }
    }

    // Sort by Priority ASC, then FeeValue ASC, then SyncedAt ASC
    sort.Slice(validFees, func(i, j int) bool {
        if validFees[i].Data.Priority != validFees[j].Data.Priority {
            return validFees[i].Data.Priority < validFees[j].Data.Priority
        }
        feeI := validFees[i].GetFeeValue()
        feeJ := validFees[j].GetFeeValue()
        if !feeI.Equal(feeJ) {
            return feeI.LessThan(feeJ)
        }
        return validFees[i].Data.SyncedAt.Before(validFees[j].Data.SyncedAt)
    })

    // Return first (highest priority) additional fee
    if len(validFees) > 0 {
        return &validFees[0]
    }

    return nil
}
```

---

### 2. Update GetPossibleFeeRate Function

**File**: `pkg/order_trade/service_fee_rate.go`

```go
func (s *orderTradeService) GetPossibleFeeRate(
    request RequestGetPossibleFeeRate,
) (ResponseGetPossibleFeeRate, error) {

    product, customerAccount, transactionFee, err := s.getProductAndCustomerAccAndTxnFee(request)
    if err != nil {
        return ResponseGetPossibleFeeRate{}, err
    }

    // Calculate onboarding values for filter
    var onboardingDay *int
    var onboardingDate *string
    if customerAccount != nil {
        days := calculateDaysSinceOpenDate(customerAccount.OpenDate())
        onboardingDay = &days

        openDateStr := customerAccount.OpenDate().Format("2006-01-02")
        onboardingDate = &openDateStr
    }

    filter := FeeFilterCondition{
        CustomerTier:   nil,
        RouteName:      request.RouteName,
        OnboardingDay:  onboardingDay,
        OnboardingDate: onboardingDate,
        VolumeSize:     request.VolumeSize,
        Symbol:         utils.ToPointer(product.Symbol),
    }

    selectedFee := getPossibleFeeRate(transactionFee, filter, customerAccount)

    if selectedFee == nil {
        return ResponseGetPossibleFeeRate{}, errors.New("no fee rate available")
    }

    // Calculate final fee value (main + additional if not included)
    finalFeeValue := utils.ToNilUnPointer(selectedFee.Data.FeeValue)

    // Only fetch additional fee if main fee doesn't include it
    if !selectedFee.Data.IsIncludeAdditionalFee {
        additionalFeeList, err := s.transactionFeeRepository.GetTransactionFeeTx(
            nil,
            constants.COMPANY_CODE_XD,
            request.TransactionType.String(),
            constants.FEE_TYPE_ADDITIONAL_FEE,
        )

        if err == nil && len(additionalFeeList) > 0 {
            additionalFee := selectAdditionalFee(
                additionalFeeList,
                product.Symbol,
                request.RouteName,
            )

            if additionalFee != nil {
                additionalFeeValue := utils.ToNilUnPointer(additionalFee.Data.FeeValue)
                finalFeeValue = finalFeeValue.Add(additionalFeeValue)
            }
        }
    }

    return ResponseGetPossibleFeeRate{
        TransactionType: enum.OrderType(selectedFee.Data.TransactionType),
        FeeType:         selectedFee.Data.FeeType,
        Name:            selectedFee.Data.Name,
        FeeValue:        finalFeeValue,  // ← Combined value
        FeeUnit:         utils.ToNilUnPointer(selectedFee.Data.FeeUnit),
    }, nil
}
```

---

## Logic Summary

### Main Fee Selection
1. Filter by StartDate/EndDate
2. Sort by Priority → FeeValue → SyncedAt
3. Return first match with IsMatch()

### Additional Fee Selection (ถ้าต้องการ)
1. Only fetch if `IsIncludeAdditionalFee == false`
2. Filter by StartDate/EndDate
3. Filter by Symbol/Route (if condition exists)
4. Sort by Priority → FeeValue → SyncedAt
5. Return first match
6. **Add to Main Fee value**

### Final Response
- **FeeValue** = Main Fee + Additional Fee (ถ้ามีและไม่รวม)
- Caller ไม่ต้องคำนวณอะไรเพิ่ม - ค่าที่ได้คือค่าสุดท้ายที่ใช้จ่าย

---

## Functions to Keep

| Function | Purpose | Status |
|----------|---------|--------|
| `GetPossibleFeeRate()` | Main entry point | ✅ Modified |
| `getPossibleFeeRate()` | Main fee selection | ✅ Existing |
| `selectAdditionalFee()` | Additional fee selection | ✅ New |
| `buildFilterParams()` | Build IsMatch params | ✅ Existing |
| `isValidFee()` | Date range validation | ✅ Existing |
| `getProductAndCustomerAccAndTxnFee()` | Fetch base data | ✅ Existing |
| `calculateDaysSinceOpenDate()` | Onboarding calculation | ✅ Existing |
| `CalculateFeeAmountForBuy/Sell()` | Fee calculation | ✅ Existing |
| `CalculateNetAmountForBuy/Sell()` | Net calculation | ✅ Existing |

---

## Implementation Checklist

### Phase 1: Add Additional Fee Selection
- [ ] Add `selectAdditionalFee()` function

### Phase 2: Update GetPossibleFeeRate
- [ ] Add additional fee fetching logic
- [ ] Calculate combined fee value
- [ ] Keep response structure unchanged (no new fields)

### Phase 3: Tests
- [ ] Test with IsIncludeAdditionalFee = true
- [ ] Test with IsIncludeAdditionalFee = false + has additional fee
- [ ] Test with IsIncludeAdditionalFee = false + no additional fee
- [ ] Run all tests

---

## Success Criteria

- [ ] All existing tests pass
- [ ] Returns single fee object
- [ ] FeeValue = Main + Additional (when applicable)
- [ ] Sorting works by Priority → FeeValue → SyncedAt
- [ ] EndDate check prevents expired fees
- [ ] Response structure unchanged (caller transparent)
