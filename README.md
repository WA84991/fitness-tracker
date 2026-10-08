# 健身记录 🏋️

一个离线优先的个人健身记录 PWA：记录训练组数与动作、组间休息计时、历史日历、力量曲线图表、训练计划模板。数据保存在手机浏览器本地，完全离线可用。

## 功能

- 📋 **训练记录**：内置 36 个常见动作（力量 + 有氧），支持自定义动作；逐组记录重量 × 次数（可标热身组/力竭组）
- ⏱ **休息计时器**：完成一组自动倒计时，结束蜂鸣 + 震动 + 通知提醒
- 📅 **历史日历**：训练热力图，点击任意日期查看详情
- 📈 **图表**：训练容量趋势、各动作估算 1RM 力量曲线（Epley 公式）、有氧距离/配速趋势
- 🗓️ **训练计划**：内置推拉腿示例计划，支持自定义计划，按计划训练自动预填动作与目标
- 💾 **数据备份**：一键导出/导入 JSON，换手机不丢数据

## 使用

直接部署到静态托管（如 GitHub Pages）后，用手机浏览器打开，选择「添加到主屏幕」即可像原生 App 一样使用。

本地预览：在项目目录运行任意静态服务器，例如：

```bash
python -m http.server 8080
# 然后浏览器打开 http://localhost:8080
```

## 部署到 GitHub Pages

```bash
# 1. 在 GitHub 网页上新建仓库 fitness-tracker（Public）
# 2. 推送代码
git init
git add .
git commit -m "健身记录 PWA 初始版本"
git branch -M main
git remote add origin https://github.com/<你的用户名>/fitness-tracker.git
git push -u origin main
# 3. 仓库 Settings → Pages → Source: main 分支 / root → Save
# 4. 等待 1-2 分钟，访问 https://<你的用户名>.github.io/fitness-tracker/
```

## 发布新版本

1. 修改代码
2. **把 `sw.js` 顶部的 `CACHE_VERSION` 加一**（如 `fitness-v1.0.0` → `fitness-v1.0.1`），同时更新 `js/ui/views2.js` 里的 `APP_VERSION`
3. push 后，用户下次打开应用会出现「发现新版本」提示，点击立即刷新即可

## 注意事项

- 数据只存在手机浏览器的 IndexedDB 中：**清除浏览器数据 = 清空所有记录**，请定期在「设置 → 数据备份」导出 JSON
- 安卓手机锁屏后浏览器可能被系统冻结，休息计时器的提醒可能延迟到解锁才出现（网页应用平台限制）。训练时建议保持屏幕常亮
- 通知权限需要在「设置 → 通知」中手动开启（浏览器要求用户手势触发）

## 技术栈

纯 HTML/CSS/JS + ES Modules，零构建步骤。图表用 Chart.js（CDN，Service Worker 缓存后离线可用）。
