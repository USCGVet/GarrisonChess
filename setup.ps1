# setup.ps1
# PowerShell script to automate project setup

# Function to write content to a file
function Write-Content {
    param (
        [string]$Path,
        [string]$Content
    )
    Set-Content -Path $Path -Value $Content -Force
}

# Create directories
Write-Host "Creating directories..."
New-Item -Path . -Name "dist" -ItemType "Directory" -Force | Out-Null
New-Item -Path . -Name "src" -ItemType "Directory" -Force | Out-Null

# Create index.html in dist/
Write-Host "Creating dist/index.html..."
$indexHtmlContent = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stockfish Chess Interface</title>
    <!-- Chessboard.js CSS -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/chessboardjs/1.0.0/css/chessboard.min.css" integrity="sha512-GsGslkHogED13V2aXgFrAzVswg4kLZKUKiV37PX7QkheS/oIBsI8hD+psgKXVPEcbSTsKPYmspHJBljxfZ5cxQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <!-- Custom CSS -->
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <h1>Stockfish Chess Interface</h1>
        <div id="board" style="width: 400px"></div>
        <div class="controls">
            <button id="startBtn">Start New Game</button>
            <button id="undoBtn">Undo Move</button>
            <div style="margin-top: 10px;">
                <label for="whiteAiToggle">White is AI:</label>
                <input type="checkbox" id="whiteAiToggle">
            </div>
            <div class="settings">
                <h3>Stockfish Settings</h3>
                <label for="threads">Threads:</label>
                <input type="number" id="threads" min="1" max="8" value="4">
                <label for="depth">Search Depth:</label>
                <input type="number" id="depth" min="1" max="20" value="15">
                <button id="applySettings">Apply Settings</button>
            </div>
        </div>
        <div class="status">
            <p id="status">Game Status: Ongoing</p>
        </div>
        <div class="move-history">
            <h3>Move History</h3>
            <ol id="history"></ol>
        </div>
    </div>

    <!-- Bundle Script -->
    <script src="bundle.js"></script>
</body>
</html>
"@
Write-Content -Path ".\dist\index.html" -Content $indexHtmlContent

# Create styles.css in src/
Write-Host "Creating src/styles.css..."
$stylesCssContent = @"
body {
    font-family: Arial, sans-serif;
    background-color: #f0f0f0;
    text-align: center;
}

.container {
    margin: 20px auto;
    width: 90%;
    max-width: 600px;
    padding: 20px;
    background-color: #ffffff;
    border-radius: 10px;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
}

.controls {
    margin-top: 20px;
}

.controls button {
    padding: 10px 20px;
    margin: 5px;
    font-size: 16px;
}

.settings {
    margin-top: 20px;
    text-align: left;
}

.settings label {
    display: block;
    margin-top: 10px;
}

.settings input {
    width: 100%;
    padding: 5px;
    margin-top: 5px;
}

.status {
    margin-top: 20px;
    font-size: 18px;
    font-weight: bold;
}

.move-history {
    text-align: left;
    margin-top: 20px;
}

.move-history ol {
    max-height: 200px;
    overflow-y: auto;
    padding-left: 20px;
}
"@
Write-Content -Path ".\src\styles.css" -Content $stylesCssContent

# Create script.js in src/
Write-Host "Creating src/script.js..."
$scriptJsContent = @'
import Chess from "chess.js";
import Chessboard from "chessboardjs";
// Stockfish is loaded as a Web Worker

// Initialize Chess and Chessboard
const board = Chessboard("board", {
    draggable: true,
    position: "start",
    onDrop: handleMove,
});
const game = new Chess();

// Initialize Stockfish
const stockfish = new Worker("stockfish.js");

// Default Stockfish settings
let stockfishThreads = 4;
let stockfishDepth = 15;

// Send initial settings to Stockfish
stockfish.postMessage(`setoption name Threads value ${stockfishThreads}`);
stockfish.postMessage(`setoption name Skill Level value 20`); // Maximum skill
stockfish.postMessage("uci");

// Handle Stockfish output
stockfish.onmessage = function(event) {
    const message = event.data;
    if (message === "uciok" || message === "readyok") {
        // Engine is ready
        console.log("Stockfish is ready.");
    } else if (message.startsWith("bestmove")) {
        const moveStr = message.split(" ")[1];
        if (moveStr === "(none)") {
            // No valid moves, game over
            return;
        }
        const move = game.move({
            from: moveStr.substring(0, 2),
            to: moveStr.substring(2, 4),
            promotion: "q", // Always promote to queen for simplicity
        });
        highlightMove(move);
        board.position(game.fen());
        updateStatus();
        updateHistory();
    }
};

// Handle user move
function handleMove(source, target) {
    const move = game.move({
        from: source,
        to: target,
        promotion: "q", // Always promote to queen for simplicity
    });

    if (move === null) return "snapback";

    highlightMove(move);
    board.position(game.fen());
    updateStatus();
    updateHistory();

    // Let Stockfish make a move
    makeEngineMove();
}

// Update game status
function updateStatus() {
    let status = "";

    if (game.in_checkmate()) {
        status = "Game over: " + (game.turn() === "w" ? "Black" : "White") + " wins by checkmate.";
    } else if (game.in_draw()) {
        status = "Game over: Draw.";
    } else {
        status = "Turn: " + (game.turn() === "w" ? "White" : "Black");
        if (game.in_check()) {
            status += " (Check)";
        }
    }

    document.getElementById("status").innerText = "Game Status: " + status;
}

// Make a move using Stockfish
function makeEngineMove() {
    if (game.game_over()) return;

    const fen = game.fen();
    stockfish.postMessage(`position fen ${fen}`);
    stockfish.postMessage(`go depth ${stockfishDepth}`);
}

// Start a new game
document.getElementById("startBtn").addEventListener("click", () => {
    game.reset();
    board.start();
    updateStatus();
    updateHistory();
});

// Undo last move
document.getElementById("undoBtn").addEventListener("click", () => {
    game.undo();
    board.position(game.fen());
    updateStatus();
    updateHistory();
});

// Apply Stockfish settings
document.getElementById("applySettings").addEventListener("click", () => {
    const threadsInput = parseInt(document.getElementById("threads").value);
    const depthInput = parseInt(document.getElementById("depth").value);

    if (isNaN(threadsInput) || threadsInput < 1 || threadsInput > 8) {
        alert("Threads must be a number between 1 and 8.");
        return;
    }

    if (isNaN(depthInput) || depthInput < 1 || depthInput > 20) {
        alert("Depth must be a number between 1 and 20.");
        return;
    }

    stockfishThreads = threadsInput;
    stockfishDepth = depthInput;

    stockfish.postMessage(`setoption name Threads value ${stockfishThreads}`);
    stockfish.postMessage("uci");
});

// Move History
function updateHistory() {
    const historyElement = document.getElementById("history");
    historyElement.innerHTML = "";
    const history = game.history({ verbose: true });
    history.forEach((move, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const isWhite = index % 2 === 0;
        if (isWhite) {
            const li = document.createElement("li");
            li.innerHTML = `<strong>${moveNumber}.</strong> ${move.san}`;
            historyElement.appendChild(li);
        } else {
            const lastLi = historyElement.lastChild;
            lastLi.innerHTML += ` ${move.san}`;
        }
    });
}

// Highlight Last Move
let whiteSquareGrey = "#a9a9a9";
let blackSquareGrey = "#696969";

function removeHighlights() {
    document.querySelectorAll(".square-55d63").forEach(square => {
        square.style.background = "";
    });
}

function highlightMove(move) {
    removeHighlights();
    const fromSquare = move.from;
    const toSquare = move.to;

    const fromEl = document.querySelector(`.square-${fromSquare}`);
    const toEl = document.querySelector(`.square-${toSquare}`);

    if (fromEl) fromEl.style.background = whiteSquareGrey;
    if (toEl) toEl.style.background = blackSquareGrey;
}

// Initialize status and history
updateStatus();
updateHistory();
'@
Write-Content -Path ".\src\script.js" -Content $scriptJsContent

# Create webpack.config.js in root
Write-Host "Creating webpack.config.js..."
$webpackConfigContent = @"
const path = require('path');

module.exports = {
  entry: './src/script.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  mode: 'development',
};
"@
Write-Content -Path ".\webpack.config.js" -Content $webpackConfigContent

# Update package.json with scripts
Write-Host "Updating package.json with build scripts..."
$packageJson = Get-Content -Path ".\package.json" | ConvertFrom-Json

$packageJson.scripts = @{
    "build" = "webpack --config webpack.config.js"
    "start" = "webpack serve --open --config webpack.config.js"
}

# Convert back to JSON and write to package.json
$packageJson | ConvertTo-Json -Depth 4 | Set-Content -Path ".\package.json" -Force

# Install dependencies
Write-Host "Installing dependencies..."
npm install chessboardjs chess.js stockfish.js webpack webpack-cli style-loader css-loader --save
npm install webpack webpack-cli style-loader css-loader --save-dev

# Download stockfish.js and place it in dist/
Write-Host "Downloading stockfish.js..."
#Invoke-WebRequest -Uri "https://raw.githubusercontent.com/niklasf/stockfish.js/master/dist/stockfish.js" -OutFile ".\dist\stockfish.js"

Write-Host "Setup Complete! You can now run 'npm run build' to build the project."
