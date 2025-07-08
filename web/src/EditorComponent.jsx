import React, { useEffect, useRef, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { Marp } from '@marp-team/marp-core';
import './EditorComponent.css';

const EditorComponent = ({ roomName }) => {
  const editorRef = useRef(null);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState('');
  const marpRef = useRef(null);

  // Marpインスタンスの初期化
  useEffect(() => {
    marpRef.current = new Marp({
      markdown: {
        breaks: true,
      },
      html: true,
      math: true
    });
  }, []);

  // ファイルの内容を読み込む関数
  const loadFileContent = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:8080/api/files/${roomName}`);
      if (!response.ok) {
        return `---
marp: true
theme: default
---

# ${roomName.replace('.md', '')}
`;
      }
      const content = await response.text();
      return content;
    } catch (err) {
      console.error('Failed to load file:', err);
      return '';
    }
  }, [roomName]);

  // ファイル内容の読み込みと初期レンダリング
  useEffect(() => {
    loadFileContent().then(initialContent => {
      setContent(initialContent);
      if (marpRef.current) {
        try {
          const { html } = marpRef.current.render(initialContent);
          setPreview(html);
        } catch (err) {
          console.error('Initial rendering failed:', err);
        }
      }
    });
  }, [loadFileContent]);

  // エディタの変更ハンドラーを追加
  const handleEditorChange = useCallback((value) => {
    if (!value || !marpRef.current) return;
    
    try {
      const { html } = marpRef.current.render(value);
      setContent(value);
      setPreview(html);
    } catch (err) {
      console.error('Preview rendering failed:', err);
    }
  }, []);

  // WebSocket接続とエディタのセットアップ
  useEffect(() => {
    let yDoc = null;
    let provider = null;
    let binding = null;

    const setupEditor = async () => {
      if (!editorRef.current) return;

      try {
        const initialContent = await loadFileContent();
        yDoc = new Y.Doc();
        provider = new WebsocketProvider(
          'ws://localhost:8080/ws',
          roomName,
          yDoc
        );

        const ytext = yDoc.getText('monaco');
        if (ytext.toString() === '') {
          ytext.insert(0, initialContent);
        }

        binding = new MonacoBinding(
          ytext,
          editorRef.current.getModel(),
          new Set([editorRef.current]),
          provider.awareness
        );

        // テキスト変更の監視を改善
        ytext.observe(() => {
          const newContent = ytext.toString();
          handleEditorChange(newContent); // 変更ハンドラーを使用
        });

        // 初期コンテンツを設定
        handleEditorChange(ytext.toString());
      } catch (err) {
        console.error('Setup failed:', err);
      }
    };

    setupEditor();

    return () => {
      if (binding) binding.destroy();
      if (provider) provider.destroy();
      if (yDoc) yDoc.destroy();
    };
  }, [roomName, loadFileContent, handleEditorChange]);

  const handleEditorDidMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  return (
    <div className="editor-container">
      <div className="editor-pane">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          value={content}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          onChange={handleEditorChange} // 変更ハンドラーを追加
          options={{
            minimap: { enabled: false },
            wordWrap: 'on',
            fontSize: 16,
            lineNumbers: 'on',
            automaticLayout: true
          }}
        />
      </div>
      <div className="preview-pane">
        {preview && (
          <div
            className="marp-preview"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
      </div>
    </div>
  );
};

export default EditorComponent;