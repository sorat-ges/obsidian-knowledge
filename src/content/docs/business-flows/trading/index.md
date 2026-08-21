---
title: Trading
description: จุดเริ่มต้นสำหรับ Flow การซื้อขาย การเลือก route และการจัดการความเสี่ยง
capability: Trading
services: [order-service]
aliases: [trading, trade, ซื้อขาย]
status: active
lastUpdated: 2026-08-21
documentType: flow
---

เลือก Flow ตามสิ่งที่กำลังพัฒนาหรือวินิจฉัย:

- [Swap Market Order](/business-flows/trading/swap-market-order/) — เปิดเมื่อไล่การซื้อขายทันที ตั้งแต่ตรวจคำสั่ง เลือก route, execute, ledger, portfolio จนถึง hedge
- [Swap Limit Order](/business-flows/trading/swap-limit-order/) — เปิดเมื่อไล่คำสั่งตั้งราคา การล็อกยอด Remarketer webhook, partial fill, refund และ portfolio
- [Big Lot](/business-flows/trading/big-lot/) — เปิดเมื่อทำ White Glove/Bulk ซึ่งบังคับ dealer route และมีกฎ bypass กับ precision เฉพาะ
- [Routing](/business-flows/trading/routing/) — เปิดเมื่อหาสาเหตุว่าทำไม route หนึ่งถูกเลือก การมองเห็นของ Customer/Dealer หรือ error `90006`
- [Hedging](/business-flows/trading/hedging/) — เปิดเมื่อไล่ FX exposure หลังเทรด USD, threshold และคำสั่ง hedge กับธนาคาร
- [Mutual Fund Switching](/business-flows/trading/mutual-fund-switching/) — เปิดเมื่อไล่คู่กองทุน, holiday/cutoff, FundConnext switch, allotment และ switch cancellation
- [Mutual Fund Sell Order Cancellation](/business-flows/trading/mutual-fund-sell-cancellation/) — เปิดเมื่อไล่ cutoff/effective date ของการยกเลิกคำสั่งขายกองทุนรวมและการยกเลิก FundConnext

## กฎกลางของ Trading

- [Trading Fees and Campaigns](/shared-rules/trading-fees-and-campaigns/)
- [Order State Machine](/shared-rules/order-state-machine/)
- [Ledger and Money Flow](/shared-rules/ledger-and-money-flow/)
- [Error Code Registry](/shared-rules/error-codes/)
