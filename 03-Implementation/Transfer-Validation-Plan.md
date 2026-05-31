---
title: Implementation Plan: Internal Transfer Source Account Validation
tags: [implementation]
status: active
last-updated: 2026-05-31
---

# Implementation Plan: Internal Transfer Source Account Validation

## 🎯 Objective
Add a validation step to `CreateInternalCustomerTransfer` to ensure that the `SourceCustomerAccountID` provided in the request matches the `CustomerAccountID` associated with the dealer (RM/Employee) identified in the authentication token.

## 🛠️ Proposed Changes

### 1. Handler Layer (`handler/white_glove_dealer_transfer_handler.go`)
- **Extract Claims**: Ensure `middleware.PortalClaims` are correctly extracted from the request.
- **Service Call Modification**: Pass `claims.Subject` (EmployeeID/EmployeeCode) to the service layer for validation.

### 2. Service Layer (`pkg/order_transfer/service.go`)
- **Interface Update**: Update `IOrderTransferService.InternalCustomerTransfer` to accept `EmployeeID`.
- **Validation Logic**:
  - Use `IDealerService.GetDealerAccounts(ctx, employeeId)` to retrieve the dealer records associated with the employee.
  - Extract the valid `DealerIdentityID` (or relevant customer account identifier) from the dealer records.
  - Verify if the `input.SourceCustomerAccountID` belongs to the list of accounts owned by the employee/dealer.
  - If no match is found, return a `403 Forbidden` or `422 Unprocessable Entity` error.

### 3. Repository Layer
- No changes required (utilize existing `DealerRepository`).

## 🔄 Logic Flow
1. **Request**: Dealer calls `POST /transfer/internal`.
2. **Auth**: Middleware validates token and populates `PortalClaims`.
3. **Handler**:
   - Extracts `EmployeeID` from `claims.Subject`.
   - Calls `InternalCustomerTransfer(ctx, employeeID, input)`.
4. **Service**:
   - Calls `DealerService.GetDealerAccounts(employeeID)`.
   - Checks if `input.SourceCustomerAccountID` exists in the retrieved dealer accounts.
   - If **Valid**: Proceeds with transfer.
   - If **Invalid**: Returns `ErrUnauthorizedSourceAccount`.

## 🧪 Testing Strategy
- **Unit Test**: Add test cases to `pkg/order_transfer/service_test.go` to mock `DealerService` and verify:
  - Success when source account matches dealer account.
  - Failure when source account does not match.
- **Integration Test**: Verify the end-to-end flow with a mock token.

## ⚠️ Considerations
- **Multiple Accounts**: An employee might have multiple dealer accounts; the validation should check if the source ID exists in the list.
- **Error Messages**: Ensure the error message is clear but secure (avoid leaking internal IDs).
