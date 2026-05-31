# Merge Transfer Create API

## Goal

Create one transfer request shape that can support both dealer transfer and internal customer transfer by checking the source and destination wallet types.

## Proposed Request

```json
{
  "source_customer_account_id": "uuid",
  "source_wallet_type": "customer_main",
  "destination_customer_account_id": "uuid",
  "destination_wallet_type": "customer_main",
  "quantity": "1011.00",
  "cost": "string",
  "product_id": "d933d49c-3e9d-41b1-8d86-3ed9064834ec",
  "transfer_type": "transfer_out"
}
```

## Routing Rules

- `customer_main -> customer_main`: use `InternalCustomerTransfer`.
- `customer_main -> dealer_main`: use dealer transfer out.
- `dealer_main -> customer_main`: use dealer transfer in.
- Any other wallet pair should return invalid request.

## Internal Customer Transfer

When wallet type is `customer_main -> customer_main`:

- Derive `identification_id` from `source_customer_account_id`.
- Validate `destination_customer_account_id` belongs to the same `identification_id`.
- Map `cost` to existing `Price`.
- Accept `transfer_type` for compatibility, but it should not change internal transfer behavior.

## Dealer Transfer

When wallet type is `customer_main -> dealer_main` or `dealer_main -> customer_main`:

- Use the existing dealer transfer flow.
- Keep DealerX behavior unchanged.
- Keep current wallet pair validation.
- Dealer information should still come from employee/ref context.

## Validation

- `source_customer_account_id` must be a valid UUID.
- `destination_customer_account_id` must be a valid UUID when destination is `customer_main`.
- `product_id` must be a valid UUID.
- `quantity` must be a positive decimal.
- `cost` is optional except when the source account is configured to skip balance validation.
- Unsupported wallet pairs must be rejected.

## Test Cases

- `customer_main -> customer_main` creates internal customer transfer.
- Internal transfer rejects destination account from another customer identification.
- Internal transfer maps `cost` to `Price`.
- Internal transfer works without `cost` for normal accounts.
- Internal transfer requires `cost` for skip-balance-validation accounts.
- `customer_main -> dealer_main` creates dealer transfer out.
- `dealer_main -> customer_main` creates dealer transfer in.
- Invalid wallet pair returns invalid request.

## Assumptions

- `identification_id` is not required in the request body.
- `identification_id` is derived from the source customer account.
- `cost` means the same thing as existing internal transfer `Price`.
- Existing dealer/internal service behavior should stay unchanged behind the new request shape.
