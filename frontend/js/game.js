const API_BASE = "/api/v1";
const BASE_URL = "https://p0-run.up.railway.app";

function isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (/android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
        return true;
    }
    return window.innerWidth < 768;
}

import { Renderer, DesktopRenderer } from './Renderer.js';
import { MobileRenderer } from './MobileRenderer.js';

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
    constructor(renderer = null) {
        this.renderer = renderer || new DesktopRenderer();
        this.currentScenario = null;
        this.connected = false;
        this.currentAttemptId = null;
        this.currentScenarioTitle = null;
        this.currentActions = [];
        this.currentMaxPoints = 100;
        this.inputBuffer = '';
        this.gameState = 'welcome';
        this.previousGameState = null; // For help state restoration
        this.lastCommandExecuted = null; // Track last executed command for "return to game" flow
        this.attempts = {};
        this.currentActionsHistory = [];
        this.availableScenarios = [];
        this.skipBoot = false;
        this._bootSkipHandler = null;
        this._inBootPhase = false;
        this.feedbackMessage = null;
    }

    get terminal() {
        return this.renderer.terminal;
    }

    printSeparator() {
        this.renderer.writeln('\x1b[38;5;245m--------------------------------------------------------------------\x1b[0m');
    }

    printTerminalCommand(command) {
        this.renderer.writeln(`\x1b[32m$ ${command}\x1b[0m`);
    }

    printTerminalOutput(output) {
        this.renderer.writeln(`\x1b[38;5;245m${output}\x1b[0m`);
    }

    printTerminalBlock(command, output) {
        this.renderer.writeln('');
        this.renderer.writeln(`\x1b[32m$ ${command}\x1b[0m`);
        this.renderer.writeln(`\x1b[38;5;245m${output}\x1b[0m`);
        this.renderer.writeln('');
    }

    printHeader(title) {
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[36m\x1b[1m====================================================================\x1b[0m');
        this.renderer.writeln(`\x1b[36m\x1b[1m ${title}\x1b[0m`);
        this.renderer.writeln('\x1b[36m\x1b[1m====================================================================\x1b[0m');
    }

    _renderNodeTerminal(node) {
        if (!node) return;

        this.renderer.writeln('');
        this.renderer.writeln('\x1b[38;5;245m--------------------------------------------------------------------\x1b[0m');
        const nodeName = node.id || node.name || node.title || "scenario";
        this.renderer.writeln(`\x1b[36mNODE: ${nodeName}\x1b[0m`);
        this.renderer.writeln('\x1b[38;5;245m--------------------------------------------------------------------\x1b[0m');
        this.renderer.writeln('');

        if (node.content) {
            writeOutput(this.renderer, node.content);
        }

        this.renderer.writeln('');
    }

    _renderActionsTerminal(actions) {
        this.currentActions = actions || [];

        if (this.currentActions.length === 0) {
            return;
        }

        this.renderer.writeln('');
        this.renderer.writeln('\x1b[36mAVAILABLE ACTIONS\x1b[0m');
        this.renderer.writeln('');

        this.currentActions.forEach((action, index) => {
            const label = action.label || `Action ${index + 1}`;
            this.renderer.writeln(`[${index + 1}] ${label}`);
        });

        this.renderer.writeln('');
        this.renderer.write('\x1b[32mSelect action >\x1b[0m ');
    }

    printNode(node, scenarioDescription = null) {
        if (this.renderer.printNode) {
            this.renderer.printNode(node, scenarioDescription);
        } else {
            this._renderNodeTerminal(node);
        }
    }

    printActions(actions) {
        this.currentActions = actions || [];
        if (this.renderer.printActions) {
            this.renderer.printActions(this.currentActions);
        } else {
            this._renderActionsTerminal(this.currentActions);
        }
    }

    printWelcome() {
        if (this.renderer.printWelcome) {
            this.renderer.printWelcome();
        } else {
            this._renderWelcomeTerminal();
        }
    }

    _renderWelcomeTerminal() {
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[36m\x1b[1m====================================================================\x1b[0m');
        this.renderer.writeln('\x1b[36m\x1b[1m     PRODUCTION INCIDENT GAME                \x1b[0m');
        this.renderer.writeln('\x1b[36m\x1b[1m     Test your debugging skills              \x1b[0m');
        this.renderer.writeln('\x1b[36m\x1b[1m====================================================================\x1b[0m');
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[38;5;245mHandle realistic production incidents.');
        this.renderer.writeln('Make the right calls. Learn from the best.\x1b[0m');
        this.renderer.writeln('');
        this.renderer.write('\x1b[32mPress Enter to continue...\x1b[0m ');
    }

    showWelcome() {
        this.gameState = 'welcome';
        this.printWelcome();
    }

    _showHelp() {
        this.renderer.writeln('\x1b[1;36m--------------------------------------------------------------------\x1b[0m');
        this.renderer.writeln('\x1b[1;36mAVAILABLE COMMANDS\x1b[0m');
        this.renderer.writeln('\x1b[1;36m--------------------------------------------------------------------\x1b[0m');
        this.renderer.writeln('');
        this.renderer.writeln('start           → start a scenario - TBD');
        this.renderer.writeln('daily           → show today\'s incident');
        this.renderer.writeln('start-daily     → start daily challenge');
        this.renderer.writeln('leaderboard     → show ranking');
        this.renderer.writeln('history         → show past attempts');
        this.renderer.writeln('replay          → replay last attempt - TBD');
        this.renderer.writeln('help            → show this help message');
        this.renderer.writeln('exit            → close this help');
        this.renderer.writeln('[Enter]         → skip boot sequence when the page loads');
        this.renderer.writeln('');
        this.renderer.write('\x1b[32mSelect command > \x1b[0m');
    }

    _enterHelpMode() {
        this.previousGameState = this.gameState;
        this.gameState = 'help';
    }

    _exitHelpMode() {
        if (this.previousGameState) {
            this.gameState = this.previousGameState;
            this.previousGameState = null;
        } else {
            this.gameState = 'selecting_scenario';
        }
        
        if (this.gameState === 'selecting_scenario') {
            this._renderScenariosTerminal();
        } else if (this.gameState === 'playing') {
            this.printActions(this.currentActions);
        }
        
        this.printPrompt();
        this.focusTerminal();
    }

    getFeedbackMessage(ratio) {
        if (this.feedbackMessage) {
            return this.feedbackMessage;
        }

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

        let messages;
        if (ratio >= 0.85) {
            messages = highScoreMessages;
        } else if (ratio >= 0.60) {
            messages = midScoreMessages;
        } else if (ratio >= 0.40) {
            messages = lowScoreMessages;
        } else {
            messages = veryLowScoreMessages;
        }

        this.feedbackMessage = messages[Math.floor(Math.random() * messages.length)];
        return this.feedbackMessage;
    }

    buildShareMessage(score, maxPoints) {
        const ratio = maxPoints > 0 ? score / maxPoints : 0;
        const scenarioTitle = this.currentScenarioTitle || "Incident";
        const stepCount = this.attempts[this.currentAttemptId]?.length || 0;
        const feedback = this.getFeedbackMessage(ratio);

        const stepsText = stepCount <= 4 
            ? `Steps: ${stepCount} (perfect run?)` 
            : `Steps: ${stepCount}`;

        return `PRODUCTION INCIDENT GAME

🎯 ${scenarioTitle}
Score: ${score}/${maxPoints}
${stepsText}

"${feedback}"

Think you can do better?
${BASE_URL}`;
    }

    async copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (e) {
            }
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (e) {
            document.body.removeChild(textarea);
            return false;
        }
    }

    async typeText(text, speed = 15) {
        await this.renderer.typeText(text, speed);
    }

    printPrompt() {
        //this.terminal.write('\x1b[32mincident@game:~$\x1b[0m ');
        this.inputBuffer = '';
    }

    async init() {
        getAnonymousId();

        this.renderer.onInput((data) => this.handleUserInput(data));

        await this.connect();
        if (this.renderer.printWelcome) {
            this.showWelcome();
        } else if (this.renderer.renderScenarios) {
            await this.loadScenarios();
        } else {
            await this.showBootSequence();
        }

        posthog.identify(getAnonymousId());
        posthog.capture('game_loaded', {
            device: isMobileDevice() ? 'mobile' : 'desktop'
        });
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
        this.renderer.focusTerminal();
    }

    async showBootSequence() {
        this._inBootPhase = true;

        this._bootSkipHandler = (data) => {
            if (data === '\r' || data === '\n') {
                this.skipBoot = true;
                this.renderer.setSkipBoot(true);
            }
        };

        if (this.renderer.terminal && this.renderer.terminal.onData) {
            this.renderer.terminal.onData(this._bootSkipHandler);
        }

        await this.typeText('\x1b[36mInitializing incident environment...\x1b[0m', 20);
        await this.typeText('\x1b[36mLoading scenario engine...\x1b[0m', 20);
        await this.typeText('\x1b[36mConnecting to backend...\x1b[0m', 20);
        await this.typeText('\x1b[32mEnvironment ready.\x1b[0m', 30);

        this.renderer.writeln('');

        if (this.renderer.terminal && this.renderer.terminal.offData) {
            this.renderer.terminal.offData(this._bootSkipHandler);
        }
        this._bootSkipHandler = null;
        this._inBootPhase = false;

        await this.loadScenarios();
    }

    _renderScenariosTerminal() {
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[36mAVAILABLE SCENARIOS\x1b[0m');
        this.renderer.writeln('');

        this.availableScenarios.forEach((s, i) => {
            this.renderer.writeln(`[${i + 1}] ${s.title} ${s.difficulty ? `(${s.difficulty})` : ''}`);
            
            if (s.description) {
                const firstSentence = s.description.split('.')[0];
                const truncated = firstSentence.length > 80 ? firstSentence.substring(0, 80) + '...' : firstSentence + '...';
                this.renderer.writeln(`\x1b[38;5;245m    ${truncated}\x1b[0m`);
            }
        });

        this.renderer.writeln('');
        this.renderer.write('\x1b[32mSelect scenario > \x1b[0m');
    }

    async loadScenarios() {
        try {
            const response = await fetch(`${API_BASE}/scenarios`);

            if (!response.ok) {
                throw new Error("Failed");
            }

            const data = await response.json();

            this.availableScenarios = data || [];

            if (this.renderer.renderScenarios) {
                this.renderer.renderScenarios(this.availableScenarios);
            } else {
                this._renderScenariosTerminal();
            }

            this.gameState = 'selecting_scenario';

            posthog.capture('scenario_list_viewed', {
                count: this.availableScenarios.length
            });

        } catch (e) {
            this.renderer.writeln('\x1b[31mERROR loading scenarios\x1b[0m');
        }
    }

    async startScenario(scenarioTitle, scenarioDescription = null) {
        this.feedbackMessage = null;
        this.currentScenarioTitle = scenarioTitle;
        const isTerminal = !this.renderer.printNode;

        if (isTerminal) {
            this.renderer.writeln(`\x1b[36m▶ Starting scenario:\x1b[0m ${scenarioTitle}`);
            this.renderer.writeln('');
        }

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

            if (isTerminal) {
                const scenarioDesc = scenario ? scenario.description : null;
                if (scenarioDesc) {
                    this.renderer.writeln('\x1b[38;5;245m────────────────────────────────────────────────────────────────────\x1b[0m');
                    this.renderer.writeln('\x1b[36mDescription:\x1b[0m');
                    writeOutput(this.renderer, scenarioDesc);
                    this.renderer.writeln('\x1b[38;5;245m────────────────────────────────────────────────────────────────────\x1b[0m');
                }
                this.renderer.writeln('');
            }

            if (this.renderer.printNode && scenarioDescription) {
                this.printNode(data.node, scenarioDescription);
            } else {
                this.printNode(data.node);
            }
            this.printActions(data.actions);

            if (isTerminal) {
                this.printPrompt();
                this.focusTerminal();
            }

            posthog.capture('scenario_started', {
                scenario_id: scenarioTitle
            });

        } catch (error) {
            this.renderer.writeln('\x1b[31mERROR: Unable to reach incident engine\x1b[0m');
            this.renderer.writeln('');
        }
    }

    handleUserInput(data) {
        const charCode = data.charCodeAt(0);

        if (this._inBootPhase) {
            return;
        }

        if (this.gameState === 'welcome') {
            if (charCode === 13) {
                this.renderer.writeln('');
                this.inputBuffer = '';
                this.loadScenarios();
                return;
            }
        }

        // Help mode - handle commands
        if (this.gameState === 'help') {
            if (charCode === 13) {
                const input = this.inputBuffer.trim().toLowerCase();
                this.renderer.writeln('');
                
                if (input === 'exit' || input === '') {
                    this._exitHelpMode();
                    this.inputBuffer = '';
                    return;
                }
                
                // Check if it's a valid command before exiting help
                const validCommands = ['help', 'daily', 'start-daily', 'leaderboard', 'history', 'replay'];
                const isValidCommand = validCommands.some(cmd => {
                    if (cmd === 'replay') {
                        return input.startsWith('replay ');
                    }
                    return input === cmd;
                });
                
                if (!isValidCommand) {
                    this.renderer.writeln('\x1b[38;5;245mUnknown help command\x1b[0m');
                    this.printPrompt();
                    this.focusTerminal();
                    this.inputBuffer = '';
                    return;
                }
                
                // Exit help mode and process the command using existing processInput logic
                this._exitHelpMode();
                this.inputBuffer = input;
                this.processInput();
                return;
            }

            // Backspace in help
            if (charCode === 127) {
                if (this.inputBuffer.length > 0) {
                    this.inputBuffer = this.inputBuffer.slice(0, -1);
                    this.renderer.write('\b \b');
                }
                return;
            }

            // Allow typing in help mode
            if ((charCode >= 97 && charCode <= 122) || charCode === 45 || charCode === 95) {
                this.inputBuffer += data;
                this.renderer.write(data);
            }
            return;
        }

        if (this.gameState === 'selecting_scenario') {
            // Handle global commands in scenario selection (help, daily, leaderboard, etc.)
            const input = this.inputBuffer.trim().toLowerCase();
            const validCommands = ['help', 'daily', 'leaderboard', 'history', 'start-daily'];
            if (charCode === 13 && (validCommands.includes(input) || input.startsWith('replay '))) {
                this.renderer.writeln('');
                const cmd = this.inputBuffer;
                this.inputBuffer = '';
                this.processInput(cmd);
                return;
            }

            if (charCode === 13) {
                // If user just executed an info command (history, leaderboard, daily), 
                // pressing Enter should return to the game without error
                if (this.lastCommandExecuted) {
                    this.lastCommandExecuted = null;
                    this.inputBuffer = '';
                    this._renderScenariosTerminal();
                    return;
                }

                this.renderer.writeln('');

                const choice = parseInt(this.inputBuffer);

                if (!choice || choice < 1 || choice > this.availableScenarios.length) {
                    this.renderer.writeln('\x1b[31mInvalid choice, please try again.\x1b[0m');
                    this._renderScenariosTerminal();
                    this.inputBuffer = '';
                    return;
                }

                const selected = this.availableScenarios[choice - 1];

                this.inputBuffer = '';

                this.startScenario(selected.id || selected.title);

                return;
            }

            if (charCode === 127) {
                if (this.inputBuffer.length > 0) {
                    this.inputBuffer = this.inputBuffer.slice(0, -1);
                    this.renderer.write('\b \b');
                }
                return;
            }

            // Allow letters, numbers, and dash for commands like 'start-daily'
            if ((charCode >= 48 && charCode <= 57) || (charCode >= 97 && charCode <= 122) || charCode === 45) {
                this.inputBuffer += data;
                this.renderer.write(data);
            }

            return;
        }

        // -----------------------------
        // EXPLAIN MODE isolated
        // -----------------------------
        if (this.gameState === 'explaining') {

            // ENTER
            if (charCode === 13) {
                this.renderer.writeln('');

                const explanation = (this.inputBuffer || '').trim();

                if (explanation.length > 0) {
                    this.submitExplanation(explanation);
                    this.renderer.writeln('\x1b[38;5;245mThanks for your explanation!\x1b[0m');
                } else {
                    this.renderer.writeln('\x1b[38;5;245m(No explanation provided)\x1b[0m');
                }

                this.renderer.writeln('');
                this.renderer.writeln('\x1b[38;5;245mRefresh page to play again.\x1b[0m');

                // RESET
                this.inputBuffer = '';
                this.gameState = 'completed';

                return;
            }

            // BACKSPACE
            if (charCode === 127) {
                if (this.inputBuffer.length > 0) {
                    this.inputBuffer = this.inputBuffer.slice(0, -1);
                    this.renderer.write('\b \b');
                }
                return;
            }

            this.inputBuffer += data;
            this.renderer.write(data);

            return;
        }

        // -----------------------------
        // SHARE CHOICE MODE
        // -----------------------------
        if (this.gameState === 'share_choice') {
            if (charCode === 13) {
                const choice = (this.inputBuffer || '').trim().toLowerCase();
                this.renderer.writeln('');
                this.inputBuffer = '';
                
                if (choice === 'y' || choice === 'n' || choice === '') {
                    this.submitShareChoice(choice);
                } else {
                    this.renderer.writeln('\x1b[31mInvalid choice. Please enter y or n.\x1b[0m');
                    this.renderer.writeln('');
                    this.renderer.write('\x1b[32mCopy incident result to clipboard? [y/n] > \x1b[0m');
                }
                return;
            }

            if (charCode === 127) {
                if (this.inputBuffer.length > 0) {
                    this.inputBuffer = this.inputBuffer.slice(0, -1);
                    this.renderer.write('\b \b');
                }
                return;
            }

            if (charCode === 121 || charCode === 110 || charCode === 89 || charCode === 78) {
                this.inputBuffer += data;
                this.renderer.write(data);
            }

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
            this.renderer.writeln('');
            this.processInput();
            return;
        }

        // BACKSPACE
        if (charCode === 127) {
            if (this.inputBuffer.length > 0) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this.renderer.write('\b \b');
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
            this.renderer.write(data);
        }
    }

    async processInput(cmd = null) {
        const input = cmd !== null ? cmd : this.inputBuffer.trim();
        
        if (input === 'help') {
            this._showHelp();
            this._enterHelpMode();
            this.inputBuffer = '';
            return;
        }
        if (input === 'history') {
            this.showHistory();
            this.lastCommandExecuted = 'history';
            this.renderer.writeln('\x1b[38;5;245mPress [Enter] to resume the game\x1b[0m');
            this.printPrompt();
            this.focusTerminal();
            return;
        }

        if (input === 'leaderboard') {
            this.showLeaderboard();
            this.lastCommandExecuted = 'leaderboard';
            this.renderer.writeln('\x1b[38;5;245mPress [Enter] to resume the game\x1b[0m');
            this.printPrompt();
            this.focusTerminal();
            return;
        }
        
        if (input === 'daily') {
            await this.showDailyChallenge();
            this.lastCommandExecuted = 'daily';
            this.renderer.writeln('\x1b[38;5;245mPress [Enter] to resume the game\x1b[0m');
            this.printPrompt();
            this.focusTerminal();
            return;
        }
        
        if (input === 'start-daily') {
            if (this.gameState === 'playing') {
                this.renderer.writeln('\x1b[38;5;245mFinish the current scenario before starting the daily challenge\x1b[0m');
                this.renderer.writeln('\x1b[38;5;245mPress [Enter] to resume the game\x1b[0m');
                this.printPrompt();
                this.focusTerminal();
                return;
            }
            await this.startDailyChallenge();
            return;
        }
        
        if (input.startsWith('replay ')) {
            const attemptId = input.split(' ')[1];
            await this.replayAttempt(attemptId);
            return;
        }

        // -----------------------------
        // NORMAL GAME MODE
        // -----------------------------
        if (this.gameState !== 'playing') {
            return;
        }

        const choice = parseInt(input, 10);

        if (isNaN(choice) || choice < 1 || choice > this.currentActions.length) {
            this.renderer.writeln('\x1b[31mInvalid choice. Select a valid option.\x1b[0m');
            this.printActions(this.currentActions);
            this.renderer.writeln('');
            this.inputBuffer = '';
            this.printPrompt();
            this.focusTerminal();
            return;
        }

        const action = this.currentActions[choice - 1];
        
        if (!this.attempts[this.currentAttemptId]) {
            this.attempts[this.currentAttemptId] = [];
        }
        this.attempts[this.currentAttemptId].push({node: this.currentScenarioTitle, action: action.label});

        posthog.capture('action_selected', {
            scenario_id: this.currentScenarioTitle,
            action_id: action.id,
            step: this.attempts[this.currentAttemptId]?.length || 0
        });
        
        await this.submitAction(action.id);
    }
    
    showHistory() {
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[1;36mATTEMPT HISTORY\x1b[0m');
        this.renderer.writeln('');
        
        const attempts = Object.keys(this.attempts);
        if (attempts.length === 0) {
            this.renderer.writeln('\x1b[38;5;245mNo attempts recorded yet.\x1b[0m');
            return;
        }
        
        attempts.forEach(attemptId => {
            this.renderer.writeln(`\x1b[36m${attemptId}\x1b[0m`);
        });
        
        this.renderer.writeln('');
    }
    
    async replayAttempt(attemptId) {
        const actions = this.attempts[attemptId];
        if (!actions || actions.length === 0) {
            this.renderer.writeln(`\x1b[31mNo actions found for attempt: ${attemptId}\x1b[0m`);
            this.renderer.writeln('');
            this.printPrompt();
            this.focusTerminal();
            return;
        }
        
        this.renderer.writeln(`\x1b[36mReplaying attempt: ${attemptId}\x1b[0m`);
        this.renderer.writeln('');
        
        for (const record of actions) {
            this.renderer.writeln(`\x1b[38;5;245m> ${record.action}\x1b[0m`);
            await new Promise(r => setTimeout(r, 500));
        }
        
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[32mReplay complete.\x1b[0m');
        this.renderer.writeln('');
        this.printPrompt();
        this.focusTerminal();
    }

    async showLeaderboard() {
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[1;36mGLOBAL INCIDENT LEADERBOARD\x1b[0m');
        this.renderer.writeln('');

        try {
            const response = await fetch(`${API_BASE}/leaderboard`);
            if (!response.ok) {
                throw new Error(`Failed to fetch leaderboard: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.leaders.length === 0) {
                this.renderer.writeln('\x1b[38;5;245mNo solvers yet. Be the first!\x1b[0m');
                return;
            }

            data.leaders.forEach((leader, index) => {
                const rank = index + 1;
                this.renderer.writeln(`${rank}. ${leader.user.padEnd(12)} ${leader.solved} solved`);
            });
        } catch (error) {
            this.renderer.writeln('\x1b[31mERROR: Unable to fetch leaderboard\x1b[0m');
        }
    }

    async showDailyChallenge() {
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[1;36m====================================================================\x1b[0m');
        this.renderer.writeln('\x1b[1;36m         INCIDENT OF THE DAY                     \x1b[0m');
        this.renderer.writeln('\x1b[1;36m====================================================================\x1b[0m');
        this.renderer.writeln('');

        try {
            const response = await fetch(`${API_BASE}/daily`);
            if (!response.ok) {
                throw new Error(`Failed to fetch daily: ${response.status}`);
            }

            const data = await response.json();
            
            this.renderer.writeln(`\x1b[1;37mScenario:\x1b[0m ${data.scenario}`);
            this.renderer.writeln(`\x1b[1;37mDifficulty:\x1b[0m ${data.difficulty}`);
            this.renderer.writeln('');
            this.renderer.writeln('\x1b[38;5;245mType "start-daily" to begin.\x1b[0m');
        } catch (error) {
            this.renderer.writeln('\x1b[31mERROR: Unable to fetch daily challenge\x1b[0m');
        }
    }

    async startDailyChallenge() {
        const isTerminal = !this.renderer.printNode;

        if (isTerminal) {
            this.renderer.writeln('');
            this.renderer.writeln('\x1b[38;5;245mStarting daily challenge...\x1b[0m');
        }

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

            if (isTerminal) {
                this.printPrompt();
                this.focusTerminal();
            }

            posthog.capture('daily_started');

        } catch (error) {
            if (isTerminal) {
                this.renderer.writeln('\x1b[31mERROR: Unable to start daily challenge\x1b[0m');
                this.renderer.writeln('');
                this.printPrompt();
                this.focusTerminal();
            }
        }
    }

    async submitAction(actionId) {
        const isTerminal = !this.renderer.printNode;

        if (isTerminal) {
            this.renderer.writeln('');
            this.renderer.write('\x1b[38;5;245m→ Executing action...\x1b[0m');
            
            await new Promise(r => setTimeout(r, 150));
            this.renderer.write('.');
            await new Promise(r => setTimeout(r, 150));
            this.renderer.write('.');
            await new Promise(r => setTimeout(r, 150));
            this.renderer.write('.');
            await new Promise(r => setTimeout(r, 150));
            
            this.renderer.writeln('');
            this.renderer.writeln('');
        }

        try {
            const action = this.currentActions.find(a => a.id === actionId);
            if (action) {
                if (!this.attempts[this.currentAttemptId]) {
                    this.attempts[this.currentAttemptId] = [];
                }
                this.attempts[this.currentAttemptId].push({node: this.currentScenarioTitle, action: action.label || 'Action'});
            }

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
                if (isTerminal) {
                    this.printPrompt();
                    this.focusTerminal();
                }
            }

        } catch (error) {
            if (isTerminal) {
                this.renderer.writeln('\x1b[31mERROR: Unable to reach incident engine\x1b[0m');
                this.renderer.writeln('');
                this.printPrompt();
                this.focusTerminal();
            }
        }
    }

    printCompletion(score, maxPoints, bestExplanation = null, path = null, message = null) {
        this.gameState = 'completed';

        posthog.capture('scenario_completed', {
            scenario_id: this.currentScenarioTitle,
            score: score,
            max_score: maxPoints
        });

        if (this.renderer.printCompletion) {
            const shareMessage = this.buildShareMessage(score, maxPoints);
            const ratio = maxPoints > 0 ? score / maxPoints : 0;
            const feedback = this.getFeedbackMessage(ratio);
            this.renderer.printCompletion(score, maxPoints, bestExplanation, path, message, shareMessage, feedback);
            this.completionScore = score;
            this.bestExplanation = bestExplanation;
            return;
        }

        const ratio = maxPoints > 0 ? score / maxPoints : 0;
        const feedback = this.getFeedbackMessage(ratio) || "Scenario complete.";

        this.printHeader(`INCIDENT RESULT: ${this.currentScenarioTitle || 'Incident'}`);
        
        this.renderer.writeln('');
        if (ratio < 0.40) {
            this.renderer.writeln(`\x1b[31mScore: ${score} / ${maxPoints}\x1b[0m`);
        } else {
            this.renderer.writeln(`\x1b[32mScore: ${score} / ${maxPoints}\x1b[0m`);
        }
        this.renderer.writeln('');
        
        if (message) {
            this.renderer.writeln('\x1b[31mResult: FAILURE\x1b[0m');
            this.renderer.writeln(`Reason: ${message}`);
        }
        
        this.renderer.writeln(`\x1b[38;5;245m${feedback}\x1b[0m`);
        this.renderer.writeln('');
        this.printSeparator();

        if (path && path.length > 0) {
            this.renderer.writeln('');
            this.renderer.writeln('\x1b[36m\x1b[1mYour path:\x1b[0m');
            
            const itemsPerLine = 3;
            for (let i = 0; i < path.length; i += itemsPerLine) {
                const chunk = path.slice(i, i + itemsPerLine);
                const linePrefix = i > 0 ? '\x1b[36m→\x1b[32m ' : '\x1b[36m→\x1b[32m ';
                this.renderer.writeln(`\x1b[32m${linePrefix}${chunk.join(' \x1b[36m→\x1b[32m ')}\x1b[0m`);
            }
        }

        if (bestExplanation) {
            this.renderer.writeln('');
            this.renderer.writeln('\x1b[38;5;245m--------------------------------------------------------------------\x1b[0m');
            this.renderer.writeln('\x1b[36mTOP SOLUTION\x1b[0m');
            this.renderer.writeln('\x1b[38;5;245m--------------------------------------------------------------------\x1b[0m');
            this.renderer.writeln('');
            this.renderer.writeln(bestExplanation);
            this.renderer.writeln('');
        }

        this.renderer.writeln('');
        this.renderer.writeln('\x1b[36m\x1b[1mWant to share your result?\x1b[0m');
        this.renderer.write('\x1b[32mCopy incident result to clipboard? [y/n] > \x1b[0m');

        this.gameState = 'share_choice';
        this.inputBuffer = '';
        this.completionScore = score;
        this.bestExplanation = bestExplanation;
    }

    async submitShareChoice(choice) {
        if (choice.toLowerCase() === 'y') {
            const message = this.buildShareMessage(this.completionScore, this.currentMaxPoints);
            const success = await this.copyToClipboard(message);
            
            if (success) {
                this.renderer.writeln('\x1b[32m✓ Copied to clipboard!\x1b[0m');
                
                message.split('\n').forEach(line => {
                    this.renderer.writeln(`\x1b[38;5;245m${line}\x1b[0m`);
                });
                this.renderer.writeln('\x1b[38;5;245m--------------------------------------------------------------------\x1b[0m');
            } else {
                this.renderer.writeln('\x1b[31mFailed to copy to clipboard\x1b[0m');
            }
            
            if (typeof posthog !== 'undefined' && posthog.capture) {
                const ratio = this.currentMaxPoints > 0 ? this.completionScore / this.currentMaxPoints : 0;
                posthog.capture('share_result', {
                    scenario_id: this.currentScenarioTitle,
                    score: this.completionScore,
                    max_points: this.currentMaxPoints,
                    steps: this.attempts[this.currentAttemptId]?.length || 0
                });
            }
        }
        
        this.renderer.writeln('');
        this.renderer.writeln('\x1b[36m\x1b[1mExplain briefly what caused the incident and why your solution worked.\x1b[0m');
        this.renderer.writeln('\x1b[38;5;245mMaximum 500 characters, no links allowed.\x1b[0m');
        this.renderer.write('\x1b[32mExplain > \x1b[0m');
        
        this.gameState = 'explaining';
        this.inputBuffer = '';
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

            posthog.capture('explanation_submitted', {
                length: explanation.length
            });
        } catch (error) {
            // Silently fail - explanation is optional
        }
    }
}

export { GameClient, isMobileDevice };

document.addEventListener('DOMContentLoaded', () => {
    const isMobile = isMobileDevice();
    document.body.dataset.deviceType = isMobile ? 'mobile' : 'desktop'; // Used for CSS styling

    let renderer;
    if (isMobile) {
        renderer = new MobileRenderer();
    } else {
        renderer = new DesktopRenderer();
    }

    const client = new GameClient(renderer);

    if (isMobile) {
        renderer.onWelcome(() => client.loadScenarios());
        renderer.onScenarioSelect((id, desc) => client.startScenario(id, desc));
        renderer.onActionSubmit((actionId) => client.submitAction(actionId));
        renderer.onExplanationSubmit((exp) => client.submitExplanation(exp));
        renderer.onPlayAgain(() => window.location.reload());
        renderer.onCopyResult(async () => {
            if (!client.completionScore) return;
            const message = client.buildShareMessage(client.completionScore, client.currentMaxPoints);
            const success = await client.copyToClipboard(message);
            const shareBtn = document.getElementById('share-result');
            if (shareBtn) {
                shareBtn.textContent = success ? 'Copied!' : 'Copy Failed';
                shareBtn.disabled = true;
            }
            if (typeof posthog !== 'undefined' && posthog.capture) {
                posthog.capture('share_result', {
                    scenario_id: client.currentScenarioTitle,
                    score: client.completionScore,
                    max_points: client.currentMaxPoints,
                    steps: client.attempts[client.currentAttemptId]?.length || 0
                });
            }
        });
    }

    client.init();

    if (!isMobile) {
        window.addEventListener('load', () => {
            client.focusTerminal();
        });

        window.addEventListener('click', () => {
            client.focusTerminal();
        });
    }
});
