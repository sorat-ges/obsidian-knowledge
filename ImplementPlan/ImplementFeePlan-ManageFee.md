---
title: Fee Logic Refactor Plan
tags: [trading, fees, implementation-plan]
status: active
created: 2026-02-01
last-updated: 2026-02-12
---

# Fee Logic Refactor Implementation Plan

**Navigation**: [[Home]] | Implementation Plans

## Overview
Refactor `getPossibleFeeRate` to return only ONE transaction fee with simplified selection logic.

**IMPORTANT**: Additional fee logic is **removed entirely**. No more `IsIncludeAdditionalFee` concept.

## Requirements

1. **Return single fee** as value, not array: `(ResponseGetPossibleFeeRate, error)`
2. **Ordering**: Priority ASC → Fee Rate ASC → SyncedAt ASC
3. **Filter conditions**: CustomerTier, RouteName, OnboardingDay, OnboardingDate, VolumeSize, Symbol
4. **Match**: Return first matching fee (ALL conditions must match - AND logic)
5. **Flat rate**: Treated same as conditional fees - sorted by priority. If `Condition` is empty, `IsMatch()` returns `true` (matches all).
6. **Error when no fee found**: Return error instead of empty array
7. **⚠️ BUG FIX**: Check BOTH StartDate AND EndDate for ALL fees (current code only checks StartDate for non-onboarding fees)
8. **Remove IsIncludeAdditionalFee**: No additional fee concept anymore

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
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │   Check StartDate & EndDate   │  ← ⚠️ NEW: Filter by date range
              │   now >= StartDate            │     (fixes bug where expired fees used)
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
              │   - Conditional: check if ALL │
              │     conditions match (AND)    │
              │   - Flat rate: no condition   │
              │     = always matches          │
              └───────────────┬───────────────┘
                              │
                              ▼
         ┌────────────────────────────────┐
         │  First matching fee?  → RETURN │
         │  No match?            → nil    │
         └────────────────────────────────┘
```

**Note:** Flat rate (no condition) is treated like any other fee. Its `IsMatch()` returns `true` for all params. If a flat rate has lower priority number than conditional fees, it will be selected first.

---

## Bug Fix: Expired Fee Handling

### Problem
In the current implementation, `getPossibleFeeRate()` only checks `StartDate` for non-onboarding fees. It does NOT check `EndDate`, meaning **expired campaign fees are still being used**.

### Current Behavior
```go
// Line 345-364 in service_fee_rate.go
func getPossibleFeeRate(...) []domain.TransactionFee {
    nowTime := utils.GetTimeNow()
    for _, tf := range transactionFee {
        // ✅ Checks StartDate
        if nowTime.Unix() > tf.Data.StartDate.Unix() {
            // Adds fee to list...
            // ❌ NO EndDate check!
        }
    }
}
```

**Impact**: Campaign fees with `EndDate` in the past are still returned and used.

### Functions That DO Check EndDate
| Function | Checks EndDate | Scope |
|----------|----------------|-------|
| `validateOnboardingCondition()` | ✅ Yes | Only onboarding fees |
| `validateAdditionalFee()` | ✅ Yes | Only additional fees |
| `getPossibleFeeRate()` | ❌ **No** | Main fee selection - **BUG** |

### New Behavior
All fees now check BOTH StartDate AND EndDate:
```go
// Skip fees that haven't started
if now.Before(tf.Data.StartDate) {
    continue
}

// Skip expired fees (BUG FIX)
if tf.Data.EndDate != nil && now.After(*tf.Data.EndDate) {
    continue
}
```

### Example Scenario
```
Campaign "New Year Promo":
- Fee: 0.1%
- StartDate: 2024-01-01
- EndDate: 2024-01-31

Current date: 2024-02-15 (EXPIRED)

Old behavior: ✅ Fee is used (BUG - doesn't check EndDate)
New behavior: ❌ Fee is skipped (correct - expired)
```

---

## Code Changes Summary

### Files to Modify

| File | Change Type | Lines | Notes |
|------|-------------|-------|-------|
| `pkg/order_trade/output.go` | REMOVE field | 1 line | Remove `IsIncludeAdditionalFee` |
| `pkg/order_trade/input.go` | ADD new struct | ~10 lines | Add `FeeFilterCondition` |
| `pkg/order_trade/service.go` | CHANGE signature | 2 lines | Interface: return type + remove `CalculateTotalFeeRate` |
| `pkg/order_trade/service_fee_rate.go` | REMOVE old functions | ~450 lines | All additional fee functions removed |
| `pkg/order_trade/service_fee_rate.go` | MODIFY functions | ~100 lines | Simplify `GetPossibleFeeRate` |
| `pkg/order_trade/service_fee_rate.go` | ADD new logic | ~100 lines | New `getPossibleFeeRate` + helper |
| `pkg/order_trade/z_mock_iorder_trade_service.go` | REGENERATE | - | Mock file |
| `pkg/order_crypto/service.go` | UPDATE callers | 2 places | Use new return type |
| `pkg/order_trade/webhook_service.go` | UPDATE caller | 1 place | Use new return type |
| `pkg/order_trade/service_fee_rate_test.go` | UPDATE tests | ~15 tests | Update assertions |
| `pkg/order_crypto/service_test.go` | UPDATE tests | ~5 tests | Update mocks |

### Additional Cleanup (Post-Refactoring)

| File | Change Type | Lines | Notes |
|------|-------------|-------|-------|
| `internal/domain/transaction_fee.go` | REMOVE struct | ~5 lines | Remove `SelectedFee` struct (no longer used) |
| `internal/domain/transaction_fee.go` | REMOVE field | 1 line | Remove `IsIncludeAdditionalFee` from `TransactionFeeDB` |
| `internal/constants/enum/transaction_fee.go` | DELETE FILE | ~13 lines | Remove unused `PossibleFeeRateType` enum |

**Net change**: ~350 lines reduction (in service_fee_rate.go alone) + ~20 lines cleanup in domain layer

**Breaking Changes**: ✅ YES - Production code changes required (3-4 call sites)

---

## Detailed Changes

### 1. Add New Filter Structure

**File**: `pkg/order_trade/input.go`

**Location**: After line 188 (after `RequestGetPossibleFeeRate`)

```go
// FeeFilterCondition defines the filter parameters for fee selection
type FeeFilterCondition struct {
    CustomerTier   *string
    RouteName      *string
    OnboardingDay  *int
    OnboardingDate *string
    VolumeSize     *string  // e.g., "bulk", "normal" - matches SwapOrderInput.VolumeSize
    Symbol         *string  // e.g., "BTC", "ETH", "USDT" - cryptocurrency symbol
}
```

---

### 2. Add Helper Function

**File**: `pkg/order_trade/service_fee_rate.go`

**Location**: After imports section

```go
// buildFilterParams constructs the parameters map for IsMatch() validation
func buildFilterParams(filter FeeFilterCondition, customerAccount *entities.CustomerAccount) map[string]any {
    params := map[string]any{}

    if filter.CustomerTier != nil {
        params["customer_tier"] = *filter.CustomerTier
    } else if customerAccount != nil {
        params["customer_tier"] = customerAccount.CustomerTier()
    }

    if filter.RouteName != nil {
        params["route"] = *filter.RouteName
    }

    if filter.OnboardingDay != nil {
        params["onboarding_day"] = *filter.OnboardingDay
    }

    if filter.OnboardingDate != nil {
        params["onboarding_date"] = *filter.OnboardingDate
    }

    if filter.VolumeSize != nil {
        params["volume_size"] = *filter.VolumeSize
    }

    if filter.Symbol != nil {
        params["symbol"] = *filter.Symbol
    }

    return params
}
```

---

### 3. Rewrite getPossibleFeeRate()

**File**: `pkg/order_trade/service_fee_rate.go`

**Location**: Replace lines 345-364

```go
// isValidFee checks if a fee is within valid date range (StartDate <= now <= EndDate)
func isValidFee(tf domain.TransactionFee, now time.Time) bool {
    if now.Before(tf.Data.StartDate) {
        return false
    }
    if tf.Data.EndDate != nil && now.After(*tf.Data.EndDate) {
        return false
    }
    return true
}

// getPossibleFeeRate returns a single transaction fee based on filter conditions.
// It sorts ALL valid fees by (Priority ASC → FeeValue ASC → SyncedAt ASC),
// then returns the first fee where IsMatch() returns true.
//
// IMPORTANT: This function checks BOTH StartDate AND EndDate for all fees.
// This fixes the bug in the old implementation where expired fees (EndDate < now)
// were still being returned for non-onboarding fees.
//
// Note: Flat rate (no Condition) is treated like any other fee. Its IsMatch()
// returns true for all params. If a flat rate has lower priority than conditional
// fees, it will be selected first.
func getPossibleFeeRate(
    transactionFee []domain.TransactionFee,
    filter FeeFilterCondition,
    customerAccount *entities.CustomerAccount,
) *domain.TransactionFee {

    now := utils.GetTimeNow()
    validFees := []domain.TransactionFee{}

    // Filter valid date range
    for _, tf := range transactionFee {
        if isValidFee(tf, now) {
            validFees = append(validFees, tf)
        }
    }

    // Build filter params
    params := buildFilterParams(filter, customerAccount)

    // Sort ALL fees by Priority ASC, then FeeValue ASC, then SyncedAt ASC
    sort.Slice(validFees, func(i, j int) bool {
        if validFees[i].Data.Priority != validFees[j].Data.Priority {
            return validFees[i].Data.Priority < validFees[j].Data.Priority
        }
        feeI := validFees[i].GetFeeValue()
        feeJ := validFees[j].GetFeeValue()
        if !feeI.Equal(feeJ) {
            return feeI.LessThan(feeJ)
        }
        // If Priority and FeeValue are equal, sort by SyncedAt (oldest first)
        return validFees[i].Data.SyncedAt.Before(validFees[j].Data.SyncedAt)
    })

    // Return first matching fee
    for _, fee := range validFees {
        if fee.IsMatch(params) {
            return &fee
        }
    }

    // No match found
    return nil
}
```

---

### 4. Simplify GetPossibleFeeRate()

**File**: `pkg/order_trade/service_fee_rate.go`

**Location**: Replace lines 17-87

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
        CustomerTier:   nil, // Will use customerAccount.CustomerTier() in buildFilterParams
        RouteName:      request.RouteName,
        OnboardingDay:  onboardingDay,
        OnboardingDate: onboardingDate,
        VolumeSize:     request.VolumeSize,   // Support for bulk/normal volume type
        Symbol:         utils.ToPointer(product.Symbol),  // Support for symbol-specific fees (e.g., "ETH")
    }

    selectedFee := getPossibleFeeRate(transactionFee, filter, customerAccount)

    if selectedFee == nil {
        return ResponseGetPossibleFeeRate{}, errors.New("no fee rate available")
    }

    return ResponseGetPossibleFeeRate{
        TransactionType: enum.OrderType(selectedFee.Data.TransactionType),
        FeeType:         selectedFee.Data.FeeType,
        Name:            selectedFee.Data.Name,
        FeeValue:        utils.ToNilUnPointer(selectedFee.Data.FeeValue),
        FeeUnit:         utils.ToNilUnPointer(selectedFee.Data.FeeUnit),
        // IsIncludeAdditionalFee: REMOVED - no additional fee concept
    }, nil
}
```

---

### 5. Remove IsIncludeAdditionalFee from Response

**File**: `pkg/order_trade/output.go`

**Location**: Line 150

```go
// BEFORE
type ResponseGetPossibleFeeRate struct {
    TransactionType        enum.OrderType
    FeeType                string
    Name                   string
    FeeValue               decimal.Decimal
    FeeUnit                string
    IsIncludeAdditionalFee bool  // ← REMOVE this line
}

// AFTER
type ResponseGetPossibleFeeRate struct {
    TransactionType        enum.OrderType
    FeeType                string
    Name                   string
    FeeValue               decimal.Decimal
    FeeUnit                string
}
```

---

### 6. Add Import

**File**: `pkg/order_trade/service_fee_rate.go`

**Location**: Import section

Add `"sort"` to imports if not already present.

---

### 7. Design Decisions

#### Symbol Field Handling

**Decision**: Symbol is derived from `product.Symbol` inside the service, NOT passed by the caller.

**Rationale**:
- **Simpler API**: Callers don't need to extract and pass the symbol manually
- **Consistency**: Symbol always matches the actual product being traded
- **Error Prevention**: Eliminates potential bugs from mismatched symbols between ProductId and Symbol
- **Maintainability**: One less field for callers to manage

**Implementation**:
```go
// In GetPossibleFeeRate function
filter := FeeFilterCondition{
    CustomerTier:   nil,
    RouteName:      request.RouteName,
    OnboardingDay:  onboardingDay,
    OnboardingDate: onboardingDate,
    VolumeSize:     request.VolumeSize,
    Symbol:         utils.ToPointer(product.Symbol),  // ← Derived from product
}
```

**Alternative Considered**: Adding `Symbol *string` to `RequestGetPossibleFeeRate` and requiring callers to pass it. This was rejected because it adds complexity without benefit.

---

## Feature: Volume Size Filter (Bulk Trade Support)

### Overview
Support for `volume_size` parameter allows different fee rates based on trade volume type (e.g., "bulk" vs "normal").

### Use Case
Provide lower fees for bulk/large volume trades to incentivize larger transactions.

### Database Records

**Bulk Trade Fee**:
```json
{
  "name": "Bulk Trade Special Fee",
  "fee_value": 0.05,
  "fee_unit": "percent",
  "priority": 1,
  "condition": [
    {"param_name":"customer_tier","operator":"equal","value":2},
    {"param_name":"volume_size","operator":"equal","value":"bulk"}
  ],
  "start_date": "2024-01-01T00:00:00Z"
}
```

**Normal Trade Fee**:
```json
{
  "name": Standard Fee",
  "fee_value": 0.5,
  "fee_unit": "percent",
  "priority": 10,
  "condition": [
    {"param_name":"customer_tier","operator":"equal","value":2}
  ],
  "start_date": "2024-01-01T00:00:00Z"
}
```

### Code Changes Required

**Update `RequestGetPossibleFeeRate` in `input.go`**:
```go
type RequestGetPossibleFeeRate struct {
    CustomerAccountId uuid.UUID
    TransactionType   enum.OrderType
    RouteName         *string
    ProductId         uuid.UUID
    VolumeSize        *string  // ← Add for bulk trade support
    // Note: FeeRateType removed - no longer needed
    // Note: Symbol derived from product.Symbol inside the service (not passed by caller)
}
```

**Implementation in `GetPossibleFeeRate`**:
```go
// Symbol is derived from product, not passed by caller
filter := FeeFilterCondition{
    CustomerTier:   nil, // Will use customerAccount.CustomerTier() in buildFilterParams
    RouteName:      request.RouteName,
    OnboardingDay:  onboardingDay,
    OnboardingDate: onboardingDate,
    VolumeSize:     request.VolumeSize,
    Symbol:         utils.ToPointer(product.Symbol),  // ← Derived from product
}
```

**Design Decision**: Symbol is derived from `product.Symbol` inside the service rather than being passed by the caller. This approach:
- Keeps the API simpler (callers don't need to extract/pass symbol)
- Ensures consistency (symbol always matches the actual product)
- Reduces potential errors from mismatched symbols

### Example Flow

**Scenario: VIP customer places bulk trade**

```
1. Customer: Tier 2 (VIP)
2. Order: BTC/THB, VolumeSize = "bulk"
3. Filter: {customer_tier: "2", volume_size: "bulk"}

4. Fee Selection:
   - Bulk Trade Fee (priority 1, fee 0.05%) → Match! ✅
   - Return: 0.05% fee
```

---

## Feature: Symbol Filter (Coin-Specific Fees)

### Overview
Support for `symbol` parameter allows different fee rates for specific cryptocurrencies (e.g., ETH, BTC, USDT). This enables **AND logic** with multiple conditions - ALL conditions must match.

### Use Case
Provide special fees for specific coins or promote trading of certain cryptocurrencies.

### Database Records

**ETH Special Fee for Tier 99**:
```json
{
  "name": "ETH Special Fee for Tier 99",
  "fee_value": 0.02,
  "fee_unit": "percent",
  "priority": 1,
  "condition": [
    {"param_name":"customer_tier","operator":"equal","value":99},
    {"param_name":"symbol","operator":"equal","value":"ETH"}
  ],
  "start_date": "2024-01-01T00:00:00Z"
}
```

**BTC Standard Fee**:
```json
{
  "name": "BTC Standard Fee",
  "fee_value": 0.5,
  "fee_unit": "percent",
  "priority": 10,
  "condition": [
    {"param_name":"customer_tier","operator":"equal","value":99}
  ],
  "start_date": "2024-01-01T00:00:00Z"
}
```

### Code Changes Required

**Note**: Symbol field is **NOT added** to `RequestGetPossibleFeeRate`. Instead, it is derived from `product.Symbol` inside the service. See the "Volume Size Filter" section above for the implementation details.

**Current `RequestGetPossibleFeeRate` in `input.go`**:
```go
type RequestGetPossibleFeeRate struct {
    CustomerAccountId uuid.UUID
    TransactionType   enum.OrderType
    RouteName         *string
    ProductId         uuid.UUID
    VolumeSize        *string  // e.g., "bulk", "normal" - for bulk trade support
    // Note: FeeRateType removed - no longer needed
    // Note: Symbol derived from product.Symbol inside the service (not passed by caller)
}
```

**Symbol Filter Implementation**:
The symbol is automatically extracted from the product inside `GetPossibleFeeRate`:
```go
filter := FeeFilterCondition{
    // ... other fields ...
    Symbol: utils.ToPointer(product.Symbol),  // ← Derived from product
}
```

### Example Flow

**Scenario: Tier 99 customer trades ETH**

```
1. Customer: Tier 99
2. Order: ETH/THB swap
3. Filter: {customer_tier: "99", symbol: "ETH"}

4. Fee Selection (AND Logic - all must match):
   - ETH Special Fee (tier=99 AND symbol=ETH) → Match! ✅
   - Return: 0.02% fee
```

**Scenario: Tier 99 customer trades BTC**

```
1. Customer: Tier 99
2. Order: BTC/THB swap
3. Filter: {customer_tier: "99", symbol: "BTC"}

4. Fee Selection:
   - ETH Special Fee (tier=99 AND symbol="ETH") → No match ❌ (symbol ไม่ตรง)
   - BTC Standard Fee (tier=99) → Match! ✅
   - Return: 0.5% fee
```

### AND Logic Explanation

The `IsMatch()` function in `domain.TransactionFee` uses **AND logic**:

```go
// From internal/domain/transaction_fee.go
func (t TransactionFee) IsMatch(params map[string]any) bool {
    conditions, err := t.parseConditions()
    // ...

    for _, condition := range conditions {
        if !t.evaluateCondition(condition, params) {
            return false  // ← ANY condition fails = return false
        }
    }
    return true  // ← ALL conditions pass = return true
}
```

**Test Matrix** (for ETH fee with tier=99 AND symbol=ETH):

| customer_tier | symbol | Match? |
|---------------|--------|--------|
| 99 | "ETH" | ✅ Yes |
| 99 | "BTC" | ❌ No (symbol) |
| 2 | "ETH" | ❌ No (tier) |
| 2 | "BTC" | ❌ No (both) |

---

## Functions to Remove

The following functions in `service_fee_rate.go` can be **completely removed**:

### Additional Fee Functions (REMOVED - no additional fee concept)
| Function | Lines | Reason |
|----------|-------|--------|
| `validateSelectedFee()` | 89-154 | Old multi-fee selection logic |
| `setSelectedFeeForMaxType()` | 156-186 | Part of old selection |
| `setSelectedFeeForMinType()` | 188-218 | Part of old selection |
| `setSelectedAdditionalFee()` | 220-225 | Part of old selection |
| `validateAdditionalFee()` | 227-249 | **REMOVED** - no additional fee |
| `getMatchAddFeeAndMatchAddFeeValue()` | 251-272 | **REMOVED** - no additional fee |
| `setAdditionalFeeForMaxType()` | 274-296 | **REMOVED** - no additional fee |
| `setAdditionalFeeForMinType()` | 298-320 | **REMOVED** - no additional fee |

### Old Onboarding Functions (replaced by filter condition)
| Function | Lines | Reason |
|----------|-------|--------|
| `checkMatchCustomerTierAndRoute()` | 366-376 | Replaced by IsMatch() |
| `checkOnboardingDay()` | 487-498 | Moved to filter condition |
| `checkOnboardingDate()` | 500-508 | Moved to filter condition |
| `isOpenDateInRange()` | 432-455 | Part of onboarding - no longer needed |
| `hasConditionParam()` | 457-469 | Part of onboarding - no longer needed |
| `validateOnboardingCondition()` | 471-485 | Part of onboarding - no longer needed |

---

## Functions to Keep (Unchanged)

| Function | Lines | Purpose |
|----------|-------|---------|
| `getProductAndCustomerAccAndTxnFee()` | 322-343 | Fetches product, account, and transaction fees |
| `calculateDaysSinceOpenDate()` | 378-388 | Calculate days since account opened |
| `CalculateFeeAmountForBuy()` | 416-422 | Calculate fee amount for buy |
| `CalculateFeeAmountForSell()` | 400-406 | Calculate fee amount for sell |
| `CalculateNetAmountForBuy()` | 424-430 | Calculate net amount for buy |
| `CalculateNetAmountForSell()` | 408-414 | Calculate net amount for sell |

### Functions to Remove from Interface
| Function | Reason |
|----------|--------|
| `CalculateTotalFeeRate()` | **REMOVED** - No longer needed (return single fee, not array) |

---

## Test Updates

Update tests in `pkg/order_trade/service_fee_rate_test.go`:

### Test Cases to Add

1. **Test returns conditional fee when match found**
   - Setup: 3 fees with different priorities
   - Filter matches middle priority fee
   - Expect: Middle priority fee returned

2. **Test returns flat rate when no conditional match**
   - Setup: 2 conditional fees (no match), 1 flat rate
   - Filter doesn't match any conditional
   - Expect: Flat rate returned

3. **Test returns nil when no match and no flat rate**
   - Setup: 2 conditional fees (no match), no flat rate
   - Filter doesn't match any
   - Expect: nil returned

4. **Test sorting by priority then fee value**
   - Setup: 3 fees - (priority 2, fee 1.0), (priority 1, fee 0.5), (priority 1, fee 0.3)
   - Filter matches all
   - Expect: priority 1, fee 0.3 returned

5. **Test skips future fees**
   - Setup: 1 current fee, 1 future fee (start_date > now)
   - Expect: Only current fee considered

6. **Test skips expired fees (EndDate check) - ⚠️ BUG FIX TEST**
   - Setup: 1 active fee (now within range), 1 expired fee (end_date < now)
   - Expect: Only active fee considered, expired fee skipped
   - **Note**: This test validates the bug fix where old code didn't check EndDate for non-onboarding fees

7. **Test with onboarding day filter**
   - Setup: Fee with onboarding_day condition
   - Filter with matching onboarding_day
   - Expect: Matching fee returned

8. **Test with onboarding date filter**
   - Setup: Fee with onboarding_date condition
   - Filter with matching onboarding_date
   - Expect: Matching fee returned

---

## Call Sites Verification

Search for all callers to ensure compatibility:

```bash
grep -r "GetPossibleFeeRate" --include="*.go"
```

Current known callers (MUST BE UPDATED):
- `pkg/order_crypto/service.go:803` - `GetSwapLimitEstimated()`
- `pkg/order_trade/webhook_service.go:405` - `insertOrderTransactionAndExchange()`
- `pkg/order_trade/service.go:1251` - `GetSwapBuyRouteWithNewRemarketer()`
- `pkg/order_trade/service.go:1335` - `GetSwapSellRouteWithNewRemarketer()`

**BREAKING CHANGE**: All callers must be updated from `[]ResponseGetPossibleFeeRate` to `ResponseGetPossibleFeeRate, error`.

---

## Implementation Checklist

### Phase 1: Core Changes
- [ ] Remove `IsIncludeAdditionalFee` from `ResponseGetPossibleFeeRate` in `output.go`
- [ ] Add `FeeFilterCondition` struct to `input.go`
- [ ] Add `buildFilterParams()` helper function
- [ ] Rewrite `getPossibleFeeRate()` function **with EndDate check (bug fix)**
- [ ] Add `"sort"` import if needed

### Phase 2: Update GetPossibleFeeRate
- [ ] Change return type to `(ResponseGetPossibleFeeRate, error)`
- [ ] Return error when no fee found (instead of empty array)
- [ ] Remove additional fee fetching logic (lines 32-53)

### Phase 3: Update Interface & Mock
- [ ] Update `IOrderTradeService` interface in `service.go`
- [ ] Remove `CalculateTotalFeeRate` from interface
- [ ] Regenerate `z_mock_iorder_trade_service.go`

### Phase 4: Update Callers
- [ ] Update `pkg/order_crypto/service.go` (2 places)
- [ ] Update `pkg/order_trade/webhook_service.go` (fix bug - add nil check)
- [ ] Update `pkg/order_trade/service.go` (2 places)

### Phase 5: Remove Old Functions
- [ ] Remove `validateSelectedFee()` + related (6 functions)
- [ ] Remove additional fee functions (4 functions)
- [ ] Remove old onboarding functions (5 functions)

### Phase 6: Tests
- [ ] Update unit tests (~15 tests)
- [ ] **Add test for expired fee handling (EndDate check)**
- [ ] Run existing tests to verify no regressions
- [ ] Update integration tests if needed

### Phase 7: Deploy
- [ ] Code review
- [ ] Deploy to staging for testing

---

## Rollback Plan

If issues arise:
1. Revert `service_fee_rate.go`, `output.go`, `input.go`, `service.go` to previous version
2. Regenerate mock file
3. Re-run tests to verify restoration

Keep git commit with old implementation for easy rollback.

---

## Success Criteria

- [ ] All existing tests pass
- [ ] New tests for single-fee selection pass
- [ ] Fee selection returns exactly one fee or error
- [ ] Flat rate returned as fallback when no conditional match
- [ ] Sorting works correctly (priority → fee value)
- [ ] ⚠️ **BUG FIX VALIDATED**: Expired fees (EndDate < now) are not returned
- [ ] No performance regression
- [ ] All 3-4 call sites updated and tested
- [ ] Code review approved
