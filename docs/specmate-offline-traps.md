# specmate 离线陷阱清单

> 当 MCP 服务器（`http://127.0.0.1:9339/mcp`）因安全分类器故障不可用时，直接读此文件。
> 此文件包含 specmate 知识库中最关键的编译硬约束，覆盖 80% 的 BSV 新手错误。

---

## 通用编译硬约束（UNIVERSAL_TRAPS — hard 级）

这些规则对所有 BSV 代码生效，不遵守就会编译报错：

1. **P0030 — function 内 return 只能在末尾**：function 内不可在 for/if/while/case 块中间 return。需要提前退出的场景用 flag 变量 + 末尾 return。

2. **P0005 — function 是 V2K 保留字**：BSV 模块内不要用 `function` 关键字定义函数。特别是 `genWith(function(Integer i); return requests[i]; endfunction)` 这种回调——用 `\\== (1)` 部分应用替代：
   ```bsv
   // 错误 —— function 关键字触发 P0005
   genWith(function(Integer i); return requests[i]; endfunction)

   // 正确 —— 部分应用
   genWith(requests[0] matches tagged Invalid ? requests : requests)
   // 或
   genWith(fromInteger)
   // 或
   findIndex(\== (1), reqVec)  // 等价于 findIndex(function Bool fn(Bit#(1) b) = b == 1; endfunction, reqVec)
   ```

3. **Bool vs Bit#(1) 区分**：Bool 用 `!`/`&&`/`||`，Bit#(n) 用 `~`/`&`/`|`。接口方法返回值用 `Bit#(1)` 不用 `Bool`。`{...}` 拼接不能含 Bool。

---

## 编码器/优先编码器 专项陷阱

（04-priority-encoder 实验高频踩坑）

1. **不要用 foldl 手工遍历** — 用 `findIndex` 标准库原语。findIndex 返回 `Maybe#(UInt#(n))`。

2. **\\== (1) 是部分应用语法** — `findIndex(\== (1), reqVec)` 而不是 `findIndex(function(x) = (x == 1), reqVec)`。

3. **索引用 UInt#(n) 不用 Integer** — 输出用 `pack(x)` 转 Bit。

4. **valid 信号用 Bit#(1) 不用 Bool** — 接口方法中统一用硬件类型。

5. **模块参数不可用于 mkReg 初始化** — 如 `mkReg(width_val)` 会触发 G0053，改用 `mkRegU` + 后续显式赋值。

6. **Vector 构造用 genWith** — `vec()` 在 BSC 2025.07 不可用。构造 Vector 用 `genWith(fromInteger)` 或 `replicate(init_val)`。

---

## 编码器正确骨架（findIndex 版本）

```bsv
import Vector::*;

// 优先编码器：找 req 中最低位为 1 的索引（bit 0 优先级最高）
function Bit#(TLog#(n)) priorityEncode(Bit#(n) req);
    Vector#(n, Bit#(1)) reqVec = unpack(pack(req));
    Maybe#(UInt#(TLog#(n))) m_idx = findIndex(
        \== (1),
        reqVec
    );
    return case (m_idx) matches
        tagged Valid .x: pack(x);
        tagged Invalid: 0;
    endcase;
endfunction
```

---

## 其他高频编译硬约束

- **G0004**：同一 rule 内每个寄存器只能写入一次（含 case 所有分支）。
- **G0005**：有 if/case 的模块加 `(* no_implicit_conditions *)` 属性。
- **G0053**：`mkReg(arg)` 的 arg 必须是编译期字面量（0, 1, `?`, maxBound），模块参数不算。
- **G0010**：跨 rule 数据传用 FIFOF 不用 Wire + Reg。
- **T0043**：`(* synthesize *)` 模块参数必须是 Bits 类具体类型（Bit#(n)/UInt#(n)），不能用 Integer。
- **T0061**：Bool 和 Bit#(1) 不要混用——接口方法返回值统一用 Bit#(1)。
- **T0060**：`{...}` 拼接总位宽 = 目标寄存器位宽。

---

## 如何更新此文件

当 UNIVERSAL_TRAPS 或 preflight AST scanner 新增规则时，同步更新此文件。
可通过 `npm run build:offline-traps` 从源码自动生成（待实现）。

> specmate 离线知识包 v0.1.0 — 2026-07-12
