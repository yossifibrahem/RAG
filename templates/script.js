marked.setOptions({
    gfm: true, // Enable GitHub Flavored Markdown
    breaks: true, // Add <br> on single line breaks
    headerIds: true, // Add ids to headers
    highlight: function(code, lang) {
        if (Prism.languages[lang]) {
            return Prism.highlight(code, Prism.languages[lang], lang);
        }
        return code;
    },
    // Add more options for enhanced markdown features
    pedantic: false,
    smartLists: true,
    smartypants: true,
    xhtml: false
});

    // Helper: wrap <think>...</think> in a collapsible block (expanded by default)
    function wrapThinkBlocks(text) {
        return text.replace(/<think>([\s\S]*?)<\/think>/g, function(_, inner) {
            return `
<div class="think-block-collapsible">
<button class="think-toggle" onclick="this.nextElementSibling.classList.toggle('hidden'); this.classList.toggle('expanded');">
    💭 Deep Thinking
</button>
<div class="think-content hidden">${inner}</div>
</div>
`;
        });
    }

    function renderMath(text) {
        const codeBlocks = new Map();
        let counter = 0;

        text = text.replace(/```[\s\S]*?```|`[^`]+`/g, match => {
            const placeholder = `%%CODE_BLOCK_${counter}%%`;
            codeBlocks.set(placeholder, match);
            counter++;
            return placeholder;
        });

        text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
            try {
                return katex.renderToString(math, { displayMode: true });
            } catch (e) {
                console.error('KaTeX error:', e);
                return math;
            }
        });

        text = text.replace(/\\\((.*?)\\\)/g, (_, math) => {
            try {
                return katex.renderToString(math, { displayMode: false });
            } catch (e) {
                console.error('KaTeX error:', e);
                return math;
            }
        });

        text = text.replace(/\[math\]([\s\S]*?)\[\/math\]/g, (_, math) => {
            try {
                return katex.renderToString(math, { displayMode: true });
            } catch (e) {
                console.error('KaTeX error:', e);
                return math;
            }
        });

        text = text.replace(/\(math\)(.*?)\(\/math\)/g, (_, math) => {
            try {
                return katex.renderToString(math, { displayMode: false });
            } catch (e) {
                console.error('KaTeX error:', e);
                return math;
            }
        });

        // Add support for single $ inline math
        text = text.replace(/\$([^$\n]+?)\$/g, (_, math) => {
            try {
                return katex.renderToString(math.trim(), { displayMode: false });
            } catch (e) {
                console.error('KaTeX error:', e);
                return `$${math}$`;
            }
        });

        // Add support for double $$ display math
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
            try {
                return katex.renderToString(math.trim(), { displayMode: true });
            } catch (e) {
                console.error('KaTeX error:', e);
                return `$$${math}$$`;
            }
        });

        codeBlocks.forEach((value, key) => {
            text = text.replace(key, value);
        });

        // Wrap <think>...</think> blocks
        text = wrapThinkBlocks(text);

        return text;
    }

    const els = {
        messages: document.getElementById('messages'),
        userInput: document.getElementById('userInput'),
        sendButton: document.getElementById('sendButton'),
        interruptButton: document.getElementById('interruptButton'),
        newButton: document.getElementById('newButton')
    };
    
    let currentResponse = '';
    let currentMessageElement = null;
    let currentConversationId = null;
    const DEFAULT_ROWS = 1;
    let conversationToDelete = null;
    const deleteModal = document.getElementById('deleteModal');
    const confirmDelete = document.getElementById('confirmDelete');
    const cancelDelete = document.getElementById('cancelDelete');
    let isAtBottom = true;
    document.getElementById('deleteLastMessageButton').onclick = deleteLastMessage;
    document.getElementById('regenerateResponseButton').onclick = regenerateResponse;

    function isUserAtBottom() {
        const container = els.messages;
        return (container.scrollHeight - container.scrollTop - container.clientHeight) < 20;
    }

    function scrollToBottomIfNeeded() {
        if (isAtBottom) {
            els.messages.scrollTop = els.messages.scrollHeight;
        }
    }

    async function deleteConversation(conversationId, event) {
        event.stopPropagation();
        conversationToDelete = conversationId;
        deleteModal.style.display = 'block';
    }

    async function loadConversations() {
        try {
            const response = await fetch('/conversations');
            const conversations = await response.json();
            
            const container = document.getElementById('conversationsList');
            container.innerHTML = '';
            
            conversations.forEach(conv => {
                const div = document.createElement('div');
                div.className = `conversation-item ${conv.id === currentConversationId ? 'active' : ''}`;
                div.dataset.id = conv.id;
                div.innerHTML = `
                    <div class="conversation-content" onclick="loadConversation('${conv.id}')">
                        <div class="text-sm font-bold mb-1">${conv.name}</div>
                        <div class="text-xs text-gray-400">${new Date(conv.last_updated).toLocaleString()}</div>
                    </div>
                    <button class="delete-button" onclick="deleteConversation('${conv.id}', event)">
                        Delete
                    </button>
                `;
                
                container.appendChild(div);
            });
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }
    async function loadConversation(conversationId) {
        try {
            const response = await fetch(`/conversation/${conversationId}`);
            const data = await response.json();
            currentConversationId = conversationId;

            els.messages.innerHTML = '';
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.id === conversationId) {
                    item.classList.add('active');
                }
            });
            
            const messagesResponse = await fetch('/messages');
            const formattedMessages = await messagesResponse.json();
            
            const groupedMessages = formattedMessages.reduce((acc, msg) => {
                if (msg.isUser) {
                    acc.push(msg);
                } else {
                    if (msg.content || (msg.tool_results && msg.tool_results.length > 0)) {
                        if (acc.length > 0 && !acc[acc.length - 1].isUser) {
                            const lastMsg = acc[acc.length - 1];
                            if (msg.content) {
                                lastMsg.content = lastMsg.content ? 
                                    `${lastMsg.content}\n\n${msg.content}` : msg.content;
                            }
                            if (msg.tool_results) {
                                lastMsg.tool_results = (lastMsg.tool_results || [])
                                    .concat(msg.tool_results);
                            }
                        } else {
                            acc.push({
                                isUser: false,
                                content: msg.content || '',
                                tool_results: msg.tool_results || []
                            });
                        }
                    }
                }
                return acc;
            }, []);

            groupedMessages.forEach(msg => {
                const messageEl = createMessageElement(msg.isUser, msg.content);
                
                if (!msg.isUser) {
                    const container = messageEl.querySelector('.assistant-content');
                    
                    if (container && msg.content) {
                        const markdownDiv = document.createElement('div');
                        markdownDiv.className = 'markdown-content';
                        markdownDiv.innerHTML = marked.parse(renderMath(msg.content));
                        container.insertBefore(markdownDiv, container.firstChild);
                        highlightCodeBlocks(markdownDiv);
                    }
                    
                    if (msg.tool_results && msg.tool_results.length > 0) {
                        msg.tool_results.forEach(result => {
                            currentMessageElement = messageEl; 
                            addResult(result.name, result.content, result.args);
                            const resultContent = messageEl.querySelector('.assistant-content');
                            if (resultContent) {
                                highlightCodeBlocks(resultContent);
                            }
                        });
                    }
                }
            });
            
            scrollToBottomIfNeeded();
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    }

    window.currentMessageElement = null;

    async function deleteLastMessage() {
        try {
            const response = await fetch('/delete-last', { method: 'POST' });
            if (response.ok) {
                // Only update the UI, do NOT call handleMessage() or sendMessage()
                await loadConversation(currentConversationId);
            }
        } catch (error) {
            // handle error
        }
    }

    async function regenerateResponse() {
        try {
            const response = await fetch('/regenerate', { method: 'POST' });
            const data = await response.json();
            
            if (data.status === 'success') {
                const messages = els.messages.children;
                if (messages.length >= 1) {
                    messages[messages.length - 1].remove();
                    await handleMessage(data.message);
                }
            }
        } catch (error) {
            console.error('Error regenerating response:', error);
        }
    }

    function createMessageElement(isUser, content) {
        const avatar = isUser ? '/static/man.png' : '/static/bot.png';
        const textColor = isUser ? 'text-white' : 'text-gray-100';
        const alignment = isUser ? 'justify-end' : '';
        const className = isUser ? 'user-message' : 'assistant-message';
        
        const formattedContent = isUser ? content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>') : content;
        
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="flex items-start mb-4 ${alignment}">
                ${!isUser ? `
                    <img src="${avatar}" alt="Avatar" class="w-8 h-8 rounded-full">
                ` : ''}
                <div class="${className} rounded-lg py-2 px-4 max-w-3xl ${textColor}">
                    ${isUser ? `<div style="white-space: pre-wrap;">${formattedContent}</div>` : '<div class="assistant-content"></div>'}
                </div>
                ${isUser ? `<img src="${avatar}" alt="Avatar" class="w-8 h-8 rounded-full">` : ''}
            </div>
        `;
        els.messages.appendChild(div);
        scrollToBottomIfNeeded();
        return div;
    }

    function createLoadingIndicator(tool_info) {
        const div = document.createElement('div');
        div.className = 'tool-loading';
        if (tool_info.name === 'search') {
            div.innerHTML = `
                <div class="spinner"></div>
                <span>Searching the info for ${tool_info.args.query}</span>
            `;
        }else {
            div.innerHTML = `
                <div class="spinner"></div>
                <span>Using Tool ${tool_info.name}</span>
        `;
        }
        return div;
    }

    function addResult(name, data, args) {
        const escapeHtml = (unsafe) => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        const generators = {
            search: () => ({
                title: args.query, icon: '🔍',
                content: Array.isArray(data) ? 
                    `<div class="space-y-4">${data.map(r => 
                        `<div class="text-sm text-gray-300 bg-gray-800 p-3 rounded-lg">${r}</div>`
                    ).join('')}</div>` : 
                    `<div class="text-sm text-gray-300 bg-gray-800 p-3 rounded-lg">${data}</div>`,
                className: 'bg-gray-900'
            }),
        };
        const { title, icon, content } = (generators[name] || (() => ({
            title: name,
            icon: '🔧',
            content: `<pre><code>${escapeHtml(JSON.stringify(data, null, 2))}</code></pre>`
        })))();

        const container = currentMessageElement.querySelector('.assistant-content');
        if (!container) return;

        // Create or get the tool icons row
        let iconsRow = container.querySelector('.tool-icons-row');
        if (!iconsRow) {
            iconsRow = document.createElement('div');
            iconsRow.className = 'tool-icons-row';
            container.appendChild(iconsRow);
        }

        // Create the tool icon
        const toolIcon = document.createElement('div');
        toolIcon.className = 'tool-icon';
        toolIcon.innerHTML = `${icon} ${title}`;

        // Create the tool result container
        const resultDiv = document.createElement('div');
        resultDiv.className = 'tool-result';
        resultDiv.innerHTML = `<div class="tool-content">${content}</div>`;

        // Add click handler to toggle content
        toolIcon.onclick = () => {
            const isExpanded = resultDiv.classList.contains('expanded');
            const currentActive = container.querySelector('.tool-icon.active');
            const currentExpanded = container.querySelector('.tool-result.expanded');
            
            if (currentActive && currentActive !== toolIcon) {
                currentActive.classList.remove('active');
            }
            if (currentExpanded && currentExpanded !== resultDiv) {
                currentExpanded.classList.remove('expanded');
            }

            if (!isExpanded) {
                resultDiv.classList.add('expanded');
                toolIcon.classList.add('active');
                highlightCodeBlocks(resultDiv);
            } else {
                resultDiv.classList.remove('expanded');
                toolIcon.classList.remove('active');
            }
        };

        iconsRow.appendChild(toolIcon);
        container.appendChild(resultDiv);
    }

    // Streaming-aware <think> block handling
    let thinkBlockOpen = false;
    let thinkProcessed = ''; // holds the processed HTML so far
    let lastThinkIndex = 0;  // index in currentResponse up to which we've processed

    function processThinkBlocksStreaming(fullText) {
        // Only process new text since last call
        let text = fullText.slice(lastThinkIndex);
        let result = '';
        let idx = 0;
        while (idx < text.length) {
            if (!thinkBlockOpen) {
                const openIdx = text.indexOf('<think>', idx);
                if (openIdx === -1) {
                    result += text.slice(idx);
                    idx = text.length;
                } else {
                    result += text.slice(idx, openIdx);
                    result += `
<div class="think-block-collapsible">
<button class="think-toggle" onclick="this.nextElementSibling.classList.toggle('hidden'); this.classList.toggle('expanded');">
    💭 Deep Thinking
</button>
<div class="think-content hidden">
`;
                    thinkBlockOpen = true;
                    idx = openIdx + 7;
                }
            } else {
                const closeIdx = text.indexOf('</think>', idx);
                if (closeIdx === -1) {
                    result += text.slice(idx);
                    idx = text.length;
                } else {
                    result += text.slice(idx, closeIdx);
                    result += '</div></div>';
                    thinkBlockOpen = false;
                    idx = closeIdx + 8;
                }
            }
        }
        lastThinkIndex = fullText.length;
        return result;
    }

    function processStreamMessage(line) {
        if (!line.startsWith('data: ')) return;
        
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;
        
        try {
            const parsed = JSON.parse(data);
            const container = currentMessageElement.querySelector('.assistant-content');
            const existingLoader = container.querySelector('.tool-loading');
            switch (parsed.type) {
                case 'content':
                    currentResponse += parsed.content;
                    let markdownDiv = container.querySelector('.markdown-content');
                    if (!markdownDiv) {
                        markdownDiv = document.createElement('div');
                        markdownDiv.className = 'markdown-content';
                        container.insertBefore(markdownDiv, container.firstChild);
                    }
                    // --- changed: process <think> tags as streaming ---
                    let processed = processThinkBlocksStreaming(currentResponse);
                    markdownDiv.innerHTML = marked.parse(renderMath(thinkProcessed + processed));
                    thinkProcessed += processed;
                    highlightCodeBlocks(markdownDiv);
                    break;
                    
                case 'tool':
                    if (existingLoader) {
                        existingLoader.remove();
                    }
                    addResult(parsed.name, parsed.content, parsed.args);
                    break;
                    
                case 'tool-start':
                    if (existingLoader) {
                        existingLoader.remove();
                    }
                    container.appendChild(createLoadingIndicator(parsed));
                    break;
            }
            
        } catch (error) {
            console.error('Parse error:', error, 'Data:', data);
        }
    }
    async function handleMessage(existingMessage = null) {
        const message = existingMessage || els.userInput.value.trim();
        if (!message) return;

        if (!existingMessage) {
            els.userInput.value = '';
            els.userInput.rows = DEFAULT_ROWS;
            createMessageElement(true, message);
        }

        // Disable all control buttons during streaming
        els.sendButton.classList.add('hidden');
        els.interruptButton.classList.remove('hidden');
        document.getElementById('regenerateResponseButton').disabled = true;
        document.getElementById('deleteLastMessageButton').disabled = true;

        currentMessageElement = createMessageElement(false);
        currentResponse = '';
        thinkBlockOpen = false;
        thinkProcessed = '';
        lastThinkIndex = 0;

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                decoder.decode(value)
                    .split('\n')
                    .filter(Boolean)
                    .forEach(processStreamMessage);
                    
                scrollToBottomIfNeeded();
            }
            await loadConversations();
        } catch (error) {
            console.error('Error:', error);
            currentMessageElement.querySelector('.assistant-content').innerHTML += 
                `<p class="text-red-500">Error: ${error.message}</p>`;
        } finally {
            els.sendButton.classList.remove('hidden');
            els.interruptButton.classList.add('hidden');
            els.userInput.focus();
            document.getElementById('regenerateResponseButton').disabled = false;
            document.getElementById('deleteLastMessageButton').disabled = false;
            document.querySelectorAll('pre code').forEach(block => Prism.highlightElement(block));
        }
    }

    function adjustTextareaHeight() {
        const textarea = els.userInput;
        textarea.rows = DEFAULT_ROWS;
        const maxRows = 10;
        const lines = textarea.value.split('\n').length;
        const calculatedRows = Math.min(Math.max(lines, DEFAULT_ROWS), maxRows);
        
        textarea.rows = calculatedRows;
        textarea.style.overflowY = lines > maxRows ? 'auto' : 'hidden';
    }
    els.sendButton.onclick = (event) => {
        event.preventDefault();
        handleMessage();
    };
    els.userInput.onkeypress = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleMessage();
        }
    };
    els.userInput.oninput = adjustTextareaHeight;
    
    els.interruptButton.onclick = async () => {
        try {
            await fetch('/interrupt', { method: 'POST' });
        } catch (error) {
            console.error('Error interrupting:', error);
        } finally {
            els.interruptButton.classList.add('hidden');
            els.sendButton.classList.remove('hidden');
            els.sendButton.disabled = false;
            els.userInput.disabled = false;
            document.querySelectorAll('.tool-loading').forEach(el => el.remove());
    
            if (currentMessageElement) {
                const assistantContent = currentMessageElement.querySelector('.assistant-content');
                if (assistantContent) {
                    let markdownDiv = assistantContent.querySelector('.markdown-content');
                    
                    let fixedContent = currentResponse;
                    if (currentResponse.includes('```') && 
                        (currentResponse.match(/```/g) || []).length % 2 !== 0) {
                        fixedContent += '\n```';
                    }
                    
                    if (markdownDiv) {
                        markdownDiv.innerHTML = marked.parse(renderMath(fixedContent));
                    } else {
                        markdownDiv = document.createElement('div');
                        markdownDiv.className = 'markdown-content';
                        markdownDiv.innerHTML = marked.parse(renderMath(fixedContent));
                        assistantContent.insertBefore(markdownDiv, assistantContent.firstChild);
                    }
                    
                    highlightCodeBlocks(markdownDiv);
                }
            }
            
            currentResponse = '';
            currentMessageElement = null;
            els.userInput.focus();
        }
    };
    els.newButton.onclick = async () => {
        try {
            const response = await fetch('/new', { method: 'POST' });
            const data = await response.json();
            
            currentConversationId = data.conversation_id;
            els.messages.innerHTML = '';
            await loadConversations();
        } catch (error) {
            console.error('Error creating new conversation:', error);
        }
    };

    cancelDelete.onclick = () => {
        deleteModal.style.display = 'none';
        conversationToDelete = null;
    };
    deleteModal.onclick = (event) => {
        if (event.target === deleteModal) {
            deleteModal.style.display = 'none';
            conversationToDelete = null;
        }
    };

    confirmDelete.onclick = async () => {
        if (!conversationToDelete) return;

        try {
            const response = await fetch(`/conversation/${conversationToDelete}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.status === 'success') {
                if (conversationToDelete === currentConversationId) {
                    els.messages.innerHTML = '';
                    currentConversationId = null;
                }
                await loadConversations();
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
        } finally {
            deleteModal.style.display = 'none';
            conversationToDelete = null;
        }
    };

    els.messages.onscroll = () => {
        isAtBottom = isUserAtBottom();
    };
    document.querySelector('.toggle-conversations').onclick = () => {
        const toggleBtn = document.querySelector('.toggle-conversations');
        const isExpanded = toggleBtn.dataset.expanded === 'true';
        
        document.querySelector('.conversation-list').classList.toggle('visible');
        document.querySelector('.content-wrapper').classList.toggle('shifted');
        document.querySelector('.input-container').classList.toggle('shifted');
    
        toggleBtn.dataset.expanded = (!isExpanded).toString();            
        const menuImg = toggleBtn.querySelector('img');
        menuImg.style.transform = isExpanded ? '' : 'scaleX(-1)';
    };

    function highlightCodeBlocks(element) {
        element.querySelectorAll('pre code').forEach(block => {
            if (!block.dataset.highlighted) {
                const parent = block.parentElement;
                // Remove any existing Prism toolbar if present
                const existingToolbar = parent.querySelector('.prism-toolbar');
                if (existingToolbar) {
                    existingToolbar.remove();
                }
                
                const language = block.className.replace('language-', '');
                
                const wrapper = document.createElement('div');
                wrapper.className = 'code-toolbar';
                
                const header = document.createElement('div');
                header.className = 'code-header';
                header.innerHTML = `
                    <span>${language}</span>
                    <button class="copy-button" onclick="copyCode(this)">Copy</button>
                `;
                
                parent.parentNode.insertBefore(wrapper, parent);
                wrapper.appendChild(header);
                wrapper.appendChild(parent);
                
                parent.className = `pre-wrapper position-relative ${parent.className}`;
                block.className = `language-${language}`;
                
                Prism.highlightElement(block);
                block.dataset.highlighted = 'true';
            }
        });
    }

    function copyCode(button) {
        const pre = button.closest('.code-toolbar').querySelector('pre');
        const code = pre.textContent;
        
        navigator.clipboard.writeText(code).then(() => {
            button.textContent = 'Copied!';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.textContent = 'Copy';
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy code:', err);
            button.textContent = 'Error!';
            
            setTimeout(() => {
                button.textContent = 'Copy';
            }, 2000);
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await loadConversations();
        try {
            const response = await fetch('/messages');
            const messages = await response.json();
            
            const groupedMessages = messages.reduce((acc, msg) => {
                if (msg.isUser) {
                    acc.push(msg);
                } else {
                    if (msg.content || (msg.tool_results && msg.tool_results.length > 0)) {
                        if (acc.length > 0 && !acc[acc.length - 1].isUser) {
                            const lastMsg = acc[acc.length - 1];
                            if (msg.content) {
                                lastMsg.content = lastMsg.content ? 
                                    `${lastMsg.content}\n\n${msg.content}` : msg.content;
                            }
                            if (msg.tool_results) {
                                lastMsg.tool_results = (lastMsg.tool_results || [])
                                    .concat(msg.tool_results);
                            }
                        } else {
                            acc.push({
                                isUser: false,
                                content: msg.content || '',
                                tool_results: msg.tool_results || []
                            });
                        }
                    }
                }
                return acc;
            }, []);
            
            groupedMessages.forEach(msg => {
                const messageEl = createMessageElement(msg.isUser, msg.content);
                
                if (!msg.isUser) {
                    const container = messageEl.querySelector('.assistant-content');
                    
                    if (container && msg.content) {
                        const markdownDiv = document.createElement('div');
                        markdownDiv.className = 'markdown-content';
                        markdownDiv.innerHTML = marked.parse(renderMath(msg.content));
                        container.insertBefore(markdownDiv, container.firstChild);
                        highlightCodeBlocks(markdownDiv);
                    }
                    
                    if (msg.tool_results && msg.tool_results.length > 0) {
                        msg.tool_results.forEach(result => {
                            currentMessageElement = messageEl;
                            addResult(result.name, result.content, result.args);
                        });
                    }
                    
                    highlightCodeBlocks(messageEl);
                }
            });
            
            highlightCodeBlocks(els.messages);
            
            scrollToBottomIfNeeded();
        } catch (error) {
            console.error('Error loading messages:', error);
        }
        
        els.userInput.focus();
        adjustTextareaHeight();
    });