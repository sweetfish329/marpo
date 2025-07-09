import { useState, useEffect } from 'react';

export const useServerInfo = () => {
    const [serverInfo, setServerInfo] = useState({
        wsUrl: null,
        httpUrl: null,
        loading: true,
        error: null
    });

    useEffect(() => {
        const fetchServerInfo = async () => {
            try {
                const response = await fetch('/api/server-info');
                if (!response.ok) {
                    throw new Error('Failed to fetch server info');
                }
                const data = await response.json();
                setServerInfo({
                    wsUrl: data.wsUrl,
                    httpUrl: data.httpUrl,
                    loading: false,
                    error: null
                });
            } catch (err) {
                setServerInfo(prev => ({
                    ...prev,
                    loading: false,
                    error: err.message
                }));
            }
        };

        fetchServerInfo();
    }, []);

    return serverInfo;
};