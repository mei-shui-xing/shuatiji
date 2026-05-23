(function () {
  const catalog = window.STUDY_CATALOG || [];
  const builtInBanks = window.STUDY_BANKS || {};
  const state = {
    bankId: catalog[0]?.id || Object.keys(builtInBanks)[0],
    cards: [],
    order: [],
    index: 0,
    revealed: false,
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
    answerInput: document.querySelector("#answerInput"),
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
    editorToggle: document.querySelector("#editorToggle"),
    editorPanel: document.querySelector("#editorPanel"),
    closeEditor: document.querySelector("#closeEditor"),
    bankEditor: document.querySelector("#bankEditor"),
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

  function statsKey(bankId) {
    return `shuatiji:${bankId}:stats`;
  }

  function getBank(bankId) {
    const builtIn = builtInBanks[bankId];
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
    return structuredClone(builtIn);
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
      cards: (safeBank.cards || []).map((card, index) => ({
        id: card.id || `${safeBank.id || "bank"}-${pad(index + 1)}`,
        chapter: card.chapter || safeBank.subject || "未分类",
        title: card.title || `题目 ${index + 1}`,
        prompt: card.prompt || "请回忆答案。",
        expected: card.expected || "",
        accepted: card.accepted || [],
        answer: card.answer || card.solution || "",
        solution: card.solution || card.answer || "",
        hint: card.hint || card.keyPoint || "",
        keyPoint: card.keyPoint || card.hint || "",
      })),
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

  function setEditorStatus(message, tone = "") {
    el.editorStatus.textContent = message;
    el.editorStatus.dataset.tone = tone;
  }

  function buildPrompt() {
    const subject = el.promptSubject.value.trim() || currentBankName();
    const count = Math.max(5, Math.min(200, Number(el.promptCount.value) || 40));
    const bankId = slugify(subject);
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
      "",
      "必须使用这个结构：",
      JSON.stringify(
        {
          id: bankId,
          name: `${subject}题库`,
          subject,
          version: "2026-ai-generated",
          dailyGoal: 20,
          cards: [
            {
              id: `${bankId}-001`,
              chapter: "章节或知识点",
              title: "短标题",
              prompt: "题干。要求学生在纸上写过程，网页里只填最后答案。",
              expected: "最终答案",
              accepted: ["等价答案1", "等价答案2"],
              answer: "参考答案：写清关键公式、代入过程和最终结果。",
              hint: "一句话关键点或易错点",
            },
          ],
        },
        null,
        2,
      ),
      "",
      "请直接生成完整 JSON。cards 数量必须等于题目数；id 从 001 连续编号；所有字符串内容用中文。",
    ].join("\n");
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
    const bank = normalizeBank(getBank(bankId));
    state.cards = bank.cards;
    state.order = state.shuffle ? shuffleArray(state.cards.map((_, index) => index)) : state.cards.map((_, index) => index);
    state.index = 0;
    state.revealed = state.view !== "prompt";
    loadStats();
    el.goalCount.textContent = bank.dailyGoal || 20;
    el.bankSize.textContent = pad(state.cards.length);
    el.sessionTotal.textContent = pad(state.cards.length);
    el.bankEditor.value = JSON.stringify(bank, null, 2);
    render();
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
        state.revealed = state.view !== "prompt";
        render();
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

  function render() {
    const card = currentCard();
    if (!card) return;

    const number = state.index + 1;
    const userAnswer = state.stats.answers[card.id] || "";
    const rating = state.stats.ratings[card.id] || "";
    el.cardCounter.textContent = `· ${pad(number)} / ${pad(state.cards.length)}`;
    el.sessionNumber.textContent = String(number);
    el.cardChapter.textContent = card.chapter;
    el.cardTitle.textContent = card.title;
    el.cardPrompt.textContent = state.view === "answer" ? "先看答案模式" : card.prompt;
    el.answerInput.value = userAnswer;
    el.cardAnswer.innerHTML = renderSolution(card, userAnswer);
    el.cardHint.textContent = state.revealed || state.view !== "prompt" ? getRatingHint(rating) : "过程写在纸上；这里只填最后答案，然后提交看解析。";
    el.cardAnswer.classList.toggle("is-hidden", !state.revealed && state.view === "prompt");
    el.ratingActions.classList.toggle("is-visible", state.revealed || state.view !== "prompt");
    el.ratingActions.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.rating === rating);
    });
    el.revealText.textContent = state.revealed ? "下一题" : "提交并看解析";
    el.revealBtn.classList.toggle("is-continue", state.revealed);
    el.playState.textContent = state.auto ? "自动中" : "已暂停";
    el.passCount.textContent = state.stats.known.size;
    el.knownCount.textContent = state.stats.known.size;
    el.seenCount.textContent = state.stats.attempted.size;
    el.markKnownBtn.classList.toggle("is-lit", state.stats.known.has(card.id));
    renderQueue();
    saveStats();
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
          <p>${escapeHtml(card.solution || card.answer).replaceAll("\n", "<br>")}</p>
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
    state.revealed = state.view !== "prompt";
    render();
    scheduleAuto();
  }

  function prevCard() {
    saveCurrentAnswer();
    state.index = (state.index - 1 + state.order.length) % state.order.length;
    state.revealed = state.view !== "prompt";
    render();
  }

  function saveCurrentAnswer() {
    const card = currentCard();
    if (!card) return;
    state.stats.answers[card.id] = el.answerInput.value;
    saveStats();
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
    const entries = catalog.length
      ? catalog
      : Object.values(builtInBanks).map((bank) => ({ id: bank.id, name: bank.name }));
    entries.forEach((bank) => {
      const option = document.createElement("option");
      option.value = bank.id;
      option.textContent = bank.name;
      el.bankSelect.append(option);
    });
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
      if (event.key !== "Enter") return;
      event.preventDefault();
      el.answerInput.blur();
      revealOrNext();
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
        state.revealed = state.view !== "prompt";
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
        const bank = normalizeBank(JSON.parse(el.bankEditor.value));
        if (!bank.cards.length) throw new Error("cards 里没有题目");
        localStorage.setItem(storageKey(state.bankId), JSON.stringify({ ...bank, localOverride: true }));
        loadBank(state.bankId);
        setEditorStatus(`已应用 ${bank.cards.length} 道题到本机浏览器。`, "ok");
        el.editorPanel.hidden = true;
      } catch (error) {
        alert(`JSON 格式有问题：${error.message}`);
        setEditorStatus(`应用失败：${error.message}`, "error");
      }
    });
    el.resetBankBtn.addEventListener("click", () => {
      localStorage.removeItem(storageKey(state.bankId));
      loadBank(state.bankId);
    });
    window.addEventListener("keydown", (event) => {
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
