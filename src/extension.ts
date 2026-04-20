import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ENABLE_DEBUG_DELETE = false;

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
    { name: "Tricep Dips (use chair)", type: 'reps', min: 10, max: 30, calPerUnit: 0.4 },
    { name: "High Knees", type: 'reps', min: 20, max: 60, calPerUnit: 0.4 },
    { name: "Alternating Curtsy Lunges", type: 'reps', min: 10, max: 30, calPerUnit: 0.4 },
    { name: "Pike Pushups", type: 'reps', min: 5, max: 20, calPerUnit: 0.6 },
    { name: "Bicycle Crunches", type: 'reps', min: 20, max: 50, calPerUnit: 0.3 },
    { name: "Shadow Boxing", type: 'time', min: 30, max: 120, calPerUnit: 0.2 },
    { name: "Squat Jumps", type: 'reps', min: 10, max: 25, calPerUnit: 0.9 },
    { name: "Plank Taps", type: 'reps', min: 10, max: 40, calPerUnit: 0.4 },
    { name: "Spiderman Pushups", type: 'reps', min: 5, max: 20, calPerUnit: 0.6 },
    { name: "Wide Squats", type: 'reps', min: 20, max: 50, calPerUnit: 0.5 },
    { name: "Shoulder Taps", type: 'time', min: 30, max: 60, calPerUnit: 0.2 },
    { name: "Hollow Body Hold", type: 'time', min: 20, max: 45, calPerUnit: 0.2 },
    { name: "Superman Hold", type: 'time', min: 30, max: 60, calPerUnit: 0.15 },
    { name: "Glute Bridge Hold", type: 'time', min: 30, max: 90, calPerUnit: 0.1 },
    { name: "Bear Crawl", type: 'time', min: 30, max: 60, calPerUnit: 0.5 },
    { name: "Jog in Place", type: 'time', min: 60, max: 180, calPerUnit: 0.3 },
    { name: "Dead Bug", type: 'time', min: 30, max: 60, calPerUnit: 0.2 }
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
                case 'deleteWorkout':
                    {
                        const key = `workout_history_v2_${data.dateStr}`;
                        let history = this._globalState.get<WorkoutSession[]>(key, []);
                        history = history.filter(s => s.timestamp !== data.timestamp);
                        this._globalState.update(key, history);
                        this._updateWebview();
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
        const today = new Date();
        const pastDaysData: { dateStr: string, label: string, sessions: WorkoutSession[] }[] = [];
        
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toDateString();
            const label = i === 0 ? "Today" : `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
            const key = `workout_history_v2_${dateStr}`;
            const sessions = this._globalState.get<WorkoutSession[]>(key, []);
            pastDaysData.push({ dateStr, label, sessions });
        }
        
        const history = pastDaysData[29].sessions; // Today's history
        const workout = this._currentWorkout;

        const totalCalories = history.reduce((sum, session) => sum + (session.calories || 0), 0);
        // Only show the cinematic rollup and glimmer if the last update was very recent
        const wasJustAdded = history.length > 0 && (Date.now() - history[history.length - 1].timestamp < 5000);
        const lastCalories = wasJustAdded ? history[history.length - 1].calories : 0;
        const startCalories = totalCalories - lastCalories;

        const contentHtml = workout 
            ? `<div class="workout-container">
                    <div class="icon workout-robot">🤖<span style="font-size: 20px; position: absolute; margin-left: -5px; margin-top: 15px;">💪</span></div>
                    <div class="title">Workout of the Moment</div>
                    <h1 class="workout">
                        <span id="workout-amount" class="rolling-number">0</span><span id="workout-unit" style="display:none;">${workout.type === 'time' ? 's' : ''}</span> <span id="workout-name" style="display:none;">${workout.name}</span>
                    </h1>
                    <div id="workout-calories-container" class="calories-badge" style="display:none;">
                        🔥 <span id="workout-calories">0</span> kcal
                    </div>
                </div>
                <button id="timer-button" style="display:none; background-color: var(--vscode-charts-orange); margin-bottom: 10px;">⏱️ START TIMER</button>
                <button id="done-button" style="display:none;">✅ I DID IT!</button>`
            : `<div class="waiting-container">
                    <div class="icon-container">
                        <div class="icon sleeping-robot">🤖</div>
                        <div class="zzz" style="left: 55%; top: 20%; animation-delay: 0s; font-size: 10px;">z</div>
                        <div class="zzz" style="left: 75%; top: 0%; animation-delay: 1s; font-size: 14px;">Z</div>
                        <div class="zzz" style="left: 95%; top: -20%; animation-delay: 2s; font-size: 18px;">Z</div>
                    </div>
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
                    @keyframes successPulse {
                        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(46, 160, 67, 0.7); border-color: var(--vscode-widget-border); }
                        50% { transform: scale(1.02); box-shadow: 0 0 20px 5px rgba(46, 160, 67, 0); border-color: #2ea043; }
                        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(46, 160, 67, 0); border-color: var(--vscode-widget-border); }
                    }
                    .success-anim {
                        animation: successPulse 0.8s ease-out;
                        background-color: rgba(46, 160, 67, 0.1) !important;
                    }
                    .confetti {
                        position: absolute;
                        font-size: 30px;
                        pointer-events: none;
                        animation: floatUp 1.2s ease-out forwards;
                        z-index: 100;
                    }
                    @keyframes floatUp {
                        0% { transform: translateY(0) scale(0.5); opacity: 1; }
                        100% { transform: translateY(-100px) scale(1.2); opacity: 0; }
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
                    .delete-btn {
                        background: none;
                        border: none;
                        color: var(--vscode-errorForeground);
                        cursor: pointer;
                        opacity: 0.5;
                        padding: 0 5px;
                        font-size: 12px;
                        transition: opacity 0.2s;
                    }
                    .delete-btn:hover {
                        opacity: 1;
                    }
                    @keyframes glimmerAnim {
                        0% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.4); border: 1px solid var(--vscode-charts-orange); }
                        50% { box-shadow: 0 0 10px 2px rgba(255, 165, 0, 0.2); border: 1px solid var(--vscode-charts-orange); opacity: 0.8; }
                        100% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.4); border: 1px solid var(--vscode-charts-orange); }
                    }
                    .glimmer {
                        animation: glimmerAnim 3s infinite ease-in-out;
                    }
                    .icon {
                        margin-bottom: 15px;
                        font-size: 32px;
                        position: relative;
                        display: inline-block;
                    }
                    .icon-container {
                        position: relative;
                        display: inline-block;
                        margin-bottom: 15px;
                    }
                    .sleeping-robot {
                        filter: grayscale(0.5);
                        opacity: 0.8;
                        transform: rotate(-5deg);
                    }
                    .zzz {
                        position: absolute;
                        font-weight: bold;
                        color: var(--vscode-descriptionForeground);
                        opacity: 0;
                        animation: zzzFloat 3s infinite linear;
                    }
                    @keyframes zzzFloat {
                        0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
                        20% { opacity: 0.8; }
                        80% { opacity: 0.8; }
                        100% { transform: translate(15px, -40px) scale(1.5); opacity: 0; }
                    }
                    .workout-robot {
                        animation: robotPump 0.8s infinite ease-in-out;
                    }
                    @keyframes robotPump {
                        0% { transform: translateY(0) scaleY(1); }
                        50% { transform: translateY(8px) scaleY(0.85); }
                        100% { transform: translateY(0) scaleY(1); }
                    }
                    
                    /* Contribution Graph */
                    .graph-container {
                        margin-bottom: 20px;
                        width: 100%;
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 8px;
                        padding: 15px;
                        box-sizing: border-box;
                    }
                    .graph-title {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 12px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        display: flex;
                        justify-content: space-between;
                    }
                    .graph-grid {
                        display: flex;
                        gap: 4px;
                        flex-wrap: wrap;
                        justify-content: flex-start;
                    }
                    .graph-day {
                        width: 14px;
                        height: 14px;
                        border-radius: 3px;
                        background-color: var(--vscode-editor-background);
                        cursor: pointer;
                        transition: transform 0.1s, box-shadow 0.1s;
                        border: 1px solid rgba(255,255,255,0.05);
                    }
                    .graph-day:hover {
                        transform: scale(1.3);
                        box-shadow: 0 0 5px rgba(0,0,0,0.5);
                        z-index: 10;
                    }
                    .graph-day.selected {
                        border: 1px solid var(--vscode-focusBorder);
                        transform: scale(1.1);
                    }
                    .intensity-0 { background-color: var(--vscode-editor-background); }
                    .intensity-1 { background-color: #0e4429; }
                    .intensity-2 { background-color: #006d32; }
                    .intensity-3 { background-color: #26a641; }
                    .intensity-4 { background-color: #39d353; }
                    
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

                <div class="graph-container">
                    <div class="graph-title">
                        <span>Last 30 Days</span>
                        <span id="graph-total-workouts" style="color: #39d353; font-weight: bold;">0 workouts</span>
                    </div>
                    <div class="graph-grid" id="contribution-graph"></div>
                </div>

                <div class="history-container">
                    <div class="history-title">
                        <span id="history-header-title">Today's Activity (${history.length})</span>
                        <span id="total-calories-display" data-target="${totalCalories.toFixed(1)}" data-start="${startCalories.toFixed(1)}" style="color: var(--vscode-charts-red); font-size: 12px; font-weight: bold;">🔥 ${startCalories.toFixed(1)} kcal</span>
                    </div>
                    <div id="history-list-container">
                        <!-- Dynamic history will be rendered here -->
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const pastDaysData = ${JSON.stringify(pastDaysData)};
                    const hasActiveWorkout = ${workout ? 'true' : 'false'};
                    const wasJustAdded = ${wasJustAdded};
                    const enableDelete = ${ENABLE_DEBUG_DELETE};
                    let selectedDayIndex = 29;

                    const renderHistoryList = (dayIndex) => {
                        const dayData = pastDaysData[dayIndex];
                        const container = document.getElementById('history-list-container');
                        const headerTitle = document.getElementById('history-header-title');
                        const totalCalEl = document.getElementById('total-calories-display');
                        
                        const totalCals = dayData.sessions.reduce((sum, s) => sum + (s.calories || 0), 0);
                        headerTitle.innerText = \`\${dayData.label}'s Activity (\${dayData.sessions.length})\`;
                        
                        if (dayIndex !== 29 || !wasJustAdded) {
                            totalCalEl.innerText = '🔥 ' + totalCals.toFixed(1) + ' kcal';
                            totalCalEl.setAttribute('data-target', totalCals.toFixed(1));
                            totalCalEl.setAttribute('data-start', totalCals.toFixed(1));
                        }

                        if (dayData.sessions.length > 0) {
                            container.innerHTML = [...dayData.sessions].reverse().map((session, i) => {
                                const time = new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const isNewest = i === 0 && dayIndex === 29 && !hasActiveWorkout;
                                const deleteHtml = enableDelete ? \`<button class="delete-btn" data-date="\${dayData.dateStr}" data-timestamp="\${session.timestamp}" title="Delete workout">🗑️</button>\` : '';
                                return \`
                                    <div class="history-item \${isNewest ? 'glimmer' : ''}">
                                        <div class="history-left">
                                            \${deleteHtml}
                                            <span class="history-time">\${time}</span>
                                            <span class="history-name">\${session.workout}</span>
                                        </div>
                                        <span class="history-calories">+\${(session.calories || 0).toFixed(1)} kcal</span>
                                    </div>\`;
                            }).join('');
                        } else {
                            container.innerHTML = '<div class="no-history">No workouts for this day. Take a rest!</div>';
                        }
                    };

                    const renderGraph = () => {
                        const graphEl = document.getElementById('contribution-graph');
                        const totalEl = document.getElementById('graph-total-workouts');
                        let totalWorkouts = 0;
                        
                        pastDaysData.forEach((day, index) => {
                            const count = day.sessions.length;
                            totalWorkouts += count;
                            
                            let intensity = 0;
                            if (count > 0) intensity = 1;
                            if (count >= 3) intensity = 2;
                            if (count >= 5) intensity = 3;
                            if (count >= 8) intensity = 4;

                            const cell = document.createElement('div');
                            cell.className = \`graph-day intensity-\${intensity}\`;
                            if (index === selectedDayIndex) cell.classList.add('selected');
                            cell.title = \`\${count} workouts on \${day.label}\`;
                            
                            cell.addEventListener('click', () => {
                                document.querySelectorAll('.graph-day').forEach(el => el.classList.remove('selected'));
                                cell.classList.add('selected');
                                selectedDayIndex = index;
                                renderHistoryList(selectedDayIndex);
                            });
                            
                            graphEl.appendChild(cell);
                        });
                        
                        totalEl.innerText = \`\${totalWorkouts} workouts in 30 days\`;
                    };

                    renderGraph();
                    renderHistoryList(selectedDayIndex);

                    document.getElementById('history-list-container').addEventListener('click', (e) => {
                        const btn = e.target.closest('.delete-btn');
                        if (btn) {
                            vscode.postMessage({
                                type: 'deleteWorkout',
                                dateStr: btn.getAttribute('data-date'),
                                timestamp: parseInt(btn.getAttribute('data-timestamp'), 10)
                            });
                        }
                    });

                    const doneButton = document.getElementById('done-button');
                    
                    if (doneButton) {
                        doneButton.addEventListener('click', () => {
                            doneButton.style.display = 'none';
                            completeWorkout();
                        });
                    }

                    // Better Audio Engine
                    let audioCtx;
                    const getAudioCtx = () => {
                        if (!audioCtx) {
                            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        }
                        if (audioCtx.state === 'suspended') {
                            audioCtx.resume();
                        }
                        return audioCtx;
                    };

                    const playFireSound = () => {
                        try {
                            const ctx = getAudioCtx();
                            const bufferSize = ctx.sampleRate * 2; // 2 seconds
                            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                            const data = buffer.getChannelData(0);
                            for (let i = 0; i < bufferSize; i++) {
                                data[i] = Math.random() * 2 - 1; // White noise
                            }
                            const noise = ctx.createBufferSource();
                            noise.buffer = buffer;
                            
                            const filter = ctx.createBiquadFilter();
                            filter.type = 'lowpass';
                            filter.frequency.value = 400; // Muffled roaring fire

                            const gain = ctx.createGain();
                            gain.gain.setValueAtTime(0.5, ctx.currentTime);
                            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.8);

                            noise.connect(filter);
                            filter.connect(gain);
                            gain.connect(ctx.destination);
                            noise.start();
                        } catch(e) {}
                    };

                    const totalCalEl = document.getElementById('total-calories-display');
                    if (totalCalEl) {
                        const start = parseFloat(totalCalEl.getAttribute('data-start'));
                        const target = parseFloat(totalCalEl.getAttribute('data-target'));
                        if (target > start) {
                            playFireSound();
                            let current = start;
                            const diff = target - start;
                            const steps = 30;
                            let step = 0;
                            const interval = setInterval(() => {
                                step++;
                                current += diff / steps;
                                totalCalEl.innerText = '🔥 ' + current.toFixed(1) + ' kcal';
                                if (step >= steps) {
                                    clearInterval(interval);
                                    totalCalEl.innerText = '🔥 ' + target.toFixed(1) + ' kcal';
                                }
                            }, 40);
                        } else {
                            totalCalEl.innerText = '🔥 ' + target.toFixed(1) + ' kcal';
                        }
                    }

                    const playSound = (freq, duration, type = 'sine') => {
                        try {
                            const ctx = getAudioCtx();
                            const oscillator = ctx.createOscillator();
                            const gainNode = ctx.createGain();
                            oscillator.type = type;
                            oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
                            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
                            oscillator.connect(gainNode);
                            gainNode.connect(ctx.destination);
                            oscillator.start();
                            oscillator.stop(ctx.currentTime + (duration / 1000));
                        } catch (e) { console.error('Audio error:', e); }
                    };

                    const speak = (text) => {
                        try {
                            const msg = new SpeechSynthesisUtterance(text);
                            msg.rate = 1.2;
                            window.speechSynthesis.speak(msg);
                        } catch (e) {}
                    };

                    const playSuccessChime = () => {
                        try {
                            const ctx = getAudioCtx();
                            const now = ctx.currentTime;
                            // 8-bit "Level Up" Jingle
                            const notes = [
                                { f: 523.25, t: 0, d: 0.1 },     // C5
                                { f: 659.25, t: 0.1, d: 0.1 },   // E5
                                { f: 783.99, t: 0.2, d: 0.1 },   // G5
                                { f: 1046.50, t: 0.3, d: 0.15 }, // C6
                                { f: 783.99, t: 0.45, d: 0.1 },  // G5
                                { f: 1046.50, t: 0.55, d: 0.4 }  // C6 Final
                            ];
                            
                            notes.forEach(n => {
                                const osc = ctx.createOscillator();
                                const gain = ctx.createGain();
                                osc.type = 'square';
                                osc.frequency.setValueAtTime(n.f, now + n.t);
                                gain.gain.setValueAtTime(0.1, now + n.t);
                                gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
                                osc.connect(gain);
                                gain.connect(ctx.destination);
                                osc.start(now + n.t);
                                osc.stop(now + n.t + n.d);
                            });
                        } catch(e) {}
                    };

                    const completeWorkout = () => {
                        playSuccessChime();
                        
                        const container = document.querySelector('.workout-container');
                        if (container) {
                            container.classList.add('success-anim');
                            const emojis = ['🎉', '💪', '🔥', '🏆', '💯'];
                            for(let i=0; i<6; i++) {
                                const el = document.createElement('div');
                                el.className = 'confetti';
                                el.innerText = emojis[Math.floor(Math.random() * emojis.length)];
                                el.style.left = (10 + Math.random() * 80) + '%';
                                el.style.top = '40%';
                                document.body.appendChild(el);
                            }
                        }

                        setTimeout(() => {
                            vscode.postMessage({
                                type: 'workoutDone'
                            });
                        }, 1200);
                    };

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
                                    const isTimeBased = '${workout ? workout.type : ''}' === 'time';
                                    if (isTimeBased) {
                                        const timerBtn = document.getElementById('timer-button');
                                        if (timerBtn) {
                                            timerBtn.style.display = 'block';
                                            timerBtn.classList.add('fade-in');
                                            
                                            let timeLeft = targetAmount;
                                            let timerInterval = null;
                                            let isPreparing = false;
                                            
                                            const startMainTimer = () => {
                                                timerBtn.innerText = '⏸️ PAUSE';
                                                timerBtn.style.backgroundColor = 'var(--vscode-charts-red)';
                                                timerInterval = setInterval(() => {
                                                    timeLeft--;
                                                    amountEl.innerText = timeLeft;
                                                    if (timeLeft <= 0) {
                                                        clearInterval(timerInterval);
                                                        timerBtn.style.display = 'none';
                                                        completeWorkout();
                                                    }
                                                }, 1000);
                                            };

                                            timerBtn.addEventListener('click', () => {
                                                if (isPreparing) return;
                                                
                                                if (timerInterval) {
                                                    clearInterval(timerInterval);
                                                    timerInterval = null;
                                                    timerBtn.innerText = '⏱️ RESUME';
                                                    timerBtn.style.backgroundColor = 'var(--vscode-charts-orange)';
                                                } else {
                                                    if (timeLeft === targetAmount) {
                                                        isPreparing = true;
                                                        let prepTime = 3;
                                                        timerBtn.innerText = '⏱️ READY: ' + prepTime;
                                                        timerBtn.style.backgroundColor = '#2ea043'; // Solid green
                                                        
                                                        const prepInterval = setInterval(() => {
                                                            prepTime--;
                                                            if (prepTime > 0) {
                                                                timerBtn.innerText = 'GET READY: ' + prepTime;
                                                                playSound(440, 100);
                                                            } else {
                                                                clearInterval(prepInterval);
                                                                isPreparing = false;
                                                                playSound(880, 200);
                                                                speak('Go!');
                                                                startMainTimer();
                                                            }
                                                        }, 1000);
                                                        playSound(440, 100);
                                                    } else {
                                                        startMainTimer();
                                                    }
                                                }
                                            });
                                        }
                                    } else {
                                        doneButton.style.display = 'block';
                                        doneButton.classList.add('fade-in');
                                    }
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
