
## Requirement

1. **Mobile App** — กรณีเข้าหน้าจอ Deposit ในครั้งถัดไป (existing wallet): แก้ไข Action จาก `generate_qr_wallet` เป็น `view_info` และแก้ไขการลง detail ให้ถูกต้อง
2. **White Glove** — กรณีเข้าหน้าจอ Deposit ในครั้งถัดไป (existing wallet): แก้ไข Action จาก `generate_qr_wallet` เป็น `view_info` และแก้ไขการลง detail ให้ถูกต้อง
3. **Trading Web** — เพิ่ม Audit log กรณีเข้าหน้าจอ Deposit ในครั้งถัดไป โดยลงเป็น Action: `view_info`
4. **All** — ลง Fireblocks destination URL ที่ field `destination_address` ตอน action `generate_qr_wallet`

---

## Files

| File | Handler |
|---|---|
| `handler/order_crypto.go` | Mobile App |
| `handler/white_glove_handler.go` | White Glove |
| `handler/trading_handler.go` | Trading Web |

---

## Changes

### 1. Mobile — `handler/order_crypto.go`

#### `GetWalletAddress` (view existing wallet — ครั้งถัดไป)
- Action: `GenerateQRWallet` → `ViewInfoAction`
- Detail: keep `"xpg_account_code: %s, product_symbol: %s"` (already set correctly)

#### `CreateWalletAddress` → `generateQRAddressAuditLog` (create new wallet — ครั้งแรก)
- Detail: **keep** `"xpg_account_code: %s, product_symbol: %s"` (same as `create_wallet`)
- DestinationAddress: **add** `&newAddress.Address` (Fireblocks destination URL)

#### `CreateWalletAddress` → `createAddressAuditLog` — no change

---

### 2. White Glove — `handler/white_glove_handler.go`

#### `InquiryCryptoWalletAddress` (view existing wallet — ครั้งถัดไป)
- Action: `GenerateQRWallet` → `ViewInfoAction`
- Detail: **add** `fmt.Sprintf("xpg_account_code: %s, product_symbol: %s", address.XpgAccountCode, address.ProductSymbol)` (currently empty on success)

#### `CreateCryptoWalletAddress` → `generateQRAddressAuditLog` (create new wallet — ครั้งแรก)
- Detail: **add** `"xpg_account_code: %s, product_symbol: %s"` (same as `create_wallet`, currently empty)
- DestinationAddress: **add** `&newAddress.Address` (Fireblocks destination URL)

#### `CreateCryptoWalletAddress` → `createAddressAuditLog` — no change

---

### 3. Trading — `handler/trading_handler.go`

#### `GetCryptoWalletAddress` (view existing wallet — ครั้งถัดไป)
- **ADD** new audit log (currently no audit log exists)
  - Application: `ApplicationTradeWeb`
  - Sequence: `DepositCrypto`
  - Action: `ViewInfoAction`
  - Detail: `fmt.Sprintf("xpg_account_code: %s, product_symbol: %s", address.XpgAccountCode, address.ProductSymbol)`
  - Save via `SaveAuditLogWithoutOrderRequest`

#### `CreateWalletAddress` → `generateQRAddressAuditLog` (create new wallet — ครั้งแรก)
- Detail: **keep** `"xpg_account_code: %s, product_symbol: %s"` (same as `create_wallet`)
- DestinationAddress: **add** `&newAddress.Address` (Fireblocks destination URL)

#### `CreateWalletAddress` → `createAddressAuditLog` — no change

---

## Summary Table

| Handler | File | Action | `Detail` | `DestinationAddress` |
|---|---|---|---|---|
| `GetWalletAddress` | Mobile | `view_info` *(changed)* | `xpg_account_code, product_symbol` | — |
| `CreateWalletAddress` → `createAddressAuditLog` | Mobile | `create_wallet` | `xpg_account_code, product_symbol` | — |
| `CreateWalletAddress` → `generateQRAddressAuditLog` | Mobile | `generate_qr_wallet` | `xpg_account_code, product_symbol` *(same as create_wallet)* | `newAddress.Address` *(added)* |
| `InquiryCryptoWalletAddress` | White Glove | `view_info` *(changed)* | `xpg_account_code, product_symbol` *(added)* | — |
| `CreateCryptoWalletAddress` → `createAddressAuditLog` | White Glove | `create_wallet` | `xpg_account_code, product_symbol` | — |
| `CreateCryptoWalletAddress` → `generateQRAddressAuditLog` | White Glove | `generate_qr_wallet` | `xpg_account_code, product_symbol` *(added, same as create_wallet)* | `newAddress.Address` *(added)* |
| `GetCryptoWalletAddress` | Trading | `view_info` *(new)* | `xpg_account_code, product_symbol` *(new)* | — |
| `CreateWalletAddress` → `createAddressAuditLog` | Trading | `create_wallet` | `xpg_account_code, product_symbol` | — |
| `CreateWalletAddress` → `generateQRAddressAuditLog` | Trading | `generate_qr_wallet` | `xpg_account_code, product_symbol` *(same as create_wallet)* | `newAddress.Address` *(added)* |
