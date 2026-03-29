# Plan: New Transfer Asset Balance API

## Context

ปัจจุบัน `TransferAmountInput` ใช้ balance จาก `useProductSearch` ซึ่ง query portfolio ตาม `identificationId` อย่างเดียว ไม่ได้แยกตาม account type

ต้องสร้าง endpoint ใหม่ที่ดึง balance จาก `dw_asset.asset_portfolio` โดย filter ด้วย `wallet_type`:

- **Dealer account** → `wallet_type = 'dealer_main'`
- **Brokerage (customer) account** → `wallet_type = 'customer_main'`

---

## Part 1: Backend (order-service) ✅ DONE

### API: GET `/api/v1/white-glove/transfer/accounts`

Response เปลี่ยนแปลง — ตอนนี้ return `customer_account_id` และ `wallet_type` ด้วย:

```json
[
  {
    "customer_account_id": "uuid",
    "account_code": "B001",
    "account_name": "Brokerage Account",
    "wallet_type": "customer_main"
  },
  {
    "customer_account_id": "uuid",
    "account_code": "D001",
    "account_name": "Dealer One",
    "wallet_type": "dealer_main"
  }
]
```

Frontend ใช้ `customer_account_id` และ `wallet_type` จาก response นี้ส่งต่อไปยัง asset-balance endpoint ได้เลย ไม่ต้องทำ lookup เพิ่ม

---

### API: GET `/api/v1/white-glove/transfer/asset-balance`

**Permission:** `P0292`

**Query params:**

| Param | Type | Required | Description |

|---|---|---|---|

| `product_id` | UUID string | ✅ | Product ID |

| `customer_account_id` | UUID string | ✅ | Customer Account ID (จาก `/transfer/accounts`) |

| `wallet_type` | string | ✅ | `customer_main` หรือ `dealer_main` (จาก `/transfer/accounts`) |

**Response:**

```json
{
  "available_unit_balance": {
    "value": 1.5,
    "display": "1.50000000"
  }
}
```

---

### Files changed

| # | File | Action |

|---|---|---|

| 1 | `internal/domain/asset_portfolio.go` | เพิ่ม `WalletType` field (`column:wallet_type`) |

| 2 | `storages/postgres/assetrepository/asset_portfolio_repository.go` | เพิ่ม `GetAssetByAccountIDAndProductIDAndWalletType` |

| 3 | `pkg/asset/repository.go` | เพิ่ม interface method |

| 4 | `pkg/white_glove/repository.go` | เพิ่ม `GetCustomerAccountIDsByDealerCodes`, struct `TransferAccountInfo` |

| 5 | `storages/postgres/customerrepository/customer_account_repository.go` | implement `GetCustomerAccountIDsByDealerCodes` (batch query IN) |

| 6 | `pkg/white_glove/output.go` | เพิ่ม `CustomerAccountID`, `WalletType` ใน `DealerAccount`; เพิ่ม `TransferAssetBalanceOutput` |

| 7 | `pkg/white_glove/service.go` | `GetDealerAccounts` populate `CustomerAccountID`+`WalletType`; `GetTransferAssetBalance(ctx, productID, customerAccountID, walletType)` |

| 8 | `handler/white_glove_dto.go` | `TransferAssetBalanceRequest` ใช้ `customer_account_id` + `wallet_type` |

| 9 | `handler/white_glove_handler.go` | handler + Swagger annotations |

| 10 | `routes/route.go` | register route |

| 11 | `internal/constants/auth.go` | เพิ่ม `P0292` |

| 12 | `handler/white_glove_handler_test.go` | test handler |

| 13 | `pkg/white_glove/service_test.go` | test service |

---

## Part 2: Frontend (web-portal)

### 2.1 เพิ่ม BFF route

**File:** `src/app/api/white-glove/transfer/asset-balance/route.ts`

```typescript
export async function GET(request: NextRequest) {
  // Extract access_token from cookie
  // Get query params: product_id, customer_account_id, wallet_type
  // Validate: all required → return 400 if missing
  // Call: GET {ORDER_API_URL}/api/v1/white-glove/transfer/asset-balance
  //       ?product_id=&customer_account_id=&wallet_type=
  // Return: { available_unit_balance: { value, display } }
}
```

Pattern เทียบ: `src/app/api/white-glove/transfer/accounts/route.ts`

---

### 2.2 เพิ่ม types

**File:** `src/app/features/white-glove/types/transfer.ts`

```typescript
// เพิ่มใน DealerAccount type
export interface IDealerAccount {
  customer_account_id: string  // NEW
  account_code: string
  account_name: string
  wallet_type: string           // NEW
}
// API response (snake_case)
export interface ITransferAssetBalanceResponse {
  available_unit_balance: {
    value: number
    display: string
  }
}
// Domain type (camelCase)
export interface ITransferAssetBalance {
  availableUnitBalance: number
  availableUnitBalanceDisplay: string
}
export function transformTransferAssetBalanceResponse(
  data: ITransferAssetBalanceResponse
): ITransferAssetBalance
```

---

### 2.3 เพิ่ม service function

**File:** `src/app/features/white-glove/services/transfer.ts`

```typescript
export async function getTransferAssetBalance(
  productId: string,
  customerAccountId: string,
  walletType: string,
): Promise<ITransferAssetBalance>
// GET /api/white-glove/transfer/asset-balance
//     ?product_id={productId}&customer_account_id={customerAccountId}&wallet_type={walletType}
```

---

### 2.4 สร้าง hook ใหม่

**File:** `src/app/features/white-glove/hooks/useTransferBalance.ts`

```typescript
export function useTransferBalance(
  productId: string | undefined,
  customerAccountId: string | undefined,
  walletType: string | undefined,
  enabled = true,
) {
  // queryKey: ['white-glove-transfer-balance', productId, customerAccountId, walletType]
  // enabled: enabled && !!productId && !!customerAccountId && !!walletType
  // return: { balance, balanceDisplay, isLoadingBalance, isBalanceError }
}
```

เมื่อ user เปลี่ยน asset (productId) หรือเปลี่ยน account → queryKey เปลี่ยน → React Query auto-refetch

---

### 2.5 Export hook

**File:** `src/app/features/white-glove/hooks/index.ts`

เพิ่ม:

```typescript
export * from './useTransferBalance'
```

---

### 2.6 อัปเดต TransferContent

**File:** `src/app/features/white-glove/components/transfer/transfer-content/index.tsx`

`fromAccount` จาก `useTransferAccounts` ตอนนี้มี `customerAccountId` และ `walletType` แล้ว:

```typescript
const { balance, balanceDisplay, isLoadingBalance } = useTransferBalance(
  selectedAsset?.productId,
  fromAccount?.customerAccountId,  // จาก DealerAccount.customer_account_id
  fromAccount?.walletType,          // จาก DealerAccount.wallet_type
  isActive,
)
// อัปเดต isLoading ให้รวม isLoadingBalance
const isLoading = isLoadingProducts || isLoadingAccounts || isLoadingBalance
// ส่ง props ใหม่ให้ TransferAmountInput
balance={balance}
balanceDisplay={balanceDisplay}
```

`TransferAmountInput` ไม่ต้องแก้เลย — props interface เหมือนเดิม

---

### 2.7 Unit tests (frontend)

| File | Test |

|---|---|

| `route.test.ts` | BFF: 200, 400 (missing params), 401, 500 |

| `useTransferBalance.test.tsx` | Hook: enabled/disabled, success, error, empty |

| `transfer-content/index.test.tsx` | อัปเดต mock เพิ่ม `useTransferBalance` |

---

## Summary Frontend files

| # | File | Action |

|---|---|---|

| 1 | `src/app/api/white-glove/transfer/asset-balance/route.ts` | สร้าง BFF route (params: `customer_account_id`, `wallet_type`, `product_id`) |

| 2 | `src/app/features/white-glove/types/transfer.ts` | อัปเดต `IDealerAccount` + เพิ่ม types/transform |

| 3 | `src/app/features/white-glove/services/transfer.ts` | เพิ่ม service function |

| 4 | `src/app/features/white-glove/hooks/useTransferBalance.ts` | สร้าง hook (รับ `customerAccountId` + `walletType`) |

| 5 | `src/app/features/white-glove/hooks/index.ts` | export hook |

| 6 | `transfer-content/index.tsx` | ใช้ `fromAccount.customerAccountId` + `fromAccount.walletType` |

| 7 | `transfer-content/index.test.tsx` | อัปเดต test |

| 8 | `route.test.ts` | test BFF route |

| 9 | `useTransferBalance.test.tsx` | test hook |

---

## Decisions (confirmed)

1. **Wallet type detection**: `GetDealerAccounts` เป็นคนระบุ `wallet_type` ให้แต่ละ account (ไม่ได้ detect ใน `GetTransferAssetBalance` อีกต่อไป)
2. **customer_account_id**: ส่งมาจาก frontend โดยตรง (ได้จาก `GetDealerAccounts` response) — backend ไม่ต้อง lookup จาก `account_code` แล้ว
3. **Batch query**: `GetCustomerAccountIDsByDealerCodes` ใช้ `IN (?)` เพื่อหลีกเลี่ยง N+1
4. **Permission key**: `P0292`
5. **Decimal formatting**: ใช้ config จาก `product_da_extension` เหมือน `GetProductCryptoBySymbol`