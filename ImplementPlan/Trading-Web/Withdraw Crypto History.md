# Plan: Implement Order History Withdraw Tab

  

After reviewing the `GetTradingOrderHistoryList` backend API implementation, **the backend already fully supports querying and returning all necessary data for the "Withdraw" tab.**

  

No backend database or API changes are required in `order-service` to support this UI feature. This plan exclusively covers the required frontend integration steps in the `trading-web` project.

  

## Overview

The new "Withdraw" tab will consume the existing `GET /api/v1/trading/order-history` endpoint by simply passing the filter query parameter `?type=withdrawal`.

  

The response model (`TradingOrderHistoryItemResponse`) natively supplies every column required by the design:

- **Create Date:** `created_at`

- **Type:** `order_type` ("withdrawal") + `product_type` ("crypto" / "fiat")

- **Asset:** `product_icon`, `symbol`, and `product_name`

- **Amount:** `quantity_display` combined with `symbol`

- **Status:** `status` string matching the custom badge states

  

---

  

## Technical Integration Plan (trading-web)

  

### Step 1: Update API Service Queries

**File:** `src/services/api/trading.ts` (or equivalent HTTP service directory)

1. Locate the existing `getOrderHistory` or equivalent hook covering `GET /api/v1/trading/order-history`.

2. Ensure the query hook can accept `type=withdrawal` as a valid filter param.

  

### Step 2: Add "Withdraw" Tab Component

**File:** Add component to your table view hierarchy (e.g. `src/features/order-history/OrderHistoryPage.tsx`)

1. Extend the existing tabs ("Swap", "Deposit") to include a third standard tab: "Withdraw".

2. When the user selects the "Withdraw" tab, trigger the history API call using the `type=withdrawal` query parameter payload alongside existing `asset`, `date`, and pagination states.

  

### Step 3: Map API Response to Table Columns

**File:** `src/features/order-history/components/WithdrawHistoryTable.tsx` (or equivalent data grid view)

Configure the data table's column definitions to map directly to the API response properties:

  

1. **Create Date:** Format `row.created_at` (e.g. "DD/MM/YYYY, HH:mm").

2. **Type:** Display title using `row.order_type` (TitleCase) and an underlying subtitle using `row.product_type`. Include a generic red/pink circle-arrow icon representing a withdrawal.

3. **Asset:** Render `row.product_icon` via an `<Image />` component. Display `row.symbol` bolded, with `row.product_name` as the subtitle.

4. **Amount:** Display `${row.quantity_display} ${row.symbol}`.

5. **Status:** Pass `row.status` into the existing generic Status Badge component.

- *Supported Strings Mapping:* "Processing" (Yellow), "Completed" (Green), "Rejected" (Red), "Email Pending" (Yellow), "Cancelled" (Grey).

  

### Step 4: Hook up Filters and Export

1. Bind the Asset Dropdown (`row.symbol`) and Date Picker filters to trigger the API refetch by passing the `asset=` or `date=` query parameters.

2. Bind the "Download CSV" button to execute a full data export based on the current filtering parameters.