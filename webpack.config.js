const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    popup: './popup/popup.js',
    background: './background.js',
    selectHandlers: './custom-select/add-select-handlers.js',
    contentSummary: './content-summary/content-summary.js',
    gpt: './api/gpt.js',
    customSelect: './custom-select/custom-select.js'
  },
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  optimization: {
    minimize: false,
    splitChunks: {
      chunks(chunk) {
        // exclude `my-excluded-chunk`
        return false;
      }
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
};
