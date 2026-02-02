# Fee Campaign System Documentation

## Overview

The sale-service implements a **campaign-based fee management system**. Instead of traditional customer tiers (e.g., Bronze/Silver/Gold), fees are managed through time-bound campaigns with specific conditions and rates.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Fee Campaign System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Create     │───▶│   Match      │───▶│   Apply      │      │
│  │  Campaign    │    │  Campaign    │    │    Fee       │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Set Rate    │    │ Check Active │    │  Calculate   │      │
│  │  Conditions  │    │   Status     │    │  Fee Amount  │      │
│  │  Date Range  │    │   Priority   │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model

### TransactionFeeDB

Located in: `internal/domain/transaction_fee.go`

| Field | Type | Description |
|-------|------|-------------|
| `ID` | int64 | Primary key |
| `FeeValue` | decimal.Decimal | Fee rate (e.g., 0.12 = 12%) |
| `FeeUnit` | string | Fee unit - only "percent" supported |
| `Condition` | datatypes.JSON | JSON-encoded conditions for fee application |
| `IsIncludeAdditionalFee` | bool | Whether to include additional fees |
| `StartDate` | time.Time | Campaign start date |
| `EndDate` | time.Time | Campaign end date |
| `Status` | string | "active", "inactive", or "expired" |
| `Priority` | int | Order for matching campaigns (1 = campaign priority) |
| `CompanyCode` | string | Company code - only "XD" supported |
| `TransactionType` | string | Transaction type - only "swap" supported |
| `FeeType` | string | Fee type - only "fee" supported |
| `IsCampaign` | bool | Marks if this is a campaign (true) or default fee |
| `IsDeleted` | bool | Soft delete flag |
| `CreatedBy` | string | Creator user ID |
| `UpdatedBy` | string | Updater user ID |
| `CreatedAt` | time.Time | Creation timestamp |
| `UpdatedAt` | time.Time | Last update timestamp |

### Condition Format

The `Condition` field stores JSON with parameters for fee application:

```json
{
  "onboarding_day": {
    "operator": ">=",
    "value": 30
  },
  "onboarding_date": {
    "operator": "between",
    "value": ["2024-01-01", "2024-12-31"]
  }
}
```

**Supported Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `onboarding_day` | int | Number of days since customer onboarding |
| `onboarding_date` | date/string | Specific onboarding date or range |

## Enums and Constants

| Enum | Values | Description |
|------|--------|-------------|
| `CompanyCode` | "XD" | Only XD company is supported |
| `TransactionType` | "swap" | Only swap transactions are supported |
| `FeeType` | "fee" | Only fee type is supported |
| `FeeUnit` | "percent" | Only percentage-based fees |
| `Status` | "active", "inactive", "expired" | Campaign status |
| `Priority` | 1 | Campaign priority (1 = campaign) |

## API Endpoints

### Campaign Management

#### Create Campaign

```
POST /api/v1/sale/campaign
```

Creates a new fee campaign. Automatically sets `IsCampaign = true`.

**Request Body:**

```json
{
  "fee_value": 0.12,
  "fee_unit": "percent",
  "condition": {...},
  "is_include_additional_fee": true,
  "start_date": "2024-01-01T00:00:00Z",
  "end_date": "2024-12-31T23:59:59Z",
  "status": "active"
}
```

#### Get Campaigns (Paginated)

```
GET /api/v1/sale/campaign?page=1&limit=10
```

Returns paginated list of campaigns.

#### Get Campaign Detail

```
GET /api/v1/sale/campaign/{campaign_id}
```

Returns detailed information for a specific campaign.

#### Update Campaign Status

```
PATCH /api/v1/sale/campaign/status/{campaign_id}
```

Updates campaign status to "active" or "inactive".

**Request Body:**

```json
{
  "status": "active"
}
```

#### Delete Campaign

```
DELETE /api/v1/sale/campaign/{campaign_id}
```

Soft deletes a campaign. Only allowed if campaign status is "inactive".

## Fee Application Logic

### Campaign Matching Process

When a transaction occurs, the system follows this flow:

```
1. Fetch Active Campaigns
   ├─ Status = "active"
   ├─ IsCampaign = true
   ├─ IsDeleted = false
   └─ Current date within StartDate/EndDate range

2. Order by Priority
   ├─ Priority (ascending)
   └─ CreatedAt (descending)

3. Match Conditions
   ├─ Evaluate JSON conditions
   └─ Find first matching campaign

4. Apply Fee
   ├─ Use FeeValue from matched campaign
   └─ Respect IsIncludeAdditionalFee flag
```

### Campaign Selection Query

```sql
SELECT * FROM xpg_sale.transaction_fee
WHERE status = 'active'
  AND is_campaign = true
  AND is_deleted = false
  AND start_date <= CURRENT_DATE
  AND end_date >= CURRENT_DATE
ORDER BY priority ASC, created_at DESC
```

## Key Characteristics

### Flexible

- JSON-based conditions allow dynamic rules
- Time-bound campaigns with explicit date ranges
- Priority-based ordering for predictable fee selection

### Event-Driven

- Campaign changes (create, update, delete) produce messages
- Enables integration with other services
- Supports real-time fee updates across the system

### Auditable

- Full audit trail with CreatedBy/UpdatedBy fields
- Timestamps for all operations
- Soft deletion preserves history

### No Fixed Tiers

- Not a traditional tier-based system
- No customer assignment to tiers
- Progressive, campaign-driven approach

## Example Use Cases

### New Customer Promotion

```json
{
  "fee_value": 0.05,
  "start_date": "2024-01-01",
  "end_date": "2024-03-31",
  "condition": {
    "onboarding_day": {"operator": "<=", "value": 30}
  }
}
```

Applies 5% fee for customers within first 30 days.

### Special Event Campaign

```json
{
  "fee_value": 0.08,
  "start_date": "2024-12-01",
  "end_date": "2024-12-31",
  "condition": {}
}
```

Applies 8% fee for all transactions during December.

## Important Notes

1. **No Traditional Tiers**: This is NOT a multi-tier fee system. Customers are not placed in fixed tiers.

2. **Current Limitations:**
   - Only "XD" company code supported
   - Only "swap" transaction type supported
   - Only "percent" fee unit supported
   - Only "fee" fee type supported

3. **Campaign Exclusivity**: Each transaction matches to ONE campaign (first match by priority).

4. **Soft Delete**: Deleted campaigns are marked but not removed from database.

## Related Files

- `internal/domain/transaction_fee.go` - Domain model and database schema
- `internal/service/transaction_fee_service.go` - Business logic
- `handler/transaction_fee_handler.go` - HTTP handlers
- `routes/transaction_fee_routes.go` - Route definitions
