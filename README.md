# Garrison Chess 🏰

A unique chess variant where the weaker player receives a garrison reinforcement - an extra queen that can be deployed next to their king when losing by 5+ points.

**Play it live:** https://uscgvet.github.io/GarrisonChess/

## Game Rules

1. **Standard chess rules apply** with one major addition
2. **Garrison System**: When a player is down by 5+ points in material, they receive a garrison queen
3. **Deployment**: The garrison piece can only be placed on empty squares adjacent to your king
4. **One per game**: Each player can only receive one garrison reinforcement per game
5. **Strategic timing**: The AI considers the best moment to deploy the garrison for maximum impact

## Features

### Gameplay
- 🤖 **Advanced AI** powered by Stockfish with garrison-aware strategy
- 🎲 **Randomized starting positions** - every game is unique
- 👑 **Garrison reinforcement system** with visual indicators
- 🎯 **AI thinking visualization** - see what moves the AI is considering
- ⚡ **Smooth animations** on desktop, instant moves on mobile
- 📱 **Mobile optimized** with tap-to-move interface

### User Interface
- 🎨 **Modern dark theme** with purple accents
- 📊 **Material strength indicator** showing who's ahead
- 📜 **Color-coded move history** (white/black indicators)
- 🏆 **Game over popup** with statistics
- 🔧 **Adjustable AI settings** (depth and threads)

### Mobile Features
- 📱 **Tap-to-select, tap-to-move** interface (no dragging required)
- 🎯 **Visual indicators** for selected pieces and valid moves
- 📏 **Responsive design** with properly scaled pieces
- 🚀 **Garrison piece appears directly under board** when available

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build:prod
```

## Deployment

The game is automatically deployed to GitHub Pages via GitHub Actions when you push to the main branch.

### Manual Deployment
```bash
# Build and deploy
npm run deploy
```

### First-time Setup
1. Push your code to GitHub
2. Go to Settings → Pages
3. Source: Select "GitHub Actions"
4. The site will be available at `https://YOUR_USERNAME.github.io/REPO_NAME/`

## Technical Stack

- **Chess.js** - Chess game logic and move validation
- **Chessboard.js** - Interactive chess board UI
- **Stockfish.js** - World-class chess AI engine (runs in Web Worker)
- **Webpack** - Module bundling and build optimization
- **GitHub Actions** - Automated deployment to GitHub Pages

## Browser Support

- ✅ Chrome, Firefox, Safari, Edge (latest versions)
- ✅ Mobile browsers (iOS Safari, Chrome Android)
- ✅ Tablets and phones with responsive design

## Contributing

Feel free to open issues or submit pull requests! Some ideas for contributions:
- Additional garrison piece types (knight, rook, bishop)
- Different material thresholds for garrison activation
- Tournament mode with multiple games
- Player statistics tracking
- Online multiplayer support

## License

MIT License - feel free to use this code for your own projects!

---

Created with ❤️ by USCGVet | Powered by Claude 🤖
