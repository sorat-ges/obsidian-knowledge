# Transfer Feature Implementation Plan

## UI Reference
- Asset selector dropdown (Transfer)
- From: static customer account display
- To: dealer account dropdown
- Amount input + Max button + wallet balance
- Preview button (disabled when amount = 0)

---

## Pending Questions (ต้องถาม Backend ก่อน implement)

- [ ] GET dealer accounts endpoint คืออะไร?
- [ ] POST submit transfer order endpoint คืออะไร?
- [ ] Transfer ได้แค่ THB หรือ token อื่นด้วย?
- [ ] From account มาจาก `customerAccount` ใน `useOverviewInfo` ได้เลยไหม?

---

## Step 1 — Types
**File:** `src/app/features/white-glove/types/transfer.ts`

```ts
export interface ITransferAsset {
  symbol: string
  icon: string
  balance: number
  balanceDisplay: string
}

export interface IDealerAccount {
  dealerId: string
  name: string
}

export interface ITransferForm {
  asset: ITransferAsset
  toAccount: IDealerAccount
  amount: number
}
```

---

## Step 2 — BFF API Routes

**File:** `src/app/api/white-glove/[identificationId]/transfer/dealer-accounts/route.ts`
- Method: GET
- Backend: `{ASSET_API_URL}/???`

**File:** `src/app/api/white-glove/[identificationId]/transfer/route.ts`
- Method: POST
- Backend: `{ASSET_API_URL}/???`
- Body: `{ asset, fromAccountId, toAccountId, amount }`

---

## Step 3 — Service
**File:** `src/app/features/white-glove/services/transfer.ts`

- `getDealerAccounts(identificationId: string): Promise<IDealerAccount[]>`
- `createTransferOrder(identificationId: string, payload): Promise<...>`

---

## Step 4 — Hook
**File:** `src/app/features/white-glove/hooks/useTransfer.ts`

- `useQuery` → dealer accounts
- `useQuery` → asset balance (reuse from `useAssetPortfolio` or new)
- `useMutation` → submit transfer order
- `useForm<ITransferForm>` → form state

---

## Step 5 — Components

### 5.1 TransferAssetSelector
**File:** `src/app/features/white-glove/components/transfer/transfer-asset-selector/index.tsx`
- Dropdown แสดง asset (THB, token ต่างๆ)
- แสดง icon + symbol + chevron
- เปิด modal เลือก asset เมื่อ click

### 5.2 TransferFromAccount
**File:** `src/app/features/white-glove/components/transfer/transfer-from-account/index.tsx`
- Static display (ไม่มี dropdown)
- แสดง customer name + account number
- ข้อมูลมาจาก `customerAccount` ใน `useOverviewInfo`

### 5.3 TransferToAccount
**File:** `src/app/features/white-glove/components/transfer/transfer-to-account/index.tsx`
- Dropdown เลือก dealer account
- แสดง name + dealerId + chevron
- เปิด modal/select เมื่อ click

### 5.4 TransferAmountInput
**File:** `src/app/features/white-glove/components/transfer/transfer-amount-input/index.tsx`
- Label "Amount" + wallet icon + max balance display (เหมือน WithdrawFiatAmountInput)
- Token icon + symbol + amount input + Max button
- Validation: amount > 0, amount <= balance

### 5.5 TransferPreviewModal
**File:** `src/app/features/white-glove/components/transfer/transfer-preview-modal/index.tsx`
- แสดง summary: asset, from, to, amount
- Cancel / Confirm buttons
- Confirm → เรียก createTransferOrder mutation

### 5.6 TransferContent (orchestrator)
**File:** `src/app/features/white-glove/components/transfer/transfer-content/index.tsx`
- ประกอบทุก component เข้าด้วยกัน
- ใช้ `useTransfer` hook
- จัดการ preview modal state

---

## Implementation Order

1. Types → 2. BFF Routes → 3. Service → 4. Hook → 5.1–5.5 Components → 5.6 Orchestrator

---

## Reusable Existing Components

| Need | Reuse |
|---|---|
| Amount input pattern | `withdraw-fiat-amount-input` |
| Max button | `MaxAmountButton` |
| Asset icon | `CoinIcon` |
| Preview modal layout | `withdraw-fiat-preview-modal` |
| Form setup | `react-hook-form` + `useForm` |
