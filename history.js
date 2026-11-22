const historyTemplates = {
  person: {
    directoryName: "person",
    categoryLabel: "人物",
    listHeading: "人物一覧",
    submitLabel: "人物ページを作成",
    titleField: "name",
    recordHrefPrefix: "person/",
    returnHref: "../person.html",
    fields: [
      { key: "name", label: "名前" },
      { key: "clan", label: "氏" },
      { key: "aliases", label: "幼名／別名" },
      { key: "life", label: "生没年" },
      { key: "father", label: "父" },
      { key: "mother", label: "母" },
      { key: "siblings", label: "兄弟" },
      { key: "wife", label: "妻" },
      { key: "children", label: "子" }
    ]
  },
  war: {
    directoryName: "war",
    categoryLabel: "合戦・政変",
    listHeading: "合戦・政変一覧",
    submitLabel: "ページを作成",
    titleField: "name",
    recordHrefPrefix: "",
    returnHref: "index.html",
    fields: [
      { key: "name", label: "名称" },
      { key: "era", label: "時代" },
      { key: "period", label: "年代" },
      { key: "place", label: "場所" },
      { key: "related", label: "関係人物・勢力" },
      { key: "result", label: "結果" }
    ]
  },
  glossary: {
    directoryName: "other",
    categoryLabel: "用語集",
    listHeading: "用語一覧",
    submitLabel: "用語ページを作成",
    titleField: "term",
    recordHrefPrefix: "",
    returnHref: "index.html",
    fields: [
      { key: "term", label: "用語" },
      { key: "reading", label: "読み" },
      { key: "related", label: "関連人物・出来事" }
    ]
  }
};

const historyManifestName = "records.json";
const historyDatabaseName = "history-notebook";
const historyDirectoryStoreName = "directories";

function openHistoryDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(historyDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(historyDirectoryStoreName)) {
        request.result.createObjectStore(historyDirectoryStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("保存先の設定を開けません。"));
  });
}

async function readSavedHistoryDirectory(category) {
  const database = await openHistoryDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(historyDirectoryStoreName, "readonly");
    let handle = null;
    transaction.objectStore(historyDirectoryStoreName).get(category).onsuccess = (event) => {
      handle = event.target.result || null;
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(handle);
    };
    transaction.onerror = transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("保存先の設定を読み取れません。"));
    };
  });
}

async function saveHistoryDirectory(category, handle) {
  const database = await openHistoryDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(historyDirectoryStoreName, "readwrite");
    transaction.objectStore(historyDirectoryStoreName).put(handle, category);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("保存先の設定を記憶できません。"));
    };
  });
}

function escapeHistoryHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function buildHistoryOverviewHtml(overview) {
  const blocks = [];
  let paragraphLines = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push(`<p class="entry-copy">${escapeHistoryHtml(paragraphLines.join("\n"))}</p>`);
    paragraphLines = [];
  }

  String(overview || "").split(/\r\n?|\n/).forEach((line) => {
    if (line.startsWith("<h>")) {
      flushParagraph();
      blocks.push(`<h3 class="overview-heading">${escapeHistoryHtml(line.slice(3).trim())}</h3>`);
    } else {
      paragraphLines.push(line);
    }
  });
  flushParagraph();
  return blocks.join("\n");
}

function buildHistoryEntryHtml(template, record) {
  const title = record.fields[template.titleField];
  const rows = template.fields.map(({ key, label }) => `
    <tr><th>${escapeHistoryHtml(label)}</th><td>${escapeHistoryHtml(record.fields[key] || "")}</td></tr>
  `).join("");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHistoryHtml(title)} | ${escapeHistoryHtml(template.categoryLabel)}</title>
  <link rel="stylesheet" href="../../history.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html">歴史ノート</a>
    <nav class="site-nav" aria-label="ページ">
      <a href="${escapeHistoryHtml(template.returnHref)}">${escapeHistoryHtml(template.listHeading)}へ戻る</a>
    </nav>
  </header>
  <main class="page-wrap page-wrap-narrow">
    <p class="eyebrow">JAPAN / ${escapeHistoryHtml(template.categoryLabel)}</p>
    <h1>${escapeHistoryHtml(title)}</h1>
    <table class="entry-page-table"><tbody>${rows}</tbody></table>
    <section>
      <h2>一言</h2>
      <p class="entry-copy">${escapeHistoryHtml(record.oneLine || "")}</p>
    </section>
    <section>
      <h2>概要</h2>
      <div class="entry-overview">${buildHistoryOverviewHtml(record.overview)}</div>
    </section>
    <section>
      <h2>出典</h2>
      <p class="entry-copy">${escapeHistoryHtml(record.source || "")}</p>
    </section>
  </main>
  <footer class="site-footer">日本の歴史ノート / ${escapeHistoryHtml(template.categoryLabel)}</footer>
</body>
</html>`;
}

async function readHistoryRecords(directoryHandle, template) {
  let manifestHandle;
  try {
    manifestHandle = await directoryHandle.getFileHandle(historyManifestName);
  } catch (error) {
    if (error.name === "NotFoundError") return [];
    throw error;
  }

  const contents = await (await manifestHandle.getFile()).text();
  if (!contents.trim()) return [];

  let records;
  try {
    records = JSON.parse(contents);
  } catch {
    throw new Error("records.jsonを読み取れません。ファイルを確認してください。");
  }
  if (!Array.isArray(records) || records.some((record) =>
    !record || typeof record.fileName !== "string" ||
    !/^[\p{L}\p{N}_-]+\.html$/u.test(record.fileName) ||
    !record.fields || typeof record.fields !== "object" || Array.isArray(record.fields) ||
    typeof record.fields[template.titleField] !== "string" ||
    typeof record.oneLine !== "string" || typeof record.overview !== "string"
  )) {
    throw new Error("records.jsonの形式が正しくありません。");
  }
  return records;
}

async function writeHistoryFile(directoryHandle, name, contents) {
  const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

function setupHistoryEditor() {
  const category = document.body.dataset.historyCategory;
  const template = historyTemplates[category];
  if (!template) return;

  const form = document.querySelector("#history-entry-form");
  const chooseFolderButton = document.querySelector("#choose-history-folder");
  const storageStatus = document.querySelector("#storage-status");
  const recordList = document.querySelector("#record-list");
  const emptyRecords = document.querySelector("#empty-records");
  const submitButton = document.querySelector("#submit-record");
  const fileNameInput = document.querySelector("[data-filename]");
  const entryDisclosure = document.querySelector(".entry-disclosure");
  const formActions = form.querySelector(".form-actions");
  let directoryHandle = null;
  let rememberedDirectoryHandle = null;
  let editingFileName = null;
  let cancelEditButton = null;
  let records = [];

  function stopEditing() {
    form.reset();
    editingFileName = null;
    fileNameInput.disabled = false;
    submitButton.textContent = template.submitLabel;
    if (cancelEditButton) {
      cancelEditButton.remove();
      cancelEditButton = null;
    }
  }

  function startEditing(record) {
    editingFileName = record.fileName;
    form.querySelectorAll("[data-field]").forEach((input) => {
      input.value = record.fields[input.dataset.field] || "";
    });
    form.querySelector("[data-one-line]").value = record.oneLine || "";
    form.querySelector("[data-overview]").value = record.overview || "";
    form.querySelector("[data-source]").value = record.source || "";
    fileNameInput.value = record.fileName.replace(/\.html$/i, "");
    fileNameInput.disabled = true;
    submitButton.textContent = "変更を保存";

    if (!cancelEditButton) {
      cancelEditButton = document.createElement("button");
      cancelEditButton.type = "button";
      cancelEditButton.className = "secondary-button";
      cancelEditButton.textContent = "編集をキャンセル";
      cancelEditButton.addEventListener("click", () => {
        stopEditing();
        storageStatus.textContent = "編集をキャンセルしました。";
      });
      formActions.append(cancelEditButton);
    }

    entryDisclosure.open = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createRecordListItem(record) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `${template.recordHrefPrefix}${encodeURIComponent(record.fileName)}`;
    link.textContent = record.fields[template.titleField];
    const summary = document.createElement("p");
    summary.textContent = record.oneLine || "一言は未入力です。";
    const content = document.createElement("div");
    content.className = "record-list-content";
    content.append(link, summary);
    item.append(content);
    if (category === "person" || category === "war") {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary-button record-edit-button";
      editButton.textContent = "編集";
      editButton.addEventListener("click", () => startEditing(record));
      item.append(editButton);
    }
    return item;
  }

  function renderRecords() {
    recordList.replaceChildren();
    const orderedRecords = [...records].reverse();
    if (category === "person" || category === "war") {
      const groupingField = category === "person" ? "clan" : "era";
      const emptyGroupLabel = category === "person" ? "氏未入力" : "時代未入力";
      const groups = new Map();
      orderedRecords.forEach((record) => {
        const groupValue = typeof record.fields[groupingField] === "string"
          ? record.fields[groupingField].trim()
          : "";
        const groupKey = groupValue || null;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(record);
      });

      groups.forEach((groupRecords, groupValue) => {
        const group = document.createElement("section");
        group.className = "record-group";
        const heading = document.createElement("h3");
        heading.className = "record-group-heading";
        heading.textContent = groupValue || emptyGroupLabel;
        const list = document.createElement("ul");
        list.className = "record-list";
        groupRecords.forEach((record) => list.append(createRecordListItem(record)));
        group.append(heading, list);
        recordList.append(group);
      });
    } else {
      const list = document.createElement("ul");
      list.className = "record-list";
      orderedRecords.forEach((record) => list.append(createRecordListItem(record)));
      recordList.append(list);
    }

    emptyRecords.hidden = records.length !== 0;
    if (records.length === 0) {
      emptyRecords.textContent = "まだ登録された項目はありません。";
    }
  }

  async function connectToDirectory(selectedDirectory) {
    const loadedRecords = await readHistoryRecords(selectedDirectory, template);
    if (editingFileName !== null) stopEditing();
    directoryHandle = selectedDirectory;
    rememberedDirectoryHandle = selectedDirectory;
    records = loadedRecords;
    renderRecords();
  }

  async function restoreRememberedDirectory() {
    if (!window.indexedDB) return;

    try {
      rememberedDirectoryHandle = await readSavedHistoryDirectory(category);
      if (!rememberedDirectoryHandle ||
          rememberedDirectoryHandle.name !== template.directoryName) return;

      const permission = await rememberedDirectoryHandle.queryPermission({ mode: "readwrite" });
      if (permission === "granted") {
        await connectToDirectory(rememberedDirectoryHandle);
        storageStatus.textContent = `${template.directoryName}フォルダーに自動接続しました。作成したHTMLと一覧はこのフォルダーに保存されます。`;
      } else {
        storageStatus.textContent = `前回選択した「${template.directoryName}」フォルダーを記憶しています。再接続するには保存先ボタンから同じフォルダーを選択してください。`;
      }
    } catch (error) {
      storageStatus.textContent = `保存先を復元できませんでした: ${error.message}`;
    }
  }

  chooseFolderButton.addEventListener("click", async () => {
    if (typeof window.showDirectoryPicker !== "function") {
      storageStatus.textContent = "このブラウザーはフォルダーへの直接保存に対応していません。ChromeまたはEdgeをご利用ください。";
      return;
    }

    try {
      const pickerOptions = { mode: "readwrite", id: `history-${category}` };
      if (rememberedDirectoryHandle) pickerOptions.startIn = rememberedDirectoryHandle;
      const selectedDirectory = await window.showDirectoryPicker(pickerOptions);
      if (selectedDirectory.name !== template.directoryName) {
        storageStatus.textContent = `「${template.directoryName}」フォルダーを選択してください。`;
        return;
      }

      await connectToDirectory(selectedDirectory);
      if (window.indexedDB) {
        try {
          await saveHistoryDirectory(category, selectedDirectory);
          storageStatus.textContent = `${template.directoryName}フォルダーに接続しました。次回から自動接続を試みます。`;
        } catch (error) {
          storageStatus.textContent = `${template.directoryName}フォルダーに接続しましたが、保存先を記憶できませんでした: ${error.message}`;
        }
      } else {
        storageStatus.textContent = `${template.directoryName}フォルダーに接続しました。このブラウザーでは保存先を記憶できません。`;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      storageStatus.textContent = `フォルダーを読み込めませんでした: ${error.message}`;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!directoryHandle) {
      storageStatus.textContent = `先に「${template.directoryName}」フォルダーを選択してください。`;
      return;
    }

    const baseName = fileNameInput.value.trim().replace(/\.html$/i, "");
    if (!/^[\p{L}\p{N}_-]+$/u.test(baseName) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(baseName)) {
      storageStatus.textContent = "HTML名には日本語、英数字、_、- のみを使ってください。";
      return;
    }

    const isEditing = editingFileName !== null;
    const fileName = isEditing ? editingFileName : `${baseName}.html`;
    if (!isEditing && records.some((record) => record.fileName.toLowerCase() === fileName.toLowerCase())) {
      storageStatus.textContent = "同じHTML名が一覧にあります。別の名前を指定してください。";
      return;
    }

    submitButton.disabled = true;
    const fields = {};
    form.querySelectorAll("[data-field]").forEach((input) => {
      fields[input.dataset.field] = input.value.trim();
    });
    const record = {
      fileName,
      fields,
      oneLine: form.querySelector("[data-one-line]").value.trim(),
      overview: form.querySelector("[data-overview]").value.trim(),
      source: form.querySelector("[data-source]").value.trim(),
      savedAt: new Date().toISOString()
    };

    try {
      if (!isEditing) {
        try {
          await directoryHandle.getFileHandle(fileName);
          storageStatus.textContent = "同じ名前のファイルがすでにあります。別のHTML名を指定してください。";
          return;
        } catch (error) {
          if (error.name !== "NotFoundError") throw error;
        }
      }

      await writeHistoryFile(directoryHandle, fileName, buildHistoryEntryHtml(template, record));
      const nextRecords = isEditing
        ? records.map((savedRecord) => savedRecord.fileName === editingFileName ? record : savedRecord)
        : [...records, record];
      try {
        await writeHistoryFile(directoryHandle, historyManifestName, JSON.stringify(nextRecords, null, 2));
      } catch (error) {
        storageStatus.textContent = `HTMLは${isEditing ? "更新" : "作成"}されましたが一覧を保存できませんでした: ${error.message}`;
        return;
      }

      records = nextRecords;
      renderRecords();
      if (isEditing) {
        stopEditing();
        storageStatus.textContent = `「${fields[template.titleField]}」の${template.categoryLabel}情報を更新しました。`;
      } else {
        form.reset();
        storageStatus.textContent = `「${fields[template.titleField]}」のHTMLを作成し、一覧に追加しました。`;
      }
    } catch (error) {
      storageStatus.textContent = `保存に失敗しました: ${error.message}`;
    } finally {
      submitButton.disabled = false;
    }
  });

  restoreRememberedDirectory();
}

setupHistoryEditor();
