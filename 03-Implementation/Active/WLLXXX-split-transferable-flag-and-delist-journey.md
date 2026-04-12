# WLLXXX - Separate Flag: Transferable for Deposit/Withdraw and Support Delist Journey

## Objective
To separate the existing `Transferable` flag into `Depositable` and `Withdrawable` and to implement the delisting journey for digital assets, ensuring that delisted coins do not affect customer balances and that their open limit orders are cancelled.

## Acceptance Criteria (AC)
1.  **Channels**: MOB / Web Trade / Weare.
2.  **Flag Separation**: Split `Transferable` into `Depositable` and `Withdrawable`. Update all relevant logic to use the correct flag based on the operation (Deposit or Withdraw).
3.  **Delist Info**: Ensure coin information is displayed correctly after delisting.
4.  **Balance Protection**: When `Depositable = FALSE` (Delisted), do not process incoming webhooks/hooks to avoid updating customer balances.
5.  **Cancel Limit Orders**: Automatically cancel all open limit orders for delisted assets and ensure movements are correctly recorded.
6.  **Market Data**: Stop fetching prices and clear existing price data from the `product_digital_asset_mark_to_market` table.

---

## 1. Database & Schema Changes

### 1.1 Table `product_digital_asset_extension`
- Add column `depositable` (boolean, default true).
- Add column `withdrawable` (boolean, default true).
- (Optional) Keep `transferable` for backward compatibility or migrate its value to the new columns.

### 1.2 Table `product_digital_asset_mark_to_market`
- Ensure a mechanism to delete rows by `product_id`.

---

## 2. Domain & Entity Layer Changes

### 2.1 Update `internal/domain/product_digital_asset_extension.go`
- Modify `ProductDAExtensionDB` to include `Depositable` and `Withdrawable` fields with proper GORM tags.

### 2.2 Update `internal/domain/product_on_shelf.go`
- Modify `ProductOnShelfOption` to replace `IsTransferable` with `IsDepositable` and `IsWithdrawable`.

---

## 3. Repository Layer Changes

### 3.1 Update `storages/postgres/productrespository/product_repository.go`
- Modify `GetProductOnShelf` to use the correct flag:
    - If filtering for **Deposit**: Use `pdae.depositable = ?`.
    - If filtering for **Withdrawal**: Use `pdae.withdrawable = ?`.

### 3.2 Update `storages/postgres/productrespository/product_digital_asset_mark_to_market_repository.go`
- Implement a `DeleteByProductID(productID uuid.UUID) error` method to clear price data for delisted assets.

### 3.3 Update `pkg/order_trade/repository.go`
- Implement a method to find all open limit orders by a specific asset (where asset is base or quote).

---

## 4. Service Layer Implementation

### 4.1 Update Crypto Product Service (`pkg/crypto_product/service.go`)
- In `GetProductCrypto`, update `ProductOnShelfOption` initialization to set `IsDepositable` or `IsWithdrawable` based on the requested operation type.

### 4.2 Update Crypto Order Service (`pkg/crypto/service.go`)
- **Webhook Check**: In `HandleDepositCryptoWebhook`, check the `Depositable` flag from the product extension. If `Depositable == FALSE`, log the event and return early (skip balance processing).

### 4.3 Update Order Trade Service (`pkg/order_trade/service.go`)
- Implement a new internal method `CancelAllOrdersForAsset(assetID uuid.UUID)` that:
    1. Fetches all open orders for the asset.
    2. Iterates and calls existing `CancelSwapOrder` logic for each.
    3. Ensures ledger movements are recorded correctly for cancellations.

---

## 5. Delist Journey Execution Plan (Trigger Mechanism)

The Delist process should follow these steps:
1.  **Update Database Flags**: Set `depositable = FALSE` and `withdrawable = FALSE` for the target asset.
2.  **Cancel Open Orders**: Execute the batch cancellation logic developed in 4.3.
3.  **Clear Market Data**: Execute the deletion of mark-to-market data developed in 3.2.
4.  **Stop Price Fetching**: Disable the asset in the price fetcher configuration (external to this service if applicable).

---

## 6. Verification & Testing Strategy

### 6.1 Unit Tests
- Test `GetProductOnShelf` with the new flags.
- Test `HandleDepositCryptoWebhook` to ensure it skips processing when `Depositable = FALSE`.
- Test `CancelAllOrdersForAsset` with mocked repository data.

### 6.2 Integration Tests
- Verify that a deposit hook for a delisted asset does not increase customer balance.
- Verify that open limit orders are cancelled and funds are unlocked (if applicable) after delisting.
- Verify that the `mark-to-market` table is cleared for the delisted asset.
