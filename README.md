# 刷题机

这是一个纯静态刷题机，直接参考你给的复古分栏界面来做。当前内置题库是“概率论常考题”，后续增加电工、物化时只需要新增一个题库文件并登记到清单。

## 打开方式

直接双击 `index.html` 即可使用。也可以在当前目录开一个本地服务：

```powershell
python -m http.server 5173
```

然后访问 `http://localhost:5173`。

## 题库怎么改

题库文件在 `data` 目录：

- `data/catalog.js`：题库清单
- `data/probability.js`：概率论常考题题库

每道题格式如下：

```js
{
  id: "p-001",
  chapter: "第一章 随机事件与概率",
  title: "骰子和事件",
  prompt: "同时掷两枚公平骰子。求点数之和为 7 的概率。",
  answer: "样本点总数：36；有利情况：6；所以 P=1/6。",
  hint: "古典概型：先数总数，再数有利情况。"
}
```

新增科目时复制一个 `data/probability.js` 的结构，例如 `data/electrician.js`，然后在 `index.html` 加一行脚本，在 `data/catalog.js` 登记即可。

界面里也有“编辑题库”，适合临时改题库并保存到本机浏览器；正式长期修改建议改 `data/*.js` 文件。

## 用 AI 辅助生成题库

这个网页不调用任何 API。点左侧“编辑题库”后可以：

1. 输入学科或考试方向，例如“数理统计与抽样调查”。
2. 点“生成提示词”，复制给网页版 ChatGPT、DeepSeek 或其他 AI。
3. 让 AI 只输出严格 JSON，不要解释文字。
4. 把 AI 生成的 JSON 粘贴到下方题库文本框，或保存为 `.json/.txt/.md` 文件后导入。
5. 点“解析下方文本”，确认题数没问题后点“应用到本机”。

AI 输出可以是完整题库对象，也可以直接是题目数组。完整题库对象推荐格式：

```json
{
  "id": "statistics-sampling",
  "name": "数理统计与抽样调查题库",
  "subject": "数理统计与抽样调查",
  "version": "2026-ai-generated",
  "dailyGoal": 20,
  "cards": [
    {
      "id": "statistics-sampling-001",
      "chapter": "参数估计",
      "title": "样本均值的无偏性",
      "prompt": "设 X1,...,Xn 独立同分布，E(Xi)=mu。求 E(样本均值)。",
      "expected": "mu",
      "accepted": ["μ", "E(Xbar)=mu"],
      "answer": "样本均值 Xbar=(X1+...+Xn)/n，所以 E(Xbar)=(n mu)/n=mu。",
      "hint": "期望的线性性质。"
    }
  ]
}
```

## 作答流程

1. 先在纸上写过程。
2. 在题目下方只输入最后答案。
3. 点“提交并看解析”。
4. 对照“你的最终答案 / 参考答案 / 关键点”。
5. 自评为“做对了 / 半会 / 重做”。

题库也支持以后增加 `expected` 和 `accepted` 字段做简单自动提示，但概率论公式等价写法较多，当前以“对照解析 + 自评”为主。
