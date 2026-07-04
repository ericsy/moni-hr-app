# moni-hr-app 变更日志

## 2026-07-04

- **外勤改派留底**：请假/日常改派不删分配行，标记 `released_*`；须执行后端迁移 `migrate-merchant_service_job_assignment-release.sql`。
- **商家端独立外勤请假**：详情不展示「外勤影响与处置」，处置控件放在原因下方。
- **请假已通过的外勤仍显示在排班**：后端今日工作摘要返回 `leaveApproved`；排班卡片徽章「请假已通过」；当日 Hero 忽略此类外勤。
- **外勤状态与请假一致**：店班请假含外勤或独立外勤请假时，不再显示「未开始」；待审徽章「请假等审」，已通过「请假已通过」（待审不再在时段下重复提示）。
- **英文 Hero 误显中文**：打卡标题/提示始终按 `action` 走 i18n，不再使用后端返回的中文 `buttonLabel`/`hint`。
- **外勤请假已通过 Hero 仍显示到店上班**：`resolveHeroWorkAction` 忽略请假覆盖的外勤/整段请假店班；外勤均已请假且无可打卡店班时 Hero 显示已完成。
- **商家端申请详情外勤服务类型中文**：`cleaning` 等 code 映射为「保洁」等（`fieldJobs.serviceTypes`）。
- **商家端误显无重叠外勤**：店班请假未覆盖外勤时段时 App 不展示外勤影响，商家端却展示。商家端与后端改为仅展示/返回与请假时段实际重叠（`full`/`partial`）的外勤。
- **店班请假已含外勤则不可再申请外勤请假**：
  - **`fieldLeaveEligibility`**：待审/已通过请假若 `fieldImpacts` 覆盖该外勤，或已有独立外勤假，则隐藏外勤请假入口。
  - **`mapAttendanceRequestToLeaveRequest`** / **`LeaveRequest`**：列表映射 `fieldImpacts`。
  - **`request-create`**：提交外勤请假时拦截并提示 `fieldJobLeaveAlreadyCovered`。
  - 后端 **`assertFieldJobNotCoveredByOpenLeave`** 同步校验。

## 2026-07-02

- **打卡记录按任务时间排序**：`buildShiftPunchGroups` 在聚合店班与外勤后，按任务计划开始时刻统一排序；**开始时间相同时店班优先于外勤**。

## 2026-07-02（疑似代打卡）

- 员工 App 无代打卡规则逻辑；疑似代打卡规则在后端 **`moni-hr`** 调整（移除 `new_device_id`）。

## 2026-07-02（外勤标题等）

- **修复外勤打卡记录标题显示「班次#undefined」**：
  - **`groupPunchesByShift.ts`**：外勤统一按 `field_job:` 分组（无 refId 时用时段或 punch id）；`scheduleId` 不再对 `publishedCellId` 做 `String(undefined)`。
  - **`punchTaskType.ts`**：`isLikelyFieldJobPunch`、`formatFieldJobPunchTitle`；`publishedCellId` 判断改为 `> 0`。
  - **`punch-records.tsx`**：标题优先识别外勤，显示客户名/服务类型/「外勤服务」。

- **打卡记录展示任务类型**：每条打卡显示任务类型标签（店班 / 外勤 / 外勤同步上下班）。
  - 依赖后端 **`AppClockPunchVo`** 返回 `refType`、`refId`、`syncEffect`、`customerName`。
  - App **`mapClockPunchResults`**、**`punchTaskType.ts`**、**`punch-records.tsx`**；外勤按 `field_job:refId` 独立分组。
  - **修复显示 `undefined`**：店班标题用 `formatShiftHeroName`；任务类型文案兜底；兼容未返回 `refType` 的外勤打卡。

- **外勤同步店班 1 小时窗口规则**（规则在后端 `FieldStoreSyncRules` + 商家端实现；员工 App 无逻辑变更）：
  - 同步上班：外勤开始须在店班开始 **之后 1 小时内**（含边界）。
  - 同步下班：外勤结束须在店班结束 **之前 1 小时内**（含边界）。
  - 例：店班 13:50、外勤 14:05 可勾同步上班；超出 1 小时窗口则不可勾选。

## 2026-06-29

- **外勤上班后 Hero 不误显已完成**：外勤已打上班、未到计划结束前，Hero 显示「服务中」而非「已完成」（不依赖后端是否为 `DONE`）。
  - **`SchedulePunchHeroCard`**：`shouldShowFieldHeroInService` 优先于 `DONE` 分支。
  - 后端 **`AppTodayWorkService`**：服务中外勤返回 `WAITING` / 「服务中」。

## 2026-06-29

- **Hero 仅跟打卡时段**：不再展示漏打卡审批/申请入口；只根据 `currentPunchAction`、实打卡与计划时段显示该打什么卡（外勤「服务中」亦仅看实打卡+时间）。
  - 移除 **`findFieldJobForHeroAttention`**；**`SchedulePunchHeroCard`** 去掉漏打卡 Hero 分支。
  - **`shouldShowFieldHeroInService`** / **`fieldBlocksHeroStoreClockOut`** 不再读申请列表。

## 2026-06-29

- **外勤漏打卡部分通过状态**：仅一种漏打卡通过时不再显示「漏打卡已通过」，改为「漏打卡部分通过」或「漏打卡审批中」；两种均满足后才显示已通过/已完成。
  - **`fieldMissedPunchEligibility.ts`**：`fieldPunchKindSatisfied` / `isFieldJobFullyPunched` / `missed_punch_partial`。
  - **`FieldJobRow`**、**`SchedulePunchHeroCard`**、**`fieldJobsSchedule`** 同步。

## 2026-06-29

- **外勤下班漏打卡独立申请**：申请下班漏打卡不再要求已打上班卡或已申请上班漏打卡（后端同步移除校验）。
  - **`request-create.tsx`**：提交时按 `canApplyFieldMissedPunchIn/Out` 分别校验。

## 2026-06-29

- **外勤漏打卡申请页禁用已申请类型**：已提交上班漏打卡后，申请页「上班」选项置灰不可选（下班同理）；进入页面自动切到仍可申请的类型。
  - **`request-create.tsx`**：`fieldMissedPunchIn/OutSelectable` 与店班漏打卡一致的 chip 禁用样式。

## 2026-06-29

- **外勤漏打卡可分别申请上下班**：缺几张卡就可提交几个申请；上班漏打卡待审后仍可申请下班漏打卡。
  - **`fieldMissedPunchEligibility.ts`**：`canApplyFieldMissedPunchIn/Out` 按打卡类型独立判断，下班不再要求已打上班卡。
  - **`FieldJobRow`** / **`SchedulePunchHeroCard`**：同步使用 `preferredFieldMissedPunchKind`。

## 2026-06-29

- **外勤漏打卡切换上下班时间**：切换上班/下班打卡时，「实际打卡时间」默认同步为外勤计划开始/结束时刻。
  - **`request-create.tsx`**：外勤模式无 `selectedSlot`，补全 `proposedTime` 随 `punchKind` 更新逻辑。

## 2026-06-29

- **已完成外勤仍显示在列表**：外勤打满卡后不再从今日班次列表消失。
  - **`mapTodayWorkSummary.ts`**：嵌套 `fieldJobs` 展平时记录 `linkedStoreShiftId`；合并去重后补全遗漏外勤。
  - **`fieldJobsSchedule.ts`**：优先按后端嵌套关系挂载；店班不在排班列表时外勤改独立展示。
  - **`schedule.tsx`**：用 `allFieldJobs` 统计外勤数量。

## 2026-06-29

- **无排班不误显 Hero**：当日列表无外勤、无店班时，不再展示「等待可执行打卡动作」；仅在后端仍有可打卡动作时显示 Hero。
  - **`schedule.tsx`**：`hasVisibleTodayWork` 门控 `showHeroCard`。
  - 后端兜底改为 **「今日暂无待打卡任务 / 已完成」**。

## 2026-06-29

- **外勤已过打卡窗口 Hero 修复**：12:00–13:00 外勤在 16:00 不再误显「等待外勤任务可打卡时间」。
  - 仅**尚未到可打卡时间**的外勤才显示该等待文案。
  - 已过窗口未打满卡 → Hero 显示「打卡不完整」+「外勤服务」+ 漏打卡入口。
  - 店班已上班 → 优先显示店班「已打卡」。
  - **`findFieldJobForHeroAttention`**、后端 **`AppTodayWorkService`** 同步调整。

## 2026-06-29

- **店班 Logo**：新增 `StoreShiftIcon`（门店 + 班次时钟 SVG），Hero / 今日班次行 / 时间线店班头统一使用；外勤仍用 `car-outline`。
  - 依赖 **`react-native-svg`**。

## 2026-06-29

- **已打卡 Hero**：恢复「距离下班 X 分钟」倒计时；仍不展示时段/打卡时刻，店班仅显示区域 · 班次名称。

## 2026-06-29

- **已打卡 Hero 文案**：不再展示时间；店班显示「区域 · 班次名称」，外勤显示「外勤服务」。
  - **`formatShiftHeroName`** 替代含时段的 `formatShiftHeroLabel`。

## 2026-06-29

- **已打卡 Hero 增强**：上班打卡后展示当前班次（区域 · 班次 · 时段）及距离下班倒计时；无法计算倒计时时显示计划下班时间。
  - **`scheduleHeroShift.ts`**：`minutesUntilShiftEnd`、`formatShiftHeroLabel`。
  - **`SchedulePunchHeroCard`**、i18n **`minutesUntilShiftEnd`**。

## 2026-06-29

- **店班已上班 Hero 修复**：已打上班卡、尚未到下班时间时，不再被「等待外勤任务可打卡时间」覆盖，Hero 显示「已打卡」及上班时间。
  - **`SchedulePunchHeroCard`**：`clocked_in` 态优先于通用 `WAITING`。
  - 后端 **`AppTodayWorkService`**：店班进行中时返回「已打卡 / 下班时间后可打下班卡」。

## 2026-06-29

- **打卡优先级统一为「下班先于上班」**（Hero 展示 + 点击逻辑 + 后端 `currentPunchAction`）：
  - 顺序：店班下班 → 外勤完成 → 外勤开始 → 店班上班。
  - **`workPunch.ts`**：`isClockOutWorkAction` / `isClockInWorkAction`；外勤「服务中」才挡店班下班，外勤上班不再挡。
  - **`SchedulePunchHeroCard`** / **`schedule.tsx`**：展示与 `onHeroPunch` 按上述顺序分支。
  - 后端 **`AppTodayWorkService.determineCurrentAction`** 同步调整。

## 2026-06-29

- **Hero 下班打卡误打上班修复**：界面显示「离店下班」时，点击不再误走后端下一班 `STORE_CLOCK_IN`；当前班可下班时优先调用店班 `clock_out` 接口。
  - **`schedule.tsx`**：`onHeroPunch` 与 Hero 展示逻辑对齐。
  - **`workPunch.ts`**：抽取 `fieldBlocksHeroStoreClockOut` 共用判断。

## 2026-06-29

- **Hero 店班下班优先级**：外勤结束与下一班开始同一时刻时，优先展示当前班「离店下班」而非下一班「到店上班」。
  - 后端 **`AppTodayWorkService.determineCurrentAction`**：外勤打卡 → 店班下班 → 店班上班。
  - App **`SchedulePunchHeroCard`**：`showClockOut` 时优先于 `STORE_CLOCK_IN` 与通用 `WAITING`；`WAITING` 且无进行中外勤时回退店班 Hero。
  - **`schedule.tsx`**：移除重复的 `workDateIso` 属性。

## 2026-06-29

- **外勤详情弹窗数据修复**：合并 timeline 多处外勤字段避免服务类型/备注丢失；服务类型本地化改用 `returnObjects`；弹窗增加「同步店班」配置展示。
  - **`mapTodayWorkSummary.ts`**、**`fieldServiceType.ts`**、**`FieldJobRow.tsx`**、i18n。

## 2026-06-29

- **外勤拨号修复**：点击客户电话直接 `Linking.openURL(tel:)`，不再因 iOS `canOpenURL` 误报导致「无法拨打电话」；`app.json` 补充 `LSApplicationQueriesSchemes`。

## 2026-06-29

- **多外勤状态修复**：尚未到计划开始时间的外勤（第 2 单及以后）不再误显示「打卡不完整」，改为「未开始」。
  - **`fieldMissedPunchEligibility.ts`**：新增 `isBeforeFieldScheduledStart`，修正 `getFieldJobDisplayState` 判断。

## 2026-06-29

- **独立外勤行 UI**：去掉列表外层「外勤服务」分组标题；卡片内图标右侧仍保留「外勤服务」标签。

## 2026-06-29

- **外勤与店班挂载规则**：外勤仅在与店班时段**重叠**时嵌套显示在店班下；时间不匹配的外勤独立展示（与后端 `fieldLinksToStoreShift` 一致）。
  - **`fieldJobsSchedule.ts`**：`resolveFieldJobsForSchedule` 改为时段重叠判断，去除按时间线顺序挂靠逻辑。

## 2026-06-29点击外勤卡片主区域（非电话/地址）弹出详情弹窗，展示服务类型与备注；后端 timeline 补充 `notes` 字段。
  - 服务类型按 `fieldServiceTypes` 本地化（`cleaning` → 保洁 等），与商家端一致。
  - **`FieldJobRow.tsx`**、**`fieldService.ts`**、**`mapTodayWorkSummary.ts`**、i18n。
  - 后端 **`AppTodayWorkService.toFieldTimelineItem`** 增加 `notes`。

## 2026-06-29外勤计划结束（如 15:50）后 Hero 不再误显示「服务中」。
  - 修复 **`SchedulePunchHeroCard`** 参数重复（`workDateIso`）导致的打包语法错误。
  - **`fieldMissedPunchEligibility.ts`**：新增 `isPastFieldScheduledEnd`、`isInFieldOutPunchWindow`、`shouldShowFieldHeroInService`。
  - **`workPunch.ts`**：`resolveEffectiveWorkAction` 在结束~结束+30 分钟窗口内补全「完成服务」打卡动作。
  - **`SchedulePunchHeroCard`**：超时显示「打卡不完整」+「申请漏打卡」；仅计划结束前显示「服务中」。
  - **`schedule.tsx`**：Hero 接入上述逻辑与申请列表。

## 2026-06-29
  - 申请列表/详情支持外勤漏打卡展示（客户、服务地址、计划时段、同步店班说明）；与 App 共用后端 `fieldJobId` + `missed_punch` 体系。

- **外勤漏打卡（与店班漏打卡同一申请体系）**：
  - 新增 **`src/utils/fieldMissedPunchEligibility.ts`**、**`src/utils/openFieldRequest.ts`**：外勤可申请时机、打卡不完整状态、店班漏打卡入口按同步方向隐藏。
  - **`FieldJobRow`**：缺卡显示「打卡不完整/审批中」；可申请时展示「申请漏打卡」；同步店班时提示联动补录。
  - **`request-create`**：支持 **`source=field`** 外勤漏打卡表单与提交（**`fieldJobId`**）。
  - **`schedule.tsx`**：外勤行传入申请列表；店班「漏打卡」在应由外勤同步时隐藏。
  - **`request-detail`** / **`mapAttendanceRequest`**：展示外勤漏打卡客户、时段、同步说明。
  - i18n 中英文案。

## 2026-06-29

- **排班 Hero 打卡统一店班+外勤**：
  - 新增 **`src/utils/workPunch.ts`**，排班页蓝色 Hero 按钮根据 **`today-work-summary.currentPunchAction`** 自动切换「到店上班/下班」「开始/完成外勤」等动作，统一走 **`POST /api/v1/app/work/punch`**；无工作流动作时仍走原 **`punchShift`** 店班打卡。
  - **`schedule-week.tsx`** 今日视图同步支持 Hero 统一打卡。

- **外勤并入排班表（日/周）**：
  - 新增 **`src/utils/fieldJobsSchedule.ts`**、**`src/components/FieldJobRow.tsx`**，从 **`today-work-summary`** 拉取外勤工单并挂到对应门店班次下。
  - **`resolveFieldJobsForSchedule()`** 改为按外勤与店班**时段重叠**挂载，时间不重叠的外勤独立展示，不再套在相邻店班下。
  - **`schedule.tsx`** 今日班次列表展示外勤行（嵌套在班次下或独立显示）。
  - **`schedule-week.tsx`** 周视图同步展示外勤；日期圆点在有外勤时也会标记。

- **外勤导航回退（不占用 Tab Bar）**：
  - 底部 Tab 恢复为 **排班 / 我的**（移除「今日」Tab）。
  - 登录默认入口恢复 **`/schedule`**。
  - 外勤页迁至 **`app/(main)/today.tsx`**（Stack 子页，路由 **`/today`**），功能与 API 保留。
  - 排班首页标题区恢复日历+时钟装饰（不再使用 `BrandLogo`）。

- **激活页 Android 键盘遮挡**：**`app/(auth)/activate.tsx`** 接入 **`useScrollInputAboveKeyboard`**（与登录/忘记密码页一致），聚焦验证码/密码时自动上滚，避免输入框被键盘盖住。
- **master 清理外勤残留**：删除工作区未提交的派单/外勤相关文件（`today.tsx`、`todayWork.ts`、`fieldService` 等）；**master 不含外勤功能**，外勤开发在 **`send_task`** 等分支。此前 `today.tsx` 引用缺失模块导致打包报错。

- **激活页密码二次确认**：设置登录密码时增加「确认密码」输入框，提交前校验两次密码一致（至少 8 位规则不变）。

- **Android 16 键盘滚动**：`scrollEnsureVisible` 区分 resize（用 ScrollView 实测高度）与 overlay（用 keyboard screenY），取更保守值；登录/忘记密码页仍走原 `onFieldFocus` 逻辑不受影响。

- **App 登录分步流程**：登录页先输入邮箱点「下一步」，调用 **`POST /api/v1/app/auth/lookup`** 预检；不存在提示账号不存在，未激活跳转激活页，已激活再显示密码框。移除登录页「账户激活」入口。

- **版本号升级**：`app.json` **`version`** `1.0.0` → **`1.0.1`**（Android 图标修复发版；`versionCode` 仍由 EAS `production` **`autoIncrement`** 自动递增）。

- **应用内 Logo 统一**：
  - 新增 **`src/components/BrandLogo.tsx`**，使用 **`assets/icon.png`**（与 App 图标一致）。
  - 登录 / 激活 / 忘记密码页、排班首页标题区，由 Ionicons 占位图替换为 **`BrandLogo`**。

- **Android 自适应图标裁切修复（第二版）**：
  - **`scripts/generate-app-icon.py`**：Android 专用 **`render_adaptive_icon()`**，逐像素检测 Logo 到中心距离，自动最大化缩放直至全部实色像素落在安全区（66dp 直径 × 90% 内边距）内；输出 `logo_max_dist` / `safe_radius` 校验，并生成 **`adaptive-icon-safezone-preview.png`**。
  - 当前 **`adaptive_fill≈0.42`**，在「绝不裁切 Logo 主体」前提下尽量放大；iOS **`icon.png`** 仍为 **`FILL=0.88`** 不变。
  - 需重新 EAS Build 并提交 Google Play 后生效。

## 2026-06-26

- **登录后业务接口 401（未带 Authorization）修复**：
  - 服务端诊断确认旧包 1.0.0 登录后 GET 请求 **`hasAuth: false`**，后端与 curl 带 Token 均正常，问题在客户端。
  - **`AuthContext`**：冷启动若仅有 **`session` 无 `token`** 则清除无效会话（原逻辑会进主页但所有请求不带 Bearer）。
  - **`authEpochRef`**：登录/激活时递增，避免冷启动恢复与登录竞态覆盖 token。
  - **`pickAccessToken`**：统一解析 `accessToken` / `access_token` / `token`；登录/激活无 token 时提示无效响应。
  - **`persistAuth`**：先同步写入 **`accessTokenRef`** 再 `setState`。

## 2026-06-24

- **新增 Today 外勤页（员工 App）**：新增 `app/(main)/(tabs)/today.tsx`，对接 `GET /api/v1/app/today-work-summary` 与 `POST /api/v1/app/work/punch`，支持下拉刷新、前台回到页面自动刷新、定位授权后打卡（`expo-location` + `getPunchDeviceId`），并在打卡成功后用接口返回摘要刷新页面状态。
- **新增外勤 Today 数据层**：新增 `src/types/fieldService.ts`、`src/api/todayWork.ts`、`src/api/mapTodayWorkSummary.ts`，统一 `TodayWorkSummary` / `timeline` / `currentPunchAction` 类型与响应映射，`apiRequest` 携带 `storeId`。
- **新增 Today UI 组件**：新增 `src/components/today/TodayPunchActionButton.tsx`（单主按钮 + WAITING/DONE 提示态）与 `src/components/today/TodayWorkTimeline.tsx`（门店班次块 + 嵌套外勤工单时间线）。
- **导航与默认入口调整**：`app/(main)/(tabs)/_layout.tsx` 增加 Today 首个 Tab（日历图标），`app/index.tsx` 默认重定向到 `/today`。
- **i18n 补充**：`src/i18n/resources.ts` 新增中英文 Today 页签、打卡动作、时间线与加载错误文案。
- **设备标识工具补充**：`src/utils/punchDevice.ts` 新增 `getPunchDeviceId()`，并复用到原 `getPunchDevicePayload()`。

## 2026-06-24

- **跨商户切店登录失效修复**：**`setSelectedStore`** 改为先 **`updateLastStore` + `/me`** 成功后再更新本地 **`selectedStoreId`**，避免切店瞬间并发请求带新门店 id 触发 401 全局登出；**`updateLastStore`** 补充 **`X-Store-Id`** 请求头。
- **跨商户兼职（方案 A）**：登录流程不变，后端返回聚合 **`storeDetails`**（含 **`merchantId`/`merchantName`**）；门店切换沿用 **`selectedStoreId`**，请求自动带 **`X-Store-Id`**。
  - **`src/api/types.ts`**：**`StoreBrief`** 增加商户字段。
  - **`src/api/auth.ts`**：**`fetchCurrentEmployee(storeId?)`** 刷新/me 时传入当前门店。
  - **`src/api/mapEmployeeUser.ts`**：门店名显示 **`商户名 / 门店名`**。
  - **`src/context/AuthContext.tsx`**：切店、刷新员工信息时传递 **`selectedStoreId`**。

## 2026-06-11

- **App 图标生成**：由 **`moni-hr-logo-icon.png`** 生成 **1024×1024**（**`icon.png`** 等）。去除四周边缘与底部蓝灰投影（加强中性灰识别、底部按实色 Logo 裁切、缩放后再漂白）；脚本 **`scripts/generate-app-icon.py`**。

- **全环境 API 改 HTTPS**：**`config/apiEnv.js`** 中 dev / test / pro 接口基址由 `http://` 改为 `https://`（`dev-api`、`test-api`、`api.monihr.com`）。

## 2026-05-29

- **迟到打满卡仍可部分请假**：… **`toFixed`** = 上班打卡时刻；修复 **`early_out`** 校验误拦（有下班卡时开始<下班仍合法）；提交校验与 payload 同步使用默认部分时段。

- **多班 Hero 优先已打卡班次**：同日多班时，若前一班已上班未下班，顶部蓝色大卡优先展示该班 **「已打卡」**，不再被下一班「即将开始/可上班打卡」抢占；**`pickHeroShiftIndex`** 优先级：可下班 → 已上班未下班 → 可上班 → 即将开始 → 已完成置后。

- **打完下班卡自动切下一班**：打卡成功后 **`applyClockPunchResult`** 乐观合并下班记录；**`consolidateShiftPunchRecords`** 合并被拆开的上下班记录；刷新时保留已有打卡不覆盖；**`getShiftPunch`** 合并多条匹配记录；已完成班次 Hero 得分置后。

- **已打卡状态展示**：上班打卡后蓝色 Hero 卡片与今日班次胶囊改为显示 **「已打卡」**（含打卡时间），不再仍显示「上班打卡 / 立即打卡」；已打满卡显示「已完成」；**`SchedulePunchHeroCard`**、**`scheduleHeroShift`**、i18n **`punchHeroClockedInAt`**。

- **部分请假 · 已上班未下班可早退**：迟到打卡后不再锁定开始时间；仅上班卡时可选「班次开始～上班打卡」（迟到说明）或「上班时间～班次结束」（计划早退）；**`partialLeaveConstraints.ts`** 新增 **`clocked_in_only`** 场景，校验时传入打卡记录；**`request-create`** 提示文案 **`leavePartialClockedInHint`**。

## 2026-06-10

- **App 版本更新**：
  - **`GET /api/v1/app/version-check`**（启动与回前台检查；低于 minVersion 强制更新，否则可选更新每 **`promptToken`** 只弹一次）。
  - 全站 API 请求头自动携带 **`X-App-Version`**、**`X-App-Platform`**（**`appClientMeta.ts`**）；版本检查接口不再传 query 参数。
  - **`AppUpdateProvider`** + **`AppUpdateModal`**；跳转 **`storeUrl`**（iOS App Store / Android Google Play）。
  - 平台在 **`moni-hr-platform`**「App 版本管理」配置版本、审核状态与商店链接。

- **按班次请假去掉顶部日期区间**：**`request-create`** 移除「请假开始/结束日期」选择与日历弹窗；按当前周加载排班，左右切换周不再受日期区间限制；说明文案已更新；修复路由入参 **`applyRouteParams`** 仍调用已删 **`setLeaveWindowStartIso`** 的报错。

- **部分请假时段按打卡约束**：已打卡时部分请假不再可在整段排班内随意填；迟到仅可请「班次开始～上班打卡」（如 8:00–14:32），早退仅可请「下班打卡～班次结束」；**`partialLeaveConstraints.ts`** + **`TimeSelectField`** min/max/locked。

- **周排班页标题**：导航栏为 **`scheduleWeekTitle`**（周排班 / Weekly schedule）；移除页内重复大标题及「打卡记录」「申请记录」快捷入口（Tab 排班首页保留）。

- **店铺排班请假标色**：后端有替班时原员工（如 yu3333）应返回 **`on_leave`**；需部署最新 **`moni-hr`** 后 App 才显示琥珀色请假胶囊。

- **店铺排班区分正常/替班/请假**：**`mapStorePublishedSchedule`** 保留 **`rosterStatus`**，替班与普通班次分开展示；**`schedule-week`** 胶囊样式区分（蓝=正常、紫=替班、琥珀=请假）、替班行显示「替 xxx」；图例单行置于周历下方；i18n **`storeRoster*`**。

- **店铺排班接真实 API**：**`schedule-week.tsx`** 移除 **`STORE_DAY_ROSTER_BY_STORE`** 演示数据；店长/副店长切换「店铺排班」时调用 **`GET /api/v1/app/schedule/store-published`**（**`fetchStorePublishedSchedule`**）；**`mapStorePublishedSchedule.ts`** 按日期/区域/班次聚合员工；展示真实区域名、班次名与员工姓名；加载/错误/下拉刷新与「我的排班」一致。

## 2026-06-08

- **今日班次 · 英文胶囊文案**：**`TodayShiftRow`** 去掉固定 76px 宽度，状态/「Request」按内容撑开；请假状态改用短文案 **`shiftBadgeLeavePending`** 等。

- **漏打卡可申请时机**：按本段排班 **应打卡时刻** 判断（上班=开始、下班=结束），不再等到整段延长打卡窗结束；同日多班不重叠，第二班 17:30 后即可在「申请」中看到漏打卡（`shiftClockWindow.ts`）。

- **排班首页 · 今日班次右侧**：打卡状态与「申请」 **同宽同高**（`actionPill` 固定 76×28）；上下排列。

- **排班首页 · 今日班次右侧**：打卡状态与「申请」改为 **上下排列**（`TodayShiftRow` 右侧列 `column`）。

- **排班首页 · 申请按钮样式**：**`TodayShiftRow`**「申请」改为与打卡状态一致的 **胶囊角标**；菜单改为 **Modal 浮层**（不撑高班次列表），点遮罩关闭。

- **排班首页 · 今日班次申请**：**`TodayShiftRow`** 改回与 **`MyShiftCard`** 一致——按钮文案 **「申请」**，展开可选 **漏打卡 / 请假**。

- **排班页改版（已实施）**：Tab **`schedule.tsx`** 改为今日首页（打卡 Hero、今日班次简表 + 行内请假、**`scheduleViewMore`**）；周视图迁至 **`schedule-week.tsx`**（`MyShiftCard`、店铺排班仅周页）。新增 **`SchedulePunchHeroCard`**、**`TodayShiftRow`**、**`scheduleHeroShift.ts`**。

- **排班页改版（方案）**：Tab 首页为今日打卡大卡 + 今日班次简表 +「点击查看更多排班」；现有周视图/`MyShiftCard`/店铺排班迁至 **`schedule-week`**。**店长店铺视图仅在周页**，首页仅「我的」今日班次。

## 2026-05-29

- **TestFlight · test 环境**：**`eas.json`** 新增 **`testflight`** profile（`APP_ENV=test`、`distribution: store`、`autoIncrement`）；应用名 **Moni HR Test**，API **`http://test-api.monihr.com`**。构建：`eas build --platform ios --profile testflight`；提交：`eas submit --platform ios --profile testflight`（与 production 共用 **`com.monihr`**，TestFlight 里按构建号区分）。

- **登录提示 Invalid server response**：根因多为网络/防火墙（如 FortiGuard）对 `test-api.monihr.com` 返回 HTML 403 而非 JSON；**`client.ts`** 先读文本再解析，非 JSON 时抛 **`API_INVALID_RESPONSE`**；**`AuthContext`** 映射为 **`loginErrorInvalidResponse`** 中文说明。若仍失败：确认已用 **`http://` 修复后重打的 test 包；换非公司 WiFi/手机流量；请 IT 放行域名。

- **test 包登录失败 / 无法联网**：`test-api.monihr.com` 等环境 **仅开放 HTTP（80）**，配置误用 `https://` 导致连接被拒；**`config/apiEnv.js`** 改为 `http://`；Android **`withAndroidHttp.js`** 增加 `monihr.com` 明文域名；登录网络异常提示 **`loginErrorNetwork`**。

- **多环境 API 地址**：`APP_ENV` 选择后端 — `dev` / `test` / `pro` 域名见 **`config/apiEnv.js`**（**`app.config.ts`** 须引用根目录 JS，不能 import `src/`）；**`eas build --profile test`** 等已可正常读配置。

- **iOS 打包配置**：`app.json` 中 **`ios.bundleIdentifier": "com.monihr"`**（Android 仍为 **`com.moni.hr`**）。

- **Android 登录 · 密码框被键盘遮挡**：键盘弹出时 `justifyContent: 'center'` 导致无法上滚；改为键盘打开时顶对齐、底部随键盘增高 padding，聚焦账号/密码时 `measureInWindow` 自动滚入可视区（**`login.tsx`**）。

- **Android 忘记密码 · 验证码/新密码被键盘遮挡**：移除 `flex:1` 居中容器限制滚动高度；新增 **`useScrollInputAboveKeyboard`**（`measureLayout` 精确定位、区分 resize/overlay 键盘、键盘弹出后二次滚动）；登录页同步使用该 hook（**`forgot-password.tsx`**、**`login.tsx`**、**`useScrollInputAboveKeyboard.ts`**）。

- **登录页 · 忘记密码 / 账户激活**：两个次要入口改为一行居中（`忘记密码` `账户激活`），去掉问号与中间分隔点；链接间距加大至 20px（**`login.tsx`**、**`resources.ts`**）。

- **忘记密码**：登录页「忘记密码？」→ **`forgot-password.tsx`**；调用 **`POST /api/v1/app/auth/password-reset/send-code`**、**`POST .../confirm`**；**`AuthContext.sendPasswordResetCode`** / **`resetPasswordWithCode`**；中英文文案已补充。

- **Android 13 / Imin · 部分时段请假提交后闪退**：数据已提交成功，但 **`closeAfterSubmit`** 在 **`router.replace`** 前 **`setRequestScheduleContext(null)`** 触发 **`applyRouteParams`** 与 **`TimeSelectField` Modal** 同时卸载导致竞态。改为提交成功时先 **`setLeavePickersEnabled(false)`**、延后跳转（Android +300ms）、**`requestScheduleContext`** 在页面失焦后清理；**`TimeSelectField`** 使用 **`Modal visible`** + 延迟卸载，并支持 **`disabled`**。

- **排班页 · 请假/漏打卡已通过仍显示「等待审批」**：下拉刷新会正确拉取最新申请状态，但 **`MyShiftCard`** 将「待审批 + 已通过」的占用统一走 **`shiftStatusLeavePending`** 文案。现按 **`getShiftLeaveRequestStatus`** / **`getShiftMissedPunchOpenStatus`** 区分 pending 与 approved，新增 **`shiftStatusLeaveApproved`** 等 i18n；**`normalizeStatus`** 将 API 的 **`reviewed`** 映射为 **`approved`**。

## 2026-05-28

- **Android（MIUI/13）提交成功闪退**：提交请假/漏打卡成功后不再 `router.back()`；改为 **`Keyboard.dismiss()` + `InteractionManager.runAfterInteractions` 延迟后 `router.replace('/requests')`**（**`request-create.tsx`**、**`date-leave-create.tsx`**），规避键盘/转场/路由栈时序导致的崩溃。

- **申请记录 · 按日期请假展示**：**`requests.tsx`** 不展示「共几段排班」及班次列表（**`leaveMode === 'date_range'` 或 `shifts.length === 0`**）；**`mapAttendanceRequest.ts`** 增加 **`resolveLeaveModeForRow`**：兼容 **`leaveMode`** 大小写/连字符、并在 **`leaveDateFrom` + `leaveDateTo`** 且非显式 **`shift`** 时识别为 **`date_range`**，且 **`shifts` 恒为空**，避免后端未标 `date_range` 仍带 **`leaveItems`** 时列表误显示段数。

- **日历选开始日**：修复开始日期弹窗传入 **`maxIso=结束日`** 导致「开始日不能晚于当前结束日」、6 月及之后日期全部灰掉不可点的问题；**`request-create`** / **`date-leave-create`** 选开始时不再传 **`maxIso`**（选晚于原结束日的开始日后，结束日仍由 **`applyLeaveWindowDate` / `applyCalendarDate`** 自动顺延）。

- **按时间（按班次）请假**：取消请假开始/结束日期区间的 **最长天数限制**（原 90 天校验已移除，**`request-create.tsx`**）。

- **按日期请假入口**：从排班页移除快捷入口；在 **申请记录**（**`requests.tsx`**）列表顶部增加「按日期请假」入口，跳转 **`date-leave-create`**。
- **按班次请假日期范围 + 日历**：**`request-create.tsx`** 增加「请假开始/结束日期」日历弹窗（**`CalendarDatePickerModal.tsx`**）；按该区间拉取多周已发布排班与打卡；周条左右切换限制在区间内；区间内未选日期灰显。
- **按日期请假日历**：**`date-leave-create.tsx`** 起止日在 `±` 旁支持点击打开同一日历弹窗选日（**`dateLeavePickCalendar`** 无障碍标签）。
- **文案**：**`resources.ts`** 新增 `leaveShiftPeriodStart` / `leaveShiftPeriodEnd` / `leaveShiftCalendarHint` / `dateLeavePickCalendar`；`requestsEmpty` 中英补充说明本页「按日期请假」。

## 2026-05-27

- **按日期区间请假（App）**：入口在 **申请记录** 页（**`requests.tsx`**）→ **`date-leave-create.tsx`**；曾短暂在排班页提供快捷入口，已移至申请记录。提交 **`leaveMode=date_range`** + **`leaveDateFrom`** / **`leaveDateTo`**；列表/详情展示区间；审批无替班 UI。

- **跨天夜班（App）**：
  - **`overnightShiftPair.ts`** + **`mapPublishedSchedule`**：识别 `23:59`/`00:00` 配对，标注 **`overnightRole`**、**`overnightPairCellId`**、合并展示 **`overnightDisplayRange`**。
  - **`shiftClockWindow` / `MyShiftCard`**：首段仅上班、末段仅下班按钮；末段用配对首段上班卡判断可否下班；卡片展示合并时段。
  - **`schedule.tsx`**：末段日自动拉取前一日打卡；漏打卡提交带 **`overnightPairCellId`** / **`overnightRole`**（**`mapAttendanceRequest`**、**`request-create`**）。
  - 文案：**`overnightMissedPunchInOnly`** / **`overnightMissedPunchOutOnly`**。

- **请假替班（前端）**：**`request-detail.tsx`** 审批请假时通过 **`GET .../attendance/substitute-candidates?leaveItemId=`** 下拉选替班人（仅当前门店、该时段无已发布排班）；**`attendance.ts`** 新增 **`fetchSubstituteCandidates`**；已审批展示 **`leaveItems[].substitution`**；**`MyShiftCard`** 替班标签；**`types`** / **`AuthContext.reviewAttendanceRequest`** 对接 **`substitutions`**。

## 2026-05-16

- 新增：完成「moni-hr」排班 App 的 UX 交互设计说明（面向 NZ/AU/CN，iOS/Android/鸿蒙，中英切换；白底蓝点缀科技风）。设计文档见对话与下文结构，尚未实现界面代码。
- 新增：使用 **Expo SDK 54 + React Native 0.81 + expo-router 6 + TypeScript** 搭建可运行客户端骨架；实现登录/登出、账户激活、中英切换（AsyncStorage 持久化）、我的排班与店铺排班（店长 demo）、请假/调班申请列表与新建、打卡时间线（演示）、个人信息编辑、修改密码（演示校验）；主题色白底蓝点缀。
- 说明：**iOS / Android** 通过 Expo/React Native 官方链路构建；**鸿蒙（HarmonyOS NEXT）** 无 Expo 一等支持，可选路径包括（1）华为 **React Native for OpenHarmony（RNOH）** 迁移原生模块与打包；（2）若设备兼容 **Android 应用运行环境**，可尝试分发 Android 构建（视区域与机型策略而定）。详见项目内运行方式：`npm start` → Expo Go 或 `expo run:ios` / `expo run:android`。
- 工程：`babel.config.js`（expo-router/babel）、入口 `expo-router/entry`；删除模板 `App.tsx` / `index.ts`；新增 `expo-env.d.ts`。
- 修复：Metro 报错 `Cannot find module 'babel-preset-expo'`——在顶层 `devDependencies` 显式安装 `babel-preset-expo@~54.0.10`（与 Expo SDK 54 一致），以便 Babel 从项目根解析预设；`npx expo install babel-preset-expo` 若遇 `react` / `react-dom` peer 冲突可用 `npm install babel-preset-expo@~54.0.10 --save-dev --legacy-peer-deps`。
- 修复：排班页「店铺排班」对非店长账号使用了 `Pressable` 的 `disabled`，导致无法切换；改为所有账号均可切换至店铺视图，非店长显示 `storeSchedulePreviewNote` 说明横幅 + 演示列表；店长无横幅。
- 修复：iOS 底部 Home 指示条遮挡 Tab 文字——在 `(tabs)/_layout.tsx` 用 `useSafeAreaInsets()` 增加 `tabBarStyle.paddingBottom` / `minHeight`，去掉固定 `height: 60`。
- 优化：排班横向「每日」卡片增加信息密度——星期缩写（`weekdayAbbrList` 中英）、当日小圆点、班次数/休息/店铺在岗人数、我的排班下展示首段时段或「起点…+N」摘要；店铺模式增加班次带 `storeShiftBands`；卡片宽度约 100。
- 修复：排班日期键由 `toISOString()`（UTC）改为本地 `YYYY-MM-DD`（`toLocalDateKey`），避免「今天」圆点标在错误的星期；为圆点补充无障碍 `accessibilityLabel`（沿用 `today` 文案）。
- 修复：Babel 移除已弃用的 `expo-router/babel`（SDK 50+ 仅用 `babel-preset-expo`）；排班日期工具提取为 `src/utils/calendarDateKey.ts` 的 `calendarDateKey`，避免 Hermes/缓存下偶发 `toISO` 相关报错；若仍见旧包可 `npx expo start --clear`。
- 优化：排班横向日期条进入页面及切换周/选中日后自动 `scrollTo` 将当前选中日期大致居中可见；「今天」小圆点改为绿色（`colors.success`）。
- 优化：横向日期 chip 内展示当日全部班次（每段：**区域 / 班次 / 时段** 三行，最多 4 段，超出显示 `+N`）；店铺 mode 在员工名下同样三行；chip 宽度 140、滚动步长同步更新。
- 优化：日期 chip 内班次与时段文字水平居中（`textAlign` + `alignItems`）。
- 数据与展示：排班单元统一为 `ScheduleSlot`（`region` + `shiftKey` + `range`，店铺含 `staffName`）；演示区域键 `regionFoH` / `regionBoH` / `regionWhs`；横向 chip 与下方列表/卡片均按「区域、班次、员工（店铺）」展示（曾有一段控件下 `scheduleModelHint` 说明，已移除）。
- 优化：区域与班次由同一行「A · B」改为**分多行**（chip 内为**区域、班次、时段三行**；店铺列表、我的详情卡片仍为区域/班次/时间结构）。
- 样式：横向 chip 内**区域**行字色与**班次**行一致（均用正文色 / 选中为 `primaryDark`）。
- 样式：「我的排班」下方卡片**时段**置顶大号强调（`cardTimeHero`）；**区域 / 班次**为小标签 + 灰色弱文本（`cardMetaLbl` / `cardMetaVal`）。
- 修复：排班页整体包一层纵向 `ScrollView`，去掉 `panel` 的 `flex: 1` 占位，使「我的排班 / 店铺排班」列表可向下滚完整；横向日期条设置 `nestedScrollEnabled`；底部 `paddingBottom` 含安全区，避免被 Tab 遮挡。
- 说明：**未改动** `dayChip` 等 chip 的尺寸与样式；横向日期区域外包 `daysRowWrap`（`flexShrink: 0`），避免嵌套在纵向 `ScrollView` 时挤压 chip 自然高度；仅实现整页纵向滚动。
- 调整：chip **高度**贴近最初观感——`paddingVertical`、日期行间距与 chip 内字号略收紧；横向日期 chip 内每条排班为 **3 行**：区域、班次、时段（**不**合并班次与时段）；店铺 chip 在员工名（若有）下同样为三行；横向 `daysRow` 上下 padding 略减。
- 调整：横向日期 chip **宽度**改为 **140**（对比 152 略窄、比 100 更宽，便于预览观感）；`DAY_CHIP_W` 与横向自动滚动步长已同步。
- 调整：横向日期 chip 每条班次 **区域 / 班次 / 时段** 各占一行（`chipShiftLine` / `chipTimeLine`），与下方详情字段一致。
- 调整：`dayChip` 整卡高度目标约 **×1.6**（相对原先上下各 **16**、内部紧凑行距时「单日一段三行」参考高度），**仅**增大 `paddingVertical`（算得约 **62**）；**行内** `lineHeight`、`gap`、`marginTop` 等保持最初紧排版不变。
- 调整：横向日期条 `daysRow` 使用 `flexDirection: 'row'`、`alignItems: 'flex-start'`，**避免**各 day chip 被拉成同一高度导致短内容视觉上「竖直居中」；`dayChip` 增加 `justifyContent: 'flex-start'`，内容自顶向下排。
- 调整：day chip **内容左右居中**——相关 `Text` 恢复 **`textAlign: 'center'`**（`dayLabel`/`dayRestInChip`/`chipOverflow` 等补充 **`width: '100%'`**）；`dayChipTop` 恢复 **`justifyContent: 'center'`** 与行内 **`alignItems: 'center'`**；`chipShiftBlock`/`chipShiftRow` 为 **`alignItems: 'center'`**。**未改**各行 `lineHeight` / `fontSize` / 不对称上下 `padding`（仍贴顶）。
- 调整：day chip **内容贴最上沿**——用 **`paddingTop: 8`** + **`paddingBottom` = 原对称垂距总和 − `paddingTop`**（原 `paddingVertical≈62` 时总垂向内边距不变），空白集中在卡片**下半**，避免正文被对称 padding 顶在中间偏下。
- 调整：**「我的排班」** day chip 每组（区域/班次/时段）——`chipShiftRowMy` **`gap: 0`**、三行 **`lineHeight: 17`**，`chipShiftBlockMy` 组间 **`gap: 11`**。
- 调整：**我的 / 店铺** day chip 使用**同一固定外高**（`DAY_CHIP_FIXED_HEIGHT`≈**344**，`dayChipFixed`：`height` + `paddingBottom: 12`），与「我的」四组内容区算高一致；单日段数较少时下半留白。
- 调整：排班页**标题栏 + 我的/店铺段控件**移出纵向 `ScrollView`，仅**日期横滑条 + 下方详情**区域可上下滑；`pageHeader` 使用 `flexShrink: 0`。
- 调整：**店铺排班**改为 **日视图** 数据结构：`区域 → 多班次 → 每班次多名员工`（`StoreDayRegionGroup` / `STORE_DAY_ROSTER`）；下方按**区域卡片**展示班次行+员工胶囊，扁平 `flattenStoreSlotsForDay` 仍用于 day chip；新增 `storeDayRosterEmpty`、`storeChipNoAssignments` 文案。
- 调整：店铺排班模式下横向 **day chip** 仅展示 **区域 / 班次 / 时段**，不显示员工名；下方列表仍显示员工。
- 调整：店铺排班 **day chip** 与「我的排班」共用 **`chipShiftBlockMy` / `chipShiftRowMy`**——每段三行（区域、班次、时段）、同字号与组间距；每卡最多 **4** 段（与 `MAX_SHIFTS_PER_CHIP` 一致），去掉原先 **8px 单行**「区域·班次·时段」合并样式，减轻窄卡截断与固定高度下「又挤又空」的违和感。
- 多门店：会话用户支持 `stores[]` + `selectedStoreId`（`AuthContext`：`getActiveStore`、`setSelectedStore`、旧数据 `storeName` 迁移）；排班页标题区显示当前门店，多店时可打开 Modal 手动切换；切换日期时若当日「我的排班」含 `storeId` 则自动切到该店；店铺日视图按选中门店拆分；`profile` 显示当前门店名；i18n 增加 `storePickerTitle`；门店选择 Modal 使用半透明底 + 独立卡片层（避免误触关闭）。
- 排班页布局参考常见「Rosters」应用：顶栏为 **标题 + 选中日期（本地化长格式）+ 门店**；**周区间与年月**居中、两侧切周；**回到今天**（主按钮）与 **我的排班 / 店铺排班**（描边切换）；下方 **七日等宽**日期格（选中 **蓝底白字**），班次仅在下方面板展示；空状态为 **日历图标 + 文案**；移除原横向宽 chip 内嵌班次与顶部分段控件；删除未再使用的 `flattenStoreSlotsForDay`；新增 i18n `scheduleGoToday`、`scheduleViewStore`、`scheduleViewMy`。
- 排班日历：**有班日**在日期数字下方显示 **绿色圆点**（`dayHasWork`：我的模式看 `MY_SHIFTS`，店铺模式看当前门店日 roster）；选中/未选中均显示，保持格高对齐用占位条。
- 漏打卡申请（一天多时段）：`LeaveRequest` 增加 `missed_punch` + `missedPunch`（绑定 `workDate` + `slotIndex` + 区域/班次/计划时段 + 漏打 in/out + 实际时间）；演示排班提取至 `src/data/demoMyShifts.ts`；申请页新建时可选排班段；i18n 漏打卡文案。
- 申请入口方案 A：从底部 Tab 移除「申请」；`app/(main)/requests.tsx` 作为 Stack 子页（系统返回 + 标题栏「新建申请」）；排班页标题右侧 **「剪贴板图标 + 申请」** 描边按钮进入申请，**待审批数** 红色角标；底部 Tab 为 **排班 / 打卡 / 我的**。
- 打卡页左上角标题改为 **「打卡」**（复用 `tabClock`，不再使用「上下班打卡」）。
- 底部 Tab 移除「打卡」；打卡仅在排班班次卡片上操作。
- 登录页移除副标题「新西兰 · 澳大利亚 · 中国门店排班」及 `tagline` 文案。
- 登录页布局：顶区浅蓝氛围、内容垂直居中；品牌与表单合并为单卡片（图标 + Moni HR + 登录副标题 + 分隔线 + 表单）；演示说明移至卡片外信息条；账户激活链在卡片底部分隔线下方。
- 登录页右上角增加 **中 / En** 语言切换（`setLanguage`，与「我的」页一致并持久化）。
- API 对接（`http://3.80.125.254`）：`POST /api/v1/app/auth/login`（邮箱+密码）、`POST /api/v1/app/auth/logout`、`GET /api/v1/app/auth/me`（恢复会话）、`PUT /api/v1/app/auth/last-store`（切换门店）；`src/api/*` + `AuthContext` 存 JWT；请求头 `Authorization` + `X-Lang`；iOS/Android 允许 HTTP 明文。
- 排班页下拉刷新：调用 `refreshCurrentEmployee` → `GET /api/v1/app/auth/me`，更新姓名/邮箱/工号与 `storeDetails` 门店列表；若当前选中门店仍在列表中则保持选中。
- 登录页「记住我」：勾选且登录成功后邮箱/密码写入 `AsyncStorage`（`rememberLogin.ts`）；下次打开自动填充；取消勾选并登录成功则清除本地保存。
- `AppEmployeeUser.phone` 映射至个人信息；个人页摘要展示手机号；下拉刷新 `GET /api/v1/app/auth/me` 同步员工/门店/邮箱/手机（`refreshCurrentEmployee`）。
- 修复：退出登录不再 `router.replace('/login')`，仅 `logout()` 清会话，由 `(main)/_layout` 统一 `Redirect`，避免登录页跳转两次。
- 样式：排班页切换门店按钮——店名与下拉箭头统一行高、图标容器居中，修正 Android 上未对齐问题。
- 登录/me 员工对象增加职位双语字段：`AppEmployeeUser.roleTitleZh` / `roleTitleEn`（及可选 `storeManager`）；兼容 `role_title_zh` / `role_title_en` / `store_manager`。`User` 同步 `roleTitleZh` / `roleTitleEn`；`mapApiRoleToUserRole` 优先 `storeManager`，否则弱推断店长。个人页「角色」按当前 App 语言 `getUserRoleTitle`，无接口文案时回退 `roleStaff` / `roleManager`。
- 登录/me：`storeManagerStores`、`deputyManagerStores` 映射为 `User.managedStoreIds`；仅当**当前选中门店**在该列表中时显示「店铺排班」切换；`role` 按 Apifox 使用 `code` / `nameZh` / `nameEn`（职位展示，与门店管理权限分离）。
- 登录/me 的 **`role`** 字段：支持字符串或对象（`zh`/`en`、`nameZh`/`nameEn`、`titleZh`/`titleEn`、`name`/`title`/`label` 等）；归一化时 **优先** 写入 `roleTitleZh`/`roleTitleEn`，个人页展示与店长推断均会用到。
- 修改密码：对接 `PUT /api/v1/app/auth/password`（`currentPassword` / `newPassword`，Bearer + `X-Lang`）；成功提示与「记住我」本地密码同步（同邮箱时）。
- 打卡：`POST /api/v1/app/clock/punch`（Bearer + `X-Store-Id`）；`publishedCellId` 为排班格子 id；`deviceType`/`deviceId` 来自 `expo-constants`；定位 `expo-location`；成功后用 `punchedAt` 更新本地班次打卡状态；围栏外/代打卡提示可选 Alert；`app.json` 增加 `expo-location` 插件与用途说明；班次卡片时间窗与接口一致（上班：开始前 10 分钟至下班；下班：结束后 20 分钟内）。
- 全局 **401**：`apiRequest` 识别 HTTP/body `code` 401；已带 Token 时先按当前语言弹窗「登录已失效」（`sessionExpiredAlert` + i18n），用户点确定后清除会话并跳转登录；登录页本身不单独校验 Token；冷启动 `me` 401 同样弹窗后清会话。
- 排班「我的排班」：每条班次卡片内嵌状态、上班/下班打卡、申请（漏打卡/调班/请假）；顶栏改为「申请记录」；申请页支持路由参数预填班次；打卡 Tab 改为今日班次汇总 + 跳转排班。
- 班次卡片：打卡与申请按钮移至卡片**右侧**纵向排列，左侧为时段/区域/班次/状态。
- 班次卡片内不再显示「今天」角标（日期已在顶栏/日历选中体现）。
- 排班页「我的排班」卡片：去掉接口 `color` 字段渲染的左侧色条（易显示为黄边，与 App 白底蓝点缀风格不一致）。
- 排班页「我的排班」对接 `GET /api/v1/app/schedule/published`：请求头 `Authorization`、`X-Lang`、`X-Store-Id`（当前选中门店）；Query `from`/`to` 为当前周周一至周日；按 `date_str` 分组展示区域名、班次名、时段；切换周/门店、下拉刷新时重新拉取；店铺排班仍为演示数据。

## 2026-05-21

- 申请：移除调班类型；新建与班次卡片申请菜单仅保留「请假」「漏打卡」；演示数据去掉调班示例。
- 新建申请：请假开始/结束改为 `DateSelectField`（周历弹窗选日）；漏打卡工作日期同组件；实际打卡时间改为 `TimeSelectField`（时/分滚轮选择）；结束日期不得早于开始日期。
- 申请记录页：移除顶栏「新建申请」；仅保留列表；新建仍从排班班次「申请」进入（弹窗标题为请假/漏打卡，不再切换类型）。
- 请假申请：改为绑定排班时段（`RequestShiftBinding`），与漏打卡一致；取消开始/结束日期区间；表单展示班次日期（只读）+ 可选排班段 + 事由。
- 请假申请：支持一次勾选**多天、多段**排班（按周加载排班、复选框多选）；`shifts[]` 存储；列表展示日期跨度与各段明细；漏打卡仍为单段。

- 打卡记录：对接 `GET /api/v1/app/clock/punches?date=yyyy-MM-dd`（Bearer + `X-Store-Id`）；`mapPunchesByPublishedCell` 按 `publishedCellId` 聚合 `clock_in`/`clock_out`；`refreshShiftPunchesForDate` 写入班次打卡状态；排班页切换日期/门店、下拉刷新、打卡成功后拉取当日记录驱动 `MyShiftCard` 状态与按钮；切换门店清空本地打卡缓存。
- 打卡记录页：`/(main)/punch-records`（排班顶栏「打卡记录」入口，携带当前选中日期）；周/日切换、下拉刷新；**按班次分组**展示（区域·班次·时段 + 上班/下班两行）；有排班无打卡显示「未上班/未下班打卡」；仅有打卡无排班仍单独成组；`buildShiftPunchGroups` 聚合逻辑。
- 打卡记录：已打卡的下班行改为绿色高亮（与上班蓝色区分）；`punchType` 归一化支持 `clock-out` 等写法。

## 2026-05-20

- 修改密码页：补充 `loadRememberLogin` / `saveRememberLogin` 导入；移除未使用的 `hint` 样式。
- i18n：新增 `passwordFieldsRequired`、`passwordMismatch`、`passwordChangeFailed`；`passwordUpdated` 去掉「演示」表述（中英）。
- 修改密码页返回按钮：iOS 默认取上一屏路由段名 `(tabs)`；在 `change-password` 设置 `headerBackTitle: profileTitle`（与「我的」页标题「个人信息」/ Profile 一致），与申请页 `headerBackTitle: tabSchedule` 做法相同。
- 打卡时间 UI：新增 `serverClock`（HTTP `Date` 头 + `performance.now` 锚点推算「当前」），减轻用户改手机系统时间导致的「今天」与打卡按钮时间窗误判；`apiRequest` 在收到响应后同步；打卡成功再用 `punchedAt` 校准；排班页 `todayIso` /「今天」跳转、班次卡片 `getShiftCardActions`、申请页默认日期使用该推算时间。无锚点前仍用本机时间；若网关不返回 `Date` 头则依赖首次成功响应或打卡结果校准。
- 本机时间校验：同步服务器时间时若 `|server - Date.now()| ≥ 2 分钟`，本会话内弹窗一次（`deviceClockSkew*` i18n），建议用户开启系统自动时间；登出 / 清会话时 `resetServerClockState` 重置锚点与提示标记。与「门店时区」无关（比较的是 UTC 绝对时刻）；门店当地展示仍依赖接口时区字段（若有）。

## 2026-05-21

- 请假多选 UI（`requests.tsx`）：去掉整周纵向 checkbox 列表，改为与排班页一致的交互——顶部已选摘要条（可「清空」）、周导航（`3 – 9` + 年月）、七日等宽日期条（蓝底选中、已选数量角标、有班绿点）、下方仅展示**当前选中日期**的班次卡片（时段大号 + 区域/班次 + 圆形勾选）；单日支持「全选当日 / 取消当日」。i18n：`leaveClearSelection`、`leaveSelectAllDay`、`leaveClearDay`。
- 排班打卡提示：`AuthContext` 增加 `isShiftPunchDateLoaded`（按日标记接口是否已成功返回）；`getShiftCardActions` 在今日/过去日未拉取打卡前 `showStatus: false` 且不展示上/下班按钮、不强调漏打卡；`MyShiftCard` 仅在 `showStatus` 时渲染提示条，避免先闪「打卡不完整」。
- 漏打卡时间选择：`TimeSelectField` 改为点击后底部弹窗 + 自研时/分滚轮（`ScrollView` 吸附，不依赖 `@react-native-community/datetimepicker`）；切换上班/下班时默认对齐排班开始/结束（`hmFromShiftRange`、`wheelAnchor`）。
- 排班班次卡片：上/下班打卡均已完成时隐藏「申请」按钮（`getShiftCardActions` `showApply: false`）；未来日期仍可申请请假。
- `MyShiftCard` 打卡状态提示：`statusRow` 使用 `alignSelf: 'flex-start'`，背景宽度随文案收缩；长文案仍在卡片宽度内换行。
- 新建漏打卡弹窗：移除标题「漏打卡」下方的 `missedPunchHint` 说明文字。
- 请假/漏打卡弹层：点击上方半透明背景可关闭（`modalBackdropTap`）。
- 请假/漏打卡弹层：表单可滚动、取消/提交按钮固定在白色面板底部，去掉 ScrollView 下方灰色空白与按钮割裂感。
- 请假弹层：移除「已选 N 段班」下方的 `leaveMultiHint` 说明文字。
- 修改密码：按 Apifox 修正为 `PUT /api/v1/app/auth/password`，请求体字段 `currentPassword` + `newPassword`（原误用 POST `/change-password` 与 `oldPassword`）。
- 修改密码页：提交前校验新密码不少于 8 位（`passwordMinLength`）。
- 请假：仅选 **1 段**排班时可选「整段班次 / 部分时段」；部分时段用起止时间选择（须在排班时间内），便于中途提前离开；`LeaveRequest.leaveTime`；申请列表展示时段。
- 请假弹层：移除部分时段「结束时间」下方的说明文字（`leavePartialHint`）。
- 请假弹层：部分时段「开始 / 结束时间」改为一行并排展示。
- 申请记录：当前门店**店长**或满足条件的**副店长**（无店长任职或有待审批）显示「审批记录 / 申请记录」分栏；审批列表可通过/驳回；普通员工仅看本人申请；`LeaveRequest` 增加 `applicantId` / `storeId`；排班页角标改为待审批数量（管理者）。
- 考勤申请对接 Apifox AppAttendance：`GET/POST /api/v1/app/attendance/requests`、`GET pending-approval`、`POST {id}/review`；`src/api/attendance.ts`、`mapAttendanceRequest.ts`；提交请假/漏打卡、列表刷新、审批；移除本地演示申请数据。
- 副店长审批分栏：`storeHasStoreManager`（`storeDetails` / 考勤列表）；有店长时仅当存在待审批或已审批记录才显示「审批记录」，无店长时始终显示；否则仅「申请记录」。
- 考勤查询接口对齐 Apifox：漏打卡返回 `scheduleDate`、`shiftStartTime`、`shiftEndTime`；请假子项 `leaveEffect`（full/late_in/early_out）；列表用排班缓存补全区域/班次名。
- 提交考勤申请：未填原因不再提交占位符「—」，改为必填校验；提交按钮在未填原因时禁用。
- 请假弹层：换日期点班次时仅 1 段已选则替换原日期（避免误选 2 段导致请假时段消失）；周切换清空选择；清理失效排班 key。
- 请假弹层「继续」：未选班次时不可点；原因改提交时校验；未选班次时时段预览用当天第一个班次；切换日期同步该时段。
- 申请弹层主按钮文案：`继续`/`Continue` 改为 `提交`/`Submit`。
- 同日多班请假：支持每班次单独部分时段（默认 1 小时），一次提交多条 `leaveItems`；跨天多选仍为整段。
- 请假弹层：取消底部统一时段区；每班次卡片内选整段/部分，整段不显示时间，可混选整段+部分。
- 请假/漏打卡申请改为独立 Stack 页 `request-create`；`requests` 仅保留申请列表与审批。
- 部分时段默认改为班次起止时间；切换日期后保留各班次已设请假时间（`partialLeaveByKey` 不随聚焦日重置）。
- 申请记录页：Tab 并入列表，页头以下整屏可下拉刷新；去掉刷新时「正在加载」文字，仅保留转圈。
- 请假申请：展示班次打卡时间；上下班打卡已覆盖计划时段的班次不可选（`shiftLeaveEligibility`）。
- 覆盖判断：上班打卡允许相对计划开始迟到 30 分钟内仍视为已覆盖（`LATE_CLOCK_IN_GRACE_MINUTES`）。
- 请假申请：切换日期选班改为累加保留，不再因跨日点选而清空此前已选日期。
- `TimeSelectField`：滚轮仅在打开时同步 scrollTo，修复反复滑动卡顿与确定按钮无法点击。
- `TimeSelectField`：移除 sheet 上 `onStartShouldSetResponder`（会拦截滚轮触摸）；滚轮列用 `localIndex` + 松手后再同步父状态，恢复可滑动。
- `TimeSelectField`：滚轮改为 `FlatList` + 仅惯性结束更新草稿；去掉滚动中 `setState`/`scrollTo` 对抗；遮罩 `absoluteFill` + 底部 sheet 分层，修复卡顿与确定/取消不可点。
- 新建申请页：请假/漏打卡原因改为选填（去掉提交前必填校验）；`KeyboardAvoidingView` + 键盘内边距与聚焦时滚到底部，避免输入原因时键盘遮挡。
- 新建申请页：原因标签恢复为「原因」，不再显示「选填」字样。
- 新建申请页：去掉 `KeyboardAvoidingView` 与聚焦 `scrollToEnd`，修复点原因输入后表单被顶没、只剩底部按钮；`ScrollView` 用 `flex:1` + `automaticallyAdjustKeyboardInsets`；Android 配置 `softwareKeyboardLayoutMode: resize`。
- 新建申请页：聚焦原因时按键盘高度计算滚动偏移，使原因输入框完整露在键盘与底部按钮之上。
- 依赖：移除未安装且未使用的 `@react-native-community/datetimepicker`，修复 `expo start` 报错。
- 漏打卡：同一日期、同一排班班次、同一漏打类型（上班/下班）在待审批或已通过时不可重复申请；被拒绝后可再申请（`missedPunchEligibility` + `request-create` 校验）。
- 请假/漏打卡原因：提交时 `normalizeSubmitReason` 过滤空内容与 `…` 占位；原因输入框去掉 `…` placeholder，未填则不提交占位字符。
- 排班卡片：该班次上班、下班漏打卡均已有待审批/已通过申请时，申请菜单不再显示「漏打卡」（仍可请假）；`isMissedPunchFullyBlockedForShift`。
- 请假：若待审批/已通过的上下班漏打卡申请时间覆盖计划班次（规则同实打卡覆盖），不可再请该班假；排班卡隐藏「请假」入口。
- 排班卡：已提交上下班漏打卡申请后，状态改为「漏打卡申请已提交，等待审批」，不再提示「打卡不完整，请提交漏打卡申请」。
- 请假：同一班次已有待审批/已通过请假（含整段）时不可重复申请；排班卡显示「请假申请已提交，等待审批」并隐藏请假入口。
- 漏打卡：该班次已有待审批/已通过的全时段请假时，不可再提交漏打卡申请。
- 申请记录：新增详情页 `request-detail`，对接 `GET /api/v1/app/attendance/requests/{id}`；列表卡片可点击进入；审批入口保留底部通过/驳回。
- 申请撤回：详情页（本人申请、待审批）可调用 `POST /api/v1/app/attendance/requests/{id}/cancel`；状态 `cancelled` 展示为「已撤回」。
- 排班页顶栏：打卡/申请入口移至标题下方并排双按钮，保留完整「打卡记录/申请记录」文案，避免与标题抢宽被截断。
- 排班页顶栏：入口改为轻量文字链接（图标+完整文案+箭头），去掉大按钮样式。
- 审批申请：通过/驳回均需填写 `reviewComment`；`AttendanceReviewPrompt` 底部弹窗（iOS/Android）；`AuthContext` 提交前校验非空；申请列表与详情页共用。
- 新建申请页：键盘弹出时原因输入不被遮挡——`KeyboardAvoidingView`（iOS）+ 底部栏随键盘上移（Android edge-to-edge）+ 滚动区底部留白随键盘增高。
- 修复：Android 新建申请写原因时键盘展开白屏——去掉底栏 `marginBottom` 与过大 `paddingBottom`/`scrollToEnd`；Android 依赖 `resize` 缩窗，改为滚到原因区域坐标。
- 修复：Android 写原因仍被键盘遮挡——edge-to-edge 下检测是否已 resize；未缩窗时底栏 `marginBottom` 随键盘抬高，并按可视高度滚动原因入屏（不把键盘高度叠进 content padding）。
- 新建申请页键盘（Expo Go 可用）：移除 `keyboard-controller`/`reanimated`（Expo Go 无原生模块会崩溃）；Android 底栏 `position:absolute` + `bottom:键盘高度`，iOS `KeyboardAvoidingView`；聚焦原因时按可视高度滚动；`edgeToEdgeEnabled: false` 以利 `resize`。
- 新建申请 Android 键盘：取消仅抬高底栏；页面 `paddingBottom` 缩窗 + `measureInWindow` 将原因输入滚到键盘与底栏之上。
- 新建申请 Android 键盘：底栏可被输入法覆盖；仅滚动使原因输入框露在键盘上方（iOS 仍避让底栏）。
- 应用从后台回到前台：`useRefreshOnAppForeground` 在屏幕聚焦时刷新当前页数据（排班/个人/申请列表/打卡记录/申请详情/新建申请）。
- 排班页：顶栏并入 `ScrollView`，下拉刷新区域覆盖标题至 Tab Bar 上方整页。
- 排班页 iOS：`ScrollView` 增加 `flexGrow:1`、`alwaysBounceVertical`，内容不足一屏时 Tab Bar 上方空白区也可下拉刷新。
- 日期本地化：Android `Intl` 中文月份/星期不可靠，改用 i18n 月份列表 + `localeDateFormat`（排班、打卡记录、新建请假周条）。
- 请假：班次已有上班或下班打卡，或有待审批/已通过的漏打卡申请时，不可选择整段班次请假（仍可部分时段请假）；`leaveRequestEligibility` + 新建申请页禁用整段选项并校验提交；i18n `leaveFullShiftBlocked`。
- 打卡：成功后仅提示「打卡成功」，不再向用户展示代打卡/围栏复核类后台标记；打卡记录页移除「设备待复核」「围栏外」标签。

## 2026-05-25

- 账户激活：对接 `POST /api/v1/app/auth/activation/send-code` 与 `POST /api/v1/app/auth/activation/activate`；激活页支持输入邮箱、发送验证码（60 秒频控倒计时）、4 位邮件验证码与登录密码（≥8 位）；激活成功后自动登录并跳转排班；`auth.ts` / `types.ts` / `AuthContext` / `activate.tsx` / i18n 同步更新。
- EAS Android 打包：修复 `Install dependencies` 阶段 `npm ci` 失败（`react` / `react-dom` peer 冲突）；补充 `expo-font`、`react-dom` 依赖并更新 `package-lock.json`。
- Android Release 无法访问 HTTP API：新增 `expo-build-properties`（`usesCleartextTraffic`）与 `plugins/withAndroidHttp.js`（`network_security_config.xml` + Manifest 明文流量配置）；需重新 `eas build` 生成 APK。
- 修复小米等小屏 Android 上 Stack 页（打卡记录、修改密码、申请记录等）标题与系统状态栏重叠：`(main)/_layout` 统一 `headerStatusBarHeight` + `stackSafeArea`；`app.json` / 根 `StatusBar` 关闭 Android 透明状态栏。
- 设计：新增 App Logo 草案 `assets/moni-hr-logo-icon.png`（蓝白科技风，M + 排班/考勤意象，与主题色 `#2563EB` 一致）。
- 班次匹配：排班重发布后 `publishedCellId` 会变；打卡/请假/漏打卡的**展示与互斥判断**改为按快照键 `t:workDate|startTime|endTime`（仅日期+计划时段）匹配；提交打卡/申请仍用**当前**格子 `publishedCellId`；`src/utils/shiftIdentity.ts` + `mapClockPunches`、eligibility、`getShiftPunch`、请假选班 key 等。
- 修复：`request-create.tsx` 同一作用域重复声明 `found` 导致 SyntaxError。
- 修复：新建请假选班同日多段相同 `08:00–14:00` 时 `t:` 键重复导致 React duplicate key；选班态改为 `cell:日期|publishedCellId`，业务匹配仍用 `shiftKey`（`t:`）。
- 修改：排班页当前班次若为「替班」（`isSubstitution`），不允许发起请假（隐藏请假入口）。
- UI：替班标签移至班次时间右侧显示（`MyShiftCard`）。
- 规则：当前班次在计划上/下班时刻之前不可提交漏打卡申请；排班卡隐藏漏打卡入口，新建申请页同步拦截（`shiftClockWindow` / `schedule.tsx` / `request-create.tsx`）。
- 修复：漏打卡须等**正常打卡窗口结束**后才可申请（上班窗口至班次结束、下班窗口至结束后 20 分钟）；提交时二次校验；支持 `HH:mm:ss` 时段解析。
- 修复 Android：路由 `workDate` 空串/数组导致被误判为历史日期而绕过时间校验；归一化 `normalizeDateKey`、时段解析增强、提交按钮 `onPress` 硬拦截、路由参数延迟到达时重新应用。
- UI：跨天夜班各段排班卡片/申请页改为显示**本段** `range`（如 `22:00–23:59` / `00:00–06:00`），不再合并为 `22:00–06:00`。
- 修复：`request-create` 路由参数 `useEffect` 无限 setState 导致 Maximum update depth exceeded；改为稳定 `routeParamsKey` + 仅值变化时更新 state。
- 修复 Android 请假闪退：路由参数去除 Unicode 时段/区域名（en-dash 等）；`InteractionManager` 延迟跳转；请假页加载完成前不清除已选班次；提交 payload 键对齐 `cell:` 键；`TimeSelectField` Android 禁用 `fontVariant`。

## 2026-06-29

- 服务端（moni-hr）：外勤同步店班不再在派单时写入 `linkedStoreShiftId`（`published_cell.id` 每次重发布会变）；打卡/汇总时按外勤与店班**时段重叠**动态匹配当前排班 cell，再写入店班打卡记录；派单仍保留 `syncStoreClockIn/Out` 开关与时间对齐校验（R1/R2）。
- 商家端（moni-hr-merchant）：派单/新建编辑外勤工单时支持勾选「同步店班上班/下班」；按员工店班与外勤时段重叠预览并校验；改派保留已有同步配置。
- **修复 send_task 分支 Android 打包失败**：`schedule.tsx` / `schedule-week.tsx` 已引用外勤组件与工具，但 `FieldJobRow.tsx`、`fieldJobsSchedule.ts`、`workPunch.ts` 未纳入 git 导致 Metro 无法解析；从历史会话恢复三份文件，并补全 `fetchWorkSummariesByDates`（周排班打卡 Hero 依赖完整 `TodayWorkSummary`）。
- **周排班移除顶部打卡 Hero**：`schedule-week.tsx` 去掉蓝色 `SchedulePunchHeroCard`；打卡仍保留在当日各班次卡片内，日排班页 Hero 不变。
- **修复 today 路由警告**：`(main)/_layout.tsx` 注册了不存在的 `today` Stack 页（外勤已并入日排班 `schedule.tsx`），移除该 `Stack.Screen` 声明。
- **修复外勤打卡 deviceType 为空**：`POST /api/v1/app/work/punch` 请求体补传 `deviceType`（与店班 `clock/punch` 一致，取自 `getPunchDevicePayload()`）。
- **外勤上班后 Hero 显示「服务中」**：服务端 `WAITING` 表示下一打卡点未到时间；若时间线已有外勤上班记录，蓝色 Hero 改为「服务中」并提示完成打卡时间，不再显示「等待 / 等待外勤任务可打卡时间」。
- **外勤行时间单行显示**：`FieldJobRow` 状态徽章移到类型标签行右侧，时间行独占整行宽度；用不换行空格连接起止时间，完整显示 `09:00 - 18:00` 且不换行、不截断。
- **外勤地址完整换行**：`FieldJobRow` 地址去掉 `numberOfLines` 限制，过长时自动换行显示全文。
- **外勤地址跳转导航**：点击外勤地址（有坐标或有效地址时）打开 Google 地图导航；Android 优先 `google.navigation`，否则回退 Google Maps 网页链接。
- **外勤客户电话**：`today-work-summary` 时间线返回 `customerPhone`；`FieldJobRow` 展示电话，点击调起系统拨号。
- **外勤地址/电话点击区域**：字号 14、浅蓝底按钮式行、最小高度 44pt，图标 18，更易点按。
- **外勤联系信息样式**：地址/电话改为标签+内容操作行（圆角图标、细分隔线、右侧箭头），保留大点击区域。
- **外勤联系信息与 Logo 对齐**：卡片改为上下结构，联系行 40px 图标列与顶部紫色外勤图标左对齐、间距一致。
- **外勤客户名紧跟时段**：`FieldJobRow` 第二行改为 `09:00 - 18:00 · 客户名`；无客户名时仅显示时间；状态徽章仍在首行右侧不变。
- **外勤配色降噪**：紫色改为低饱和灰蓝（`colors.field` / `fieldInk`）；导航/电话操作仍用 App 主色蓝。
- **外勤统一青绿色系**：车标、导航地址、电话图标均用 `field` / `fieldSoft` 青绿套色；类型标签与分组标题同步。
- **外勤改浅蓝色系**：`field` `#3B82F6`、`fieldSoft` `#EFF6FF`、`fieldInk` 与主色 `#2563EB` 一致；车标/地址/电话图标统一浅蓝套色。
- **外勤再调浅蓝 + 标题黑色**：图标色 `#60A5FA`、浅底 `#F0F9FF`；「外勤服务」类型标签与列表分组标题改回 `colors.text` 黑色。
- **店班 Logo 中间色阶**：新增 `colors.store` `#3B82F6`（Hero `#2563EB` > 店班 > 外勤 `#60A5FA`）；`TodayShiftRow` / `MyShiftCard` 上班钮同步。
- **外勤联系行去掉标签**：地址/电话行不再显示「服务地址」「客户电话」小字，仅保留图标与内容。
- **外勤联系行内边距**：地址/电话行补 `paddingLeft`，避免图标与左侧边框重叠。
- **商家端按日期请假仅显示日期**（`moni-hr-merchant`）：申请管理列表/详情对 `date_range` 请假只展示 `YYYY-MM-DD` 区间，接口日期规范化并与 App 一致推断 `leaveMode`。

## 2026-07-02（P1–P3 外勤联动补全）

- **P1 部分假 + 外勤**：`request-create` 选班/改部分时段时 debounce 预览外勤影响；展示 required/optional；提交仍确认 `acknowledgedFieldJobIds`；后端 `validatePartialLeaveFieldAcknowledgement`。
- **P2 按日期请假**：`date-leave-create` 提交前预览区间内外勤；后端 `previewDateRangeLeaveImpacts` / `persistDateRangeLeaveSubmission`；`FieldAttendanceLinkageService.listFieldJobsForEmployeeInRange`。
- **P3 独立外勤请假**：`leaveMode=field_job`；外勤卡片「申请请假」；`request-create` 外勤请假页；后端 `submitFieldJobLeave` + 单工单 impact。
- **版本 1.2.0**；`supportsLeaveFieldV2()`（P2/P3）；`leaveFieldImpact.ts` / `fieldLeaveEligibility.ts` 共享工具。

## 2026-07-02（班次请假 + 外勤联动 P0）

- **App 版本升至 1.1.0**（`app.json`、`package.json`），新增 **`clientCapability.supportsLeaveFieldV1()`**（阈值 1.1.0，与后端 `AppClientCapability` 一致）。
- **API 类型与映射**：`types.ts` 增加 `fieldImpacts`、`fieldDispositions`、`acknowledgedFieldJobIds`；`mapAttendanceRequest.ts` 详情映射上述字段；`attendance.ts` 新增 `previewLeaveFieldImpacts`。
- **请假创建**（`request-create.tsx`）：班次请假提交前调用预览接口；若有 `required` 外勤影响则弹窗确认，提交时携带 `acknowledgedFieldJobIds`。
- **请假审批**（`request-detail.tsx`）：展示外勤影响；审批通过时对须处置外勤选择「取消 / 改派」及接单人；低版本 App 禁用通过并提示升级；`AuthContext.reviewAttendanceRequest` 支持 `fieldDispositions`。
- **i18n**：中英文外勤联动相关文案。

- **商家端补齐请假外勤联动（Web）**：
  - **`moni-hr-merchant/src/lib/merchantApi.ts`**：增加 `fieldImpacts` / `fieldDispositions` 类型与映射；`leaveMode` 兼容 `field_job`；审批接口 `reviewAttendanceRequest` 支持提交 `fieldDispositions`。
  - **`moni-hr-merchant/src/pages/AttendanceRequests.tsx`**：申请详情展示「外勤影响」；若存在 `required` 外勤影响，审批通过前必须选择每单处置（取消/改派），改派需填写接单人 `merchantAdminId`。
  - **`moni-hr-merchant/src/i18n/locales.ts`**：补充外勤影响/处置相关中英文案。
- **商家端外勤请假展示**：
  - **`attendanceRequestDisplay.ts`**：新增 `isFieldLeaveRequest` 等辅助。
  - **`AttendanceRequests.tsx`**：列表类型标签/摘要列展示外勤客户、日期、计划时段；详情弹窗展示外勤工单信息；外勤请假审批须选取消/改派（下拉选人）。
  - **`locales.ts`**：`fieldLeave` / `fieldLeaveDetail` / `fieldLeaveDispositionHint` 等文案。
- **外勤请假审批处置（App + 后端）**：
  - **`LeaveFieldLinkageService`**：外勤请假提交落库 required impact；审批强制 `fieldDispositions`。
  - **`request-detail.tsx`**：外勤请假审批展示「外勤处置」并支持取消/改派选人。
- **商家端申请详情门店名称**：`moni-hr-merchant/AttendanceRequests.tsx` 详情门店优先显示名称，从 `storeNameById` 解析，不再显示 `storeId`。
- **店长/副店长审批权限**：本店店长/副店长可审批本店他人全部待审申请（不限指定审批人）；后端 `review`、App `canReviewAttendanceRequest` 已对齐；不能审批自己的申请。
- **申请列表**：移除卡片上的通过/驳回按钮，审批操作仅在详情页进行。
- **申请列表外勤信息**：外勤卡片标签列宽 64px，内容对齐且四字标签不换行。
- **申请详情撤回按钮误显**：`request-detail.tsx` 撤回仅对**申请人**展示。

## 2026-07-03

- **店铺排班展示外勤任务**：
  - 后端新增 **`GET /api/v1/app/schedule/store-field-jobs`**（店长/副店长，按周查询本店外勤工单及接单人）。
  - App **`schedule-week.tsx`** 店铺排班按**开始时间**混排店班与外勤；外勤起止时刻落在店班时段内则**嵌套**在对应班次卡片下（优先 `linkedStoreShiftId`），否则独立展示。
  - 新增 **`storeRosterTimeline.ts`**、**`mapStoreFieldJobs.ts`**、**`StoreFieldJobCard.tsx`**、**`fetchStorePublishedFieldJobs`**；**`mapStorePublishedSchedule`** 班次保留 **`cellIds`** 供外勤关联。
- **外勤请假撤回后按钮不恢复**：排班页返回时未刷新申请列表，且周排班未向 **`FieldJobRow`** 传入 **`myAttendanceRequests`**，导致仍按「有待审批假」隐藏按钮。已在 **`schedule.tsx`** / **`schedule-week.tsx`** 增加 **`useFocusEffect`** 刷新申请；**`fieldLeaveEligibility.ts`** 明确仅 **`pending`/`approved`** 占用、**`cancelled`** 可再次申请。
- **外勤请假支持过去日期**：**`canApplyFieldLeave`** 移除「外勤日期须 ≥ 今天」限制，已过去的外勤也可申请请假（仍受待审/已通过占用、后端工单状态约束）。
- **店班请假外勤影响展示优化**：新增 **`formatFieldImpact.ts`**、**`FieldImpactPreviewList`**；**`request-create`** 外勤影响改为卡片展示（服务日期、时段、重叠说明、须处置标签）；ISO 时间格式化为本地可读；**`full`/`partial`** 改为中文文案；申请详情 **`request-detail`** 同步优化。
- **部分请假外勤重叠误判**：店班 13:50–15:50、不在岗 13:50–14:00 却提示「外勤全程在请假时段内」。根因：后端 **`LeaveFieldLinkageService`** 按 `early_out` 把缺席算成 14:00–班次结束，与 App「不在岗时段」语义相反。已改为部分请假直接用 **`partialStartTime`–`partialEndTime`** 计算重叠。
- **外勤重叠文案**：`leaveFieldOverlapFull/Partial` 改为「外勤时间都在本次请假内」「外勤与本次请假时间部分重叠」，去掉「落在不在岗时段」等难懂表述。
- **外勤预览误按整段请假计算**：界面在不可整段请假时默认展示「部分时段」，但预览 API 仍可能按 `leaveScope=full` 发送，导致外勤 `14:05–15:05` 在请假 `13:50–14:00` 时被误判为完全重叠。新增 **`leaveScopeResolve.ts`** 统一有效请假范围；预览/提交共用 **`buildLeaveTimesByScheduleKey`**；无重叠外勤不再展示（**`visibleFieldImpacts`**）；后端预览过滤 `overlapType=none`。
- **修复 `isFullLeaveBlocked` 未定义**：`useCallback` 定义晚于 `useMemo`/`useEffect` 引用，运行时报 `is not a function`；已上移至 `focusedSlots` 之后。
- **外勤影响英文徽章换行**：`leaveFieldImpactRequired` 改为 `Requires approval`；徽章去掉 `maxWidth: 46%` 并设 `flexShrink: 0`，避免在 “at” 处断行。
