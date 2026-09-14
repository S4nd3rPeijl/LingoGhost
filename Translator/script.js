const video = document.getElementById('screenVideo');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const statusText = document.getElementById('status');
const languageSelect = document.getElementById('languageSelect');
const controlPanel = document.getElementById('controlPanel');
const closeBtn = document.getElementById('closeBtn');
const scanIndicator = document.getElementById('scanIndicator');

// Settings elements
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsPanel = document.getElementById('settingsPanel');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');

let isScanning = false;
let streamActive = false;

// --- API KEY MANAGEMENT VIA LOCALSTORAGE ---
// Load saved API Key on startup
let apiKey = localStorage.getItem('gemini_api_key') || '';
if (apiKey) {
  apiKeyInput.value = apiKey;
} else {
  // If no API Key is saved, open settings panel immediately
  settingsPanel.classList.remove('hidden');
}

// Toggle settings panel via gear icon
settingsToggleBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

// Save API key locally
saveApiKeyBtn.addEventListener('click', () => {
  const newKey = apiKeyInput.value.trim();
  if (newKey) {
    localStorage.setItem('gemini_api_key', newKey);
    apiKey = newKey;
    statusText.innerText = "✅ API Key saved locally!";
    settingsPanel.classList.add('hidden');
  } else {
    statusText.innerText = "⚠️ Please enter a valid key.";
  }
});

// --- DYNAMIC MOUSE-IGNORE LOGIC ---
try {
  const { ipcRenderer } = require('electron');

  const enableClicks = () => {
    ipcRenderer.send('set-ignore-mouse-events', false);
  };

  const disableClicks = () => {
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
  };

  [closeBtn, controlPanel].forEach(element => {
    element.addEventListener('mouseenter', enableClicks);
    element.addEventListener('mouseleave', disableClicks);
  });

  ipcRenderer.on('trigger-scan', () => {
    triggerManualScan();
  });
} catch (e) {}

// Close button action
closeBtn.addEventListener('click', () => {
  window.close();
});

// Screen share setup
startBtn.addEventListener('click', async () => {
  if (!apiKey) {
    statusText.innerText = "⚠️ Enter API key first via ⚙️";
    settingsPanel.classList.remove('hidden');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ 
      video: { frameRate: { ideal: 15, max: 30 } } 
    });
    video.srcObject = stream;
    streamActive = true;

    // Hide control panel
    controlPanel.classList.add('hidden');

    stream.getVideoTracks()[0].addEventListener('ended', () => {
      streamActive = false;
      controlPanel.classList.remove('hidden');
    });

  } catch (err) {
    statusText.innerText = "Error: " + err.message;
  }
});

// Manual scan triggered via shortcut Ctrl+Shift+S
async function triggerManualScan() {
  if (!streamActive || isScanning) return;

  if (!apiKey) {
    showScanStatus("⚠️ No API Key saved!");
    setTimeout(() => hideScanStatus(), 3000);
    return;
  }

  isScanning = true;
  showScanStatus("⏳ Translating...");

  try {
    const count = await scanFrame();
    if (count > 0) {
      showScanStatus(`✅ ${count} text block(s) translated!`);
    } else {
      showScanStatus("⚠️ No text found");
    }
    setTimeout(() => hideScanStatus(), 2500);
  } catch (err) {
    console.error(err);
    showScanStatus("❌ Translation error");
    setTimeout(() => hideScanStatus(), 3000);
  } finally {
    isScanning = false;
  }
}

function showScanStatus(message) {
  scanIndicator.innerText = message;
  scanIndicator.classList.remove('hidden');
}

function hideScanStatus() {
  scanIndicator.classList.add('hidden');
}

async function scanFrame() {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  const targetLang = languageSelect.value;

  const promptText = `Translate all text in the image that is not in ${targetLang} to ${targetLang}. Also describe what each block of code does, if code is visible. Return each translated block/paragraph along with its bounding box box_2d scaled to [0, 1000].`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: "image/jpeg", data: base64Image } }
        ]
      }],
      generationConfig: {
        temperature: 0.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              translated: { type: "STRING" },
              box_2d: {
                type: "ARRAY",
                items: { type: "INTEGER" }
              }
            },
            required: ["translated", "box_2d"]
          }
        }
      }
    })
  });

  const data = await response.json();
  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    return 0;
  }

  const items = JSON.parse(data.candidates[0].content.parts[0].text.trim());
  overlay.innerHTML = '';

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  let count = 0;

  items.forEach(item => {
    if (!item.box_2d || item.box_2d.length < 4 || !item.translated) return;
    const [ymin, xmin, ymax, xmax] = item.box_2d;
    
    const box = document.createElement('div');
    box.className = 'text-box';
    
    const top = (ymin / 1000) * screenHeight;
    const left = (xmin / 1000) * screenWidth;
    const width = ((xmax - xmin) / 1000) * screenWidth;
    const height = ((ymax - ymin) / 1000) * screenHeight;

    box.style.top = `${top}px`;
    box.style.left = `${left}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    box.innerText = item.translated;
    overlay.appendChild(box);

    let fontSize = 20; 
    box.style.fontSize = `${fontSize}px`;

    while (box.scrollHeight > box.clientHeight && fontSize > 8) {
      fontSize -= 0.5;
      box.style.fontSize = `${fontSize}px`;
    }

    count++;
  });

  return count;
}