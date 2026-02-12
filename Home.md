---
title: Developer Knowledge Base
tags: [index]
status: active
---

# 🏠 Developer Knowledge Base

Welcome to the knowledge base. Quick navigation to main sections:

## 📚 Main Sections

### Architecture & Design
- [[Biglot/Biglot|Big Lot Flow]] - High-volume transaction architecture

### Trade & Finance
- [[Trade/SwapRoute|Swap Routes]] - Route inquiry and net amount calculation
- [[Trade/SwapFee|Swap Fee]] - OrderFee calculation (GetSwapRoutes & Webhook flows)
- [[Trade/BestRoute|Best Route]] - Best route selection logic
- [[Trade/Fee-IO|Fee I/O]] - `GetPossibleFeeRate` input/output reference
- [[Trade/Fee-Campaign-System|Fee Campaign System]] - Campaign-based fee management
- [[Trade/Campaign|Campaign API]] - Campaign CRUD and condition system
- [[Trade/Management-Fee-Spread|Management Fee & Spread]] - FX spread calculation

### Infrastructure
- **Kubernetes**
  - [[Kube/Kong/Ratelimit|Kong Rate Limiting]]
  - [[Kube/Kong/Ingress|Kong Ingress]]
  - [[Kube/Kong/KongCommand|Kong Debug Commands]]

### Development
- [[Flutter/Deployment|Flutter App Deployment]]

### Implementation Plans
- [[ImplementPlan/ImplementFeePlan-ManageFee|Fee Refactor Plan]] - `getPossibleFeeRate` refactoring
- [[ImplementPlan/swap-hide-route-selection|Swap Route Selection Fix]] - Hide route selection & refresh button fix

## 🔍 Browse by Topic

### By Tag
- `#api` - API documentation
- `#architecture` - System design and flows
- `#guide` - Step-by-step tutorials
- `#config` - Configuration references
- `#kubernetes` - K8s related docs
- `#trading` - Swap, fee, and route logic
- `#finance` - Fee and spread calculations

### By Status
- `status: active` - Current and maintained
- `status: draft` - Work in progress
- `status: outdated` - Needs review

## 📝 Templates
Start new documentation using these templates:
- [[.obsidian/templates/api-template|API Documentation Template]]
- [[.obsidian/templates/guide-template|Guide/Tutorial Template]]
- [[.obsidian/templates/architecture-template|Architecture Template]]
- [[.obsidian/templates/config-template|Configuration Template]]

## 📖 Documentation Guidelines
See [[Documentation-Guide|Documentation Guide]] for best practices.

---
Last updated: 2026-02-12
