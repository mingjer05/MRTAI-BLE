// Web Bluetooth & Serial Controller Logic

// -------------------------------------------------------------------------
// Bluetooth Configuration (from Arduino Code)
// -------------------------------------------------------------------------
const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_OTA = "6e400004-b5a3-f393-e0a9-e50e24dcca9e";


let bleDevice;
let rxCharacteristic;


// UI Elements
const connectBtn = document.getElementById('connectBtn');
const terminalEl = document.getElementById('terminal');

if (connectBtn) {
    connectBtn.addEventListener('click', connectBLE);
}
// Bluetooth Functionality
// -------------------------------------------------------------------------

async function connectBLE() {
    if (!navigator.bluetooth) {
        logMsg("❌ Web Bluetooth API not available.");
        logMsg("💡 Troubleshooting:");
        logMsg("   1. Use Chrome, Edge, or Opera browser");
        logMsg("   2. Ensure you're on HTTPS or localhost (NOT file://)");
        logMsg("   3. Current URL: " + window.location.href);
        alert("Web Bluetooth requires a Secure Context (HTTPS or localhost).\n" +
            "If you are using file://, please run start_server.bat and open http://localhost:8000");
        return;
    }

    // Check if we're in a secure context
    if (!window.isSecureContext) {
        logMsg("⚠️ Not in secure context!");
        logMsg("Current URL: " + window.location.href);
        logMsg("Please use: http://localhost:8000 or HTTPS");
        alert("Please run start_server.bat and open http://localhost:8000");
        return;
    }

    try {
        logMsg(`🔍 Scanning for robots...`);
        logMsg(`💡 Filtering for Service: ${SERVICE_UUID}`);
        logMsg("💡 Note: If 'SuperBot' doesn't appear, ensure you are using http://localhost:8000");
        connectBtn.innerText = "Scanning...";

        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [SERVICE_UUID] },
                { namePrefix: "Super" },
                { namePrefix: "ESP32" },
                { namePrefix: "Robot" }
            ],
            optionalServices: [SERVICE_UUID]
        });

        logMsg("✓ Device selected: " + bleDevice.name);
        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

        logMsg("🔗 Connecting to GATT Server...");
        connectBtn.innerText = "Connecting...";
        const server = await bleDevice.gatt.connect();

        logMsg("🔍 Getting service: " + SERVICE_UUID);
        const service = await server.getPrimaryService(SERVICE_UUID);

        logMsg("🔍 Getting RX characteristic...");
        rxCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_RX);

        logMsg("✅ Connected to " + bleDevice.name);
        connectBtn.innerText = "✓ Connected: " + bleDevice.name;
        connectBtn.classList.remove('primary');
        connectBtn.classList.add('success');
        connectBtn.disabled = true;

    } catch (error) {
        console.error('Connection failed!', error);

        // Provide specific error messages
        let errorMsg = "❌ Connection Failed: ";
        if (error.name === 'NotFoundError') {
            errorMsg += "No devices found\n";
            logMsg(errorMsg);
            logMsg("💡 Troubleshooting:");
            logMsg("   1. Power cycle the ESP32");
            logMsg("   2. Clear Bluetooth cache: chrome://bluetooth-internals");
            logMsg("   3. Check ESP32 Serial Monitor for device name");
            logMsg("   4. Try scanning with phone app (nRF Connect)");
        } else if (error.name === 'SecurityError') {
            errorMsg += "Security error\n";
            logMsg(errorMsg);
            logMsg("💡 Must use HTTPS or localhost");
            logMsg("   Run start_server.bat and use http://localhost:8000");
        } else if (error.name === 'NetworkError') {
            errorMsg += "Connection lost\n";
            logMsg(errorMsg);
            logMsg("💡 Device may be out of range or already connected");
        } else {
            errorMsg += error.message || error.toString();
            logMsg(errorMsg);
        }

        connectBtn.innerText = "Connect Robot (BLE)";
        connectBtn.classList.remove('success');
        connectBtn.classList.add('primary');
    }
}

function onDisconnected(event) {
    logMsg("Robot Disconnected.");
    connectBtn.innerText = "Connect Robot (BLE)";
    connectBtn.classList.remove('success');
    connectBtn.classList.add('primary');
    connectBtn.disabled = false;
    rxCharacteristic = null;
    bleDevice = null;
}

async function sendCommand(cmd) {
    if (!rxCharacteristic) {
        console.log("Not connected, cannot send:", cmd);
        return;
    }
    const encoder = new TextEncoder();
    try {
        await rxCharacteristic.writeValue(encoder.encode(cmd));
        console.log("Sent:", cmd);
    } catch (error) {
        console.error("Send failed:", error);
    }
}

// -------------------------------------------------------------------------
// Slider Control
// -------------------------------------------------------------------------
const speedSlider = document.getElementById('speedSlider');
const speedValueDisplay = document.getElementById('speedValue');

if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
        speedValueDisplay.innerText = e.target.value;
    });

    speedSlider.addEventListener('change', (e) => {
        sendCommand(`V:${e.target.value}`);
    });
}

// Attach Event Listeners to D-Pad
const buttons = document.querySelectorAll('.d-pad-btn');
buttons.forEach(btn => {
    // Touch Devices
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        btn.classList.add('active');
        sendCommand(btn.dataset.cmd);
    });
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        // Optional: Send 'S' (stop) on release if you want "dead man's switch" behavior
        // sendCommand('S'); 
    });

    // Mouse Devices
    btn.addEventListener('mousedown', () => {
        btn.classList.add('active');
        sendCommand(btn.dataset.cmd);
    });
    btn.addEventListener('mouseup', () => {
        btn.classList.remove('active');
    });
    btn.addEventListener('mouseleave', () => {
        btn.classList.remove('active');
    });
});



// -------------------------------------------------------------------------
// Robot Configuration via USB (Dynamic Naming)
// -------------------------------------------------------------------------
const setNameBtn = document.getElementById('setNameBtn');
const newNameInput = document.getElementById('newNameInput');

if (setNameBtn) {
    setNameBtn.addEventListener('click', async () => {
        const newName = newNameInput.value.trim();
        if (!newName) {
            alert("Please enter a name.");
            return;
        }

        if (!navigator.serial) {
            alert("Web Serial API not available in this browser.");
            return;
        }

        try {
            logMsg(`📡 Connecting to Robot via USB...`);
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200 });

            const encoder = new TextEncoder();
            const writer = port.writable.getWriter();
            const command = `NAME:${newName}\n`;

            logMsg(`✍️ Saving new name to memory: ${newName}`);
            await writer.write(encoder.encode(command));

            // Release writer and close port
            writer.releaseLock();
            await port.close();

            logMsg(`✅ Success! The robot is restarting as: ${newName}`);
            alert(`Name Saved! The robot will now appear as "${newName}" in the Bluetooth list.`);
        } catch (err) {
            console.error(err);
            logMsg(`❌ Error: ${err.message}`);
        }
    });
}

// -------------------------------------------------------------------------
// Firmware Flashing with esptool-js
// -------------------------------------------------------------------------
const flashBtn = document.getElementById('flashBtn');
const fileInput = document.getElementById('firmwareFile');

// Helper to log to our terminal div
function logMsg(text) {
    if (!terminalEl) return;
    terminalEl.style.display = 'block';
    terminalEl.innerHTML += text + "\n";
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

if (flashBtn && fileInput) {
    flashBtn.addEventListener('click', async () => {
        logMsg("Initialize Flashing...");

        // Environment Checks
        if (!navigator.serial) {
            alert("Web Serial API not available.\nUse Chrome/Edge/Opera.");
            return;
        }

        // If a local file is selected, use it
        if (fileInput.files.length === 0) {
            alert("Please select a .bin file first.");
            return;
        }

        const file = fileInput.files[0];
        fileName = file.name;
        logMsg(`Reading local file: ${fileName}`);
        fileData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsBinaryString(file);
        });

        try {
            logMsg("Requesting Serial Port...");
            const port = await navigator.serial.requestPort();

            logMsg("Connecting to ESP32...");
            const transport = new Transport(port);
            const loader = new ESPLoader({ transport: transport, baudrate: 115200 });

            logMsg("Connecting and detecting chip...");
            const chip = await loader.main();
            logMsg("Chip detected: " + chip);

            logMsg(`Starting Flash: ${fileName}`);
            await loader.writeFlash({
                fileArray: [{ data: fileData, address: 0 }],
                flashSize: 'keep',
                eraseAll: true,
                compress: true,
                reportProgress: (fileIndex, written, total) => {
                    const progress = Math.round((written / total) * 100);
                    if (progress % 10 === 0) {
                        logMsg(`Flashing: ${progress}%`);
                    }
                },
                calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)).toString(),
            });

            logMsg("Flash Complete! Resetting...");
            await transport.setDTR(false);
            await transport.setRTS(true);

            logMsg("✅ Flash Success!");
            alert("Firmware flashed successfully!");
        } catch (err) {
            console.error(err);
            logMsg("❌ Flashing Error: " + err.message);
        }
    });
}
