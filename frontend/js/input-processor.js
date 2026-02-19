import { appendBubble } from './chat-bubble-maker.js';

let msg = document.getElementById("msgInput")
let submit = document.getElementById("msgSubmit")

/**
 * Replaces sussy XSS vectors with safer representations 
 * @param {string} string The string to sanitize for anti-XSS
 * @returns The sanitized string
 */
function sanitize(string) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return string.replace(reg, (match) => (map[match]));
}

function update_msg_bubble() {

}

submit.onclick = function () {
    console.log(`Sanitized content: ${sanitize(msg.value)}`)

    const text = sanitize(msg.value).trim()
    if (!text) {
        console.log("text empty......")
        return
    };

    submit.disabled = true
    const userBubble = appendBubble(msg.value, false)

    msg.value = ""

    const es = new EventSource("/stream?q=" + encodeURIComponent(text))

    const aiBubble = appendBubble("", true)

    es.onmessage = (ev) => {
        if (ev.data === "[DONE]") {
            es.close()
            submit.disabled = false
            msg.focus()
            return;
        }


        aiBubble.innerHTML += ev.data
    }

    es.onerror = () => {
        es.close()
        aiBubble.innerHTML += "\n\n [[STREAM ERROR]]"
        submit.disabled = false

    }// TODO: Make request to AI agent located in the cyberlab
}