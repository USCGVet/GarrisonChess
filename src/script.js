import $ from 'jquery';
import { Chess } from 'chess.js'; // Changed import statement
import Chessboard from 'chessboardjs';
import 'chessboardjs/www/css/chessboard.css'; // Corrected path
import './styles.css';
import ReinforcementAI from './reinforcementAI.js';

// Global error handler to prevent webpack-dev-server overlay errors
window.addEventListener('error', function(event) {
    if (event.message && event.message.includes('[object Object]')) {
        console.error('Caught error:', event);
        event.preventDefault();
        return true;
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// Initialize Chess and Chessboard
const game = new Chess();
const board = Chessboard('board', {
    draggable: true,
    position: game.fen(), // Use current game position instead of 'start'
    onDrop: handleMove,
    onDragStart: onDragStart,
    pieceTheme: function(piece) { // Add this to prevent default image loading
        // Return empty string or a path to a non-existent/transparent pixel
        // This stops chessboard.js from trying to create <img> tags for its default pieces.
        return ''; 
    },
});

let isWhitePlayerAi = false; // Variable to track if White is AI
let gameStartTime = Date.now(); // Track game start time

// Initialize Reinforcement AI
const reinforcementAI = new ReinforcementAI();

// Unicode pieces mapping
const unicodePieces = {
    bP: '♟', bR: '♜', bN: '♞', bB: '♝', bQ: '♛', bK: '♚',
    wP: '♙', wR: '♖', wN: '♘', wB: '♗', wQ: '♕', wK: '♔'
};

// Function to render Unicode pieces
function renderUnicodePieces() {
    // Clear existing unicode pieces (but not reinforcement pieces)
    document.querySelectorAll('#board .unicode-piece').forEach(el => el.remove());

    const files = 'abcdefgh';
    const ranks = '12345678';
    const allSquareIds = [];
    for (const f of files) {
        for (const r of ranks) {
            allSquareIds.push(f + r);
        }
    }

    for (const squareId of allSquareIds) { // Iterate 'a1' through 'h8'
        const piece = game.get(squareId); // Get piece from chess.js {type: 'p', color: 'w'}

        if (piece) {
            const pieceCode = piece.color + piece.type.toUpperCase(); // e.g., 'wP'
            const unicodeChar = unicodePieces[pieceCode];
            // Use data-square attribute for selecting the square element
            const squareEl = document.querySelector(`#board div[data-square="${squareId}"]`);

            if (unicodeChar && squareEl) { // Check if squareEl was found
                const pieceSpan = document.createElement('span');
                pieceSpan.classList.add('unicode-piece');
                pieceSpan.classList.add(piece.color === 'w' ? 'white-piece' : 'black-piece'); // Apply color-specific class
                pieceSpan.textContent = unicodeChar;
                squareEl.appendChild(pieceSpan);
            } else if (piece && !squareEl) {
                // Log if a square element isn't found, for debugging
                console.warn(`Square element with data-square="${squareId}" not found for piece ${pieceCode}`);
            }
        }
    }
    
    // Update material strength display
    updateMaterialStrength();
}

// After board and game initialization, before Stockfish initialization or at a similar top-level scope
const whiteAiToggle = document.getElementById('whiteAiToggle');
if (whiteAiToggle) {
    whiteAiToggle.addEventListener('change', (event) => {
        isWhitePlayerAi = event.target.checked;
        // If it's white's turn and AI was just enabled, and game not over, let AI make a move.
        if (game.turn() === 'w' && isWhitePlayerAi && !game.isGameOver()) {
            console.log("White AI toggled on, making move for White.");
            makeEngineMove();
        }
    });
}

// Initialize Stockfish instances
let stockfish; // Main engine for moves
let stockfishEval; // Separate engine for position evaluation
try {
    stockfish = new Worker('stockfish.js');
    stockfishEval = new Worker('stockfish.js'); // Second instance for evaluations
    
    // Add an error handler for the workers
    stockfish.onerror = function(event) { // event is an ErrorEvent
        console.error('Stockfish worker error event:', event);
        if (event.message) {
            console.error('Stockfish worker error message:', event.message);
        }
        if (event.error) { // The actual error object
            console.error('Stockfish worker actual error object:', event.error);
            if (event.error.stack) {
                console.error('Stockfish worker error stack:', event.error.stack);
            }
        }
        // Prevent error from propagating
        if (event.preventDefault) {
            event.preventDefault();
        }
        return true;
    };
    
    stockfishEval.onerror = function(event) {
        console.error('Stockfish eval worker error event:', event);
        if (event.preventDefault) {
            event.preventDefault();
        }
        return true;
    };
} catch (e) {
    console.error('Failed to initialize Stockfish:', e);
    alert('Failed to load chess engine. Please refresh the page.');
    stockfish = null;
    stockfishEval = null;
}

// Default Stockfish settings
let stockfishThreads = 4;
let stockfishDepth = 15;

// Send initial settings to Stockfish engines
if (stockfish) {
    try {
        stockfish.postMessage(`setoption name Threads value ${stockfishThreads}`);
        stockfish.postMessage(`setoption name Skill Level value 20`); // Maximum skill
        stockfish.postMessage('uci');
    } catch (e) {
        console.error('Error sending initial messages to Stockfish:', e);
    }
}

if (stockfishEval) {
    try {
        stockfishEval.postMessage(`setoption name Threads value 1`); // Use only 1 thread for eval
        stockfishEval.postMessage(`setoption name Skill Level value 20`);
        stockfishEval.postMessage('uci');
        
        // Connect stockfish evaluator to reinforcement AI
        setTimeout(() => {
            reinforcementAI.setStockfishEval(stockfishEval);
            console.log('Stockfish evaluator connected to Reinforcement AI');
        }, 1000);
    } catch (e) {
        console.error('Error sending initial messages to Stockfish eval:', e);
    }
}

// Variables for CPU indicator
let isThinking = false;
let currentThinkingMove = null;

// Handle Stockfish output
if (stockfish) {
    stockfish.onmessage = function(event) {
    try {
        const message = event.data;
        if (message === 'uciok' || message === 'readyok') {
            // Engine is ready
            console.log('Stockfish is ready.');
        } else if (message.startsWith('info')) {
            // Parse info messages for depth, nodes, and current move
            if (isThinking) {
                const depthMatch = message.match(/depth (\d+)/);
                const nodesMatch = message.match(/nodes (\d+)/);
                // More flexible regex to catch moves with or without promotions
                const pvMatch = message.match(/pv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
                
                // Debug log to see what messages we're getting
                if (message.includes('pv') && !pvMatch) {
                    console.log('Info message with pv but no match:', message);
                }
                
                if (depthMatch) {
                    document.getElementById('cpuDepth').textContent = `Depth: ${depthMatch[1]}`;
                }
                if (nodesMatch) {
                    const nodes = parseInt(nodesMatch[1]);
                    const displayNodes = nodes > 1000000 ? `${(nodes/1000000).toFixed(1)}M` : 
                                       nodes > 1000 ? `${(nodes/1000).toFixed(0)}K` : nodes;
                    document.getElementById('cpuNodes').textContent = `Nodes: ${displayNodes}`;
                }
                if (pvMatch) {
                    const moveStr = pvMatch[1];
                    const from = moveStr.substring(0, 2);
                    const to = moveStr.substring(2, 4);
                    document.getElementById('candidateMove').textContent = `Considering: ${from} → ${to}`;
                    
                    // Show thinking animation on the board
                    updateThinkingSquares(from, to);
                }
            }
        } else if (message.startsWith('bestmove')) {
            // Hide CPU indicator when move is found
            hideCPUIndicator();
            
            const moveStr = message.split(' ')[1];
            if (moveStr === '(none)') {
                // No valid moves, game over or other condition
                console.log('Stockfish indicated no valid moves (bestmove (none)).');
                return;
            }
            // Parse the move string
            const from = moveStr.substring(0, 2);
            const to = moveStr.substring(2, 4);
            const promotion = moveStr.length > 4 ? moveStr.substring(4, 5) : null;
            
            // Try move with promotion if specified, otherwise without
            const move = promotion ? 
                game.move({ from, to, promotion }) :
                game.move({ from, to });

            if (move === null) {
                console.error("Stockfish proposed an invalid move or the move failed. Raw move string:", moveStr);
                // Hide CPU indicator for invalid move
                hideCPUIndicator();
                
                // For Garrison Chess with random positions, sometimes Stockfish suggests invalid moves
                // Try to recover by asking for a new move with different parameters
                setTimeout(() => {
                    console.log("Retrying move calculation after invalid move suggestion...");
                    showCPUIndicator();
                    const altDepth = Math.min(10, Math.max(5, stockfishDepth - 5));
                    stockfish.postMessage(`position fen ${game.fen()}`);
                    stockfish.postMessage(`go depth ${altDepth} movetime 1000`);
                }, 500);
                return; // Prevent calling highlightMove with a null move object
            }

            // Animate the piece movement
            animatePieceMovement(move, () => {
                highlightMove(move);
                board.position(game.fen());
                renderUnicodePieces();
                updateStatus();
                
                // Update custom history tracker with new move
                if (gameHistoryTracker.length > 0) {
                    gameHistoryTracker.push(move);
                }
                
                updateHistory();
            
                // Check if reinforcement can now be applied or updated
                if (!hasAppliedReinforcement) {
                    const { whiteValue, blackValue } = updateMaterialStrength();
                    const weakerPlayer = getWeakerPlayer(whiteValue, blackValue);
                    
                    // Always check and update reinforcement for the weaker player
                    if (weakerPlayer) {
                        if (pendingReinforcement && pendingReinforcement.player === weakerPlayer) {
                            updateReinforcementIfActive();
                        } else if (!pendingReinforcement) {
                            // Check if there are valid squares for reinforcement
                            const validSquares = getValidReinforcementSquares(weakerPlayer);
                            if (validSquares.length > 0) {
                                // Temporarily set the pending reinforcement to check material
                                pendingReinforcement = { player: weakerPlayer };
                                applyReinforcement();
                                // If applyReinforcement didn't set up a reinforcement, clear it
                                if (!pendingReinforcement.piece) {
                                    pendingReinforcement = null;
                                }
                            }
                        }
                    }
                }

                // After AI (black or white) has made a move and board is updated:
                // Check if the *next* player is AI and should move.
                if (!game.isGameOver()) {
                    if (game.turn() === 'w' && isWhitePlayerAi) {
                        console.log("Stockfish moved. Now White AI's turn.");
                        // Check if White should use reinforcement first
                        checkAndUseWhiteReinforcement();
                    } else if (game.turn() === 'b') { // Black is always AI
                        console.log("Stockfish moved. Now Black AI's turn.");
                        // Check if Black should use reinforcement first
                        checkAndUseBlackReinforcement();
                    }
                }
            });
        }
        // else if (message) { // Optional: Log other messages from Stockfish
        //    console.log("Received unhandled message from Stockfish:", message);
        // }
    } catch (e) {
        console.error("Error in stockfish.onmessage (engine response):", e);
        if (e.stack) console.error("Stack:", e.stack);
    }
    };
}

// Handle drag start - prevent dragging during AI turn
function onDragStart(source, piece, position, orientation) {
    // Prevent dragging if game is over
    if (game.isGameOver()) return false;
    
    // Prevent dragging if it's AI's turn
    const currentTurn = game.turn();
    if ((currentTurn === 'w' && isWhitePlayerAi) || currentTurn === 'b') {
        return false;
    }
    
    // Only allow dragging pieces of the color whose turn it is
    if ((currentTurn === 'w' && piece.search(/^b/) !== -1) ||
        (currentTurn === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
    
    return true;
}

// Handle user move
function handleMove(source, target) {
    try {
        const currentTurn = game.turn();

        // Prevent human from moving if it's AI's turn
        if ((currentTurn === 'w' && isWhitePlayerAi) || currentTurn === 'b') { // Black is always AI
            console.log(`Snapback: Human trying to move for AI player ${currentTurn}`);
            return 'snapback';
        }

        // Check if the piece was dropped on the same square
        if (source === target) {
            return 'snapback'; // Return piece to original square
        }

        // Try move without promotion first
        let move = game.move({
            from: source,
            to: target
        });
        
        // If that fails, try with promotion to queen
        if (move === null) {
            move = game.move({
                from: source,
                to: target,
                promotion: 'q'
            });
        }

        if (move === null) {
            console.warn(`User move failed: from ${source} to ${target}. Snapback.`);
            return 'snapback';
        }

        // Animate the piece movement
        animatePieceMovement(move, () => {
            highlightMove(move);
            board.position(game.fen());
            renderUnicodePieces();
            updateStatus();
            
            // Update custom history tracker with new move
            if (gameHistoryTracker.length > 0) {
                gameHistoryTracker.push(move);
            }
            
            updateHistory();
        
            // Check if reinforcement can now be applied or updated
            if (!hasAppliedReinforcement) {
                const { whiteValue, blackValue } = updateMaterialStrength();
                const weakerPlayer = getWeakerPlayer(whiteValue, blackValue);
                
                console.log("After move - checking reinforcement:");
                console.log("  Weaker player:", weakerPlayer);
                console.log("  Current turn:", game.turn());
                console.log("  Pending reinforcement:", pendingReinforcement ? "Yes" : "No");
                
                // Always check and update reinforcement for the weaker player
                if (weakerPlayer) {
                    if (pendingReinforcement && pendingReinforcement.player === weakerPlayer) {
                        console.log("Updating existing reinforcement...");
                        updateReinforcementIfActive();
                    } else if (!pendingReinforcement) {
                        // Check if there are valid squares for reinforcement
                        const validSquares = getValidReinforcementSquares(weakerPlayer);
                        console.log("Checking for valid reinforcement squares:", validSquares);
                        if (validSquares.length > 0) {
                            console.log("Valid squares found, applying reinforcement...");
                            // Temporarily set the pending reinforcement to check material
                            pendingReinforcement = { player: weakerPlayer };
                            applyReinforcement();
                            // If applyReinforcement didn't set up a reinforcement, clear it
                            if (!pendingReinforcement.piece) {
                                pendingReinforcement = null;
                            }
                        }
                    }
                }
            }

            // If the game is not over, and the next player is AI, let them move.
            if (!game.isGameOver()) {
                if (game.turn() === 'b') { // Black is always AI, so if it's black's turn, AI moves.
                    console.log("Human white moved, triggering Black AI.");
                    // Check if Black should use reinforcement first
                    checkAndUseBlackReinforcement();
                }
                // No explicit trigger for White AI here, as this function is for HUMAN white moves.
            }
        });
    } catch (e) {
        console.error("Error in handleMove (user move):", e);
        if (e.stack) console.error("Stack:", e.stack);
        return 'snapback'; // Attempt to gracefully handle in UI
    }
}

// Update game status
function updateStatus() {
    let status = '';
    let gameOver = false;

    if (game.isCheckmate()) { // Changed from game.in_checkmate()
        status = 'Game over: ' + (game.turn() === 'w' ? 'Black' : 'White') + ' wins by checkmate.';
        gameOver = true;
        showGameOverPopup(game.turn() === 'w' ? 'black' : 'white', 'checkmate');
    } else if (game.isDraw()) { // Changed from game.in_draw()
        status = 'Game over: Draw.';
        gameOver = true;
        showGameOverPopup('draw', 'draw');
    } else {
        status = 'Turn: ' + (game.turn() === 'w' ? 'White' : 'Black');
        if (game.isCheck()) { // Changed from game.in_check()
            status += ' (Check)';
        }
    }

    document.getElementById('status').textContent = status;
}

// Calculate material strength for both sides
function updateMaterialStrength() {
    const pieceValues = {
        'p': 1,  // Pawn
        'n': 3,  // Knight
        'b': 3,  // Bishop
        'r': 5,  // Rook
        'q': 9,  // Queen
        'k': 0   // King (not counted in material)
    };
    
    let whiteValue = 0;
    let blackValue = 0;
    
    // Get the current board state
    const board = game.board();
    
    // Calculate material for each square
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const piece = board[i][j];
            if (piece) {
                const value = pieceValues[piece.type];
                if (piece.color === 'w') {
                    whiteValue += value;
                } else {
                    blackValue += value;
                }
            }
        }
    }
    
    // Update the display
    document.getElementById('whiteValue').textContent = whiteValue;
    document.getElementById('blackValue').textContent = blackValue;
    
    // Calculate and display advantage
    const advantage = whiteValue - blackValue;
    const advantageElement = document.getElementById('advantage');
    
    if (advantage > 0) {
        advantageElement.textContent = `+${advantage}`;
        advantageElement.className = 'strength-advantage white-advantage';
    } else if (advantage < 0) {
        advantageElement.textContent = `${advantage}`;
        advantageElement.className = 'strength-advantage black-advantage';
    } else {
        advantageElement.textContent = '=';
        advantageElement.className = 'strength-advantage equal';
    }
    
    // Update the visual strength bar
    const strengthBar = document.getElementById('strengthBar');
    const totalValue = whiteValue + blackValue;
    
    if (totalValue === 0) {
        // No pieces on board (shouldn't happen in normal games)
        strengthBar.style.left = '50%';
        strengthBar.style.width = '0%';
    } else {
        // Calculate percentages
        const whitePercent = (whiteValue / totalValue) * 100;
        const blackPercent = (blackValue / totalValue) * 100;
        
        if (advantage > 0) {
            // White has advantage - bar grows to the left (pointing at white side)
            const barWidth = whitePercent - 50;
            strengthBar.style.left = `${50 - barWidth}%`;
            strengthBar.style.width = `${barWidth}%`;
            strengthBar.style.background = 'linear-gradient(90deg, rgba(244, 232, 208, 0.4), rgba(244, 232, 208, 0.8))';
        } else if (advantage < 0) {
            // Black has advantage - bar grows to the right (pointing at black side)
            strengthBar.style.left = '50%';
            strengthBar.style.width = `${(blackPercent - 50)}%`;
            strengthBar.style.background = 'linear-gradient(90deg, rgba(139, 127, 199, 0.8), rgba(139, 127, 199, 0.4))';
        } else {
            // Equal material
            strengthBar.style.left = '50%';
            strengthBar.style.width = '0%';
        }
    }
    
    // Return the material values and advantage for reinforcement logic
    return { whiteValue, blackValue, advantage };
}

// Get the weaker player based on material strength
function getWeakerPlayer(whiteValue, blackValue) {
    if (whiteValue < blackValue) {
        return 'w';
    } else if (blackValue < whiteValue) {
        return 'b';
    } else {
        return null; // Equal strength
    }
}

// Find valid reinforcement placement squares next to the king
function getValidReinforcementSquares(playerColor) {
    const validSquares = [];
    const board = game.board();
    
    // Find the king position
    let kingRow = -1;
    let kingCol = -1;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && piece.type === 'k' && piece.color === playerColor) {
                kingRow = row;
                kingCol = col;
                break;
            }
        }
        if (kingRow !== -1) break;
    }
    
    if (kingRow === -1) return validSquares; // No king found
    
    // Check if king is in check or checkmate
    if (game.isCheck() || game.isCheckmate()) {
        return validSquares; // Can't place reinforcement when in check/checkmate
    }
    
    // Determine the opposite 8th rank (enemy's back rank)
    const oppositeEighthRank = playerColor === 'w' ? 0 : 7; // Row 0 for white (8th rank), row 7 for black (1st rank)
    
    // If king is on the opposite 8th rank, no reinforcement allowed at all
    if (kingRow === oppositeEighthRank) {
        return validSquares; // No reinforcement when king is on enemy's back rank
    }
    
    // Check all squares adjacent to the king
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];
    
    for (const [dRow, dCol] of directions) {
        const newRow = kingRow + dRow;
        const newCol = kingCol + dCol;
        
        // Check if square is on the board
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
            // Check if square is empty
            if (!board[newRow][newCol]) {
                // Never allow reinforcement on the opposite 8th rank
                if (newRow === oppositeEighthRank) {
                    continue; // Skip squares on the enemy's back rank
                }
                
                // Convert to algebraic notation
                const file = String.fromCharCode(97 + newCol); // a-h
                const rank = 8 - newRow; // 1-8
                validSquares.push(file + rank);
            }
        }
    }
    
    return validSquares;
}

// Calculate the appropriate reinforcement piece type
function calculateReinforcementPiece(materialDeficit) {
    const pieceValues = {
        'p': 1,
        'n': 3,
        'b': 3,
        'r': 5,
        'q': 9
    };
    
    // Find the best piece that doesn't exceed the deficit
    if (materialDeficit >= pieceValues.q) {
        return 'q';
    } else if (materialDeficit >= pieceValues.r) {
        return 'r';
    } else if (materialDeficit >= pieceValues.b) {
        return 'b'; // or 'n', both have same value
    } else if (materialDeficit >= pieceValues.p) {
        return 'p';
    }
    
    return null; // No reinforcement needed
}

// Global variables for reinforcement
let pendingReinforcement = null;
let validReinforcementSquares = [];
let hasAppliedReinforcement = false; // Track if reinforcement has been applied for current game
let gameHistoryTracker = []; // Custom history tracker to preserve moves across FEN loads

// Apply reinforcement after randomization
function applyReinforcement() {
    // Don't apply if already done for this game
    if (hasAppliedReinforcement) {
        return;
    }
    
    // Calculate current material strength
    const { whiteValue, blackValue, advantage } = updateMaterialStrength();
    
    // Determine the weaker player
    const weakerPlayer = getWeakerPlayer(whiteValue, blackValue);
    
    if (!weakerPlayer) {
        console.log("Material is equal, no reinforcement needed");
        hasAppliedReinforcement = true; // Mark as checked even if not needed
        return;
    }
    
    // Calculate material deficit
    const materialDeficit = Math.abs(advantage);
    
    // Get valid squares for reinforcement
    validReinforcementSquares = getValidReinforcementSquares(weakerPlayer);
    
    if (validReinforcementSquares.length === 0) {
        console.log("No valid squares for reinforcement");
        return;
    }
    
    // Calculate appropriate reinforcement piece
    const reinforcementPiece = calculateReinforcementPiece(materialDeficit);
    
    if (!reinforcementPiece) {
        console.log("No reinforcement piece needed");
        return;
    }
    
    // Store pending reinforcement info
    pendingReinforcement = {
        player: weakerPlayer,
        piece: reinforcementPiece,
        validSquares: validReinforcementSquares
    };
    
    // Show the reinforcement piece for manual placement
    showReinforcementPiece(weakerPlayer, reinforcementPiece);
    
    // Highlight valid squares
    highlightValidSquares(validReinforcementSquares);
    
    // Don't mark as applied yet - only mark when piece is actually placed
    // hasAppliedReinforcement = true;
}

// Show reinforcement piece in UI
function showReinforcementPiece(player, pieceType) {
    const container = document.getElementById('reinforcementContainer');
    const textElement = document.getElementById('reinforcementText');
    const reinforcementPieceDiv = document.getElementById('reinforcementPiece');
    
    // Check if main elements exist
    if (!container || !textElement || !reinforcementPieceDiv) {
        console.error('Reinforcement UI elements not found:', {
            container: !!container,
            textElement: !!textElement,
            reinforcementPieceDiv: !!reinforcementPieceDiv
        });
        return;
    }
    
    // Find or create the unicode piece span
    let pieceElement = reinforcementPieceDiv.querySelector('.unicode-piece');
    if (!pieceElement) {
        pieceElement = document.createElement('span');
        pieceElement.className = 'unicode-piece';
        reinforcementPieceDiv.appendChild(pieceElement);
    }
    
    const pieceName = {
        'p': 'Pawn',
        'n': 'Knight', 
        'b': 'Bishop',
        'r': 'Rook',
        'q': 'Queen'
    }[pieceType];
    
    const pieceSymbols = {
        'p': { white: '♙', black: '♟' },
        'n': { white: '♘', black: '♞' },
        'b': { white: '♗', black: '♝' },
        'r': { white: '♖', black: '♜' },
        'q': { white: '♕', black: '♛' }
    };
    
    const symbol = player === 'w' ? pieceSymbols[pieceType].white : pieceSymbols[pieceType].black;
    
    textElement.textContent = `${player === 'w' ? 'White' : 'Black'} receives a ${pieceName} reinforcement!`;
    pieceElement.textContent = symbol;
    pieceElement.className = `unicode-piece ${player === 'w' ? 'white-piece' : 'black-piece'}`;
    
    container.style.display = 'block';
    
    // Setup drag and drop
    setupReinforcementDragDrop();
}

// Highlight valid squares for reinforcement
function highlightValidSquares(squares) {
    // Remove any existing highlights
    $('.valid-reinforcement-square').removeClass('valid-reinforcement-square');
    
    // Add highlights to valid squares
    squares.forEach(square => {
        $(`#board [data-square="${square}"]`).addClass('valid-reinforcement-square');
    });
}

// Update reinforcement valid squares if king has moved
function updateReinforcementIfActive() {
    if (pendingReinforcement && !hasAppliedReinforcement) {
        // Recalculate valid squares based on current king position
        const oldValidSquares = pendingReinforcement.validSquares;
        const newValidSquares = getValidReinforcementSquares(pendingReinforcement.player);
        
        console.log("Updating reinforcement squares:");
        console.log("  Old squares:", oldValidSquares);
        console.log("  New squares:", newValidSquares);
        
        if (newValidSquares.length === 0) {
            // No valid squares anymore, hide reinforcement
            hideReinforcement();
            pendingReinforcement = null;
            console.log("Reinforcement cancelled - no valid squares after king move");
        } else {
            // Update valid squares
            pendingReinforcement.validSquares = newValidSquares;
            validReinforcementSquares = newValidSquares;
            highlightValidSquares(newValidSquares);
            console.log("Updated highlights for squares:", newValidSquares);
        }
    }
}

// Hide reinforcement UI
function hideReinforcement() {
    const container = document.getElementById('reinforcementContainer');
    if (container) {
        container.style.display = 'none';
    }
    $('.valid-reinforcement-square').removeClass('valid-reinforcement-square');
}

// Setup drag and drop for reinforcement piece
function setupReinforcementDragDrop() {
    const reinforcementPiece = document.getElementById('reinforcementPiece');
    
    // Remove any existing listeners
    const newReinforcementPiece = reinforcementPiece.cloneNode(true);
    reinforcementPiece.parentNode.replaceChild(newReinforcementPiece, reinforcementPiece);
    
    // Check if mobile/touch device
    const isMobile = window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window;
    
    if (isMobile) {
        // Mobile: Tap to select, then tap to place
        newReinforcementPiece.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Toggle selection state
            if (newReinforcementPiece.classList.contains('selected')) {
                newReinforcementPiece.classList.remove('selected');
                document.querySelectorAll('.valid-reinforcement-square').forEach(square => {
                    square.classList.remove('mobile-placeable');
                });
            } else {
                newReinforcementPiece.classList.add('selected');
                // Highlight valid squares more prominently
                document.querySelectorAll('.valid-reinforcement-square').forEach(square => {
                    square.classList.add('mobile-placeable');
                });
                // Scroll board into view
                document.getElementById('board').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    } else {
        // Desktop: Keep drag and drop
        // Add drag start listener
        newReinforcementPiece.addEventListener('dragstart', (e) => {
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('reinforcement', 'true');
        });
        
        // Add drag end listener
        newReinforcementPiece.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
        });
    }
    
    // Setup drop zones on valid squares using data-square attribute
    setTimeout(() => {
        const isMobile = window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window;
        
        // Remove any existing drop listeners first
        document.querySelectorAll('#board [data-square]').forEach(square => {
            const newSquare = square.cloneNode(true);
            square.parentNode.replaceChild(newSquare, square);
            
            if (isMobile) {
                // Mobile: Click to place when piece is selected
                newSquare.addEventListener('click', (e) => {
                    const squareId = newSquare.getAttribute('data-square');
                    const reinforcementPiece = document.getElementById('reinforcementPiece');
                    
                    if (reinforcementPiece && reinforcementPiece.classList.contains('selected') && 
                        pendingReinforcement && pendingReinforcement.validSquares.includes(squareId)) {
                        
                        // Place the reinforcement
                        placeReinforcementPiece(squareId);
                        console.log("Reinforcement placed successfully via mobile tap");
                    }
                });
            } else {
                // Desktop: Keep drag and drop
                newSquare.addEventListener('dragover', (e) => {
                    const squareId = newSquare.getAttribute('data-square');
                    if (pendingReinforcement && pendingReinforcement.validSquares.includes(squareId)) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        newSquare.classList.add('drag-over');
                    }
                });
                
                newSquare.addEventListener('dragleave', (e) => {
                    newSquare.classList.remove('drag-over');
                });
                
                newSquare.addEventListener('drop', (e) => {
                    e.preventDefault();
                    newSquare.classList.remove('drag-over');
                    const squareId = newSquare.getAttribute('data-square');
                    
                    if (e.dataTransfer.getData('reinforcement') === 'true' && 
                        pendingReinforcement && 
                        pendingReinforcement.validSquares.includes(squareId)) {
                        placeReinforcementPiece(squareId);
                    }
                });
            }
        });
    }, 100);
}

// Get square ID from element
function getSquareFromElement(element) {
    const classes = element.className.split(' ');
    for (const cls of classes) {
        if (cls.startsWith('square-')) {
            return cls.substring(7); // Remove 'square-' prefix
        }
    }
    return null;
}

// Place reinforcement piece on the board
function placeReinforcementPiece(targetSquare) {
    if (!pendingReinforcement) return;
    
    const { player, piece } = pendingReinforcement;
    
    // Create the piece notation (uppercase for white, lowercase for black)
    const pieceNotation = player === 'w' ? piece.toUpperCase() : piece;
    
    // Get current FEN and modify it to add the piece
    const currentFen = game.fen();
    const fenParts = currentFen.split(' ');
    const boardState = fenParts[0];
    
    // Convert square to board position
    const file = targetSquare.charCodeAt(0) - 97; // 0-7
    const rank = 8 - parseInt(targetSquare[1]); // 0-7
    
    // Modify the FEN to add the piece
    const rows = boardState.split('/');
    let row = rows[rank];
    let newRow = '';
    let colCount = 0;
    
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (isNaN(char)) {
            // It's a piece
            if (colCount === file) {
                newRow += pieceNotation; // Add our reinforcement piece
            }
            newRow += char;
            colCount++;
        } else {
            // It's a number (empty squares)
            const emptyCount = parseInt(char);
            if (colCount <= file && file < colCount + emptyCount) {
                // The target square is in this empty range
                const beforeEmpty = file - colCount;
                const afterEmpty = emptyCount - beforeEmpty - 1;
                
                if (beforeEmpty > 0) newRow += beforeEmpty;
                newRow += pieceNotation;
                if (afterEmpty > 0) newRow += afterEmpty;
                
                colCount += emptyCount;
            } else {
                newRow += char;
                colCount += emptyCount;
            }
        }
    }
    
    rows[rank] = newRow;
    fenParts[0] = rows.join('/');
    const newFen = fenParts.join(' ');
    
    // Load the new position
    game.load(newFen);
    board.position(game.fen());
    renderUnicodePieces();
    updateStatus();
    updateMaterialStrength();
    
    // Apply visual effects to the reinforcement piece
    applyReinforcementVisualEffect(targetSquare, player);
    
    console.log(`Reinforcement ${piece} placed at ${targetSquare} for ${player === 'w' ? 'White' : 'Black'}`);
    
    // Hide the reinforcement UI
    hideReinforcement();
    
    // Clear pending reinforcement
    pendingReinforcement = null;
    validReinforcementSquares = [];
    hasAppliedReinforcement = true; // Mark as applied when piece is actually placed
    
    // If it's White's turn and White is AI, make a move
    if (game.turn() === 'w' && isWhitePlayerAi && !game.isGameOver()) {
        console.log("Reinforcement placed, White is AI, making move.");
        makeEngineMove();
    }
}

// Show CPU indicator
function showCPUIndicator() {
    isThinking = true;
    const indicator = document.getElementById('cpuIndicator');
    if (!indicator) {
        console.error('CPU indicator element not found');
        return;
    }
    
    indicator.classList.add('active');
    
    // Activate CPU cores based on thread count
    const cores = document.querySelectorAll('.cpu-core');
    cores.forEach((core, index) => {
        if (index < stockfishThreads) {
            core.classList.add('active');
        } else {
            core.classList.remove('active');
        }
    });
    
    console.log(`CPU indicator shown for ${game.turn() === 'w' ? 'White' : 'Black'} thinking`);
}

// Hide CPU indicator
function hideCPUIndicator() {
    isThinking = false;
    const indicator = document.getElementById('cpuIndicator');
    indicator.classList.remove('active');
    
    // Clear thinking squares
    clearThinkingSquares();
    
    // Reset display
    document.getElementById('cpuDepth').textContent = 'Depth: 0';
    document.getElementById('cpuNodes').textContent = 'Nodes: 0';
    document.getElementById('candidateMove').textContent = '';
}

// Update thinking squares on board
function updateThinkingSquares(from, to) {
    clearThinkingSquares();
    
    // Determine which player is thinking
    const thinkingPlayer = game.turn();
    const colorClass = thinkingPlayer === 'w' ? 'white-thinking' : 'black-thinking';
    
    // Get the from and to squares
    const fromEl = document.querySelector(`#board [data-square="${from}"]`);
    const toEl = document.querySelector(`#board [data-square="${to}"]`);
    
    // Make the piece on the 'from' square blink (no circle)
    if (fromEl) {
        const piece = fromEl.querySelector('.unicode-piece');
        if (piece) {
            piece.classList.add('thinking-piece');
        }
    }
    
    // Only add circle to the destination square
    if (toEl) {
        toEl.classList.add('thinking-square', colorClass);
    }
}

// Clear thinking squares
function clearThinkingSquares() {
    document.querySelectorAll('.thinking-square').forEach(el => {
        el.classList.remove('thinking-square', 'white-thinking', 'black-thinking');
    });
    
    document.querySelectorAll('.thinking-piece').forEach(el => {
        el.classList.remove('thinking-piece');
    });
}

// Animate piece movement
function animatePieceMovement(move, callback) {
    const fromSquare = document.querySelector(`#board [data-square="${move.from}"]`);
    const toSquare = document.querySelector(`#board [data-square="${move.to}"]`);
    const piece = fromSquare ? fromSquare.querySelector('.unicode-piece') : null;
    
    if (!piece || !fromSquare || !toSquare) {
        // If elements not found, just execute callback
        if (callback) callback();
        return;
    }
    
    // Get positions
    const fromRect = fromSquare.getBoundingClientRect();
    const toRect = toSquare.getBoundingClientRect();
    
    // Calculate movement delta
    const deltaX = toRect.left - fromRect.left;
    const deltaY = toRect.top - fromRect.top;
    
    // If there's a piece to capture, animate it fading out
    const capturedPiece = toSquare.querySelector('.unicode-piece');
    if (capturedPiece && capturedPiece !== piece) {
        capturedPiece.classList.add('captured-piece');
    }
    
    // Clone the piece for animation
    const movingPiece = piece.cloneNode(true);
    movingPiece.classList.add('moving-piece');
    movingPiece.style.position = 'fixed';
    movingPiece.style.left = fromRect.left + 'px';
    movingPiece.style.top = fromRect.top + 'px';
    movingPiece.style.width = fromRect.width + 'px';
    movingPiece.style.height = fromRect.height + 'px';
    document.body.appendChild(movingPiece);
    
    // Hide original piece
    piece.style.opacity = '0';
    
    // Trigger animation
    requestAnimationFrame(() => {
        movingPiece.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    });
    
    // After animation completes
    setTimeout(() => {
        // Remove animated piece
        movingPiece.remove();
        
        // Update board and call callback
        if (callback) callback();
    }, 500); // Match CSS transition duration
}

// Make a move using Stockfish
function makeEngineMove() {
    if (!stockfish) {
        console.error('Stockfish not initialized');
        return;
    }
    
    if (game.isGameOver()) return; // Changed from game.game_over()

    try {
        console.log(`Making engine move for ${game.turn() === 'w' ? 'White' : 'Black'}`);
        
        // Show CPU indicator when engine starts thinking
        showCPUIndicator();
        
        const fen = game.fen();
        stockfish.postMessage(`position fen ${fen}`);
        stockfish.postMessage(`go depth ${stockfishDepth}`);
    } catch (e) {
        console.error('Error in makeEngineMove:', e);
        hideCPUIndicator();
    }
}

// Apply visual effects when reinforcement piece is placed
function applyReinforcementVisualEffect(square, player) {
    const squareElement = document.querySelector(`#board [data-square="${square}"]`);
    if (!squareElement) return;
    
    // Find the piece element on this square
    const pieceElement = squareElement.querySelector('.unicode-piece');
    if (!pieceElement) return;
    
    // Add glow effect to the piece
    const colorClass = player === 'w' ? 'white-reinforcement' : 'black-reinforcement';
    pieceElement.classList.add('reinforcement-glow', colorClass);
    
    // Add ripple effect to the square
    const rippleEffect = document.createElement('div');
    rippleEffect.className = `reinforcement-square-effect ${player === 'w' ? 'white-effect' : 'black-effect'}`;
    squareElement.appendChild(rippleEffect);
    
    // Remove effects after animation completes
    setTimeout(() => {
        pieceElement.classList.remove('reinforcement-glow', colorClass);
        rippleEffect.remove();
    }, 2500);
    
    // Add a temporary glow to the entire board
    const boardElement = document.getElementById('board');
    boardElement.style.boxShadow = player === 'w' 
        ? '0 0 100px rgba(244, 232, 208, 0.6), inset 0 0 50px rgba(244, 232, 208, 0.2)'
        : '0 0 100px rgba(139, 127, 199, 0.6), inset 0 0 50px rgba(139, 127, 199, 0.2)';
    
    setTimeout(() => {
        boardElement.style.boxShadow = '';
    }, 1000);
}

// Check if Black AI should use reinforcement instead of regular move
function checkAndUseBlackReinforcement() {
    // Only check if it's Black's turn and there's a pending reinforcement
    if (game.turn() === 'b' && pendingReinforcement && pendingReinforcement.player === 'b') {
        // Show visual indicator that AI is considering reinforcement
        const reinforcementPiece = document.getElementById('reinforcementPiece');
        if (reinforcementPiece) {
            reinforcementPiece.classList.add('reinforcement-considering');
        }
        
        // Small delay to show the considering animation
        setTimeout(async () => {
            // Use the reinforcement AI to decide
            if (await reinforcementAI.shouldUseReinforcement(game, pendingReinforcement)) {
                console.log("Reinforcement AI decided to use reinforcement now!");
                
                // Get the best square for placement
                const targetSquare = reinforcementAI.chooseBestSquare(game, pendingReinforcement);
                
                if (targetSquare) {
                    // Execute the reinforcement placement
                    executeBlackReinforcement(targetSquare);
                    return; // Don't make regular engine move
                }
            } else {
                console.log("Reinforcement AI decided to wait.");
            }
            
            // Remove considering animation
            if (reinforcementPiece) {
                reinforcementPiece.classList.remove('reinforcement-considering');
            }
            
            // If no reinforcement or AI decided not to use it, make regular move
            makeEngineMove();
        }, 1000); // 1 second delay to show considering animation
    } else {
        // If no reinforcement, make regular move
        makeEngineMove();
    }
}

// Execute Black's reinforcement placement
function executeBlackReinforcement(targetSquare) {
    if (!pendingReinforcement || pendingReinforcement.player !== 'b') {
        console.error("No valid black reinforcement to execute");
        makeEngineMove();
        return;
    }
    
    const piece = pendingReinforcement.piece;
    const player = pendingReinforcement.player;
    
    // Double-check that the square is still valid
    const currentValidSquares = getValidReinforcementSquares(player);
    if (!currentValidSquares.includes(targetSquare)) {
        console.error(`Square ${targetSquare} is no longer valid for reinforcement!`);
        pendingReinforcement = null;
        hideReinforcement();
        makeEngineMove();
        return;
    }
    
    // Save the current move history before loading new position
    const savedHistory = game.history({ verbose: true });
    
    // Add the piece to the board
    const fen = game.fen();
    const fenParts = fen.split(' ');
    let position = fenParts[0];
    
    // Convert square to board indices
    const file = targetSquare.charCodeAt(0) - 97; // a-h -> 0-7
    const rank = 8 - parseInt(targetSquare[1]); // 1-8 -> 7-0
    
    // Update FEN position string
    const rows = position.split('/');
    let row = rows[rank];
    let expandedRow = '';
    
    // Expand numbers to dots
    for (let char of row) {
        if (isNaN(char)) {
            expandedRow += char;
        } else {
            expandedRow += '.'.repeat(parseInt(char));
        }
    }
    
    // Check what's currently at this position - should be empty
    const currentPiece = expandedRow[file];
    if (currentPiece && currentPiece !== '.') {
        console.error(`Cannot place reinforcement on occupied square! Square ${targetSquare} contains ${currentPiece}`);
        // This shouldn't happen as valid squares should be empty
        pendingReinforcement = null;
        hideReinforcement();
        setTimeout(() => {
            if (!game.isGameOver() && game.turn() === player) {
                makeEngineMove();
            }
        }, 100);
        return;
    }
    
    // Place the piece
    const pieceChar = player === 'w' ? piece.toUpperCase() : piece.toLowerCase();
    expandedRow = expandedRow.substring(0, file) + pieceChar + expandedRow.substring(file + 1);
    
    // Compress back to FEN
    let compressedRow = '';
    let emptyCount = 0;
    for (let char of expandedRow) {
        if (char === '.') {
            emptyCount++;
        } else {
            if (emptyCount > 0) {
                compressedRow += emptyCount;
                emptyCount = 0;
            }
            compressedRow += char;
        }
    }
    if (emptyCount > 0) {
        compressedRow += emptyCount;
    }
    
    rows[rank] = compressedRow;
    fenParts[0] = rows.join('/');
    const newFen = fenParts.join(' ');
    
    // Load the new position
    game.load(newFen);
    board.position(game.fen());
    renderUnicodePieces();
    updateStatus();
    
    // Add reinforcement placement to history tracker
    const pieceName = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen' }[piece];
    gameHistoryTracker = [...savedHistory];
    gameHistoryTracker.push(`Black ${pieceName} → ${targetSquare}`);
    
    updateHistory();
    
    // Apply visual effects to the reinforcement piece
    applyReinforcementVisualEffect(targetSquare, 'b');
    
    // Clear the reinforcement
    pendingReinforcement = null;
    hideReinforcement();
    hasAppliedReinforcement = true; // Mark as applied when piece is actually placed
    
    console.log(`Black AI placed ${piece} reinforcement on ${targetSquare}`);
    
    // After placing reinforcement, Black still needs to make a move
    setTimeout(() => {
        if (!game.isGameOver() && game.turn() === 'b') {
            makeEngineMove();
        }
    }, 500); // Small delay for visual feedback
}

// Check if White AI should use reinforcement instead of regular move
function checkAndUseWhiteReinforcement() {
    // Only check if it's White's turn and there's a pending reinforcement
    if (game.turn() === 'w' && pendingReinforcement && pendingReinforcement.player === 'w') {
        // Show visual indicator that AI is considering reinforcement
        const reinforcementPiece = document.getElementById('reinforcementPiece');
        if (reinforcementPiece) {
            reinforcementPiece.classList.add('reinforcement-considering');
        }
        
        // Small delay to show the considering animation
        setTimeout(async () => {
            // Use the reinforcement AI to decide
            if (await reinforcementAI.shouldUseReinforcement(game, pendingReinforcement)) {
                console.log("Reinforcement AI decided White should use reinforcement now!");
                
                // Get the best square for placement
                const targetSquare = reinforcementAI.chooseBestSquare(game, pendingReinforcement);
                
                if (targetSquare) {
                    // Execute the reinforcement placement
                    executeWhiteReinforcement(targetSquare);
                    return; // Don't make regular engine move
                }
            } else {
                console.log("Reinforcement AI decided White should wait.");
            }
            
            // Remove considering animation
            if (reinforcementPiece) {
                reinforcementPiece.classList.remove('reinforcement-considering');
            }
            
            // If no reinforcement or AI decided not to use it, make regular move
            makeEngineMove();
        }, 1000); // 1 second delay to show considering animation
    } else {
        // If no reinforcement, make regular move
        makeEngineMove();
    }
}

// Execute White's reinforcement placement
function executeWhiteReinforcement(targetSquare) {
    if (!pendingReinforcement || pendingReinforcement.player !== 'w') {
        console.error("No valid white reinforcement to execute");
        makeEngineMove();
        return;
    }
    
    const piece = pendingReinforcement.piece;
    const player = pendingReinforcement.player;
    
    // Double-check that the square is still valid
    const currentValidSquares = getValidReinforcementSquares(player);
    if (!currentValidSquares.includes(targetSquare)) {
        console.error(`Square ${targetSquare} is no longer valid for reinforcement!`);
        pendingReinforcement = null;
        hideReinforcement();
        makeEngineMove();
        return;
    }
    
    // Save the current move history before loading new position
    const savedHistory = game.history({ verbose: true });
    
    // Add the piece to the board
    const fen = game.fen();
    const fenParts = fen.split(' ');
    let position = fenParts[0];
    
    // Convert square to board indices
    const file = targetSquare.charCodeAt(0) - 97; // a-h -> 0-7
    const rank = 8 - parseInt(targetSquare[1]); // 1-8 -> 7-0
    
    // Update FEN position string
    const rows = position.split('/');
    let row = rows[rank];
    let expandedRow = '';
    
    // Expand numbers to dots
    for (let char of row) {
        if (isNaN(char)) {
            expandedRow += char;
        } else {
            expandedRow += '.'.repeat(parseInt(char));
        }
    }
    
    // Check what's currently at this position - should be empty
    const currentPiece = expandedRow[file];
    if (currentPiece && currentPiece !== '.') {
        console.error(`Cannot place reinforcement on occupied square! Square ${targetSquare} contains ${currentPiece}`);
        // This shouldn't happen as valid squares should be empty
        pendingReinforcement = null;
        hideReinforcement();
        setTimeout(() => {
            if (!game.isGameOver() && game.turn() === player) {
                makeEngineMove();
            }
        }, 100);
        return;
    }
    
    // Place the piece
    const pieceChar = player === 'w' ? piece.toUpperCase() : piece.toLowerCase();
    expandedRow = expandedRow.substring(0, file) + pieceChar + expandedRow.substring(file + 1);
    
    // Compress back to FEN
    let compressedRow = '';
    let emptyCount = 0;
    for (let char of expandedRow) {
        if (char === '.') {
            emptyCount++;
        } else {
            if (emptyCount > 0) {
                compressedRow += emptyCount;
                emptyCount = 0;
            }
            compressedRow += char;
        }
    }
    if (emptyCount > 0) {
        compressedRow += emptyCount;
    }
    
    rows[rank] = compressedRow;
    fenParts[0] = rows.join('/');
    const newFen = fenParts.join(' ');
    
    // Load the new position
    game.load(newFen);
    board.position(game.fen());
    renderUnicodePieces();
    updateStatus();
    
    // Add reinforcement placement to history tracker
    const pieceName = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen' }[piece];
    gameHistoryTracker = [...savedHistory];
    gameHistoryTracker.push(`White ${pieceName} → ${targetSquare}`);
    
    updateHistory();
    
    // Apply visual effects to the reinforcement piece
    applyReinforcementVisualEffect(targetSquare, 'w');
    
    // Clear the reinforcement
    pendingReinforcement = null;
    hideReinforcement();
    hasAppliedReinforcement = true; // Mark as applied when piece is actually placed
    
    console.log(`White AI placed ${piece} reinforcement on ${targetSquare}`);
    
    // After placing reinforcement, White still needs to make a move
    setTimeout(() => {
        if (!game.isGameOver() && game.turn() === 'w') {
            makeEngineMove();
        }
    }, 500); // Small delay for visual feedback
}

// Function to generate random FEN with randomized pieces
function generateRandomPosition() {
    const piecesBackRank = ['r', 'n', 'b', 'q']; // No pawns on back rank
    const piecesSecondRank = ['r', 'n', 'b', 'q', 'p']; // Pawns allowed on 2nd/7th rank
    const backRankWeights = [2, 2, 2, 1]; // Weights for back rank pieces
    const secondRankWeights = [2, 2, 2, 1, 4]; // Weights including pawns
    
    function getRandomPiece(pieces, weights) {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        for (let i = 0; i < pieces.length; i++) {
            random -= weights[i];
            if (random <= 0) return pieces[i];
        }
        return pieces[0];
    }
    
    function generateRandomRow(includeKing, isBackRank) {
        let row = [];
        let kingPosition = includeKing ? Math.floor(Math.random() * 8) : -1;
        const pieces = isBackRank ? piecesBackRank : piecesSecondRank;
        const weights = isBackRank ? backRankWeights : secondRankWeights;
        
        for (let i = 0; i < 8; i++) {
            if (i === kingPosition) {
                row.push('k');
            } else {
                row.push(getRandomPiece(pieces, weights));
            }
        }
        return row.join('');
    }
    
    // Generate positions for both colors
    // Rank 8 (black back rank) - no pawns allowed
    let blackRow1 = generateRandomRow(true, true);  // Include black king, back rank
    // Rank 7 (black second rank) - pawns allowed
    let blackRow2 = generateRandomRow(false, false);
    // Rank 2 (white second rank) - pawns allowed  
    let whiteRow2 = generateRandomRow(false, false);
    // Rank 1 (white back rank) - no pawns allowed
    let whiteRow1 = generateRandomRow(true, true);  // Include white king, back rank
    
    // Convert white pieces to uppercase
    whiteRow1 = whiteRow1.toUpperCase();
    whiteRow2 = whiteRow2.toUpperCase();
    
    // Construct FEN
    const fen = `${blackRow1}/${blackRow2}/8/8/8/8/${whiteRow2}/${whiteRow1} w - - 0 1`;
    
    return fen;
}

// Start a new Garrison Chess game
document.getElementById('startBtn').addEventListener('click', () => {
    try {
        const randomFen = generateRandomPosition();
        console.log("Generated Garrison Chess position:", randomFen);
        
        // Reset game state
        hasAppliedReinforcement = false;
        gameHistoryTracker = []; // Reset custom history tracker
        gameStartTime = Date.now(); // Reset game timer
        
        // Load the random position
        game.load(randomFen);
        board.position(game.fen());
        renderUnicodePieces();
        updateStatus();
        updateHistory();
        
        // Try to apply reinforcement (will likely fail due to no empty squares)
        applyReinforcement();
        
        // If White is AI and no pending reinforcement, make a move
        if (game.turn() === 'w' && isWhitePlayerAi && !game.isGameOver() && !pendingReinforcement) {
            console.log("Garrison game started, White is AI, making move.");
            makeEngineMove();
        }
    } catch (e) {
        console.error("Error in Start Garrison Game button click:", e);
        if (e.stack) console.error("Stack:", e.stack);
        alert("Failed to create Garrison Chess position. It may have resulted in an illegal position.");
    }
});

// Note: Randomize button removed - all games are now Garrison Chess by default

// Undo last move
document.getElementById('undoBtn').addEventListener('click', () => {
    try {
        // stockfish.postMessage('stop'); // Optional: stop any current calculation
        game.undo();
        // If the opponent was also AI and made a move, you might want to undo twice.
        // For now, simple single undo.
        // Example: W(H) moves, B(AI) moves. Undo B(AI)'s move. It's B(AI)'s turn.
        // Example: W(AI) moves, B(AI) moves. Undo B(AI)'s move. It's B(AI)'s turn.

        board.position(game.fen());
        renderUnicodePieces(); // <--- Add this call
        updateStatus();
        updateHistory();

        // After undoing, check if it's an AI's turn to move
        if (!game.isGameOver()) {
            const currentTurnAfterUndo = game.turn();
            if (currentTurnAfterUndo === 'w' && isWhitePlayerAi) {
                console.log("Undo resulted in White AI's turn, making move.");
                makeEngineMove();
            } else if (currentTurnAfterUndo === 'b') { // Black is always AI
                console.log("Undo resulted in Black AI's turn, making move.");
                makeEngineMove();
            }
        }
    } catch (e) {
        console.error("Error in Undo Move button click:", e);
        if (e.stack) console.error("Stack:", e.stack);
        // alert("Error undoing move. Check console for details."); // Optional user feedback
    }
});

// Apply Stockfish settings
document.getElementById('applySettings').addEventListener('click', () => {
    try {
        const threadsInput = parseInt(document.getElementById('threads').value);
        const depthInput = parseInt(document.getElementById('depth').value);

        if (isNaN(threadsInput) || threadsInput < 1 || threadsInput > 8) {
            alert('Threads must be a number between 1 and 8.');
            return;
        }

        if (isNaN(depthInput) || depthInput < 1 || depthInput > 20) {
            alert('Depth must be a number between 1 and 20.');
            return;
        }

        stockfishThreads = threadsInput;
        stockfishDepth = depthInput;

        stockfish.postMessage(`setoption name Threads value ${stockfishThreads}`);
        stockfish.postMessage('uci');
        console.log(`Stockfish settings applied: Threads=${stockfishThreads}, Depth=${stockfishDepth}`);
    } catch (e) {
        console.error("Error in Apply Settings button click:", e);
        if (e.stack) console.error("Stack:", e.stack);
        // alert("Error applying settings. Check console for details."); // Optional user feedback
    }
});

// Move History
function updateHistory() {
    const historyElement = document.getElementById('history');
    historyElement.innerHTML = '';
    
    // Use custom history tracker if it has moves, otherwise use game history
    const history = gameHistoryTracker.length > 0 ? gameHistoryTracker : game.history({ verbose: true });
    
    // Always sync the tracker with current game history if not using custom
    if (gameHistoryTracker.length === 0) {
        gameHistoryTracker = [...history];
    }
    
    history.forEach((move, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const isWhite = index % 2 === 0;
        const moveSan = typeof move === 'string' ? move : move.san;
        
        if (isWhite) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${moveNumber}.</strong> <span class="white-move">♔ ${moveSan}</span>`;
            historyElement.appendChild(li);
        } else {
            const lastLi = historyElement.lastChild;
            lastLi.innerHTML += ` <span class="black-move">♚ ${moveSan}</span>`;
        }
    });
}

// Highlight Last Move
let whiteSquareGrey = '#a9a9a9';
let blackSquareGrey = '#696969';

function removeHighlights() {
    document.querySelectorAll('.square-55d63').forEach(square => {
        square.style.background = '';
    });
}

function highlightMove(move) {
    removeHighlights();
    const fromSquare = move.from;
    const toSquare = move.to;

    const fromEl = document.querySelector(`#board [data-square="${fromSquare}"]`);
    const toEl = document.querySelector(`#board [data-square="${toSquare}"]`);

    if (fromEl) fromEl.style.background = whiteSquareGrey;
    if (toEl) toEl.style.background = blackSquareGrey;
}

// Show game over popup
function showGameOverPopup(winner, reason) {
    const overlay = document.getElementById('gameOverOverlay');
    const message = document.getElementById('gameOverMessage');
    const crown = document.querySelector('.game-over-crown');
    const totalMoves = document.getElementById('totalMoves');
    const gameDuration = document.getElementById('gameDuration');
    
    // Calculate game duration
    const duration = Date.now() - gameStartTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    gameDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Set total moves
    totalMoves.textContent = game.history().length;
    
    // Set message and styling based on winner
    if (winner === 'white') {
        message.textContent = 'White Wins!';
        message.className = 'game-over-message white-wins';
        crown.textContent = '♔';
        crown.style.color = '#f4e8d0';
    } else if (winner === 'black') {
        message.textContent = 'Black Wins!';
        message.className = 'game-over-message black-wins';
        crown.textContent = '♚';
        crown.style.color = '#8b7fc7';
    } else {
        message.textContent = 'Draw!';
        message.className = 'game-over-message draw';
        crown.textContent = '♔♚';
        crown.style.color = 'rgba(255, 255, 255, 0.7)';
    }
    
    // Add reason subtitle
    if (reason === 'checkmate') {
        message.innerHTML += '<br><span style="font-size: 16px; opacity: 0.8;">by checkmate</span>';
    } else if (reason === 'stalemate') {
        message.innerHTML += '<br><span style="font-size: 16px; opacity: 0.8;">by stalemate</span>';
    } else if (reason === 'draw') {
        message.innerHTML += '<br><span style="font-size: 16px; opacity: 0.8;">by agreement</span>';
    }
    
    // Show the overlay
    overlay.classList.add('show');
}

// Hide game over popup
function hideGameOverPopup() {
    const overlay = document.getElementById('gameOverOverlay');
    overlay.classList.remove('show');
}

// Initialize status and history
updateStatus();
updateHistory();

// Call renderUnicodePieces after the browser's next repaint,
// ensuring chessboard.js has likely completed its initial DOM setup.
requestAnimationFrame(() => {
    renderUnicodePieces();
    // Material strength will be updated by renderUnicodePieces
});

// Automatically start a new Garrison Chess game on page load
setTimeout(() => {
    document.getElementById('startBtn').click();
}, 200);

// Game over popup button listeners
document.getElementById('newGameBtn').addEventListener('click', () => {
    hideGameOverPopup();
    // Trigger the start new game button
    document.getElementById('startBtn').click();
});

// Click outside popup to close
document.getElementById('gameOverOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'gameOverOverlay') {
        hideGameOverPopup();
    }
});

// Mobile tap-to-move functionality
document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window;
    
    if (isMobile) {
        let selectedSquare = null;
        let possibleMoves = [];
        
        // Override chessboard draggable for mobile
        setTimeout(() => {
            if (board) {
                board.draggable(false);
            }
        }, 100);
        
        // Add click handlers to squares
        document.addEventListener('click', (e) => {
            const square = e.target.closest('[data-square]');
            if (!square) {
                // Clicked outside board - deselect
                clearSelection();
                return;
            }
            
            const squareId = square.getAttribute('data-square');
            
            // If we have a selected piece
            if (selectedSquare) {
                // Check if this is a valid move
                if (possibleMoves.includes(squareId)) {
                    // Make the move
                    const move = game.move({
                        from: selectedSquare,
                        to: squareId,
                        promotion: 'q' // Always promote to queen for simplicity
                    });
                    
                    if (move) {
                        board.position(game.fen());
                        renderUnicodePieces();
                        clearSelection();
                        onMoveEnd(selectedSquare, squareId);
                    }
                } else {
                    // Clicked on another piece or invalid square
                    clearSelection();
                    // Check if we clicked on our own piece
                    selectPiece(squareId);
                }
            } else {
                // No piece selected - try to select this square
                selectPiece(squareId);
            }
        });
        
        function selectPiece(square) {
            const piece = game.get(square);
            if (!piece) return;
            
            // Check if it's the player's turn and their piece
            const isWhiteTurn = game.turn() === 'w';
            const isWhitePiece = piece.color === 'w';
            
            // Only select if it's the human player's piece
            if (isWhiteTurn && isWhitePiece && !isWhitePlayerAi) {
                highlightSquare(square);
                selectedSquare = square;
                showPossibleMoves(square);
            } else if (!isWhiteTurn && !isWhitePiece) {
                // Black is always AI, so don't allow selection
                return;
            }
        }
        
        function showPossibleMoves(square) {
            // Get all legal moves for this piece
            const moves = game.moves({ square: square, verbose: true });
            possibleMoves = moves.map(m => m.to);
            
            // Highlight possible move squares
            possibleMoves.forEach(sq => {
                $(`#board [data-square="${sq}"]`).addClass('possible-move');
            });
        }
        
        function highlightSquare(square) {
            clearSelection();
            $(`#board [data-square="${square}"]`).addClass('selected-square');
        }
        
        function clearSelection() {
            selectedSquare = null;
            possibleMoves = [];
            $('.selected-square').removeClass('selected-square');
            $('.possible-move').removeClass('possible-move');
        }
    }
});
