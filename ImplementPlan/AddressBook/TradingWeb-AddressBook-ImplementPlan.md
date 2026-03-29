# Implementation Plan — Address Book

  

  

สร้างหน้า Address Book ให้ user จัดการ wallet address สำหรับถอนเหรียญ ตามรูป design ที่ให้มา

  

  

> [!NOTE]

  

> Backend API (`GET /api/v1/trading/address-book`) เติมเต็มแล้ว เราจะใช้ BFF Pattern ในการต่อ API ก้อนนี้เลย โดยไม่ต้องใช้ mock data

  

  

---

  

  

## Proposed Changes

  

  

### 1. Types & Transforms — `src/features/address-book/types/` `[NEW]`

  

  

#### `address-book-api.ts`

  

```typescript

  

export interface AddressBookApiResponse {

  

code: string

  

message: string

  

data: AddressBookApiData

  

}

  

  

export interface AddressBookApiData {

  

pagination: AddressBookPaginationApiData

  

data: AddressBookItemApiData[]

  

}

  

  

export interface AddressBookPaginationApiData {

  

page: number

  

per_page: number

  

total_items: number

  

total_page: number

  

}

  

  

export interface AddressBookItemApiData {

  

id: string

  

address_name: string

  

symbol: string

  

product_id: string

  

product_name: string

  

network: string

  

network_id: string

  

address: string

  

memo: string | null

  

}

  

```

  

  

#### `address-book.ts`

  

```typescript

  

export interface AddressBookData {

  

pagination: AddressBookPagination

  

addresses: Address[]

  

}

  

  

export interface AddressBookPagination {

  

page: number

  

perPage: number

  

totalItems: number

  

totalPage: number

  

}

  

  

export interface Address {

  

id: string

  

name: string

  

symbol: string

  

productId: string

  

productName: string

  

network: string

  

networkId: string

  

address: string

  

memo?: string

  

}

  

```

  

  

#### `address-book-transform.ts`

  

- Functions `transformAddressBookApiData(apiData)` และ `createEmptyAddressBookData()`

  

  

---

  

  

### 2. BFF API Route — `src/app/api/address-book/route.ts` `[NEW]`

  

  

- สร้าง Next.js API route GET method

  

- ใช้ `fetchWithApiLogging` วิ่งไปที่ `process.env.NEXT_PUBLIC_ORDER_SERVICE_URL + /api/v1/trading/address-book`

  

- รับ param `symbol`, `page`, `per_page`

  

  

---

  

  

### 3. Service & Hook — `src/features/address-book/` `[NEW]`

  

  

#### `services/address-book.ts`

  

- `fetchAddressBooks(symbol, page, perPage)`: ยิงไป BFF API route, คืนค่าเป็น `AddressBookData`

  

  

#### `hooks/use-address-book.ts`

  

| Function | Description |

  

| ------------------- | ------------------------------------------------ |

  

| `selectedAsset` | state ของ asset filter (`'all'` / `'BTC'` / ...) |

  

| `currentPage` | state ของ pagination |

  

| `addressBookQuery` | เรียกใช้ `useQuery` จาก React Query วนของตาม `selectedAsset` & `currentPage` |

  

  

#### `hooks/use-address-book.test.tsx`

  

- Unit test ตัวแปรที่เก็บค่าและการ fetch

  

  

---

  

  

### 4. Components — `src/features/address-book/components/` `[NEW]`

  

  

#### `address-table.tsx`

  

- ใช้ `DataTable` จาก `@xspring/ui`

  

- Columns: **Asset**, **Network**, **Name**, **Address** (+ copy icon), **MEMO**

  

- Address truncated format: `6CGDA5...dssd` + `navigator.clipboard` copy

  

- MEMO แสดง `-` ถ้าเป็น `undefined` หรือ `null`

  

- ไม่มี `onClickRow` (ไม่ navigate)

  

- ส่ง Props `isLoading`

  

- `isPagination={true}`, `pageSize={20}`, ปรับ `page` ควบคุมผ่าน Hook

  

  

#### `index.ts`

  

- `export * from './address-table'`

  

  

---

  

  

### 5. Page — `src/app/[locale]/address-book/` `[NEW]`

  

  

#### `page.tsx`

  

```typescript

  

import AddressBookContainer from './container'

  

  

export default function AddressBookPage() {

  

return <AddressBookContainer />

  

}

  

```

  

  

#### `container.tsx`

  

- Layout: Header → Asset Filter → `AddressTable`

  

- ใช้ `useAddressBook()` hook ควบคุมข้อมูล

  

- Wrapper: `mx-auto w-full max-w-[1440px] px-12 pb-10`

  

  

---

  

  

### 6. Integration

  

  

#### `[MODIFY]` `src/i18n/request.ts`

  

- เพิ่ม import `locales/[locale]/address-book.json`

  

  

#### `[MODIFY]` `src/components/commons/profile-menu.tsx`

  

- นำลิ้ง `'#'` ออกและเปลี่ยนเป็น `href: '/address-book'` พร้อมลบ `disabled` ล็อก

  

  

---

  

  

### 7. Translations — `[NEW]`

  

  

#### `src/locales/en/address-book.json`

  

```json

  

{

  

"title": "Address Book",

  

"asset": "Asset",

  

"filterAll": "All",

  

"table": {

  

"asset": "Asset",

  

"network": "Network",

  

"name": "Name",

  

"address": "Address",

  

"memo": "MEMO"

  

}

  

}

  

```

  

  

#### `src/locales/th/address-book.json`

  

- เหมือนกันแต่แปลเป็นภาษาไทย

  

  

---

  

  

## File Summary

  

  

| File | Action |

  

| --------------------------------------------------------------------------- | ------ |

  

| `src/app/api/address-book/route.ts` | NEW |

  

| `src/features/address-book/types/address-book-api.ts` | NEW |

  

| `src/features/address-book/types/address-book.ts` | NEW |

  

| `src/features/address-book/types/address-book-transform.ts` | NEW |

  

| `src/features/address-book/types/index.ts` | NEW |

  

| `src/features/address-book/services/address-book.ts` | NEW |

  

| `src/features/address-book/services/index.ts` | NEW |

  

| `src/features/address-book/hooks/use-address-book.ts` | NEW |

  

| `src/features/address-book/hooks/use-address-book.test.tsx` | NEW |

  

| `src/features/address-book/components/address-table.tsx` | NEW |

  

| `src/features/address-book/components/index.ts` | NEW |

  

| `src/app/[locale]/address-book/page.tsx` | NEW |

  

| `src/app/[locale]/address-book/container.tsx` | NEW |

  

| `src/components/commons/profile-menu.tsx` | MODIFY |

  

| `src/i18n/request.ts` | MODIFY |

  

| `src/locales/en/address-book.json` | NEW |

  

| `src/locales/th/address-book.json` | NEW |

  

  

---

  

  

## Verification Plan

  

  

1. **Build**: `pnpm build` ต้องไม่มี error

  

2. **Navigation**: คลิก Profile → Address Book → ไปหน้า `/address-book`

  

3. **UI**: ตรงตาม design

  

4. **API Integration**: Request เรียก Backend จริง พร้อมทำ pagination และ Asset filtering

  

5. **Copy**: กด copy icon แล้ว address/MEMO ถูก copy

  

6. **i18n**: สลับภาษาทำงานได้