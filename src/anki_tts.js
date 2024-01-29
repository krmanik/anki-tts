/**
 * Anki TTS
 * https://github.com/krmanik/anki-tts
 * krmanki
 * MIT
 */
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
function setConfig() {
    var TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    var VOICES_URL = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=" + TRUSTED_CLIENT_TOKEN;

    fetch(VOICES_URL).then(function (res) {
        return res.json();
    }).then(function (data) {
        for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
            var d = data_1[_i];
            var l = d.Locale;
            l = l.split("-")[0] || "default";
            if (!dict[l]) {
                dict[l] = [];
            }
            dict[l].push(d);
        }
        dict = Object.keys(dict).sort().reduce(function (acc, key) {
            acc[key] = dict[key];
            return acc;
        }, {});

        setLocale();
    });
}

function setVoice() {
    var selectedLocale = localeSelect.value;
    voiceSelect.innerHTML = "";

    for (var _i = 0, _a = dict[selectedLocale]; _i < _a.length; _i++) {
        var d = _a[_i];
        var option = document.createElement("option");
        option.value = d.ShortName;
        option.text = d.FriendlyName;
        voiceSelect.add(option);
    }
}

function setLocale() {
    var localeSelect = document.getElementById("localeSelect");
    var voiceSelect = document.getElementById("voiceSelect");

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
    var ttsLocale = localStorage.getItem("ttsLocale");
    var ttsVoice = localStorage.getItem("ttsVoice");
    return [ttsLocale, ttsVoice];
}

function setupEdgeTtsConfig() {
    var ttsButtonContainer = createElement("div", { id: "ttsButtonContainer" }, null, document.body);
    createElement("button", { id: "ttsPlayButton", onclick: "playTts()" }, "Play", ttsButtonContainer);
    createElement("button", { id: "ttsShowConfig", onclick: "showConfig()" }, "Config", ttsButtonContainer);

    var ttsConfigContainer = createElement("div", { id: "ttsConfigContainer", style: "display: none" }, null, document.body);
    var configDiv = createElement("div", { id: "msttsConfig" }, null, ttsConfigContainer);
    var configDivLocale = createElement("div", { id: "msttsConfigLocale" }, null, configDiv);
    createElement("label", { id: "localeSelectLabel", for: "localeSelect" }, "Select Locale ", configDivLocale);
    createElement("select", { id: "localeSelect" }, null, configDivLocale);
    var configDivVoice = createElement("div", { id: "msttsConfigVoice" }, null, configDiv);
    createElement("label", { id: "voiceSelectLabel", for: "voiceSelect" }, "Select Voice ", configDivVoice);
    createElement("select", { id: "voiceSelect", style: "width: 448px;" }, null, configDivVoice);
}

createStyle();
setupEdgeTtsConfig();

// https://gist.github.com/likev/c36fcc8a08ba1a2c5d08f9c7d806a0ad
// JS port of https://github.com/Migushthe2nd/MsEdgeTTS

socket = null;
ttsText = null;
ttsWindow = null;
ttsError = false;
ttsAudio = new Audio("");

function create_edge_TTS({ voice = "zh-CN-XiaoxiaoNeural", timeout = 10, auto_reconnect = true } = {}) {
    const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    const VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
    const SYNTH_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
    const BINARY_DELIM = "Path:audio\r\n";
    const VOICE_LANG_REGEX = /\w{2}-\w{2}/;

    let _outputFormat = "audio-24khz-48kbitrate-mono-mp3";
    let _voiceLocale = 'zh-CN';
    let _voice = voice;
    const _queue = { message: [], url_resolve: {}, url_reject: {} };
    let ready = false;

    function _SSMLTemplate(input) {
        return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${_voiceLocale}">
              <voice name="${_voice}">
                  ${input}
              </voice>
          </speak>`;
    }

    function uuidv4() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    create_new_ws();

    function setFormat(format) {
        if (format) {
            _outputFormat = format;
        }
        socket.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n
                  {
                      "context": {
                          "synthesis": {
                              "audio": {
                                  "metadataoptions": {
                                      "sentenceBoundaryEnabled": "false",
                                      "wordBoundaryEnabled": "false"
                                  },
                                  "outputFormat": "${_outputFormat}" 
                              }
                          }
                      }
                  }
              `);
    }

    async function createURL(requestId) {
        let index_message = 0;
        for (let message of _queue.message) {
            const isbinary = message instanceof Blob;

            if (!isbinary) {
                continue;
            }

            const data = await message.text();
            const Id = /X-RequestId:(.*?)\r\n/gm.exec(data)[1];

            if (Id !== requestId) {
                continue;
            }

            if (data.charCodeAt(0) === 0x00 && data.charCodeAt(1) === 0x67 && data.charCodeAt(2) === 0x58) {
                // Last (empty) audio fragment
                const blob = new Blob(_queue[requestId], { 'type': 'audio/mp3' });
                _queue[requestId] = null;
                const url = URL.createObjectURL(blob);
                _queue.url_resolve[requestId](url);
            } else {
                const index = data.indexOf(BINARY_DELIM) + BINARY_DELIM.length;
                const audioData = message.slice(index);
                _queue[requestId].push(audioData);
                _queue.message[index_message] = null;
            }
            ++index_message;
        }
    }

    function onopen(event) {
        setFormat();
        ready = true;
    }

    async function onmessage(event) {
        const isbinary = event.data instanceof Blob;
        _queue.message.push(event.data)
        if (!isbinary) {
            const requestId = /X-RequestId:(.*?)\r\n/gm.exec(event.data)[1];
            if (event.data.includes("Path:turn.end")) {
                createURL(requestId);
            }
        }
    }

    function onerror(event) {
        ready = false;
    }

    function onclose(event) {
        ready = false;
    }

    function addSocketListeners() {
        socket.addEventListener('open', onopen);
        socket.addEventListener('message', onmessage);
        socket.addEventListener('error', onerror);
        socket.addEventListener('close', onclose);
    }

    function create_new_ws() {
        try {
            if (ttsError) {
                return;
            }

            socket = new WebSocket(SYNTH_URL);

            socket.onerror = function (event) {
                ttsError = true;
            }

            addSocketListeners();
        } catch (e) {
            console.log(e);
        }
    }

    let toStream = function (input) {
        let requestSSML = _SSMLTemplate(input);
        const requestId = uuidv4().replaceAll('-', '');
        const request = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` + requestSSML.trim();

        _queue[requestId] = [];

        return new Promise((resolve, reject) => {
            _queue.url_resolve[requestId] = resolve, _queue.url_reject[requestId] = reject;

            if (!ready) {
                if (auto_reconnect) {
                    create_new_ws();
                    socket.addEventListener('open', _ => socket.send(request));

                    setTimeout(_ => { if (!ready) reject('reconnect timeout') }, timeout * 1000);
                }
                else reject('socket error or timeout');
            } else {
                socket.send(request)
            }
        });
    }

    async function play(input) {
        const url = await toStream(input);
        let play_resolve = function () { };
        ttsAudio.src = url;
        ttsAudio.onended = (e) => {
            play_resolve(true);
        }
        await ttsAudio.play();
        return new Promise((resolve, reject) => {
            play_resolve = resolve
        });
    }

    return new Promise((resolve, reject) => {
        setTimeout(_ => reject('socket open timeout'), timeout * 1000);
        // Connection opened
        socket.addEventListener('open', function (event) {
            resolve({
                play,
                toStream,
                setVoice: (voice, locale) => {
                    _voice = voice;
                    if (!locale) {
                        const voiceLangMatch = VOICE_LANG_REGEX.exec(_voice);
                        if (!voiceLangMatch) {
                            throw new Error("Could not infer voiceLocale from voiceName!");
                        }
                        _voiceLocale = voiceLangMatch[0];
                    } else {
                        _voiceLocale = locale;
                    }
                },
                setFormat,
                isReady: _ => ready
            })
        });
    });
}

async function edgeTtsPlay(text, voice = "zh-CN-XiaoxiaoNeural") {
    if (text === undefined || text === null || text === '') {
        return;
    }

    if (ttsError) {
        return;
    }

    ttsText = text;
    const tts = await create_edge_TTS({ voice });

    try {
        await tts.play(text);
    } catch (e) {
        ttsError = true;
        console.log(e);
    }
}
