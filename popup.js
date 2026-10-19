
const preview = document.getElementById("preview");
const status = document.getElementById("status");
const copyButton = document.getElementById("copyButton");
const historyBox = document.getElementById("history");
const clearButton = document.getElementById("clearHistory");

let currentEntry = null;

// Read the selected text from the active webpage
async function getSelectedText() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tabs.length || !tabs[0].id) {
      throw new Error("No active tab found.");
    }

    const tab = tabs[0];

    // Chrome blocks extensions from accessing internal pages
    if (
      !tab.url ||
      (!tab.url.startsWith("http://") &&
       !tab.url.startsWith("https://"))
    ) {
      status.textContent = "Unsupported page";
      preview.textContent =
        "Open a regular website and select some text.";
      copyButton.disabled = true;
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: window.getSelection()?.toString().trim() || "",
        title: document.title,
        url: window.location.href
      })
    });

    const data = results[0].result;

    if (!data.text) {
      status.textContent = "No text selected";
      preview.textContent =
        "Select text on the webpage before opening the extension.";
      copyButton.disabled = true;
      return;
    }

    const quote = data.text
      .split("\n")
      .map(line => "> " + line)
      .join("\n");

    currentEntry = {
      id: Date.now().toString(),
      text: data.text,
      title: data.title,
      url: data.url,
      markdown: `${quote}\n\nSource: [${data.title}](${data.url})`,
      savedAt: new Date().toISOString()
    };

    preview.textContent = currentEntry.markdown;
    status.textContent = "Quote ready to copy!";
    copyButton.disabled = false;

  } catch (error) {
    status.textContent = "Could not read this page";
    preview.textContent =
      "Try a regular website. Some pages restrict extension access.";
    copyButton.disabled = true;
    console.error("Selection error:", error);
  }
}

// Load saved quotes from Chrome storage
async function getHistory() {
  const result = await chrome.storage.local.get("copyHistory");
  return result.copyHistory || [];
}

// Save a quote and keep the latest 50 unique entries
async function saveToHistory(entry) {
  const history = await getHistory();

  const updatedHistory = history.filter(item =>
    !(item.text === entry.text && item.url === entry.url)
  );

  updatedHistory.unshift(entry);

  await chrome.storage.local.set({
    copyHistory: updatedHistory.slice(0, 50)
  });
}

// Display saved quotes
async function renderHistory() {
  try {
    const history = await getHistory();

    historyBox.replaceChildren();

    if (history.length === 0) {
      historyBox.textContent = "No saved quotes yet.";
      return;
    }

    history.forEach(entry => {
      const card = document.createElement("div");
      card.className = "history-item";

      const quote = document.createElement("div");
      quote.textContent = entry.text;

      const source = document.createElement("small");
      source.textContent = entry.title;

      const date = document.createElement("small");
      date.textContent = new Date(entry.savedAt).toLocaleString();

      const copyAgain = document.createElement("button");
      copyAgain.textContent = "Copy again";

      copyAgain.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(entry.markdown);
          status.textContent = "Previous quote copied!";
        } catch (error) {
          status.textContent = "Could not copy this quote.";
          console.error("Clipboard error:", error);
        }
      });

      card.append(quote, source, date, copyAgain);
      historyBox.appendChild(card);
    });

  } catch (error) {
    historyBox.textContent = "Could not load history.";
    console.error("History loading error:", error);
  }
}

// Copy the current quote and save it
copyButton.addEventListener("click", async () => {
  if (!currentEntry) return;

  try {
    await saveToHistory(currentEntry);
    await renderHistory();

    await navigator.clipboard.writeText(currentEntry.markdown);

    status.textContent = "Copied and saved to history!";

  } catch (error) {
    status.textContent = "Error saving or copying quote.";
    console.error("Save/copy error:", error);
  }
});

// Clear all saved quotes
clearButton.addEventListener("click", async () => {
  try {
    await chrome.storage.local.set({ copyHistory: [] });
    await renderHistory();
    status.textContent = "History cleared.";
  } catch (error) {
    status.textContent = "Could not clear history.";
    console.error("Clear history error:", error);
  }
});

// Initialize the popup
copyButton.disabled = true;
getSelectedText();
renderHistory();
