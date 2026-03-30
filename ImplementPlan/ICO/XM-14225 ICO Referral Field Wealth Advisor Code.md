# XM-14225: ICO Subscription — เพิ่ม Field Referral (Wealth Advisor Code)

## Background

ต้องการเพิ่ม field **"Wealth Advisor Code"** (ผู้แนะนำโครงการ / Referral) ในกระบวนการสั่งซื้อ ICO เพื่อให้ลูกค้าสามารถระบุผู้แนะนำโครงการได้ตั้งแต่ขั้นตอน Confirm Order และให้ BO Staff เห็นข้อมูลนี้ใน ICO Order Placement และ Subscription Order Detail

---

## Acceptance Criteria

1. **Mobile** — เพิ่ม dropdown field "Wealth Advisor Code" (รหัสผู้แนะนำการลงทุน)
   - dropdown แสดง options ที่ config ไว้สำหรับแต่ละ project
   - Pre-select ตาม `is_default = true` flag → ถ้าไม่มี → default เป็น "Not specified"
   - แสดงเฉพาะเมื่อ project มี referral options (referralOptions.isNotEmpty)
   - ส่ง referral value ไปพร้อม create order request

2. **BOF — ICO Order Placement** — เพิ่ม dropdown field "Wealth Advisor Code"
   - dropdown แสดง SA ที่แนะนำสำหรับแต่ละ project
   - **Required field** เสมอ — แต่ frontend pre-select "Not specified" เป็น default ไว้ให้เลยเพื่อไม่ให้มี blank state
   - Dropdown **ไม่ disabled** — BOF staff สามารถเลือกได้
   - ส่ง `referral_name_en` (string) ไป backend — null เมื่อเลือก "Not specified"

3. **BOF — Subscription Order Detail** — แสดง Wealth Advisor Code
   - ปรับ label จาก `'Referral'` → `'Wealth Advisor Code'`
   - ใช้ field `referral` เดิมจาก API response (ไม่ต้องแก้ model/hook)

---

## Key Findings (Current State)

### Mobile (xspring-mobile-app)
- **Confirm Order screen:** `lib/domains/project/preview_order/screen.dart`
- แสดง: order items → payment channel dropdown → total → confirm button
- **ไม่มี** wealth advisor / referral field อยู่เลย ต้องสร้างใหม่
- Controller: `IcoPlaceOrderController` (`place_order/controller.dart`)
- Model: `IcoCreateOrderModel` (`place_order/models/ico_create_order_model.dart`)
- Language: `lib/language/project/project_language.dart`
- Repository: `lib/repository/project/project_order_repository.dart`
  - `createOrder(IcoCreateOrderModel)` → POST `/api/v1/order-offering`

### BOF (web-portal)
- **ICO Order Placement Form:** `src/app/(order-flow)/ico-order-placement/[customerAccountId]/components/ico-order-placement-form.tsx`
- **ไม่มี** wealth advisor dropdown — ต้องเพิ่มใหม่
- **Subscription Order Detail** (`subscription-order/[orderId]/`)
  - field `referral` มีอยู่แล้วใน `order-information.tsx` (label: `'Referral'`)
  - ดึงข้อมูลจาก API field `order_information.referral`
  - ✅ ยืนยันแล้ว: backend ส่งใน field `referral` เดิม ไม่มี field ใหม่

---

## Confirmed API Behaviour

| เรื่อง | คำตอบ |
|-------|-------|
| Field name ใน create order request | `referral` |
| Field ใน subscription order detail response | `referral` (field เดิม — ไม่มี field ใหม่) |
| "Not specified" ส่งค่าอะไรไป backend | omit field `referral` ไปเลย (ไม่ส่ง) |
| Options มาจาก API ไหน | **เส้นเดิม (project detail)** — แนบมาใน response เดิม |
| Options source table | `dw_product.project_referral_list` |
| Value ที่ส่งไป backend | `referral_name_en` (string) — null ได้เมื่อเลือก "Not specified" |

---

## Database Schema

```sql
dw_product.project_referral_list (
  id                UUID,
  project_id        UUID,
  referral_name_th  VARCHAR(100),   -- ชื่อภาษาไทย
  referral_name_en  VARCHAR(100),   -- ชื่อภาษาอังกฤษ
  status            VARCHAR(20),    -- filter เฉพาะ 'active'
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,  -- pre-select ตัวนี้ (mobile)
  synced_at         TIMESTAMP,
  synced_by         VARCHAR(100),
  synced_by_name    VARCHAR(100)
)
```

**Dropdown display logic:**
- แสดงเฉพาะ `status = 'active'`
- Display name: `referral_name_th` (ภาษาไทย) / `referral_name_en` (ภาษาอังกฤษ) ตาม current language
- Mobile pre-select: item ที่ `is_default = true` → ถ้าไม่มี → "Not specified"
- BOF default: pre-select "Not specified" เสมอ (required field แต่ไม่มี blank state)
- Value ส่งไป backend: `referral_name_en` (string) — null เมื่อ "Not specified"
- Query order: `ORDER BY is_default DESC, referral_name_en ASC`

---

## Expected API Response (project detail — เพิ่ม referral_list)

```json
{
  "project_id": "...",
  "name_th": "...",
  "referral_list": [
    {
      "id": "uuid",
      "referral_name_th": "ไม่ระบุ",
      "referral_name_en": "Not specified",
      "is_default": true
    },
    {
      "id": "uuid",
      "referral_name_th": "XSpring Digital",
      "referral_name_en": "XSpring Digital",
      "is_default": false
    },
    {
      "id": "uuid",
      "referral_name_th": "KTX",
      "referral_name_en": "KTX",
      "is_default": false
    }
  ]
}
```

> `referral_list: []` (empty array) เมื่อ project ไม่มี referral config

---

## Implementation Plan

---

### Task 1: Backend — product-service (Get Referral Config)

**เป้าหมาย:** เพิ่ม `referral_list` ใน response ของ GET project detail API เส้นเดิม

**Endpoints ที่แก้:**
- `GET /api/v1/product/project/:project_id` — handler: `GetProjectDetail()`
- `GET /api/v1/product/project/:project_id/public` — handler: `GetProjectDetailPublic()`

> แก้ทั้ง 2 เส้น (authenticated + public) เพราะ Mobile ใช้ authenticated, BOF อาจใช้ public

#### 1.1 Domain Model

**File:** `internal/domain/project_referral.go` (ไฟล์ใหม่)

```go
// ProjectReferralDB — สำหรับ scan จาก DB
type ProjectReferralDB struct {
    Id             uuid.UUID `db:"id"`
    ProjectId      uuid.UUID `db:"project_id"`
    ReferralNameTh string    `db:"referral_name_th"`
    ReferralNameEn string    `db:"referral_name_en"`
    Status         string    `db:"status"`
    IsDefault      bool      `db:"is_default"`
}

// ProjectReferral — domain model
type ProjectReferral struct {
    Id             uuid.UUID
    ProjectId      uuid.UUID
    ReferralNameTh string
    ReferralNameEn string
    IsDefault      bool
}
```

#### 1.2 Repository Interface

**File:** `pkg/product/repository.go`

```go
type IProjectReferralRepository interface {
    GetActiveReferralsByProjectId(projectId uuid.UUID) ([]domain.ProjectReferral, error)
}
```

#### 1.3 Repository Implementation

**File:** `internal/storages/postgres/productrepository/project_referral.go` (ไฟล์ใหม่)

```go
func (r *ProjectReferralRepository) GetActiveReferralsByProjectId(
    projectId uuid.UUID,
) ([]domain.ProjectReferral, error) {
    query := `
        SELECT id, project_id, referral_name_th, referral_name_en, is_default
        FROM dw_product.project_referral_list
        WHERE project_id = $1
          AND status = 'active'
        ORDER BY is_default DESC, referral_name_en ASC
    `
    // scan → []ProjectReferralDB → map to []ProjectReferral
}
```

#### 1.4 Response Model

**File:** `internal/models/product_model.go`

```go
// Struct ใหม่
type ProjectReferralResponse struct {
    Id             string `json:"id"`
    ReferralNameTh string `json:"referral_name_th"`
    ReferralNameEn string `json:"referral_name_en"`
    IsDefault      bool   `json:"is_default"`
}

// เพิ่มใน ProjectDetailResponse
type ProjectDetailResponse struct {
    // ... existing fields ...
    ReferralList []ProjectReferralResponse `json:"referral_list"` // NEW
}
```

#### 1.5 Service

**File:** `pkg/product/service.go`

ใน `GetProductOfferingDetail()` — เพิ่ม call repository และ map ลง response:

```go
referrals, err := projectReferralRepository.GetActiveReferralsByProjectId(projectId)
// handle err

ReferralList: mapReferrals(referrals),

func mapReferrals(referrals []domain.ProjectReferral) []models.ProjectReferralResponse {
    result := make([]models.ProjectReferralResponse, len(referrals))
    for i, r := range referrals {
        result[i] = models.ProjectReferralResponse{
            Id:             r.Id.String(),
            ReferralNameTh: r.ReferralNameTh,
            ReferralNameEn: r.ReferralNameEn,
            IsDefault:      r.IsDefault,
        }
    }
    return result
}
```

#### 1.6 Dependency Injection

เพิ่ม `IProjectReferralRepository` ใน Service constructor และ wire ใน setup/main

#### Task 1 — File Checklist

- [ ] `internal/domain/project_referral.go` — สร้างใหม่ (domain structs)
- [ ] `pkg/product/repository.go` — เพิ่ม `IProjectReferralRepository` interface
- [ ] `internal/storages/postgres/productrepository/project_referral.go` — สร้างใหม่ (query implementation)
- [ ] `internal/models/product_model.go` — เพิ่ม `ProjectReferralResponse` + field ใน `ProjectDetailResponse`
- [ ] `pkg/product/service.go` — เพิ่ม call + map referral list ใน `GetProductOfferingDetail()`
- [ ] DI / setup file — wire `IProjectReferralRepository`

---

### Task 2: Mobile — xspring-mobile-app

**เป้าหมาย:** Re-design Confirm Order screen + เพิ่ม Wealth Advisor Code dropdown

#### Design Change Summary

| | Old | New |
|--|-----|-----|
| **Payment Channel** | Flat full-width white box, ไม่มี border-radius | รวมอยู่ใน rounded card เดียวกับ Wealth Advisor |
| **Wealth Advisor field** | ไม่มี | เพิ่มใหม่ใต้ Payment Channel ใน card เดียวกัน |
| **Layout** | Card (items) → Flat box (payment) | Card (items) → Card (payment + wealth advisor) |

#### Layout Structure (ใหม่)

```
PreviewOrderScreen
├── AppBar ("ยืนยันคำสั่งซื้อ" / "CONFIRM ORDER")
└── ScrollView
    ├── [Card 1] — Order Items Card (ไม่เปลี่ยน)
    │   ├── PreviewItem (x N)
    │   ├── DashLine
    │   └── TotalAmount
    │
    ├── [Card 2] — Options Card (ใหม่ — แทน PaymentChannel widget เดิม)
    │   ├── label: "ช่องทางการชำระเงิน"
    │   ├── DropdownWidget (payment channel)
    │   ├── Divider
    │   ├── label: "รหัสผู้แนะนำการลงทุน"  ← NEW
    │   └── DropdownWidget (wealth advisor)  ← NEW (แสดงเฉพาะ referralOptions.isNotEmpty)
    │
    └── SizedBox(height: 20)

bottomNavigationBar: ConfirmOrderButton
```

#### 2.1 Language Keys

**File:** `lib/language/project/project_language.dart`

```dart
static const String labelWealthAdvisorCodeKey = 'project-label-wealth-advisor-code';
static const String labelNotSpecifiedKey = 'project-label-not-specified';
```

```dart
labelWealthAdvisorCodeKey: {
  'th': 'รหัสผู้แนะนำการลงทุน',
  'en': 'Wealth advisor code',
},
labelNotSpecifiedKey: {
  'th': 'ไม่ระบุ',
  'en': 'Not specified',
},
```

#### 2.2 Model — ProjectReferralOption (ใหม่)

**File:** `lib/domains/project/place_order/models/project_referral_option_model.dart` (ไฟล์ใหม่)

```dart
class ProjectReferralOption {
  final String id;
  final String referralNameTh;
  final String referralNameEn;
  final bool isDefault;

  ProjectReferralOption({
    required this.id,
    required this.referralNameTh,
    required this.referralNameEn,
    required this.isDefault,
  });

  factory ProjectReferralOption.fromJson(Map<String, dynamic> json) =>
      ProjectReferralOption(
        id: json['id'] as String,
        referralNameTh: json['referral_name_th'] as String,
        referralNameEn: json['referral_name_en'] as String,
        isDefault: json['is_default'] as bool? ?? false,
      );

  String displayName(String languageCode) =>
      languageCode == 'th' ? referralNameTh : referralNameEn;
}
```

#### 2.3 Model — IcoCreateOrderModel

**File:** `lib/domains/project/place_order/models/ico_create_order_model.dart`

```dart
class IcoCreateOrderModel {
  final String projectId;
  final List<IcoOrderDetail> order;
  final String paymentMethod;
  final String? referral; // NEW — referral_name_en, null = Not specified

  Map<String, dynamic> toJson() => {
    'project_id': projectId,
    'order': order.map((e) => e.toJson()).toList(),
    'payment_method': paymentMethod,
    'referral': referral, // null เมื่อ "Not specified"
  };
}
```

#### 2.4 Controller — IcoPlaceOrderController

**File:** `lib/domains/project/place_order/controller.dart`

```dart
// State
RxList<ProjectReferralOption> referralOptions = <ProjectReferralOption>[].obs;
RxString selectedReferral = ''.obs;
Dropdown? defaultReferralItem;

// Map referralOptions → List<Dropdown> สำหรับ DropdownWidget
// code = referral_name_en (value ที่ส่งไป backend — คงที่ ไม่ขึ้นกับภาษาที่เลือก)
// name = display name ตาม language (TH/EN สำหรับแสดงผลบนหน้าจอ)
List<Dropdown> referralDropdownList() {
  final notSpecified = Dropdown(
    code: '',  // '' = null → "Not specified"
    name: ProjectLanguage.labelNotSpecifiedKey.tr,
  );
  final options = referralOptions.map((o) => Dropdown(
    code: o.referralNameEn,  // ส่ง referral_name_en ไป backend
    name: Get.locale?.languageCode == 'th' ? o.referralNameTh : o.referralNameEn,
  )).toList();
  return [notSpecified, ...options];
}

// Set options + pre-select is_default (ถ้าไม่มี → pre-select "Not specified")
void _setReferralOptions(List<ProjectReferralOption> options) {
  referralOptions.value = options;
  final defaultOpt = options.firstWhereOrNull((o) => o.isDefault);
  if (defaultOpt != null) {
    selectedReferral.value = defaultOpt.referralNameEn;
    defaultReferralItem = Dropdown(
      code: defaultOpt.referralNameEn,
      name: Get.locale?.languageCode == 'th' ? defaultOpt.referralNameTh : defaultOpt.referralNameEn,
    );
  }
  // ถ้าไม่มี is_default → selectedReferral = '' (Not specified)
}
```

ใน `confirmOrder()` — pass `selectedReferral.value` เข้า `IcoCreateOrderModel.referral`:
- มีค่า (`referral_name_en`) → ส่งไป backend
- ว่าง (`''`) = "Not specified" → ส่ง null

#### 2.5 PaymentChannel Widget — Refactor เป็น Section

**File:** `lib/domains/project/preview_order/widgets/payment_channel.dart`

ตัด Container ออก → เหลือแค่ Column ของ label + DropdownWidget (เป็น `PaymentChannelSection`)

```dart
class PaymentChannelSection extends StatelessWidget {
  final List<Dropdown> paymentChannels;
  final ValueChanged<Dropdown?> onChanged;
  final Dropdown? defaultItem;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          ProjectLanguage.titlePaymentChannelKey.tr,
          style: XSpringFonts.textXLS(fontColor: XSpringColors.ink),
        ),
        GapSpacing.p5,
        DropdownWidget(
          listDropdown: paymentChannels,
          onChanged: onChanged,
          defaultItem: defaultItem,
        ),
      ],
    );
  }
}
```

#### 2.6 WealthAdvisorSection Widget (ใหม่)

**File:** `lib/domains/project/preview_order/widgets/wealth_advisor_section.dart` (ไฟล์ใหม่)

```dart
class WealthAdvisorSection extends StatelessWidget {
  final List<Dropdown> referralOptions;
  final ValueChanged<Dropdown?> onChanged;
  final Dropdown? defaultItem;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          ProjectLanguage.labelWealthAdvisorCodeKey.tr,
          style: XSpringFonts.textXLS(fontColor: XSpringColors.ink),
        ),
        GapSpacing.p5,
        DropdownWidget(
          listDropdown: referralOptions,
          onChanged: onChanged,
          defaultItem: defaultItem,
        ),
      ],
    );
  }
}
```

#### 2.7 ConfirmOrderOptionsCard Widget (ใหม่)

**File:** `lib/domains/project/preview_order/widgets/confirm_order_options_card.dart` (ไฟล์ใหม่)

```dart
class ConfirmOrderOptionsCard extends StatelessWidget {
  final List<Dropdown> paymentChannels;
  final ValueChanged<Dropdown?> onPaymentChanged;
  final Dropdown? defaultPaymentItem;

  final List<Dropdown> referralOptions;
  final ValueChanged<Dropdown?> onReferralChanged;
  final Dropdown? defaultReferralItem;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.symmetric(horizontal: XSpringPaddings.p4),
      padding: EdgeInsets.all(XSpringPaddings.p4),
      decoration: BoxDecoration(
        color: XSpringColors.main900,
        borderRadius: BorderRadius.circular(XSpringCornerRadius.radiusSM),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PaymentChannelSection(
            paymentChannels: paymentChannels,
            onChanged: onPaymentChanged,
            defaultItem: defaultPaymentItem,
          ),
          // แสดงเฉพาะเมื่อ project มี referral options
          if (referralOptions.isNotEmpty) ...[
            Divider(color: XSpringColors.evergreen10, height: XSpringPaddings.p8),
            WealthAdvisorSection(
              referralOptions: referralOptions,
              onChanged: onReferralChanged,
              defaultItem: defaultReferralItem,
            ),
          ],
        ],
      ),
    );
  }
}
```

#### 2.8 Preview Order Screen

**File:** `lib/domains/project/preview_order/screen.dart`

แทน `PaymentChannel(...)` ด้วย `ConfirmOrderOptionsCard(...)`:

```dart
Obx(() => ConfirmOrderOptionsCard(
  paymentChannels: icoPlaceOrderController.paymentChannelDisplayList(),
  onPaymentChanged: (value) {
    icoPlaceOrderController.selectedPaymentChannel.value = value?.code ?? '';
    icoPlaceOrderController.defaultDropdownItem = value;
  },
  defaultPaymentItem: icoPlaceOrderController.defaultDropdownItem,

  referralOptions: icoPlaceOrderController.referralDropdownList(),
  onReferralChanged: (value) {
    icoPlaceOrderController.selectedReferral.value = value?.code ?? '';
    icoPlaceOrderController.defaultReferralItem = value;
  },
  defaultReferralItem: icoPlaceOrderController.defaultReferralItem,
)),
```

#### Task 2 — File Checklist

- [ ] `lib/language/project/project_language.dart` — เพิ่ม 2 language keys
- [ ] `lib/domains/project/place_order/models/project_referral_option_model.dart` — สร้างใหม่
- [ ] `lib/domains/project/place_order/models/ico_create_order_model.dart` — เพิ่ม `referral` field
- [ ] `lib/domains/project/place_order/controller.dart` — เพิ่ม referral state + `referralDropdownList()` + `_setReferralOptions()`
- [ ] `lib/domains/project/preview_order/widgets/payment_channel.dart` — refactor เป็น section widget
- [ ] `lib/domains/project/preview_order/widgets/wealth_advisor_section.dart` — สร้างใหม่
- [ ] `lib/domains/project/preview_order/widgets/confirm_order_options_card.dart` — สร้างใหม่
- [ ] `lib/domains/project/preview_order/screen.dart` — แทน `PaymentChannel` ด้วย `ConfirmOrderOptionsCard`

---

### Task 3: BOF — web-portal (ICO Order Placement)

**เป้าหมาย:** เพิ่ม Wealth Advisor Code dropdown ในหน้า ICO Order Placement

#### 3.1 Types

**File:** `src/app/(order-flow)/ico-order-placement/[customerAccountId]/type.ts`

```typescript
interface IICOOrderPlacementForm {
  // ... existing fields
  referral: string // NEW — referral_name_en, '' = Not specified
}

interface IProjectReferralOption {
  id: string
  referralNameTh: string
  referralNameEn: string
  isDefault: boolean
}

// เพิ่มใน IICOProject
interface IICOProject {
  // ... existing fields
  referralList: IProjectReferralOption[] // NEW — filtered status='active' จาก backend
}
```

#### 3.2 ICO Order Placement Form

**File:** `src/app/(order-flow)/ico-order-placement/[customerAccountId]/components/ico-order-placement-form.tsx`

เพิ่ม Wealth Advisor Code field:
- **ไม่ disabled** — BOF staff เลือกได้ปกติ
- **Required field** เสมอ — pre-select "Not specified" เป็น default (ไม่มี blank state)
- Value = `referralNameEn` ของ option ที่เลือก, `''` = Not specified (ส่ง null ไป backend)
- Display name: `referralNameEn`

```tsx
<FormField
  control={form.control}
  name="referral"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Wealth Advisor Code</FormLabel>
      <Select value={field.value} onValueChange={field.onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Not specified</SelectItem>
          {referralList.map(opt => (
            <SelectItem key={opt.id} value={opt.referralNameEn}>
              {opt.referralNameEn}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormItem>
  )}
/>
```

> Default value ของ form: `referral: ''` (Not specified) — set ใน `defaultValues`

#### 3.3 Model — IcoOrderPlacementModel

**File:** `src/app/(order-flow)/ico-order-placement/[customerAccountId]/models/ico-order-placement-model.ts`

```typescript
// '' = "Not specified" → ส่ง null ไป backend
// มีค่า = ส่ง referral_name_en
referral: formData.referral || null,
```

#### Task 3 — File Checklist

- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/type.ts` — เพิ่ม `referral`, `IProjectReferralOption`, `referralList` ใน `IICOProject`
- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/components/ico-order-placement-form.tsx` — เพิ่ม Select field (`name="referral"`, disabled)
- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/components/ico-order-placement-form.test.tsx` — unit test
- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/models/ico-order-placement-model.ts` — เพิ่ม `referral` ใน transform

---

### Task 4: BOF — web-portal (Subscription Order Detail)

**เป้าหมาย:** ปรับ label field "Referral" → "Wealth Advisor Code"

**File:** `src/app/(order-flow)/ico-order-placement/subscription-order/[orderId]/components/order-information.tsx`

```tsx
// เดิม
<DataRow label='Referral' value={model.referral} />

// ใหม่
<DataRow label='Wealth Advisor Code' value={model.referral} />
```

> `model.referral` และ `useSubscriptionDetail` ที่ map `order_information.referral` ยังใช้ได้เดิม ไม่ต้องแก้ไข

#### Task 4 — File Checklist

- [ ] `src/app/(order-flow)/ico-order-placement/subscription-order/[orderId]/components/order-information.tsx` — ปรับ label `'Referral'` → `'Wealth Advisor Code'`
- ~~`model.tsx`~~ — ไม่ต้องแก้
- ~~`useSubscriptionDetail.ts`~~ — ไม่ต้องแก้

---

## Open Questions

| # | คำถาม | ผลกระทบ | Status |
|---|-------|---------|--------|
| 1 | BOF — existing order (view mode): Wealth Advisor Code ยัง editable อยู่ไหม หรือ read-only? | `ico-order-placement-form.tsx` | ⚠️ ยังไม่แน่ใจ |

**Confirmed ทั้งหมด:**
- ✅ Create order request field name: `referral`
- ✅ Value ที่ส่งไป backend: `referral_name_en` (string) — null เมื่อเลือก "Not specified"
- ✅ Subscription order detail response field: `referral` (field เดิม ไม่มี field ใหม่)
- ✅ "Not specified" → ส่ง null ไป backend
- ✅ Options source: project detail API เส้นเดิม, table `dw_product.project_referral_list`
- ✅ Display: `referral_name_th` / `referral_name_en` ตาม language
- ✅ Mobile pre-select: item ที่ `is_default = true` → ถ้าไม่มี → "Not specified"
- ✅ BOF default: pre-select "Not specified" เสมอ (required, ไม่มี blank state)
- ✅ Filter: แสดงเฉพาะ `status = 'active'`
- ✅ BOF display language: English (`referral_name_en`)
- ✅ Mobile Order Detail: ไม่แสดง Wealth Advisor Code

---

## Full File Checklist

### Backend (product-service)
- [ ] `internal/domain/project_referral.go` — สร้างใหม่
- [ ] `pkg/product/repository.go` — เพิ่ม interface
- [ ] `internal/storages/postgres/productrepository/project_referral.go` — สร้างใหม่
- [ ] `internal/models/product_model.go` — เพิ่ม response struct + field
- [ ] `pkg/product/service.go` — เพิ่ม call + map
- [ ] DI/setup file — wire repository

### Mobile (xspring-mobile-app)
- [ ] `lib/language/project/project_language.dart`
- [ ] `lib/domains/project/place_order/models/project_referral_option_model.dart`
- [ ] `lib/domains/project/place_order/models/ico_create_order_model.dart`
- [ ] `lib/domains/project/place_order/controller.dart`
- [ ] `lib/domains/project/preview_order/widgets/payment_channel.dart`
- [ ] `lib/domains/project/preview_order/widgets/wealth_advisor_section.dart`
- [ ] `lib/domains/project/preview_order/widgets/confirm_order_options_card.dart`
- [ ] `lib/domains/project/preview_order/screen.dart`

### BOF (web-portal) — ICO Order Placement
- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/type.ts`
- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/components/ico-order-placement-form.tsx`
- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/components/ico-order-placement-form.test.tsx`
- [ ] `src/app/(order-flow)/ico-order-placement/[customerAccountId]/models/ico-order-placement-model.ts`

### BOF (web-portal) — Subscription Order Detail
- [ ] `src/app/(order-flow)/ico-order-placement/subscription-order/[orderId]/components/order-information.tsx`
