## Background
  

The ICO order placement form currently supports **create new order only**.

The Draft button exists but `handleDraftSave` is empty (`async () => {}`).


**Goal:**

1. Save a form as a draft order (`order-request` status) by sending `action: 'draft'` in the POST body

2. Open an existing order pre-filled in the form for editing and resubmission

  

> Orders with `order-confirm` status have their own editing tool (update-details component) — **out of scope here.**

  
---

  

## URL Strategy

  

Same page, query param distinguishes mode:

  

| Mode | URL |

|--------|-----|

| Create | `/ico-order-placement/[customerAccountId]` |

| Edit | `/ico-order-placement/[customerAccountId]?orderId=xxx` |

  

---

  

## API Behaviour

  

| Button | `action` sent | Backend saves as |

|--------|--------------|-----------------|

| Draft | `'draft'` | `order-request` |

| Submit | `'submit'` | `order-confirmed` |

  

Both use the same endpoint: `POST /api/order-offering/placement`

  

---

  

## Files To Modify / Create

  

### Modified Files

  

| File | Change |

|------|--------|

| `[customerAccountId]/type.ts` | Add `action: 'draft' \| 'submit'` to submit request; add `url?: string` to subscriptionForm |

| `[customerAccountId]/models/ico-order-placement-model.ts` | Add `draftRequest` getter + `action: 'submit'` to `submitRequest`; remove `paymentType` from `disableDraft` |

| `[customerAccountId]/container.tsx` | Read `orderId` from `useSearchParams`, pass to form |

| `[customerAccountId]/components/ico-order-placement-form.tsx` | Implement draft save + load existing order |

  

### New Files

  

| File | Purpose |

|------|---------|

| `[customerAccountId]/hooks/useIcoOrderDetail.ts` | Fetch existing order by orderId via React Query |

| `[customerAccountId]/models/ico-order-form-transformer.ts` | Transform API order detail response → `IICOOrderPlacementForm` |

  

---

  

## Step-by-Step Implementation

  

---

  

### Step 1 — Update Type

  

**File:** `[customerAccountId]/type.ts`

  

```ts

// Add to IICOOrderPlacementSubmitRequest

action: 'draft' | 'submit'

  

// Add url field to subscriptionForm inside IICOOrderPlacementForm

subscriptionForm?: {

fileType: string

fileName: string

objectKey: string

documentType: string

file: File

uploadStatus: UploadStatus

url?: string // presigned URL for API-loaded files

}

```

  

---

  

### Step 2 — Update Model

  

**File:** `[customerAccountId]/models/ico-order-placement-model.ts`

  

1. Update `submitRequest` getter — add `action: 'submit'`:

```ts

get submitRequest(): IICOOrderPlacementSubmitRequest {

return {

// ... existing fields ...

action: 'submit',

}

}

```

  

2. Add `draftRequest` getter:

```ts

get draftRequest(): IICOOrderPlacementSubmitRequest {

return {

...this.submitRequest,

action: 'draft',

}

}

```

  

3. Remove `paymentType` from `disableDraft` required fields — draft must be saveable before payment type is selected:

```ts

get disableDraft(): boolean {

const { orderId, orderType, investmentAccountCode, projectId, tokens, subscriptionForm, orderDate } = this.data

// paymentType intentionally excluded

const requiredFields = [orderId, orderType, investmentAccountCode, projectId, tokens, subscriptionForm, orderDate]

// ...

}

```

  

---

  

### Step 3 — New Hook: `useIcoOrderDetail`

  

**New file:** `[customerAccountId]/hooks/useIcoOrderDetail.ts`

  

```ts

import { fetchWithCredentials } from '@/utils/auth/fetchWithCredentials'

import { useQuery } from '@tanstack/react-query'

  

export default function useIcoOrderDetail(orderId: string) {

const { data, isLoading } = useQuery({

queryKey: ['icoOrderDetail', orderId],

queryFn: async () => {

const res = await fetchWithCredentials(`/api/order-offering/subscription-orders/${orderId}`)

if (!res.ok) throw new Error('Failed to fetch order detail')

const { data } = await res.json()

return data?.data // extract inner data: { order_information, payment_method, ... }

},

enabled: !!orderId,

})

return { orderDetail: data, isLoading }

}

```

  

> **Note:** The BFF response shape is:

> ```json

> { "data": { "code": "200", "message": "success", "data": { ...actual data... } } }

> ```

> So `data?.data` extracts `{ order_history, order_information, customer_information, payment_method, allocation }`.

  

---

  

### Step 4 — New Transformer: `transformOrderDetailToForm`

  

**New file:** `[customerAccountId]/models/ico-order-form-transformer.ts`

  

```ts

import { IICOOrderPlacementForm } from '../type'

  

// Maps GET /api/order-offering/subscription-orders/[orderId] response

// (after extracting data.data) → IICOOrderPlacementForm

export function transformOrderDetailToForm(orderDetail: any): IICOOrderPlacementForm {

const orderInfo = orderDetail?.order_information

const bankAccount = orderDetail?.payment_method?.customer_bank_account

const paymentMethodType = bankAccount?.payment_method ?? ''

const isCheque = paymentMethodType === 'CHEQUE'

  

return {

orderId: orderInfo?.order_id ?? '',

orderType: orderInfo?.order_type ?? 'buy',

investmentAccountCode: orderInfo?.account_code ?? '',

projectId: '', // not in API response — resolved via project search in form

projectName: orderInfo?.project_name ?? '',

subscriptionDateStart: '',

subscriptionDateEnd: orderInfo?.subscription_end_date ?? '',

orderDate: orderInfo?.order_date ?? '',

paymentType: paymentMethodType,

tokens: (orderInfo?.order_detail ?? []).map((t: any) => ({

id: '', // product_id not in API response

name: t.token ?? '',

value: String(t.amount ?? ''),

type: 'amount' as const,

disable: false,

offeringPrice: 0,

})),

subscriptionForm: orderInfo?.subscription_form_image

? {

fileName: orderInfo.subscription_form_image.name ?? '',

fileType: orderInfo.subscription_form_image.type ?? '',

objectKey: orderInfo.subscription_form_image.object_key ?? '',

documentType: 'sub',

uploadStatus: 'uploaded',

url: orderInfo.subscription_form_image.url ?? '', // presigned URL for display

file: null as unknown as File,

}

: undefined,

// CHEQUE: each cheque has a slip image → goes into paymentSlip[].cheque

// other types: regular payment slips → goes into paymentSlip[]

paymentSlip: isCheque

? (bankAccount?.cheque_payment_slips ?? []).map((c: any) => ({

fileName: c.slip_image?.name ?? '',

fileType: c.slip_image?.type ?? '',

objectKey: c.slip_image?.object_key ?? '',

documentType: 'pay-to-sa',

uploadStatus: 'uploaded' as const,

amount: '',

paymentBankName: '',

paymentDate: '',

paymentTime: '',

paymentReceiptDate: '',

paymentReceiptTime: '',

cheque: {

no: c.cheque_no ?? '',

type: c.cheque_type ?? '',

chequeDate: c.cheque_date ?? '',

receiptDate: '',

receiptTime: '',

bankName: c.bank_name ?? '',

amount: String(c.amount ?? ''),

},

file: null as unknown as File,

}))

: (bankAccount?.payment_slips ?? []).map((slip: any) => ({

fileName: slip.slip_image?.name ?? '',

fileType: slip.slip_image?.type ?? '',

objectKey: slip.slip_image?.object_key ?? '',

documentType: 'pay-to-sa',

uploadStatus: 'uploaded' as const,

amount: String(slip.amount ?? ''),

paymentBankName: slip.payment_bank_name ?? '',

paymentDate: slip.payment_date ?? '',

paymentTime: '',

paymentReceiptDate: '',

paymentReceiptTime: '',

file: null as unknown as File,

})),

// BILL_PAYMENT_CHEQUE: cheques go into chequeInfo (no slip image)

chequeInfo:

paymentMethodType === 'BILL_PAYMENT_CHEQUE'

? (bankAccount?.cheque_payment_slips ?? []).map((c: any) => ({

no: c.cheque_no ?? '',

type: c.cheque_type ?? '',

chequeDate: c.cheque_date ?? '',

receiptDate: '',

receiptTime: '',

bankName: c.bank_name ?? '',

amount: String(c.amount ?? ''),

}))

: [],

}

}

```

  

#### API Response Field Mapping

  

| Form field | API path |

|---|---|

| `orderId` | `order_information.order_id` |

| `orderType` | `order_information.order_type` |

| `investmentAccountCode` | `order_information.account_code` |

| `projectName` | `order_information.project_name` |

| `orderDate` | `order_information.order_date` |

| `subscriptionDateEnd` | `order_information.subscription_end_date` |

| `paymentType` | `payment_method.customer_bank_account.payment_method` |

| `tokens[]` | `order_information.order_detail[]` |

| `subscriptionForm` | `order_information.subscription_form_image` |

| `paymentSlip` (CHEQUE) | `customer_bank_account.cheque_payment_slips[]` → `.cheque` sub-object |

| `paymentSlip` (other) | `customer_bank_account.payment_slips[]` |

| `chequeInfo` (BILL_PAYMENT_CHEQUE) | `customer_bank_account.cheque_payment_slips[]` |

  

---

  

### Step 5 — Container: Read `orderId` from URL

  

**File:** `[customerAccountId]/container.tsx`

  

Add `useSearchParams`, extract `orderId`, pass to form:

```tsx

const searchParams = useSearchParams()

const orderId = searchParams.get('orderId') ?? ''

  

// In JSX:

<ICOOrderPlacementForm

// ... existing props ...

orderId={orderId}

/>

```

  

---

  

### Step 6 — Form: Full Changes

  

**File:** `[customerAccountId]/components/ico-order-placement-form.tsx`

  

#### 6a — New prop + imports

  

```tsx

import useIcoOrderDetail from '../hooks/useIcoOrderDetail'

import { transformOrderDetailToForm } from '../models/ico-order-form-transformer'

  

export default function ICOOrderPlacementForm({

// ... existing props ...

orderId = '',

}: {

// ... existing types ...

orderId?: string

}) {

const isEditMode = !!orderId

const { orderDetail, isLoading: isLoadingOrder } = useIcoOrderDetail(orderId)

```

  

#### 6b — Loading skeleton

  

```tsx

if (isLoadingOrder) {

return <div className='h-96 w-full animate-pulse rounded-md bg-zinc-100' />

}

```

  

#### 6c — Load existing order + trigger project name search

  

```tsx

useEffect(() => {

if (orderDetail) {

form.reset(transformOrderDetailToForm(orderDetail))

// projectId is not in API response — trigger search so combobox resolves name → id

const projectNameFromApi = orderDetail?.order_information?.project_name

if (projectNameFromApi) {

setProjectName(projectNameFromApi)

}

}

}, [orderDetail])

```

  

#### 6d — Edit mode: sync project options without clearing form

  

`projectId` is not in the API response. When project search returns results, set `projectId`,

`projectPaymentMethod`, `productId` **without** calling `clearForm()` or `replaceTokens()`:

  

```tsx

useEffect(() => {

if (!isEditMode || !data || data.length === 0) return

const currentProjectName = getValues('projectName')

const matched = data.find((p) => p.name === currentProjectName) ?? data[0]

if (!matched) return

setValue('projectId', matched.id)

setProjectPaymentMethod(matched.payment_method ?? [])

setProductId(matched.tokens[0]?.id ?? '')

}, [data, isEditMode])

```

  

#### 6e — Guard existing effects from running in edit mode

  

```tsx

// autoSelectFirstProject — skip in edit mode to prevent clearForm()

const autoSelectFirstProject = () => {

if (!!data && data.length == 1 && fetchCount == 1 && !isEditMode) {

handleProjectChanged(data[0].id)

}

}

  

// [projectId] effect — skip in edit mode to prevent clearForm() loop

useEffect(() => {

if (!isEditMode && icoOrderPlacementModel.data.projectId && icoOrderPlacementModel.data.projectId !== '') {

handleProjectChanged(icoOrderPlacementModel.data.projectId)

}

}, [icoOrderPlacementModel.data.projectId])

```

  

#### 6f — Implement `handleDraftSave`

  

```tsx

const handleDraftSave = async () => {

setIsOrderLoading(true)

try {

const response = await fetchWithCredentials(`/api/order-offering/placement`, {

method: 'POST',

headers: { Accept: 'application/json', 'Content-Type': 'application/json' },

body: JSON.stringify(icoOrderPlacementModel.draftRequest), // action: 'draft'

})

if (!response.ok) throw new Error('Failed to save draft')

const { data } = await response.json()

const savedOrderId = data?.order_id ?? data?.data

router.replace(`/ico-order-placement/${customerAccountId}?orderId=${savedOrderId}`)

toast({ title: 'Draft Saved', description: 'Your order has been saved as a draft.' })

} catch (error) {

toast({ title: 'Save Failed', description: 'Failed to save draft. Please try again later.', variant: 'destructive' })

console.error('Error saving draft:', error)

} finally {

setIsOrderLoading(false)

}

}

```

  

#### 6g — Draft button: style + label

  

```tsx

<Button

className={cn(

'w-36',

icoOrderPlacementModel.disableDraft || disableForm

? 'border-zinc-200 bg-zinc-100 text-ds-black-600 hover:bg-zinc-100 hover:text-ds-black-600'

: 'border-ds-success text-ds-success hover:bg-ds-success/10 hover:text-ds-success'

)}

variant='outline'

disabled={icoOrderPlacementModel.disableDraft || disableForm}

onClick={handleDraftSave}

>

{isEditMode ? 'Update Draft' : 'Draft'}

</Button>

```

  

#### 6h — Fix `URL.createObjectURL` crashes for API-loaded files

  

PaymentSlip — `file` is null when loaded from API:

```tsx

url: item.file ? URL.createObjectURL(item.file) : '',

fileName: item.file ? item.file.name : item.fileName,

fileType: item.file ? item.file.type : item.fileType,

```

  

SubscriptionFormUploadedResult — use presigned URL from `subscriptionForm.url` when `file` is null.

Also change the condition from checking `file` to checking `subscriptionForm` so it renders even without a file:

```tsx

data={

icoOrderPlacementModel.data?.subscriptionForm

? {

url: icoOrderPlacementModel.data.subscriptionForm.file

? URL.createObjectURL(icoOrderPlacementModel.data.subscriptionForm.file)

: (icoOrderPlacementModel.data.subscriptionForm.url ?? ''),

fileName: icoOrderPlacementModel.data.subscriptionForm.fileName,

fileType: icoOrderPlacementModel.data.subscriptionForm.fileType,

uploadStatus: icoOrderPlacementModel.data.subscriptionForm.uploadStatus,

}

: undefined

}

```

  

---

  

## Data Flow Summary

  

```

Create Mode:

User fills form → clicks Draft

→ POST /api/order-offering/placement { ...data, action: 'draft' }

→ Backend saves as order-request status

→ Success → router.replace URL with ?orderId=xxx

→ Form switches to Edit Mode

  

Edit Mode (URL has ?orderId):

Page loads → container reads orderId from searchParams

→ useIcoOrderDetail(orderId)

→ GET /api/order-offering/subscription-orders/[orderId]

→ res.json().data?.data extracts inner response

→ transformOrderDetailToForm(data) → form.reset(formData)

→ setProjectName(project_name) triggers project search

→ project search returns → [data, isEditMode] effect runs:

→ finds matching project by name

→ setValue('projectId'), setProjectPaymentMethod(), setProductId()

→ combobox now shows project name; payment type dropdown enabled

→ User edits → clicks Update Draft

→ POST { ...data, action: 'draft' } → backend: order-request

→ User edits → clicks Submit

→ POST { ...data, action: 'submit' } → backend: order-confirmed

```

  

---

  

## Limitations (API constraints)

  

- `project_id` is not returned by the order detail API — resolved via name-based project search

- Token `product_id` is not returned — set to empty string; tokens display by name only

- `subscriptionDateStart` is not returned — left empty

- Cheque `receipt_date` / `receipt_time` are not returned — user must re-enter before submitting

  

---

  

## Backend API Improvement Request

  

The following fields are **missing from the current response** of

`GET /api/v1/order-offering/subscription-orders/{orderId}` and should be added to fully support edit mode without workarounds.

  

### Under `order_information`

  

```json

"project_id": "993865bd-c7bf-4c93-b728-bf179cc5de9b",

"subscription_date": {

"start": "2025-05-01T00:00:00Z",

"end": "2026-07-25T00:00:00Z"

},

"order_detail": [

{

"product_id": "abc-123-token-id", // ← ADD: needed to link token to form field

"token": "SiriHubA",

"amount": 20,

"unit": 0

}

]

```

  

### Under `payment_method.customer_bank_account.cheque_payment_slips[]`

  

```json

{

"cheque_no": "2",

"cheque_type": "POST_DATE_CHEQUE",

"cheque_date": "2026-03-06T17:00:00.000Z",

"bank_name": "KBANK",

"amount": 50,

"receipt_date": "2026-03-07T08:00:00Z", // ← ADD: required for resubmit

"slip_image": { ... }

}

```

  

### Impact of each missing field

  

| Field | Frontend workaround | Resolved by adding |

|---|---|---|

| `project_id` | Name-based search + auto-match (fragile if names aren't unique) | Direct `setValue('projectId', project_id)` |

| `order_detail[].product_id` | Token `id` left as empty string | Token upload and re-upload works correctly |

| `subscription_date.start` | Order date picker min defaults to today | Correct subscription start date enforced |

| `cheque_payment_slips[].receipt_date` | User must re-enter before Submit is enabled | Pre-fills receipt date on load |

  

---

  

## Verification Checklist

  

- [ ] Create new order → click Draft → URL updates to `?orderId=xxx`

- [ ] Refresh page with `?orderId=xxx` → form pre-filled: project name, order date, payment type, tokens, subscription form image, cheques

- [ ] Edit pre-filled form → click Update Draft → changes saved

- [ ] Click Submit from edit mode → order submitted

- [ ] `pnpm test` — all tests pass