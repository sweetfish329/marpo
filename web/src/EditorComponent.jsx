import React, { useEffect, useRef, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { Marp } from '@marp-team/marp-core';
import debounce from 'lodash.debounce';
import './EditorComponent.css';
import { config } from '/config.js';

const EditorComponent = ({ roomName }) => {
  const editorRef = useRef(null);
  const [preview, setPreview] = useState('');
  const marpRef = useRef(new Marp());
  const wsProviderRef = useRef(null);
  const bindingRef = useRef(null);
  const otherCursors = useRef([]);

  // 内容の保存を行う関数を追加
  const saveContent = async (content) => {
    try {
      await fetch(`/api/files/${roomName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  };

  // デバウンス処理を追加
  const debouncedSave = useCallback(
    debounce((content) => saveContent(content), 1000),
    []
  );

  // エディタの変更ハンドラを定義（一つに統合）
  const handleEditorChange = useCallback(
    (value) => {
      if (!value) return;
      try {
        const { html } = marpRef.current.render(value);
        setPreview(html);
        debouncedSave(value);
      } catch (err) {
        console.error('Preview rendering failed:', err);
      }
    },
    [debouncedSave]
  );

  // ユーザーごとに一意な色を決定する関数
  const getColorForClient = (clientID) => {
    // HSLで色相をclientIDで分散させる
    const hue = (clientID * 47) % 360;
    return `hsl(${hue}, 80%, 60%)`;
  };

  const handleEditorDidMount = async (editor) => {
    editorRef.current = editor;

    try {
      const ydoc = new Y.Doc();
      const provider = new WebsocketProvider(
        config.wsUrl,
        encodeURIComponent(roomName),
        ydoc,
        { connect: true }
      );
      wsProviderRef.current = provider;

      // MonacoモデルのEOLをLFに強制
      const model = editor.getModel();
      if (model) {
        model.setEOL && model.setEOL(1); // 1 = LF
      }

      // awarenessでカーソル同期
      const awareness = provider.awareness;
      const clientID = awareness.clientID;
      // 自分の色を一意に決定しawarenessにセット
      if (!awareness.getLocalState()?.color) {
        awareness.setLocalStateField('color', getColorForClient(clientID));
      }

      // カーソル位置デコレーション用（awarenessをローカルで参照）
      const updateOtherCursors = () => {
        const model = editor.getModel();
        const states = Array.from(awareness.getStates().entries());
        const decorations = [];
        states.forEach(([id, state]) => {
          if (id === clientID) return; // 自分は除外
          if (state.cursor && state.color) {
            const className = `remote-cursor-color-${id}`;
            if (!document.getElementById(className)) {
              const style = document.createElement('style');
              style.id = className;
              style.innerHTML = `
                .${className} {
                  border-left: 4px solid ${state.color} !important;
                  border-radius: 2px;
                  margin-left: -2px;
                  pointer-events: none;
                  z-index: 10;
                }
                .${className}::after {
                  content: '';
                  display: block;
                  position: absolute;
                  left: -2px;
                  top: 0;
                  width: 4px;
                  height: 100%;
                  background: ${state.color};
                  opacity: 0.7;
                }
              `;
              document.head.appendChild(style);
            }
            let range;
            if (
              state.cursor.startLineNumber === state.cursor.endLineNumber &&
              state.cursor.startColumn === state.cursor.endColumn
            ) {
              // 行の最大カラムを取得
              const line = state.cursor.startLineNumber;
              const maxCol = model.getLineMaxColumn(line);
              let startCol = state.cursor.startColumn;
              // カーソルが行末や空行の場合はmaxColに合わせる
              if (startCol > maxCol) startCol = maxCol;
              if (startCol === maxCol || maxCol === 1) {
                range = new window.monaco.Range(line, maxCol, line, maxCol);
              } else {
                range = new window.monaco.Range(line, startCol, line, startCol + 1);
              }
            } else {
              range = new window.monaco.Range(
                state.cursor.startLineNumber,
                state.cursor.startColumn,
                state.cursor.endLineNumber,
                state.cursor.endColumn
              );
            }
            decorations.push({
              range,
              options: {
                inlineClassName: className,
                stickiness: 1
              }
            });
          }
        });
        otherCursors.current = editor.deltaDecorations(otherCursors.current, decorations);
      };

      // 自分のカーソル位置をawarenessにセット
      let lastCursor = null;
      editor.onDidChangeCursorSelection((e) => {
        const selection = e.selection;
        const cursor = {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn
        };
        if (
          lastCursor &&
          lastCursor.startLineNumber === cursor.startLineNumber &&
          lastCursor.startColumn === cursor.startColumn &&
          lastCursor.endLineNumber === cursor.endLineNumber &&
          lastCursor.endColumn === cursor.endColumn
        ) {
          return;
        }
        lastCursor = cursor;
        awareness.setLocalStateField('cursor', cursor);
      });

      // 他ユーザーのカーソル位置をデコレーション
      let cursorUpdatePending = false;
      awareness.on('change', ({ added, updated, removed }) => {
        if (!cursorUpdatePending) {
          cursorUpdatePending = true;
          requestAnimationFrame(() => {
            updateOtherCursors();
            cursorUpdatePending = false;
          });
        }
      });

      // 接続状態の監視
      provider.on('status', ({ status }) => {
        console.log('WebSocket status:', status);
        if (status === 'connected') {
          // 初期コンテンツの読み込み
          provider.once('synced', async () => {
            try {
              const response = await fetch(`/api/files/${roomName}`);
              if (response.ok) {
                const content = await response.text();
                const normalized = content.replace(/\r\n|\r/g, '\n');
                const ytext = ydoc.getText('monaco');
                if (ytext.toString() === '') {
                  ytext.insert(0, normalized);
                } else {
                  // 既存ytextもLFで正規化
                  const current = ytext.toString().replace(/\r\n|\r/g, '\n');
                  if (current !== ytext.toString()) {
                    ytext.delete(0, ytext.length);
                    ytext.insert(0, current);
                  }
                }
                handleEditorChange(ytext.toString());
              }
            } catch (err) {
              console.error('Failed to load initial content:', err);
            }
          });
        }
      });

      // エラーハンドリング
      provider.on('connection-error', (err) => {
        console.error('WebSocket connection error:', err);
      });

      const ytext = ydoc.getText('monaco');
      const binding = new MonacoBinding(
        ytext,
        editor.getModel(),
        new Set([editor]),
        provider.awareness
      );
      bindingRef.current = binding;
    } catch (err) {
      console.error('Setup failed:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (bindingRef.current) bindingRef.current.destroy();
      if (wsProviderRef.current) wsProviderRef.current.destroy();
    };
  }, []);

  return (
    <div className="editor-container">
      <div className="workspace">
        <div className="editor-pane">
          <Editor
            height="100%"
            defaultLanguage="markdown"
            defaultValue=""
            theme="vs-dark"
            onMount={handleEditorDidMount}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 16,
              lineNumbers: 'on',
              automaticLayout: true,
              trimAutoWhitespace: false, // 末尾の空行・空白を自動で削除しない
              renderFinalNewline: true, // 最終行の改行も表示
              renderWhitespace: 'all', // 空白も可視化
            }}
          />
        </div>
        <div className="preview-pane">
          <div
            className="marp-preview"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      </div>
    </div>
  );
};

export default EditorComponent;