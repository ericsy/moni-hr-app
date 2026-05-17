# moni-hr-app 变更日志

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
