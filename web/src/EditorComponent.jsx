import React, { useEffect, useRef, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { Marp } from '@marp-team/marp-core';
import debounce from 'lodash.debounce';
import './EditorComponent.css';
import { useServerInfo } from './hooks/useServerInfo';


const EditorComponent = ({ roomName }) => {
  const editorRef = useRef(null);
  const [preview, setPreview] = useState('');
  const marpRef = useRef(new Marp());
  const wsProviderRef = useRef(null);
  const bindingRef = useRef(null);
  const otherCursors = useRef([]);
  const { instanceId, loading: infoLoading, error: infoError } = useServerInfo();
  const [wsError, setWsError] = useState(null);
  const [isEditorReady, setEditorReady] = useState(false);

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
      // valueがundefinedの場合も考慮し、空文字列として扱う
      const content = value || '';
      try {
        const { html, css } = marpRef.current.render(content);
        // CSSを<style>タグで囲み、HTMLと結合してプレビューにセット
        setPreview(`<style>${css}</style>${html}`);
        debouncedSave(content);
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
    setEditorReady(true);

    const themes = import.meta.glob('/marp-theme/*.css', { as: 'raw' });
    for (const path in themes) {
      try {
        const css = await themes[path]();
        marpRef.current.themeSet.add(css);
      } catch (e) {
        console.error(`Failed to load theme ${path}:`, e);
      }
    }
  };

  useEffect(() => {
    if (!isEditorReady || infoLoading || !instanceId) {
      return;
    }

    if (infoError) {
      setWsError(`Failed to get server info: ${infoError}`);
      return;
    }

    const editor = editorRef.current;
    if (!editor) return;

    const ydoc = new Y.Doc();
    const wsUrl = new URL(window.location.origin);
    const provider = new WebsocketProvider(
      `${wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${wsUrl.host}/ws`,
      roomName,
      ydoc,
      { params: { instanceId } }
    );
    wsProviderRef.current = provider;

    provider.on('connection-error', (err) => {
      console.error('WebSocket connection error:', err);
      setWsError('Connection failed. You may not have permission to edit. Please refresh the page.');
      provider.disconnect();
    });

    const awareness = provider.awareness;

    provider.on('status', ({ status }) => {
      console.log('WebSocket status:', status);
      if (status === 'connected') {
        setWsError(null);
        awareness.setLocalStateField('color', getColorForClient(awareness.clientID));
        
        provider.once('synced', async () => {
          try {
            const response = await fetch(`/api/files/${roomName}`);
            if (response.ok) {
              const content = await response.text();
              const ytext = ydoc.getText('monaco');
              if (ytext.toString() === '') {
                ytext.insert(0, content);
              }
              handleEditorChange(ytext.toString());
            }
          } catch (err) {
            console.error('Failed to load initial content:', err);
          }
        });
      } else if (status === 'disconnected') {
        if (!wsError) {
          setWsError('Disconnected. Editing is disabled.');
        }
      }
    });

    const ytext = ydoc.getText('monaco');
    const binding = new MonacoBinding(ytext, editor.getModel(), new Set([editor]), awareness);
    bindingRef.current = binding;

    return () => {
      if (bindingRef.current) bindingRef.current.destroy();
      if (wsProviderRef.current) wsProviderRef.current.destroy();
    };
  }, [isEditorReady, instanceId, infoLoading, infoError, roomName, handleEditorChange]);

  const isLoading = infoLoading || !isEditorReady;
  const hasError = !!infoError || !!wsError;

  return (
    <div className="editor-container">
      {(isLoading || hasError) && (
        <div className="editor-overlay">
          <div className="overlay-content">
            {isLoading && <p>Connecting to server...</p>}
            {hasError && <p className="error-message">{infoError || wsError}</p>}
          </div>
        </div>
      )}
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
              readOnly: hasError,
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 16,
              lineNumbers: 'on',
              automaticLayout: true,
              trimAutoWhitespace: false,
              renderFinalNewline: true,
              renderWhitespace: 'all',
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