(function () {
  const catalog = window.STUDY_CATALOG || [];
  const builtInBanks = window.STUDY_BANKS || {};
  const state = {
    bankId: catalog[0]?.id || Object.keys(builtInBanks)[0],
    bankName: "",
    bankSubject: "",
    cards: [],
    order: [],
    index: 0,
    revealed: false,
    presentationMode: false,
    view: "prompt",
    auto: false,
    shuffle: false,
    timer: null,
    stats: {
      seen: 0,
      attempted: new Set(),
      known: new Set(),
      partial: new Set(),
      missed: new Set(),
      answers: {},
      ratings: {},
      startedAt: new Date().toDateString(),
    },
  };

  const el = {
    bankSelect: document.querySelector("#bankSelect"),
    bankSize: document.querySelector("#bankSize"),
    todayLabel: document.querySelector("#todayLabel"),
    dayLabel: document.querySelector("#dayLabel"),
    passCount: document.querySelector("#passCount"),
    seenCount: document.querySelector("#seenCount"),
    tempoRange: document.querySelector("#tempoRange"),
    tempoValue: document.querySelector("#tempoValue"),
    cardCounter: document.querySelector("#cardCounter"),
    playState: document.querySelector("#playState"),
    cardChapter: document.querySelector("#cardChapter"),
    cardTitle: document.querySelector("#cardTitle"),
    cardPrompt: document.querySelector("#cardPrompt"),
    formulaCard: document.querySelector("#formulaCard"),
    answerBox: document.querySelector(".answer-box"),
    answerInput: document.querySelector("#answerInput"),
    symbolToolbar: document.querySelector("#symbolToolbar"),
    dividerMark: document.querySelector(".divider-mark"),
    cardAnswer: document.querySelector("#cardAnswer"),
    cardHint: document.querySelector("#cardHint"),
    ratingActions: document.querySelector("#ratingActions"),
    prevBtn: document.querySelector("#prevBtn"),
    nextBtn: document.querySelector("#nextBtn"),
    revealBtn: document.querySelector("#revealBtn"),
    revealText: document.querySelector("#revealText"),
    autoBtn: document.querySelector("#autoBtn"),
    manualBtn: document.querySelector("#manualBtn"),
    shuffleBtn: document.querySelector("#shuffleBtn"),
    queueList: document.querySelector("#queueList"),
    sessionNumber: document.querySelector("#sessionNumber"),
    sessionTotal: document.querySelector("#sessionTotal"),
    markKnownBtn: document.querySelector("#markKnownBtn"),
    knownCount: document.querySelector("#knownCount"),
    goalCount: document.querySelector("#goalCount"),
    dailyGoal: document.querySelector(".daily-goal"),
    editorToggle: document.querySelector("#editorToggle"),
    editorPanel: document.querySelector("#editorPanel"),
    closeEditor: document.querySelector("#closeEditor"),
    bankEditor: document.querySelector("#bankEditor"),
    bankNameInput: document.querySelector("#bankNameInput"),
    promptSubject: document.querySelector("#promptSubject"),
    promptCount: document.querySelector("#promptCount"),
    makePromptBtn: document.querySelector("#makePromptBtn"),
    copyPromptBtn: document.querySelector("#copyPromptBtn"),
    promptOutput: document.querySelector("#promptOutput"),
    bankFileInput: document.querySelector("#bankFileInput"),
    importTextBtn: document.querySelector("#importTextBtn"),
    editorStatus: document.querySelector("#editorStatus"),
    applyBankBtn: document.querySelector("#applyBankBtn"),
    resetBankBtn: document.querySelector("#resetBankBtn"),
  };

  function pad(value, width = 3) {
    return String(value).padStart(width, "0");
  }

  function storageKey(bankId) {
    return `shuatiji:${bankId}:bank`;
  }

  function localBanksKey() {
    return "shuatiji:localBanks";
  }

  function selectedBankKey() {
    return "shuatiji:selectedBank";
  }

  function localBankStorageKey(bankId) {
    return `shuatiji:local-bank:${bankId}`;
  }

  function statsKey(bankId) {
    return `shuatiji:${bankId}:stats`;
  }

  function isLocalBankId(bankId) {
    return String(bankId || "").startsWith("local:");
  }

  function getLocalBankList() {
    try {
      const parsed = JSON.parse(localStorage.getItem(localBanksKey()) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name) : [];
    } catch {
      localStorage.removeItem(localBanksKey());
      return [];
    }
  }

  function saveLocalBankList(list) {
    localStorage.setItem(localBanksKey(), JSON.stringify(list));
  }

  function getLocalBank(bankId) {
    if (!isLocalBankId(bankId)) return null;
    const raw = localStorage.getItem(localBankStorageKey(bankId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && Array.isArray(parsed.cards) ? parsed : null;
    } catch {
      return null;
    }
  }

  function makeLocalBankId(bank, existingId = "") {
    if (isLocalBankId(existingId)) return existingId;
    const seed = bank.id && !builtInBanks[bank.id] ? bank.id : bank.name || bank.subject || "bank";
    const base = `local:${slugify(seed)}`;
    const used = new Set(getLocalBankList().map((item) => item.id));
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
  }

  function saveLocalBank(bank, existingId = "") {
    const id = makeLocalBankId(bank, existingId);
    const normalized = normalizeBank({
      ...bank,
      id,
      localBank: true,
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(localBankStorageKey(id), JSON.stringify(normalized));

    const list = getLocalBankList().filter((item) => item.id !== id);
    list.push({
      id,
      name: normalized.name,
      subject: normalized.subject,
      count: normalized.cards.length,
      updatedAt: normalized.updatedAt,
    });
    list.sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
    saveLocalBankList(list);
    return normalized;
  }

  function deleteLocalBank(bankId) {
    if (!isLocalBankId(bankId)) return;
    localStorage.removeItem(localBankStorageKey(bankId));
    saveLocalBankList(getLocalBankList().filter((item) => item.id !== bankId));
  }

  function migrateLegacyLocalBanks() {
    const entries = catalog.length
      ? catalog
      : Object.values(builtInBanks).map((bank) => ({ id: bank.id }));
    let migratedId = "";
    entries.forEach((entry) => {
      const raw = localStorage.getItem(storageKey(entry.id));
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.cards)) {
          const saved = saveLocalBank(parsed);
          if (!migratedId) migratedId = saved.id;
        }
      } catch {
        // Ignore bad legacy data and clear it below.
      }
      localStorage.removeItem(storageKey(entry.id));
    });
    return migratedId;
  }

  function getBank(bankId) {
    const builtIn = builtInBanks[bankId];
    if (builtIn) return structuredClone(builtIn);

    const localBank = getLocalBank(bankId);
    if (localBank) return localBank;

    const firstBuiltInId = catalog[0]?.id || Object.keys(builtInBanks)[0];
    if (firstBuiltInId && builtInBanks[firstBuiltInId]) {
      state.bankId = firstBuiltInId;
      return structuredClone(builtInBanks[firstBuiltInId]);
    }

    const local = localStorage.getItem(storageKey(bankId));
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed && Array.isArray(parsed.cards)) {
          return parsed;
        }
        localStorage.removeItem(storageKey(bankId));
      } catch {
        localStorage.removeItem(storageKey(bankId));
      }
    }
    return { id: "empty", name: "空题库", subject: "自定义", dailyGoal: 20, cards: [] };
  }

  function saveStats() {
    localStorage.setItem(
      statsKey(state.bankId),
      JSON.stringify({
        seen: state.stats.seen,
        attempted: [...state.stats.attempted],
        known: [...state.stats.known],
        partial: [...state.stats.partial],
        missed: [...state.stats.missed],
        answers: state.stats.answers,
        ratings: state.stats.ratings,
        startedAt: state.stats.startedAt,
      }),
    );
  }

  function loadStats() {
    const today = new Date().toDateString();
    const raw = localStorage.getItem(statsKey(state.bankId));
    if (!raw) {
      state.stats = { seen: 0, attempted: new Set(), known: new Set(), partial: new Set(), missed: new Set(), answers: {}, ratings: {}, startedAt: today };
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.startedAt !== today) {
        state.stats = { seen: 0, attempted: new Set(), known: new Set(), partial: new Set(), missed: new Set(), answers: {}, ratings: {}, startedAt: today };
        return;
      }
      state.stats = {
        seen: parsed.seen || 0,
        attempted: new Set(parsed.attempted || []),
        known: new Set(parsed.known || []),
        partial: new Set(parsed.partial || []),
        missed: new Set(parsed.missed || []),
        answers: parsed.answers || {},
        ratings: parsed.ratings || {},
        startedAt: parsed.startedAt,
      };
    } catch {
      state.stats = { seen: 0, attempted: new Set(), known: new Set(), partial: new Set(), missed: new Set(), answers: {}, ratings: {}, startedAt: today };
    }
  }

  function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function textFromBlocks(blocks) {
    if (!Array.isArray(blocks)) return "";
    return blocks
      .map((block) => {
        if (typeof block === "string") return block;
        if (!block || typeof block !== "object") return "";
        return block.text || block.content || block.label || block.alt || "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function normalizeBlocks(blocks, fallbackText = "") {
    const source = Array.isArray(blocks) ? blocks : fallbackText ? [{ type: "text", text: fallbackText }] : [];
    return source
      .map((block) => {
        if (typeof block === "string") return { type: "text", text: block };
        if (!block || typeof block !== "object") return null;
        const type = String(block.type || "text").trim().toLowerCase();
        if (type === "paragraph") return { ...block, type: "text", text: block.text || block.content || "" };
        return { ...block, type };
      })
      .filter(Boolean);
  }

  function firstAvailableBlocks(card, names) {
    for (const name of names) {
      if (Array.isArray(card[name])) return card[name];
    }
    return null;
  }

  function setDateLabels() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    el.todayLabel.textContent = formatter.format(now).toUpperCase();
    el.dayLabel.textContent = "第 01 天";
  }

  function normalizeBank(bank) {
    const safeBank = bank || {};
    return {
      ...safeBank,
      id: safeBank.id || slugify(safeBank.name || safeBank.subject || "bank"),
      name: safeBank.name || `${safeBank.subject || "自定义"}题库`,
      subject: safeBank.subject || safeBank.name || "自定义",
      cards: (safeBank.cards || []).map((card, index) => {
        const promptSource = firstAvailableBlocks(card, ["promptBlocks", "questionBlocks", "blocks"]);
        const solutionSource = firstAvailableBlocks(card, ["solutionBlocks", "answerBlocks", "explanationBlocks"]);
        const prompt = card.prompt || card.question || textFromBlocks(promptSource) || "请回忆答案。";
        const solution = card.solution || card.answer || textFromBlocks(solutionSource) || "";
        return {
          ...card,
          id: card.id || `${safeBank.id || "bank"}-${pad(index + 1)}`,
          chapter: card.chapter || safeBank.subject || "未分类",
          title: card.title || `题目 ${index + 1}`,
          prompt,
          promptBlocks: normalizeBlocks(promptSource, prompt),
          expected: card.expected || "",
          accepted: Array.isArray(card.accepted) ? card.accepted : [],
          answer: card.answer || card.solution || solution,
          solution,
          solutionBlocks: normalizeBlocks(solutionSource, solution),
          hint: card.hint || card.keyPoint || "",
          keyPoint: card.keyPoint || card.hint || "",
        };
      }),
    };
  }

  function slugify(value) {
    const ascii = String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return ascii || `bank-${Date.now()}`;
  }

  function currentBankName() {
    return el.bankSelect.options[el.bankSelect.selectedIndex]?.textContent || "自定义题库";
  }

  function syncBankName(bank) {
    const name = bank.name || `${bank.subject || "自定义"}题库`;
    const selectedOption = el.bankSelect.options[el.bankSelect.selectedIndex];
    if (selectedOption) selectedOption.textContent = name;
    el.bankNameInput.value = name;
  }

  function setEditorStatus(message, tone = "") {
    el.editorStatus.textContent = message;
    el.editorStatus.dataset.tone = tone;
  }

  function buildPrompt() {
    const subject = el.promptSubject.value.trim() || currentBankName();
    const count = Math.max(5, Math.min(200, Number(el.promptCount.value) || 40));
    const bankId = slugify(subject);
    const needsGraphics = subjectNeedsGraphics(subject);
    const cardTemplate = needsGraphics
      ? {
          id: `${bankId}-001`,
          chapter: "章节或知识点",
          title: "短标题",
          prompt: "题干摘要，兼容旧版显示。",
          promptBlocks: [
            { type: "text", text: "题干文字。要求学生在纸上写过程，网页里只填最后答案。" },
            {
              type: "plot",
              spec: {
                xMin: -5,
                xMax: 5,
                yMin: -5,
                yMax: 5,
                grid: true,
                functions: [{ expr: "x^2 - 1", label: "f(x)" }],
                points: [{ x: 1, y: 0, label: "A" }],
              },
            },
          ],
          expected: "最终答案",
          accepted: ["等价答案1", "等价答案2"],
          answer: "参考答案摘要，兼容旧版显示。",
          solutionBlocks: [
            { type: "text", text: "参考答案：写清关键公式、代入过程和最终结果。" },
            { type: "math", text: "x^2 - 1 = 0" },
          ],
          hint: "一句话关键点或易错点",
        }
      : {
          id: `${bankId}-001`,
          chapter: "章节或知识点",
          title: "短标题",
          prompt: "题干。要求学生在纸上写过程，网页里只填最后答案。",
          expected: "最终答案",
          accepted: ["等价答案1", "等价答案2"],
          answer: "参考答案：写清关键公式、代入过程和最终结果。",
          hint: "一句话关键点或易错点",
        };
    const graphicRules = needsGraphics
      ? [
          "",
          "图形题额外要求：",
          "7. 只有题目确实需要图时才使用 promptBlocks/solutionBlocks；不需要图的题仍可只用 prompt/answer。",
          "8. 不要输出 HTML。图形用结构化 block：函数图用 {\"type\":\"plot\",\"spec\":...}，电路图用 {\"type\":\"circuit\",\"spec\":...}，化工流程图用 {\"type\":\"process\",\"spec\":...}。",
          "9. plot.spec 支持 xMin/xMax/yMin/yMax/grid/functions/points；函数表达式用 x、+、-、*、/、^、sin、cos、tan、sqrt、abs、ln、log、exp。",
          "10. circuit.spec 用 nodes 和 components；process.spec 用 units 和 streams。无法结构化表达时才用 image block。",
        ]
      : [];
    return [
      `你是熟悉成人考试/期末考试命题规律的题库整理助手。请为“${subject}”生成 ${count} 道可刷题的题目。`,
      "",
      "输出要求：",
      "1. 只输出一个严格合法的 JSON 对象，不要 Markdown 代码块，不要解释文字，不要注释。",
      "2. JSON 必须能被 JSON.parse 解析：字段名和字符串都使用英文双引号，不能有尾随逗号。",
      "3. 题目适合刷题机：题干清楚，答案以“最终答案 + 必要步骤/公式”呈现，关键点短而准。",
      "4. 题型以考试高频基础题、计算题、概念辨析题为主，难度从基础到中等，避免偏题怪题。",
      "5. 如果有可机器粗略匹配的最终结果，把它放入 expected；等价写法放入 accepted 数组。",
      "6. 数学符号尽量使用普通文本，例如 x^2、sqrt(n)、Phi(1)、C(n,k)、mu、sigma^2，避免复杂 LaTeX。",
      ...graphicRules,
      "",
      "必须使用这个结构：",
      JSON.stringify(
        {
          id: bankId,
          name: `${subject}题库`,
          subject,
          version: "2026-ai-generated",
          dailyGoal: 20,
          cards: [cardTemplate],
        },
        null,
        2,
      ),
      "",
      "请直接生成完整 JSON。cards 数量必须等于题目数；id 从 001 连续编号；所有字符串内容用中文。",
    ].join("\n");
  }

  function subjectNeedsGraphics(subject) {
    return /函数|图像|作图|画图|解析几何|高数|微积分|电工|电路|模电|数电|物理|力学|化工|流程|精馏|传热|流体|反应器/.test(
      String(subject || ""),
    );
  }

  function refreshPrompt() {
    el.promptOutput.value = buildPrompt();
    setEditorStatus("提示词已生成，可复制给网页 AI。");
  }

  async function copyPrompt() {
    if (!el.promptOutput.value.trim()) refreshPrompt();
    try {
      await navigator.clipboard.writeText(el.promptOutput.value);
      setEditorStatus("提示词已复制。", "ok");
    } catch {
      el.promptOutput.select();
      document.execCommand("copy");
      setEditorStatus("提示词已选中并尝试复制。", "ok");
    }
  }

  function extractJsonText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) throw new Error("内容为空");

    const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim());
    const candidates = [text, ...fencedBlocks];
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));

    for (const candidate of candidates) {
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Try the next likely JSON slice.
      }
    }
    throw new Error("没有找到合法 JSON。请让 AI 只输出严格 JSON，字段名必须带双引号。");
  }

  function coerceImportedBank(parsed) {
    const subject = el.promptSubject.value.trim() || currentBankName();
    const base = Array.isArray(parsed)
      ? {
          id: slugify(subject),
          name: `${subject}题库`,
          subject,
          version: "local-import",
          dailyGoal: 20,
          cards: parsed,
        }
      : parsed;

    if (!base || !Array.isArray(base.cards)) {
      throw new Error("JSON 顶层需要是题库对象，或直接是题目数组。题库对象必须包含 cards 数组。");
    }
    if (base.cards.length === 0) {
      throw new Error("cards 里没有题目。");
    }

    return normalizeBank({
      id: base.id || slugify(subject),
      name: base.name || `${subject}题库`,
      subject: base.subject || subject,
      version: base.version || "local-import",
      dailyGoal: base.dailyGoal || 20,
      cards: base.cards,
    });
  }

  function importBankText(rawText) {
    const jsonText = extractJsonText(rawText);
    const bank = coerceImportedBank(JSON.parse(jsonText));
    syncBankName(bank);
    el.bankEditor.value = JSON.stringify(bank, null, 2);
    setEditorStatus(`已解析 ${bank.cards.length} 道题，确认后点“应用到本机”。`, "ok");
  }

  function readBankFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        importBankText(reader.result);
      } catch (error) {
        setEditorStatus(`导入失败：${error.message}`, "error");
      }
    });
    reader.addEventListener("error", () => setEditorStatus("文件读取失败。", "error"));
    reader.readAsText(file, "utf-8");
  }

  function loadBank(bankId) {
    clearTimeout(state.timer);
    state.bankId = bankId;
    localStorage.setItem(selectedBankKey(), bankId);
    const bank = normalizeBank(getBank(bankId));
    el.bankSelect.value = state.bankId;
    state.bankName = bank.name || "";
    state.bankSubject = bank.subject || "";
    state.presentationMode = Boolean(bank.presentationMode);
    state.cards = bank.cards;
    state.order = state.shuffle ? shuffleArray(state.cards.map((_, index) => index)) : state.cards.map((_, index) => index);
    state.index = 0;
    state.revealed = state.presentationMode || state.view !== "prompt";
    loadStats();
    el.goalCount.textContent = bank.dailyGoal || 20;
    el.bankSize.textContent = pad(state.cards.length);
    el.sessionTotal.textContent = pad(state.cards.length);
    syncBankName(bank);
    el.applyBankBtn.textContent = isLocalBankId(state.bankId) ? "保存修改" : "保存为新题库";
    el.resetBankBtn.textContent = isLocalBankId(state.bankId) ? "删除本地题库" : "恢复内置题库";
    el.bankEditor.value = JSON.stringify(bank, null, 2);
    render();
  }

  function resetPresentationScroll() {
    if (!state.presentationMode) return;
    el.formulaCard.scrollTop = 0;
  }

  function currentCard() {
    return state.cards[state.order[state.index]];
  }

  function renderQueue() {
    const items = state.order.slice(0, 12).map((cardIndex, orderIndex) => {
      const card = state.cards[cardIndex];
      const button = document.createElement("button");
      button.className = "queue-item";
      if (orderIndex === state.index) button.classList.add("is-active");
      if (state.stats.known.has(card.id)) button.classList.add("is-known");
      button.innerHTML = `
        <span>
          <strong>${escapeHtml(card.title)}</strong>
          ${escapeHtml(card.prompt)}
        </span>
        <small>#${pad(orderIndex + 1)}</small>
      `;
      button.addEventListener("click", () => {
        state.index = orderIndex;
        state.revealed = state.presentationMode || state.view !== "prompt";
        render();
        resetPresentationScroll();
      });
      return button;
    });
    el.queueList.replaceChildren(...items);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function renderText(value) {
    return escapeHtml(value).replaceAll("\n", "<br>");
  }

  function renderBlocks(blocks) {
    const normalized = normalizeBlocks(blocks);
    if (!normalized.length) return "";
    return normalized.map(renderBlock).join("");
  }

  function renderBlock(block) {
    if (block.type === "math") {
      return renderMathBlock(block);
    }
    if (block.type === "image") {
      const src = block.src || block.url || "";
      if (!src) return "";
      return `<figure class="content-block media-block"><img src="${escapeAttr(src)}" alt="${escapeAttr(block.alt || block.caption || "题目图片")}" loading="lazy" />${
        block.caption ? `<figcaption>${renderText(block.caption)}</figcaption>` : ""
      }</figure>`;
    }
    if (block.type === "table") return renderTableBlock(block);
    if (block.type === "plot") return renderPlotBlock(block.spec || block);
    if (block.type === "circuit") return renderCircuitBlock(block.spec || block);
    if (block.type === "process") return renderProcessBlock(block.spec || block);
    if (block.type === "note") return `<p class="content-block note-block">${renderText(block.text || block.content || "")}</p>`;
    return `<p class="content-block text-block">${renderText(block.text || block.content || "")}</p>`;
  }

  function renderMathBlock(block) {
    const fallback = block.text || block.content || block.latex || "";
    const latex = block.latex || mathTextToLatex(fallback);
    if (!window.katex || !latex) return `<div class="content-block math-block">${renderText(fallback)}</div>`;

    try {
      const html = window.katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
        strict: false,
        trust: false,
      });
      return `<div class="content-block math-block math-block--rendered" data-math-source="${escapeAttr(fallback)}">${html}</div>`;
    } catch {
      return `<div class="content-block math-block">${renderText(fallback)}</div>`;
    }
  }

  function mathTextToLatex(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^integral\(0 to delta\) dx =/.test(source)) {
      return String.raw`\int_{0}^{\delta} \mathrm{d}x = -\frac{\lambda A}{\dot Q}\int_{T_1}^{T_2}\mathrm{d}T`;
    }

    const phraseTokens = {
      "gas residence time": "gas_residence_time",
      "particle settling time": "particle_settling_time",
      "centrifugal acceleration": "centrifugal_acceleration",
      "mass in": "mass_in",
      "mass out": "mass_out",
    };
    let normalized = source;
    Object.entries(phraseTokens).forEach(([phrase, token]) => {
      normalized = normalized.replaceAll(phrase, token);
    });
    normalized = normalized.replace(/\bpA\b/g, "p*A");

    try {
      const tokens = tokenizeMath(normalized);
      let position = 0;

      function peek(value) {
        return tokens[position]?.value === value;
      }

      function take(value) {
        if (!peek(value)) return null;
        return tokens[position++].value;
      }

      function parseRelations() {
        let left = parseSum();
        while (["=", "<=", ">=", "!=", "<", ">"].includes(tokens[position]?.value)) {
          const operator = tokens[position++].value;
          left = `${left} ${mathOperatorLatex(operator)} ${parseSum()}`;
        }
        return left;
      }

      function parseSequence() {
        let left = parseRelations();
        while (take(";")) left = `${left}\\qquad ${parseRelations()}`;
        return left;
      }

      function parseSum() {
        let left = parseProduct();
        while (peek("+") || peek("-")) {
          const operator = tokens[position++].value;
          left = `${left} ${operator} ${parseProduct()}`;
        }
        return left;
      }

      function parseProduct() {
        let left = parsePower();
        while (peek("*") || peek("/") || startsMathAtom(tokens[position])) {
          if (take("/")) {
            left = `\\frac{${left}}{${stripMathGroup(parsePower())}}`;
            continue;
          }
          take("*");
          left = `${left}\\,${parsePower()}`;
        }
        return left;
      }

      function parsePower() {
        let left = parseUnary();
        while (take("^")) left = `${left}^{${parseUnary()}}`;
        return left;
      }

      function parseUnary() {
        if (take("-")) return `-${parseUnary()}`;
        if (take("+")) return parseUnary();
        return parseAtom();
      }

      function parseAtom() {
        const token = tokens[position++];
        if (!token) return "";
        if (token.value === "(") {
          const contents = parseRelations();
          if (!take(")")) throw new Error("Missing closing parenthesis");
          return `\\left(${contents}\\right)`;
        }
        if (token.type === "number") return token.value;
        if (token.type !== "identifier") return mathOperatorLatex(token.value);

        if (take("(")) {
          const args = [];
          if (!peek(")")) {
            do {
              args.push(parseRelations());
            } while (take(","));
          }
          if (!take(")")) throw new Error("Missing function parenthesis");
          return renderMathFunction(token.value, args);
        }
        return renderMathIdentifier(token.value);
      }

      const result = parseSequence();
      if (position !== tokens.length) throw new Error("Unparsed math token");
      return result;
    } catch {
      return escapeLatexText(source);
    }
  }

  function tokenizeMath(source) {
    const tokens = [];
    const matcher = /\s*(<=|>=|!=|\.\.\.|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[=+\-*/^(),;<>])\s*/gy;
    let position = 0;
    while (position < source.length) {
      matcher.lastIndex = position;
      const match = matcher.exec(source);
      if (!match) throw new Error("Unsupported math token");
      const value = match[1];
      tokens.push({
        type: /^\d/.test(value) ? "number" : /^[A-Za-z_]/.test(value) ? "identifier" : "operator",
        value,
      });
      position = matcher.lastIndex;
    }
    return tokens;
  }

  function startsMathAtom(token) {
    return token && (token.type === "identifier" || token.type === "number" || token.value === "(");
  }

  function stripMathGroup(value) {
    return value.startsWith("\\left(") && value.endsWith("\\right)") ? value.slice(6, -7) : value;
  }

  function mathOperatorLatex(value) {
    return {
      "<=": "\\leq",
      ">=": "\\geq",
      "!=": "\\neq",
      "...": "\\ldots",
      ";": "\\qquad",
    }[value] || value;
  }

  function renderMathFunction(name, args) {
    const contents = args.join(", ");
    if (name === "ln") return `\\ln\\left(${contents}\\right)`;
    if (name === "sum") return `\\sum\\left(${contents}\\right)`;
    if (name === "delta") return `\\Delta\\left(${contents}\\right)`;
    if (name === "sqrt") return `\\sqrt{${contents}}`;
    return `${renderMathIdentifier(name)}\\left(${contents}\\right)`;
  }

  function renderMathIdentifier(value) {
    const special = {
      Q_dot: "\\dot Q",
      delta_T: "\\Delta T",
      delta_p: "\\Delta p",
      delta_p_mf: "\\Delta p_{\\mathrm{mf}}",
      omega: "\\omega",
      rho: "\\rho",
      lambda: "\\lambda",
      mu: "\\mu",
      nu: "\\nu",
      alpha: "\\alpha",
      epsilon: "\\varepsilon",
      eta: "\\eta",
      sigma: "\\sigma",
      zeta: "\\zeta",
      pi: "\\pi",
      mass_in: "\\text{mass in}",
      mass_out: "\\text{mass out}",
      gas_residence_time: "\\text{gas residence time}",
      particle_settling_time: "\\text{particle settling time}",
      centrifugal_acceleration: "\\text{centrifugal acceleration}",
      gravity: "\\text{gravity}",
      buoyancy: "\\text{buoyancy}",
      drag: "\\text{drag}",
      constant: "\\text{constant}",
    };
    if (special[value]) return special[value];
    if (/^d[A-Z_a-z]$/.test(value)) return `\\mathrm{d}${renderMathIdentifier(value.slice(1))}`;

    const numbered = value.match(/^([A-Za-z_]+)(\d+)$/);
    if (numbered) return `${renderMathIdentifier(numbered[1])}_{${numbered[2]}}`;

    const subscript = value.match(/^([A-Za-z]+)_([A-Za-z0-9_]+)$/);
    if (subscript) {
      const suffix = subscript[2].length === 1 ? renderMathIdentifier(subscript[2]) : `\\mathrm{${escapeLatexText(subscript[2])}}`;
      return `${renderMathIdentifier(subscript[1])}_{${suffix}}`;
    }
    return escapeLatexText(value);
  }

  function escapeLatexText(value) {
    return String(value)
      .replaceAll("\\", "\\textbackslash ")
      .replaceAll("{", "\\{")
      .replaceAll("}", "\\}")
      .replaceAll("_", "\\_")
      .replaceAll("%", "\\%");
  }

  function renderTableBlock(block) {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    if (!rows.length) return "";
    return `<div class="content-block table-block"><table>${rows
      .map(
        (row) =>
          `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${renderText(cell)}</td>`).join("")}</tr>`,
      )
      .join("")}</table></div>`;
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function compilePlotExpression(expr) {
    const source = String(expr || "")
      .replaceAll("^", "**")
      .replace(/\bln\s*\(/g, "log(")
      .replace(/\bX\b/g, "x")
      .replace(/\bpi\b/gi, "PI")
      .replace(/\be\b/g, "E");
    const allowedNames = new Set([
      "x",
      "X",
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "sqrt",
      "abs",
      "log",
      "exp",
      "pow",
      "min",
      "max",
      "floor",
      "ceil",
      "PI",
      "E",
      "pi",
      "e",
    ]);
    const names = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    if (names.some((name) => !allowedNames.has(name))) return null;
    try {
      return new Function(
        "x",
        `"use strict"; const {sin,cos,tan,asin,acos,atan,sqrt,abs,log,exp,pow,min,max,floor,ceil,PI,E}=Math; return (${source});`,
      );
    } catch {
      return null;
    }
  }

  function renderPlotBlock(spec) {
    const xMin = toNumber(spec.xMin, -5);
    const xMax = toNumber(spec.xMax, 5);
    const yMin = toNumber(spec.yMin, -5);
    const yMax = toNumber(spec.yMax, 5);
    if (xMin >= xMax || yMin >= yMax) return `<div class="content-block graphic-error">图形范围无效。</div>`;

    const width = 680;
    const height = 380;
    const padX = 44;
    const padY = 28;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;
    const sx = (x) => padX + ((x - xMin) / (xMax - xMin)) * plotW;
    const sy = (y) => padY + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
    const colors = ["#b91422", "#1769aa", "#2d7d46", "#7a4b9d", "#b45f06"];
    const ticks = Array.from({ length: 11 }, (_, index) => index / 10);
    const grid = spec.grid !== false
      ? ticks
          .map((t) => {
            const x = padX + t * plotW;
            const y = padY + t * plotH;
            return `<line class="plot-grid" x1="${x}" y1="${padY}" x2="${x}" y2="${height - padY}" /><line class="plot-grid" x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" />`;
          })
          .join("")
      : "";
    const axes = [
      yMin <= 0 && yMax >= 0
        ? `<line class="plot-axis" x1="${padX}" y1="${sy(0)}" x2="${width - padX}" y2="${sy(0)}" />`
        : "",
      xMin <= 0 && xMax >= 0
        ? `<line class="plot-axis" x1="${sx(0)}" y1="${padY}" x2="${sx(0)}" y2="${height - padY}" />`
        : "",
    ].join("");
    const labels = ticks
      .filter((_, index) => index % 2 === 0)
      .map((t) => {
        const xValue = xMin + t * (xMax - xMin);
        const yValue = yMax - t * (yMax - yMin);
        return `<text class="plot-tick" x="${padX + t * plotW}" y="${height - 6}">${formatTick(xValue)}</text><text class="plot-tick plot-tick-y" x="8" y="${padY + t * plotH + 4}">${formatTick(yValue)}</text>`;
      })
      .join("");
    const paths = (Array.isArray(spec.functions) ? spec.functions : [])
      .map((item, index) => {
        const fn = compilePlotExpression(item.expr || item.expression || item.y);
        if (!fn) return "";
        let path = "";
        for (let i = 0; i <= 240; i += 1) {
          const x = xMin + (i / 240) * (xMax - xMin);
          let y;
          try {
            y = Number(fn(x));
          } catch {
            y = NaN;
          }
          if (!Number.isFinite(y) || y < yMin - Math.abs(yMax - yMin) || y > yMax + Math.abs(yMax - yMin)) {
            path += " ";
            continue;
          }
          path += `${path.trim() ? "L" : "M"}${sx(x).toFixed(2)} ${sy(y).toFixed(2)} `;
        }
        const color = item.color || colors[index % colors.length];
        const label = item.label
          ? `<text class="plot-label" x="${padX + 8}" y="${padY + 18 + index * 18}" fill="${escapeAttr(color)}">${escapeHtml(item.label)}</text>`
          : "";
        return `<path class="plot-line" d="${path.trim()}" stroke="${escapeAttr(color)}" />${label}`;
      })
      .join("");
    const points = (Array.isArray(spec.points) ? spec.points : [])
      .map((point) => {
        const x = toNumber(point.x, NaN);
        const y = toNumber(point.y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
        return `<g class="plot-point"><circle cx="${sx(x)}" cy="${sy(y)}" r="4" />${
          point.label ? `<text x="${sx(x) + 7}" y="${sy(y) - 7}">${escapeHtml(point.label)}</text>` : ""
        }</g>`;
      })
      .join("");
    const caption = spec.caption || spec.title || "";
    return `<figure class="content-block graphic-block plot-block"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(caption || "函数图")}">${grid}${axes}${labels}${paths}${points}</svg>${
      caption ? `<figcaption>${renderText(caption)}</figcaption>` : ""
    }</figure>`;
  }

  function formatTick(value) {
    const rounded = Math.abs(value) < 1e-8 ? 0 : value;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function renderCircuitBlock(spec) {
    const nodes = new Map((Array.isArray(spec.nodes) ? spec.nodes : []).map((node) => [node.id, node]));
    const components = Array.isArray(spec.components) ? spec.components : [];
    if (!nodes.size || !components.length) return `<div class="content-block graphic-error">电路图缺少 nodes 或 components。</div>`;
    const scale = 88;
    const margin = 42;
    const coords = [...nodes.values()].map((node) => ({ x: toNumber(node.x, 0), y: toNumber(node.y, 0) }));
    const minX = Math.min(...coords.map((item) => item.x));
    const maxX = Math.max(...coords.map((item) => item.x));
    const minY = Math.min(...coords.map((item) => item.y));
    const maxY = Math.max(...coords.map((item) => item.y));
    const width = Math.max(360, (maxX - minX + 1) * scale + margin * 2);
    const height = Math.max(220, (maxY - minY + 1) * scale + margin * 2);
    const px = (node) => margin + (toNumber(node.x, 0) - minX) * scale;
    const py = (node) => margin + (toNumber(node.y, 0) - minY) * scale;
    const parts = components
      .map((component) => {
        const a = nodes.get(component.from);
        const b = nodes.get(component.to);
        if (!a || !b) return "";
        const x1 = px(a);
        const y1 = py(a);
        const x2 = px(b);
        const y2 = py(b);
        const labelX = (x1 + x2) / 2;
        const labelY = (y1 + y2) / 2 - 10;
        const type = String(component.type || "wire").toLowerCase();
        const label = component.label ? `<text class="schematic-label" x="${labelX}" y="${labelY}">${escapeHtml(component.label)}</text>` : "";
        if (type.includes("resistor")) {
          const zig = makeZigzagPath(x1, y1, x2, y2);
          return `<path class="schematic-line" d="${zig}" />${label}`;
        }
        if (type.includes("voltage") || type.includes("source")) {
          return `<line class="schematic-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" /><circle class="schematic-symbol" cx="${labelX}" cy="${(y1 + y2) / 2}" r="18" />${label}`;
        }
        return `<line class="schematic-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />${label}`;
      })
      .join("");
    const nodeMarks = [...nodes.values()]
      .map((node) => `<circle class="schematic-node" cx="${px(node)}" cy="${py(node)}" r="4" />`)
      .join("");
    return `<figure class="content-block graphic-block"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="电路图">${parts}${nodeMarks}</svg>${
      spec.caption ? `<figcaption>${renderText(spec.caption)}</figcaption>` : ""
    }</figure>`;
  }

  function makeZigzagPath(x1, y1, x2, y2) {
    const steps = 8;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    let path = `M${x1} ${y1}`;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const offset = (i % 2 ? 9 : -9);
      path += ` L${x1 + dx * t + nx * offset} ${y1 + dy * t + ny * offset}`;
    }
    return `${path} L${x2} ${y2}`;
  }

  function renderProcessBlock(spec) {
    const units = Array.isArray(spec.units) ? spec.units : [];
    const streams = Array.isArray(spec.streams) ? spec.streams : [];
    if (!units.length) return `<div class="content-block graphic-error">流程图缺少 units。</div>`;
    const map = new Map(units.map((unit) => [unit.id, unit]));
    const width = 720;
    const height = 360;
    const ux = (unit) => 60 + toNumber(unit.x, 0) * 90;
    const uy = (unit) => 50 + toNumber(unit.y, 0) * 70;
    const markerId = `arrow-${Math.random().toString(36).slice(2)}`;
    const streamLines = streams
      .map((stream) => {
        const from = map.get(stream.from);
        const to = map.get(stream.to);
        if (!from || !to) return "";
        const x1 = ux(from) + 54;
        const y1 = uy(from) + 28;
        const x2 = ux(to);
        const y2 = uy(to) + 28;
        return `<line class="process-stream" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#${markerId})" />${
          stream.label ? `<text class="schematic-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}">${escapeHtml(stream.label)}</text>` : ""
        }`;
      })
      .join("");
    const unitShapes = units
      .map((unit) => {
        const x = ux(unit);
        const y = uy(unit);
        const type = String(unit.type || "unit").toLowerCase();
        const label = `<text class="process-label" x="${x + 34}" y="${y + 34}">${escapeHtml(unit.label || unit.id || "")}</text>`;
        if (type.includes("tower") || type.includes("column")) {
          return `<rect class="process-unit" x="${x + 10}" y="${y - 18}" width="48" height="92" rx="18" />${label}`;
        }
        if (type.includes("pump")) {
          return `<circle class="process-unit" cx="${x + 34}" cy="${y + 28}" r="28" />${label}`;
        }
        if (type.includes("valve")) {
          return `<path class="process-unit" d="M${x + 8} ${y + 12} L${x + 60} ${y + 44} M${x + 60} ${y + 12} L${x + 8} ${y + 44}" />${label}`;
        }
        return `<rect class="process-unit" x="${x}" y="${y}" width="68" height="56" rx="6" />${label}`;
      })
      .join("");
    return `<figure class="content-block graphic-block"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="化工流程图"><defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker></defs>${streamLines}${unitShapes}</svg>${
      spec.caption ? `<figcaption>${renderText(spec.caption)}</figcaption>` : ""
    }</figure>`;
  }

  function render() {
    const card = currentCard();
    if (!card) return;

    const presentation = state.presentationMode;
    const number = state.index + 1;
    const userAnswer = state.stats.answers[card.id] || "";
    const rating = state.stats.ratings[card.id] || "";
    el.cardCounter.textContent = `· ${pad(number)} / ${pad(state.cards.length)}`;
    el.sessionNumber.textContent = String(number);
    el.cardChapter.textContent = card.chapter;
    el.cardTitle.textContent = card.title;
    el.cardPrompt.innerHTML =
      !presentation && state.view === "answer" ? renderBlocks([{ type: "text", text: "先看答案模式" }]) : renderBlocks(card.promptBlocks);
    renderSymbolToolbar();
    el.answerInput.value = userAnswer;
    el.cardAnswer.innerHTML = presentation ? renderPresentationSolution(card) : renderSolution(card, userAnswer);
    el.cardHint.textContent = presentation ? "" : state.revealed || state.view !== "prompt" ? getRatingHint(rating) : "过程写在纸上；这里只填最后答案，然后提交看解析。";
    el.formulaCard.classList.toggle("is-presentation", presentation);
    [el.answerBox, el.symbolToolbar, el.dividerMark, el.cardHint, el.dailyGoal].forEach((item) => {
      item.classList.toggle("is-presentation-hidden", presentation);
    });
    el.cardAnswer.classList.toggle("is-hidden", !presentation && !state.revealed && state.view === "prompt");
    el.ratingActions.classList.toggle("is-visible", !presentation && (state.revealed || state.view !== "prompt"));
    el.ratingActions.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.rating === rating);
    });
    el.revealText.textContent = presentation ? "下一页" : state.revealed ? "下一题" : "提交并看解析";
    el.revealBtn.classList.toggle("is-continue", presentation || state.revealed);
    el.playState.textContent = state.auto ? "自动中" : "已暂停";
    el.passCount.textContent = state.stats.known.size;
    el.knownCount.textContent = state.stats.known.size;
    el.seenCount.textContent = state.stats.attempted.size;
    el.markKnownBtn.classList.toggle("is-lit", state.stats.known.has(card.id));
    renderQueue();
    saveStats();
  }

  function renderPresentationSolution(card) {
    return `
      <div class="solution-block presentation-solution">
        <section>
          <strong>公式讲解</strong>
          <div class="answer-blocks">${renderBlocks(card.solutionBlocks)}</div>
        </section>
        ${card.keyPoint || card.hint ? `<p class="presentation-keypoint">${escapeHtml(card.keyPoint || card.hint)}</p>` : ""}
      </div>
    `;
  }

  function renderSolution(card, userAnswer) {
    const answer = userAnswer.trim() || "还没有填写。";
    const likely = getLikelyCheck(card, userAnswer);
    return `
      <div class="solution-block">
        <section>
          <strong>你的最终答案</strong>
          <p>${escapeHtml(answer)}</p>
        </section>
        ${likely ? `<section><strong>自动提示</strong><p>${escapeHtml(likely)}</p></section>` : ""}
        <section>
          <strong>参考答案</strong>
          <div class="answer-blocks">${renderBlocks(card.solutionBlocks)}</div>
        </section>
        <section>
          <strong>关键点</strong>
          <p>${escapeHtml(card.keyPoint || card.hint || "对照步骤，看自己是否写出核心公式。")}</p>
        </section>
      </div>
    `;
  }

  function normalizeAnswer(value) {
    return String(value)
      .toLowerCase()
      .replaceAll(" ", "")
      .replaceAll("，", ",")
      .replaceAll("。", ".")
      .replaceAll("（", "(")
      .replaceAll("）", ")");
  }

  function getLikelyCheck(card, userAnswer) {
    const answer = normalizeAnswer(userAnswer);
    if (!answer) return "";
    const accepted = [card.expected, ...(card.accepted || [])].filter(Boolean).map(normalizeAnswer);
    if (!accepted.length) return "这题主要看步骤，先按参考答案自评。";
    if (accepted.some((item) => answer.includes(item))) return "你的答案包含参考结果，可能正确；再检查步骤是否完整。";
    return "没有直接匹配到参考结果，建议重点对照公式和最后结果。";
  }

  function getRatingHint(rating) {
    if (rating === "correct") return "已标记做对。后面可以减少复习频率。";
    if (rating === "partial") return "已标记半会。建议之后再刷一遍同类题。";
    if (rating === "wrong") return "已标记重做。先看关键公式，再手算一遍。";
    return "对照你的答案和解析，然后选择做对、半会或重做。";
  }

  function markSeen(card) {
    if (!card) return;
    state.stats.seen += 1;
    state.stats.attempted.add(card.id);
  }

  function revealOrNext() {
    if (state.presentationMode) {
      markSeen(currentCard());
      nextCard();
      return;
    }
    if (!state.revealed && state.view === "prompt") {
      saveCurrentAnswer();
      state.revealed = true;
      markSeen(currentCard());
      render();
      scheduleAuto();
      return;
    }
    nextCard();
  }

  function nextCard() {
    saveCurrentAnswer();
    state.index = (state.index + 1) % state.order.length;
    state.revealed = state.presentationMode || state.view !== "prompt";
    render();
    resetPresentationScroll();
    scheduleAuto();
  }

  function prevCard() {
    saveCurrentAnswer();
    state.index = (state.index - 1 + state.order.length) % state.order.length;
    state.revealed = state.presentationMode || state.view !== "prompt";
    render();
    resetPresentationScroll();
  }

  function saveCurrentAnswer() {
    const card = currentCard();
    if (!card) return;
    state.stats.answers[card.id] = el.answerInput.value;
    saveStats();
  }

  const symbolProfiles = [
    {
      test: /概率|统计|抽样|分布|正态|随机|方差|期望|样本|贝叶斯|二项|泊松|密度/,
      symbols: [
        ["Φ()", "Phi / 正态分布函数"],
        ["μ", "mu / 均值"],
        ["σ", "sigma / 标准差"],
        ["σ²", "sigma2 / 方差"],
        ["λ", "lambda / 参数"],
        ["√()", "sqrt / 根号"],
        ["C(n,k)", "comb / 组合数"],
        ["P(A|B)", "pab / 条件概率"],
      ],
      shortcuts: { phi: "Φ()", mu: "μ", sigma: "σ", sigma2: "σ²", lambda: "λ", lam: "λ", sqrt: "√()", comb: "C(n,k)", pab: "P(A|B)" },
    },
    {
      test: /函数|图像|作图|画图|解析几何|高数|微积分|导数|积分|极限/,
      symbols: [
        ["x²", "x2 / 平方"],
        ["√()", "sqrt / 根号"],
        ["∫", "int / 积分"],
        ["∑", "sum / 求和"],
        ["π", "pi"],
        ["e^()", "exp / 指数"],
        ["∞", "inf / 无穷"],
        ["≤", "<="],
        ["≥", ">="],
      ],
      shortcuts: { x2: "x²", sqrt: "√()", int: "∫", sum: "∑", pi: "π", exp: "e^()", inf: "∞", infty: "∞", "<=": "≤", ">=": "≥" },
    },
    {
      test: /电工|电路|模电|数电|电压|电流|电阻|交流|阻抗/,
      symbols: [
        ["Ω", "ohm / 欧姆"],
        ["kΩ", "kohm"],
        ["V", "电压"],
        ["A", "电流"],
        ["∠", "angle / 相角"],
        ["√()", "sqrt / 根号"],
        ["π", "pi"],
      ],
      shortcuts: { ohm: "Ω", kohm: "kΩ", angle: "∠", sqrt: "√()", pi: "π" },
    },
    {
      test: /化工|流程|精馏|传热|流体|反应器|泵|换热|物料|能量衡算/,
      symbols: [
        ["Δ", "delta / 变化量"],
        ["℃", "摄氏度"],
        ["ρ", "rho / 密度"],
        ["η", "eta / 效率或黏度"],
        ["μ", "mu / 黏度"],
        ["λ", "lambda"],
        ["Re", "雷诺数"],
        ["≤", "<="],
        ["≥", ">="],
      ],
      shortcuts: { delta: "Δ", rho: "ρ", eta: "η", mu: "μ", lambda: "λ", lam: "λ", re: "Re", "<=": "≤", ">=": "≥" },
    },
  ];

  const fallbackSymbols = [
    ["≤", "<="],
    ["≥", ">="],
    ["≠", "!="],
  ];

  function currentSymbolProfile() {
    const card = currentCard();
    const context = [
      state.bankName,
      state.bankSubject,
      card?.chapter,
      card?.title,
      card?.prompt,
    ]
      .filter(Boolean)
      .join(" ");
    return symbolProfiles.find((profile) => profile.test.test(context));
  }

  function renderSymbolToolbar() {
    const profile = currentSymbolProfile();
    const symbols = profile?.symbols || fallbackSymbols;
    const buttons = symbols.map(([insert, title]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.insert = insert;
      button.textContent = insert.replace("()", "");
      button.title = title;
      return button;
    });
    el.symbolToolbar.replaceChildren(...buttons);
    el.symbolToolbar.hidden = buttons.length === 0;
  }

  function currentShortcutMap() {
    const profile = currentSymbolProfile();
    return {
      "<=": "≤",
      ">=": "≥",
      "!=": "≠",
      ...(profile?.shortcuts || {}),
    };
  }

  function insertAnswerText(text) {
    const input = el.answerInput;
    const value = input.value;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const nextValue = value.slice(0, start) + text + value.slice(end);
    input.value = nextValue;

    const cursorOffset = text.includes("()") ? text.indexOf("(") + 1 : text.length;
    const cursor = start + cursorOffset;
    input.focus();
    input.setSelectionRange(cursor, cursor);
    saveCurrentAnswer();
  }

  function expandAnswerShortcut() {
    const input = el.answerInput;
    const cursor = input.selectionStart ?? input.value.length;
    if (cursor !== (input.selectionEnd ?? cursor)) return false;

    const before = input.value.slice(0, cursor);
    const match = before.match(/([A-Za-z]+[0-9]?|<=|>=|!=)$/);
    if (!match) return false;

    const raw = match[1];
    const shortcuts = currentShortcutMap();
    const replacement = shortcuts[raw] || shortcuts[raw.toLowerCase()];
    if (!replacement) return false;

    input.value = `${before.slice(0, -raw.length)}${replacement}${input.value.slice(cursor)}`;
    const cursorOffset = replacement.includes("()") ? replacement.indexOf("(") + 1 : replacement.length;
    const nextCursor = cursor - raw.length + cursorOffset;
    input.setSelectionRange(nextCursor, nextCursor);
    saveCurrentAnswer();
    return true;
  }

  function rateCurrent(rating) {
    const card = currentCard();
    if (!card) return;
    saveCurrentAnswer();
    state.revealed = true;
    state.stats.ratings[card.id] = rating;
    state.stats.known.delete(card.id);
    state.stats.partial.delete(card.id);
    state.stats.missed.delete(card.id);
    if (rating === "correct") {
      state.stats.known.add(card.id);
    } else if (rating === "partial") {
      state.stats.partial.add(card.id);
    } else if (rating === "wrong") {
      state.stats.missed.add(card.id);
    }
    state.stats.attempted.add(card.id);
    render();
  }

  function scheduleAuto() {
    clearTimeout(state.timer);
    if (!state.auto) return;
    const tempo = Number(el.tempoRange.value) * 1000;
    state.timer = setTimeout(() => {
      if (state.revealed || state.view !== "prompt") {
        nextCard();
      } else {
        revealOrNext();
      }
    }, tempo);
  }

  function setAuto(enabled) {
    state.auto = enabled;
    el.autoBtn.classList.toggle("is-active", enabled);
    el.manualBtn.classList.toggle("is-active", !enabled);
    render();
    scheduleAuto();
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    el.shuffleBtn.classList.toggle("is-active", state.shuffle);
    const current = currentCard();
    state.order = state.shuffle ? shuffleArray(state.cards.map((_, index) => index)) : state.cards.map((_, index) => index);
    const currentPosition = state.order.findIndex((cardIndex) => state.cards[cardIndex].id === current.id);
    state.index = Math.max(0, currentPosition);
    render();
  }

  function initBankSelect() {
    const migratedId = migrateLegacyLocalBanks();
    const savedId = localStorage.getItem(selectedBankKey()) || "";
    renderBankSelect(migratedId || savedId || state.bankId);
  }

  function renderBankSelect(selectedId = state.bankId) {
    const entries = catalog.length
      ? catalog
      : Object.values(builtInBanks).map((bank) => ({ id: bank.id, name: bank.name }));
    const localEntries = getLocalBankList().map((bank) => ({ ...bank, local: true }));
    const options = [...entries, ...localEntries].map((bank) => {
      const option = document.createElement("option");
      option.value = bank.id;
      option.textContent = bank.local ? `${bank.name}` : bank.name;
      return option;
    });
    el.bankSelect.replaceChildren(...options);
    if (entries.some((entry) => entry.id === selectedId) || localEntries.some((entry) => entry.id === selectedId)) {
      state.bankId = selectedId;
    } else {
      state.bankId = localEntries[0]?.id || entries[0]?.id;
    }
    el.bankSelect.value = state.bankId;
  }

  function bindEvents() {
    el.bankSelect.addEventListener("change", (event) => loadBank(event.target.value));
    el.prevBtn.addEventListener("click", (event) => {
      event.currentTarget.blur();
      prevCard();
    });
    el.nextBtn.addEventListener("click", (event) => {
      event.currentTarget.blur();
      nextCard();
    });
    el.revealBtn.addEventListener("click", (event) => {
      event.currentTarget.blur();
      revealOrNext();
    });
    el.markKnownBtn.addEventListener("click", (event) => {
      event.currentTarget.blur();
      rateCurrent("correct");
    });
    el.answerInput.addEventListener("input", saveCurrentAnswer);
    el.answerInput.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && expandAnswerShortcut()) {
        event.preventDefault();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      el.answerInput.blur();
      revealOrNext();
    });
    el.symbolToolbar.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-insert]");
      if (!button) return;
      event.preventDefault();
      insertAnswerText(button.dataset.insert || "");
    });
    el.ratingActions.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.currentTarget.blur();
        rateCurrent(button.dataset.rating);
      });
    });
    el.autoBtn.addEventListener("click", () => setAuto(true));
    el.manualBtn.addEventListener("click", () => setAuto(false));
    el.shuffleBtn.addEventListener("click", toggleShuffle);
    el.tempoRange.addEventListener("input", () => {
      el.tempoValue.textContent = Number(el.tempoRange.value).toFixed(1);
      scheduleAuto();
    });
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.view = button.dataset.view;
        state.revealed = state.presentationMode || state.view !== "prompt";
        render();
      });
    });
    el.editorToggle.addEventListener("click", () => {
      el.editorPanel.hidden = false;
      if (!el.promptOutput.value.trim()) refreshPrompt();
      el.bankEditor.focus();
    });
    el.closeEditor.addEventListener("click", () => {
      el.editorPanel.hidden = true;
    });
    el.makePromptBtn.addEventListener("click", refreshPrompt);
    el.copyPromptBtn.addEventListener("click", copyPrompt);
    el.importTextBtn.addEventListener("click", () => {
      try {
        importBankText(el.bankEditor.value);
      } catch (error) {
        setEditorStatus(`导入失败：${error.message}`, "error");
      }
    });
    el.bankFileInput.addEventListener("change", (event) => {
      readBankFile(event.target.files[0]);
      event.target.value = "";
    });
    el.applyBankBtn.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(el.bankEditor.value);
        const editedName = el.bankNameInput.value.trim();
        const existingId = isLocalBankId(state.bankId) ? state.bankId : "";
        const draft = normalizeBank({ ...parsed, name: editedName || parsed.name });
        if (!draft.cards.length) throw new Error("cards 里没有题目");
        const bank = saveLocalBank(draft, existingId);
        renderBankSelect(bank.id);
        loadBank(bank.id);
        setEditorStatus(`已保存 ${bank.cards.length} 道题到“${bank.name}”。`, "ok");
        el.editorPanel.hidden = true;
      } catch (error) {
        alert(`JSON 格式有问题：${error.message}`);
        setEditorStatus(`应用失败：${error.message}`, "error");
      }
    });
    el.resetBankBtn.addEventListener("click", () => {
      if (isLocalBankId(state.bankId)) {
        if (!confirm(`删除本地题库“${currentBankName()}”？内置题库不会删除。`)) return;
        deleteLocalBank(state.bankId);
        renderBankSelect(catalog[0]?.id || Object.keys(builtInBanks)[0]);
        loadBank(state.bankId);
        return;
      }
      loadBank(state.bankId);
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !el.editorPanel.hidden) {
        el.editorPanel.hidden = true;
        return;
      }
      if (event.target.matches("textarea, input, select")) return;
      if (event.code === "Space") {
        event.preventDefault();
        revealOrNext();
      }
      if (event.key === "ArrowRight") nextCard();
      if (event.key === "ArrowLeft") prevCard();
      if (event.key.toLowerCase() === "k") rateCurrent("correct");
      if (event.key.toLowerCase() === "h") rateCurrent("partial");
      if (event.key.toLowerCase() === "j") rateCurrent("wrong");
    });
  }

  function init() {
    setDateLabels();
    initBankSelect();
    bindEvents();
    loadBank(state.bankId);
  }

  init();
})();
