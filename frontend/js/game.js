const API_BASE = "/api/v1";

let anonymousId = null;

function getAnonymousId() {
    const key = "p0_user_id";
    let id = localStorage.getItem(key);
    if (!id) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            id = crypto.randomUUID();
        } else {
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem(key, id);
    }
    anonymousId = id;
    return id;
}

const commandMap = {
    "df": "check_disk",
    "df -h": "check_disk",
    "docker system df": "docker_usage",
    "docker ps": "list_containers",
    "logs": "inspect_logs",
    "journalctl": "inspect_logs"
};

function hasAnsi(text) {
    return /\x1b\[[0-9;]*m/.test(text);
}

function writeOutput(term, text) {
    text.split('\n').forEach(line => {
        if (hasAnsi(line)) {
            term.writeln(line);
        } else {
            term.writeln(`\x1b[38;5;245m${line}\x1b[0m`);
        }
    });
}

class GameClient {
    constructor() {
        this.terminal = null;
        this.fitAddon = null;
        this.currentScenario = null;
        this.connected = false;
        this.currentAttemptId = null;
        this.currentScenarioTitle = null;
        this.currentActions = [];
        this.currentMaxPoints = 100;
        this.inputBuffer = '';
        this.gameState = 'welcome';
        this.attempts = {};
        this.currentActionsHistory = [];
        this.availableScenarios = [];
    }

    printSeparator() {
        this.terminal.writeln('\x1b[38;5;245m----------------------------------\x1b[0m');
    }

    printTerminalCommand(command) {
        this.terminal.writeln(`\x1b[32m$ ${command}\x1b[0m`);
    }

    printTerminalOutput(output) {
        this.terminal.writeln(`\x1b[38;5;245m${output}\x1b[0m`);
    }

    printTerminalBlock(command, output) {
        this.terminal.writeln('');
        this.terminal.writeln(`\x1b[32m$ ${command}\x1b[0m`);
        this.terminal.writeln(`\x1b[38;5;245m${output}\x1b[0m`);
        this.terminal.writeln('');
    }

    printHeader(title) {
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[36m\x1b[1m==================================================\x1b[0m');
        this.terminal.writeln(`\x1b[36m\x1b[1m ${title}\x1b[0m`);
        this.terminal.writeln('\x1b[36m\x1b[1m==================================================\x1b[0m');
    }

    printNode(node) {
        if (!node) return;

        this.terminal.writeln('');
        this.terminal.writeln('\x1b[38;5;245m----------------------------------\x1b[0m');
        const nodeName = node.id || node.name || node.title || "scenario";
        this.terminal.writeln(`\x1b[36mNODE: ${nodeName}\x1b[0m`);
        this.terminal.writeln('\x1b[38;5;245m----------------------------------\x1b[0m');
        this.terminal.writeln('');

        if (node.content) {
            writeOutput(this.terminal, node.content);
        }

        this.terminal.writeln('');
    }

    printActions(actions) {
        this.currentActions = actions || [];

        if (this.currentActions.length === 0) {
            return;
        }

        this.terminal.writeln('');
        this.terminal.writeln('\x1b[36mAVAILABLE ACTIONS\x1b[0m');
        this.terminal.writeln('');

        this.currentActions.forEach((action, index) => {
            const label = action.label || `Action ${index + 1}`;
            this.terminal.writeln(`[${index + 1}] ${label}`);
        });

        this.terminal.writeln('');
        this.terminal.write('\x1b[32mSelect action >\x1b[0m ');
    }

    getFeedbackMessage(ratio) {
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

    async typeText(text, speed = 15) {
        for (const char of text) {
            this.terminal.write(char);
            await new Promise(r => setTimeout(r, speed));
        }
        this.terminal.writeln("");
    }

    printPrompt() {
        //this.terminal.write('\x1b[32mincident@game:~$\x1b[0m ');
        this.inputBuffer = '';
    }

    async init() {
        getAnonymousId();
        
        this.terminal = new Terminal({
            cursorBlink: true,
            fontSize: 15,
            fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace',
            fontWeight: 'normal',
            lineHeight: 1.35,
            theme: {
                background: '#0d1117',
                foreground: '#e6edf3',
                cursor: '#00ff9c',
                selectionBackground: '#264f78',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#e6edf3',
                brightBlack: '#6e7681',
                brightRed: '#ffa198',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd',
                brightWhite: '#f0f6fc'
            },
            allowTransparency: true
        });

        this.fitAddon = new FitAddon.FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.open(document.getElementById('terminal-container'));
        this.fitAddon.fit();

        window.addEventListener('resize', () => this.fitAddon.fit());

        this.terminal.onData((data) => this.handleUserInput(data));

        setTimeout(() => this.focusTerminal(), 100);

        await this.connect();
        await this.showBootSequence();
    }

    async connect() {
        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                this.connected = true;
                this.updateConnectionStatus(true);
            }
        } catch (error) {
            this.connected = false;
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (connected) {
            statusEl.textContent = 'Connected';
            statusEl.classList.add('connected');
        } else {
            statusEl.textContent = 'Disconnected';
            statusEl.classList.remove('connected');
        }
    }

    updateAttemptDisplay() {
        const attemptEl = document.getElementById('current-attempt');
        const scenarioEl = document.getElementById('current-scenario');
        
        if (this.currentAttemptId) {
            attemptEl.textContent = `Attempt: ${this.currentAttemptId}`;
        }
        if (this.currentScenarioTitle) {
            scenarioEl.textContent = `Scenario: ${this.currentScenarioTitle}`;
        }
    }

    focusTerminal() {
        if (this.terminal) {
            this.terminal.focus();
        }
    }

    async showBootSequence() {
        await this.typeText('\x1b[36mInitializing incident environment...\x1b[0m', 20);
        await this.typeText('\x1b[36mLoading scenario engine...\x1b[0m', 20);
        await this.typeText('\x1b[36mConnecting to backend...\x1b[0m', 20);
        await this.typeText('\x1b[32mEnvironment ready.\x1b[0m', 30);

        this.terminal.writeln('');

        await this.loadScenarios();
    }

    renderScenarios() {
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[36mAVAILABLE SCENARIOS\x1b[0m');
        this.terminal.writeln('');

        this.availableScenarios.forEach((s, i) => {
            this.terminal.writeln(`[${i + 1}] ${s.title}`);
            if (s.description) {
                const firstSentence = s.description.split('.')[0];
                const truncated = firstSentence.length > 80 ? firstSentence.substring(0, 80) + '...' : firstSentence + '...';
                this.terminal.writeln(`\x1b[38;5;245m    ${truncated}\x1b[0m`);
            }
        });

        this.terminal.writeln('');
        this.terminal.write('\x1b[32mSelect scenario > \x1b[0m');
    }

    async loadScenarios() {
        try {
            const response = await fetch(`${API_BASE}/scenarios`);

            if (!response.ok) {
                throw new Error("Failed");
            }

            const data = await response.json();

            this.availableScenarios = data || [];

            this.renderScenarios();

            this.gameState = 'selecting_scenario';

        } catch (e) {
            this.terminal.writeln('\x1b[31mERROR loading scenarios\x1b[0m');
        }
    }

    async startScenario(scenarioTitle) {
        this.currentScenarioTitle = scenarioTitle;
        this.terminal.writeln(`\x1b[36m▶ Starting scenario:\x1b[0m ${scenarioTitle}`);
        this.terminal.writeln('');

        const scenario = this.availableScenarios.find(s => (s.id || s.title) === scenarioTitle);

        try {
            const response = await fetch(`${API_BASE}/scenarios/${scenarioTitle}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anonymous_id: anonymousId })
            });

            if (!response.ok) {
                throw new Error(`Failed to start scenario: ${response.status}`);
            }

            const data = await response.json();
            this.currentAttemptId = data.attempt_id;
            this.currentMaxPoints = data.max_points || 100;
            this.attempts[this.currentAttemptId] = [];
            this.gameState = 'playing';
            this.updateAttemptDisplay();

            const scenarioDesc = scenario ? scenario.description : null;
            if (scenarioDesc) {
                this.terminal.writeln('\x1b[38;5;245m──────────────────────────────────\x1b[0m');
                this.terminal.writeln('\x1b[36mDescription:\x1b[0m');
                this.terminal.writeln(scenarioDesc);
                this.terminal.writeln('\x1b[38;5;245m──────────────────────────────────\x1b[0m');
            }

            this.terminal.writeln('');
            this.printNode(data.node);
            this.printActions(data.actions);
            this.printPrompt();
            this.focusTerminal();

        } catch (error) {
            this.terminal.writeln('\x1b[31mERROR: Unable to reach incident engine\x1b[0m');
            this.terminal.writeln('');
        }
    }

    handleUserInput(data) {
        const charCode = data.charCodeAt(0);

        if (this.gameState === 'selecting_scenario') {

            const charCode = data.charCodeAt(0);

            if (charCode === 13) {
                this.terminal.writeln('');

                const choice = parseInt(this.inputBuffer);

                if (!choice || choice < 1 || choice > this.availableScenarios.length) {
                    this.terminal.writeln('\x1b[31mInvalid selection. Please choose a valid scenario.\x1b[0m');
                    this.renderScenarios();
                    this.inputBuffer = '';
                    return;
                }

                const selected = this.availableScenarios[choice - 1];

                this.inputBuffer = '';

                this.startScenario(selected.id || selected.title);

                return;
            }

            if (charCode === 127) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this.terminal.write('\b \b');
                return;
            }

            if (charCode >= 48 && charCode <= 57) {
                this.inputBuffer += data;
                this.terminal.write(data);
            }

            return;
        }

        // -----------------------------
        // EXPLAIN MODE isolated
        // -----------------------------
        if (this.gameState === 'explaining') {

            // ENTER
            if (charCode === 13) {
                this.terminal.writeln('');

                const explanation = (this.inputBuffer || '').trim();

                if (explanation.length > 0) {
                    this.submitExplanation(explanation);
                    this.terminal.writeln('\x1b[38;5;245mThanks for your explanation!\x1b[0m');
                } else {
                    this.terminal.writeln('\x1b[38;5;245m(No explanation provided)\x1b[0m');
                }

                this.terminal.writeln('');
                this.terminal.writeln('\x1b[38;5;245mRefresh page to play again.\x1b[0m');

                // RESET
                this.inputBuffer = '';
                this.gameState = 'completed';

                return;
            }

            // BACKSPACE
            if (charCode === 127) {
                if (this.inputBuffer.length > 0) {
                    this.inputBuffer = this.inputBuffer.slice(0, -1);
                    this.terminal.write('\b \b');
                }
                return;
            }

            this.inputBuffer += data;
            this.terminal.write(data);

            return;
        }

        // -----------------------------
        // NORMAL GAME MODE
        // -----------------------------
        if (this.gameState !== 'playing') {
            return;
        }

        // ENTER
        if (charCode === 13) {
            this.terminal.writeln('');
            this.processInput();
            return;
        }

        // BACKSPACE
        if (charCode === 127) {
            if (this.inputBuffer.length > 0) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this.terminal.write('\b \b');
            }
            return;
        }

        // LIMIT INPUT  (numbers + letters + space + dash)
        if (
            (charCode >= 48 && charCode <= 57) || // 0-9
            (charCode >= 97 && charCode <= 122) || // a-z
            charCode === 32 || // space
            charCode === 45 ||// dash
            charCode === 95 // underscore
        ) {
            this.inputBuffer += data;
            this.terminal.write(data);
        }
    }

    async processInput() {
        const input = this.inputBuffer.trim();
        
        if (input === 'help') {
            this.terminal.writeln('');
            this.terminal.writeln('\x1b[1;36m----------------------------------------\x1b[0m');
            this.terminal.writeln('\x1b[1;36mAVAILABLE COMMANDS\x1b[0m');
            this.terminal.writeln('\x1b[1;36m----------------------------------------\x1b[0m');
            this.terminal.writeln('');
            this.terminal.writeln('start           → start a scenario - TBD');
            this.terminal.writeln('daily           → show today\'s incident');
            this.terminal.writeln('start-daily     → start daily challenge');
            this.terminal.writeln('leaderboard     → show ranking');
            this.terminal.writeln('history         → show past attempts');
            this.terminal.writeln('replay          → replay last attempt - TBD');
            this.terminal.writeln('help            → show this help message');
            this.terminal.writeln('');
            this.printPrompt();
            this.focusTerminal();
            return;
        }

        if (input === 'history') {
            this.showHistory();
            this.printPrompt();
            this.focusTerminal();
            return;
        }

        if (input === 'leaderboard') {
            this.showLeaderboard();
            this.printPrompt();
            this.focusTerminal();
            return;
        }
        
        if (input === 'daily') {
            await this.showDailyChallenge();
            this.printPrompt();
            this.focusTerminal();
            return;
        }
        
        if (input === 'start-daily') {
            await this.startDailyChallenge();
            return;
        }
        
        if (input.startsWith('replay ')) {
            const attemptId = input.split(' ')[1];
            await this.replayAttempt(attemptId);
            return;
        }

        const inputLower = input.toLowerCase();

        if (commandMap[inputLower]) {
            const mappedActionKey = commandMap[inputLower];
            const matchedAction = this.currentActions.find(
                action => (action.name && action.name.toLowerCase() === mappedActionKey) ||
                          (action.key && action.key.toLowerCase() === mappedActionKey) ||
                          (action.label && action.label.toLowerCase().replace(/\s+/g, '_') === mappedActionKey)
            );

            if (matchedAction) {
                if (!this.attempts[this.currentAttemptId]) {
                    this.attempts[this.currentAttemptId] = [];
                }
                this.attempts[this.currentAttemptId].push({node: this.currentScenarioTitle, action: matchedAction.label});
                await this.submitAction(matchedAction.id);
                return;
            } else {
                this.terminal.writeln('\x1b[31mInvalid input. Please enter a number.\x1b[0m');
                this.printActions(this.currentActions);
                this.printPrompt();
                this.focusTerminal();
                return;
            }
        }

        const choice = parseInt(input, 10);

        if (isNaN(choice) || choice < 1 || choice > this.currentActions.length) {
            this.terminal.writeln('\x1b[31mInvalid choice. Select a valid option.\x1b[0m');
            this.printActions(this.currentActions);
            this.printPrompt();
            this.focusTerminal();
            return;
        }

        const action = this.currentActions[choice - 1];
        
        if (!this.attempts[this.currentAttemptId]) {
            this.attempts[this.currentAttemptId] = [];
        }
        this.attempts[this.currentAttemptId].push({node: this.currentScenarioTitle, action: action.label});
        
        await this.submitAction(action.id);
    }
    
    showHistory() {
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[1;36mATTEMPT HISTORY\x1b[0m');
        this.terminal.writeln('');
        
        const attempts = Object.keys(this.attempts);
        if (attempts.length === 0) {
            this.terminal.writeln('\x1b[38;5;245mNo attempts recorded yet.\x1b[0m');
            return;
        }
        
        attempts.forEach(attemptId => {
            this.terminal.writeln(`\x1b[36m${attemptId}\x1b[0m`);
        });
        
        this.terminal.writeln('');
    }
    
    async replayAttempt(attemptId) {
        const actions = this.attempts[attemptId];
        if (!actions || actions.length === 0) {
            this.terminal.writeln(`\x1b[31mNo actions found for attempt: ${attemptId}\x1b[0m`);
            this.terminal.writeln('');
            this.printPrompt();
            this.focusTerminal();
            return;
        }
        
        this.terminal.writeln(`\x1b[36mReplaying attempt: ${attemptId}\x1b[0m`);
        this.terminal.writeln('');
        
        for (const record of actions) {
            this.terminal.writeln(`\x1b[38;5;245m> ${record.action}\x1b[0m`);
            await new Promise(r => setTimeout(r, 500));
        }
        
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[32mReplay complete.\x1b[0m');
        this.terminal.writeln('');
        this.printPrompt();
        this.focusTerminal();
    }

    async showLeaderboard() {
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[1;36mGLOBAL INCIDENT LEADERBOARD\x1b[0m');
        this.terminal.writeln('');

        try {
            const response = await fetch(`${API_BASE}/leaderboard`);
            if (!response.ok) {
                throw new Error(`Failed to fetch leaderboard: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.leaders.length === 0) {
                this.terminal.writeln('\x1b[38;5;245mNo solvers yet. Be the first!\x1b[0m');
                return;
            }

            data.leaders.forEach((leader, index) => {
                const rank = index + 1;
                this.terminal.writeln(`${rank}. ${leader.user.padEnd(12)} ${leader.solved} solved`);
            });
        } catch (error) {
            this.terminal.writeln('\x1b[31mERROR: Unable to fetch leaderboard\x1b[0m');
        }
    }

    async showDailyChallenge() {
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[1;36m==================================================\x1b[0m');
        this.terminal.writeln('\x1b[1;36m         INCIDENT OF THE DAY                     \x1b[0m');
        this.terminal.writeln('\x1b[1;36m==================================================\x1b[0m');
        this.terminal.writeln('');

        try {
            const response = await fetch(`${API_BASE}/daily`);
            if (!response.ok) {
                throw new Error(`Failed to fetch daily: ${response.status}`);
            }

            const data = await response.json();
            
            this.terminal.writeln(`\x1b[1;37mScenario:\x1b[0m ${data.scenario}`);
            this.terminal.writeln(`\x1b[1;37mDifficulty:\x1b[0m ${data.difficulty}`);
            this.terminal.writeln('');
            this.terminal.writeln('\x1b[38;5;245mType "start daily" to begin.\x1b[0m');
        } catch (error) {
            this.terminal.writeln('\x1b[31mERROR: Unable to fetch daily challenge\x1b[0m');
        }
    }

    async startDailyChallenge() {
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[38;5;245mStarting daily challenge...\x1b[0m');

        try {
            const response = await fetch(`${API_BASE}/daily/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anonymous_id: anonymousId })
            });

            if (!response.ok) {
                throw new Error(`Failed to start daily: ${response.status}`);
            }

            const data = await response.json();
            this.currentAttemptId = data.attempt_id;
            this.currentScenarioTitle = data.scenario;
            this.currentMaxPoints = data.max_points || 100;
            this.attempts[this.currentAttemptId] = [];
            this.gameState = 'playing';
            this.updateAttemptDisplay();

            this.printNode(data.node);
            this.printActions(data.actions);
            this.printPrompt();
            this.focusTerminal();

        } catch (error) {
            this.terminal.writeln('\x1b[31mERROR: Unable to start daily challenge\x1b[0m');
            this.terminal.writeln('');
            this.printPrompt();
            this.focusTerminal();
        }
    }

    async submitAction(actionId) {
        this.terminal.writeln('');
        this.terminal.write('\x1b[38;5;245m→ Executing action...\x1b[0m');
        
        await new Promise(r => setTimeout(r, 150));
        this.terminal.write('.');
        await new Promise(r => setTimeout(r, 150));
        this.terminal.write('.');
        await new Promise(r => setTimeout(r, 150));
        this.terminal.write('.');
        await new Promise(r => setTimeout(r, 150));
        
        this.terminal.writeln('');
        this.terminal.writeln('');

        try {
            const response = await fetch(
                `${API_BASE}/scenarios/${this.currentScenarioTitle}/attempt/${this.currentAttemptId}/action/${actionId}`,
                { method: 'POST' }
            );

            if (!response.ok) {
                throw new Error(`Failed to submit action: ${response.status}`);
            }

            const data = await response.json();

            if (data.node) {
                this.printNode(data.node);
            }

            if (data.is_completed) {
                this.currentMaxPoints = data.max_points || this.currentMaxPoints;
                this.printCompletion(data.score, this.currentMaxPoints, data.best_explanation || null, data.path || null, data.message || null);
            } else {
                this.printActions(data.actions);
                this.printPrompt();
                this.focusTerminal();
            }

        } catch (error) {
            this.terminal.writeln('\x1b[31mERROR: Unable to reach incident engine\x1b[0m');
            this.terminal.writeln('');
            this.printPrompt();
            this.focusTerminal();
        }
    }

    printCompletion(score, maxPoints, bestExplanation = null, path = null, message = null) {
        this.gameState = 'completed';

        const ratio = maxPoints > 0 ? score / maxPoints : 0;
        const feedback = this.getFeedbackMessage(ratio) || "Scenario complete.";

        this.printHeader('INCIDENT RESULT');
        
        this.terminal.writeln('');
        if (ratio < 0.40) {
            this.terminal.writeln(`\x1b[31mScore: ${score} / ${maxPoints}\x1b[0m`);
        } else {
            this.terminal.writeln(`\x1b[32mScore: ${score} / ${maxPoints}\x1b[0m`);
        }
        this.terminal.writeln('');
        
        if (message) {
            this.terminal.writeln('\x1b[31mResult: FAILURE\x1b[0m');
            this.terminal.writeln(`Reason: ${message}`);
        }
        
        this.terminal.writeln(`\x1b[38;5;245m${feedback}\x1b[0m`);
        this.terminal.writeln('');
        this.printSeparator();

        if (path && path.length > 0) {
            this.terminal.writeln('');
            this.terminal.writeln('\x1b[36m\x1b[1mYour path:\x1b[0m');
            this.terminal.writeln(`\x1b[32m${path.join(' \x1b[36m→\x1b[32m ')}\x1b[0m`);
        }

        if (bestExplanation) {
            this.terminal.writeln('');
            this.terminal.writeln('\x1b[38;5;245m--------------------------------------------------\x1b[0m');
            this.terminal.writeln('\x1b[36mTOP SOLUTION\x1b[0m');
            this.terminal.writeln('\x1b[38;5;245m--------------------------------------------------\x1b[0m');
            this.terminal.writeln('');
            this.terminal.writeln(bestExplanation);
            this.terminal.writeln('');
        }

        this.terminal.writeln('');
        this.terminal.writeln('\x1b[36m\x1b[1mExplain briefly what caused the incident and why your solution worked.\x1b[0m');
        this.terminal.writeln('\x1b[38;5;245mMaximum 500 characters, no links allowed.\x1b[0m');
        this.terminal.writeln('');
        this.terminal.write('\x1b[32mexplain > \x1b[0m');

        this.gameState = 'explaining';
        this.inputBuffer = '';
        this.completionScore = score;
        this.bestExplanation = bestExplanation;
    }

    async submitExplanation(explanation) {
        try {
            await fetch(
                `${API_BASE}/attempts/${this.currentAttemptId}/explanation`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ explanation: explanation })
                }
            );
        } catch (error) {
            // Silently fail - explanation is optional
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = { GameClient };
}

document.addEventListener('DOMContentLoaded', () => {
    const client = new GameClient();
    client.init();
    
    window.addEventListener('load', () => {
        client.focusTerminal();
    });
    
    window.addEventListener('click', () => {
        client.focusTerminal();
    });
});
