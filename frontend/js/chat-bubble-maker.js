
let conversation = document.getElementById('conversation')

/**
 * Adds a chat bubble to the list
 * @param {string} text The contents of the message
 * @param {boolean} asAi If the `text` was sent by the AI agent
 * @returns {HTMLParagraphElement} The chat bubble is returned
 */
function appendBubble(text, asAi) {
    let bubble = document.createElement('p')

    bubble.classList.add("chatBubble", asAi ? 'ai' : 'client')
    bubble.innerText = text

    // TODO: Make chat bubble actually a bubble

    conversation.appendChild(bubble)

    return bubble
}

export { appendBubble }