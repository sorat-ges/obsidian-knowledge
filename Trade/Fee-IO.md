---
title: GetPossibleFeeRate I/O
tags: [trading, api, fees]
status: active
created: 2026-02-01
last-updated: 2026-02-12
---

# GetPossibleFeeRate - Input/Output

**Navigation**: [[Home]] | Trade

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
    TransactionType   enum.OrderType
    RouteName         *string
    ProductId         uuid.UUID
    VolumeSize        *string
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
    FeeType         string
    Name            string
    FeeValue        decimal.Decimal
    FeeUnit         string
}
```

---

## Usage Example

```go
// Build request
request := ordertrade.RequestGetPossibleFeeRate{
    CustomerAccountId: customerAccountId,
    TransactionType:   enum.Swap,
    RouteName:         utils.ToPointer("Bitkub"),
    ProductId:         productId,
    VolumeSize:        utils.ToPointer("bulk"),  // optional
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
    {
      "param_name": "customer_tier",
      "operator": "equal",
      "value": "1"
    },
    {
      "param_name": "volume_size",
      "operator": "equal",
      "value": "bulk"
    }
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

### Mock Fee Scenarios (JSON)

```json
{
  "description": "Mock transaction fee database covering all test scenarios",
  "scenarios": [
    {
      "scenario_name": "1. Basic Flat Rate Fee (No Conditions)",
      "description": "Default fee with empty condition array - matches everyone",
      "fees": [
        {
          "id": "fee-001",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "BTC Trading Fee",
          "priority": 100,
          "condition": [],
          "fee_value": 0.15,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        }
      ]
    },
    {
      "scenario_name": "2. Customer Tier Fees",
      "description": "Different fees based on customer tier",
      "fees": [
        {
          "id": "fee-002",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "customer_tier_0",
          "priority": 100,
          "condition": [],
          "fee_value": 0.15,
          "fee_unit": "percent",
          "start_date": "2024-07-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-07-01T00:00:00Z"
        },
        {
          "id": "fee-003",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "customer_tier_1",
          "priority": 100,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            }
          ],
          "fee_value": 0.12,
          "fee_unit": "percent",
          "start_date": "2024-07-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-07-01T00:00:00Z"
        },
        {
          "id": "fee-004",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "customer_tier_2",
          "priority": 100,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "2"
            }
          ],
          "fee_value": 0.10,
          "fee_unit": "percent",
          "start_date": "2024-07-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-07-01T00:00:00Z"
        }
      ]
    },
    {
      "scenario_name": "3. Campaign Fee - Go Live Onboarding",
      "description": "Time-limited campaign for new users (onboarding <= 15 days)",
      "fees": [
        {
          "id": "fee-005",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Go Live Onboarding",
          "priority": 50,
          "condition": [
            {
              "param_name": "onboarding_day",
              "operator": "less_than_equal",
              "value": 15
            }
          ],
          "fee_value": 0.11,
          "fee_unit": "percent",
          "start_date": "2025-09-15T00:00:00Z",
          "end_date": "2025-10-15T00:00:00Z",
          "is_campaign": true,
          "synced_at": "2025-09-15T00:00:00Z"
        },
        {
          "id": "fee-006",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "customer_tier_0",
          "priority": 100,
          "condition": [],
          "fee_value": 0.15,
          "fee_unit": "percent",
          "start_date": "2024-07-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-07-01T00:00:00Z"
        }
      ]
    },
    {
      "scenario_name": "4. Campaign vs Tier Priority (Lower Fee Wins)",
      "description": "Campaign with lower priority (50) and lower fee beats tier fee",
      "fees": [
        {
          "id": "fee-007",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Go Live Onboarding",
          "priority": 50,
          "condition": [
            {
              "param_name": "onboarding_day",
              "operator": "less_than_equal",
              "value": 15
            }
          ],
          "fee_value": 0.08,
          "fee_unit": "percent",
          "start_date": "2025-09-15T00:00:00Z",
          "end_date": "2025-10-15T00:00:00Z",
          "is_campaign": true,
          "synced_at": "2025-09-15T00:00:00Z"
        },
        {
          "id": "fee-008",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "customer_tier_2",
          "priority": 100,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "2"
            }
          ],
          "fee_value": 0.10,
          "fee_unit": "percent",
          "start_date": "2024-07-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-07-01T00:00:00Z"
        }
      ]
    },
    {
      "scenario_name": "5. Expired Fee Handling (BUG FIX)",
      "description": "Expired campaign should be skipped, active fee selected",
      "fees": [
        {
          "id": "fee-009",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Expired New Year Promo",
          "priority": 1,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            }
          ],
          "fee_value": 0.10,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": "2024-01-31T23:59:59Z",
          "is_campaign": true,
          "synced_at": "2024-01-01T00:00:00Z",
          "note": "EXPIRED - current date is 2024-02-15"
        },
        {
          "id": "fee-010",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Regular Tier 1 Fee",
          "priority": 100,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            }
          ],
          "fee_value": 0.12,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z",
          "note": "ACTIVE - should be selected"
        }
      ]
    },
    {
      "scenario_name": "6. Future Fee Not Selected",
      "description": "Fee with future start date should be skipped",
      "fees": [
        {
          "id": "fee-011",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Future February Promo",
          "priority": 1,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            }
          ],
          "fee_value": 0.08,
          "fee_unit": "percent",
          "start_date": "2024-02-01T00:00:00Z",
          "end_date": null,
          "is_campaign": true,
          "synced_at": "2024-01-01T00:00:00Z",
          "note": "FUTURE - current date is 2024-01-10"
        },
        {
          "id": "fee-012",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Current Tier 1 Fee",
          "priority": 100,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            }
          ],
          "fee_value": 0.12,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z",
          "note": "ACTIVE - should be selected"
        }
      ]
    },
    {
      "scenario_name": "7. Volume Size Filter - Bulk",
      "description": "Special fee for bulk volume trades",
      "fees": [
        {
          "id": "fee-013",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Bulk Trade Special Fee",
          "priority": 1,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            },
            {
              "param_name": "volume_size",
              "operator": "equal",
              "value": "bulk"
            }
          ],
          "fee_value": 0.05,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        },
        {
          "id": "fee-014",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Standard Tier 1 Fee",
          "priority": 10,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            }
          ],
          "fee_value": 0.50,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        }
      ]
    },
    {
      "scenario_name": "8. Symbol Filter - ETH",
      "description": "Special fee for specific cryptocurrency symbol",
      "fees": [
        {
          "id": "fee-015",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "ETH Special Fee",
          "priority": 1,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            },
            {
              "param_name": "symbol",
              "operator": "equal",
              "value": "ETH"
            }
          ],
          "fee_value": 0.02,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        },
        {
          "id": "fee-016",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Standard Tier 1 Fee",
          "priority": 10,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "1"
            }
          ],
          "fee_value": 0.12,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        }
      ]
    },
    {
      "scenario_name": "9. Multiple Conditions AND Logic",
      "description": "All conditions must match (Tier 99 AND ETH AND Bulk)",
      "fees": [
        {
          "id": "fee-017",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "VIP ETH Bulk Special Fee",
          "priority": 1,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "99"
            },
            {
              "param_name": "symbol",
              "operator": "equal",
              "value": "ETH"
            },
            {
              "param_name": "volume_size",
              "operator": "equal",
              "value": "bulk"
            }
          ],
          "fee_value": 0.01,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        },
        {
          "id": "fee-018",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "VIP ETH Fee",
          "priority": 10,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "99"
            },
            {
              "param_name": "symbol",
              "operator": "equal",
              "value": "ETH"
            }
          ],
          "fee_value": 0.02,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        },
        {
          "id": "fee-019",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "VIP Tier 99 Fee",
          "priority": 20,
          "condition": [
            {
              "param_name": "customer_tier",
              "operator": "equal",
              "value": "99"
            }
          ],
          "fee_value": 0.05,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        }
      ]
    },
    {
      "scenario_name": "10. Route Filter",
      "description": "Fee specific to exchange route",
      "fees": [
        {
          "id": "fee-020",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Bitkub Route Fee",
          "priority": 1,
          "condition": [
            {
              "param_name": "route",
              "operator": "equal",
              "value": "Bitkub"
            }
          ],
          "fee_value": 0.08,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        },
        {
          "id": "fee-021",
          "company_code": "XD",
          "transaction_type": "swap",
          "fee_type": "fee",
          "name": "Default Fee",
          "priority": 100,
          "condition": [],
          "fee_value": 0.15,
          "fee_unit": "percent",
          "start_date": "2024-01-01T00:00:00Z",
          "end_date": null,
          "is_campaign": false,
          "synced_at": "2024-01-01T00:00:00Z"
        }
      ]
    }
  ],
  "supported_conditions": {
    "customer_tier": {
      "description": "Customer tier level (0, 1, 2, 99, etc.)",
      "operators": [
        "equal"
      ]
    },
    "route": {
      "description": "Exchange route name (Bitkub, Binance, Dealer, etc.)",
      "operators": [
        "equal"
      ]
    },
    "onboarding_day": {
      "description": "Days since customer account opened",
      "operators": [
        "less_than_equal",
        "equal",
        "greater_than_equal"
      ]
    },
    "onboarding_date": {
      "description": "Specific onboarding date",
      "operators": [
        "equal"
      ]
    },
    "volume_size": {
      "description": "Trade volume size (bulk, normal)",
      "operators": [
        "equal"
      ]
    },
    "symbol": {
      "description": "Cryptocurrency symbol (BTC, ETH, USDT, etc.)",
      "operators": [
        "equal"
      ]
    }
  },
  "selection_logic": {
    "step_1": "Filter fees by date validity (StartDate <= now AND (EndDate is null OR EndDate >= now))",
    "step_2": "Sort by Priority ASC, then FeeValue ASC, then SyncedAt ASC",
    "step_3": "Return first fee where ALL conditions match (AND logic)",
    "step_4": "If no match found, return error 'no fee rate available'"
  }
}
```
