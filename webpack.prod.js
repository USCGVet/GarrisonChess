const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/script.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true, // Clean the output directory before emit
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
    new CopyWebpackPlugin({
      patterns: [
        { from: 'node_modules/stockfish.js/stockfish.js', to: 'stockfish.js' },
        { from: 'node_modules/stockfish.js/stockfish.wasm', to: 'stockfish.wasm' },
        { from: 'src/favicon.ico', to: 'favicon.ico' },
      ],
    }),
  ],
  mode: 'production',
  optimization: {
    minimize: true,
  },
};