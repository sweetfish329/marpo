import React, { useState, useEffect } from 'react';
import EditorComponent from './EditorComponent';
import './App.css';

function App() {
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [error, setError] = useState(null);

  // ファイル一覧の取得
  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      setFiles(data || []);
      if (data && data.length > 0 && !currentFile) {
        setCurrentFile(data[0].name);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
      setError('ファイル一覧の取得に失敗しました');
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleNewFile = async () => {
    const fileName = prompt('ファイル名を入力してください（.mdは自動で付加されます）:');
    if (!fileName) return;

    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${fileName}.md` })
      });

      if (response.ok) {
        await fetchFiles();
        setCurrentFile(`${fileName}.md`);
      }
    } catch (err) {
      console.error('Failed to create file:', err);
      setError('ファイルの作成に失敗しました');
    }
  };

  return (
    <div className="app">
      <div className="app-header">
        <h1>Marpo</h1>
        <div className="file-controls">
          <button onClick={handleNewFile} className="new-file-btn">
            新規作成
          </button>
          <select 
            value={currentFile || ''}
            onChange={(e) => setCurrentFile(e.target.value)}
            className="file-select"
          >
            <option value="">ファイルを選択...</option>
            {files.map(file => (
              <option key={file.name} value={file.name}>
                {file.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      <main className="app-content">
        {currentFile && (
          <EditorComponent 
            key={currentFile}
            roomName={currentFile}
          />
        )}
      </main>
    </div>
  );
}

export default App;