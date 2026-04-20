import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "workout-vs-code-extension" is now active!');

    const provider = new WorkoutViewProvider(context.extensionUri, context.globalState);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(WorkoutViewProvider.viewType, provider)
    );

    // Command to manually trigger a workout and focus the view
    context.subscriptions.push(
        vscode.commands.registerCommand('workout-vs-code-extension.triggerWorkout', () => {
            provider.triggerWorkout();
        })
    );

    // Add status bar item for quick access
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'workout-vs-code-extension.triggerWorkout';
    statusBarItem.text = '$(heart) Workout';
    statusBarItem.tooltip = 'Click to trigger a new workout reminder';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // --- Antigravity Prompt Detection ---
    setupAntigravityWatcher(provider);
}

let lastTriggerTime = 0;
let lastFilename = '';
const COOLDOWN_MS = 1000; // Very short cooldown, just to debounce the initial prompt write

function setupAntigravityWatcher(provider: WorkoutViewProvider) {
    // Watch the brain directory specifically for overview.txt updates
    const brainPath = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    
    if (fs.existsSync(brainPath)) {
        try {
            fs.watch(brainPath, { recursive: true }, (eventType, filename) => {
                if (provider.isWorkoutActive()) {
                    return;
                }

                // We only care about the main conversation log
                if (!filename || !filename.endsWith('overview.txt')) {
                    return;
                }

                const fullPath = path.join(brainPath, filename);
                if (fs.existsSync(fullPath)) {
                    try {
                        const stats = fs.statSync(fullPath);
                        if (stats.size === 0) return;
                        
                        // Read the last 4KB of the file to find the latest log entry
                        const fd = fs.openSync(fullPath, 'r');
                        const bufferSize = Math.min(stats.size, 4096);
                        const buffer = Buffer.alloc(bufferSize);
                        fs.readSync(fd, buffer, 0, bufferSize, stats.size - bufferSize);
                        fs.closeSync(fd);
                        
                        const content = buffer.toString('utf-8');
                        const lines = content.trim().split('\n');
                        const lastLine = lines[lines.length - 1];
                        
                        // ONLY trigger if the very last action was a text prompt from the user
                        // This ignores tool approvals (CODE_ACTION, RUN_COMMAND, etc.)
                        if (lastLine && lastLine.includes('"type":"USER_INPUT"')) {
                            const now = Date.now();
                            if (now - lastTriggerTime > COOLDOWN_MS) {
                                lastTriggerTime = now;
                                provider.triggerWorkout();
                            }
                        }
                    } catch (e) {
                        // Ignore file read errors (e.g. file locked)
                    }
                }
            });
            console.log(`[Workout Tracker] Watching Antigravity brain at ${brainPath}`);
        } catch (error) {
            console.error(`[Workout Tracker] Failed to watch Antigravity:`, error);
        }
    } else {
        console.log(`[Workout Tracker] Antigravity path not found at ${brainPath}`);
    }
}

export function deactivate() {}

const WORKOUTS = [
    "25 Pushups",
    "60s Plank",
    "30 Squats",
    "15 Reverse Lunges (each leg)",
    "50 Jumping Jacks",
    "25 Crunches",
    "30 Calf Raises",
    "60s Wall Sit",
    "15 Burpees",
    "20 Diamond Pushups",
    "40 Mountain Climbers",
    "30 Russian Twists",
    "20 Leg Raises",
    "30s Side Plank (each side)",
    "20 Tricep Dips (use chair)",
    "40 High Knees",
    "20 Alternating Curtsy Lunges",
    "15 Pike Pushups",
    "30 Bicycle Crunches",
    "60s Shadow Boxing",
    "15 Squat Jumps",
    "20 Plank Taps",
    "10 Spiderman Pushups",
    "30 Wide Squats"
];

interface WorkoutSession {
    timestamp: number;
    workout: string;
}

class WorkoutViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'workout-tracker-view';
    private _view?: vscode.WebviewView;
    private _currentWorkout?: string;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _globalState: vscode.Memento
    ) {}

    public isWorkoutActive(): boolean {
        return !!this._currentWorkout;
    }

    public triggerWorkout() {
        this._currentWorkout = this._getRandomWorkout();
        if (this._view) {
            this._view.show(true); // Reveal the view
            this._updateWebview(); // Update to show the workout
        } else {
            // Force focus the activity bar container if the view isn't yet resolved
            vscode.commands.executeCommand('workbench.view.extension.workout-tracker-container');
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this._updateWebview();

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'workoutDone':
                    {
                        if (this._currentWorkout) {
                            this._saveWorkoutToHistory(this._currentWorkout);
                            this._currentWorkout = undefined;
                            this._updateWebview();
                        }
                        break;
                    }
            }
        });
    }

    private _getHistoryKey(): string {
        return `workout_history_v2_${new Date().toDateString()}`;
    }

    private _getHistory(): WorkoutSession[] {
        return this._globalState.get<WorkoutSession[]>(this._getHistoryKey(), []);
    }

    private _saveWorkoutToHistory(workout: string) {
        const history = this._getHistory();
        history.push({
            timestamp: Date.now(),
            workout: workout
        });
        this._globalState.update(this._getHistoryKey(), history);
    }

    private _getRandomWorkout(): string {
        const index = Math.floor(Math.random() * WORKOUTS.length);
        return WORKOUTS[index];
    }

    private _updateWebview() {
        if (!this._view) {
            return;
        }
        this._view.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        const history = this._getHistory();
        const workout = this._currentWorkout;

        const historyHtml = history.length > 0 
            ? history.reverse().map(session => {
                const time = new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="history-item">
                        <span class="history-time">${time}</span>
                        <span class="history-name">${session.workout}</span>
                    </div>`;
            }).join('')
            : '<div class="no-history">No workouts yet today. Get started!</div>';

        const contentHtml = workout 
            ? `<div class="workout-container">
                    <div class="icon">💪</div>
                    <div class="title">Workout of the Moment</div>
                    <h1 class="workout">${workout}</h1>
                </div>
                <button id="done-button">I DID IT!</button>`
            : `<div class="waiting-container">
                    <div class="icon">🤖</div>
                    <div class="title">Status</div>
                    <h1 class="waiting">Waiting for next AI prompt...</h1>
                    <p class="description">Start chatting with Antigravity to trigger your next workout.</p>
                </div>`;

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Workout Tracker</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        height: 100vh;
                        box-sizing: border-box;
                    }
                    .workout-container, .waiting-container {
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 8px;
                        padding: 30px 20px;
                        margin-top: 20px;
                        margin-bottom: 30px;
                        width: 100%;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        border: 1px solid var(--vscode-widget-border);
                    }
                    .title {
                        font-size: 14px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 15px;
                    }
                    .workout {
                        font-size: 28px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        margin: 0;
                        line-height: 1.2;
                    }
                    .waiting {
                        font-size: 20px;
                        color: var(--vscode-disabledForeground);
                        margin: 0;
                    }
                    .description {
                        font-size: 13px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 15px;
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 12px 24px;
                        font-size: 16px;
                        font-weight: 600;
                        border-radius: 4px;
                        cursor: pointer;
                        width: 100%;
                        transition: background-color 0.2s;
                        margin-bottom: 30px;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .history-container {
                        margin-top: auto;
                        padding-top: 20px;
                        width: 100%;
                        border-top: 1px solid var(--vscode-widget-border);
                        display: flex;
                        flex-direction: column;
                        max-height: 40vh;
                        overflow-y: auto;
                    }
                    .history-title {
                        font-size: 14px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 15px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        position: sticky;
                        top: 0;
                        background-color: var(--vscode-editor-background);
                        padding: 5px 0;
                    }
                    .history-item {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px 12px;
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        margin-bottom: 6px;
                        border-radius: 4px;
                        font-size: 13px;
                        text-align: left;
                    }
                    .history-time {
                        color: var(--vscode-descriptionForeground);
                        font-family: monospace;
                        margin-right: 15px;
                    }
                    .history-name {
                        color: var(--vscode-foreground);
                        font-weight: 500;
                    }
                    .no-history {
                        color: var(--vscode-disabledForeground);
                        font-style: italic;
                        font-size: 13px;
                    }
                    .icon {
                        margin-bottom: 15px;
                        font-size: 32px;
                    }
                    
                    /* Custom Scrollbar */
                    .history-container::-webkit-scrollbar {
                        width: 8px;
                    }
                    .history-container::-webkit-scrollbar-thumb {
                        background: var(--vscode-scrollbarSlider-background);
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                ${contentHtml}

                <div class="history-container">
                    <div class="history-title">Today's Activity (${history.length})</div>
                    ${historyHtml}
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const doneButton = document.getElementById('done-button');
                    if (doneButton) {
                        doneButton.addEventListener('click', () => {
                            vscode.postMessage({
                                type: 'workoutDone'
                            });
                        });
                    }
                </script>
            </body>
            </html>`;
    }
}
