import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Strictモードを一時的に無効化して、初期化の問題を回避
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);