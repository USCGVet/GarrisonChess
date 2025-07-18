# Chess with Stockfish

A simple web-based chess game interface that uses Stockfish as the chess engine. You can play against the AI or have the AI play against itself.

## Features

*   Play chess against the Stockfish engine.
*   Toggle AI for the white player (Human vs AI, AI vs Human, AI vs AI).
*   Unicode chess pieces.
*   Move history.
*   Undo moves.
*   Adjust Stockfish engine settings (Threads, Depth).

## Prerequisites

*   [Node.js](https://nodejs.org/) (which includes npm)

## How to Launch

1.  **Clone the repository (if applicable) or download the source code.**
    ```bash
    # If it's a git repository
    git clone <repository-url>
    cd chess-stockfish
    ```

2.  **Install dependencies:**
    Open a terminal in the project's root directory (`c:\HTML\Chess-Stockfish`) and run:
    ```bash
    npm install
    ```

3.  **Start the development server:**
    After the dependencies are installed, run the following command in the terminal:
    ```bash
    npm start
    ```
    This will build the project and open it in your default web browser.

## How to Play

*   The game will open in your browser.
*   By default, you play as White, and Black is controlled by the Stockfish AI.
*   To make a move, drag and drop a piece to its new square.
*   Use the "White is AI" toggle to let the AI control the white pieces.
    *   If toggled on at the start of the game or when it's White's turn, the AI will make a move for White.
    *   If toggled off when it's White's turn, you can make a move for White.
*   Use the "New Game" button to reset the board.
*   Use the "Undo" button to take back the last move.
*   Adjust Stockfish's "Threads" and "Depth" settings and click "Apply Settings" to change the engine's thinking parameters.
