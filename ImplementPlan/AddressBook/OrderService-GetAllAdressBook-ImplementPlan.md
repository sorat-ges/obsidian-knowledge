# Implementation Plan: Get All Address Books API


## Overview

Add a new API endpoint to Trading Handler that retrieves all address books for a customer, with optional filtering by asset (symbol). If asset is null/empty, return all address books for the authenticated customer.

  

## UI Requirements (Aligned with Frontend plan)

- **Asset Filter**: Dropdown to filter by cryptocurrency (default: "All")

- **Table Columns**: Asset, Network, Name, Address, MEMO

- **Actions**: None (Frontend is currently view-only; no edit, delete, or add actions needed).

- **Frontend BFF Mapping Note**: The frontend architecture uses a BFF (Backend-For-Frontend), so the API's snake_case response (`address_name`) will be transformed to camelCase (`name`) in the frontend's `transform` function.

  

## API Specification

  

### Endpoint

```

GET /api/v1/trading/address-book

```

  

### Query Parameters

| Parameter | Type | Required | Description |

|-----------|---------|----------|--------------------------------------|

| asset | string | No | Filter by asset symbol (e.g., "BTC") |

| page | int | No | Page number (default: 1) |

| per_page | int | No | Items per page (default: 20) |

  

### Response

```json

{

"code": "200",

"message": "success",

"data": {

"data": [

{

"id": "uuid",

"address_name": "My BTC address",

"asset": "BTC",

"network": "Bitcoin Network",

"network_id": "uuid",

"address": "6CGDA5...dssd",

"memo": null

}

],

"pagination": {

"page": 1,

"per_page": 20,

"total_items": 5,

"total_page": 1

}

}

}

```

  

## Implementation Steps

  

### Step 1: Repository Layer

**File**: `pkg/crypto/repository.go`

  

Add new method to `IDigitalAssetAddressBookRepository` interface:

```go

GetAddressBooksByIdentificationID(

identificationId uuid.UUID,

assetSymbol string,

) ([]domain.AddressBook, error)

```

  

**File**: `storages/postgres/ordercryptorepository/digital_asset_address_book_repository.go`

  

Implement the method:

```go

func (r *DigitalAssetAddressBookRepository) GetAddressBooksByIdentificationID(

identificationId uuid.UUID,

assetSymbol string,

) ([]domain.AddressBook, error) {

var addressBooks []domain.DigitalAssetAddressBookDB

query := r.db.Where("identification_id = ? AND is_deleted = false AND is_active = true", identificationId)

  

if assetSymbol != "" {

query = query.Where("product_asset_code = ?", assetSymbol)

}

  

err := query.Find(&addressBooks).Error

// ... rest of implementation

}

```

  

### Step 2: Service Layer

**File**: `pkg/crypto/service_input.go`

  

Add input struct:

```go

type GetAllAddressBooksInput struct {

IdentificationID uuid.UUID

AssetSymbol string

Page int

PerPage int

}

```

  

**File**: `pkg/crypto/service_output.go`

  

Add output struct (if pagination needed at service level):

```go

type GetAllAddressBooksOutput struct {

AddressBooks []AddressBookOutput

Total int64

Page int

TotalPage int64

}

```

  

**File**: `pkg/crypto/service.go`

  

Add method to `ICryptoOrderService` interface and implement in `CryptoOrderService`:

```go

func (s *CryptoOrderService) GetAllAddressBooks(

input GetAllAddressBooksInput,

) (GetAllAddressBooksOutput, error) {

// Calculate offset for pagination

offset := (input.Page - 1) * input.PerPage

  

// Get address books with filter

addressBooks, err := s.DigitalAssetAddressBookRepo.GetAddressBooksByIdentificationID(

input.IdentificationID,

input.AssetSymbol,

)

// ... handle pagination and transform to output

}

```

  

### Step 3: Handler Layer

**File**: `handler/trading_handler_dto.go` (create new file or add to existing)

  

Add request/response DTOs:

```go

// Request

type GetAllAddressBooksRequest struct {

Asset string `json:"asset"`

Page int `json:"page"`

PerPage int `json:"per_page"`

}

  

// Response

type AddressBookItemResponse struct {

ID string `json:"id"`

AddressName string `json:"address_name"`

Asset string `json:"asset"`

Network string `json:"network"`

NetworkID string `json:"network_id"`

Address string `json:"address"`

Memo *string `json:"memo"`

}

  

type GetAllAddressBooksResponse struct {

Data []AddressBookItemResponse `json:"data"`

Pagination PaginationResponse `json:"pagination"`

}

  

type PaginationResponse struct {

Page int `json:"page"`

PerPage int `json:"per_page"`

TotalItems int `json:"total_items"`

TotalPage int `json:"total_page"`

}

```

  

**File**: `handler/trading_handler.go`

  

Add the handler method (follow existing pattern from `GetTradingCustomerAccountList`):

```go

// @Security bearerAuth

// @Summary Get All Address Books

// @Description Get all address books for authenticated customer, optional filter by asset

// @ID GetAllAddressBooks

// @Tags Address Book

// @Produce json

// @Param asset query string false "Filter by asset symbol (e.g., BTC)"

// @Param page query int false "Page number (default: 1)"

// @Param per_page query int false "Items per page (default: 20)"

// @Success 200 {object} httpserv.Response{data=GetAllAddressBooksResponse} "OK"

// @Failure 400 {object} httpserv.Response "Bad Request"

// @Failure 401 {object} httpserv.Response "Unauthorized"

// @Failure 500 {object} httpserv.Response "Internal Server Error"

// @Router /api/v1/trading/address-book [get]

func (h *TradingHandler) GetAllAddressBooks(req *httpserv.Request) (*httpserv.Response, error) {

// Implementation following the trading_handler pattern

}

```

  

### Step 4: Mock Updates

**File**: `pkg/crypto/z_mock_idigital_asset_address_book_repository.go`

  

Add mock method for `GetAddressBooksByIdentificationID`

  

**File**: `pkg/crypto/z_mock_icrypto_order_service.go`

  

Add mock method for `GetAllAddressBooks`

  

### Step 5: Route Registration

**File**: `cmd/server/main.go` (or wherever routes are registered)

  

Add route:

```go

tradingRoutes.GET("/address-book", tradingHandler.GetAllAddressBooks)

```

  

## Security Considerations

- Authentication required via JWT token

- `identification_id` extracted from token claims (PortalClaims.UserUUID)

- Users can only access their own address books

- SQL injection prevented via parameterized queries

  

## Dependencies & References

- Existing: `GetAddressBooksByProductIDAndNetworkID` in `order_crypto.go`

- Existing: `GetAddressBookById` in repository

- Response DTO: `GetAddressBookResponse` in `order_crypto_dto.go`

- Pattern reference: `GetTradingCustomerAccountList` in `trading_handler.go`