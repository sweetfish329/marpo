import React, { useState, useEffect } from 'react';
import EditorComponent from './EditorComponent';
import './App.css';

function App() {
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/files');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setFiles(data || []); // 空配列をデフォルト値として設定
      if (data && data.length > 0 && !currentFile) {
        setCurrentFile(data[0].name);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
      setError('ファイル一覧の取得に失敗しました');
    }
  };

  const handleNewFile = async () => {
    const fileName = prompt('ファイル名を入力してください（.mdは自動で付加されます）:');
    if (!fileName) return;

    try {
      const response = await fetch('http://localhost:8080/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${fileName}.md` })
      });

      if (response.ok) {
        fetchFiles();
      }
    } catch (err) {
      console.error('Failed to create file:', err);
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
            {files && files.map(file => (
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