// specmate 站点数据 — 更新 specmate 后只需改这个文件
// 改完后刷新浏览器就能看到变化，不需要进 index.html 改 HTML
const SITEDATA = {
  // ===== 统计数字 =====
  stats: {
    tools: 9,
    errors: 29,
    traps: 41,
    tests: 158,
  },

  // ===== MCP 工具列表 =====
  tools: [
    { name: "specmate_scan", file: "specmate_guide.mjs", status: "active", desc: "推荐统一入口，编码前调用", phase: "编码前", star: true },
    { name: "specmate_guide", file: "specmate_guide.mjs", status: "active", desc: "分阶段指导（pre_code / on_error / continue / pattern）", phase: "全周期" },
    { name: "specmate_check", file: "check_style.mjs", status: "active", desc: "静态检查 + 可选 compile=true 集成 BSC", phase: "编码后" },
    { name: "specmate_diagnose", file: "specmate_diagnose.mjs", status: "active", desc: "编译后全量诊断", phase: "编译后" },
    { name: "specmate_capture", file: "server 内联", status: "active", desc: "编译报错自动入库", phase: "编译后" },
    { name: "specmate_resolve", file: "server 内联", status: "active", desc: "修复后固化根因和方案", phase: "修复后" },
    { name: "specmate_analyze", file: "ast_query.mjs", status: "active", desc: "深度 AST 分析（调度/冲突/依赖）", phase: "深度分析" },
    { name: "specmate_diff", file: "server 内联 + warning_diff.mjs", status: "active", desc: "编译变化追踪", phase: "编译后" },
    { name: "specmate_learn", file: "specmate_learn.mjs (53B 空壳)", status: "deprecated", desc: "被 capture + resolve 替代", phase: "—" },
    { name: "add_error", file: "add_error.mjs", status: "cli", desc: "保留用于 db:seed 脚本", phase: "—" },
    { name: "specmate_report", file: "server.mjs", status: "active", desc: "跨 session 高级分析报告：错误趋势、文件热点、知识库健康度", phase: "定期回顾" },
  ],

  // ===== 知识陷阱展示 =====
  traps: [
    {
      code: "P0030",
      title: "多子模块调度冲突",
      severity: "critical",
      desc: "多个 module 实例同时响应同一 rule，隐式调度导致死锁或饥饿。BSC 不报错但行为错误。",
    },
    {
      code: "G0004",
      title: "寄存器写后写（WAW）",
      severity: "critical",
      desc: "同一 rule 内多次写入同一寄存器，后一次覆盖前一次，行为非预期。",
    },
    {
      code: "G0053",
      title: "interface Bool 返回",
      severity: "warning",
      desc: "interface 方法返回 Bool 类型在 BSV 中有二义性，编译通过但语义错误。",
    },
  ],

  // ===== SPECMATE_LEVEL 模式 =====
  modes: [
    {
      name: "verify",
      label: "轻松模式",
      desc: "只做扫描和检查，不主动干预。适合 CI 环境集成。",
      features: ["自动扫描", "静态检查", "不弹询问"],
      current: false,
    },
    {
      name: "develop",
      label: "均衡模式",
      desc: "在关键决策点主动询问。适合日常开发使用。",
      features: ["主动询问", "编译集成", "知识积累"],
      current: true,
    },
    {
      name: "tapeout",
      label: "严格模式",
      desc: "每步都确认，不放过任何警告。适合流片前的最终检查。",
      features: ["全量检查", "逐项确认", "零容忍"],
      current: false,
    },
  ],

  // ===== 路线图 =====
  roadmap: {
    done: {
      label: "Q3 2026 · 已完成",
      items: [
        "BSC 编译集成（check(compile=true)）",
        "confidence 置信度系统（19 条规则分级）",
        "自动 resolve（编译通过 → 归档 capture）",
        "自动聚类（跨 session 错误 → 知识条目草稿）",
        "跨 session 热点追踪（文件历史错误 TOP 3）",
        "P0200 自动修复（BVI schedule 展开）",
        "Elicitation 主动询问（设计阶段推断）",
      ],
    },
    planned: {
      label: "Q4 2026 · 规划中",
      items: [
        "跨 session 高级分析（错误趋势、团队热点）",
        "Web Dashboard（可视化知识增长）",
        "多项目知识迁移（跨仓库错误方案共享）",
        "BSC 版本兼容矩阵",
      ],
    },
  },

  // ===== 受众入口 =====
  audience: [
    {
      icon: "&#x1F4BB;",
      title: "我是 BSV 开发者",
      desc: "安装 specmate，让 AI 助手帮你扫描陷阱、诊断编译错误、自动修复常见问题。",
      cta: "了解 MCP 工具",
      href: "#capabilities",
    },
    {
      icon: "&#x1F916;",
      title: "我是 Agent 模板作者",
      desc: "将 8 个 MCP 工具集成到你的 Agent 模板中，让 AI 编码助手获得 BSV 领域知识。",
      cta: "查看工具文档",
      href: "#capabilities",
    },
    {
      icon: "&#x1F4D6;",
      title: "我想了解源码",
      desc: "specmate 完全开源。查看源码、贡献知识条目、改进检查规则。",
      cta: "GitHub 仓库 →",
      href: "https://github.com/alele496/bsv-specmate",
    },
  ],

  // ===== Hero 区 =====
  hero: {
    subtitle: "AI 编码助手编写 BSV 硬件设计的知识引擎——不是 linter，是陪练",
    analogy: "ESLint 之于 JavaScript，rust-analyzer 之于 Rust——specmate 之于 Bluespec SystemVerilog",
  },

  // ===== 定位陈述 =====
  whatIs: {
    left: [
      { title: "BSV 领域知识引擎", desc: "结构化存储 BSV 编码陷阱、编译错误模式、修复方案" },
      { title: "AI Agent 的编程伙伴", desc: "通过 MCP 协议与 AI 编码助手实时交互" },
      { title: "越用越强的知识系统", desc: "每次编译报错都被捕获、诊断、固化，知识持续增长" },
    ],
    right: [
      { title: "不是 BSC 的替代品", desc: "BSC 才是权威编译器，specmate 做的是 BSC 不做的语义陷阱和知识积累" },
      { title: "不是语法检查工具", desc: "快速正则扫描作为第一道防线，最终裁决交给 BSC 编译" },
      { title: "不是一次性工具", desc: "哪怕 specmate 停止更新，只要有人在用，知识库就在持续增长" },
    ],
  },

  // ===== 知识闭环亮点 =====
  knowledgeHighlights: [
    {
      title: "自动 Resolve",
      desc: "编译通过后自动归档上次 capture，不再依赖 Agent 手动调 resolve——经验不再丢失。",
    },
    {
      title: "自动聚类",
      desc: "同一未知错误跨 3+ session 出现 → 自动生成知识条目草稿，人工审核后入库。",
    },
  ],

  knowledgeFooter: "这就是 specmate 的护城河——代码分析精度会被追赶，但领域知识积累的时间壁垒无法复制。",
};
