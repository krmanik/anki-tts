/**
 * Anki TTS
 * https://github.com/krmanik/anki-tts
 * krmanki
 * MIT
 */

// Import TTS library
import kingdanxTtsBrowser from 'https://cdn.jsdelivr.net/npm/@kingdanx/edge-tts-browser@1.0.0/+esm';

// Global TTS instance and variables
let tts = null;
let voices = null;
let ttsAudio = new Audio("");

// Initialize TTS
async function initializeTts() {
    try {
        tts = new kingdanxTtsBrowser();
        voices = await kingdanxTtsBrowser.getVoices();
        console.log('TTS initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize TTS:', error);
        return false;
    }
}

function createStyle() {
    let style = `
#ttsConfigContainer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow: rgba(0, 0, 0, 0.35) 0px 8px 18px;
    z-index: 99999999999;
    width: 448px;
    padding: 14px;
    text-align: left;
    border-radius: 8px;
}

#ttsButtonContainer {
    margin: 10px 0;
}

#ttsButtonContainer button {
    margin: 5px;
    padding: 8px 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
}

#voiceSelect {
    width: 100%;
    padding: 5px;
    margin: 5px 0;
}

#closeBtn {
    float: right;
}

label {
    display: block;
    margin: 10px 0 5px 0;
    font-weight: bold;
}`;

    let styleElement = document.createElement("style");
    styleElement.innerHTML = style;
    document.head.appendChild(styleElement);
}

function createElement(tag, attributes, text, parent) {
    var element = document.getElementById(attributes.id);

    if (element) {
        return element;
    }

    var element = document.createElement(tag);
    for (var key in attributes) {
        if (attributes.hasOwnProperty(key)) {
            element.setAttribute(key, attributes[key]);
        }
    }

    if (text) {
        element.appendChild(document.createTextNode(text));
    }

    if (parent) {
        parent.appendChild(element);
    }

    return element;
}

function showConfig() {
    var configDiv = document.getElementById("ttsConfigContainer");
    configDiv.style.display = (configDiv.style.display === "none") ? "block" : "none";

    if (configDiv.style.display === "block") {
        setConfig();
    }
}

var dict = {};
async function setConfig() {
    try {
        if (!voices) {
            await initializeTts();
        }

        if (voices) {
            // Clear existing dict
            dict = {};
            
            for (var voice of voices) {
                var locale = voice.Locale.split("-")[0] || "default";
                if (!dict[locale]) {
                    dict[locale] = [];
                }
                dict[locale].push(voice);
            }
            
            // Sort dict by keys
            dict = Object.keys(dict).sort().reduce(function (acc, key) {
                acc[key] = dict[key];
                return acc;
            }, {});

            setLocale();
        }
    } catch (error) {
        console.error('Error setting config:', error);
    }
}

function setVoice() {
    var selectedLocale = localeSelect.value;
    voiceSelect.innerHTML = "";

    for (var voice of dict[selectedLocale]) {
        var option = document.createElement("option");
        option.value = voice.ShortName;
        option.text = voice.FriendlyName;
        voiceSelect.add(option);
    }
}

function setLocale() {
    var localeSelect = document.getElementById("localeSelect");
    var voiceSelect = document.getElementById("voiceSelect");

    // Clear existing options
    localeSelect.innerHTML = "";

    for (var key in dict) {
        if (dict.hasOwnProperty(key)) {
            var option = document.createElement("option");
            option.value = key;
            option.text = key + " (" + dict[key][0].FriendlyName.split("-")[1].split("(")[0] + ")";
            localeSelect.add(option);
        }
    }

    setVoice();

    let [ttsLocale, ttsVoice] = getLocal();
    if (ttsLocale) {
        localeSelect.value = ttsLocale;
        setVoice();
    }

    if (ttsVoice) {
        voiceSelect.value = ttsVoice;
    }

    localeSelect.onchange = (e) => {
        localStorage.setItem("ttsLocale", e.target.value);
        setVoice();
    }

    voiceSelect.onchange = (e) => {
        localStorage.setItem("ttsVoice", e.target.value);
    }
};

function getLocal() {
    var ttsLocale = localStorage.getItem("ttsLocale") || "zh";
    var ttsVoice = localStorage.getItem("ttsVoice") || "zh-CN-XiaoxiaoNeural";
    return [ttsLocale, ttsVoice];
}

// Rename ttsPlay to edgeTtsPlay to match the usage pattern
async function edgeTtsPlay(text, voice = "zh-CN-XiaoxiaoNeural") {
    if (!text || text.trim() === '') {
        console.warn('No text provided for TTS');
        return;
    }

    try {
        // Initialize TTS if not already done
        if (!tts) {
            const initialized = await initializeTts();
            if (!initialized) {
                throw new Error('Failed to initialize TTS');
            }
        }

        // Set voice parameters
        tts.tts.setVoiceParams({
            text: text.trim(),
            voice: voice,
        });

        

        // Generate audio blob
        const fileName = `tts-output-${crypto.randomUUID()}-${tts.tts.fileType.ext}`;
        const blob = await tts.ttsToFile(fileName);

        // Create URL and play audio
        const url = URL.createObjectURL(blob);
        ttsAudio = new Audio(url);

        await ttsAudio.play();
        
        // Clean up URL after playback
        ttsAudio.onended = () => {
            URL.revokeObjectURL(url);
        };

        console.log('TTS playback completed');
    } catch (error) {
        console.error('TTS Error:', error);
        throw error;
    }
}

function setupTtsConfig() {
    var ttsButtonContainer = createElement("div", { id: "ttsButtonContainer" }, null, document.body);
    createElement("button", { id: "ttsPlayButton", onclick: "playTts()" }, "Play", ttsButtonContainer);
    createElement("button", { id: "ttsShowConfig", onclick: "showConfig()" }, "Config", ttsButtonContainer);

    var ttsConfigContainer = createElement("div", { id: "ttsConfigContainer", style: "display: none" }, null, document.body);
    var configDiv = createElement("div", { id: "msttsConfig" }, null, ttsConfigContainer);
    var closeBtn = createElement("div", { id: "closeBtn" }, null, configDiv);
    closeBtn.innerText = "✖";
    closeBtn.onclick = () => { ttsConfigContainer.style.display = "none"; };
    var configDivLocale = createElement("div", { id: "msttsConfigLocale" }, null, configDiv);
    createElement("label", { id: "localeSelectLabel", for: "localeSelect" }, "Select Locale ", configDivLocale);
    createElement("select", { id: "localeSelect" }, null, configDivLocale);
    var configDivVoice = createElement("div", { id: "msttsConfigVoice" }, null, configDiv);
    createElement("label", { id: "voiceSelectLabel", for: "voiceSelect" }, "Select Voice ", configDivVoice);
    createElement("select", { id: "voiceSelect", style: "width: 448px;" }, null, configDivVoice);
}

// Core TTS function using the new library - kept for backwards compatibility
async function ttsPlay(text, voice = "zh-CN-XiaoxiaoNeural") {
    return await edgeTtsPlay(text, voice);
}

// Initialize everything
createStyle();
setupTtsConfig();

// Initialize TTS when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    await initializeTts();
});

// Make functions globally available
window.showConfig = showConfig;
window.ttsPlay = ttsPlay;
window.edgeTtsPlay = edgeTtsPlay;
window.getLocal = getLocal;
