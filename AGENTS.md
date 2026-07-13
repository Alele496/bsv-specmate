# BSV 编码规范 + specmate 使用

## 开始编码前
npx specmate scan "你的任务描述"  → 了解设计陷阱和硬约束

## 写完代码后
npx specmate check bsv/*.bsv  → 编译前预检

## 编译失败时
specmate_guide(phase="on_error", input="<bsc错误输出>") → 获取修复建议 → 记录经验: specmate_resolve

## 不确定语法时
npx specmate example <关键词>  → 搜索 BSC 官方示例代码
