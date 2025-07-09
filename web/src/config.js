export const getConfig = async () => {
    try {
        const response = await fetch('/config.js');
        const configText = await response.text();
        // 動的に読み込んだJavaScriptを評価
        const configModule = new Function(`
            ${configText}
            return config;
        `)();
        return configModule;
    } catch (err) {
        console.error('Failed to load config:', err);
        // フォールバック設定
        return {
            wsUrl: 'ws://localhost:8080/ws',
            httpUrl: 'http://localhost:8080/api'
        };
    }
};