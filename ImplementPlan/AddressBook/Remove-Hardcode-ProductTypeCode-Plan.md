# แผนการแก้ไข Hardcode `CRYPTO_PRODUCT_TYPE_CODE` ใน Address Book

> ย้าย filter จาก client-side magic number ไปเป็น server-side query param พร้อม typed enum

---

## ปัญหา

ใน `src/features/address-book/hooks/use-address-book.ts`:

```typescript
const CRYPTO_PRODUCT_TYPE_CODE = '5003'
const cryptoAssetsFilter = (item: IProductWalletAssetData) =>
  item.productTypeCode === CRYPTO_PRODUCT_TYPE_CODE
```

- `'5003'` เป็น magic number ที่ backend กำหนดไว้ใน `enum.ProductTypeCodeCrypto`
- Frontend ดึง **ทุก** asset type มาแล้วค่อย filter ฝั่ง client → payload เกินความจำเป็น
- ถ้า backend เปลี่ยน product type code → frontend พังโดยไม่มี compile error

---

## สถาปัตยกรรมปัจจุบัน

```
useAddressBook
  └── useProductWallet(undefined, cryptoAssetsFilter)   ← client-side filter
        └── fetchProductWallet()
              └── GET /api/trade/products/wallet         ← BFF
                    └── GET /api/v1/trading/products/wallet  ← backend (returns ALL types)
```

**Backend enum** (`internal/constants/enum/product_type_code.go`):
```go
const (
    ProductTypeCodeDigitalToken ProductTypeCode = "5001"
    ProductTypeCodeFiat         ProductTypeCode = "5002"
    ProductTypeCodeCrypto       ProductTypeCode = "5003"
    ProductTypeCodeUtilityToken ProductTypeCode = "5004"
)
```

**Backend request** (`handler/trading_dto.go`) — ปัจจุบันยังไม่มี product type filter:
```go
type TradingProductsCryptoRequest struct {
    Symbol      string `form:"symbol"`
    LastSymbol  string `form:"last_symbol"`
    AccountCode string `form:"account_code"`
    PairSymbol  string `form:"pair_symbol"`
    OrderType   string `form:"order_type"`
    // ไม่มี product_type_codes
}
```

---

## แนวทางแก้ไข: Server-side Filtering via Query Param

```
useAddressBook
  └── useProductWallet(undefined, [ProductTypeCode.Crypto])  ← typed enum
        └── fetchProductWallet(..., productTypeCodes)
              └── GET /api/trade/products/wallet?product_type_codes=5003  ← BFF pass-through
                    └── GET /api/v1/trading/products/wallet?product_type_codes=5003  ← backend filters
```

---

## Implementation Plan

### Step 1 — Backend (`order-service`)

#### 1.1 `handler/trading_dto.go`

เพิ่ม field `ProductTypeCodes` ใน request struct:

```go
type TradingProductsCryptoRequest struct {
    Symbol           string `form:"symbol"`
    LastSymbol       string `form:"last_symbol"`
    AccountCode      string `form:"account_code"`
    PairSymbol       string `form:"pair_symbol"`
    OrderType        string `form:"order_type"`
    ProductTypeCodes string `form:"product_type_codes"` // comma-separated e.g. "5003" or "5001,5003"
}
```

#### 1.2 `pkg/crypto_product/service_io.go`

เพิ่มใน `ProductRequestInput`:

```go
type ProductRequestInput struct {
    Symbol           string
    LastSymbol       string
    AccountCode      string
    Channel          string
    PairSymbol       string
    OrderType        string
    ProductTypeCodes []string // filter by product type codes; empty = no filter
}
```

#### 1.3 `handler/trading_handler.go`

Map request → service input:

```go
requestInput := cryptoproduct.ProductRequestInput{
    Symbol:           request.Symbol,
    LastSymbol:       request.LastSymbol,
    AccountCode:      request.AccountCode,
    Channel:          enum.TradeWeb.String(),
    PairSymbol:       request.PairSymbol,
    OrderType:        request.OrderType,
    ProductTypeCodes: parseCommaSeparated(request.ProductTypeCodes),
}

// helper (เพิ่มใน utils หรือ handler)
func parseCommaSeparated(s string) []string {
    if s == "" {
        return nil
    }
    return strings.Split(s, ",")
}
```

#### 1.4 `pkg/crypto_product/service.go` — `shouldSkipAsset()`

เพิ่ม filter logic:

```go
func shouldSkipAsset(ctx context.Context, onShelfMap map[string]bool, search ProductRequestInput, a domain.AssetPortfolio) bool {
    // ... existing logic ...

    // filter by product type codes if specified
    if len(search.ProductTypeCodes) > 0 && a.ProductTypeCode() != nil {
        if !slices.Contains(search.ProductTypeCodes, *a.ProductTypeCode()) {
            return true
        }
    }

    return false
}
```

#### 1.5 Update Swagger comment (`handler/trading_handler.go`)

```go
// @Param   product_type_codes query string false "filter by product type codes (comma-separated, e.g. 5003)"
```

---

### Step 2 — Frontend (`trading-web`)

#### 2.1 สร้าง `ProductTypeCode` enum

**File:** `src/features/trade/types/enums/product-type-code.ts`

```typescript
export enum ProductTypeCode {
  DigitalToken  = '5001',
  Fiat          = '5002',
  Crypto        = '5003',
  UtilityToken  = '5004',
}
```

Export จาก `src/features/trade/types/enums/index.ts`:

```typescript
export * from './product-type-code'
```

#### 2.2 `src/features/trade/services/product-wallet.ts`

เพิ่ม `productTypeCodes` parameter:

```typescript
export async function fetchProductWallet(
  orderType?: string,
  symbol?: string,
  productTypeCodes?: string[],
): Promise<IProductWalletData> {
  const searchParams = new URLSearchParams()
  if (orderType) searchParams.set('order_type', orderType)
  if (symbol) searchParams.set('symbol', symbol)
  if (productTypeCodes?.length) {
    searchParams.set('product_type_codes', productTypeCodes.join(','))
  }

  const apiUrl = `/api/trade/products/wallet?${searchParams.toString()}`
  // ... rest unchanged
}
```

#### 2.3 `src/features/trade/hooks/use-product-wallet.ts`

แทน `filterAssets` (client-side) ด้วย `productTypeCodes` (server-side):

```typescript
// ก่อน
export function useProductWallet(
  orderType?: EnumTradeOrderType,
  filterAssets?: (item: IProductWalletAssetData) => boolean,
)

// หลัง
export function useProductWallet(
  orderType?: EnumTradeOrderType,
  productTypeCodes?: string[],
) {
  const { data: productWalletData, ... } = useQuery({
    queryKey: ['product-wallet', symbol, productTypeCodes],
    queryFn: () => fetchProductWallet(orderType, symbol, productTypeCodes),
    retry: false,
  })

  useEffect(() => {
    if (productWalletData) {
      // ไม่ต้อง filter แล้ว — backend กรองมาให้แล้ว
      setSelectAssetItems(
        productWalletData.assets.map((item) => ({
          productId: item.productId,
          symbol: item.symbol,
          name: item.productName,
          icon: item.icon,
          balanceDisplay: item.unitBalanceDisplay,
        }))
      )
    }
  }, [productWalletData])
}
```

#### 2.4 `src/features/address-book/hooks/use-address-book.ts`

```typescript
// ลบออก
- import { type IProductWalletAssetData } from '@/features/trade/types'
- const CRYPTO_PRODUCT_TYPE_CODE = '5003'
- const cryptoAssetsFilter = (item: IProductWalletAssetData) =>
-   item.productTypeCode === CRYPTO_PRODUCT_TYPE_CODE

// เพิ่ม
+ import { ProductTypeCode } from '@/features/trade/types/enums'

// เปลี่ยน
- const { ... } = useProductWallet(undefined, cryptoAssetsFilter)
+ const { ... } = useProductWallet(undefined, [ProductTypeCode.Crypto])
```

---

### Step 3 — ตรวจ callers อื่นของ `useProductWallet`

```bash
grep -rn "useProductWallet" src/
```

Caller อื่นที่ไม่ได้ส่ง `filterAssets` → ไม่ต้องแก้ไข (ส่ง `productTypeCodes` เป็น `undefined` = ไม่มี filter = พฤติกรรมเดิม)

---

### Step 4 — Unit Tests

| File | Test ที่ต้องเพิ่ม/แก้ |
|---|---|
| `use-address-book.test.tsx` | ตรวจว่า `useProductWallet` ถูกเรียกด้วย `[ProductTypeCode.Crypto]` |
| `use-product-wallet.test.ts` | ตรวจว่า `fetchProductWallet` ถูกเรียกพร้อม `productTypeCodes` param |
| Backend service test | เพิ่ม case `ProductTypeCodes: []string{"5003"}` ใน `shouldSkipAsset` |

---

## Files ที่ต้องแก้ไข

### Backend (`order-service`)
| File | การเปลี่ยนแปลง |
|---|---|
| `handler/trading_dto.go` | เพิ่ม `ProductTypeCodes string` |
| `pkg/crypto_product/service_io.go` | เพิ่ม `ProductTypeCodes []string` |
| `handler/trading_handler.go` | Map request → input |
| `pkg/crypto_product/service.go` | Filter logic ใน `shouldSkipAsset()` |

### Frontend (`trading-web`)
| File | การเปลี่ยนแปลง |
|---|---|
| `src/features/trade/types/enums/product-type-code.ts` | สร้างใหม่ |
| `src/features/trade/types/enums/index.ts` | export * from enum |
| `src/features/trade/services/product-wallet.ts` | เพิ่ม `productTypeCodes` param |
| `src/features/trade/hooks/use-product-wallet.ts` | แทน `filterAssets` ด้วย `productTypeCodes` |
| `src/features/address-book/hooks/use-address-book.ts` | ใช้ `ProductTypeCode.Crypto` |

---

## BFF — ไม่ต้องแก้ไข

`src/app/api/trade/products/wallet/route.ts` ใช้ `searchParams.toString()` ส่งต่อไป backend อยู่แล้ว:

```typescript
const endpoint = `${baseApiUrl}/api/v1/trading/products/wallet?${searchParams.toString()}`
```

---

## ข้อดีของ Approach นี้

| ด้าน | ผลลัพธ์ |
|---|---|
| **Type safety** | ใช้ `ProductTypeCode.Crypto` แทน `'5003'` — compile error ถ้าพิมพ์ผิด |
| **Payload** | Backend ส่งแค่ asset ที่ต้องการ — ลด network overhead |
| **Maintainability** | เปลี่ยน product type code แค่จุดเดียว (enum) |
| **BFF** | ไม่ต้องแตะ |
| **Backward compatible** | `productTypeCodes` เป็น optional — caller เดิมไม่พัง |
