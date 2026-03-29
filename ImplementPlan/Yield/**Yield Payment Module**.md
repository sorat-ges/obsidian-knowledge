  

XSpring Platform


Technical Specification Document

Version 1.0  |  March 2026

Includes: PRD, Database Schema, API Specification, UI Screen Flows, User Stories

  

Table of Contents

  

1. Overview

This document specifies the Yield Payment module for the XSpring digital token investment platform. The module enables Token Lifecycle Managers (TLM) to configure, calculate, and distribute yield payments to token holders across multiple ICO projects.

1.1 Objectives

- Create menu and screens for Yield Payment Setup and Yield Payment Plan management
- Allow editing and deactivation (inactive) of Yield Payment and Yield Payment Plan
- Generate yield payment detail reports per template (3 investor categories + summary)
- Support both Daily Yield (pro-rata by day count) and One-Time Yield per period
- Automate tax withholding calculation by investor category (Retail 15%, Institution 1%, Foreign varies)

1.2 Scope

The module covers four primary workflows:

|   |   |   |
|---|---|---|
|**Flow**|**Description**|**Role**|
|Create Yield Payment Setup|Setup yield conditions, upload payment plan for each ICO project|TLM|
|Edit Yield Payment Setup|Modify existing yield conditions and payment plan|TLM|
|Inactive Yield Payment Setup|Deactivate yield conditions for a project|TLM|
|Submit Yield Payment|Generate payment details with tax calculation and produce report|TLM|

  

1.3 Key Business Rules

- Only 1 active yield payment setup per ICO project at a time
- Only projects with status = Active can be selected for setup
- Once inactive, must create new setup to re-activate (cannot revert)
- Yield Payment Plan is uploaded via Excel template (download template, fill in, upload back)
- Tax calculation differs by investor category: Retail (15%), Institution (1%), Foreign (as configured)
- Rounding rules are configurable per project: Round/Round Down/No Rounding with decimal precision
- Report output splits into 3 sheets by investor type + 1 summary report sheet

2. Database Schema

The following entity-relationship design supports the yield payment lifecycle. All tables use UUID primary keys and include standard audit columns (created_at, updated_at, created_by, updated_by).

2.1 yield_payment_setup

Master configuration per ICO project defining yield calculation parameters.

|   |   |   |   |
|---|---|---|---|
|**Column**|**Type**|**Nullable**|**Description**|
|id|UUID|NO|Primary key|
|project_id|UUID (FK)|NO|References ico_project.id|
|project_name|VARCHAR(255)|NO|Denormalized project name|
|special_yield|TEXT|YES|Special yield description|
|short_description|TEXT|YES|Short description for display|
|yield_type|ENUM|NO|DAILY_YIELD, ONE_TIME_YIELD|
|face_value_per_unit|DECIMAL(18,6)|NO|Token face value (THB)|
|yield_pct_pa|DECIMAL(8,6)|YES|Annual yield percentage (for daily yield)|
|day_per_year|INT|YES|Days per year for calculation (default 365)|
|return_rounding_mode|ENUM|NO|ROUND, ROUND_DOWN, NONE|
|return_rounding_decimals|INT|YES|Decimal places for return rounding|
|total_return_rounding_mode|ENUM|NO|ROUND, ROUND_DOWN, NONE|
|total_return_rounding_decimals|INT|YES|Decimal places for total return|
|tax_rounding_mode|ENUM|NO|ROUND, ROUND_DOWN, NONE|
|tax_rounding_decimals|INT|YES|Decimal places for tax amount|
|net_payoff_rounding_mode|ENUM|NO|ROUND, ROUND_DOWN, NONE|
|net_payoff_rounding_decimals|INT|YES|Decimal places for net payoff|
|retail_tax_pct|DECIMAL(5,4)|NO|Tax rate for retail investors (default 0.15)|
|institution_tax_pct|DECIMAL(5,4)|NO|Tax rate for institutional investors (default 0.01)|
|foreign_tax_pct|DECIMAL(5,4)|NO|Tax rate for foreign investors|
|status|ENUM|NO|ACTIVE, INACTIVE|
|created_at|TIMESTAMP|NO|Record creation time|
|updated_at|TIMESTAMP|NO|Last update time|
|created_by|UUID|NO|Created by user ID|
|updated_by|UUID|YES|Updated by user ID|

  

_Constraints: UNIQUE(project_id) WHERE status = ACTIVE (only 1 active setup per project)._

2.2 yield_payment_plan

Individual payment schedule entries (periods/installments) uploaded via Excel template.

|   |   |   |   |
|---|---|---|---|
|**Column**|**Type**|**Nullable**|**Description**|
|id|UUID|NO|Primary key|
|setup_id|UUID (FK)|NO|References yield_payment_setup.id|
|period_label|VARCHAR(50)|NO|Period label e.g. '1/2569'|
|calculation_date_range|VARCHAR(100)|NO|Date range text e.g. '2 ธ.ค.68 - 31 มี.ค. 69'|
|start_date|DATE|NO|Calculation period start|
|end_date|DATE|NO|Calculation period end|
|day_count|INT|NO|Number of days in period|
|yield_per_token|DECIMAL(18,6)|NO|Return amount per token (5+ decimals)|
|announcement_date|DATE|YES|Date to announce the payment round|
|cutoff_date|DATE|NO|Record date for determining token holders|
|payment_date|DATE|NO|Actual payment disbursement date|
|total_yield_amount|DECIMAL(18,2)|YES|Total yield for all holders in this period|
|principal_repayment_per_unit|DECIMAL(18,6)|YES|Principal repayment per token (last period)|
|status|ENUM|NO|PENDING, PROCESSING, COMPLETED, CANCELLED|
|created_at|TIMESTAMP|NO|Record creation time|
|updated_at|TIMESTAMP|NO|Last update time|

  

2.3 yield_payment_transaction

Per-investor payment record generated when yield payment is submitted.

|   |   |   |   |
|---|---|---|---|
|**Column**|**Type**|**Nullable**|**Description**|
|id|UUID|NO|Primary key|
|plan_id|UUID (FK)|NO|References yield_payment_plan.id|
|setup_id|UUID (FK)|NO|References yield_payment_setup.id|
|investor_id|UUID (FK)|NO|References investor.id|
|investor_category|ENUM|NO|RETAIL, INSTITUTION, FOREIGN|
|holding_units|DECIMAL(18,6)|NO|Token holdings at cutoff date|
|holding_thb|DECIMAL(18,2)|NO|Holdings in THB (units x face value)|
|gross_return|DECIMAL(18,6)|NO|Total return before rounding|
|rounded_gross_return|DECIMAL(18,2)|NO|Total return after rounding|
|tax_percentage|DECIMAL(5,4)|NO|Applied tax rate|
|tax_amount|DECIMAL(18,6)|NO|Tax amount before rounding|
|rounded_tax_amount|DECIMAL(18,2)|NO|Tax amount after rounding|
|net_payoff|DECIMAL(18,2)|NO|Net payment after tax|
|principal_repayment|DECIMAL(18,2)|YES|Principal repayment if applicable|
|total_payment|DECIMAL(18,2)|NO|Net payoff + principal repayment|
|payment_status|ENUM|NO|PENDING, PAID, FAILED|
|payment_date|DATE|NO|Actual payment date|
|cutoff_date|DATE|NO|Cut-off date used|
|created_at|TIMESTAMP|NO|Record creation time|

  

2.4 yield_payment_tax_config

Master table for tax rates by investor category and asset type.

|   |   |   |   |
|---|---|---|---|
|**Column**|**Type**|**Nullable**|**Description**|
|id|UUID|NO|Primary key|
|asset_type|VARCHAR(50)|NO|Asset type classification|
|investor_category|ENUM|NO|RETAIL, INSTITUTION, FOREIGN|
|tax_percentage|DECIMAL(5,4)|NO|Withholding tax rate|
|effective_from|DATE|NO|Effective start date|
|effective_to|DATE|YES|Effective end date (null = current)|
|status|ENUM|NO|ACTIVE, INACTIVE|

3. Yield Calculation Logic

This section defines the exact formulas used for yield computation, matching the Yield_Payment_Calculation.xlsx reference.

3.1 Per Unit Calculation (Daily Yield)

Formula: Return Per Unit = Face Value x (Yield% p.a.) x (Day Count / Days Per Year)

Example: 10 x 0.06 x (120/365) = 0.19726 THB per token

  

|   |   |   |
|---|---|---|
|**Parameter**|**SiriHub2 Example**|**Park Court Example**|
|Face Value Per Unit|10 THB|1,000 THB|
|Yield (% p.a.)|6.00%|6.50%|
|Day Count|120 days|90 days|
|Days Per Year|365|365|
|Return Per Unit|0.19726|16.027397|

  

3.2 Per Investor Calculation

Total Return = Rounded Return Per Unit x Holding Units

Rounding rules are applied at two levels:

- Level 1 (Per Unit): Round Down to N decimals OR No Rounding
- Level 2 (Total Return): Round to N decimals OR No Rounding

3.3 Tax Calculation

|   |   |   |
|---|---|---|
|**Investor Category**|**Tax Rate**|**Rounding**|
|Retail (บุคคลธรรมดา)|15%|Round to 2 decimals|
|Institution (นิติบุคคล)|1%|Round to 2 decimals|
|Foreign (ต่างชาติ)|Configurable|Round to 2 decimals|

  

Tax Amount = Total Return x Tax Percentage

Net Payoff = Total Return - Tax Amount

Note: If payment is outside scheduled period (off-cycle), Daily Yield tax = 0.

3.4 Principal Repayment (Final Period)

For the last installment, principal repayment is added:

Total Payment = Net Payoff + (Principal Repayment Per Unit x Holding Units)

The system requires the last period entry to include repayment_per_unit. Prior periods should have this value set to 0.

3.5 Rounding Configuration Matrix

|   |   |   |   |
|---|---|---|---|
|**Calculation Step**|**Rounding Options**|**Decimal Config**|**Applied To**|
|Return Per Unit|Round Down / None|0-6 decimals|Per token yield|
|Total Return|Round / None|0-6 decimals|Per investor total|
|Tax Amount|Round / None|0-2 decimals|Per investor tax|
|Net Payoff|Round Down / None|0-2 decimals|Final net payment|

4. API Specification

All APIs are REST-based under the /api/v1/yield-payment path prefix. Authentication via Bearer token (JWT). Role required: TLM (Token Lifecycle Manager).

4.1 Yield Payment Setup APIs

GET /api/v1/yield-payment/setup

List all yield payment setups with pagination and filtering.

|   |   |   |   |
|---|---|---|---|
|**Parameter**|**Type**|**Required**|**Description**|
|page|int|No|Page number (default 1)|
|limit|int|No|Items per page (default 20)|
|project_name|string|No|Filter by project name (partial match)|
|status|string|No|Filter by ACTIVE/INACTIVE|

  

Response 200:

{ "data": [{ "id", "project_name", "yield_type", "yield_pct_pa", "total_periods", "status", "created_at" }], "pagination": { "page", "limit", "total" } }

  

GET /api/v1/yield-payment/setup/{id}

Get full detail of a yield payment setup including all plan periods.

Response 200: Full setup object with nested yield_payment_plans array.

  

POST /api/v1/yield-payment/setup

Create new yield payment setup for a project.

|   |   |   |   |
|---|---|---|---|
|**Field**|**Type**|**Required**|**Description**|
|project_id|UUID|Yes|ICO project ID (must be Active, no existing active setup)|
|special_yield|string|No|Special yield description|
|short_description|string|No|Short description|
|yield_type|string|Yes|DAILY_YIELD or ONE_TIME_YIELD|
|face_value_per_unit|decimal|Yes|Token face value|
|yield_pct_pa|decimal|Conditional|Required if DAILY_YIELD|
|day_per_year|int|No|Default 365|
|return_rounding_mode|string|Yes|ROUND / ROUND_DOWN / NONE|
|return_rounding_decimals|int|Conditional|Required if rounding mode is not NONE|
|retail_tax_pct|decimal|Yes|Retail investor tax rate|
|institution_tax_pct|decimal|Yes|Institution tax rate|
|foreign_tax_pct|decimal|Yes|Foreign investor tax rate|
|...rounding configs|...|Yes|Tax, total return, net payoff rounding configs|

  

Response 201: Created setup object with generated ID.

Response 409: Active setup already exists for this project.

  

PUT /api/v1/yield-payment/setup/{id}

Update existing yield payment setup. Only ACTIVE setups can be edited. Cannot change project_id.

Request body: Same as POST (except project_id).

Response 200: Updated setup object.

  

PATCH /api/v1/yield-payment/setup/{id}/status

Toggle Active/Inactive status. Setting to INACTIVE cancels all PENDING payment plans.

Request: { "status": "INACTIVE" }

Response 200: Updated setup with new status.

Note: Once INACTIVE, cannot revert. Must create new setup to re-activate.

  

4.2 Yield Payment Plan APIs

POST /api/v1/yield-payment/setup/{setupId}/plan/upload

Upload yield payment plan via Excel file (multipart/form-data).

|   |   |   |   |
|---|---|---|---|
|**Field**|**Type**|**Required**|**Description**|
|file|File (.xlsx)|Yes|Excel file following the payment plan template|

  

The system validates the Excel structure and parses all period entries. Returns preview data before confirmation.

Response 200: { preview: [array of parsed plan entries] }

Response 400: Validation errors (missing columns, invalid dates, etc.)

  

POST /api/v1/yield-payment/setup/{setupId}/plan/confirm

Confirm and save the uploaded payment plan after preview.

Request: { "upload_session_id": "..." }

Response 201: Array of created plan entries.

  

GET /api/v1/yield-payment/setup/{setupId}/plan

List all payment plan periods for a setup.

Response 200: Array of plan entries with status.

  

GET /api/v1/yield-payment/plan/template

Download the Excel template for yield payment plan upload.

Response 200: Binary .xlsx file download.

  

4.3 Yield Payment Execution APIs

POST /api/v1/yield-payment/generate

Generate yield payment transactions for a specific plan period.

|   |   |   |   |
|---|---|---|---|
|**Field**|**Type**|**Required**|**Description**|
|plan_id|UUID|Yes|Payment plan period ID|
|payment_date|date|Yes|Scheduled payment date|
|cutoff_date|date|Yes|Cut-off date for holder snapshot|

  

Process: Snapshot holder positions at cutoff_date, calculate yield per investor, apply tax by category, apply rounding, generate transaction records.

Response 200: { summary: { total_investors, total_tokens, total_gross, total_tax, total_net }, transactions: [...] }

  

POST /api/v1/yield-payment/confirm

Confirm and finalize yield payment after review.

Request: { "plan_id": "...", "generate_session_id": "..." }

Response 200: Confirmed payment with download URL.

  

GET /api/v1/yield-payment/report/{planId}

Download the yield payment detail report (.xlsx) for a completed payment period.

Response 200: Excel file with 4 sheets (บุคคลธรรมดา, ต่างชาติ, นิติบุคคล, Report).

5. Report Template Specification

The yield payment report is an Excel file with 4 sheets, generated from Template_จ่ายผลตอบแทน.xlsx.

5.1 Sheet: บุคคลธรรมดา (Retail Investors)

Columns: No., ID Card No., DOB, Name TH, Name EN, Email, Mobile, ID Card Address, Current Address, Bank Name, Bank Code, Branch Code, Bank Ac., Token Name, Holding Units, Holding THB, Yield Per Token, Gross Return (6 decimals), Net Return (2 decimals), Tax Amount, Net Payment, Tax Amount Text (Thai), Cut-off Date, Payout Date

5.2 Sheet: ต่างชาติ (Foreign Investors)

Columns: Similar to Retail but uses Passport No. instead of ID Card No., single Name field instead of TH/EN split.

5.3 Sheet: นิติบุคคล (Institutional Investors)

Columns: Similar to Retail but uses Corporate Registration No., Registration Date instead of DOB.

5.4 Sheet: Report (Summary)

Summary table showing:

|   |   |   |   |   |   |
|---|---|---|---|---|---|
|**Row**|**Investor Count**|**Token Count**|**Total Paid**|**Tax Withheld**|**Net Paid**|
|บุคคลธรรมดา|COUNT|SUM|SUM|SUM|SUM|
|ต่างชาติ|COUNT|SUM|SUM|SUM|SUM|
|นิติบุคคล|COUNT|SUM|SUM|SUM|SUM|
|รวม (Total)|TOTAL|TOTAL|TOTAL|TOTAL|TOTAL|

  

Header shows: Yield rate per token, token name. Column: ผลตอบแทน 0.19726 ต่อ Token

6. Screen Flow & UI Specification

6.1 Yield Payment Setup List

Path: PRODUCT ADMIN > Yield Payment Setup

Role: TLM

- Search/filter bar: Project name, Status (Active/Inactive)
- Data table columns: Project Name, Yield Type, Last Setup Date, Total Periods, Yield Per Token, Status, Actions (Edit / Active|Inactive toggle)
- Button: '+ Add New' to create new setup
- Status toggle: Click Active/Inactive button to toggle with confirmation dialog

6.2 Create/Edit Yield Payment Setup

Step-by-step form flow:

- Project Information: Select project (dropdown, only Active projects without existing active setup), auto-fill project details
- Yield Configuration: Set special yield, short description, yield type, face value, yield %, rounding rules
- Upload Yield Payment Plan: Download template button, upload filled Excel, system validates and shows preview table
- Preview & Confirm: Review all payment plan periods in table, buttons: Back / Save / Submit

  

Preview table columns: Period Label, Calculation Date Range, Day Count, Yield Per Token, Announcement Date, Cut-off Date, Payment Date, Total Yield Amount

6.3 Submit Yield Payment

Path: Yield Payment (separate menu)

- Project Information: Select project, auto-show payment type and next payment period
- Payment Configuration: Set Payment Date, Cut-off Date, select period
- Generate: Click Generate button, system calculates all investor returns with tax
- Summary: Shows success indicator + summary table (investor count, token count, gross, tax, net per category)
- Download: Button to download the report Excel file

6.4 Inactive Flow

- From setup list, click Active/Inactive toggle
- Confirmation dialog appears
- On confirm: status changes to Inactive, all PENDING plans are cancelled
- Note: If project needs active setup again, user must re-do setup from scratch

7. User Stories & Task Breakdown

7.1 Epic: Yield Payment Setup

US-1: Create Yield Payment Setup

_As a TLM, I want to create a yield payment setup for an ICO project so that yield distribution conditions are configured for token holders._

  

**Acceptance Criteria:**

- Can select only Active projects without existing active yield setup
- Can configure yield type (Daily/One-Time), face value, yield rate, rounding rules
- Can upload yield payment plan via Excel template
- System validates uploaded Excel (column structure, date formats, required fields)
- Preview table shows parsed payment plan before confirmation
- On submit, setup status = ACTIVE

**Estimate: 8 story points**

  

US-2: Edit Yield Payment Setup

_As a TLM, I want to edit an existing yield payment setup so that I can update conditions or re-upload the payment plan._

  

**Acceptance Criteria:**

- Can edit all fields except project selection
- Can replace yield payment plan with new Excel upload
- Only ACTIVE setups are editable
- Completed (PAID) plan periods cannot be modified

**Estimate: 5 story points**

  

US-3: Inactive Yield Payment Setup

_As a TLM, I want to deactivate a yield payment setup so that no further payments are processed for the project._

  

**Acceptance Criteria:**

- Toggle button on list page changes status to INACTIVE
- Confirmation dialog warns that action is irreversible
- All PENDING payment plans are auto-cancelled
- To re-activate, a new setup must be created

**Estimate: 3 story points**

7.2 Epic: Yield Payment Execution

US-4: Submit Yield Payment

_As a TLM, I want to generate and submit a yield payment for a specific period so that all eligible token holders receive their yield distribution._

  

**Acceptance Criteria:**

- Select project and payment period
- System snapshots holder positions at cut-off date
- Yield calculated per investor based on setup configuration
- Tax withheld based on investor category
- Summary shows breakdown: investor count, tokens, gross, tax, net per category
- Confirmation triggers payment processing

**Estimate: 13 story points**

  

US-5: Generate Yield Payment Report

_As a TLM, I want to download a detailed yield payment report so that I have a record of all payments made to each investor._

  

**Acceptance Criteria:**

- Report generated as .xlsx with 4 sheets per template
- Sheet 1: บุคคลธรรมดา - all retail investor payment details
- Sheet 2: ต่างชาติ - all foreign investor payment details
- Sheet 3: นิติบุคคล - all institutional investor payment details
- Sheet 4: Report - summary by investor type
- Tax Amount Text column shows amount in Thai words
- Downloadable from Submit Yield Payment result screen

**Estimate: 8 story points**

7.3 Epic: Infrastructure

US-6: Upload/Download Template

_As a TLM, I want to download a blank payment plan template and upload a filled version so that I can bulk-configure payment periods._

**Estimate: 3 story points**

  

US-7: Tax Configuration Master

_As a system admin, I want to maintain tax rate configurations by investor category and asset type so that yield payments apply correct withholding rates._

**Estimate: 5 story points**

7.4 Task Breakdown Summary

|   |   |   |   |
|---|---|---|---|
|**Task**|**Type**|**Estimate (SP)**|**Dependencies**|
|DB migration: yield_payment tables|Backend|3|None|
|API: CRUD Yield Payment Setup|Backend|5|DB migration|
|API: Upload/validate payment plan Excel|Backend|5|Setup API|
|API: Generate yield payment transactions|Backend|8|Plan API + Investor snapshot|
|API: Download payment report (.xlsx)|Backend|5|Transaction API|
|API: Tax config CRUD|Backend|3|DB migration|
|UI: Yield Payment Setup list page|Frontend|3|Setup API|
|UI: Create/Edit Setup form + upload flow|Frontend|8|Setup + Plan APIs|
|UI: Inactive toggle + confirmation|Frontend|2|Status API|
|UI: Submit Yield Payment + summary|Frontend|5|Generate API|
|UI: Report download integration|Frontend|2|Report API|
|E2E testing + UAT|QA|5|All above|
|TOTAL||54 SP||

  

8. Appendix

8.1 Yield Payment Plan Template Columns

The Excel template that TLM downloads and fills in must contain these columns:

|   |   |   |   |
|---|---|---|---|
|**Column**|**Type**|**Required**|**Example**|
|งวดการจ่าย (Period)|Text|Yes|1/2569|
|วันที่ใช้คำนวณ (Calc Date Range)|Text|Yes|2 ธ.ค.68 - 31 มี.ค. 69|
|จำนวนวัน (Day Count)|Integer|Yes|120|
|ผลตอบแทน:Token (Yield/Token)|Decimal(18,6)|Yes|0.19726|
|วันประกาศ (Announcement Date)|Date|No|20 มี.ค. 69|
|Cut-off Date|Date|Yes|31 มี.ค. 69|
|วันครบกำหนดจ่าย (Payment Date)|Date|Yes|3 เม.ย. 69|
|ผลตอบแทนรวม/งวด (Total Yield)|Decimal|No|49117740|

  

8.2 Enum Definitions

|   |   |   |
|---|---|---|
|**Enum**|**Values**|**Usage**|
|YieldType|DAILY_YIELD, ONE_TIME_YIELD|Yield calculation method|
|RoundingMode|ROUND, ROUND_DOWN, NONE|Rounding behavior for amounts|
|InvestorCategory|RETAIL, INSTITUTION, FOREIGN|Tax rate classification|
|SetupStatus|ACTIVE, INACTIVE|Setup lifecycle|
|PlanStatus|PENDING, PROCESSING, COMPLETED, CANCELLED|Plan period lifecycle|
|PaymentStatus|PENDING, PAID, FAILED|Per-investor transaction status|

8.3 Error Codes

|   |   |   |
|---|---|---|
|**Code**|**HTTP**|**Description**|
|YP001|409|Active yield setup already exists for this project|
|YP002|404|Yield payment setup not found|
|YP003|400|Invalid Excel template format|
|YP004|400|Project is not Active|
|YP005|400|Cannot edit INACTIVE setup|
|YP006|400|Cannot modify COMPLETED plan period|
|YP007|400|No holder positions found at cut-off date|
|YP008|500|Yield calculation error|