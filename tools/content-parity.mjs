import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkContentParity } from "./lib/content-parity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const task3Mappings = [
  {
    source: "02-Business-Logic/Shared/Glossary.md",
    targets: ["shared-rules/glossary.md"],
  },
  {
    source: "02-Business-Logic/Shared/Error-Codes.md",
    targets: ["shared-rules/error-codes.md"],
  },
  {
    source: "02-Business-Logic/Shared/Permission-Rules.md",
    targets: ["shared-rules/permissions.md"],
  },
  {
    source: "02-Business-Logic/Shared/Security-Rules.md",
    targets: ["shared-rules/security.md"],
  },
  {
    source: "01-Architecture/Integrations/Profiles.md",
    targets: ["system-context/integrations.md"],
  },
  {
    source: "01-Architecture/Infrastructure/System-Constraints.md",
    targets: ["system-context/infrastructure/system-constraints.md"],
  },
  {
    source: "01-Architecture/Infrastructure/Kong/Ingress.md",
    targets: ["system-context/infrastructure/kong-ingress.md"],
  },
  {
    source: "01-Architecture/Infrastructure/Kong/Ratelimit.md",
    targets: ["system-context/infrastructure/kong-rate-limit.md"],
  },
  {
    source: "01-Architecture/Infrastructure/Kong/KongCommand.md",
    targets: ["system-context/infrastructure/kong-debugging.md"],
  },
  {
    source: "01-Architecture/Infrastructure/Move-Infrastructure.md",
    targets: ["system-context/infrastructure/migration.md"],
  },
];

const task4Mappings = [
  {
    source: "02-Business-Logic/Order-Service/Fee-Campaign-Rules.md",
    targets: ["shared-rules/trading-fees-and-campaigns.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/State-Rules.md",
    targets: ["shared-rules/order-state-machine.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/Ledger-Rules.md",
    targets: [
      "shared-rules/ledger-and-money-flow.md",
      "business-flows/trading/swap-market-order.md",
      "business-flows/trading/swap-limit-order.md",
    ],
  },
  {
    source: "02-Business-Logic/Order-Service/Swap-Rules.md",
    targets: [
      "business-flows/trading/swap-market-order.md",
      "business-flows/trading/swap-limit-order.md",
    ],
  },
  {
    source: "02-Business-Logic/Order-Service/Swap-Limit-Order-Flow.md",
    targets: ["business-flows/trading/swap-limit-order.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/BigLot-Rules.md",
    targets: ["business-flows/trading/big-lot.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/Routing-Rules.md",
    targets: [
      "business-flows/trading/routing.md",
      "business-flows/trading/swap-market-order.md",
      "business-flows/trading/swap-limit-order.md",
    ],
  },
  {
    source: "02-Business-Logic/Order-Service/Hedge-Rules.md",
    targets: [
      "business-flows/trading/hedging.md",
      "business-flows/trading/swap-market-order.md",
      "business-flows/trading/swap-limit-order.md",
    ],
  },
];

const task5Mappings = [
  {
    source: "02-Business-Logic/Order-Service/Withdraw-Rules.md",
    targets: ["business-flows/fund-movement/fiat-withdrawal.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/Fireblocks-Hook-Rules.md",
    targets: [
      "business-flows/fund-movement/crypto-deposit-and-withdrawal.md",
    ],
  },
  {
    source: "02-Business-Logic/Order-Service/Internal-Transfer-Rules.md",
    targets: ["business-flows/fund-movement/internal-transfer.md"],
  },
  {
    source: "02-Business-Logic/Asset-Consumer/Ledger-Processing-Rules.md",
    targets: ["business-flows/asset-management/ledger-processing.md"],
  },
  {
    source: "02-Business-Logic/Asset-Service/Asset-Rules.md",
    targets: ["business-flows/asset-management/portfolio-and-reporting.md"],
  },
  {
    source: "02-Business-Logic/Asset-Service/Report-Rules.md",
    targets: ["business-flows/asset-management/portfolio-and-reporting.md"],
  },
  {
    source: "02-Business-Logic/Asset-Consumer/XD-Sync-Rules.md",
    targets: ["business-flows/asset-management/xd-sync.md"],
  },
  {
    source: "02-Business-Logic/Asset-Consumer/Master-Data-Sync-Rules.md",
    targets: ["business-flows/asset-management/master-data-sync.md"],
  },
];

const task6Mappings = [
  {
    source: "02-Business-Logic/payment-gateway/Payment-End-to-End-Flow.md",
    targets: [
      "business-flows/payment/payment-request-and-transfer.md",
      "business-flows/payment/payment-inquiry-and-callback.md",
    ],
  },
  {
    source: "02-Business-Logic/payment-gateway/Payment-Request-Rules.md",
    targets: ["business-flows/payment/payment-request-and-transfer.md"],
  },
  {
    source: "02-Business-Logic/payment-gateway/SCB-Adaptor-Worker-Rules.md",
    targets: ["business-flows/payment/payment-request-and-transfer.md"],
  },
  {
    source:
      "02-Business-Logic/payment-gateway/Payment-Inquiry-Worker-Rules.md",
    targets: ["business-flows/payment/payment-inquiry-and-callback.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/Order-Offering-Rules.md",
    targets: ["business-flows/offering/subscription-and-eligibility.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/ICO-Subscription-Rules.md",
    targets: ["business-flows/offering/subscription-and-eligibility.md"],
  },
];

const task7Mappings = [
  {
    source: "05-Guides/Documentation-Guide.md",
    targets: ["developer-guides/maintaining-docs.md"],
  },
  {
    source: "05-Guides/Logging-and-Sonar-Best-Practices.md",
    targets: ["developer-guides/logging-and-quality.md"],
  },
  {
    source: "02-Business-Logic/Order-Service/AGENTS.md",
    targets: ["developer-guides/order-service-standards.md"],
  },
];

const diagnostics = await checkContentParity({
  root,
  docsDir: path.join(root, "src/content/docs"),
  publicDir: path.join(root, "public"),
  mappings: [
    ...task3Mappings,
    ...task4Mappings,
    ...task5Mappings,
    ...task6Mappings,
    ...task7Mappings,
  ],
});

if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    process.stderr.write(`${diagnostic.file}: ${diagnostic.message}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Content parity validation passed.\n");
}
