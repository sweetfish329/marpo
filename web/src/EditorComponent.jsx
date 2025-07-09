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