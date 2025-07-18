// Reinforcement AI Module - Strategic decision making for when to use reinforcement pieces
// This AI operates independently from Stockfish to determine optimal reinforcement timing

class ReinforcementAI {
    constructor() {
        // Game phase thresholds based on total material
        this.OPENING_MATERIAL = 78; // Full material = 78 points
        this.ENDGAME_MATERIAL = 30; // Endgame when total material < 30
        
        // Store reference to stockfish evaluator
        this.stockfishEval = null;
        this.evalPromise = null;
        
        // Strategic factors weights - increased king danger importance
        this.weights = {
            kingDanger: 0.50,      // How much king safety matters (increased!)
            materialDeficit: 0.25, // How much material disadvantage matters
            gamePhase: 0.10,       // Game phase importance (reduced)
            pieceActivity: 0.10,   // Potential piece activity
            timing: 0.05          // General timing factors (reduced)
        };
    }

    // Set the stockfish evaluator reference
    setStockfishEval(stockfishEval) {
        this.stockfishEval = stockfishEval;
    }
    
    // Evaluate position using Stockfish
    async evaluateWithStockfish(fen, depth = 10) {
        if (!this.stockfishEval) return null;
        
        return new Promise((resolve) => {
            let evaluation = null;
            
            const handler = (event) => {
                const message = event.data;
                if (message.includes('info depth') && message.includes('score cp')) {
                    // Extract centipawn evaluation
                    const cpMatch = message.match(/score cp (-?\d+)/);
                    if (cpMatch) {
                        evaluation = parseInt(cpMatch[1]) / 100; // Convert to pawns
                    }
                } else if (message.includes('info depth') && message.includes('score mate')) {
                    // Handle mate scores
                    const mateMatch = message.match(/score mate (-?\d+)/);
                    if (mateMatch) {
                        const mateIn = parseInt(mateMatch[1]);
                        evaluation = mateIn > 0 ? 100 : -100; // Large value for mate
                    }
                } else if (message.startsWith('bestmove')) {
                    this.stockfishEval.removeEventListener('message', handler);
                    resolve(evaluation);
                }
            };
            
            this.stockfishEval.addEventListener('message', handler);
            this.stockfishEval.postMessage(`position fen ${fen}`);
            this.stockfishEval.postMessage(`go depth ${depth}`);
            
            // Timeout after 2 seconds
            setTimeout(() => {
                this.stockfishEval.removeEventListener('message', handler);
                resolve(evaluation);
            }, 2000);
        });
    }

    // Main decision function - returns true if AI should use reinforcement now
    async shouldUseReinforcement(game, pendingReinforcement) {
        if (!pendingReinforcement || !pendingReinforcement.validSquares || pendingReinforcement.validSquares.length === 0) {
            return false;
        }

        // EMERGENCY OVERRIDES - use reinforcement immediately in critical situations
        if (game.isCheck() && game.turn() === pendingReinforcement.player) {
            const moves = game.moves();
            if (moves.length <= 3) {
                console.log('EMERGENCY: In check with very few moves - USE REINFORCEMENT NOW!');
                return true;
            }
        }
        
        // Check if we're about to be checkmated
        const material = this.calculateMaterial(game);
        const deficit = pendingReinforcement.player === 'w' ? 
            material.black - material.white : 
            material.white - material.black;
        
        if (deficit >= 15 && game.isCheck()) {
            console.log('EMERGENCY: Huge material deficit and in check - USE REINFORCEMENT NOW!');
            return true;
        }

        // Calculate various strategic factors
        const evaluation = {
            kingDanger: this.evaluateKingDanger(game, pendingReinforcement.player),
            materialDeficit: this.evaluateMaterialDeficit(game, pendingReinforcement.player),
            gamePhase: this.evaluateGamePhase(game),
            pieceActivity: this.evaluatePieceActivity(game, pendingReinforcement),
            timing: this.evaluateTiming(game)
        };

        // Calculate weighted score (0-1 range, higher = use reinforcement now)
        const score = Object.keys(evaluation).reduce((total, factor) => {
            return total + (evaluation[factor] * this.weights[factor]);
        }, 0);

        // Decision threshold varies by game phase
        const threshold = this.getDecisionThreshold(evaluation.gamePhase);
        
        // Use Stockfish to evaluate if we should use reinforcement
        if (this.stockfishEval && score >= threshold * 0.8) { // Close to threshold
            console.log('Using Stockfish to evaluate reinforcement decision...');
            
            // Evaluate current position
            const currentEval = await this.evaluateWithStockfish(game.fen(), 8);
            
            if (currentEval !== null) {
                // Adjust for player perspective (positive = good for white)
                const adjustedEval = pendingReinforcement.player === 'w' ? currentEval : -currentEval;
                
                // If position is very bad, use reinforcement
                if (adjustedEval < -5) {
                    console.log(`Stockfish eval: ${adjustedEval} - Position is bad, USE REINFORCEMENT!`);
                    return true;
                } else if (adjustedEval < -2 && score >= threshold * 0.9) {
                    console.log(`Stockfish eval: ${adjustedEval} - Position is poor and close to threshold, USE REINFORCEMENT!`);
                    return true;
                }
            }
        }

        console.log('Reinforcement AI Evaluation:', {
            factors: evaluation,
            totalScore: score,
            threshold: threshold,
            decision: score >= threshold ? 'USE NOW' : 'WAIT'
        });

        return score >= threshold;
    }

    // Evaluate king danger (0-1, higher = more danger)
    evaluateKingDanger(game, player) {
        let dangerScore = 0;
        
        // Check if in check - this is serious!
        if (game.isCheck() && game.turn() === player) {
            dangerScore += 0.6; // Increased from 0.4
            
            // Check if we can get out of check
            const moves = game.moves();
            if (moves.length <= 2) {
                // Very few escape moves - critical danger!
                dangerScore += 0.3;
            }
        }
        
        // Check for checkmate threats
        const checkmateThreats = this.detectCheckmateThreats(game, player);
        if (checkmateThreats > 0) {
            dangerScore += Math.min(checkmateThreats * 0.4, 0.8);
        }
        
        // Evaluate king safety based on pawn shield and piece proximity
        const kingSquare = this.findKing(game, player);
        if (!kingSquare) return 1; // No king? Maximum danger!
        
        const kingFile = kingSquare.charCodeAt(0) - 97; // 0-7
        const kingRank = parseInt(kingSquare[1]) - 1; // 0-7
        
        // Check pawn shield (for castled positions)
        const pawnShieldScore = this.evaluatePawnShield(game, player, kingFile, kingRank);
        dangerScore += (1 - pawnShieldScore) * 0.2;
        
        // Check enemy piece proximity
        const enemyProximity = this.evaluateEnemyProximity(game, player, kingFile, kingRank);
        dangerScore += enemyProximity * 0.3;
        
        // Extra danger if king is exposed in center
        const centerExposure = this.evaluateKingCenterExposure(kingFile, kingRank);
        dangerScore += centerExposure * 0.2;
        
        return Math.min(dangerScore, 1);
    }

    // Evaluate material deficit (0-1, higher = worse deficit)
    evaluateMaterialDeficit(game, player) {
        const material = this.calculateMaterial(game);
        const deficit = player === 'w' ? 
            material.black - material.white : 
            material.white - material.black;
        
        // Normalize deficit (9 = queen value, so max reasonable deficit ~20)
        return Math.min(deficit / 20, 1);
    }

    // Evaluate game phase (0 = opening, 0.5 = middlegame, 1 = endgame)
    evaluateGamePhase(game) {
        const material = this.calculateMaterial(game);
        const totalMaterial = material.white + material.black;
        
        if (totalMaterial >= this.OPENING_MATERIAL * 0.9) {
            return 0; // Opening
        } else if (totalMaterial <= this.ENDGAME_MATERIAL) {
            return 1; // Endgame
        } else {
            // Middlegame - scale between 0.3 and 0.7
            const range = this.OPENING_MATERIAL * 0.9 - this.ENDGAME_MATERIAL;
            const position = totalMaterial - this.ENDGAME_MATERIAL;
            return 0.3 + (1 - position / range) * 0.4;
        }
    }

    // Evaluate potential piece activity after reinforcement
    evaluatePieceActivity(game, pendingReinforcement) {
        const piece = pendingReinforcement.piece;
        const validSquares = pendingReinforcement.validSquares;
        
        // Score based on piece type and best placement square
        let bestActivityScore = 0;
        
        validSquares.forEach(square => {
            let score = 0;
            const file = square.charCodeAt(0) - 97;
            const rank = parseInt(square[1]) - 1;
            
            // Central squares are generally better
            const centrality = (3.5 - Math.abs(file - 3.5)) * (3.5 - Math.abs(rank - 3.5)) / 12.25;
            score += centrality * 0.3;
            
            // Piece-specific scoring
            switch(piece) {
                case 'q':
                    score += 0.7; // Queen is always highly active
                    break;
                case 'r':
                    // Rooks like open files
                    score += this.isOpenFile(game, file) ? 0.6 : 0.3;
                    break;
                case 'n':
                    // Knights like central squares
                    score += centrality * 0.5;
                    break;
                case 'b':
                    // Bishops like long diagonals
                    score += 0.4;
                    break;
                case 'p':
                    // Pawns advancing toward promotion
                    const promotionDistance = pendingReinforcement.player === 'w' ? 7 - rank : rank;
                    score += (7 - promotionDistance) / 7 * 0.5;
                    break;
            }
            
            bestActivityScore = Math.max(bestActivityScore, score);
        });
        
        return bestActivityScore;
    }

    // Evaluate general timing factors
    evaluateTiming(game) {
        const moveCount = game.history().length;
        let timingScore = 0;
        
        // Avoid too early (first 10 moves)
        if (moveCount < 10) {
            timingScore = moveCount / 20;
        } else {
            timingScore = 0.5;
        }
        
        // Increase urgency in late game
        if (moveCount > 40) {
            timingScore += Math.min((moveCount - 40) / 40, 0.5);
        }
        
        return timingScore;
    }

    // Helper functions
    findKing(game, player) {
        const board = game.board();
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece && piece.type === 'k' && piece.color === player) {
                    const file = String.fromCharCode(97 + col);
                    const rank = 8 - row;
                    return file + rank;
                }
            }
        }
        return null;
    }

    evaluatePawnShield(game, player, kingFile, kingRank) {
        const board = game.board();
        let shieldScore = 0;
        const pawnRank = player === 'w' ? kingRank + 1 : kingRank - 1;
        
        if (pawnRank >= 0 && pawnRank < 8) {
            for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
                const piece = board[7 - pawnRank][f];
                if (piece && piece.type === 'p' && piece.color === player) {
                    shieldScore += 0.33;
                }
            }
        }
        
        return shieldScore;
    }

    evaluateEnemyProximity(game, player, kingFile, kingRank) {
        const board = game.board();
        const enemyColor = player === 'w' ? 'b' : 'w';
        let proximityScore = 0;
        
        // Check 3x3 area around king
        for (let r = Math.max(0, kingRank - 2); r <= Math.min(7, kingRank + 2); r++) {
            for (let f = Math.max(0, kingFile - 2); f <= Math.min(7, kingFile + 2); f++) {
                const piece = board[7 - r][f];
                if (piece && piece.color === enemyColor) {
                    const distance = Math.max(Math.abs(r - kingRank), Math.abs(f - kingFile));
                    proximityScore += (3 - distance) / 6;
                }
            }
        }
        
        return Math.min(proximityScore, 1);
    }

    isOpenFile(game, file) {
        const board = game.board();
        let hasPawn = false;
        
        for (let rank = 0; rank < 8; rank++) {
            const piece = board[rank][file];
            if (piece && piece.type === 'p') {
                hasPawn = true;
                break;
            }
        }
        
        return !hasPawn;
    }

    calculateMaterial(game) {
        const board = game.board();
        const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        let material = { white: 0, black: 0 };
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece) {
                    const value = values[piece.type];
                    if (piece.color === 'w') {
                        material.white += value;
                    } else {
                        material.black += value;
                    }
                }
            }
        }
        
        return material;
    }

    getDecisionThreshold(gamePhase) {
        // Lower thresholds to be more aggressive
        if (gamePhase < 0.3) {
            return 0.5; // Opening - was 0.7
        } else if (gamePhase < 0.7) {
            return 0.4; // Middlegame - was 0.6
        } else {
            return 0.3; // Endgame - was 0.5
        }
    }
    
    // Detect potential checkmate threats
    detectCheckmateThreats(game, player) {
        let threats = 0;
        const tempGame = new (game.constructor)();
        tempGame.load(game.fen());
        
        // Simulate opponent's turn
        if (tempGame.turn() !== player) {
            const moves = tempGame.moves({ verbose: true });
            
            for (const move of moves) {
                tempGame.move(move);
                
                // Check if this leads to checkmate
                if (tempGame.isCheckmate()) {
                    threats += 2; // Immediate checkmate threat!
                } else if (tempGame.isCheck()) {
                    // Check if the check is dangerous
                    const escapeMoves = tempGame.moves();
                    if (escapeMoves.length <= 1) {
                        threats += 1; // Very limited escape options
                    }
                }
                
                tempGame.undo();
            }
        }
        
        return threats;
    }
    
    // Evaluate king exposure in center
    evaluateKingCenterExposure(kingFile, kingRank) {
        // Kings are safest on the sides (castled positions)
        const fileDanger = Math.min(kingFile, 7 - kingFile) >= 2 ? 0.5 : 0;
        const rankDanger = kingRank >= 2 && kingRank <= 5 ? 0.3 : 0;
        return (fileDanger + rankDanger) / 2;
    }

    // Choose best square for reinforcement placement
    chooseBestSquare(game, pendingReinforcement) {
        const validSquares = pendingReinforcement.validSquares;
        if (!validSquares || validSquares.length === 0) return null;
        
        let bestSquare = validSquares[0];
        let bestScore = -1;
        
        validSquares.forEach(square => {
            let score = 0;
            const file = square.charCodeAt(0) - 97;
            const rank = parseInt(square[1]) - 1;
            
            // Evaluate square based on piece type
            const centrality = (3.5 - Math.abs(file - 3.5)) * (3.5 - Math.abs(rank - 3.5)) / 12.25;
            score += centrality * 0.3;
            
            // Avoid edges for most pieces
            if (file === 0 || file === 7 || rank === 0 || rank === 7) {
                score -= 0.2;
            }
            
            // Piece-specific preferences
            switch(pendingReinforcement.piece) {
                case 'r':
                    score += this.isOpenFile(game, file) ? 0.5 : 0;
                    break;
                case 'n':
                    score += centrality * 0.5;
                    break;
                case 'q':
                    // Queen prefers flexible squares
                    score += centrality * 0.3;
                    break;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestSquare = square;
            }
        });
        
        return bestSquare;
    }
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReinforcementAI;
}