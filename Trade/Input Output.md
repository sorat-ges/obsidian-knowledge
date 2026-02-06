# GetPossibleFeeRate - Input/Output

  

## Function Signature

  

```go

func (s *orderTradeService) GetPossibleFeeRate(

request RequestGetPossibleFeeRate,

) (ResponseGetPossibleFeeRate, error)

```

  

Location: `pkg/order_trade/service_fee_rate.go`

  

---

  

## Input

  

### Type: `RequestGetPossibleFeeRate`

  

| Field | Type | Required | Description | Example |

|-------|------|----------|-------------|---------|

| `CustomerAccountId` | `uuid.UUID` | ✅ Yes | Customer Account ID | `uuid.Must(uuid.NewV4())` |

| `TransactionType` | `enum.OrderType` | ✅ Yes | Transaction type | `enum.Swap` |

| `RouteName` | `*string` | No | Exchange/Route name | `"Bitkub"`, `"Binance"` |

| `ProductId` | `uuid.UUID` | ✅ Yes | Product ID | `uuid.Must(uuid.NewV4())` |

| `VolumeSize` | `*string` | No | Volume size for bulk trade | `"bulk"`, `"normal"` |

  

### Go Struct

  

```go

type RequestGetPossibleFeeRate struct {

CustomerAccountId uuid.UUID

TransactionType enum.OrderType

RouteName *string

ProductId uuid.UUID

VolumeSize *string

}

```

  

---

  

## Output

  

### Type: `ResponseGetPossibleFeeRate`

  

| Field | Type | Description | Example |

|-------|------|-------------|---------|

| `TransactionType` | `enum.OrderType` | Transaction type | `Swap` |

| `FeeType` | `string` | Fee type identifier | `"fee"` |

| `Name` | `string` | Fee name | `"Tier 1 Fee"`, `"Campaign New Year"` |

| `FeeValue` | `decimal.Decimal` | Fee rate value | `0.5` (0.5%), `10.0` (flat 10 THB) |

| `FeeUnit` | `string` | Fee unit | `"percent"`, `"flat"` |

  

### Go Struct

  

```go

type ResponseGetPossibleFeeRate struct {

TransactionType enum.OrderType

FeeType string

Name string

FeeValue decimal.Decimal

FeeUnit string

}

```

  

---

  

## Usage Example

  

```go

// Build request

request := ordertrade.RequestGetPossibleFeeRate{

CustomerAccountId: customerAccountId,

TransactionType: enum.Swap,

RouteName: utils.ToPointer("Bitkub"),

ProductId: productId,

VolumeSize: utils.ToPointer("bulk"), // optional

}

  

// Call function

result, err := service.GetPossibleFeeRate(request)

if err != nil {

// Handle error: "no fee rate available" or other errors

return err

}

  

// Use result

fmt.Printf("Fee Name: %s\n", result.Name)

fmt.Printf("Fee Rate: %s %s\n", result.FeeValue.String(), result.FeeUnit)

// Output:

// Fee Name: Bulk Trade Special Fee

// Fee Rate: 0.05 percent

```

  

---

  

## Fee Selection Logic

  

### Priority Order

1. **Conditional Fees** (sorted by Priority ASC → FeeValue ASC)

2. **Flat Rate** (fallback when no condition matches)

  

### Filter Conditions

Fee matching uses **AND logic** - ALL conditions must match:

- `CustomerTier` - from customer account

- `RouteName` - from request

- `OnboardingDay` - days since account opened

- `OnboardingDate` - account open date

- `VolumeSize` - "bulk" or "normal"

- `Symbol` - cryptocurrency symbol (BTC, ETH, etc.)

  

### Date Range Validation

Fees are filtered by:

- ✅ `StartDate <= now` (fee has started)

- ✅ `EndDate == nil OR now <= EndDate` (fee not expired)

  

---

  

## Error Cases

  

| Error | Description |

|-------|-------------|

| `"fail to get product by id"` | Product not found |

| `"fail to get customer account by account id"` | Customer account not found |

| `"fail to get transaction fee"` | Database error fetching fees |

| `"no fee rate available"` | No matching fee found |

  

---

  

## Example Database Records

  

### Conditional Fee (Tier 1 + Bulk)

```json

{

"name": "Bulk Trade Special Fee",

"fee_value": 0.05,

"fee_unit": "percent",

"priority": 1,

"condition": [

{"param_name":"customer_tier","operator":"equal","value":"1"},

{"param_name":"volume_size","operator":"equal","value":"bulk"}

],

"start_date": "2024-01-01T00:00:00Z"

}

```

  

### Flat Rate (Fallback)

```json

{

"name": "Standard Fee",

"fee_value": 0.5,

"fee_unit": "percent",

"priority": 100,

"condition": [],

"start_date": "2024-01-01T00:00:00Z"

}

```

  

---

  

## Call Sites

  

Current usages in codebase:

- `pkg/order_crypto/service.go:759` - `GetSwapLimitEstimated()`

- `pkg/order_trade/service.go:1242` - `GetSwapBuyRouteWithNewRemarketer()`

- `pkg/order_trade/service.go:1330` - `GetSwapSellRouteWithNewRemarketer()`

- `pkg/order_trade/webhook_service.go:397` - `insertOrderTransactionAndExchange()`