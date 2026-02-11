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

submit.onclick = function () {
    console.log(`Sanitized content: ${sanitize(msg.value)}`)

    appendBubble(msg.value, false)

    if (msg.value === "Hello!") {
        appendBubble("Hello user!!!", true)
    }
}