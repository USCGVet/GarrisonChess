const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin'); // <-- Add this line

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
  plugins: [
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery',
    }),
    new CopyWebpackPlugin({ // <-- Add this plugin configuration
      patterns: [
        { from: 'node_modules/stockfish.js/stockfish.js', to: 'stockfish.js' },
        { from: 'node_modules/stockfish.js/stockfish.wasm', to: 'stockfish.wasm' },
        { from: 'src/favicon.ico', to: 'favicon.ico' },
      ],
    }),
  ],
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'dist'),
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  mode: 'development',
};
