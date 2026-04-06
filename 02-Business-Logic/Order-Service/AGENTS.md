# AI Agent Rules — order-service

> **MANDATORY**: Read this entire document before writing any code, modifying files, or suggesting changes.

---

## 1. Project Context

| Item | Value |
|------|-------|
| **Language** | Go 1.23 |
| **Module** | `git.xspringas.com/xas/transaction/order/order-service` |
| **Framework** | Gin (via `httputil/httpserv`) |
| **ORM** | GORM (PostgreSQL) |
| **Cache** | Redis (`go-redis/v9`) |
| **Testing** | `testify` + `go-sqlmock` |
| **Linter** | `golangci-lint` (see `.golangci.yml`) |

---

## 2. Architecture Overview

```
handler/          → HTTP handlers (DTOs, request/response mapping, auth claims)
pkg/              → Domain packages (service + repository interfaces & implementations)
internal/
  constants/      → Typed constants & enums (never use raw strings for domain values)
  domain/         → Redis / cache data models
  entities/       → Database entity structs (GORM models)
  config/         → App configuration structs
routes/           → Route registration
storages/         → Repository implementations (DB, Redis)
utils/            → Shared utility helpers
third_party/      → External SDK wrappers
```

### Layering Rules
- **Handlers** must never contain business logic — delegate everything to a service.
- **Services** must never import handler types.
- **Repositories** must only interact with the database/cache — no business rules.
- Always depend on **interfaces**, never on concrete structs across layer boundaries.

---

## 3. Code Style & Naming Conventions

### General
- Follow standard Go conventions: `gofmt`, `goimports`.
- Use **camelCase** for local variables, **PascalCase** for exported names.
- Use `ID` (not `Id`) for exported fields (e.g., `OrderID`, `CustomerID`).
  - **Exception**: JSON tags use `_id` suffix (e.g., `json:"order_id"`).
- Constants go in `internal/constants/` grouped by domain. Never use naked string literals for status, enum, or action values.
- Use `errors.New(...)` for sentinel errors — defined as package-level `var` at the **top** of the file.

### Interfaces
- Name interfaces with an `I` prefix: `IOrderService`, `IQRTransactionRepository`.
- Define interfaces **where they are consumed**, not where the implementation lives.
- Each interface should be minimal (Interface Segregation Principle).

### Structs
- Service struct names match the interface without the `I` prefix: `QRWithdrawTransactionService`.
- Constructor functions are named `New<TypeName>` and return the interface type, not the concrete struct.

### Error Messages
- Use `fmt.Errorf("context description: %w", err)` for error wrapping.
- Use shared `const` format strings for repeated error message templates, e.g.:
  ```go
  const errGetQRTransactionFmt = "failed to get QR transaction: %w"
  ```
- Sentinel errors are exported `var` values at the top of each service file.

---

## 4. Handler Conventions

Every handler function must follow this pattern:

```go
func (handler *SomeHandler) MethodName(req *httpserv.Request) (*httpserv.Response, error) {
    ctx := req.Request.Context()

    // 1. Extract & validate auth claims
    claims, ok := req.Claims.(middleware.PortalClaims)
    if !ok { /* return 401 */ }

    // 2. Parse path/query params
    // 3. Log incoming request with logs.InfoWithContext
    // 4. Call service
    // 5. Handle errors with logs.ErrorWithContext → return appropriate HTTP status
    // 6. Log success response with logs.InfoWithContext
    // 7. Return httpserv.Response
}
```

### HTTP Status Codes
| Situation | Code |
|-----------|------|
| Auth failure | 401 |
| Bad input / parse error | 400 |
| Resource not found | 404 |
| Unprocessable entity | 422 |
| Internal error | 500 |
| Success | 200 |

### Logging
- Always pass `ctx` to log calls: `logs.InfoWithContext(ctx, "message", fields)`.
- Use `map[string]interface{}{logs.DataLog: ...}` for data fields.
- Use `map[string]interface{}{logs.ErrorLog: err}` for error fields.
- Log **before** calling the service (request) and **after** returning (response).

### Swagger Annotations
Every public handler must have Swagger godoc comments with:
- `@Summary`, `@Description`, `@ID`, `@Tags`
- `@Param`, `@Success`, `@Failure` (400, 401, 404, 500)
- `@Router` with full path and HTTP method
- `@Security bearerAuth` for authenticated endpoints

---

## 5. Service Conventions

- Functions must be **small and focused** — extract helpers for distinct validation or computation steps.
- Group related validation steps into private methods: `validateXxx(...)`.
- Use **early returns** to reduce nesting.
- Avoid `else` after a `return` or `continue`.
- When mapping action → status (or similar), use a `map` literal instead of a `switch` with assignments.

### Example: state machine pattern in services
```go
validTransitions := map[CurrentStatus][]NextStatus{
    StatusA: {StatusB, StatusC},
}
// then validate and apply
```

---

## 6. Testing Conventions

- Test files live alongside source: `service_test.go` next to `service.go`.
- Use **table-driven tests** with `testify/suite` wherever a service has complex branching.
- Mock all external dependencies via interfaces — use generated mocks from `mockery`.
- Test names follow `TestSuite_MethodName_ScenarioDescription`.
- Cover **all error paths** and **all happy paths**.
- Never skip or comment out test cases — fix the source instead.
- String literals repeated more than once in tests must be **extracted as constants**.
- Use `assert` for non-fatal checks, `require` for fatal checks (stops the test immediately on failure).

---

## 7. Package & File Organization

- Each `pkg/` sub-package represents a bounded domain. Files inside follow this pattern:
  ```
  service.go         → interface + service struct + constructor + methods
  repository.go      → repository interface + struct + constructor + methods
  dto.go             → request/response structs for the service layer
  error.go           → (optional) domain-specific sentinel errors
  *_test.go          → unit tests
  ```
- Keep each file focused on one responsibility — do not mix repo and service code.
- Handler-layer DTOs (request/response for HTTP) live in `handler/`: `*_request.go`, `*_response.go`, `*_dto.go`.

---

## 8. Linting Rules (`.golangci.yml`)

The following linters are enforced — all code must pass before merging:

| Linter | What it checks |
|--------|----------------|
| `errcheck` | All errors must be handled (no `_` for errors in production code) |
| `govet` | Correct use of `printf`-style verbs and struct tags |
| `ineffassign` | Assignments that are never read |
| `staticcheck` | Static analysis, deprecated APIs |
| `unused` | Unexported unused code |
| `gocritic` | Code style improvements |
| `gosec` | Security issues |
| `misspell` | English spelling in comments/strings |

**Run before every commit:**
```bash
golangci-lint run ./...
```

---

## 9. Dependency & Import Rules

- All imports must be grouped:
  1. Standard library
  2. External packages (third-party)
  3. Internal packages (this module)
- Use aliased imports only when there is a naming conflict — prefer clear, distinctive names.
- Never import a package only for its side effects unless explicitly required (e.g., `_ "..."` drivers).

---

## 10. Do / Don't Checklist

### ✅ DO
- Read existing patterns in the relevant package before writing new code.
- Use `context.Context` as the first parameter in service/repository methods that perform I/O.
- Propagate errors with `%w` so callers can use `errors.Is` / `errors.As`.
- Use `uuid.FromStringOrNil` then check `== uuid.Nil` for optional UUIDs; use `uuid.FromString` when missing UUID is a hard error.
- Add new constants to the appropriate file in `internal/constants/` or `internal/constants/enum/`.
- Run `go test ./...` and `golangci-lint run ./...` after changes.
- Keep cognitive complexity low — prefer extracting small private helper functions.

### ❌ DON'T
- Don't put business logic inside handlers.
- Don't use raw string literals for status/enum/action values — always reference a constant.
- Don't use `fmt.Sprintf` for error messages where `errors.New` or `fmt.Errorf` suffice.
- Don't ignore returned errors (`_ = someFunc()`).
- Don't use `panic` in production code paths.
- Don't add unnecessary comments — code should be self-documenting; only comment on *why*, not *what*.
- Don't duplicate code — extract if used more than once.
- Don't use `interface{}` when a concrete type or a typed interface is available. Prefer `any` for truly generic cases.
- Don't skip writing unit tests for new service methods.
