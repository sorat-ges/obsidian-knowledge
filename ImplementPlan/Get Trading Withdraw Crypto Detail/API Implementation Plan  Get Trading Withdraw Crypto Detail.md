
The goal is to implement an API endpoint inside `trading_handler.go` that fetches the withdraw crypto details. This must perfectly map `icon` dynamically via the product ID.

  

## 🧑‍💻 Instructions for AI Agent

  

### Step 1: Update Entities

**File:** `order-service/internal/entities/order_withdraw_crypto.go`

1. Locate the `OrderWithdrawCryptoDetailResponse` struct.

2. Add a new string field `Icon` to the struct with the json tag `json:"icon"`.

  

### Step 2: Update Crypto Service Layer

**File:** `order-service/pkg/crypto/service.go`

1. Locate the `GetOrderWithdrawCryptoDetail` method.

2. Below the network extraction logic, execute a product lookup using `s.ProductRepo.GetProductByID(nil, *order.ProductId())`.

3. Check the error: `if err == nil && product != nil && product.Icon != ""`.

4. If true, assign the mapped URL to a variable `iconUrl`: `iconUrl = s.Config.PublicStorageURL + product.Icon`

5. Inject `iconUrl` into the returned `entities.OrderWithdrawCryptoDetailResponse` object on the `Icon` property.

  

### Step 3: Implement Trading Handler Endpoint

**File:** `order-service/handler/trading_handler.go`

1. Create `func (h *TradingHandler) GetTradingWithdrawCryptoDetail(req *httpserv.Request) (*httpserv.Response, error)`.

2. Parse the `order_id` string from `req.Params.Get("order_request_id")` using `uuid.FromString`. Return a 422 Unprocessable Entity error if parsing fails.

3. Extract user claims from `req.Claims.(middleware.PortalClaims)`. Return a 401 Unauthorized error if this cast fails.

4. Parse `claims.UserUUID` with `uuid.FromString` to get `identificationId`. Return a 400 Bad Request if it fails.

5. Construct `utils.AuditLogRequest`:

- Application: `auditLogEnum.ApplicationXspringApp.String()`

- Sequence: `auditLogEnum.WithdrawCrypto.String()`

- Action: `auditLogEnum.ViewInfoAction.String()`

- OrderID: `orderWithdrawId`

- Result: `auditLogEnum.ResultSuccess.String()`

6. Call `result, err := h.cryptoOrderService.GetOrderWithdrawCryptoDetail(orderId, identificationId)`.

7. Handle lookup errors: log the failure, set `auditLog.Result = auditLogEnum.ResultFail.String()`, set `auditLog.Detail`, and return a 500 Internal Server error containing the actual error message.

8. On success, log the operation cleanly with `DataLog: {"order_withdraw_id": orderWithdrawId, "customer_id": identificationId, "status": result.Status}`

9. At the very end of your success setup logic (but before returning), implement a `defer func() { ... }()` block to save the audit log using an already accessible service dependency: `saveErr := h.auditLogTradeSvc.SaveAuditLog(nil, auditLog, req)`

10. Return `httpserv.Response` with `StatusCode: http.StatusOK` containing the `result` mapping to `Data`.

  

### Step 4: Register Routing

**File:** `order-service/routes/route.go`

1. Locate the place where `groupCombined` is utilizing `tradingHandler` around line 1735.

2. Map the handler function to the GET endpoint: `groupCombined.GET("/order-crypto/withdraw/:order_request_id/detail", tradingHandler.GetTradingWithdrawCryptoDetail)`

  

### Step 5: Unit Tests

**File:** `order-service/handler/trading_handler_test.go`

1. Create test cases in `TestGetTradingWithdrawCryptoDetail` (utilizing the pre-existing setup of `mockAuditLogService` used by handler instantiated methods):

- `should_return_unauthorized_when_claims_not_portal_claims`

- `should_return_unauthorized_when_user_uuid_is_invalid`

- `should_return_unprocessable_entity_when_order_id_is_invalid`

- `should_return_internal_server_error_when_service_returns_error`

- `should_return_success_when_service_returns_result` (including payload checks on new Icon field).

  

## Verification

- Run `go test -v ./handler -run TestGetTradingWithdrawCryptoDetail`

- Assert that there are no compilation failures and all 5 scenarios pass.