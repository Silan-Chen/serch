import React from 'react';
import ChatBot from './components/ChatBot';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>🔬 学术论文检索助手</h1>
        <span className="app-subtitle">Dify Workflow API</span>
      </header>
      <main className="app-main">
        <ChatBot />
      </main>
    </div>
  );
}

export default App;
