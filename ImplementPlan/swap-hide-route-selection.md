---
title: Swap Route Selection Fix
tags: [trading, flutter, implementation-plan]
status: active
created: 2026-02-01
last-updated: 2026-02-12
---

# Plan: Fix Refresh Button Not Showing on Route Error

**Navigation**: [[Home]] | Implementation Plans

## Problem

เมื่อ route error (`selectedRoute == null`) และ timer หยุด ไม่มีปุ่ม Refresh ให้ user กดเพื่อ retry → ต้องแก้ไขเงื่อนไขการแสดงปุ่มให้แสดง Refresh เสมอเมื่อ timer หยุด



---



## Files to Modify



### 1. `lib/domains/digital_portal/swap/widgets/bottom_sheet/swap_confirm_bottom_sheet.dart`



**แก้ไขเงื่อนไขปุ่ม Confirm** (บรรทัด 161-167)



เดิม:

```dart

if (controller.refreshRouteTimerController.isRunning.value ||

controller.selectedRoute.value == null)

XSpringButton.fill(

label: 'Confirm',

size: XButtonSizeEnum.lg,

widthStyle: XButtonWidthStyleEnum.fill,

onPressed: controller.onPlaceSwapOrder,

enable: !controller.isLoadingWhenSwap.value,

),

```



ใหม่:

```dart

if (controller.refreshRouteTimerController.isRunning.value)

XSpringButton.fill(

label: 'Confirm',

size: XButtonSizeEnum.lg,

widthStyle: XButtonWidthStyleEnum.fill,

onPressed: controller.onPlaceSwapOrder,

enable: !controller.isLoadingWhenSwap.value &&

controller.selectedRoute.value != null,

),

```



**แก้ไขเงื่อนไขปุ่ม Refresh** (บรรทัด 168-173)



เดิม:

```dart

if (!controller.refreshRouteTimerController.isRunning.value &&

controller.selectedRoute.value != null)

XSpringButton.ghost(

size: XButtonSizeEnum.lg,

widthStyle: XButtonWidthStyleEnum.fill,

onPressed: controller.refreshRouteOnConfirm,

label: 'Refresh',

fontColor: XSpringColors.xspring,

),

```



ใหม่:

```dart

if (!controller.refreshRouteTimerController.isRunning.value)

XSpringButton.ghost(

size: XButtonSizeEnum.lg,

widthStyle: XButtonWidthStyleEnum.fill,

onPressed: controller.refreshRouteOnConfirm,

label: 'Refresh',

fontColor: XSpringColors.xspring,

),

```



---



## สรุปการเปลี่ยนแปลง



| เงื่อนไข | Timer | มี Route | ปุ่ม (เดิม) | ปุ่ม (ใหม่) |

|----------|-------|----------|-------------|-------------|

| กำลัง inquiry | ✅ รัน | ✅ | Confirm (enabled) | Confirm (enabled) |

| กำลัง inquiry | ✅ รัน | ❌ | Confirm (disabled) | Confirm (disabled) |

| Timer หมด | ❌ หยุด | ✅ | Refresh | Refresh |

| **Route error** | ❌ หยุด | ❌ | ❌ **ไม่มีปุ่ม** | ✅ **Refresh** |



---



## ผลลัพธ์



- แสดงปุ่ม Refresh เสมอเมื่อ timer หยุด (ไม่ว่าจะมี route หรือไม่)

- User สามารถกด Refresh เพื่อ retry ได้ทันทีเมื่อเกิด route error

- ปุ่ม Confirm จะ disabled เมื่อไม่มี route



---



## Further Considerations



1. **UX improvement** - พิจารณาเพิ่ม error message ใน bottom sheet เมื่อ `selectedRoute == null` เพื่อบอก user ว่าเกิดอะไรขึ้น

2. **Alternative approach** - ทำ auto-retry ใน background แทนที่จะให้ user กด refresh เอง (แต่อาจทำให้ loading นาน)



---



---



# Plan: Hide Route Selection & Change Priority to Mixed > Best



## Requirement

1. **ซ่อนปุ่มเลือก route** - ผู้ใช้ไม่สามารถกดเลือก route เองได้ ระบบจะ auto-select ให้เสมอ

2. **เปลี่ยน priority การเลือก default route**: `mixed` > `existing` > `best`



---



## Files to Modify



### 1. `lib/domains/digital_portal/swap/widgets/swap_market.dart`



**ซ่อนปุ่มเลือก route** (บรรทัด 51-111)

- เอา `GestureDetector` ออก เปลี่ยนเป็น `Container` ธรรมดา (remove `onTap`)

- เปลี่ยนข้อความ "Select Route" → "Route"

- เอา import `SelectRouteBottomSheet` ออก



**ซ่อน chevron down icon** (บรรทัด 98-106)

- เปลี่ยน `visible: controller.isAvailableRoutes` → `visible: false`



**ซ่อน Best Route Badge** (บรรทัด 93-96)

- เปลี่ยน `visible: controller.selectedRoute.value?.isBestRoute ?? false` → `visible: false`



---



### 2. `lib/domains/digital_portal/swap/widgets/bottom_sheet/swap_confirm_bottom_sheet.dart`



**ซ่อน Best Route Badge** (บรรทัด 115-117)

- เอา `Visibility` ที่มี `BestRouteBadge()` ออก หรือ set `visible: false`

- เอา `BestRouteBadge` import ออก

- เอา `_isBestRoute` getter ออก (ถ้ามี)



---



### 3. `lib/domains/digital_portal/swap/controller.dart`



**เปลี่ยน logic ใน `_getSelectedRoute`** (บรรทัด 717-738)



เดิม:

```dart

SwapRouteDetailModel? _getSelectedRoute(SwapRouteDetailModel? selectedRoute, List<SwapRouteDetailModel>? routeOptionList, {bool autoBestRoute = false}) {

if (routeOptionList == null || routeOptionList.isEmpty) {

return null;

}



if (selectedRoute != null && !autoBestRoute) {

final updatedRoute = routeOptionList.firstWhereOrNull(

(el) => el.name == selectedRoute.name && !el.isUnavailableRoute,

);

return updatedRoute;

}



return routeOptionList.firstWhereOrNull((el) => el.isBestRoute);

}

```



ใหม่:

```dart

SwapRouteDetailModel? _getSelectedRoute(SwapRouteDetailModel? selectedRoute, List<SwapRouteDetailModel>? routeOptionList, {bool autoBestRoute = false}) {

if (routeOptionList == null || routeOptionList.isEmpty) {

return null;

}



// Priority 1: Mixed Route (always prefer mixed over existing/best route)

final mixedRoute = routeOptionList.firstWhereOrNull((el) => el.isMixedRoute);

if (mixedRoute != null && !mixedRoute.isUnavailableRoute) {

return mixedRoute;

}



// Priority 2: Keep existing route (if available and not auto-selecting)

if (selectedRoute != null && !autoBestRoute) {

final updatedRoute = routeOptionList.firstWhereOrNull(

(el) => el.name == selectedRoute.name && !el.isUnavailableRoute,

);

if (updatedRoute != null) {

return updatedRoute;

}

}



// Priority 3: Best Route

return routeOptionList.firstWhereOrNull((el) => el.isBestRoute);

}

```



---



## สรุปการเปลี่ยนแปลง



| ไฟล์ | การเปลี่ยนแปลง |

|------|------------------|

| `swap_market.dart` | - เอา `GestureDetector` ออก → ไม่กดเลือก route ได้ <br> - เปลี่ยน "Select Route" → "Route" <br> - ซ่อน chevron down icon <br> - ซ่อน `BestRouteBadge` <br> - เอา import `SelectRouteBottomSheet` ออก |

| `swap_confirm_bottom_sheet.dart` | - ซ่อน `BestRouteBadge` <br> - เอา import `BestRouteBadge` ออก <br> - เอา `_isBestRoute` getter ออก |

| `controller.dart` | - เปลี่ยน priority: **Mixed > Existing > Best** |



---



## Priority ใหม่สำหรับการเลือก Route



1. **Mixed Route** - เลือกเสมอถ้ามีและ available (auto-switch จาก route อื่นมา mixed)

2. **Route เดิม** - คงไว้ถ้าไม่มี mixed

3. **Best Route** - fallback สุดท้าย



---



## Note

- `isMixedRoute` getter มีอยู่แล้วใน `SwapRouteDetailModel` (swap_route.dart:100)

```dart

bool get isMixedRoute => name == 'mixed';

```

- การเลือก route จะเป็น automatic เสมอ ผู้ใช้ไม่สามารถเปลี่ยน route เองได้

- ไม่มี unit test ที่ต้องแก้ (controller_test.dart ไม่ได้ test `_getSelectedRoute`)