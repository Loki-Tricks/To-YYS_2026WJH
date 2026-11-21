<div align="center">

# 🎁 给 YYS：专属定制的 Python 修炼场 🎂

![To YYS](https://img.shields.io/badge/To-YYS-FF69B4?style=for-the-badge&logo=gift&logoColor=white)
![From WJH](https://img.shields.io/badge/From-WJH-007ACC?style=for-the-badge&logo=heart&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Web%20Pyodide-5F7F72?style=for-the-badge&logo=python&logoColor=white)

---

### 🚀 **点击下方专属链接，输入解锁暗号开启惊喜：**
👉 **[点击这里，开启我们的 Python 游乐场](https://loki-tricks.github.io/To-YYS_2026WJH/)** 👈
*(提示：使用你的名字首字母大写缩写 `YYS` 作为暗号解锁 🎁)*

---

</div>

## 🎨 关于这个学习平台

这不仅仅是一个题库，而是一份特别准备的生日惊喜。平台在底层集成了 **浏览器端 Python 编译引擎 (Pyodide)**，无需安装任何软件或配置复杂的 Python 环境，打开网页就可以直接编写、运行、验证 Python 代码。

为了让你在学习编程时感到轻松和舒适，整个系统融入了许多细节：
* **浅色与深色主题**：工作区采用雾灰底色和灰紫强调色，代码编辑器会随界面一起切换。
* 🔊 **动态声效反馈**：过关时有欢快的和弦，出错时有低沉的提示音，支持全局静音。
* 🎉 **Canvas 粒子烟花**：每通关一个关卡，屏幕上都会燃放绚丽的庆祝彩屑。
* 📖 **课程工作区**：章节目录跟随当前关卡。桌面并排显示任务、讲解和编辑器。窄屏可切换「目录」「读题」「写代码」。参考答案支持在练习中对照查看。
* ⚡ **多重 CDN 自动切换**：内置多组国内外加速镜像节点，即使本地加载受到浏览器安全策略（如 CORS）限制，系统也会在几秒内自动感知并无缝切换至在线 CDN。

---

## 🎮 我们的修炼路线 (100 个趣味关卡)

关卡难度呈温和的螺旋形上升，从第一行 `print` 开始，一直到能够编写具有数据库、命令行和 API 的独立小项目：

| 阶段 | 关卡 | 练习内容 |
| --- | --- | --- |
| 1 · 启程 | 1–5 | 输出、变量、运算、类型转换与字符串 |
| 2 · 分支与循环 | 6–9 | 条件、循环与流程控制 |
| 3 · 数据结构 | 10–15 | 列表、字典、集合与遍历 |
| 4 · 函数与模块 | 16–20 | 函数、作用域、模块与排序 |
| 5 · 实战炼金 | 21–30 | 文件、异常、类与学生管理系统 |
| 6 · 工程化与调试 | 31–40 | 项目结构、日志、断言、类型与配置 |
| 7 · 数据文件处理 | 41–50 | CSV、JSONL、文件批处理与数据流水线 |
| 8 · 命令行工具 | 51–60 | 参数解析、命令分发与通讯录 |
| 9 · Web 与 API | 61–70 | 路由、表单、分页与模拟 API |
| 10 · SQLite 数据库 | 71–80 | SQL、事务、迁移与图书馆数据库 |
| 11 · 软件设计与测试 | 81–90 | 单元测试、依赖注入、异常与服务层 |
| 12 · 综合项目 | 91–100 | 记账本、日志分析、静态页面与个人项目规划 |

## 💻 本地运行

在项目目录中启动本地服务，再打开 [修炼场](http://localhost:8000/)。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

课程讲解、Monaco 编辑器及其 Python 高亮、Python 运行时和 SQLite 包均随仓库提供。断开外网也可以通过本地服务完成课程。页面先提供基础编辑器，Monaco 就绪后会接续已有代码。双击打开 `index.html` 时，部分浏览器会限制本地文件读取，运行 Python 可能需要访问 CDN。

每关的代码草稿和标准输入、当前关卡、通关记录、解锁状态、主题和音效设置保存在当前浏览器中。每次运行或提交都会启动独立解释器，练习生成的文件只在该次执行期间有效。可以按 ⌘+Enter（Windows 使用 Ctrl+Enter）运行代码，也可以点击「停止运行」结束循环。解释器就绪后，每次执行限时 30 秒。

## 项目结构

- `app.js` 负责选关、页面导航、运行反馈和弹窗。课程内容与评判规则位于 `lessons.js` 和 `advanced_lessons.js`。
- `ui/learning-store.js` 统一读写学习进度、每关草稿和偏好，并兼容原有浏览器存储键。
- `ui/code-editor.js` 封装基础编辑器与 Monaco 的切换、快捷键和主题。
- `ui/python-runner.js` 管理运行请求、取消、超时与资源重试。通过 HTTP 打开时，`python-worker.js` 在独立线程调用 `runtime.js`，提交验证时才在该线程加载题库。

## 维护与验证

- 如果运行时文件缺失或损坏，运行 `python3 download_pyodide.py`。脚本逐个核对 SHA-256 并恢复所需文件。
- 快速检查题库字段、编号和答案语法，运行 `node scripts/validate_lessons.js`。
- 验证真实判题，运行 `node scripts/validate_lessons.js --runtime`。这个模式还会为每关启动独立的 Pyodide 进程，检查空答案被拒绝、参考答案能通过。测试使用本地资源，需要 Node.js 和 Python 3。

- 在 macOS 上运行 `python3 scripts/test_safari.py` 可用系统 Safari 验证离线启动、编辑器和全部 100 关。测试在临时本地端口进行，使用独立的学习进度。

---

<div align="center">

✨ **祝你在这个 Python 游乐场里玩得开心！** ✨
Designed with ❤️ by WJH

</div>
