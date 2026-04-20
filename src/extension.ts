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
const COOLDOWN_MS = 1000; // Very short cooldown, just to debounce the initial prompt write

function setupAntigravityWatcher(provider: WorkoutViewProvider) {
    // Watch the root Antigravity directory to catch conversation updates (.pb files)
    // which usually happen immediately upon prompt submission.
    const antigravityPath = path.join(os.homedir(), '.gemini', 'antigravity');
    
    if (fs.existsSync(antigravityPath)) {
        try {
            // Watch recursively to catch changes in 'conversations' or 'brain'
            fs.watch(antigravityPath, { recursive: true }, (eventType, filename) => {
                // If a workout is already active, ignore everything else.
                // This is key to preventing the AI response stream from resetting the trigger.
                if (provider.isWorkoutActive()) {
                    return;
                }

                const now = Date.now();
                if (now - lastTriggerTime > COOLDOWN_MS) {
                    lastTriggerTime = now;
                    
                    // Trigger INSTANTLY. No delay.
                    provider.triggerWorkout();
                }
            });
            console.log(`[Workout Tracker] Watching Antigravity at ${antigravityPath}`);
        } catch (error) {
            console.error(`[Workout Tracker] Failed to watch Antigravity:`, error);
        }
    } else {
        console.log(`[Workout Tracker] Antigravity path not found at ${antigravityPath}`);
    }
}

export function deactivate() {}

interface WorkoutConfig {
    name: string;
    type: 'reps' | 'time';
    min: number;
    max: number;
    calPerUnit: number;
}

const WORKOUTS: WorkoutConfig[] = [
    { name: "Pushups", type: 'reps', min: 10, max: 30, calPerUnit: 0.5 },
    { name: "Plank", type: 'time', min: 30, max: 90, calPerUnit: 0.1 },
    { name: "Squats", type: 'reps', min: 20, max: 50, calPerUnit: 0.5 },
    { name: "Reverse Lunges (each leg)", type: 'reps', min: 10, max: 20, calPerUnit: 0.4 },
    { name: "Jumping Jacks", type: 'reps', min: 30, max: 100, calPerUnit: 0.4 },
    { name: "Crunches", type: 'reps', min: 20, max: 50, calPerUnit: 0.3 },
    { name: "Calf Raises", type: 'reps', min: 20, max: 50, calPerUnit: 0.2 },
    { name: "Wall Sit", type: 'time', min: 30, max: 90, calPerUnit: 0.1 },
    { name: "Burpees", type: 'reps', min: 5, max: 20, calPerUnit: 1.1 },
    { name: "Diamond Pushups", type: 'reps', min: 10, max: 25, calPerUnit: 0.6 },
    { name: "Mountain Climbers", type: 'reps', min: 20, max: 60, calPerUnit: 0.4 },
    { name: "Russian Twists", type: 'reps', min: 20, max: 50, calPerUnit: 0.3 },
    { name: "Leg Raises", type: 'reps', min: 10, max: 30, calPerUnit: 0.3 },
    { name: "Side Plank (each side)", type: 'time', min: 20, max: 60, calPerUnit: 0.1 },
    { name: "Tricep Dips (use chair)", type: 'reps', min: 10, max: 30, calPerUnit: 0.4 },
    { name: "High Knees", type: 'reps', min: 20, max: 60, calPerUnit: 0.4 },
    { name: "Alternating Curtsy Lunges", type: 'reps', min: 10, max: 30, calPerUnit: 0.4 },
    { name: "Pike Pushups", type: 'reps', min: 5, max: 20, calPerUnit: 0.6 },
    { name: "Bicycle Crunches", type: 'reps', min: 20, max: 50, calPerUnit: 0.3 },
    { name: "Shadow Boxing", type: 'time', min: 30, max: 120, calPerUnit: 0.2 },
    { name: "Squat Jumps", type: 'reps', min: 10, max: 25, calPerUnit: 0.9 },
    { name: "Plank Taps", type: 'reps', min: 10, max: 40, calPerUnit: 0.4 },
    { name: "Spiderman Pushups", type: 'reps', min: 5, max: 20, calPerUnit: 0.6 },
    { name: "Wide Squats", type: 'reps', min: 20, max: 50, calPerUnit: 0.5 }
];

interface ActiveWorkout {
    name: string;
    amount: number;
    type: 'reps' | 'time';
    calories: number;
}

interface WorkoutSession {
    timestamp: number;
    workout: string;
    calories: number;
}

class WorkoutViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'workout-tracker-view';
    private _view?: vscode.WebviewView;
    private _currentWorkout?: ActiveWorkout;

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

    private _saveWorkoutToHistory(workout: ActiveWorkout) {
        const history = this._getHistory();
        const workoutString = workout.type === 'time' ? `${workout.amount}s ${workout.name}` : `${workout.amount} ${workout.name}`;
        history.push({
            timestamp: Date.now(),
            workout: workoutString,
            calories: workout.calories
        });
        this._globalState.update(this._getHistoryKey(), history);
    }

    private _getRandomWorkout(): ActiveWorkout {
        const config = WORKOUTS[Math.floor(Math.random() * WORKOUTS.length)];
        let amount = Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
        
        if (config.type === 'time') {
            amount = Math.round(amount / 5) * 5; // Round time to nearest 5
        }

        const calories = Math.round(amount * config.calPerUnit * 10) / 10;

        return {
            name: config.name,
            amount: amount,
            type: config.type,
            calories: calories
        };
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

        const totalCalories = history.reduce((sum, session) => sum + (session.calories || 0), 0);

        const historyHtml = history.length > 0 
            ? [...history].reverse().map(session => {
                const time = new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="history-item">
                        <div class="history-left">
                            <span class="history-time">${time}</span>
                            <span class="history-name">${session.workout}</span>
                        </div>
                        <span class="history-calories">+${(session.calories || 0).toFixed(1)} kcal</span>
                    </div>`;
            }).join('')
            : '<div class="no-history">No workouts yet today. Get started!</div>';

        const contentHtml = workout 
            ? `<div class="workout-container">
                    <div class="icon">💪</div>
                    <div class="title">Workout of the Moment</div>
                    <h1 class="workout">
                        <span id="workout-amount" class="rolling-number">0</span><span id="workout-unit" style="display:none;">${workout.type === 'time' ? 's' : ''}</span> <span id="workout-name" style="display:none;">${workout.name}</span>
                    </h1>
                    <div id="workout-calories-container" class="calories-badge" style="display:none;">
                        🔥 <span id="workout-calories">0</span> kcal
                    </div>
                </div>
                <button id="done-button" style="display:none;">I DID IT!</button>`
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
                        min-height: 34px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        gap: 6px;
                    }
                    .rolling-number {
                        display: inline-block;
                        color: var(--vscode-charts-orange);
                        font-variant-numeric: tabular-nums;
                    }
                    .rolling-number.landed {
                        color: var(--vscode-textLink-foreground);
                        transform: scale(1.1);
                        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    }
                    .fade-in {
                        animation: fadeIn 0.5s ease-in-out;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(5px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .waiting {
                        font-size: 20px;
                        color: var(--vscode-disabledForeground);
                        margin: 0;
                    }
                    .calories-badge {
                        display: inline-flex;
                        align-items: center;
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 4px 12px;
                        border-radius: 12px;
                        font-size: 13px;
                        font-weight: 600;
                        margin-top: 15px;
                        border: 1px solid var(--vscode-widget-border);
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
                        padding-top: 0;
                        width: 100%;
                        border-top: 1px solid var(--vscode-widget-border);
                        display: flex;
                        flex-direction: column;
                        max-height: 40vh;
                        overflow-y: auto;
                    }
                    .history-title {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        position: sticky;
                        top: 0;
                        background-color: var(--vscode-editor-background);
                        padding: 20px 0 10px 0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        z-index: 10;
                        border-bottom: 1px solid var(--vscode-widget-border);
                        margin-bottom: 10px;
                    }
                    .history-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 12px;
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        margin-bottom: 6px;
                        border-radius: 4px;
                        font-size: 13px;
                        text-align: left;
                    }
                    .history-left {
                        display: flex;
                        align-items: center;
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
                    .history-calories {
                        font-weight: 600;
                        color: var(--vscode-charts-orange);
                        font-size: 12px;
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
                    <div class="history-title">
                        <span>Today's Activity (${history.length})</span>
                        <span style="color: var(--vscode-charts-red); font-size: 12px;">🔥 ${totalCalories.toFixed(1)} kcal</span>
                    </div>
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

                    const amountEl = document.getElementById('workout-amount');
                    const unitEl = document.getElementById('workout-unit');
                    const nameEl = document.getElementById('workout-name');
                    const calContainer = document.getElementById('workout-calories-container');
                    const calEl = document.getElementById('workout-calories');
                    
                    const targetAmount = ${workout ? workout.amount : 0};
                    const targetCalories = ${workout ? workout.calories : 0};

                    if (amountEl && targetAmount > 0) {
                        let counter = 0;
                        const steps = 30;
                        const interval = setInterval(() => {
                            counter++;
                            if (counter >= steps) {
                                clearInterval(interval);
                                amountEl.innerText = targetAmount;
                                amountEl.classList.add('landed');
                                if (unitEl) unitEl.style.display = 'inline';
                                if (nameEl) nameEl.style.display = 'inline';
                                if (calContainer) {
                                    calContainer.style.display = 'inline-flex';
                                    calContainer.classList.add('fade-in');
                                    calEl.innerText = targetCalories.toFixed(1);
                                }
                                if (doneButton) {
                                    doneButton.style.display = 'block';
                                    doneButton.classList.add('fade-in');
                                }
                            } else {
                                amountEl.innerText = Math.floor(Math.random() * 99) + 1;
                            }
                        }, 40);
                    } else if (doneButton && !amountEl) {
                        // If no workout active, don't show done button
                        doneButton.style.display = 'none';
                    }
                </script>
            </body>
            </html>`;
    }
}
