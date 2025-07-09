import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { Marp } from '@marp-team/marp-core';
import './EditorComponent.css';

const EditorComponent = ({ roomName }) => {
  const editorRef = useRef(null);
  const [preview, setPreview] = useState('');
  const marpRef = useRef(new Marp());
  const wsProviderRef = useRef(null);
  const bindingRef = useRef(null);

  const handleEditorChange = (value) => {
    if (!value) return;
    try {
      const { html } = marpRef.current.render(value);
      setPreview(html);
    } catch (err) {
      console.error('Preview rendering failed:', err);
    }
  };

  const handleEditorDidMount = async (editor) => {
    editorRef.current = editor;

    try {
      const ydoc = new Y.Doc();
      const provider = new WebsocketProvider(
        'ws://localhost:8080/ws',
        roomName,
        ydoc
      );
      wsProviderRef.current = provider;

      const ytext = ydoc.getText('monaco');
      const binding = new MonacoBinding(
        ytext,
        editor.getModel(),
        new Set([editor]),
        provider.awareness
      );
      bindingRef.current = binding;

      // 初期コンテンツの設定
      const response = await fetch(`/api/files/${roomName}`);
      if (response.ok) {
        const content = await response.text();
        ytext.delete(0, ytext.length);
        ytext.insert(0, content);
        handleEditorChange(content);
      }
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
              automaticLayout: true
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