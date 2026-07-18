# BSV 编码规范 + specmate 使用

## 开始编码前
specmate_scan({ task: "你的任务描述" })  → 了解设计陷阱和硬约束

## 写完代码后
specmate_check({ files: ["<绝对路径>"], full: true })  → 编译前预检

## 编译失败时
specmate_capture({ bsc_output: "<bsc完整输出>" }) → 记录错误
specmate_guide({ phase: "on_error", input: "<bsc错误输出>" }) → 获取修复建议
specmate_resolve({ code: "<错误码>", cause: "...", solution: "..." }) → 固化经验

## 批量诊断（一次编译产生多个错误）
specmate_diagnose({ bsc_output: "<bsc完整编译输出>" }) → 全量诊断所有错误码

## 不确定语法或结构时
specmate_analyze({ files: ["<绝对路径>"], question: "<问题>" }) → AST 深度分析

## 追踪 warning 变化
specmate_diff({ action: "snapshot", bsc_output: "<bsc输出>" }) → 保存基线
  → 修复代码 → 重新编译
specmate_diff({ action: "diff" }) → 对比 warning 变化
