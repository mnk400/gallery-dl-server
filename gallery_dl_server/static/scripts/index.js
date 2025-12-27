// ========== Theme Management ==========
const themeToggle = document.getElementById("theme-toggle");
const themeIconLight = document.getElementById("theme-icon-light");
const themeIconDark = document.getElementById("theme-icon-dark");

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  if (theme === "dark") {
    themeIconLight.classList.add("hidden");
    themeIconDark.classList.remove("hidden");
  } else {
    themeIconLight.classList.remove("hidden");
    themeIconDark.classList.add("hidden");
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    // Default to light theme
    setTheme("light");
  }
}

initTheme();

themeToggle.onclick = () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  setTheme(currentTheme === "dark" ? "light" : "dark");
};

// ========== Select Element Persistence ==========
const selectElement = document.querySelector("select[name='video-opts']");

function setSelectedValue() {
  const selectedValue = localStorage.getItem("selectedValue");
  if (selectedValue) {
    selectElement.value = selectedValue;
  }
}

setSelectedValue();

selectElement.onchange = () => {
  localStorage.setItem("selectedValue", selectElement.value);
};

// ========== Logs Box ==========
const box = document.getElementById("box");

function loadBox() {
  if ("boxHeight" in sessionStorage && sessionStorage.getItem("boxHeight") !== "0") {
    box.style.height = sessionStorage.getItem("boxHeight") + "px";
  }

  if ("scrollPos" in sessionStorage) {
    box.scrollTop = sessionStorage.getItem("scrollPos");
  } else {
    box.scrollTop = box.scrollHeight;
  }
}

function saveBox() {
  const boxPos = box.getBoundingClientRect();
  sessionStorage.setItem("boxHeight", boxPos.height);
  sessionStorage.setItem("scrollPos", box.scrollTop);
}

// Load saved box state
loadBox();

function scrollOnResize() {
  let lastHeight = box.offsetHeight;

  const observer = new ResizeObserver(entries => {
    for (let entry of entries) {
      if (entry.contentRect.height > lastHeight) {
        window.scrollTo({
          top: entry.target.getBoundingClientRect().bottom + window.scrollY,
          behavior: "smooth"
        });
      }
      lastHeight = entry.contentRect.height;
    }
  });

  observer.observe(box);
}

scrollOnResize();

// ========== Show Body ==========
document.body.classList.remove("loading");
document.body.classList.add("loaded");

// ========== Form Submission ==========
const form = document.getElementById("form");

// Get the accent color from CSS variables for SweetAlert
const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--page-accent').trim() || '#c6866d';

const successAlert = Swal.mixin({
  animation: true,
  position: "top-end",
  icon: "success",
  iconColor: accentColor,
  color: accentColor,
  showConfirmButton: false,
  confirmButtonText: "OK",
  confirmButtonColor: accentColor,
  showCloseButton: true,
  closeButtonHtml: "&times;",
  target: "body",
  timer: 3000,
  timerProgressBar: true,
  toast: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  }
});

form.onsubmit = async (event) => {
  event.preventDefault();

  if (ws.readyState === WebSocket.CLOSED) {
    connectWebSocket();
  }

  const formData = new FormData(event.target);
  const url = formData.get("url");

  try {
    const response = await fetch("/gallery-dl/q", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const data = await response.json();
    console.log(data);

    event.target.url.value = "";

    if (url) {
      successAlert.fire({
        title: "Success!",
        html: `Added
          <a href="${url}" target="_blank" rel="noopener noreferrer">one item</a>
          to the download queue.`
      });
    }
  } catch (error) {
    console.error(error);
  }
};

// ========== WebSocket Connection ==========
let ws;
let isConnected = false;
let isPageAlive = true;

async function fetchLogs() {
  try {
    const response = await fetch("/stream/logs", {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });

    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const logs = await response.text();

    if (box.textContent !== logs) {
      box.textContent = logs;
      box.scrollTop = box.scrollHeight;
    }

    if (!isConnected) {
      connectWebSocket();
    }
  } catch (error) {
    console.error(error.message);
  }
}

function connectWebSocket(allowReconnect = true) {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const host = window.location.host;
  const url = `${protocol}${host}/ws/logs`;

  let lastLine = "";
  let lastPos = localStorage.getItem("lastPos") ? parseInt(localStorage.getItem("lastPos")) : 0;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("WebSocket connection established.");
    isConnected = true;
  };

  ws.onmessage = (event) => {
    const newLines = event.data.split("\n").filter(Boolean);
    if (!newLines.length) return;

    const lines = box.textContent.split("\n").filter(Boolean);

    lastLine = lastPos ? lines[lastPos] : lines[lines.length - 1] || null;

    const isLastLineProgress = lastLine?.includes("B/s");
    const isNewLineProgress = newLines[0].includes("B/s");

    if (newLines.length > 1 && isNewLineProgress && newLines[1].includes("B/s")) {
      newLines.pop();
    }

    let progressUpdate = false;

    if (isLastLineProgress && isNewLineProgress) {
      progressUpdate = true;
      lastPos = lastPos || lines.length - 1;
      lines[lastPos] = newLines[0];
    } else if (isLastLineProgress && !isNewLineProgress) {
      lastPos = 0;
    }

    lines.push(...newLines.slice(progressUpdate ? 1 : 0));

    box.textContent = lines.join("\n") + "\n";

    localStorage.setItem("lastPos", lastPos);

    if (!progressUpdate || newLines.length > 1) {
      box.scrollTop = box.scrollHeight;
    }
  };

  ws.onerror = (event) => {
    console.error("WebSocket error:", event);
  };

  ws.onclose = () => {
    if (isConnected) {
      isConnected = false;

      if (isPageAlive && allowReconnect) {
        console.log("WebSocket connection closed. Attempting to reconnect...");
        setTimeout(() => connectWebSocket(allowReconnect), 2000);
      }
    } else {
      console.log("WebSocket connection could not be established.");
    }
  };
}

fetchLogs();

window.onbeforeunload = () => {
  isPageAlive = false;
  ws.close(1000, "User is leaving the page");
  saveBox();
};
