// Theme managed by manik.cc theme-config + theme-manager (loaded in <head>)

// Live log streaming
const logs = document.getElementById("logs");
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs`);

// Scroll to bottom on load
logs.scrollTop = logs.scrollHeight;

ws.onmessage = (event) => {
  logs.textContent += event.data;
  logs.scrollTop = logs.scrollHeight;
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};

ws.onclose = () => {
  logs.textContent += "\n[Connection closed]";
};
