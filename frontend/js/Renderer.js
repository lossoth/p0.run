export class Renderer {
    constructor() {
        this.terminal = null;
        this._inputCallback = null;
        this._fitAddon = null;
    }

    write(text = '') {
        if (this.terminal) {
            this.terminal.write(text);
        }
    }

    writeln(text = '') {
        if (this.terminal) {
            this.terminal.writeln(text);
        }
    }

    onInput(callback) {
        this._inputCallback = callback;
        if (this.terminal && this.terminal.onData) {
            this.terminal.onData((data) => {
                if (this._inputCallback) {
                    this._inputCallback(data);
                }
            });
        }
    }

    emit(eventType, payload) {}

    simulateInput(str) {
        if (!this._inputCallback) return;
        for (const char of str) {
            this._inputCallback(char);
        }
        this._inputCallback('\r');
    }

    focusTerminal() {
        if (this.terminal) {
            this.terminal.focus();
        }
    }

    async typeText(text, speed = 15) {
        for (const char of text) {
            this.write(char);
            if (this._skipBoot) {
                await Promise.resolve();
            } else {
                await new Promise(r => setTimeout(r, speed));
            }
        }
        this.writeln('');
    }

    setSkipBoot(value) {
        this._skipBoot = value;
    }
}

export class DesktopRenderer extends Renderer {
    constructor() {
        super();
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

        this._fitAddon = new FitAddon.FitAddon();
        this.terminal.loadAddon(this._fitAddon);
        this.terminal.open(document.getElementById('terminal-container'));
        this._fitAddon.fit();

        window.addEventListener('resize', () => this._fitAddon.fit());

        setTimeout(() => this.focusTerminal(), 100);
    }

    focusTerminal() {
        if (this.terminal) {
            this.terminal.focus();
        }
    }
}
