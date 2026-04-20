# Workout While Training 💪

**Workout While Training** is a gamified VS Code extension designed to keep you active during your workday. Whenever you submit a prompt to your AI assistant (or manually trigger it), the extension challenges you with a short, randomized physical exercise. 

Stop staring at loading bars and start burning calories!

## ✨ Key Features

- **Randomized Exercises:** Get challenged with a mix of rep-based (Pushups, Squats, Crunches) and time-based (Planks, Wall Sits, Bear Crawls) exercises.
- **Interactive Timer:** Built-in countdown timer for time-based exercises with audio cues and automatic completion tracking.
- **Gamified Feedback:** Enjoy satisfying 8-bit "level up" jingles, confetti animations, and cinematic calorie counters when you complete a workout.
- **30-Day Contribution Graph:** Track your consistency with a GitHub-style activity heat map directly in your sidebar. Click on any past day to see exactly what you accomplished!
- **AI Prompt Detection:** Seamlessly integrates with your workflow by automatically triggering a workout prompt when you submit a query to the Antigravity AI.

## 🚀 Installation Instructions

To install this extension in your local VS Code environment:

1. Obtain or build the `.vsix` package file (e.g., `workout-vs-code-extension-0.0.1.vsix`).
2. Open VS Code.
3. Open the **Extensions** view (`Ctrl+Shift+X` on Windows/Linux or `Cmd+Shift+X` on Mac).
4. Click the **`...`** (Views and More Actions) menu in the top right corner of the Extensions panel.
5. Select **Install from VSIX...** from the dropdown menu.
6. Browse your filesystem, select the `.vsix` file, and click Install.
7. The extension will automatically activate in your sidebar!

## 💡 Usage

- **Sidebar View:** Once installed, look for the Heart icon (`$(heart)`) in your VS Code Activity Bar on the left. Click it to view your Workout Tracker.
- **Trigger a Workout:** Workouts will trigger automatically when you interact with the AI assistant. You can also manually trigger a workout by clicking the Heart icon in your bottom Status Bar, or by running `Workout Tracker: Trigger Workout` from the Command Palette (`Ctrl+Shift+P`).
- **Complete a Workout:** If it's a rep-based exercise, simply do the work and click the **✅ I DID IT!** button. If it's time-based, click **⏱️ START TIMER** and follow the audio cues.
- **Review History:** Use the 30-day contribution graph at the top of the sidebar to review past days.

## 🛠️ Development Setup

Want to modify the exercises, change the sounds, or tweak the UI? Here's how to run the extension locally:

1. Clone the repository and navigate into the project folder.
2. Run `npm install` to install dependencies.
3. Press `F5` in VS Code. This will compile the TypeScript code and launch a new "Extension Development Host" window with your local code active.
4. Make changes to `src/extension.ts` or other files.
5. In the Development Host window, press `Ctrl+R` (or `Cmd+R`) to reload the window and see your changes instantly.

### Packaging a New Version
When you're ready to create a new installable package for others:
1. Ensure you have the `vsce` CLI tool installed (`npm install -g @vscode/vsce`).
2. Run `vsce package` in the root directory.
3. A new `.vsix` file will be generated, ready for distribution!
