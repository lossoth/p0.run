import { Renderer } from './Renderer.js';

export class MobileRenderer extends Renderer {
    constructor() {
        super();
        this._state = {
            view: 'welcome',
            scenarios: [],
            selectedScenarioId: null,
            node: null,
            scenarioDescription: null,
            actions: [],
            completion: null,
            isLoading: false
        };
        this._callbacks = {
            onWelcome: [],
            onScenarioSelect: [],
            onActionSubmit: [],
            onExplanationSubmit: [],
            onPlayAgain: []
        };
        // Render initial welcome view once DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._render());
        } else {
            this._render();
        }
    }

    _deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this._deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    updateState(partialState) {
        this._state = this._deepMerge(this._state, partialState);
        this._render();
    }

    onWelcome(callback) {
        this._callbacks.onWelcome.push(callback);
    }

    onScenarioSelect(callback) {
        this._callbacks.onScenarioSelect.push(callback);
    }

    onActionSubmit(callback) {
        this._callbacks.onActionSubmit.push(callback);
    }

    onExplanationSubmit(callback) {
        this._callbacks.onExplanationSubmit.push(callback);
    }

    onPlayAgain(callback) {
        this._callbacks.onPlayAgain.push(callback);
    }

    _triggerScenarioSelect(scenarioId, description) {
        this._callbacks.onScenarioSelect.forEach(cb => cb(scenarioId, description));
    }

    _triggerWelcome() {
        this._callbacks.onWelcome.forEach(cb => cb());
    }

    _triggerActionSubmit(actionId) {
        this._callbacks.onActionSubmit.forEach(cb => cb(actionId));
    }

    _triggerExplanationSubmit(explanation) {
        this._callbacks.onExplanationSubmit.forEach(cb => cb(explanation));
    }

    _triggerPlayAgain() {
        this._callbacks.onPlayAgain.forEach(cb => cb());
    }

    printWelcome() {
        this.updateState({ view: 'welcome' });
        this._triggerWelcome();
    }

    printNode(node, description = null) {
        this.updateState({
            view: 'playing',
            node: node,
            scenarioDescription: description
        });
    }

    printActions(actions) {
        this.updateState({ actions: actions || [] });
    }

    printCompletion(score, maxPoints, bestExplanation = null, path = null, message = null) {
        this.updateState({
            view: 'completion',
            completion: {
                score,
                maxPoints,
                bestExplanation,
                path,
                message,
                feedback: this._getFeedbackMessage(maxPoints > 0 ? score / maxPoints : 0)
            }
        });
    }

    _getFeedbackMessage(ratio) {
        const highScoreMessages = [
            "You handled this like a production engineer.",
            "Calm, precise, no wasted moves.",
            "Clean execution. No panic."
        ];
        const midScoreMessages = [
            "Not bad, but you missed important signals.",
            "You got there, but it was messy.",
            "Decent recovery, but not optimal."
        ];
        const lowScoreMessages = [
            "You're guessing. Slow down and investigate.",
            "You're guessing. Production is not a casino.",
            "You're reacting, not debugging."
        ];
        const veryLowScoreMessages = [
            "Please step away from the keyboard!",
            "You made things worse!",
            "Production survived. Barely!"
        ];

        if (ratio >= 0.85) {
            return highScoreMessages[Math.floor(Math.random() * highScoreMessages.length)];
        } else if (ratio >= 0.60) {
            return midScoreMessages[Math.floor(Math.random() * midScoreMessages.length)];
        } else if (ratio >= 0.40) {
            return lowScoreMessages[Math.floor(Math.random() * lowScoreMessages.length)];
        } else {
            return veryLowScoreMessages[Math.floor(Math.random() * veryLowScoreMessages.length)];
        }
    }

    renderScenarios(scenarios) {
        this.updateState({
            view: 'welcome',
            scenarios: scenarios || [],
            isLoading: false,
            selectedScenarioId: null,
            node: null,
            scenarioDescription: null,
            actions: [],
            completion: null
        });
    }

    _render() {
        this._showView(this._state.view);

        switch (this._state.view) {
            case 'welcome':
                this._renderWelcome();
                break;
            case 'scenarios':
                this._renderScenarios();
                break;
            case 'playing':
                this._renderNode();
                this._renderActions();
                break;
            case 'completion':
                this._renderCompletion();
                break;
            case 'explaining':
                this._renderExplaining();
                break;
            case 'loading':
                this._renderLoading();
                break;
        }
    }

    _showView(viewId) {
        const containerIds = ['welcome', 'scenarios', 'node', 'actions', 'completion', 'explaining'];

        containerIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            let visible = false;
            if (viewId === 'welcome' && (id === 'welcome' || id === 'scenarios')) {
                visible = true;
            } else if (viewId === 'playing' && (id === 'node' || id === 'actions')) {
                visible = true;
            } else if (id === viewId) {
                visible = true;
            }

            if (visible) {
                el.style.display = 'flex';
                el.classList.add('active');
            } else {
                el.style.display = 'none';
                el.classList.remove('active');
            }
        });
    }

    _renderScenarios() {
        const container = document.getElementById('scenarios');
        if (!container) return;

        container.innerHTML = '';

        if (!this._state.scenarios || this._state.scenarios.length === 0) {
            return;
        }

        let html = '<div class="scenario-list">';
        this._state.scenarios.forEach((s, i) => {
            const title = this._escapeHtml(s.title || s.id || `Scenario ${i + 1}`);
            let desc = '';
            if (s.description) {
                const first = s.description.split('.')[0];
                desc = first.length > 100 ? first.substring(0, 100) + '...' : first;
            }
            const difficulty = s.difficulty ? `<span class="badge badge-${s.difficulty}">${this._escapeHtml(s.difficulty)}</span>` : '';
            const scenarioId = s.id || s.title;
            html += `
                <div class="scenario-card" data-scenario="${this._escapeHtml(scenarioId)}">
                    <div class="card-header">
                        <span class="card-number">${i + 1}</span>
                        <h3 class="card-title">${title}</h3>
                        ${difficulty}
                    </div>
                    ${desc ? `<p class="card-desc">${this._escapeHtml(desc)}</p>` : ''}
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.scenario-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.scenario;
                const selectedScenario = this._state.scenarios.find(s => (s.id || s.title) === id);
                const description = selectedScenario ? selectedScenario.description || null : null;
                this._triggerScenarioSelect(id, description);
            });
        });
    }

    _renderWelcome() {
        const container = document.getElementById('welcome');
        if (!container) return;

        container.innerHTML = `
            <div class="welcome-screen">
                <div class="welcome-header">
                    <p class="welcome-subtitle">Test your debugging skills</p>
                </div>
                <div class="welcome-content">
                    <p class="welcome-desc">Handle realistic production incidents. Make the right calls.</p>
                </div>
            </div>
        `;

        this._renderScenarios();
    }

    _renderExplaining() {
        const container = document.getElementById('explaining');
        if (!container || !this._state.completion) return;

        const { score, maxPoints } = this._state.completion;
        const ratio = maxPoints > 0 ? score / maxPoints : 0;
        const scoreClass = ratio < 0.4 ? 'score-low' : 'score-high';

        container.innerHTML = `
            <div class="explaining-header">
                <h2 class="explaining-title">Explain Your Solution</h2>
            </div>
            <div class="score-display ${scoreClass}">
                <span class="score-value">${score}</span>
                <span class="score-divider">/</span>
                <span class="score-max">${maxPoints}</span>
            </div>
            <div class="explain-section">
                <h3 class="explain-label">Briefly explain what caused the incident and why your solution worked.</h3>
                <p class="explain-hint">Maximum 500 characters, no links allowed.</p>
                <textarea id="explanation-input" maxlength="500" placeholder="Enter your explanation..."></textarea>
                <div class="explain-footer">
                    <span id="char-count">0 / 500</span>
                    <button id="submit-explanation" class="submit-btn" disabled>Submit</button>
                </div>
            </div>
            <button id="play-again" class="play-again-btn">Play again</button>
        `;

        const textarea = document.getElementById('explanation-input');
        const charCount = document.getElementById('char-count');
        const submitBtn = document.getElementById('submit-explanation');

        if (textarea && charCount && submitBtn) {
            textarea.addEventListener('input', () => {
                const len = textarea.value.length;
                charCount.textContent = `${len} / 500`;
                submitBtn.disabled = len === 0;
            });

            submitBtn.addEventListener('click', () => {
                const explanation = textarea.value.trim();
                if (explanation) {
                    this._triggerExplanationSubmit(explanation);
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Submitted';
                }
            });
        }

        const playAgainBtn = document.getElementById('play-again');
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => {
                this._triggerPlayAgain();
            });
        }
    }

    _renderNode() {
        const container = document.getElementById('node');
        if (!container) return;

        container.innerHTML = '';

        if (!this._state.node) {
            container.innerHTML = '<p class="no-items">No content available.</p>';
            return;
        }

        const nodeName = this._escapeHtml(this._state.node.id || this._state.node.name || this._state.node.title || 'Incident');

        if (this._state.scenarioDescription) {
            const descDiv = document.createElement('div');
            descDiv.className = 'scenario-desc';
            descDiv.textContent = this._state.scenarioDescription;
            container.appendChild(descDiv);
        }

        const headerDiv = document.createElement('div');
        headerDiv.className = 'node-header';
        headerDiv.innerHTML = `<span class="node-label">NODE</span><span class="node-name">${nodeName}</span>`;
        container.appendChild(headerDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'node-content';

        const rawContent = this._state.node.content || '';

        if (rawContent) {
            contentDiv.textContent = rawContent;
        } else if (this._state.node.description) {
            contentDiv.textContent = this._state.node.description;
        } else {
            contentDiv.innerHTML = '<em>No description available.</em>';
        }

        container.appendChild(contentDiv);
    }

    _renderActions() {
        const container = document.getElementById('actions');
        if (!container) return;

        container.innerHTML = '';

        if (!this._state.actions || this._state.actions.length === 0) {
            container.innerHTML = '<p class="no-items">No actions available.</p>';
            return;
        }

        let html = '<div class="action-list">';
        this._state.actions.forEach((action, i) => {
            const label = this._escapeHtml(action.label || `Action ${i + 1}`);
            const actionId = action.id;
            html += `
                <button class="action-btn" data-action-id="${actionId}">
                    <span class="action-num">${i + 1}</span>
                    <span class="action-label">${label}</span>
                </button>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const actionId = parseInt(btn.dataset.actionId, 10);
                this._triggerActionSubmit(actionId);
            });
        });
    }

    _renderCompletion() {
        const container = document.getElementById('completion');
        if (!container || !this._state.completion) return;

        const { score, maxPoints, bestExplanation, path, message, feedback } = this._state.completion;
        const ratio = maxPoints > 0 ? score / maxPoints : 0;
        const scoreClass = ratio < 0.4 ? 'score-low' : 'score-high';

        let html = `
            <div class="completion-header">
                <h2 class="completion-title">INCIDENT RESULT</h2>
            </div>
            <div class="score-display ${scoreClass}">
                <span class="score-value">${score}</span>
                <span class="score-divider">/</span>
                <span class="score-max">${maxPoints}</span>
            </div>
        `;

        if (message) {
            html += `<p class="result-message">Result: <strong>FAILURE</strong><br>Reason: ${this._escapeHtml(message)}</p>`;
        }

        html += `<p class="feedback-text">${feedback}</p>`;

        if (path && path.length > 0) {
            html += `
                <div class="path-section">
                    <h3 class="path-label">Your path:</h3>
                    <p class="path-list">${path.map(p => this._escapeHtml(p)).join(' <span class="path-arrow">→</span> ')}</p>
                </div>
            `;
        }

        if (bestExplanation) {
            html += `
                <div class="top-solution">
                    <h3 class="solution-label">TOP SOLUTION</h3>
                    <p class="solution-text">${this._escapeHtml(bestExplanation)}</p>
                </div>
            `;
        }

        html += `
            <div class="explain-section">
                <h3 class="explain-label">Explain briefly what caused the incident and why your solution worked.</h3>
                <p class="explain-hint">Maximum 500 characters, no links allowed.</p>
                <textarea id="explanation-input" maxlength="500" placeholder="Enter your explanation..."></textarea>
                <div class="explain-footer">
                    <span id="char-count">0 / 500</span>
                    <button id="submit-explanation" class="submit-btn" disabled>Submit</button>
                </div>
            </div>
            <button id="play-again" class="play-again-btn">Play again</button>
        `;

        container.innerHTML = html;

        const textarea = document.getElementById('explanation-input');
        const charCount = document.getElementById('char-count');
        const submitBtn = document.getElementById('submit-explanation');

        textarea.addEventListener('input', () => {
            const len = textarea.value.length;
            charCount.textContent = `${len} / 500`;
            submitBtn.disabled = len === 0;
        });

        submitBtn.addEventListener('click', () => {
            const explanation = textarea.value.trim();
            if (explanation) {
                this._triggerExplanationSubmit(explanation);
                submitBtn.disabled = true;
                submitBtn.textContent = 'Submitted';
            }
        });

        const playAgainBtn = document.getElementById('play-again');
        playAgainBtn.addEventListener('click', () => {
            this._triggerPlayAgain();
        });
    }

    _renderLoading() {
        const container = document.getElementById('scenarios');
        if (!container) return;
        container.innerHTML = '<p class="no-items">Loading scenarios...</p>';
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    onInput(callback) {}
    focusTerminal() {}
}