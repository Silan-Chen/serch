import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ChatBot.css';

const API_BASE = '/api/dify';
const USER_ID = 'web-chat-user-' + Math.random().toString(36).substring(7);

function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workflowProgress, setWorkflowProgress] = useState({ step: 0, total: 0, title: '' });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const startTimeRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  // 格式化工作流输出
  const formatWorkflowOutput = useCallback((outputs, elapsedTime) => {
    if (!outputs) return <div className="no-result">工作流执行完成，无输出内容。</div>;

    // 如果 output 是数组（如学术论文检索结果）
    if (outputs.output && Array.isArray(outputs.output)) {
      const items = outputs.output;
      return (
        <div className="workflow-results">
          <div className="results-header">
            <span className="results-count">📄 找到 {items.length} 篇相关论文</span>
            <span className="results-time">⏱ {elapsedTime?.toFixed(1) || '—'}s</span>
          </div>
          {items.map((item, index) => {
            const titleMatch = item.match(/标题[：:]\s*(.+)/);
            const authorMatch = item.match(/作者[：:]\s*(.+)/);
            const dateMatch = item.match(/发布日期[：:]\s*(.+)/);
            const linkMatch = item.match(/链接[：:]\s*(.+)/);
            const abstractMatch = item.match(/摘要[：:]\s*(.+)/);

            if (titleMatch) {
              return (
                <div key={index} className="result-card">
                  <div className="result-number">#{index + 1}</div>
                  <div className="result-content">
                    {titleMatch && <div className="result-title">{titleMatch[1]}</div>}
                    <div className="result-metas">
                      {authorMatch && <span className="result-meta">👤 {authorMatch[1]}</span>}
                      {dateMatch && <span className="result-meta">📅 {dateMatch[1]}</span>}
                    </div>
                    {linkMatch && (
                      <a href={linkMatch[1]} target="_blank" rel="noopener noreferrer" className="result-link">
                        🔗 查看原文
                      </a>
                    )}
                    {abstractMatch && <div className="result-abstract">{abstractMatch[1]}</div>}
                  </div>
                </div>
              );
            }
            return <div key={index} className="result-text">{item}</div>;
          })}
        </div>
      );
    }

    // 如果 outputs 是对象
    if (typeof outputs === 'object') {
      const text = outputs.text || outputs.result || outputs.answer || JSON.stringify(outputs, null, 2);
      return <div className="result-text">{text}</div>;
    }

    return <div className="result-text">{String(outputs)}</div>;
  }, []);

  // 渲染进度指示器
  const renderProgress = useCallback(() => (
    <div className="workflow-progress">
      <div className="progress-header">
        <span className="progress-spinner"></span>
        <span className="progress-text">
          {workflowProgress.title || '正在执行工作流...'}
        </span>
      </div>
      {workflowProgress.total > 0 && (
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${(workflowProgress.step / workflowProgress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  ), [workflowProgress]);

  const sendMessage = useCallback(async (keyword) => {
    if (!keyword.trim() || loading) return;

    setInput('');
    setError('');
    setWorkflowProgress({ step: 0, total: 0, title: '' });
    setMessages(prev => [...prev, { role: 'user', content: keyword, id: Date.now() }]);
    setLoading(true);
    startTimeRef.current = Date.now();

    // bot 消息占位
    const botMsgId = Date.now() + 1;
    setMessages(prev => [...prev, { role: 'bot', content: null, id: botMsgId }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/workflows/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: { keyword: keyword },
          response_mode: 'streaming',
          user: USER_ID,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `请求失败 (${response.status})`);
      }

      // 读取 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalOutputs = null;
      let nodeCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          try {
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            const event = JSON.parse(jsonStr);

            switch (event.event) {
              case 'workflow_started':
                setWorkflowProgress({ step: 0, total: 0, title: '🚀 工作流已启动' });
                setMessages(prev => prev.map(msg =>
                  msg.id === botMsgId ? { ...msg, content: null } : msg
                ));
                break;

              case 'node_started':
                nodeCount++;
                setWorkflowProgress({
                  step: nodeCount,
                  total: 5,
                  title: `⏳ ${event.data?.title || '处理中'}...`,
                });
                break;

              case 'node_finished':
                setWorkflowProgress(prev => ({ ...prev, title: `✅ ${event.data?.title || '步骤完成'}` }));
                break;

              case 'text_chunk':
                const chunkText = event.data?.text || '';
                setMessages(prev => prev.map(msg => {
                  if (msg.id === botMsgId) {
                    const prevContent = typeof msg.content === 'string' ? msg.content : '';
                    return { ...msg, content: prevContent + chunkText };
                  }
                  return msg;
                }));
                break;

              case 'workflow_finished':
                finalOutputs = event.data?.outputs || {};
                if (event.data?.error) {
                  throw new Error(event.data.error);
                }
                break;

              case 'error':
                throw new Error(event.message || '工作流执行出错');
            }
          } catch (parseError) {
            if (parseError.message && !parseError.message.includes('JSON')) {
              throw parseError;
            }
          }
        }
      }

      // 工作流完成
      const elapsed = (Date.now() - startTimeRef.current) / 1000;

      if (finalOutputs) {
        const formattedContent = formatWorkflowOutput(finalOutputs, elapsed);
        setMessages(prev => prev.map(msg =>
          msg.id === botMsgId ? { ...msg, content: formattedContent } : msg
        ));
      } else {
        setMessages(prev => prev.map(msg =>
          msg.id === botMsgId
            ? { ...msg, content: <div className="no-result">✅ 工作流执行完成 ({elapsed.toFixed(1)}s)</div> }
            : msg
        ));
      }
    } catch (err) {
      if (err.name === 'AbortError') return;

      console.error('发送失败:', err);
      setError(err.message || '发送失败，请重试');
      setMessages(prev => prev.filter(msg => msg.id !== botMsgId));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      setWorkflowProgress({ step: 0, total: 0, title: '' });
    }
  }, [loading, formatWorkflowOutput]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setWorkflowProgress({ step: 0, total: 0, title: '' });
    }
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError('');
    setLoading(false);
    setWorkflowProgress({ step: 0, total: 0, title: '' });
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // 消息内容渲染
  const renderMessageContent = (msg) => {
    if (msg.content !== null && msg.content !== undefined) {
      return msg.content;
    }
    if (msg.role === 'bot' && loading) {
      return (
        <span className="typing-indicator">
          <span></span><span></span><span></span>
        </span>
      );
    }
    return '';
  };

  return (
    <div className="chatbot">
      {/* 工具栏 */}
      <div className="chatbot-toolbar">
        <div className="toolbar-left">
          <span className="conversation-badge">
            {loading ? (
              <>
                <span className="pulse-dot"></span>
                执行中
              </>
            ) : (
              <>🔬 学术论文检索</>
            )}
          </span>
          <span className="conversation-id">Workflow API</span>
        </div>
        <button
          className="btn-new-chat"
          onClick={clearChat}
          disabled={loading}
          title="清空对话"
        >
          🗑 清空
        </button>
      </div>

      {/* 消息列表 */}
      <div className="chatbot-messages">
        {messages.length === 0 && (
          <div className="chatbot-empty">
            <div className="empty-icon">🔬</div>
            <h2>学术论文检索助手</h2>
            <p>输入关键词，检索 arXiv 最新学术论文</p>
            <div className="empty-examples">
              <button onClick={() => sendMessage('lithium battery thermal management')}>
                🔋 锂电池热管理
              </button>
              <button onClick={() => sendMessage('deep learning transformer')}>
                🧠 深度学习 Transformer
              </button>
              <button onClick={() => sendMessage('quantum computing')}>
                ⚛️ 量子计算
              </button>
              <button onClick={() => sendMessage('renewable energy solar cell')}>
                ☀️ 可再生能源
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-bubble">
              <div className="message-content">
                {renderMessageContent(msg)}
              </div>
            </div>
          </div>
        ))}

        {error && (
          <div className="message message-error">
            <div className="message-bubble error-bubble">
              ⚠️ {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 工作流进度指示器（浮动在输入框上方） */}
      {loading && (
        <div className="progress-overlay">
          {renderProgress()}
        </div>
      )}

      {/* 输入区域 */}
      <div className="chatbot-input-area">
        <form onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入搜索关键词... (Enter 发送, Shift+Enter 换行)"
              rows={1}
              disabled={loading}
              autoFocus
            />
            <div className="input-actions">
              {loading ? (
                <button
                  type="button"
                  className="btn-stop"
                  onClick={stopGeneration}
                >
                  ⏹ 停止
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn-send"
                  disabled={!input.trim()}
                >
                  ➤
                </button>
              )}
            </div>
          </div>
        </form>
        <p className="input-hint">
          输入英文关键词获得最佳检索结果 · 每次返回最多 30 篇相关论文
        </p>
      </div>
    </div>
  );
}

export default ChatBot;
